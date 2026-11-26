/** Local reports of stored results. Never recalculate, write history or parse patient text as HTML. */
const SupplementaryPDF=typeof module!=='undefined'&&module.exports?require('./supplementary-growth.js').SupplementaryGrowth:SupplementaryGrowth;
const CentilePDF=typeof module!=='undefined'&&module.exports?require('./percentile-display.js').PercentileDisplay:globalThis.PercentileDisplay;
const NutritionPDF=typeof module!=='undefined'&&module.exports?require('./nutrition-assessment.js').NutritionAssessment:globalThis.NutritionAssessment;
class PDFManager {
    static fontPaths = ['vendor/pdf/Amiri-Regular.ttf', 'vendor/pdf/Amiri-Bold.ttf'];
    static async loadFonts(fetcher = fetch, pins = JSON.parse(document.querySelector('meta[name="zscore-data-integrity"]')?.content || '{}')) {
        const responses = await Promise.all(this.fontPaths.map(path => fetcher(path)));
        const bytes = await Promise.all(responses.map(async (response, i) => {
            if (!response.ok) throw new Error('pdfUnavailable');
            const value = await response.arrayBuffer(), expected = pins[this.fontPaths[i]];
            if (!/^[a-f0-9]{64}$/.test(expected || '') || value.byteLength > 1_000_000 || await ReleaseGuard.digest(value) !== expected) throw new Error('pdfUnavailable');
            return value;
        }));
        return bytes.map(buffer => {
            let text = ''; const data = new Uint8Array(buffer);
            for (let i = 0; i < data.length; i += 8192) text += String.fromCharCode(...data.subarray(i, i + 8192));
            return btoa(text);
        });
    }
    static clean(value) {
        const text = String(value ?? '');
        if (text.length > 6000) throw new Error('pdfInvalid');
        return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\r\n?/g, '\n');
    }
    static model(entries, { language = 'fr', translations, stale = false, dateFormat='auto', timeZone='system' } = {}) {
        if (!Array.isArray(entries) || !entries.length || entries.length > 5000 || !['fr', 'en', 'ar'].includes(language) || !translations?.[language]) throw new Error('pdfInvalid');
        const t = key => {const own=table=>table&&Object.hasOwn(table,key)&&typeof table[key]==='string'?table[key]:'';return this.clean(own(translations[language])||own(translations.fr)||key);};
        const number = (value, digits) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : t('unknown');
        const indicators = ['weightForAge','heightForAge','weightForHeight','bmiForAge'].filter(key=>entries.some(e=>(e.result?.applicableIndicators||['weightForAge','heightForAge','weightForHeight','bmiForAge']).includes(key)));
        const provenances=[];
        const rows = entries.map((entry, i) => {
            if (!entry?.child || typeof entry.child !== 'object') throw new Error('pdfInvalid');
            const {child: c, result: r} = entry;
            if(r&&r.schemaVersion!==4)throw new Error('importVersion');
            const field = (label, value) => t(label) + ' : ' + this.clean(value === undefined || value === '' ? t('unknown') : value);
            const identity = [field('name', c.name), field('caseId', c.caseId), field('measurementDate', c.measurementDate)];
            const age = [field('ageDays', number(c.ageDays, 0)), field('ageMode', t(c.ageMode || 'unknown'))];
            if (c.ageMode === 'months') age.push(field('ageYears', c.ageYears), field('ageMonths', c.ageMonths), t('approximateAge'));
            if(c.ageMode==='totalMonths')age.push(field('ageTotalMonths',c.totalAgeMonths),t('approximateAge'));
            if (c.ageMode === 'dates') age.push(field('birthDate', c.birthDate));
            if(c.ageMode==='pma'&&!r?.intergrowthContext)age.push(field('postmenstrualDays',number(c.postmenstrualDays,0)));
            const measures = [...age, field('weight', number(c.weight, 0)), field('height', number(c.height, 1)),
                field('gender', t(c.gender === 'M' ? 'male' : c.gender === 'F' ? 'female' : 'unknown')),
                field('position', t(c.position === 'L' ? 'lying' : c.position === 'H' ? 'standing' : 'unknown')),
                field('oedema', t(c.oedema === 'y' ? 'yes' : c.oedema === 'n' ? 'no' : 'unknown'))];
            if (typeof r?.correctedHeight === 'number') measures.push(field('adjustedHeight', number(r.correctedHeight, 1) + ' ' + t('unitCm')));
            if (r?.schemaVersion===4 && typeof r.bmi==='number' && Number.isFinite(r.bmi)) measures.push(field('bmi',number(r.bmi,2)+' kg/m²'));
            const notes = [];
            for(const key of SupplementaryPDF.fields)if(SupplementaryPDF.present(c[key]))measures.push(field(key,number(c[key],1)));
            if(r?.additionalGrowth){notes.push(t('additionalResults')+' · '+r.additionalGrowth.referenceVersion);for(const [key,v] of Object.entries(r.additionalGrowth.indicators)){const centile=CentilePDF.text(v);const score=Number.isFinite(v.zscore)?'Z = '+number(v.zscore,2)+(centile===null?'':' | P '+centile)+' | '+t(v.classification||'intergrowthDescriptive'):t(v.error);notes.push(t(key)+' : '+number(v.measure,1)+' '+v.unit+' | '+score+(v.flagged?' | '+t('flagged'):''));}}
            if(c.muac!==undefined&&c.muac!=='')measures.push(field('muac',number(c.muac,1)+' mm'));
            if(r?.nutrition)notes.push(t(r.nutrition.category),...(r.nutrition.criteria||[]).map(t),t(r.nutrition.muac),t(r.nutrition.orientation),...r.nutrition.reasons.map(t),t('clinicalReference')+' : '+r.nutrition.reference+' v'+r.nutrition.version,...(r.nutrition.missing.length?[t('assessmentMissing')+' : '+r.nutrition.missing.map(t).join(', ')]:[]));
            if(NutritionPDF.isNational(r?.nutrition)){
                notes.push(t(NutritionPDF.helpKey(r.nutrition)));
                for(const key of NutritionPDF.inputFields.filter(k=>!['muac','careProtocol'].includes(k))) if(c[key]) measures.push(field(key,t(NutritionPDF.observationLabel(key,c[key],NutritionPDF.is2025(r.nutrition)?'2025':true))));
            }
            let provenance=null;
            if (!r) notes.push(t('pdfUncalculated'));
            else {
                if (r.schemaVersion===4) notes.push(t(r.referenceFamily==='INTERGROWTH2015'?'intergrowthDescriptive':r.referenceFamily==='CDC2000'?'cdcCoverage':'bmiReportHelp'));
                if(r.intergrowthContext){
                    const a=r.intergrowthContext.age;measures.push(field('growthProfile',t('profileINTERGROWTH')),field('postmenstrualDays',number(a.postmenstrualDays,0)),field('birthGestationDays',number(a.birthGestationDays,0)));
                    notes.push(t('intergrowthNoScreening'),field('postmenstrualDays',number(a.postmenstrualDays,0))+' | '+field('birthGestationDays',number(a.birthGestationDays,0)));
                    for(const [key,v] of Object.entries(r.intergrowthContext.scores))if(v.method)notes.push(t(key==='lengthForAge'?'heightForAge':key)+' | '+v.method);
                }else if(r.profileContext){
                    measures.push(field('growthProfile',t('profileUS')),field('reportedAgeMonths',number(r.profileContext.reportedAgeInMonths,3)),field('calculationAgeMonths',number(r.ageInMonths,3)),field('agePrecision',t(r.profileContext.agePrecision)));
                    notes.push(t('profileUS')+' | '+t('reportedAgeMonths')+' : '+number(r.profileContext.reportedAgeInMonths,3)+' | '+t('calculationAgeMonths')+' : '+number(r.ageInMonths,3)+' | '+t(r.profileContext.agePrecision));
                }
                if(r.referenceFamily==='CDC2000'){
                    notes.push(t('cdcInterpretation'));
                    for(const key of ['weightForAge','heightForAge','bmiForAge'])if(r[key]?.method)notes.push(t(key)+' | '+r[key].method+' | '+t('modifiedZscore')+' : '+number(r[key].modifiedZscore,3));
                    if(Number.isFinite(r.bmiForAge?.percentOfP95))notes.push(t('percentOfP95')+' : '+number(r.bmiForAge.percentOfP95,1)+' %');
                }
                if(r.schemaVersion===4&&r.referenceFamily==='WHO2007')notes.push(t('coverage2007'));
                if (r.imported) notes.push(t('importedResult'));
                notes.push(...(Array.isArray(r.warnings) ? r.warnings.map(t) : []));
                const value=[this.clean(r.referenceVersion || 'unknown'),this.clean(r.engineVersion || t('unknown'))];
                let p=provenances.findIndex(pair=>pair[0]===value[0]&&pair[1]===value[1]);
                if(p<0){p=provenances.length;provenances.push(value);}provenance='R'+(p+1);
            }
            const scores = indicators.map(key => {
                const v = r?.[key], valid = typeof v?.zscore === 'number' && Number.isFinite(v.zscore);
                const lines = [valid ? 'Z = ' + v.zscore.toFixed(2) : t('notCalculated')];
                if (valid) lines.push(t(v.classification || (r.referenceFamily==='INTERGROWTH2015'?'intergrowthDescriptive':'unknown')));
                if (v?.flagged) lines.push(t('flagged'));
                if (v?.error) lines.push(t(v.error));
                return lines.join('\n');
            });
            const percentiles=indicators.map(key=>{
                const v=r?.[key];
                if(r?.schemaVersion!==4||r.percentileVersion!==1||!Number.isFinite(v?.zscore))return '';
                return 'P '+(CentilePDF.text(v)??'--');
            });
            const compactMeasures=[...(r?.intergrowthContext?[field('postmenstrualDays',number(r.intergrowthContext.age.postmenstrualDays,0))]:[]),field('ageDays',number(c.ageDays,0)),field('weight',number(c.weight,0)),field('height',number(c.height,1)),
                t(c.gender==='M'?'male':c.gender==='F'?'female':'unknown')+' | '+t(c.position==='L'?'lying':c.position==='H'?'standing':'unknown'),
                t('pdfOedema')+' : '+t(c.oedema==='y'?'yes':c.oedema==='n'?'no':'unknown')];
            if(c.ageMode==='totalMonths')compactMeasures.push(field('ageTotalMonths',c.totalAgeMonths),t('approximateAge'));
            if(c.ageMode==='months')compactMeasures.push(field('ageYears',c.ageYears)+' | '+field('ageMonths',c.ageMonths),t('approximateAge'));
            if(c.ageMode==='dates')compactMeasures.push(field('birthDate',c.birthDate));
            if(typeof r?.correctedHeight==='number')compactMeasures.push(field('adjustedHeight',number(r.correctedHeight,1)+' '+t('unitCm')));
            if(r?.schemaVersion===4 && typeof r.bmi==='number' && Number.isFinite(r.bmi))compactMeasures.push(field('bmi',number(r.bmi,2)+' kg/m²'));
            const heightPair=number(c.height,1)+(typeof r?.correctedHeight==='number'?' / '+number(r.correctedHeight,1):'');
            const briefMeasures=[number(c.weight,0)+' g | '+heightPair+' cm',number(c.ageDays,0)+' '+t('pdfDaysUnit')+' ('+t(c.ageMode||'unknown')+') | '+this.clean(c.gender||t('unknown'))+' | '+this.clean(c.position||t('unknown')),t('pdfOedema')+' : '+t(c.oedema==='y'?'yes':c.oedema==='n'?'no':'unknown')];
            if(r?.intergrowthContext||c.ageMode==='pma')briefMeasures.unshift(field('postmenstrualDays',number(r?.intergrowthContext?.age.postmenstrualDays??c.postmenstrualDays,0)));
            if(c.ageMode==='totalMonths')briefMeasures.push(field('ageTotalMonths',c.totalAgeMonths),t('approximateAge'));
            if(c.ageMode==='months')briefMeasures.push(field('ageYears',c.ageYears)+' | '+field('ageMonths',c.ageMonths),t('approximateAge'));
            if(c.ageMode==='dates')briefMeasures.push(field('birthDate',c.birthDate));
            if(r?.schemaVersion===4 && typeof r.bmi==='number' && Number.isFinite(r.bmi))briefMeasures.push(field('bmi',number(r.bmi,2)+' kg/m²'));
            if(c.muac!==undefined&&c.muac!==''){const pb=field('muac',number(c.muac,1)+' mm');compactMeasures.push(pb);briefMeasures.push(pb);}
            if(!r)for(const key of SupplementaryPDF.fields)if(SupplementaryPDF.present(c[key]))briefMeasures.push(field(key,number(c[key],1)));
            const screening=!r?t('notCalculated'):r.nutrition?t(r.nutrition.category+'Short')===r.nutrition.category+'Short'?t(r.nutrition.category):t(r.nutrition.category+'Short'):r.referenceFamily==='INTERGROWTH2015'?t('pdfScreeningNA'):t('unknown');
            return {index:i+1,screening,identity,measures,compactMeasures,briefMeasures,briefIdentity:[this.clean(c.name||t('unknown')),this.clean(c.caseId||t('unknown'))],measurementDate:this.clean(c.measurementDate||t('unknown')),scores,percentiles,notes:[...new Set(notes.filter(Boolean))],provenance,calculatedAt:this.clean(r?.calculatedAt||t('unknown'))};
        });
        const hasPercentiles=rows.some(row=>row.percentiles.some(Boolean))||entries.some(entry=>Object.values(entry.result?.additionalGrowth?.indicators||{}).some(value=>CentilePDF.text(value)!==null));
        return {language, t, indicators, rows, stale, provenances,hasPercentiles,dateFormat,timeZone,keys:['pdfNumber','pdfIdentity','pdfMeasures',...indicators,'pdfNotes']};
    }
    // Detailed batch presentation only: never alter the stored result, individual or compact models.
    static detailedLabels(language) {
        return {
            fr:{observations:'Observations et vérifications',height:'Taille',length:'Longueur',birth:'Né(e) le',days:'jours',month:'mois',year:'an',years:'ans',head:'Périm. crânien',mm:'mm',cm:'cm',g:'g',stored:'Résultats enregistrés, sans recalcul. Scores à deux décimales.',exported:'Exporté le'},
            en:{observations:'Observations and checks',height:'Height',length:'Length',birth:'Date of birth',days:'days',month:'months',year:'year',years:'years',head:'Head circumference',mm:'mm',cm:'cm',g:'g',stored:'Stored results, no recalculation. Two-decimal scores.',exported:'Exported'},
            ar:{observations:'الملاحظات والتحقق',height:'القامة',length:'الطول مستلقيًا',birth:'تاريخ الميلاد',days:'يوم',month:'شهر',year:'سنة',years:'سنوات',head:'محيط الرأس',mm:'مم',cm:'سم',g:'غرام',stored:'نتائج محفوظة دون إعادة حساب. الدرجات بمنزلتين عشريتين.',exported:'تاريخ التصدير'}
        }[language];
    }
    // Presentation/filenames use the device's local clock, including its offset at
    // the instant of export. Stored clinical dates and interchange timestamps stay unchanged.
    static validTimeZone(value) {
        if(value==='system')return true;
        if(typeof value!=='string'||!value||value.length>100)return false;
        try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch(_){return false;}
    }
    static exportClock(now=new Date(),timeZone='system') {
        const pad=value=>String(value).padStart(2,'0');
        const options={calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'};
        if(timeZone!=='system'&&this.validTimeZone(timeZone))options.timeZone=timeZone;
        const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',options).formatToParts(now).map(p=>[p.type,p.value]));
        const date=parts.year+'-'+parts.month+'-'+parts.day,time=parts.hour+':'+parts.minute;
        const offset=Math.round((Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-(now.getTime()-now.getMilliseconds()))/60000);
        const sign=offset<0?'-':'+',absolute=Math.abs(offset),zone=sign+pad(Math.floor(absolute/60))+':'+pad(absolute%60);
        return {date,time,zone,seconds:parts.second,milliseconds:String(now.getMilliseconds()).padStart(3,'0')};
    }
    static exportTimestamp(now,language='fr',timeZone='system',dateFormat='auto') {
        const c=this.exportClock(now,timeZone);
        return this.detailedDate(c.date,language,dateFormat)+' '+c.time+' UTC'+c.zone;
    }
    static exportFileStamp(now=new Date(),timeZone='system') {
        const c=this.exportClock(now,timeZone);
        return c.date+'T'+c.time.replace(':','-')+'-'+c.seconds+'-'+c.milliseconds+c.zone.replace(':','-');
    }
    static detailedDate(value,language,dateFormat='auto') {
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value;
        const [y,m,d]=value.split('-'),format=dateFormat==='auto'?(language==='fr'?'dmy':'iso'):dateFormat;
        return format==='dmy'?d+'/'+m+'/'+y:format==='mdy'?m+'/'+d+'/'+y:value;
    }
    // Layout only: counts[k][i] is the actual wrapped line count for note i
    // at k columns. A note is indivisible; its original text never changes.
    static observationPlan(counts,bandOverhead=2.7/3.45) {
        const ids=counts[1].map((_,i)=>i);
        if(!ids.length)return {bands:[],height:0,kind:'empty'};
        const inversions=order=>{
            let n=0;for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++)if(order[i]>order[j])n++;
            return n;
        };
        const balance=(indices,k)=>{
            const w=counts[k],load=cols=>cols.map(c=>c.reduce((n,i)=>n+w[i],0));
            const evaluate=cols=>{
                // Order each column and order columns by first source item.
                const ordered=cols.map(c=>[...c].sort((a,b)=>a-b)).sort((a,b)=>(a[0]??Infinity)-(b[0]??Infinity));
                const heights=load(ordered),max=Math.max(...heights),spread=max-Math.min(...heights);
                return {cols:ordered,max,spread,inv:inversions(ordered.flat())};
            };
            const better=(a,b)=>!b||a.max<b.max||a.max===b.max&&(a.spread<b.spread||a.spread===b.spread&&a.inv<b.inv);
            if(k===1)return evaluate([indices]);
            let best;
            const consider=cols=>{const c=evaluate(cols);if(better(c,best))best=c;};
            // A contiguous layout is preferred if equally balanced. Search all
            // ordered boundaries for normal-sized records.
            if(indices.length<=100){
                for(let i=1;i<=indices.length-k+1;i++){
                    if(k===2)consider([indices.slice(0,i),indices.slice(i)]);
                    else for(let j=i+1;j<indices.length;j++)consider([indices.slice(0,i),indices.slice(i,j),indices.slice(j)]);
                }
            }
            const sorted=[...indices].sort((a,b)=>w[b]-w[a]||a-b);
            const greedy=Array.from({length:k},()=>[]),heights=Array(k).fill(0);
            for(const i of sorted){
                const j=heights.indexOf(Math.min(...heights));greedy[j].push(i);heights[j]+=w[i];
            }
            consider(greedy);
            // Bounded branch-and-bound improves the worst column without
            // exponential runtime for unusually large imported records.
            const total=indices.reduce((s,i)=>s+w[i],0),lower=Math.max(Math.ceil(total/k),...indices.map(i=>w[i]));
            if(best.max>lower&&indices.length<=64){
                const cols=Array.from({length:k},()=>[]),loads=Array(k).fill(0);
                let budget=6000;
                const search=pos=>{
                    if(--budget<0||best.max===lower)return;
                    if(pos===sorted.length){if(cols.every(c=>c.length))consider(cols);return;}
                    const i=sorted[pos],seen=new Set();
                    for(const j of loads.map((_,j)=>j).sort((a,b)=>loads[a]-loads[b]||a-b)){
                        if(seen.has(loads[j])||loads[j]+w[i]>=best.max)continue;
                        seen.add(loads[j]);loads[j]+=w[i];cols[j].push(i);
                        search(pos+1);cols[j].pop();loads[j]-=w[i];
                        if(budget<0||best.max===lower)return;
                    }
                };
                search(0);
            }
            return best;
        };
        let best;
        const consider=(bands,kind)=>{
            const height=bands.reduce((s,b)=>s+b.max,0)+(bands.length-1)*bandOverhead;
            const inv=inversions(bands.flatMap(b=>b.cols.flat()));
            const spread=bands.reduce((s,b)=>s+b.spread,0);
            const rank=kind==='3'?0:kind==='2'?1:kind==='1'?2:3;
            const candidate={bands,height,kind,inv,spread,rank};
            // Prefer the established three-column design at equal height.
            if(!best||height<best.height-1e-8||Math.abs(height-best.height)<1e-8&&
                (rank<best.rank||rank===best.rank&&(spread<best.spread||spread===best.spread&&inv<best.inv)))best=candidate;
        };
        const make=(indices,k)=>({columns:k,...balance(indices,k)});
        for(let k=1;k<=Math.min(3,ids.length);k++)consider([make(ids,k)],String(k));
        // A mixed band gives long, independent notes their full width, while
        // other notes share two or three columns. Evaluate the largest savings
        // individually and a few combinations; never split a note across columns.
        const long=ids.filter(i=>counts[3][i]>=3&&counts[3][i]-counts[1][i]>=2)
            .sort((a,b)=>(counts[3][b]-counts[1][b])-(counts[3][a]-counts[1][a])||a-b).slice(0,5);
        const subsets=long.map(i=>[i]);
        for(let i=0;i<Math.min(3,long.length);i++)for(let j=i+1;j<Math.min(3,long.length);j++)subsets.push([long[i],long[j]]);
        for(const selected of subsets){
            const full=selected.slice().sort((a,b)=>a-b),rest=ids.filter(i=>!full.includes(i));
            if(rest.length<2)continue;
            const wide=make(full,1);
            for(let k=2;k<=Math.min(3,rest.length);k++){
                const narrow=make(rest,k);
                consider([wide,narrow],'mixed');consider([narrow,wide],'mixed');
            }
        }
        return best;
    }
    static batchLegend(language,hasPercentiles) {
        const labels={
            fr:{stored:'Z = score enregistré, affiché à 2 décimales, sans recalcul.',percentiles:'P = centile du Z avant arrondi. OMS : −3 à +3 Z ; CDC/INTERGROWTH : indisponible si arrondi à 0 ou 100. Affichage : P < 0.1 ou P > 99.9. P -- : indisponible. Sans P : aucun centile enregistré.',notice:'Aide au dépistage, sans diagnostic ni prescription automatique. Ne remplace pas une évaluation clinique.'},
            en:{stored:'Z = stored score, displayed to 2 decimals, without recalculation.',percentiles:'P = centile of unrounded Z. WHO: −3 to +3 Z; CDC/INTERGROWTH: unavailable if rounded to 0 or 100. Display: P < 0.1 or P > 99.9. P --: unavailable. No P: no stored centile.',notice:'Screening aid, without automatic diagnosis or prescription. Does not replace clinical assessment.'},
            ar:{stored:'Z = درجة محفوظة تُعرض بمنزلتين عشريتين دون إعادة حساب.',percentiles:'P = مئين Z قبل التقريب. منظمة الصحة العالمية: من −3 إلى +3 Z؛ CDC وINTERGROWTH: غير متاح عند التقريب إلى 0 أو 100. العرض: P < 0.1 أو P > 99.9. P --: غير متاح. دون P: لا يوجد مئين محفوظ.',notice:'مساعدة في التحري دون تشخيص أو وصفة تلقائية. لا تغني عن التقييم السريري.'}
        }[language];
        return {header:labels.stored+(hasPercentiles?' '+labels.percentiles:''),notice:labels.notice};
    }
    static detailedRow(entry,row,model) {
        const {language,t}=model,{child:c,result:r}=entry,l=this.detailedLabels(language);
        const n=(v,d=0)=>Number.isFinite(v)?new Intl.NumberFormat(language,{minimumFractionDigits:d,maximumFractionDigits:d}).format(v):t('unknown');
        const flexible=v=>Number.isFinite(v)?new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(v):t('unknown');
        const u=(v,d,unit)=>Number.isFinite(v)?n(v,d)+' '+unit:t('unknown');
        const f=(label,value)=>label+': '+this.clean(value??t('unknown'));
        const short=key=>t(key).replace(/\s*\([^()]*\)\s*$/u,'');
        const pair=(...fields)=>fields.filter(Boolean).join(' · ');
        const heightLabel=c.position==='H'?l.height:c.position==='L'?l.length:t('pdfHeightShort');
        const weightHeight=pair(f(t('pdfWeightShort'),u(c.weight,0,l.g)),f(heightLabel,u(c.height,1,l.cm)));
        const measures=[weightHeight];
        if(c.position!=='H'&&c.position!=='L')measures.push(f(t('position'),t('unknown')));
        const ageDays=Number.isFinite(c.ageDays)?u(c.ageDays,0,l.days):'';
        const estimated=['months','totalMonths'].includes(c.ageMode)||c.agePrecision==='completedMonths';
        const ig=r?.intergrowthContext?.age;
        if(c.ageMode==='dates'){
            measures.push(f(l.birth,this.detailedDate(c.birthDate,language,model.dateFormat)||t('unknown')));
        }else if(c.ageMode==='pma'){
            measures.push(f(short('postmenstrualDays'),u(ig?.postmenstrualDays??c.postmenstrualDays,0,l.days)));
        }else if(c.ageMode==='months'){
            const parts=[];
            if(Number.isFinite(c.ageYears)&&c.ageYears>0)parts.push(n(c.ageYears)+' '+(c.ageYears===1?l.year:l.years));
            if(Number.isFinite(c.ageMonths)&&(c.ageMonths>0||!parts.length))parts.push(n(c.ageMonths)+' '+l.month);
            measures.push(f(t('referenceEstimated'),(parts.join(' ')||ageDays||t('unknown'))+(parts.length&&ageDays?' ('+ageDays+')':'')));
        }else if(c.ageMode==='totalMonths'){
            const months=c.totalAgeMonths??c.ageTotalMonths;
            measures.push(f(t('referenceEstimated'),Number.isFinite(months)?flexible(months)+' '+l.month+(ageDays?' ('+ageDays+')':''):(ageDays||t('unknown'))));
        }else measures.push(f(t(estimated?'referenceEstimated':'pdfAgeShort'),ageDays||t('unknown')));
        const ageLine=measures.at(-1);
        const sexOedema=pair(f(t('gender'),c.gender==='M'||c.gender==='F'?c.gender:t('unknown')),f(t('pdfOedema'),t(c.oedema==='y'?'yes':c.oedema==='n'?'no':'unknown')));
        measures.push(sexOedema);
        if(Number.isFinite(r?.correctedHeight)&&Math.abs(r.correctedHeight-c.height)>.01)measures.push(f(t('adjustedHeight'),u(r.correctedHeight,1,l.cm)));
        const pb=Number.isFinite(c.muac)?f(t('pdfMuacShort'),u(c.muac,1,l.mm)):'';
        const bmi=Number.isFinite(r?.bmi)?f(t('bmi'),u(r.bmi,2,'kg/m²')):'';
        if(pb)measures.push(pb);
        for(const key of SupplementaryPDF.fields)if(SupplementaryPDF.present(c[key])){
            measures.push(f(key==='headCircumference'?l.head:short(key),u(c[key],1,key==='headCircumference'?l.cm:l.mm)));
        }
        if(ig){
            if(c.ageMode!=='pma')measures.push(f(short('postmenstrualDays'),u(ig.postmenstrualDays,0,l.days)));
            if(Number.isFinite(ig.birthGestationDays))measures.push(f(short('birthGestationDays'),u(ig.birthGestationDays,0,l.days)));
        }
        // Keep clinical context and complementary results, not internal reference IDs/versions.
        const technicalPrefix=t('clinicalReference')+' : ';
        const additionalPrefix=t('additionalResults')+' · ';
        const igAgePrefix=t('postmenstrualDays')+' : ';
        const notes=row.notes.filter(note=>note!==t('pdfUncalculated')&&!note.startsWith(technicalPrefix)&&!(ig&&note.startsWith(igAgePrefix)&&note.includes(t('birthGestationDays')+' : ')))
            .map(note=>note.startsWith(additionalPrefix)?t('additionalResults'):note);
        if(r?.nutrition){
            const protocol=t(NutritionPDF.is2025(r.nutrition)?'screeningTitlePcima2025':NutritionPDF.isNational(r.nutrition)?'screeningTitlePcima':'screeningTitle');
            notes.unshift(protocol);
        }
        const national=r?.nutrition?NutritionPDF.is2025(r.nutrition)?'2025':NutritionPDF.isNational(r.nutrition):c.careProtocol==='niger2025'?'2025':c.careProtocol==='niger2023';
        const observations=[];
        for(const key of new Set(NutritionPDF.inputFields)){
            if(['muac','careProtocol'].includes(key)||c[key]===undefined||c[key]===null||c[key]==='')continue;
            observations.push(f(t(key),t(NutritionPDF.observationLabel(key,c[key],national))));
        }
        if(observations.length)notes.push(...observations);
        return {identity:[...row.briefIdentity,this.detailedDate(row.measurementDate,language,model.dateFormat)].join('\n'),
            measures:[...measures,...(bmi?[bmi]:[])].join('\n'),bmi,primaryMeasures:[ageLine,weightHeight,sexOedema],otherMeasures:measures.filter(v=>v!==ageLine&&v!==weightHeight&&v!==sexOedema),notes:[...new Set(notes.filter(Boolean))].join('\n')||'—'};
    }
    static compact(model,entries) {
        const {t,language,dateFormat}=model;
        const body=model.rows.map((row,index)=>{
            const entry=entries[index],{child,result}=entry,assessment=result?.nutrition;
            const detail=this.detailedRow(entry,row,model);
            const measured=child.measurementDate?this.detailedDate(child.measurementDate,language,dateFormat):t('unknown');
            const pb=detail.otherMeasures.find(line=>line.startsWith(t('pdfMuacShort')+':'));
            const measures=[...detail.primaryMeasures,pb||t('pdfMuacShort')+': '+t('unknown')];
            if(child.ageMode==='dates'&&Number.isFinite(child.ageDays))measures.push(t('pdfAgeShort')+': '+child.ageDays+' '+t('pdfDaysUnit'));
            if(Number.isFinite(result?.correctedHeight)&&Math.abs(result.correctedHeight-child.height)>.01){
                measures.push(detail.otherMeasures.find(line=>line.startsWith(t('adjustedHeight')+':')));
            }
            const scores=model.indicators.map((key,i)=>{
                const score=result?.[key];
                if(!result)return t('notCalculated');
                if(score?.error==='oedemaWarning')return t('pdfOedemaSuspended');
                if(score?.notApplicable||!result.applicableIndicators?.includes(key))return t(score?.error||'pdfScoreNotApplicable');
                if(!Number.isFinite(score?.zscore))return t(score?.error||'pdfScoreUnavailable');
                const classification=t(score.classification||(result.referenceFamily==='INTERGROWTH2015'?'intergrowthDescriptive':'unknown'));
                return ['Z '+score.zscore.toFixed(2)+(row.percentiles[i]?' | '+row.percentiles[i]:''),classification,score.flagged?t('flagged'):'',score.error?t(score.error):''].filter(Boolean).join('\n');
            });
            const context=[row.screening];
            if(assessment?.orientation)context.push(t(assessment.orientation));
            if(assessment?.missing?.length&&assessment.category!=='nutritionIncomplete')context.push(t('pdfClinicalMissing'));
            const references=result?[result.referenceVersion,assessment?.reference&&assessment.reference+' v'+assessment.version,t('engineVersion')+' '+result.engineVersion]:[];
            if(result?.imported)references.push(t('pdfImportedShort'));
            return [String(row.index),[...row.briefIdentity,measured].join('\n'),measures.filter(Boolean).join('\n'),...scores,context.join('\n'),references.filter(Boolean).join('\n')];
        });
        return {body};
    }
    static scoreWithPercentile(row,index) {
        const score=row.scores[index],p=row.percentiles[index];
        if(!p)return score;
        const newline=score.indexOf('\n');
        return newline<0?score+' | '+p:score.slice(0,newline)+' | '+p+score.slice(newline);
    }
    // AutoTable 5 marks split remainder rows with index -1 and keeps the original
    // raw row. Its record number remains unambiguous even when other cells are empty.
    static continuedRowIndex(data, rtl = false) {
        if(data?.section!=='body'||data.row?.index!==-1||!Array.isArray(data.row.raw))return null;
        const raw=data.row.raw,index=raw[rtl?raw.length-1:0];
        return typeof index==='string'&&/^[1-9]\d*$/.test(index)?index:null;
    }
    static reportSections = ['pdfSingleReport','pdfGrowthReport','chartTitle','pdfAdditionalGrowth','additionalZscoreTitle'];
    static reportCharts(visits, engines) {
        const chart=typeof module!=='undefined'&&module.exports?require('../components/growth-chart.js').GrowthChart:GrowthChart;
        const entries=visits.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.child.measurementDate))
            .sort((a,b)=>a.child.measurementDate.localeCompare(b.child.measurementDate));
        const sections=Object.fromEntries(this.reportSections.slice(1).map(key=>[key,[]]));
        const references=new Set(entries.flatMap(e=>[e.result?.referenceVersion,e.result?.additionalGrowth?.referenceVersion]).filter(Boolean));
        for(const reference of references){
            const supplementary=key=>Object.hasOwn(SupplementaryPDF.definitions,key);
            const engine=engines.find(candidate=>candidate.data.referenceVersion===reference);
            const relevant=entries.filter(e=>e.result?.referenceVersion===reference||e.result?.additionalGrowth?.referenceVersion===reference);
            const indexes=new Map(entries.map((entry,index)=>[entry,index]));
            const observations=panel=>panel.points.map(point=>({...point,index:indexes.get(relevant[point.index])}));
            const group=(point,key)=>{
                const {child,result}=entries[point.index];
                const positionSensitive=['heightForAge','weightForHeight','bmiForAge'].includes(key);
                return JSON.stringify([child.gender,result?.engineVersion,chart.indicator(result,key)?.method,
                    positionSensitive&&reference.startsWith('WHO-2006-')?child.ageDays<731:null,positionSensitive?child.position:null]);
            };
            const dateCounts=new Map();
            for(const {child} of entries)dateCounts.set(child.measurementDate,(dateCounts.get(child.measurementDate)||0)+1);
            const series=(points,key)=>points.slice(1).map((point,i)=>[points[i],point]).filter(([a,b])=>
                b.index===a.index+1&&b.date>a.date&&b.day>a.day&&dateCounts.get(a.date)===1&&dateCounts.get(b.date)===1&&group(a,key)===group(b,key));
            if(engine){
                const model=chart.referenceModel(relevant,engine);
                for(const panel of model?.panels||[]){
                    if(!panel.points.length)continue;
                    const points=observations(panel).sort((a,b)=>a.index-b.index);
                    sections[supplementary(panel.key)?'pdfAdditionalGrowth':'pdfGrowthReport'].push({...panel,reference,points,lines:series(points,panel.key),growth:true});
                }
            }
            const model=chart.build(entries,reference);
            for(const panel of model.panels){
                const byDate=new Map(panel.points.map(point=>[point.date,point.day]));
                const points=entries.flatMap((entry,index)=>{
                    const indicator=chart.indicator(entry.result,panel.key),date=entry.child.measurementDate;
                    if(!byDate.has(date)||entry.result?.schemaVersion!==4||chart.reference(entry.result,panel.key)!==reference||
                        indicator?.reference!==reference||!Number.isFinite(indicator.zscore)||Math.abs(indicator.zscore)>6||indicator.flagged||indicator.error)return [];
                    return [{index,day:byDate.get(date),date,value:indicator.zscore,imported:!!entry.result.imported}];
                });
                const groups=new Map();
                const distinct=points.some(point=>{
                    const key=group(point,panel.key),firstDate=groups.get(key);
                    if(!firstDate)groups.set(key,point.date);
                    return firstDate&&point.date>firstDate;
                });
                if(!distinct)continue;
                const lines=series(points,panel.key);
                const bounds=points.reduce(({min,max},p)=>({min:Math.min(min,p.value),max:Math.max(max,p.value)}),{min:-3,max:3});
                sections[supplementary(panel.key)?'additionalZscoreTitle':'chartTitle'].push({key:panel.key,reference,points,lines,...bounds,xMin:points[0].day,xMax:points.at(-1).day});
            }
        }
        return {entries,sections};
    }
    static individual(doc, autoTable, model, entry, options, safe, now) {
        const {t,language,rows:[row],indicators}=model,{child,result}=entry;
        const rtl=language==='ar',margin=12,right=198,width=186,bottom=277;
        const font=options.individualFont||'Amiri';
        const labels={fr:{year:'an',years:'ans',month:'mois',vigilance:'Évaluation clinique et vigilance',engine:'Moteur Z-score',calc:'Calcul',notice:'Repères de croissance selon la référence utilisée. Ne remplacent pas une évaluation clinique. Aucun diagnostic ni prescription automatique.'},en:{year:'year',years:'years',month:'months',vigilance:'Clinical assessment and cautions',engine:'Z-score engine',calc:'Calculated',notice:'Growth indicators use the stated reference. They do not replace clinical assessment. No automatic diagnosis or prescription.'},ar:{year:'سنة',years:'سنوات',month:'شهر',vigilance:'التقييم السريري والتنبيهات',engine:'محرك Z',calc:'الحساب',notice:'مؤشرات النمو حسب المرجع المستخدم. لا تحل محل التقييم السريري. لا تشخيص أو وصفة تلقائية.'}}[language];
        const date=value=>this.detailedDate(value,language,model.dateFormat);
        const timestamp=value=>value&&Number.isFinite(Date.parse(value))?this.exportTimestamp(new Date(value),language,model.timeZone,model.dateFormat):value;
        const centile=value=>language==='fr'?String(value??'—').replace(/(\d)\.(\d)/g,'$1,$2'):String(value??'—');
        const number=(value,digits=0)=>Number.isFinite(value)?new Intl.NumberFormat(language,{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value):'—';
        const field=(key,value)=>t(key)+': '+(value||t('unknown'));
        const unit=(value,digits,label)=>Number.isFinite(value)?number(value,digits)+' '+label:'—';
        const place=(value,x,y,{size=10,bold=false,align=rtl?'right':'left',fieldLabel=false}={})=>{
            doc.setFont(font,bold?'bold':'normal').setFontSize(size).setTextColor(24);
            const text=safe(value);
            doc.text(rtl&&fieldLabel?'\u200F'+text+'\u200F':text,x,y,{align});
        };
        let y=23,title,sectionReference='';
        const pages=new Map(),pageReferences=new Map(),at=()=>doc.internal.getCurrentPageInfo().pageNumber;
        const header=()=>{pages.set(at(),title);if(sectionReference)pageReferences.set(at(),sectionReference);};
        const ensure=space=>{if(y+space>bottom){doc.addPage();header();y=sectionReference?26:23;}};
        const line=(value,{size=10,bold=false,indent=0}={})=>{
            doc.setFont(font,bold?'bold':'normal').setFontSize(size);
            const lines=doc.splitTextToSize(safe(value),width-indent*2);
            const step=size*.425;
            for(const item of lines){
                ensure(step);
                // Preserve the directional marks added by safe() around dates.
                doc.setFont(font,bold?'bold':'normal').setFontSize(size).setTextColor(24);
                doc.text(item,rtl?right-indent:margin+indent,y,{align:rtl?'right':'left'});
                y+=step;
            }
        };
        const heading=(label,ordinal='',aside='')=>{
            ensure(16); y+=2.8;
            const lead=rtl?right:margin;
            if(ordinal){place(ordinal,lead,y,{size:9,bold:true});}
            const titleX=lead+(rtl?-8:8)*(ordinal?1:0);
            place(label,titleX,y,{size:11,bold:true});
            if(aside){
                doc.setFont(font,'bold').setFontSize(11);
                const titleWidth=doc.getTextWidth(safe(label))+(ordinal?8:0);
                doc.setFont(font,'normal').setFontSize(8);
                if(titleWidth+doc.getTextWidth(safe(aside))+4<=width)place(aside,rtl?margin:right,y,{size:8,align:rtl?'left':'right'});
                else {y+=4;place(aside,rtl?right:margin,y,{size:8});}
            }
            doc.setDrawColor(155).setLineWidth(.2).line(margin,y+1.5,right,y+1.5);
            y+=6.5;
        };
        // Fixed columns with individually bold values; long names and provenance wrap instead of clipping.
        const fields=(pairs,weights=pairs.map(()=>1),size=10)=>{
            const gap=3,total=weights.reduce((a,b)=>a+b,0),usable=width-gap*(pairs.length-1),step=size*.43;
            let offset=0;
            const cells=pairs.map(([label,value],i)=>{
                const w=usable*weights[i]/total,x=rtl?right-offset:margin+offset;offset+=w+gap;
                const prefix=safe(label+':'),v=safe(value||t('unknown'));
                doc.setFont(font,'normal').setFontSize(size);
                // Base Helvetica can underestimate the width of the French ligature.
                const measuredPrefix=font==='helvetica'?prefix.replace(/Œ/g,'OE').replace(/œ/g,'oe'):prefix;
                const labelWidth=doc.getTextWidth(measuredPrefix)+1.5;
                doc.setFont(font,'bold').setFontSize(size);const valueWidth=doc.getTextWidth(v);
                const inline=labelWidth+valueWidth<=w&&!v.includes('\n');
                const values=inline?[v]:doc.splitTextToSize(v,w);
                doc.setFont(font,'normal');const prefixes=inline?[prefix]:doc.splitTextToSize(prefix,w);
                return {x,prefixes,values,labelWidth,inline,lines:inline?1:prefixes.length+values.length};
            });
            const height=Math.max(...cells.map(c=>c.lines))*step+1;
            ensure(height);
            for(const c of cells){
                const align=rtl?'right':'left';
                c.prefixes.forEach((v,i)=>place(v,c.x,y+i*step,{size,align,fieldLabel:true}));
                const valueX=c.inline?c.x+(rtl?-c.labelWidth:c.labelWidth):c.x;
                c.values.forEach((v,i)=>place(v,valueX,y+(c.inline?0:c.prefixes.length+i)*step,{size,bold:true,align}));
            }
            y+=height;
        };
        const note=(value,kind='info',shaded=false,compact=false)=>{
            const size=9.1,step=3.85,iconSpace=7;
            doc.setFont(font,'normal').setFontSize(size);
            const lines=doc.splitTextToSize(safe(value),width-iconSpace-4);
            const height=Math.max(5.5,lines.length*step+(compact?.95:2.5));
            ensure(height);
            const top=y-3,ix=rtl?right-3.2:margin+3.2;
            if(shaded)doc.setFillColor(247).rect(margin,top,width,height,'F');
            doc.setFillColor(239).roundedRect(ix-2.5,top+.35,5,5,.65,.65,'F');
            doc.setDrawColor(55).setLineWidth(.28).setLineDashPattern([],0);
            const cy=top+2.8;
            if(kind==='warning'){
                doc.triangle(ix,cy-1.8,ix-1.9,cy+1.6,ix+1.9,cy+1.6,'S');
                doc.line(ix,cy-.55,ix,cy+.4);doc.setFillColor(55).circle(ix,cy+1,.13,'F');
            }else if(kind==='bulb'){
                doc.circle(ix,cy-.4,1.25,'S');doc.line(ix-.55,cy+.8,ix+.55,cy+.8);doc.line(ix-.4,cy+1.45,ix+.4,cy+1.45);
            }else{
                doc.circle(ix,cy,1.6,'S');doc.line(ix,cy-.05,ix,cy+.9);doc.setFillColor(55).circle(ix,cy-.75,.13,'F');
            }
            lines.forEach((v,i)=>place(v,rtl?right-iconSpace:margin+iconSpace,y+i*step,{size}));
            y+=height;
        };
        const table=(head,body,highlightLast=false)=>{
            if(!body.length)return;
            ensure(18);
            autoTable(doc,{startY:y-2,theme:'plain',head:[rtl?[...head].reverse():head],
                body:rtl?body.map(r=>[...r].reverse()):body,
                margin:{top:22,bottom:297-bottom,left:margin,right:margin},rowPageBreak:'avoid',
                styles:{font,fontSize:9.7,cellPadding:{top:highlightLast?1.05:.75,right:1.25,bottom:highlightLast?1.05:.75,left:1.25},overflow:'linebreak',textColor:24,halign:rtl?'right':'left',lineWidth:{bottom:.16},lineColor:175},
                headStyles:{fontStyle:'bold',textColor:18,fillColor:false},
                columnStyles:highlightLast?Object.fromEntries(head.map((_,i)=>[rtl?head.length-1-i:i,i===0?{cellWidth:25}:i===1?{cellWidth:15,halign:'center'}:{halign:'center'}])):
                    Object.fromEntries((head.length===4?[70,20,18,78]:[55,28,18,15,70]).map((cellWidth,i)=>[rtl?head.length-1-i:i,{cellWidth,...(i>0&&i<head.length-1?{halign:'center'}:{})}])),
                willDrawPage:()=>{if(!pages.has(at()))header();},
                didParseCell:({cell,row:r,section,column})=>{
                    cell.text=cell.text.map(safe);
                    const index=rtl?head.length-1-column.index:column.index;
                    if(section==='head'&&index>0&&(highlightLast||index<head.length-1))cell.styles.halign='center';
                    if(section==='body'&&(highlightLast?r.index===body.length-1:cell.raw==='—'||/^(?:[<>]\s*)?[−-]?\d[\d\s.,]*(?:\s(?:cm|mm|kg|g|kg\/m²))?$/.test(String(cell.raw))))cell.styles.fontStyle='bold';
                }});
            y=doc.lastAutoTable.finalY+5;
        };
        const selected=new Set(options.sections??[this.reportSections[0]]);
        const chartData=options.charts??{entries:[],sections:{}};
        const active=this.reportSections.filter(key=>selected.has(key)&&(key===this.reportSections[0]||chartData.sections[key]?.length));
        if(!active.length)throw new Error('pdfInvalid');
        title=active[0];header();
        const estimated=['months','totalMonths'].includes(child.ageMode)||child.agePrecision==='completedMonths';
        const ageDays=unit(child.ageDays,0,t('pdfDaysUnit'));
        const years=Number(child.ageYears),months=Number(child.ageMonths),totalMonths=Number(child.totalAgeMonths??child.ageTotalMonths);
        const ageText=child.ageMode==='months'&&child.ageYears!==undefined&&child.ageMonths!==undefined&&Number.isFinite(years)&&Number.isFinite(months)?
            [years?number(years)+' '+(years===1?labels.year:labels.years):'',months||!years?number(months)+' '+labels.month:''].filter(Boolean).join(' ')+' ('+ageDays+')':
            child.ageMode==='totalMonths'&&Number.isFinite(totalMonths)?new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(totalMonths)+' '+labels.month+' ('+ageDays+')':ageDays;
        const identity=()=>{
            fields([[t('pdfNameShort'),child.name?.trim()],[t('pdfCaseShort'),child.caseId?.trim()]],[1,1]);
            fields([[t(estimated?'referenceEstimated':'pdfAgeShort'),ageText],[t('gender'),t(child.gender==='M'?'male':child.gender==='F'?'female':'unknown')],[t('measurementDate'),date(child.measurementDate)]],[1.35,.8,1]);
        };
        if(selected.has(this.reportSections[0])){
            identity();
            if(model.stale)line(t('stale'),{bold:true});
            if(result?.imported)line(t('importedResult'),{bold:true});
            const assessment=result?.nutrition;
            if(assessment){
                const label=t(NutritionPDF.is2025(assessment)?'screeningTitlePcima2025':NutritionPDF.isNational(assessment)?'screeningTitlePcima':'screeningTitle');
                const status=t(assessment.category);
                const details=[...new Set([...(assessment.criteria||[]),...(assessment.reasons||[])])].map(t);
                const orientation=field('pdfOrientation',t(assessment.orientation));
                doc.setFont(font,'bold').setFontSize(11);
                const statusLines=doc.splitTextToSize(safe(status),width-10).length;
                doc.setFont(font,'normal').setFontSize(10);
                const content=[...details,orientation];
                const contentLines=content.reduce((count,value)=>count+doc.splitTextToSize(safe(value),width-10).length,0);
                const boxHeight=8+4.675*statusLines+4.25*contentLines;
                ensure(boxHeight+6);
                const top=y+1;
                doc.setDrawColor(35).setLineWidth(.28).roundedRect(margin,top,width,boxHeight,2,2);
                doc.setFont(font,'bold').setFontSize(10);
                const labelWidth=doc.getTextWidth(safe(label))+4;
                doc.setFillColor(255).rect(rtl?right-5-labelWidth:margin+5,top-1,labelWidth,2,'F');
                place(label,rtl?right-7:margin+7,top+1,{bold:true});
                y=top+6;line(status,{bold:true,size:11,indent:5});
                content.forEach(value=>line(value,{indent:5}));
                y=top+boxHeight+4.5;
            }
            heading(t('pdfMeasures'),'01');
            fields([[t('pdfWeightShort'),unit(child.weight,0,'g')],[t('pdfHeightShort'),unit(child.height,1,'cm')],
                ...(assessment||Number.isFinite(child.muac)?[[t('pdfMuacShort'),Number.isFinite(child.muac)?unit(child.muac,1,'mm'):t('unknown')]]:[]),
                ...(Number.isFinite(result?.bmi)?[[t('bmi'),unit(result.bmi,2,'kg/m²')]]:[])]);
            fields([[t('position'),t(child.position==='L'?'lying':child.position==='H'?'standing':'unknown')],
                [t('pdfOedemaShort'),t(child.oedema==='y'?'yes':child.oedema==='n'?'no':'unknown')],
                ...(Number.isFinite(result?.correctedHeight)&&Math.abs(result.correctedHeight-child.height)>.01?[[t('adjustedHeight'),unit(result.correctedHeight,1,'cm')]]:[])],undefined,9.5);
            const age=result?.intergrowthContext?.age;
            if(age)line([field('postmenstrualDays',number(age.postmenstrualDays)),field('birthGestationDays',number(age.birthGestationDays))].join('  |  '));
            const score=value=>Number.isFinite(value?.zscore)?number(value.zscore,2):'—';
            const interpretation=value=>[value?.classification?t(value.classification):(!value?.error?t(Number.isFinite(value?.zscore)?'intergrowthDescriptive':'notCalculated'):''),value?.error?t(value.error==='oedemaWarning'?'pdfOedemaSuspended':value.error):'',value?.flagged?t('flagged'):''].filter(Boolean).join(' · ');
            if(result){
                heading(t('pdfGrowthIndicators'),'02');
                table([t('pdfIndicator'),'Z','P',t('pdfInterpretation')],indicators.map((key,i)=>[t(key),score(result[key]),centile(row.percentiles[i]?.slice(2)||'—'),interpretation(result[key])]));
            }else line(t('pdfUncalculated'),{bold:true});
            const extra=Object.entries(result?.additionalGrowth?.indicators||{});
            if(extra.length){
                heading(t('additionalResults'),'03');
                table([t('pdfIndicator'),t('pdfMeasureShort'),'Z','P',t('pdfInterpretation')],extra.map(([key,value])=>[t(key),unit(value.measure,1,value.unit),score(value),centile(CentilePDF.text(value)),interpretation(value)]));

            }
            const rawExtra=SupplementaryPDF.fields.filter(key=>SupplementaryPDF.present(child[key])&&
                !extra.some(([indicator])=>SupplementaryPDF.definitions[indicator]?.field===key));
            if(rawExtra.length)line(rawExtra.map(key=>field(key,number(child[key],1))).join('  |  '),{size:9.5});
            const observed=assessment?NutritionPDF.inputFields.filter(key=>!['muac','careProtocol'].includes(key)&&child[key]&&child[key]!=='unknown'&&child[key]!=='u')
                .map(key=>field(key,t(NutritionPDF.observationLabel(key,child[key],NutritionPDF.is2025(assessment)?'2025':NutritionPDF.isNational(assessment))))):[];
            const vigilance=[extra.some(([key])=>key==='armCircumferenceForAge')?t('pdfMuacDistinction'):'',
                assessment?.missing?.length?field('pdfToRecord',assessment.missing.map(t).join(', ')):'',
                observed.join('  |  '),...(result?.warnings||[]).map(t),age?t('intergrowthNoScreening'):'',
                result?.referenceFamily==='CDC2000'?t('cdcInterpretation'):''].filter(Boolean);
            if(vigilance.length){heading(labels.vigilance,'04');for(const value of new Set(vigilance))note(value,'info',true,vigilance.length>=4);}
            if(result){
                heading(t('pdfReferences'),'05',labels.calc+': '+timestamp(row.calculatedAt));
                fields([[t('pdfRefShort'),result.referenceVersion],...(result.additionalGrowth&&result.additionalGrowth.referenceVersion!==result.referenceVersion?[[t('pdfExtraShort'),result.additionalGrowth.referenceVersion]]:[])],undefined,8.5);
                fields([...(assessment?[[t('pdfOrientation'),assessment.reference+' v'+assessment.version]]:[]),[labels.engine,result.engineVersion]],assessment?[1.5,1]:undefined,8.5);
                y+=1.5;
                if(model.hasPercentiles)note(t('pdfCentileShort'),'bulb');
            }
            note(labels.notice,'warning');
        }
        for(const key of active.filter(key=>key!==this.reportSections[0])){
            const panels=chartData.sections[key];
            const panelHeight=62,gap=5;
            const references=[...new Set(panels.map(p=>p.reference))];
            const sharedReference=references.length===1?t('pdfRefShort')+': '+references[0]:'';
            const tableHeight=23+Math.min(8,chartData.entries.length)*5.5;
            const sectionHeight=29+Math.ceil(panels.length/2)*panelHeight+Math.ceil(panels.length/4)*tableHeight;
            const startOnNewPage=title===this.reportSections[0]||
                (key!==active[0]&&y+Math.min(sectionHeight,227)>bottom);
            if(startOnNewPage){doc.addPage();title=key;sectionReference=sharedReference;header();y=sectionReference?26:23;identity();}
            else if(key===active[0]){sectionReference=sharedReference;header();if(sectionReference)y=26;identity();}
            else if(pages.get(at())!==key){heading(t(key));if(sharedReference)line(sharedReference,{size:8.5});}
            title=key;sectionReference=sharedReference;
            const referenceList=()=>{if(references.length>1)for(const [index,ref] of references.entries())line('R'+(index+1)+' · '+ref,{size:8.5});};
            referenceList();
            const legend=()=>{
                const labels=['pdfVisitMark','pdfMedianMark','pdfTwoMark','pdfThreeMark'].map(t);
                const segments=[[],[],[1.4,.8],[.35,.85]];
                const cellWidth=width/labels.length;
                ensure(14);
                for(let i=0;i<labels.length;i++){
                    const left=margin+(rtl?labels.length-1-i:i)*cellWidth;
                    const mark=rtl?left+cellWidth-7:left;
                    doc.setDrawColor(45).setLineWidth(i===0?.55:.24).setLineDashPattern(segments[i],0).line(mark,y-1,mark+7,y-1);
                    if(i===0)doc.setFillColor(35).circle(mark+3.5,y-1,.65,'F');
                    place(labels[i],rtl?mark-2:mark+9,y,{size:8.5});
                }
                doc.setLineDashPattern([],0);y+=5;
                line(t('pdfPointStyles'),{size:8.5});
            };
            for(let i=0;i<panels.length;i+=2){
                const pair=panels.slice(i,i+2);
                const required=panelHeight+(i+2>=panels.length?13:0);
                const nextPage=y+required>bottom;
                ensure(required);
                if(nextPage){identity();referenceList();}
                const panelWidth=pair.length===1?width:(width-gap)/2;
                pair.forEach((panel,index)=>this.drawReportChart(doc,panel,margin+(rtl?pair.length-1-index:index)*(panelWidth+gap),y,panelWidth,{place,t,number,rtl,referenceCode:references.length>1?'R'+(references.indexOf(panel.reference)+1):'',date}));
                y+=panelHeight;
            }
            legend();
            if(panels.some(panel=>panel.key==='armCircumferenceForAge'))line(t('pdfMuacDistinction'),{size:9});
            const indexed=panels.map(panel=>new Map(panel.points.map(point=>[point.index,point.value])));
            const rows=chartData.entries.flatMap((visit,i)=>indexed.some(values=>values.has(i))?[{visit,i}]:[]);
            heading(t('pdfHistoryShort'));
            const recent=rows.slice(-8);
            if(recent.length<rows.length)line(t('pdfRecentVisits').replace('{count}',number(recent.length)).replace('{total}',number(rows.length)),{size:9});
            // Split wide histories by reference and indicator to keep every column readable.
            for(let i=0;i<panels.length;i+=4){
                const subset=panels.slice(i,i+4),values=indexed.slice(i,i+4);
                const indexedReferences=references.length>1;
                table([t('measurementDate'),t('ageDays'),...subset.map(p=>t(p.key)+(p.growth?' · '+this.chartUnit(p.key):' · Z')+
                    (indexedReferences?' · R'+(references.indexOf(p.reference)+1):''))],
                    recent.map(({visit,i:index})=>[date(visit.child.measurementDate),number(visit.child.ageDays),...values.map((column,j)=>column.has(index)?number(column.get(index),subset[j].growth?1:2):'—')]),true);
            }
            if(key===active.at(-1)&&!selected.has(this.reportSections[0]))line(t('appUsageNotice'),{size:9});
        }
        const count=doc.getNumberOfPages();
        const issued=this.exportTimestamp(now,language,model.timeZone,model.dateFormat);
        for(let i=1;i<=count;i++){
            doc.setPage(i);
            place(language==='ar'?t('brand'):'Z-Score Niger',rtl?right:margin,12,{size:17,bold:true});
            place(t(pages.get(i)||active[0]),rtl?margin:right,12,{size:11,bold:true,align:rtl?'left':'right'});
            const reference=pageReferences.get(i);
            if(reference)place(reference,rtl?margin:right,16,{size:7.5,align:rtl?'left':'right'});
            doc.setDrawColor(50).setLineWidth(.25);
            doc.line(margin,reference?19:16,right,reference?19:16);doc.line(margin,282,right,282);
            const exported=t('pdfExported')+' '+issued,confidential=t('pdfSensitive');
            doc.setFont(font,'normal').setFontSize(8);
            const confidentialWidth=doc.getTextWidth(safe(confidential));
            const exportWidth=105-confidentialWidth/2-margin-3;
            const exportSize=Math.min(8,8*exportWidth/Math.max(1,doc.getTextWidth(safe(exported))));
            place(exported,margin,287,{size:exportSize,align:'left'});
            place(confidential,105,287,{size:8,align:'center'});
            place(i+'/'+count,right,287,{size:8,align:'right'});
        }
    }
    static chartUnit(key) {
        return SupplementaryPDF.definitions[key]?.unit||{weightForAge:'kg',heightForAge:'cm',bmiForAge:'kg/m²'}[key]||'';
    }
    static drawReportChart(doc,panel,left,top,width,{place,t,number,rtl,referenceCode='',date=value=>value}) {
        const axisLeft=left+12,axisRight=left+width-(panel.growth?10:4),axisTop=top+10,axisBottom=top+49;
        let {xMin,xMax,min,max}=panel;
        if(panel.growth&&panel.points.length>1){
            const month=panel.ig?28:30.4375;
            const ages=panel.points.reduce(({first,last},p)=>({first:Math.min(first,p.day),last:Math.max(last,p.day)}),{first:Infinity,last:-Infinity});
            xMin=Math.max(xMin,Math.floor(ages.first/month-1)*month);
            xMax=Math.min(xMax,Math.ceil(ages.last/month+1)*month);
            const values=[...panel.points.map(p=>p.value),...panel.curves.flatMap(curve=>curve.segments.flatMap(segment=>
                segment.filter(p=>p.day>=xMin-month&&p.day<=xMax+month).map(p=>p.value)))];
            const bounds=values.reduce(({low,high},value)=>({low:Math.min(low,value),high:Math.max(high,value)}),{low:Infinity,high:-Infinity});
            const pad=Math.max(.3,(bounds.high-bounds.low)*.08);
            min=Math.max(0,bounds.low-pad);max=bounds.high+pad;
        }
        const x=day=>axisLeft+(day-xMin)/(xMax-xMin||1)*(axisRight-axisLeft);
        const y=value=>axisBottom-(value-min)/(max-min)*(axisBottom-axisTop);
        const unit=panel.growth?this.chartUnit(panel.key):'Z';
        const chartTitle=t(panel.key)+' · '+unit+(referenceCode?' · '+referenceCode:'');
        doc.setFontSize(9.5);const titleLines=doc.splitTextToSize(chartTitle,width-2);
        titleLines.forEach((label,i)=>place(label,rtl?left+width:left,top+2+i*3.6,{size:9.5,bold:true}));
        const zLevels=[-3,-2,0,2,3];
        const grid=panel.growth?Array.from({length:4},(_,i)=>min+(max-min)*i/3):zLevels;
        const dash=z=>Math.abs(z)===3?[.35,.85]:Math.abs(z)===2?[1.4,.8]:[];
        for(const level of grid){
            doc.setDrawColor(panel.growth?198:95).setLineWidth(.19).setLineDashPattern(panel.growth?[]:dash(level),0).line(axisLeft,y(level),axisRight,y(level));
            place(number(level,panel.growth?1:0),axisLeft-1,y(level)+.8,{size:8,align:'right'});
        }
        doc.saveGraphicsState().rect(axisLeft,axisTop,axisRight-axisLeft,axisBottom-axisTop,null).clip().discardPath();
        for(const curve of panel.curves||[]){
            doc.setDrawColor(65).setLineWidth(curve.z===0?.42:.31).setLineDashPattern(dash(curve.z),0);
            // A continuous vector path maintains the dash pattern across all samples.
            for(const segment of curve.segments){
                if(segment.length<2)continue;
                doc.moveTo(x(segment[0].day),y(segment[0].value));
                for(const point of segment.slice(1))doc.lineTo(x(point.day),y(point.value));
                doc.stroke();
            }
        }
        doc.restoreGraphicsState();
        if(panel.growth){
            const marks=[];
            for(const curve of panel.curves||[]){
                let last=null;
                for(const segment of curve.segments){
                    for(let i=0;i<segment.length;i++){
                        const p=segment[i];
                        if(p.day>=xMin&&p.day<=xMax&&(!last||p.day>last.day))last=p;
                        const q=segment[i+1];
                        if(q&&p.day<xMax&&q.day>xMax)last={day:xMax,value:p.value+(q.value-p.value)*(xMax-p.day)/(q.day-p.day)};
                    }
                }
                if(last&&last.value>=min&&last.value<=max)marks.push({z:curve.z,at:y(last.value)});
            }
            marks.sort((a,b)=>a.at-b.at);
            const spacing=2.9;
            marks.forEach((m,i)=>m.labelY=Math.max(axisTop+1,m.at,i?marks[i-1].labelY+spacing:axisTop+1));
            for(let i=marks.length-1;i>=0;i--)marks[i].labelY=Math.min(marks[i].labelY,i===marks.length-1?axisBottom:marks[i+1].labelY-spacing);
            for(const m of marks){doc.setDrawColor(100).setLineWidth(.16).setLineDashPattern([],0).line(axisRight,m.at,axisRight+1.1,m.labelY);place((m.z>0?'+':'')+number(m.z),axisRight+1.5,m.labelY+.8,{size:7.5,align:'left'});}
        }
        doc.setDrawColor(34).setLineWidth(.52).setLineDashPattern([],0);
        for(const [a,b] of panel.lines)doc.line(x(a.day),y(a.value),x(b.day),y(b.value));
        const radius=panel.points.length>30?.48:.75;
        for(const point of panel.points){
            doc.setFillColor(point.imported?255:30);
            if(point.estimated)doc.rect(x(point.day)-radius,y(point.value)-radius,2*radius,2*radius,'FD');
            else doc.circle(x(point.day),y(point.value),radius,'FD');
        }
        for(const point of new Set([panel.points[0],panel.points.at(-1)])){
            const px=x(point.day),py=y(point.value);
            const another=panel.points[0]!==point&&Math.abs(x(panel.points[0].day)-px)<12&&Math.abs(y(panel.points[0].value)-py)<4;
            if(!another)place(number(point.value,panel.growth?1:2),Math.max(axisLeft+4,Math.min(axisRight-4,px)),py<axisTop+4?py+4:py-1.7,{size:8,bold:true,align:'center'});
        }
        doc.setDrawColor(80).setLineWidth(.19);
        doc.line(axisLeft,axisTop,axisLeft,axisBottom);doc.line(axisLeft,axisBottom,axisRight,axisBottom);
        const ticks=panel.growth?Array.from({length:5},(_,i)=>xMin+(xMax-xMin)*i/4):[xMin,xMax];
        for(const day of ticks){
            const label=panel.growth?number(day/(panel.ig?7:panel.older?365.25:30.4375),panel.older&&(xMax-xMin)<1461?1:0):date(new Date(day*86400000).toISOString().slice(0,10));
            place(label,x(day),top+53,{size:8,align:day===xMin?'left':day===xMax?'right':'center'});
        }
        place(t(panel.growth?(panel.ig?'intergrowthPmaWeeks':panel.older?'referenceAgeAxisYears':'referenceAgeAxis'):'measurementDate'),(axisLeft+axisRight)/2,top+58,{size:8,align:'center'});
    }
    static build(entries, options, { jsPDF, autoTable, fonts, now = new Date() }) {
        if (!jsPDF || !autoTable || !fonts?.[0] || !fonts?.[1]) throw new Error('pdfUnavailable');
        if(options.layout!==undefined&&!['compact','detailed'].includes(options.layout))throw new Error('pdfInvalid');
        const model = this.model(entries, options), {t, language, rows} = model;
        const batch = rows.length > 1 || options.mode === 'batch', rtl = language === 'ar';
        const doc = new jsPDF({orientation:batch?'landscape':'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
        for (const [i, style] of ['normal','bold'].entries()) {
            const name = 'Amiri-' + style + '.ttf'; doc.addFileToVFS(name, fonts[i]); doc.addFont(name, 'Amiri', style);
        }
        doc.setFont('Amiri','normal'); doc.setLineHeightFactor(1.15);
        // Stored strings are logical Unicode. AutoTable must use the same Bidi options as headings.
        const drawText=doc.text.bind(doc),bidi=new jsPDF.__bidiEngine__({isInputVisual:false,isOutputVisual:true,isOutputRtl:false,isSymmetricSwapping:true});
        const visual=value=>{
            const ltr=rtl&&!batch&&/^(?:[<>]\s*)?[+−-]?\d[\d\s.,]*(?:\s(?:cm|mm|kg|g|kg\/m²))?$/.test(value);
            const logical=ltr?'\u200E'+value+'\u200E':value;
            return bidi.doBidiReorder(doc.processArabic(logical)).replace(/[\u200E\u200F]/g,'');
        };
        doc.text=(value,x,y,options={})=>drawText(Array.isArray(value)?value.map(visual):visual(value),x,y,{...options,isInputVisual:true,isOutputVisual:true,isOutputRtl:false});
        // Display unsupported characters explicitly rather than silently losing identity text.
        const glyph = doc.getFont().metadata.characterToGlyph.bind(doc.getFont().metadata);
        const safe = value => Array.from(this.clean(value), char => char === '\n' || glyph(char.codePointAt(0)) ? char : ({'≥':'>=','≤':'<='}[char] || '[U+' + char.codePointAt(0).toString(16).toUpperCase() + ']')).join('')
            .replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?\b/g, value => '\u200E'+value+'\u200E');
        const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = batch?8:12;
        const compact=batch&&options.layout==='compact';
        const title = t(compact?'pdfCompactTitle':batch?'pdfBatchTitle':options.sections?.[0]||'pdfSingleReport'), issued = this.exportTimestamp(now,language,model.timeZone,model.dateFormat);
        doc.setProperties({title:t('brand')+' - '+title,subject:t('pdfStoredOnly'),author:t('brand'),creator:'Z-score Niger local PDF'});
        doc.setLanguage(language); doc.setCreationDate(now);
        if(!batch){
            // Standard PDF sans-serif for Western text; keep the embedded Arabic Unicode font for RTL and identities outside WinAnsi.
            const normalize=value=>this.clean(value).replace(/[\u202f\u00a0]/g,' ').replace(/−/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=');
            const western=value=>/^[\x20-\x7e\xa0-\xff\nœŒ‘’“”–—…€]*$/u.test(normalize(value));
            const strings=[...Object.values(options.translations[language]),...rows.flatMap(r=>[...r.identity,...r.measures,...r.scores,...r.percentiles,...r.notes])];
            const individualFont=!rtl&&strings.every(western)?'helvetica':'Amiri';
            const individualSafe=individualFont==='helvetica'?normalize:safe;
            this.individual(doc,autoTable,model,entries[0],{...options,individualFont},individualSafe,now);
            if(options.print)doc.internal.events.subscribe('putPage',({pageNumber})=>{
                // Native PDF action on opening the first page.
                if(pageNumber===1)doc.internal.write('/AA << /O << /S /Named /N /Print >> >>');
            });
            return {bytes:doc.output('arraybuffer'),pages:doc.getNumberOfPages(),entries:1};
        }
        // Both reports read stored results. The synthesis puts comparisons in a single table.
        const normalize=value=>this.clean(value).replace(/[\u202f\u00a0]/g,' ').replace(/−/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=');
        const western=value=>/^[\x20-\x7e\xa0-\xff\nœŒ‘’“”–—…€]*$/u.test(normalize(value));
        const strings=[...Object.values(options.translations[language]),...rows.flatMap(r=>[...r.identity,...r.measures,...r.scores,...r.percentiles,...r.notes])];
        const font=!rtl&&strings.every(western)?'helvetica':'Amiri',render=font==='helvetica'?normalize:safe;
        doc.setFont(font,'normal');doc.setLineHeightFactor(1.13);
        const text=(value,y,size=9,bold=false,color=[35,50,45])=>{
            doc.setFont(font,bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
            const lines=doc.splitTextToSize(render(value),width-2*margin);
            doc.text(lines,rtl?width-margin:margin,y,{align:rtl?'right':'left'});
            return y+lines.length*size/doc.internal.scaleFactor*1.13+2;
        };
        const headed=new Set(),usable=width-2*margin;
        const calculated=entries.filter(e=>!!e.result).length;
        const detailedLabels=this.detailedLabels(language),legend=this.batchLegend(language,model.hasPercentiles);
        const synthesisNotes=compact?[
            entries.some(entry=>entry.result?.imported)?t('importedResult'):'',
            entries.some(entry=>entry.result?.referenceFamily==='CDC2000')?t('cdcInterpretation'):''
        ].filter(Boolean):[];
        const bottom=16;
        let batchTop=24;
        const oneLine=(value,x,y,w,size,bold,align,color)=>{
            doc.setFont(font,bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
            const valueText=render(value);
            doc.setFontSize(Math.min(size,size*w/Math.max(1,doc.getTextWidth(valueText),doc.getTextWidth(visual(valueText)))));
            doc.text(valueText,x,y,{align});
        };
        const header=()=>{
            const page=doc.internal.getCurrentPageInfo().pageNumber;if(headed.has(page))return;headed.add(page);
            doc.setFillColor(23,99,72);doc.roundedRect(rtl?width-margin-8:margin,5,8,8,1.3,1.3,'F');
            doc.setFont(font,'bold');doc.setFontSize(13);doc.setTextColor(255);doc.text('Z',rtl?width-margin-4:margin+4,10.8,{align:'center'});
            doc.setTextColor(23,99,72);doc.setFontSize(14);
            doc.text(render(t('brand')),rtl?width-margin-11:margin+11,11,{align:rtl?'right':'left'});
            const labels={fr:{records:rows.length===1?'fiche':'fiches',done:'Calculé'},en:{records:rows.length===1?'record':'records',done:'Calculated'},ar:{records:'سجل',done:'محسوب'}}[language];
            const summary=title+' : '+rows.length+' '+labels.records+' | '+labels.done+' : '+calculated+' | '+t('notCalculated')+' : '+(rows.length-calculated);
            const lead=rtl?width-margin:margin,opposite=rtl?margin:width-margin;
            doc.setFont(font,'bold');doc.setFontSize(14);
            const brandText=render(t('brand'));
            const brandWidth=Math.max(doc.getTextWidth(brandText),doc.getTextWidth(visual(brandText)));
            oneLine(summary,opposite,11,usable-11-brandWidth-10,11.5,true,rtl?'left':'right',[23,99,72]);
            // One full-width legend for both calculated and pending lots.
            oneLine(legend.header,lead,17,usable,8,false,rtl?'right':'left',[65,65,65]);
            let ly=20;
            if(synthesisNotes.length){
                ly=text(synthesisNotes.join(' '),ly+3,8);
            }
            if(model.stale)ly=text(t('stale'),ly+2,9,true);
            doc.setDrawColor(205,216,210);doc.line(margin,ly,width-margin,ly);
            // Reserve space for a continuation marker on subsequent pages.
            batchTop=ly+(compact?5:3);
        };
        header();let y=batchTop;
        const base={theme:'grid',margin:{top:batchTop,bottom,left:margin,right:margin},styles:{font,fontStyle:'normal',fontSize:9,textColor:[32,44,39],lineColor:[215,225,220],lineWidth:.12,cellPadding:1.6,overflow:'linebreak',halign:rtl?'right':'left',valign:'top'},
            headStyles:{fontStyle:'bold',fillColor:[23,99,72],textColor:255},alternateRowStyles:{fillColor:[247,250,248]},rowPageBreak:'avoid',showHead:'everyPage',willDrawPage:()=>header(),
            didParseCell:data=>{data.cell.text=data.cell.text.map(render);}};
        const table=(head,body,widths,overrides={})=>{
            if(!body.length)return;
            if(rtl){head=[...head].reverse();body=body.map(row=>[...row].reverse());widths=[...widths].reverse();}
            const continuedPages=new Set();
            autoTable(doc,{...base,startY:y,head:[head],body,columnStyles:Object.fromEntries(widths.map((cellWidth,i)=>[i,{cellWidth}])),...overrides,
                didDrawCell:data=>{
                    if(overrides.didDrawCell)overrides.didDrawCell(data);
                    const index=this.continuedRowIndex(data,rtl),page=doc.internal.getCurrentPageInfo().pageNumber;
                    if(!overrides.recordRows||index===null||continuedPages.has(page))return;
                    continuedPages.add(page);const size=doc.getFontSize(),color=doc.getTextColor();
                    doc.setFontSize(8);doc.setTextColor(35);doc.text(render(t('pdfRowContinuation').replace('{number}',index)),rtl?width-margin:margin,batchTop-1.5,{align:rtl?'right':'left'});doc.setFontSize(size);doc.setTextColor(color);
                }});
            y=doc.lastAutoTable.finalY+5;
        };
        if(compact){
            const essential=[8,36,43,52,39],n=model.indicators.length;
            const remaining=usable-essential.reduce((sum,width)=>sum+width,0);
            if(!n)essential[3]+=remaining;
            table(['pdfNumber','pdfCompactIdentity','pdfMeasures',...model.indicators,'uiScreening','pdfReferences'].map(t),
                this.compact(model,entries).body,[...essential.slice(0,3),...model.indicators.map(()=>remaining/n),...essential.slice(3)],
                {recordRows:true,styles:{...base.styles,fontSize:8.5,cellPadding:1.1}});
        }else{
            // Each child is one horizontal record block, rather than a tall grid row.
            // Measure wrapping before drawing, keep complete blocks together when they
            // fit, and split only genuinely oversized blocks with an explicit marker.
            const inset=1.7,step=3.45,pad=1.35,gap=2.2,limit=height-bottom,rail=4.5,recordWidth=usable-rail;
            const ink=[32,44,39],green=[23,99,72],muted=[70,79,75];
            const makeLines=(value,w,bold=false,color=ink,size=8.5)=>{
                doc.setFont(font,bold?'bold':'normal');doc.setFontSize(size);
                return String(value).split('\n').flatMap(line=>doc.splitTextToSize(render(line),Math.max(1,w-2*inset)))
                    .map(text=>({text,bold,color,size}));
            };
            const cell=(w,parts)=>({w,lines:parts.flatMap(part=>makeLines(part.value,w,part.bold,part.color,part.size))});
            const band=(cells,fill=null)=>({cells,fill,length:Math.max(1,...cells.map(c=>c.lines.length))});
            const bandHeight=(b,n=b.length,start=0)=>2*pad+Math.max(n*step,...b.cells.map(c=>c.lines.slice(start,start+n).reduce((sum,line,i)=>sum+(c.leading||step)+(i?(line.before||0):0),0)));
            // Measure in the actual font and in visual (bidi) order too. Long
            // uninterrupted strings must wrap, never spill into the next column.
            const noteInset=2.6;
            const wrapObservation=(value,w)=>{
                doc.setFont(font,'normal');doc.setFontSize(8.5);
                const max=w-2*noteInset-.35;
                const fits=s=>Math.max(doc.getTextWidth(s),doc.getTextWidth(visual(s)))<=max;
                const output=[];let line='';
                const flush=()=>{if(line){output.push(line);line='';}};
                const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(language,{granularity:'grapheme'}):null;
                for(const word of render(value).split(/\s+/u).filter(Boolean)){
                    const combined=line?line+' '+word:word;
                    if(fits(combined)){line=combined;continue;}
                    flush();
                    if(fits(word)){line=word;continue;}
                    const pieces=segmenter?Array.from(segmenter.segment(word),v=>v.segment):Array.from(word);
                    for(const piece of pieces){
                        if(line&&!fits(line+piece))flush();
                        // A single grapheme is much narrower than an observation
                        // column. Keep it intact even for combining characters.
                        line+=piece;
                    }
                }
                flush();
                return output.map(text=>({text,bold:false,color:ink,size:8.5}));
            };
            const drawBand=(b,start,n,top)=>{
                const h=bandHeight(b,n,start);
                if(b.fill){doc.setFillColor(...b.fill);doc.rect(margin,top,usable,h,'F');}
                let offset=0;
                const leftReserve=Math.max(0,usable-b.cells.reduce((sum,c)=>sum+c.w,0));
                for(const c of b.cells){
                    const left=rtl?width-margin-offset-c.w:margin+leftReserve+offset;
                    let lineY=top+pad+2.65;
                    for(const [i,line] of c.lines.slice(start,start+n).entries()){
                        if(i)lineY+=line.before||0;
                        doc.setFont(font,line.bold?'bold':'normal');doc.setFontSize(line.size);doc.setTextColor(...line.color);
                        if(line.text)doc.text(line.text,rtl?left+c.w-(c.inset??inset):left+(c.inset??inset),lineY,{align:rtl?'right':'left'});
                        lineY+=c.leading||step;
                    }
                    offset+=c.w;
                }
                return top+h;
            };
            const nextPage=()=>{doc.addPage();header();y=batchTop;};
            const closeFragment=(top,end)=>{
                doc.setDrawColor(190,207,198);doc.setLineWidth(.25);doc.rect(margin,top,usable,end-top,'S');
            };
            const shared=new Set();
            const local={fr:{imported:'Résultat importé',shared:'Mentions communes',supplementary:'Indicateurs complémentaires'},en:{imported:'Imported result',shared:'Common notes',supplementary:'Additional indicators'},ar:{imported:'نتيجة مستوردة',shared:'ملاحظات مشتركة',supplementary:'مؤشرات إضافية'}}[language];
            for(const [index,row] of rows.entries()){
                const entry=entries[index],result=entry.result,detailed=this.detailedRow(entry,row,model);
                const heading='#'+row.index+' | '+row.briefIdentity[0];
                const identityWidth=recordWidth*.265,screeningWidth=recordWidth*.18,fieldWidth=(recordWidth-identityWidth-screeningWidth)/4;
                const identityGroups=[
                    [{value:heading,bold:true,color:green,size:10}],
                    [{value:row.briefIdentity[1]+' · '+this.detailedDate(row.measurementDate,language,model.dateFormat),color:muted}],
                    detailed.primaryMeasures.map(value=>({value})),
                    detailed.otherMeasures.map(value=>({value}))
                ].filter(group=>group.length);
                const id={w:identityWidth,leading:3.0,lines:identityGroups.flatMap((group,i)=>{
                    const lines=cell(identityWidth,group).lines;
                    if(i&&lines.length)lines[0].before=.8;
                    return lines;
                })};
                // Only stored scores occupy the four middle columns; the input
                // measurements now live with the identity. BMI is a stored result.
                const right=Array.from({length:4},()=>[]);
                const emptyLine=()=>({text:'',bold:false,color:ink,size:8.5});
                const appendGrid=groups=>{
                    if(!groups.length)return;
                    if(right.some(lines=>lines.length))right.forEach(lines=>lines.push(emptyLine()));
                    for(let i=0;i<groups.length;i+=4){
                        const cells=Array.from({length:4},(_,j)=>cell(fieldWidth,groups[i+j]||[]));
                        const h=Math.max(...cells.map(c=>c.lines.length),1);
                        cells.forEach((c,j)=>{
                            right[j].push(...c.lines);
                            for(let k=c.lines.length;k<h;k++)right[j].push(emptyLine());
                        });
                    }
                };
                const oedemaNote=t('oedemaWarning'),originalNotes=detailed.notes==='—'?[]:detailed.notes.split('\n');
                const notes=originalNotes.filter(v=>v!==t('screeningTitle')&&v!==t('additionalResults'));
                if(result){
                    notes.push(t('pdfRefShort')+': '+result.referenceVersion+' · '+t('engineVersion')+' '+result.engineVersion);
                    if(result.nutrition?.reference)notes.push(t('clinicalReference')+': '+result.nutrition.reference+' v'+result.nutrition.version);
                    if(result.additionalGrowth?.referenceVersion&&result.additionalGrowth.referenceVersion!==result.referenceVersion)
                        notes.push(t('pdfExtraShort')+': '+result.additionalGrowth.referenceVersion);
                }
                const groups=model.indicators.map((key,i)=>{
                    let lines=this.scoreWithPercentile(row,i).split('\n');
                    if(lines.includes(oedemaNote)){
                        notes.push(oedemaNote);
                        lines=lines.filter(v=>v!==oedemaNote);
                        if(lines[0]===t('notCalculated'))lines[0]=t('pdfOedemaSuspended');
                    }
                    return [{value:t(key),bold:true,color:green},...(key==='bmiForAge'&&detailed.bmi?[{value:detailed.bmi}]:[]),{value:lines.shift(),bold:true},...lines.map(value=>({value}))];
                });
                const protocol=result?.nutrition?(NutritionPDF.is2025(result.nutrition)?t('screeningTitlePcima2025'):NutritionPDF.isNational(result.nutrition)?t('screeningTitlePcima'):t('uiScreening')):t('uiScreening');
                const orientation=result?.nutrition?.orientation,orientationShort=orientation?t(orientation+'Short'):'';
                const screening=cell(screeningWidth,[{value:protocol,bold:true,color:green},{value:row.screening,bold:true},...(orientationShort&&orientationShort!==orientation+'Short'?[{value:orientationShort,bold:true}]:[])]);
                for(const label of [protocol,row.screening])for(let i=notes.length-1;i>=0;i--)if(notes[i]===label)notes.splice(i,1);
                appendGrid(groups);
                const supplemental=[];
                for(const key of Object.keys(result?.additionalGrowth?.indicators||{})){
                    const prefix=t(key)+' : ',i=notes.findIndex(v=>v.startsWith(prefix));
                    if(i<0)continue;
                    const note=notes.splice(i,1)[0].slice(prefix.length),parts=note.split(' | ');
                    // Suppress a repeated measure only when it exactly matches
                    // the recorded input and its expected unit. Preserve mismatches
                    // or missing input for traceability, including suspended scores.
                    const fields={headCircumferenceForAge:['headCircumference','cm'],armCircumferenceForAge:['muac','mm'],tricepsForAge:['tricepsSkinfold','mm'],subscapularForAge:['subscapularSkinfold','mm']};
                    const spec=fields[key],stored=result.additionalGrowth.indicators[key];
                    const duplicate=spec&&Number.isFinite(entry.child[spec[0]])&&stored.measure===entry.child[spec[0]]&&stored.unit===spec[1];
                    const values=parts[1]?.startsWith('Z = ')?[...(duplicate?[]:[parts[0]]),parts[1]+(parts[2]?.startsWith('P ')?' | '+parts[2]:''),...parts.slice(parts[2]?.startsWith('P ')?3:2)]:parts.slice(duplicate?1:0);
                    supplemental.push([{value:t(key),bold:true,color:green},...values.map(value=>({value,bold:value.startsWith('Z = ')}))]);
                }
                if(detailed.bmi&&!model.indicators.includes('bmiForAge'))supplemental.push([{value:detailed.bmi}]);
                if(supplemental.length)appendGrid(supplemental);
                const bands=[band([id,...right.map(lines=>({w:fieldWidth,lines})),screening],[247,250,248])];
                // A repeated generic statement is moved once to the end of the
                // report; the relevant row keeps its identifying status/short label.
                const commonKeys=['importedResult','bmiReportHelp','orientationCompleteAssessment'];
                for(const key of commonKeys){
                    const value=t(key),i=notes.indexOf(value);
                    if(i>=0&&(key!=='orientationCompleteAssessment'||orientationShort===t('orientationCompleteAssessmentShort'))){
                        shared.add(key);
                        for(let j=notes.length-1;j>=0;j--)if(notes[j]===value)notes.splice(j,1);
                    }
                }
                const uniqueNotes=[...new Set(notes.filter(Boolean))];
                if(uniqueNotes.length){
                    // Simulate actual typography at every width before drawing.
                    const wrapped={};
                    for(let k=1;k<=3;k++)wrapped[k]=uniqueNotes.map(v=>wrapObservation('· '+v,recordWidth/k));
                    const counts=Object.fromEntries([1,2,3].map(k=>[k,wrapped[k].map(lines=>lines.length)]));
                    const plan=this.observationPlan(counts,2*pad/step);
                    for(const [bi,part] of plan.bands.entries()){
                        const w=recordWidth/part.columns,cols=part.cols.map(indices=>indices.flatMap(i=>wrapped[part.columns][i]));
                        const titleLines=bi===0?makeLines(detailedLabels.observations,w-2*(noteInset-inset),true,green,8.5):[];
                        const titleCount=titleLines.length;
                        const blank=()=>({text:'',bold:false,color:ink,size:8.5});
                        const observationBand=band(cols.map((lines,i)=>({
                            w,inset:noteInset,
                            lines:[...(i===0?titleLines:Array.from({length:titleCount},blank)),...lines.map((line,j)=>j===0&&titleCount?{...line,before:.35}:line)]
                        })));
                        observationBand.minFirst=titleCount+1;
                        bands.push(observationBand);
                    }
                }
                const total=bands.reduce((n,b)=>n+bandHeight(b),0);
                if(y>batchTop+.1&&y+total>limit)nextPage();
                let top=y,firstFragment=true;
                const finishRecordFragment=()=>{
                    closeFragment(top,y);
                    if(firstFragment&&result?.imported){
                        // Draw a dedicated rail inside the printable block. Use
                        // an explicit PDF graphics transform, not jsPDF's angle +
                        // centered-alignment combination (which can misplace text).
                        doc.setFillColor(...green);doc.rect(margin,top,rail,y-top,'F');
                        doc.setFont(font,'bold');doc.setFontSize(7.5);
                        const label=render(local.imported),length=Math.max(doc.getTextWidth(label),doc.getTextWidth(visual(label)));
                        const available=Math.max(1,y-top-4),size=Math.min(7.5,7.5*available/Math.max(1,length));
                        doc.setFontSize(size);
                        const x=margin+3.2,center=(top+y)/2,textLength=Math.max(doc.getTextWidth(label),doc.getTextWidth(visual(label)));
                        const baseline=center+textLength/2,k=doc.internal.scaleFactor,X=x*k,Y=(height-baseline)*k;
                        doc.setTextColor(255,255,255);
                        doc.internal.write('q');
                        try{
                            doc.internal.write('0 1 -1 0 '+(X+Y).toFixed(6)+' '+(Y-X).toFixed(6)+' cm');
                            doc.text(label,x,baseline,{align:'left'});
                        }finally{doc.internal.write('Q');}
                    }
                    firstFragment=false;
                };
                const continuation=()=>{
                    finishRecordFragment();
                    nextPage();top=y;
                    const marker=band([cell(recordWidth,[{value:t('pdfRowContinuation').replace('{number}',row.index),bold:true,color:green}])],[239,246,241]);
                    y=drawBand(marker,0,marker.length,y);
                };
                for(const [bi,b] of bands.entries()){
                    let start=0;
                    // Keep a small heading band with at least the start of its content.
                    if(b.length===1&&bi+1<bands.length&&y+bandHeight(b)+bandHeight(bands[bi+1],1)>limit)continuation();
                    if(b.minFirst&&y+bandHeight(b,b.minFirst)>limit)continuation();
                    while(start<b.length){
                        const fitting=()=>{
                            let n=Math.min(b.length-start,Math.floor((limit-y-2*pad+.001)/step));
                            while(n>0&&y+bandHeight(b,n,start)>limit+.001)n--;
                            return n;
                        };
                        let n=fitting();
                        if(n<1){continuation();n=fitting();}
                        if(n<1)throw new Error('pdfInvalid');
                        y=drawBand(b,start,n,y);start+=n;
                        if(start<b.length)continuation();
                    }
                }
                finishRecordFragment();y+=gap;
            }
            if(shared.size){
                const heading=band([cell(usable,[{value:local.shared,bold:true,color:green}])],[239,246,241]);
                const bmiHelp={fr:'IMC/âge : repère de croissance complémentaire, distinct du poids/taille.',en:'BMI for age: an additional growth indicator, distinct from weight-for-height.',ar:'مؤشر كتلة الجسم بالنسبة للعمر مؤشر نمو إضافي يختلف عن الوزن بالنسبة للطول.'}[language];
                const notes=[...shared].map(key=>({value:key==='bmiReportHelp'?bmiHelp:key==='orientationCompleteAssessment'?t('orientationCompleteAssessmentShort')+' : '+t(key):t(key)}));
                const detail=band([cell(usable,notes)]);
                if(y+bandHeight(heading)+bandHeight(detail)>limit)nextPage();
                const top=y;y=drawBand(heading,0,heading.length,y);y=drawBand(detail,0,detail.length,y);closeFragment(top,y);
            }
        }
        const pages=doc.getNumberOfPages();
        for(let i=1;i<=pages;i++){
            doc.setPage(i);doc.setTextColor(65);doc.setFont(font,'normal');doc.setFontSize(8);
            doc.setDrawColor(205,216,210);doc.line(margin,height-14,width-margin,height-14);
            oneLine(legend.notice,width/2,height-10,usable,8.5,false,'center',[65,65,65]);
            const exported=render(t('pdfExported')+' '+issued),confidential=render(t('pdfSensitive'));
            const page=String(i)+' / '+String(pages),size=8.5;
            doc.setFont(font,'normal');doc.setFontSize(size);doc.setTextColor(65);
            const measured=value=>Math.max(doc.getTextWidth(value),doc.getTextWidth(visual(value)));
            const half=usable/2,gap=5,centerHalf=measured(page)/2;
            const common=Math.min(size,size*(half-gap)/Math.max(1,measured(exported)+centerHalf,measured(confidential)+centerHalf));
            doc.setFontSize(common);
            const baseline=height-5.5;
            doc.text(confidential,margin,baseline,{align:'left'});
            doc.text(page,width/2,baseline,{align:'center'});
            doc.text(exported,width-margin,baseline,{align:'right'});
        }
        if(options.print)doc.internal.events.subscribe('putPage',({pageNumber})=>{if(pageNumber===1)doc.internal.write('/AA << /O << /S /Named /N /Print >> >>');});
        return {bytes:doc.output('arraybuffer'),pages,entries:rows.length};
    }
}
if(typeof module!=='undefined'&&module.exports)module.exports={PDFManager};
