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
    for(const entry of scenarios)for(const language of ['fr','en','ar'])assert.equal(build(entry,{language}).pages,1);
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
