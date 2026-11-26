'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PDFManager}=require('../../src/js/services/pdf-manager.js');
const {GrowthEngine}=require('../../src/js/services/growth-engine.js');
const {ClinicalEngine}=require('../../src/js/services/clinical-engine.js');
const {jsPDF}=require('../../src/vendor/pdf/jspdf-4.2.1-til1.umd.min.js');
const {autoTable}=require('../../src/vendor/pdf/autotable-5.0.8.min.js');
const translations=require('../../src/data/interface-translations.json');
const engine=new GrowthEngine(...['who-official','who-2007','who-additional','cdc-growth'].map(name=>require('../../src/data/'+name+'.json')));
const engines=[engine.young,engine.older,engine.additional,engine.cdc];
const fonts=PDFManager.fontPaths.map(name=>fs.readFileSync(path.join(__dirname,'../../src',name)).toString('base64'));
const visit=(offset=0,overrides={})=>engine.calculate({
    name:'Exemple fictif',caseId:'DEMO-REPORT',ageMode:'days',ageDays:450+offset,
    measurementDate:new Date(Date.UTC(2026,0,3+offset)).toISOString().slice(0,10),
    gender:'M',position:'L',weight:8400+offset*10,height:75+offset*.05,oedema:'n',muac:122,
    headCircumference:46,tricepsSkinfold:7.5,subscapularSkinfold:6.2,...overrides
});
const build=(entry,options)=>PDFManager.build([entry],{language:'fr',translations,...options},{jsPDF,autoTable,fonts,now:new Date('2026-11-24T18:00:00Z')});

test('the individual report uses sorted stored visits and breaks the path at suspended measurements',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const first=visit(),latest=visit(80),middle=visit(30,{oedema:'y'});
    const one=PDFManager.reportCharts([first],engines).sections;
    assert.ok(one.pdfGrowthReport.every(panel=>panel.points.length===1));
    assert.deepEqual(one.chartTitle,[]);
    assert.deepEqual(one.additionalZscoreTitle,[]);
    const entries=[latest,middle,first],before=JSON.stringify(entries);
    const charts=PDFManager.reportCharts(entries,engines);
    const trend=charts.sections.chartTitle.find(p=>p.key==='weightForAge');
    assert.deepEqual(trend.points.map(p=>p.value),[first.result.weightForAge.zscore,latest.result.weightForAge.zscore]);
    assert.equal(trend.lines.length,0);
    assert.equal(trend.points[1].day-trend.points[0].day,80);
    assert.equal(JSON.stringify(entries),before);
    const connected=PDFManager.reportCharts([first,latest],engines).sections;
    assert.equal(connected.pdfGrowthReport.find(p=>p.key==='weightForAge').lines.length,1);
    assert.equal(connected.additionalZscoreTitle.length,4);
    const transition=PDFManager.reportCharts([visit(0,{ageDays:718}),visit(30,{ageDays:748,position:'H'})],engines).sections;
    assert.ok(!transition.chartTitle.some(p=>p.key==='heightForAge'));
    assert.ok(transition.chartTitle.some(p=>p.key==='weightForAge'));
});

test('the shared print and export renderer handles A4, independent sections and FR/EN/AR',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const visits=[visit(),visit(31),visit(85,{position:'H',careProtocol:'niger2025'})];
    const charts=PDFManager.reportCharts(visits,engines),entry=visits.at(-1);
    assert.ok(PDFManager.reportSections.slice(1).every(key=>charts.sections[key].length));
    for(const language of ['fr','en','ar']){
        const standard=build(entry,{language});
        assert.equal(standard.pages,1);
        const full=build(entry,{language,charts,sections:PDFManager.reportSections,print:true});
        assert.ok(full.pages>1);
        assert.match(Buffer.from(full.bytes).toString('latin1'),/\/Print/);
    }
    for(let mask=1;mask<2**PDFManager.reportSections.length;mask++){
        const sections=PDFManager.reportSections.filter((_,index)=>mask&(1<<index));
        assert.ok(build(entry,{charts,sections}).pages>=1);
    }
    assert.throws(()=>build(entry,{charts:PDFManager.reportCharts([entry],engines),sections:['chartTitle']}),/pdfInvalid/);
});

test('clinical details, long identity, age modes and many visits fit the A4 export',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const scenarios=[
        visit(0,{headCircumference:'',tricepsSkinfold:'',subscapularSkinfold:''}),
        visit(0,{name:'FICTITIOUS '.repeat(9).trim(),caseId:'CASE-'.repeat(19),careProtocol:'niger2025',
            muac:110,position:'H',oedema:'y',cannotDrink:'y'}),
        visit(0,{ageMode:'totalMonths',ageTotalMonths:14.5}),
        visit(0,{ageMode:'dates',birthDate:'2024-10-10'})
    ];
    for(const [index,entry] of scenarios.entries())for(const language of ['fr','en','ar']){
        assert.equal(build(entry,{language}).pages,1,'Scenario '+(index+1)+' / '+language);
    }
    assert.ok(Math.abs(scenarios[1].result.correctedHeight-scenarios[1].child.height-.7)<1e-8);
    assert.equal(scenarios[1].result.nutrition.orientation,'orientationUrgent');
    const visits=Array.from({length:45},(_,i)=>visit(i*3));
    const charts=PDFManager.reportCharts(visits,engines);
    assert.equal(charts.sections.chartTitle.find(panel=>panel.key==='weightForAge').points.length,visits.length);
    assert.ok(build(visits.at(-1),{charts,sections:PDFManager.reportSections}).pages>=3);
});

test('individual layout preserves identity, localised age and dates, and numeric emphasis',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const entry=visit(0,{name:'',caseId:'DEMO-REPORT',ageMode:'months',ageYears:1,ageMonths:6,ageDays:548});
    const seen=[];
    function TrackingPDF(options){
        const doc=new jsPDF(options),draw=doc.text.bind(doc);
        doc.text=(value,...args)=>{
            for(const part of Array.isArray(value)?value:[value])seen.push({text:String(part),style:doc.getFont().fontStyle,font:doc.getFont().fontName});
            return draw(value,...args);
        };
        return doc;
    }
    TrackingPDF.__bidiEngine__=jsPDF.__bidiEngine__;
    const render=options=>PDFManager.build([entry],{language:'fr',translations,...options},{jsPDF:TrackingPDF,autoTable,fonts,now:new Date('2026-11-24T18:00:00Z')});
    assert.equal(render({}).pages,1);
    assert.ok(seen.some(item=>item.text.includes('Nom/pseudo')));
    assert.ok(seen.some(item=>item.text.includes('Non renseigné')));
    assert.ok(seen.some(item=>item.text.includes('ID dossier')));
    assert.ok(seen.some(item=>item.text.includes('DEMO-REPORT')&&item.style==='bold'));
    assert.ok(seen.some(item=>item.text.includes('1 an 6 mois')&&item.style==='bold'));
    assert.ok(seen.some(item=>item.text.includes('03/01/2026')));
    assert.ok(seen.some(item=>item.text.includes('Calcul:')));
    assert.ok(seen.some(item=>item.text.includes('Moteur Z-score')));
    assert.ok(seen.some(item=>item.font==='helvetica'));
    const before=JSON.stringify(entry);
    seen.length=0;
    const charts=PDFManager.reportCharts([entry],engines);
    const growth=render({charts,sections:['pdfGrowthReport']});
    assert.ok(growth.pages>=1);
    const reference=entry.result.referenceVersion;
    assert.equal(seen.filter(item=>item.text.includes(reference)).length,growth.pages);
    assert.ok(seen.some(item=>item.text==='+3'));
    assert.equal(JSON.stringify(entry),before);
});

test('batch reports keep pending results and do not recalculate',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const entries=Array.from({length:13},(_,i)=>visit(i,{caseId:'BATCH-DEMO-'+i,careProtocol:i===1?'niger2025':'',oedema:i===4?'y':'n'}));
    const pending=entries.map(e=>({child:e.child,result:null})),before=JSON.stringify(entries);
    for(const language of ['fr','en','ar']){
        for(const layout of ['detailed','compact']){
            const result=PDFManager.build(entries,{mode:'batch',layout,language,translations},{jsPDF,autoTable,fonts});
            assert.equal(result.entries,13);assert.ok(result.pages>0&&result.pages<15);assert.ok(result.bytes.byteLength>1000);
            const uncalculated=PDFManager.build(pending,{mode:'batch',layout,language,translations},{jsPDF,autoTable,fonts});
            assert.equal(uncalculated.entries,13);assert.ok(uncalculated.pages>0);
        }
    }
    assert.equal(JSON.stringify(entries),before);
});

test('compact report codes retain every distinct clinical note and deduplicate repeat explanations',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const entries=[visit(),visit(31),visit(60,{oedema:'y'})];
    const model=PDFManager.model(entries,{language:'fr',translations});
    const compact=PDFManager.compact(model),legend=new Map(compact.legend);
    for(let i=0;i<model.rows.length;i++){
        const row=model.rows[i],codes=compact.body[i].at(-1).match(/N\d+/g)||[];
        const decoded=codes.map(code=>legend.get(code));
        for(const note of row.notes)assert.ok(decoded.includes(note));
        assert.ok(compact.body[i].at(-1).includes(model.t('calculatedAt')+' : '+row.calculatedAt));
        assert.ok(!decoded.some(note=>note.includes(row.calculatedAt)));
    }
    assert.equal(new Set(compact.legend.filter(row=>row[0].startsWith('N')).map(row=>row[1])).size,compact.legend.filter(row=>row[0].startsWith('N')).length);
});

test('detailed lot has one horizontal block per child with explicit measures, notes and no annex',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const calculated=visit(0,{caseId:'DETAILED-CALC',careProtocol:'niger2025'});
    const pending={child:{...calculated.child,caseId:'DETAILED-PENDING',ageMode:'dates',birthDate:'2024-05-25',weight:13500,height:92,position:'H'},result:null};
    const pma={child:{...pending.child,caseId:'DETAILED-PMA',ageMode:'pma',ageDays:undefined,postmenstrualDays:252,position:'L'},result:null};
    const entries=[calculated,pending,pma],before=JSON.stringify(entries);
    for(const language of ['fr','en','ar']){
        const calls=[],seen=[],track=(doc,opts)=>{calls.push(opts);return autoTable(doc,opts);};
        function TrackingPDF(options){
            const doc=new jsPDF(options),draw=doc.text.bind(doc);
            doc.text=(value,x,y,opts,...rest)=>{
                for(const line of Array.isArray(value)?value:[value])seen.push({text:String(line),x,y,w:doc.getTextWidth(String(line)),align:opts?.align||'left'});
                return draw(value,x,y,opts,...rest);
            };return doc;
        }
        TrackingPDF.__bidiEngine__=jsPDF.__bidiEngine__;
        const report=PDFManager.build(entries,{mode:'batch',layout:'detailed',language,translations},{jsPDF:TrackingPDF,autoTable:track,fonts,now:new Date('2026-11-25T23:33:36Z')});
        assert.equal(report.entries,3);assert.equal(calls.length,0);
        const model=PDFManager.model(entries,{language,translations}),row=entries.map((e,i)=>PDFManager.detailedRow(e,model.rows[i],model));
        assert.ok(row[1].measures.includes(translations[language].pdfWeightShort));
        assert.ok(row[1].measures.includes(PDFManager.detailedLabels(language).birth));
        assert.ok(!row[1].measures.includes(translations[language].ageMode));
        assert.ok(!row[2].measures.includes(translations[language].unknown+' '+translations[language].pdfDaysUnit));
        assert.ok(row[0].notes.includes(translations[language].headCircumferenceForAge)||row[0].notes.includes(translations[language].additionalResults));
        assert.ok(!row[0].notes.includes(calculated.result.referenceVersion));
        assert.equal(row[1].notes,'—');
        for(const e of entries)assert.equal(seen.filter(v=>v.text.includes(e.child.caseId)).length,1,'one identity '+language);
        const content=seen.filter(v=>v.y>27&&v.y<194);
        for(const v of content){const left=v.x-(v.align==='right'?v.w:v.align==='center'?v.w/2:0);assert.ok(left>=7&&left+v.w<=290,'block within printable width '+language);}
        assert.ok(report.pages<=3);
    }
    assert.equal(JSON.stringify(entries),before);
});

test('export clock follows local date, time and offset without changing stored timestamps',()=>{
    const previous=process.env.TZ,instant=new Date('2026-11-25T23:33:36.157Z');
    try{
        process.env.TZ='Africa/Niamey';
        assert.equal(PDFManager.exportTimestamp(instant,'fr'),'26/11/2026 00:33 UTC+01:00');
        assert.equal(PDFManager.exportFileStamp(instant),'2026-11-26T00-33-36-157+01-00');
        process.env.TZ='Asia/Kathmandu';
        assert.equal(PDFManager.exportTimestamp(instant,'en'),'2026-11-26 05:18 UTC+05:45');
        process.env.TZ='America/New_York';
        assert.equal(PDFManager.exportTimestamp(instant,'en'),'2026-11-25 18:33 UTC-05:00');
        assert.equal(instant.toISOString(),'2026-11-25T23:33:36.157Z');
    }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('both batch layouts use compact margins, aligned heading and two-line footer without overlap',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const entry=visit(),now=new Date('2026-11-25T23:33:36Z');
    for(const language of ['fr','en','ar'])for(const layout of ['detailed','compact'])for(const calculated of [false,true]){
        const entries=[calculated?entry:{child:entry.child,result:null}],seen=[];
        function TrackingPDF(options){
            const doc=new jsPDF(options),draw=doc.text.bind(doc);
            doc.text=(value,x,y,opts,...rest)=>{
                for(const part of Array.isArray(value)?value:[value])seen.push({text:String(part),x,y,align:opts?.align||'left',size:doc.getFontSize(),width:doc.getTextWidth(String(part))});
                return draw(value,x,y,opts,...rest);
            };return doc;
        }
        TrackingPDF.__bidiEngine__=jsPDF.__bidiEngine__;
        const calls=[],track=(doc,opts)=>{calls.push(opts);return autoTable(doc,opts);};
        const report=PDFManager.build(entries,{mode:'batch',layout,language,translations},{jsPDF:TrackingPDF,autoTable:track,fonts,now});
        // Check physical positions even when Arabic glyphs are in visual order.
        const rtl=language==='ar',edge=rtl?289:8,opposite=rtl?8:289;
        const near=(a,b)=>Math.abs(a-b)<.1;
        const brand=seen.find(v=>near(v.y,11)&&near(v.x,rtl?278:19));
        const summary=seen.find(v=>near(v.y,11)&&near(v.x,opposite)&&v.align===(rtl?'left':'right'));
        assert.ok(brand?.text&&summary?.text,'header blocks '+language+' '+layout);
        assert.ok(summary.text.includes('|'),'summary separator '+language);
        if(layout==='compact'){assert.equal(calls[0].margin.left,8);assert.equal(calls[0].margin.right,8);assert.equal(calls[0].margin.bottom,16);}else assert.equal(calls.length,0);
        const methodology=seen.filter(v=>near(v.y,15)&&near(v.x,opposite));
        assert.equal(methodology.length,report.pages,'stored-results statement '+language);
        const notice=seen.filter(v=>near(v.y,200)&&near(v.x,148.5)&&v.align==='center');
        assert.equal(notice.length,report.pages,'single-line clinical footer '+language);
        const percentile=seen.filter(v=>near(v.y,19)&&near(v.x,edge));
        assert.equal(percentile.length,calculated?report.pages:0,'conditional single-line percentile help '+language);
        if(calculated)assert.ok(percentile.every(v=>v.width<=281.1&&v.size>=6),'percentile fits '+language);
        if(!rtl){
            assert.ok(brand.text.includes(translations[language].brand));
            assert.ok(summary.text.includes(translations[language][layout==='compact'?'pdfCompactTitle':'pdfBatchTitle']));
            assert.equal(notice[0].text,translations[language].appUsageNotice);
        }
        const footer=seen.filter(v=>near(v.y,204.5)).slice(0,3);
        assert.equal(footer.length,3,'three footer blocks '+language);
        assert.ok(footer.every(v=>Math.abs(v.size-footer[0].size)<.01&&v.size>=8),'uniform readable footer '+language);
        assert.ok(footer.some(v=>near(v.x,edge)&&v.text.includes('UTC')));
        const pageNumber=footer.find(v=>near(v.x,148.5)&&v.align==='center');
        assert.ok(pageNumber?.text.includes('/'),'centered pagination '+language);
        const confidentiality=footer.find(v=>near(v.x,opposite)&&v.align===(rtl?'left':'right'));
        assert.ok(confidentiality?.text,'edge confidentiality '+language);
        if(!rtl){assert.equal(confidentiality.text,translations[language].pdfSensitive);assert.ok(footer.some(v=>v.text.startsWith(translations[language].pdfExported+' ')));assert.ok(methodology[0].text.includes(PDFManager.detailedLabels(language).stored));}
        const spans=footer.map(v=>{const start=v.x-(v.align==='center'?v.width/2:v.align==='right'?v.width:0);return [start,start+v.width];}).sort((a,b)=>a[0]-b[0]);
        for(let i=1;i<spans.length;i++)assert.ok(spans[i][0]>=spans[i-1][1]-.2,'footer overlap '+language);
    }
});

test('explicit date and time preferences preserve calendar dates and handle zone changes',()=>{
    const instant=new Date('2026-11-25T23:33:36.157Z');
    assert.equal(PDFManager.exportTimestamp(instant,'fr','Africa/Niamey','iso'),'2026-11-26 00:33 UTC+01:00');
    assert.equal(PDFManager.exportTimestamp(instant,'fr','America/New_York','mdy'),'11/25/2026 18:33 UTC-05:00');
    assert.equal(PDFManager.exportFileStamp(instant,'Asia/Kathmandu'),'2026-11-26T05-18-36-157+05-45');
    assert.equal(PDFManager.detailedDate('2024-02-29','fr','mdy'),'02/29/2024');
    assert.equal(PDFManager.detailedDate('2024-02-29','fr','iso'),'2024-02-29');
    assert.equal(PDFManager.validTimeZone('Not/AZone'),false);
    assert.equal(PDFManager.validTimeZone('system'),true);
});

test('horizontal blocks keep calculated and uncalculated lots readable and use fewer pages for short records',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const entries=Array.from({length:13},(_,i)=>visit(i,{caseId:'CARD-'+i,headCircumference:'',tricepsSkinfold:'',subscapularSkinfold:'',careProtocol:i===11?'niger2025':'',oedema:i===4?'y':'n'}));
    for(const language of ['fr','en','ar']){
        const pending=PDFManager.build(entries.map(e=>({child:e.child,result:null})),{mode:'batch',layout:'detailed',language,translations},{jsPDF,autoTable,fonts});
        const calculated=PDFManager.build(entries,{mode:'batch',layout:'detailed',language,translations},{jsPDF,autoTable,fonts});
        assert.ok(pending.pages<7,'pending blocks '+language);
        assert.ok(calculated.pages<13,'calculated blocks '+language+' '+calculated.pages);
    }
});

test('detailed grid shares identity and measures, keeps supplementary scores, and renders generic notes only once',()=>{
    globalThis.ClinicalEngine=ClinicalEngine;
    const first=visit(0,{caseId:'GRID-FIRST'}),second=visit(10,{caseId:'GRID-SECOND'});
    const entries=[first,second].map(e=>({...e,result:{...e.result,imported:true}})),before=JSON.stringify(entries),seen=[];
    function TrackingPDF(options){
        const doc=new jsPDF(options),draw=doc.text.bind(doc);
        doc.text=(value,x,y,opts,...rest)=>{
            for(const part of Array.isArray(value)?value:[value])seen.push({text:String(part),x,y,page:doc.internal.getCurrentPageInfo().pageNumber});
            return draw(value,x,y,opts,...rest);
        };return doc;
    }
    TrackingPDF.__bidiEngine__=jsPDF.__bidiEngine__;
    const report=PDFManager.build(entries,{mode:'batch',layout:'detailed',language:'fr',translations},{jsPDF:TrackingPDF,autoTable,fonts});
    assert.ok(report.pages<=2);
    const heading=seen.find(v=>v.text.startsWith('#1'));
    const weight=seen.find(v=>v.text.startsWith(translations.fr.pdfWeightShort+':'));
    assert.ok(heading&&weight&&heading.page===weight.page&&Math.abs(heading.y-weight.y)<.1&&weight.x>heading.x);
    assert.equal(seen.filter(v=>v.text.startsWith('Résultat importé')).length,3);
    assert.equal(seen.filter(v=>v.text.startsWith('IMC/âge : repère')).length,1);
    assert.equal(seen.filter(v=>v.text===translations.fr.headCircumferenceForAge).length,2);
    assert.ok(seen.some(v=>v.text.includes('Sexe: M')));
    assert.equal(JSON.stringify(entries),before);
});
