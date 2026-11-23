'use strict';
// Synthetic, independently selected boundary/transport cases. Source: docs/references/PCIMA_NIGER_2025.md.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const {ClinicalEngine}=require('../../src/js/services/clinical-engine.js');global.ClinicalEngine=ClinicalEngine;
const {GrowthEngine}=require('../../src/js/services/growth-engine.js');
const {NutritionAssessment:N}=require('../../src/js/services/nutrition-assessment.js');
const {PcimaNiger2025:P}=require('../../src/js/services/pcima-niger-2025.js');
const {HistoryManager:H}=require('../../src/js/services/history-manager.js');global.HistoryManager=H;
const {TransferManager:T}=require('../../src/js/services/transfer-manager.js');
const {EncryptedBackup}=require('../../src/js/services/encrypted-backup.js');
const {CSVManager:CSV}=require('../../src/js/services/csv-manager.js');
const {PDFManager:PDF}=require('../../src/js/services/pdf-manager.js');
const {ReportingExport:R}=require('../../src/js/services/reporting-export.js');
const {WorkspaceApp:App}=require('../../src/js/workspace-app.js');
const translations=json('src/data/interface-translations.json');
const engine=new GrowthEngine(...['who-official','who-2007','who-additional','cdc-growth'].map(n=>json('src/data/'+n+'.json')));
const raw=extra=>({caseId:'FICTIF-2025',name:'FICTIF-2025',measurementDate:'2026-11-23',ageMode:'days',ageDays:365,weight:8500,height:75,gender:'M',position:'L',oedema:'n',growthProfile:'who',careProtocol:'niger2025',muac:130,cannotDrink:'n',vomitsEverything:'n',convulsions:'n',lethargy:'n',acuteProblem:'n',appetite:'good',furtherAssessment:'n',...Object.fromEntries(N.observationsFor({careProtocol:'niger2025'}).map(k=>[k,k==='breastfeeding'?'y':'n'])),...extra});
const assess=(extra={},z=0,waz=0)=>N.assess({...raw(),totalAgeMonths:12,...extra},{weightForHeight:{zscoreRaw:z,flagged:false},weightForAge:{zscoreRaw:waz,flagged:false}});
const infant=extra=>({totalAgeMonths:3,ageDays:90,weight:5000,muac:120,...extra});
const validate=e=>{H.checkChild(e.child);H.checkResult(e.result,new Set([e.child.id]));H.checkPair(e.child,e.result);};

test('2025 is explicit, WHO-only and distinct from 2023; LMS values do not change between care contexts',()=>{
    const entries=['','niger2023','niger2025'].map(careProtocol=>engine.calculate(raw({careProtocol})));
    assert.equal(entries[2].result.nutrition.reference,P.reference);
    assert.notEqual(entries[1].result.nutrition.reference,P.reference);
    for(const key of ClinicalEngine.indicators)for(const e of entries)assert.deepEqual(e.result[key],entries[0].result[key]);
    for(const growthProfile of ['us','intergrowth'])assert.throws(()=>N.normalize(raw({growthProfile})),/pcimaProfileRequired/);
    assert.throws(()=>N.normalize(raw({maternalRisk:true})),/clinicalInputInvalid/);
});
test('young-child 115/125 mm and unrounded -3/-2 boundaries remain unchanged; six/60 months and 3 kg are bounded',()=>{
    for(const [muac,z,category]of [[114.999,0,'nutritionSevere'],[115,0,'nutritionModerateCriteria'],[124.999,0,'nutritionModerateCriteria'],[125,0,'nutritionNoCriteria'],[130,-3.00001,'nutritionSevere'],[130,-3,'nutritionModerateCriteria'],[130,-2.00001,'nutritionModerateCriteria'],[130,-2,'nutritionNoCriteria']])assert.equal(assess({muac},z).category,category);
    assert.equal(assess({totalAgeMonths:5.999,weight:5000,muac:100}).category,'pcimaInfantContext');
    assert.equal(assess({totalAgeMonths:6,weight:2999,muac:100}).category,'pcimaInfantContext');
    assert.equal(assess({totalAgeMonths:6,weight:3000,muac:100}).category,'nutritionSevere');
    assert.equal(assess({totalAgeMonths:60,weight:2900,muac:100}).category,'pcimaOutsideScope');
});
test('MAMI: 110 mm threshold only at >=42 days and <six months, with exact age; it is not infant MAS/admission',()=>{
    for(const [ageDays,muac,label]of [[41,100,'muacAgeUnsupported'],[42,109.999,'pcimaInfantMuacLow'],[42,110,'pcimaInfantMuacNotLow'],[90,114,'pcimaInfantMuacNotLow']]){
        const n=assess(infant({ageDays,totalAgeMonths:ageDays/30.4375,muac}));assert.equal(n.muac,label);assert.equal(n.category,'pcimaInfantContext');assert.notEqual(n.orientation,'orientationInpatient');assert.notEqual(n.orientation,'orientationUrgent');
    }
    for(const ageMode of ['months','totalMonths']){
        const n=assess(infant({ageMode,muac:100}));assert.equal(n.muac,'muacAgeUnsupported');assert(n.reasons.includes('pcimaInfantMuacAgeUncertain'));assert(!n.criteria.includes('pcimaInfantMuacCriterion'));
    }
    assert.equal(assess(infant({totalAgeMonths:6,weight:2900,muac:100})).muac,'muacAgeUnsupported');
    assert.equal(assess(infant({ageMode:'dates',ageDays:42,muac:100})).muac,'pcimaInfantMuacLow');
});
test('MAMI uses valid unrounded WAZ <-2, skips conflicting WHZ in the annex, and does not require position for WAZ',()=>{
    assert(assess(infant({position:''}),-4,-2.00001).criteria.includes('pcimaInfantWazLow'));
    assert(!assess(infant(),-4,-2).criteria.includes('pcimaInfantWazLow'));
    assert(!assess(infant(),-4,0).criteria.some(k=>/Whz/.test(k)));
    for(const weightForAge of [{zscoreRaw:-4,flagged:true},{zscoreRaw:null,flagged:false}]){
        const n=N.assess({...raw(),...infant()},{weightForAge});assert(!n.criteria.includes('pcimaInfantWazLow'));assert(n.missing.includes('weightForAge'));
    }
    const unknown=assess(infant({oedema:''}),0,-4);assert(!unknown.criteria.includes('pcimaInfantWazLow'));assert(unknown.missing.includes('oedema'));
});
test('infant recent loss, oedema or observed acute maternal danger requires urgent assessment; other risks require review',()=>{
    for(const field of ['recentWeightLoss','maternalDanger','oedema'])assert.equal(assess(infant({[field]:'y'})).orientation,'orientationUrgent');
    for(const field of ['maternalRisk','prematureOrLowBirthWeight','feedingDifficulty','poorWeightGain','medicalSocialProblem'])assert.equal(assess(infant({[field]:'y'})).orientation,'pcima2025InfantRiskReview');
    assert.equal(assess(infant({breastfeeding:'n'})).orientation,'pcima2025InfantRiskReview');
    assert(assess(infant({maternalRisk:''})).missing.includes('maternalRisk'));
    assert.equal(assess(infant()).orientation,'pcima2025InfantReview');
});
test('MAM positive risk factors: <24 months, WAZ <-3, PB 115 to <119; contradictory opposite inequality never becomes no-risk',()=>{
    assert(assess({muac:120,totalAgeMonths:23.999}).reasons.includes('pcimaMamAgeRisk'));
    assert(!assess({muac:120,totalAgeMonths:24}).reasons.includes('pcimaMamAgeRisk'));
    assert(assess({muac:120},0,-3.00001).reasons.includes('pcimaMamWazRisk'));
    assert(!assess({muac:120},0,-3).reasons.includes('pcimaMamWazRisk'));
    for(const [muac,positive]of [[115,true],[118.999,true],[119,false],[119.5,false],[124.999,false]]){
        const n=assess({muac,totalAgeMonths:30});assert.equal(n.reasons.includes('pcimaMamMuacRisk'),positive);assert(n.reasons.includes('pcimaMamRiskReview'));assert(!JSON.stringify(n).includes('withoutRisk'));
    }
});
test('MAM observed relapse, prior severe wasting, non-recovery, comorbidity and high-risk context prompt clinical assessment',()=>{
    for(const field of ['previousSevereWasting','moderateRelapse','notRecovering','comorbidity','highRiskContext']){
        const n=assess({muac:120,totalAgeMonths:30,[field]:'y'});assert.equal(n.orientation,'orientationClinicalAssessment');assert(n.reasons.includes('pcima2025Reason'+field[0].toUpperCase()+field.slice(1)));
        assert(assess({muac:120,[field]:''}).missing.includes(field));
    }
    assert.equal(assess({muac:114}).orientation,'pcima2025OutpatientReview');
    assert.notEqual(assess({muac:114,comorbidity:''}).orientation,'pcima2025OutpatientReview');
    assert.notEqual(assess({muac:114,comorbidity:'y'}).orientation,'pcima2025OutpatientReview');
    for(const extra of [infant(),{totalAgeMonths:30},{totalAgeMonths:60}])assert.equal(assess({...extra,convulsions:'y'}).orientation,'orientationUrgent');
});
test('2025 observations/reference survive history validation; tampering and silent reference substitution fail',()=>{
    for(const input of [raw(),raw({ageDays:42,weight:4000,height:55,muac:109,maternalRisk:'y'})]){
        const e=engine.calculate(input),copy=structuredClone(e);validate(e);validate(copy);assert.deepEqual(e,copy);
        copy.child.maternalRisk=copy.child.maternalRisk==='y'?'n':'y';
        if(copy.child.totalAgeMonths<6)assert.throws(()=>H.checkPair(copy.child,copy.result),/importInvalid/);
        copy.result.nutrition.reference='Niger-PCIMA-2023-screening-v1';assert.throws(()=>H.checkPair(copy.child,copy.result),/importInvalid/);
    }
});
test('plain/encrypted fictitious backups round-trip; altered context is rejected without modifying the original',async()=>{
    global.localStorage={};const e=engine.calculate(raw({ageDays:42,weight:4000,height:55,maternalRisk:'y'}));
    const w={version:1,mode:'single',draft:e.child,batchDraft:{},single:e,batch:[],paste:'',stale:false},records=H.emptyArchive();records.sessions.push(new H({}).makeSnapshot(w,'test'));
    const plain=await new T({visitArchive:async visit=>{for(const store of T.stores)for(const value of records[store])visit(store,value);}}).export({language:'ar'});
    const text=await plain.text();assert(text.includes(P.reference));assert.equal((await T.inspect(plain)).validator.counts.sessions,1);
    const enc=await EncryptedBackup.encrypt(plain,'FICTIF-2025-only-password'),dec=await EncryptedBackup.decrypt(enc,'FICTIF-2025-only-password');assert.equal(await dec.text(),text);
    await assert.rejects(T.inspect(new Blob([text.replaceAll('niger2025','niger2023')])));assert.equal(await plain.text(),text);
});
test('CSV appends only new observation columns after the 2023 tail; explicit mapping imports them, with formula escaping',()=>{
    const e=engine.calculate(raw({name:'=FICTIF',maternalRisk:'y'})),rows=[...CSV.rows(CSV.results([e]))],[headers,values]=rows;
    assert.equal(headers[headers.indexOf('mixedMalnutrition')+1],'nutrition_reasons');assert.equal(headers[headers.indexOf('nutrition_reasons')+1],'prematureOrLowBirthWeight');assert.equal(values.length,headers.length);
    assert.equal(values[headers.indexOf('maternalRisk')],'y');assert(values[headers.indexOf('name')].startsWith("'="));
    const fields=['gender','ageMode','ageDays','measurementDate','weight','height','position','oedema','careProtocol','maternalRisk'];
    const c=CSV.parse(fields.join(',')+'\n'+fields.map(k=>e.child[k]).join(','),{extended:true})[0];assert.equal(c.careProtocol,'niger2025');assert.equal(c.maternalRisk,'y');
});
test('FR/EN/AR UI, preview and PDF distinguish 2025 appetite test, observations, help and source',()=>{
    const e=engine.calculate(raw({ageDays:42,weight:4000,height:55,muac:109,maternalRisk:'y'}));
    for(const language of ['fr','en','ar']){
        const app=Object.assign(Object.create(App.prototype),{translations,prefs:{language}}),html=app.formHTML('single',e.child),preview=app.previewDraft(e.child,'single');
        assert(html.includes('value="niger2025" selected'));for(const field of P.extraObservations)assert(html.includes('name="'+field+'"'));
        assert(preview.includes(translations[language].careNiger2025));assert(preview.includes(translations[language].pcima2025AppetitePassed));
        const result=app.nutritionHTML(e.child,e.result),pdf=JSON.stringify(PDF.model([e],{translations,language}));
        assert(result.includes(P.source));assert(result.includes(translations[language].pcima2025Help));assert(!result.includes('>PCIMA Niger · 2023</a>'));
        assert(result.includes(translations[language].screeningTitlePcima2025));assert(!result.includes(translations[language].screeningTitlePcima));
        assert(pdf.includes(P.reference));assert(pdf.includes(translations[language].maternalRisk));assert(pdf.includes(translations[language].pcima2025Help));assert(!pdf.includes(translations[language].pcimaHelp));
    }
});
test('all reachable 2025 labels, missing observations and compact orientations exist in all languages',()=>{
    const keys=new Set([...P.extraObservations,'careNiger2025','pcima2025Help','pcima2025MuacHelp','pcima2025AppetitePassed']);
    const cases=[{},infant(),infant({muac:100}),infant({ageMode:'totalMonths'}),infant({maternalDanger:'y'}),{muac:120},{totalAgeMonths:60},...N.observationsFor({careProtocol:'niger2025'}).map(k=>({[k]:'y'})),...P.extraObservations.map(k=>infant({[k]:'y'}))];
    for(const extra of cases){const n=assess(extra,0,-4);for(const k of [n.category,n.orientation,n.muac,...n.criteria,...n.reasons,...n.missing])keys.add(k);keys.add(n.category+'Short');keys.add(n.orientation+'Short');}
    for(const language of ['fr','en','ar'])for(const k of keys)assert.equal(typeof translations[language][k],'string',language+': '+k);
});
test('browser dependency order and offline manifest include 2025; the adapter itself makes no network/storage operation',()=>{
    const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8'),assets=json('tools/scripts/offline-assets.json');assert(html.indexOf('services/pcima-niger.js')<html.indexOf('services/pcima-niger-2025.js'));assert(html.indexOf('services/pcima-niger-2025.js')<html.indexOf('services/nutrition-assessment.js'));assert(assets.includes('js/services/pcima-niger-2025.js'));
    const context={};context.window=context;context.globalThis=context;vm.createContext(context);for(const file of ['pcima-niger.js','pcima-niger-2025.js','nutrition-assessment.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/js/services',file),'utf8'),context);
    assert.equal(context.NutritionAssessment.assess({...raw(),totalAgeMonths:12},{}).reference,P.reference);
    assert(!/\b(?:fetch|XMLHttpRequest|localStorage|indexedDB)\s*[.(]/.test(fs.readFileSync(path.join(root,'src/js/services/pcima-niger-2025.js'),'utf8')));
});
test('mixed 2023/2025/WHO aggregate requires matching preparatory DHIS2 provenance; no admission/recovery counts are fabricated',()=>{
    const entries=['niger2023','niger2025',''].map(careProtocol=>engine.calculate(raw({careProtocol}))),before=JSON.stringify(entries),report=R.aggregate(entries,'202611');
    assert.equal(report.assessmentReferences.length,3);assert(report.assessmentReferences.includes(P.reference));assert.equal(report.unit,'measurement-rows');assert.equal(report.counts.rows,3);
    const profile={format:'zscore-dhis2-mapping',version:1,unit:'measurement-rows',orgUnit:'A0000000001',dataSet:'A0000000002',mappings:[{metric:'rows',dataElement:'A0000000003',categoryOptionCombo:'A0000000004'}]};
    assert.throws(()=>R.dhis2(report,profile),/reportProtocolMappingRequired/);assert.equal(R.dhis2(report,{...profile,assessmentReferences:report.assessmentReferences}).dataValues[0].value,'3');assert.equal(JSON.stringify(entries),before);
});
