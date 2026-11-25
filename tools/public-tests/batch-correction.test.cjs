'use strict';
// Synthetic row corrections only. Existing numerical oracles remain separate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ClinicalEngine}=require('../../src/js/services/clinical-engine.js');global.ClinicalEngine=ClinicalEngine;
const {HistoryManager}=require('../../src/js/services/history-manager.js');global.HistoryManager=HistoryManager;
const {CSVManager}=require('../../src/js/services/csv-manager.js');global.CSVManager=CSVManager;
const {GrowthEngine}=require('../../src/js/services/growth-engine.js');
const {TransferManager}=require('../../src/js/services/transfer-manager.js');
const {WorkspaceApp}=require('../../src/js/workspace-app.js');
const {LotQuality}=require('../../src/js/services/lot-quality.js');
const json=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'../..',p),'utf8'));
const engine=new GrowthEngine(...['who-official','who-2007','who-additional','cdc-growth'].map(n=>json('src/data/'+n+'.json'))),translations=json('src/data/interface-translations.json');
const input=extra=>({name:'FICTIF-CORRECTION',caseId:'FICTIF-CORRECTION',gender:'M',ageMode:'days',ageDays:365,measurementDate:'2026-10-28',weight:8500,height:75,position:'L',oedema:'n',...extra});
const workspace=entries=>({version:1,mode:'batch',draft:{caseId:'FICTIF-SINGLE-DRAFT'},batchDraft:{caseId:'FICTIF-ADD-DRAFT',weight:'9000'},single:null,batch:entries,paste:'FICTIF CSV waiting',stale:false});
global.localStorage=Object.create(null);
Object.defineProperties(global.localStorage,{getItem:{value:k=>global.localStorage[k]??null},setItem:{value:(k,v)=>{global.localStorage[k]=String(v);}}});
class MemoryHistory {
    constructor(){this.records=HistoryManager.emptyArchive();this.writes=0;}
    async addArchive(records){this.writes++;await this.beforeWrite?.(this.writes);for(const key of TransferManager.stores)this.records[key].push(...structuredClone(records[key]));}
    async readArchive(){return structuredClone(this.records);}
    async visitArchive(visit){for(const key of TransferManager.stores)for(const row of this.records[key])visit(key,structuredClone(row));}
}
function ui(state,draft,store=new MemoryHistory()){
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{state,engine,history:new HistoryManager(store),prefs:{language:'fr'},translations,saving:Promise.resolve(),page:'batch'});
    app.batchCorrection={workspace:state,index:0,entry:state.batch[0],draft};
    const buttons=[{disabled:false}],form={inert:false},progress={textContent:''},dialog={querySelectorAll:()=>buttons,setAttribute(){},removeAttribute(){},close(){app.closed=true;}};
    const before=global.document;global.document={getElementById:id=>({'workspace-dialog':dialog,'correction-form':form,'correction-progress':progress}[id])};
    app.readBatchCorrection=()=>{};app.updateSaveStatus=()=>{};app.checkpoint=()=>{};
    app.formError=(prefix,key)=>{app.error={prefix,key};};app.render=id=>{app.focus=id;};app.toast=(key,error)=>{app.notice={key,error};};
    return {app,store,form,buttons,restore:()=>{global.document=before;}};
}

test('a queued close event cannot clear a reopened correction or import dialog; a real close releases its state',()=>{
    const context={draft:{weight:'9000'}},prepared={format:'stream'},password={value:'FICTIF-PASSWORD'},dialog={open:true},before=global.document,released=[];
    global.document={getElementById:()=>dialog,querySelectorAll:()=>[password]};
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{batchCorrection:context,preparedImport:prepared,encryptedPending:{name:'FICTIF'},transfers:()=>({release:x=>released.push(x)})});
    try{
        app.workspaceDialogClosed();assert.equal(app.batchCorrection,context);assert.equal(app.preparedImport,prepared);assert.equal(password.value,'FICTIF-PASSWORD');assert.equal(released.length,0);
        dialog.open=false;app.workspaceDialogClosed();assert.equal(app.batchCorrection,null);assert.equal(app.preparedImport,null);assert.equal(app.encryptedPending,null);assert.equal(password.value,'');assert.deepEqual(released,[prepared]);
    }finally{global.document=before;}
});

test('dialog Tab and Shift-Tab cycle through visible enabled controls without sending focus into hidden or inert form fields',()=>{
    const first={tabIndex:0,getClientRects:()=>[{}],closest:()=>null,focus(){focused=first;}},last={...first,focus(){focused=last;}};
    const hidden={...first,getClientRects:()=>[]},disabled={...first,disabled:true},inert={...first,closest:()=>({})},negative={...first,tabIndex:-1};
    const dialog={open:true,querySelectorAll:()=>[first,hidden,disabled,inert,negative,last]},before=global.document;let focused,prevented;
    const app=Object.create(WorkspaceApp.prototype);global.document={getElementById:()=>dialog,activeElement:last};
    const event=extra=>({key:'Tab',preventDefault(){prevented=true;},...extra});
    try{
        app.workspaceDialogKey(event());assert.equal(focused,first);assert.equal(prevented,true);
        global.document.activeElement=first;focused=null;prevented=false;app.workspaceDialogKey(event({shiftKey:true}));assert.equal(focused,last);assert.equal(prevented,true);
        focused=null;prevented=false;app.workspaceDialogKey(event());assert.equal(focused,null);assert.equal(prevented,false);
        dialog.open=false;app.workspaceDialogKey(event({shiftKey:true}));assert.equal(focused,null);assert.equal(prevented,false);
    }finally{global.document=before;}
});

test('correction changes one row only, preserves the visit and add draft, and creates a fresh result/version',()=>{
    const first=engine.calculate(input()),other=engine.calculate(input({caseId:'FICTIF-OTHER'}));first.result.imported=true;
    const state=workspace([first,other]),before=JSON.stringify(state),next=WorkspaceApp.correctedBatch(state,0,{...first.child,weight:9000,visitId:'untrusted-replacement'},engine);
    assert.equal(JSON.stringify(state),before);assert.deepEqual(next.batch[1],other);
    for(const key of ['draft','batchDraft','single','paste','mode','stale'])assert.deepEqual(next[key],state[key]);
    assert.equal(next.batch.length,2);assert.equal(next.batch[0].child.weight,9000);
    assert.equal(next.batch[0].child.visitId,first.child.visitId);assert.notEqual(next.batch[0].child.id,first.child.id);assert.notEqual(next.batch[0].result.id,first.result.id);
    assert.equal(next.batch[0].result.imported,undefined);assert.notEqual(next.batch[0].result.weightForAge.zscoreRaw,first.result.weightForAge.zscoreRaw);
    HistoryManager.checkWorkspace(next);assert.equal(next.version,1);
});

test('invalid row indices and invalid measures never mutate a lot or generate a partially corrected result',()=>{
    const state=workspace([engine.calculate(input())]),before=JSON.stringify(state);
    for(const index of [-1,1,0.5,NaN,'0'])assert.throws(()=>WorkspaceApp.correctedBatch(state,index,{},engine),/batchCorrectionChanged/);
    assert.throws(()=>WorkspaceApp.correctedBatch(state,0,{weight:'invalid'},engine),/weightInvalid/);
    assert.equal(JSON.stringify(state),before);
});

test('correction keeps an explicit WHO, CDC or postnatal profile and recomputes its context without assigning unknown ages',()=>{
    const inputs=[input(),input({growthProfile:'us',ageMode:'months',ageYears:3,ageMonths:0,weight:14000,height:95,position:'H'}),
        input({growthProfile:'intergrowth',ageMode:'pma',postmenstrualDays:224,ageDays:'',weight:1600,height:42,headCircumference:29}),
        input({growthProfile:'intergrowth',ageMode:'days',ageDays:14,gestationalAgeWeeks:30,gestationalAgeDays:0,weight:1600,height:42,headCircumference:29})];
    for(const raw of inputs){
        const original=engine.calculate(raw),next=WorkspaceApp.correctedBatch(workspace([original]),0,{...original.child,growthProfile:raw.growthProfile||'who',height:raw.height+1},engine),e=next.batch[0];
        assert.equal(e.result.referenceFamily,original.result.referenceFamily);assert.equal(e.child.visitId,original.child.visitId);HistoryManager.checkWorkspace(next);
        if(raw.ageMode==='pma'){assert.equal(e.child.ageDays,null);assert.equal(e.result.intergrowthContext.age.birthGestationDays,null);}
        if(raw.growthProfile==='intergrowth'){assert.equal(e.result.weightForHeight.zscore,null);assert.equal(e.result.bmi,null);}
    }
});

test('lot review accepts valid completed-month input strings without hiding missing or invalid age parts',()=>{
    const original=engine.calculate(input({growthProfile:'us',ageMode:'months',ageYears:2,ageMonths:0,position:'H',weight:12300,height:87}));
    const corrected=WorkspaceApp.correctedBatch(workspace([original]),0,{ageYears:'2',ageMonths:'0',weight:'12400'},engine).batch[0];
    assert.equal(LotQuality.build([corrected]).counts.qualityAgeUnusable,0);
    for(const ageYears of ['', ' ', null, undefined, false, {}, '-1', '2.5', 'invalid', Infinity]){
        const e=structuredClone(corrected);e.child.ageYears=ageYears;assert.equal(LotQuality.build([e]).counts.qualityAgeUnusable,1);
    }
    for(const ageMonths of ['', ' ', null, false, '12', '-1', '0.5']){
        const e=structuredClone(corrected);e.child.ageMonths=ageMonths;assert.equal(LotQuality.build([e]).counts.qualityAgeUnusable,1);
    }
});

test('validation, pre-save and corrected-save failures keep the live row, other rows and correction draft available',async()=>{
    for(const failure of ['validation','before','after']){
        const state=workspace([engine.calculate(input()),engine.calculate(input({caseId:'FICTIF-OTHER'}))]),before=JSON.stringify(state);
        const h=ui(state,{...state.batch[0].child,weight:failure==='validation'?'invalid':9000});
        h.store.beforeWrite=n=>{if(n===(failure==='before'?1:failure==='after'?2:0))throw Error('storageFull');};
        const warn=console.warn,warnings=[];console.warn=(...args)=>warnings.push(args);
        try{
            await h.app.saveBatchCorrection();assert.equal(JSON.stringify(h.app.state),before);assert.equal(h.app.closed,undefined);assert.ok(h.app.batchCorrection);
            assert.equal(h.app.batchCorrection.draft.weight,failure==='validation'?'invalid':9000);
            assert.equal(h.app.error.prefix,'correction');assert.equal(h.app.error.key,failure==='validation'?'weightInvalid':'storageFull');
            assert.equal(h.form.inert,false);assert.equal(h.buttons[0].disabled,false);
            assert.equal(h.store.records.sessions.length,failure==='after'?1:0);
            if(failure==='after')assert.equal(h.store.records.sessions[0].metadata.workspace.batch[0].child.weight,8500);
            assert.equal(warnings.length,failure==='before'?1:0);if(warnings.length)assert.equal(warnings[0][1].message,'storageFull');
        }finally{console.warn=warn;h.restore();}
    }
});

test('a workspace replacement during the pre-save prevents the correction from touching the new work',async()=>{
    const state=workspace([engine.calculate(input())]),other=workspace([engine.calculate(input({caseId:'FICTIF-NEW-WORK',weight:10000}))]),before=JSON.stringify(other);
    const h=ui(state,{weight:9000});h.store.beforeWrite=n=>{if(n===1)h.app.state=other;};
    try{
        await h.app.saveBatchCorrection();assert.equal(JSON.stringify(h.app.state),before);assert.equal(h.store.records.sessions.length,1);
        assert.equal(h.app.notice.key,'batchCorrectionChanged');assert.equal(h.app.closed,undefined);
    }finally{h.restore();}
});

test('a correction becomes visible only after both durable saves, and repeated clicks cannot duplicate it',async()=>{
    const state=workspace([engine.calculate(input())]),before=JSON.stringify(state),h=ui(state,{...state.batch[0].child,weight:9000});
    let unlock,started;const writing=new Promise(resolve=>{started=resolve;});h.store.beforeWrite=n=>n===2?new Promise(resolve=>{unlock=resolve;started();}):undefined;
    try{
        const pending=h.app.saveBatchCorrection();await writing;
        assert.equal(JSON.stringify(h.app.state),before);assert.equal(h.app.batchCorrection.busy,true);assert.equal(h.form.inert,true);assert.equal(h.buttons[0].disabled,true);
        await h.app.saveBatchCorrection();assert.equal(h.store.writes,2);
        unlock();await pending;
        assert.equal(h.app.state.batch[0].child.weight,9000);assert.equal(h.store.records.sessions.length,2);
        assert.deepEqual(h.store.records.sessions.map(s=>s.metadata.reason),['beforeBatchCorrection','correctedBatch']);
        assert.equal(h.app.batchCorrection,null);assert.equal(h.app.closed,true);assert.equal(h.app.focus,'batch-correct-0');assert.equal(h.app.notice.key,'batchOtherFieldsSaved');assert.equal(h.app.state.batch[0].result,null);
    }finally{h.restore();}
});

test('historical originals survive correction, follow-up selects the corrected visit once, and current backup round-trips both versions',async()=>{
    const original=engine.calculate(input()),state=workspace([original]),next=WorkspaceApp.correctedBatch(state,0,{weight:9000},engine);
    original.result.calculatedAt='2026-10-28T10:00:00.000Z';next.batch[0].result.calculatedAt='2026-10-28T11:00:00.000Z';
    const store=new MemoryHistory(),history=new HistoryManager(store);await history.save(state,'beforeBatchCorrection',true);await history.save(next,'correctedBatch',true);
    const visits=await history.caseVisits(original.child.caseId,original.child.gender);
    assert.equal(visits.entries.length,1);assert.equal(visits.entries[0].child.weight,9000);assert.equal(store.records.sessions[0].metadata.workspace.batch[0].child.weight,8500);
    const file=await new TransferManager(store).export({language:'fr'}),sessions=[];
    const decoded=await TransferManager.inspect(file,(_,line)=>{const e=HistoryManager.parse(line);if(e.kind==='record'&&e.store==='sessions')sessions.push(e.record);});
    assert.equal(decoded.validator.counts.sessions,2);assert.deepEqual(sessions.map(s=>s.metadata.workspace.batch[0].child.weight),[8500,9000]);
    for(const s of sessions)HistoryManager.checkWorkspace(s.metadata.workspace);
});

test('correction actions use absolute row indices, translated labels and escaped identities, and never enter read-only tables or exports',()=>{
    const e=engine.calculate(input({name:'<FICTIF>'}));
    for(const language of ['fr','en','ar']){
        const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations});
        const html=app.tableHTML([e],{compact:true,editable:true,offset:8});
        assert.ok(html.includes('id="batch-correct-8"'));assert.ok(html.includes('data-index="8"'));assert.ok(html.includes(translations[language].batchCorrectionEdit));
        assert.ok(!html.includes('<FICTIF>'));assert.ok(html.includes('&lt;FICTIF&gt;'));
        assert.ok(!app.tableHTML([e]).includes('data-action="batch-correct"'));
        for(const key of ['batchCorrectionTitle','batchCorrectionHelp','batchCorrectionApply','batchCorrectionSaved','batchCorrectionChanged','beforeBatchCorrection','correctedBatch'])assert.ok(translations[language][key]);
    }
    assert.ok(!CSVManager.results([e]).includes('batch-correct'));
    const second=engine.calculate(input());assert.equal(LotQuality.build([e,second]).counts.qualityDuplicateMeasures,2);
    const corrected=WorkspaceApp.correctedBatch(workspace([e,second]),0,{weight:9000},engine);assert.equal(LotQuality.build(corrected.batch).counts.qualityDuplicateMeasures,0);
});

test('display unit conversions are exact and never mutate stored measurements; inline corrections preserve pending state',()=>{
    const original=engine.calculate(input()),pending={child:original.child,result:null},state=workspace([pending,original]),before=JSON.stringify(state);
    assert.equal(WorkspaceApp.batchDisplayMeasure(13500,'weight','kg'),13.5);
    assert.equal(WorkspaceApp.batchDisplayMeasure(92,'height','m'),0.92);
    assert.equal(WorkspaceApp.batchDisplayMeasure(null,'height','m'),null);
    const next=WorkspaceApp.inlineCorrectedBatch(state,0,'weight','9,5','kg',engine);
    assert.equal(next.batch[0].child.weight,9500);assert.equal(next.batch[0].result,null);
    assert.deepEqual(next.batch[1],original);assert.equal(next.batch[0].child.visitId,original.child.visitId);
    const calculated=WorkspaceApp.inlineCorrectedBatch(state,1,'height','0.76','m',engine);
    assert.equal(calculated.batch[1].child.height,76);assert.ok(calculated.batch[1].result);assert.deepEqual(calculated.batch[0],pending);
    assert.equal(JSON.stringify(state),before);assert.throws(()=>WorkspaceApp.inlineCorrectedBatch(state,0,'weight','bad','kg',engine));
    for(const language of ['fr','en','ar']){
        const app=Object.assign(Object.create(WorkspaceApp.prototype),{state,prefs:{language},translations,batchWeightUnit:'kg',batchHeightUnit:'m'});
        const html=app.batchRecordsHTML([pending],[0]);assert.ok(html.includes('data-field="weight"'));assert.ok(html.includes(translations[language].birthDate));assert.ok(html.includes(translations[language].position));
        const table=app.tableHTML([pending],{compact:true,editable:true,indices:[0]});assert.ok(table.includes('data-batch-unit="weight"'));assert.ok(table.includes('data-field="height"'));
        assert.ok(!app.tableHTML([pending]).includes('data-batch-unit'));
    }
});

test('compact records merge pending scores with measures and KPI filters use original indices, not page indices',()=>{
 const base=engine.calculate(input()),entries=Array.from({length:20},(_,i)=>({child:{...base.child,caseId:'TEST-'+i,name:'TEST-'+i},result:i===11?{...base.result,nutrition:{...base.result.nutrition,category:'nutritionSevere'}}:i===14?{...base.result,nutrition:{...base.result.nutrition,category:'nutritionModerateCriteria'}}:null}));
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{state:workspace(entries),prefs:{language:'fr'},translations,batchPage:0});
 const before=JSON.stringify(app.state),html=app.batchRecordsHTML([entries[0]],[0]);
 assert.ok(!html.includes('batch-record-results'));assert.ok(!html.includes('batch-record-toolbar'));assert.ok(html.includes('batch-record-id-date'));
 assert.ok(html.includes('data-field="measurementDate"'));assert.ok(html.includes('Longueur /\ntaille (cm)'));
 assert.equal((html.match(/class="batch-record-field batch-record-score"/g)||[]).length,4);
 app.batchFilter='nutritionSevere';assert.deepEqual(app.batchDisplayView().indices,[11]);
 app.batchFilter='nutritionModerateCriteria';assert.deepEqual(app.batchDisplayView().indices,[14]);
 app.batchFilter='quality';assert.equal(app.batchDisplayView().total,LotQuality.build(entries).signalledRows);
 app.batchFilter='all';assert.equal(app.batchDisplayView().total,20);
 assert.equal(JSON.stringify(app.state),before);
});

test('specialized other-fields dialog omits inline values, retains conditional fields and never recalculates',()=>{
 const original=engine.calculate(input({careProtocol:'niger2025',headCircumference:48})),other=engine.calculate(input({caseId:'FICTIF-OTHER'})),state=workspace([original,other]),before=JSON.stringify(state);
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language:'fr'},translations,state});
 const draft={...app.emptyDraft('who'),...original.child,growthProfile:'who'};
 const context={entry:original,draft,initialDraft:structuredClone(draft),units:{weight:'kg',height:'m'}};
 const html=app.batchOtherFieldsHTML(context);
 for(const k of ['name','caseId','measurementDate','weight','height','gender','muac','oedema','ageDays'])assert.ok(!html.includes('name="'+k+'"'),k);
 for(const k of ['ageMode','growthProfile','careProtocol','headCircumference','tricepsSkinfold','subscapularSkinfold','oedemaGrade','cannotDrink','appetite','maternalDanger','highRiskContext','displayWeightUnit','displayHeightUnit'])assert.ok(html.includes('name="'+k+'"'),k);
 assert.equal(WorkspaceApp.otherFieldsChanged(context),false);
 const changed=WorkspaceApp.correctionAgeChange(draft,'dates',original.child);assert.equal(changed.birthDate,'');
 assert.ok(app.batchOtherFieldsHTML({...context,draft:changed}).includes('name="birthDate"'));
 const noCalc={constructor:engine.constructor,calculate(){throw Error('must not calculate');}};
 const next=WorkspaceApp.pendingBatchCorrection(state,0,{...draft,feedingDifficulty:'y'},noCalc);
 assert.equal(next.batch[0].result,null);assert.equal(next.batch[0].child.feedingDifficulty,'y');assert.equal(next.batch[0].child.weight,original.child.weight);assert.equal(next.batch[0].child.visitId,original.child.visitId);assert.deepEqual(next.batch[1],other);assert.equal(JSON.stringify(state),before);
 app.batchUnitsByVisit=new Map([[original.child.visitId,{weight:'kg',height:'m'}]]);
 assert.equal(app.batchUnit('weight',original.child),'kg');assert.equal(app.batchUnit('weight',other.child),'g');
 const row=app.batchRecordsHTML([original],[0]);assert.ok(!row.includes('data-action="quality-view"'));assert.ok(row.includes('data-action="batch-correct"'));assert.ok(row.includes('Poids (kg)'));
});
test('unchanged other-fields dialog saves display units only and keeps historical scores',async()=>{
 const original=engine.calculate(input()),state=workspace([original]),h=ui(state,{...original.child});
 h.app.batchCorrection.initialDraft=structuredClone(h.app.batchCorrection.draft);h.app.batchCorrection.units={weight:'kg',height:'m'};
 try{await h.app.saveBatchCorrection();assert.equal(h.store.writes,0);assert.equal(h.app.state,state);assert.equal(h.app.state.batch[0].result,original.result);assert.equal(h.app.batchUnit('height',original.child),'m');assert.equal(h.app.notice.key,'batchDisplaySaved');}finally{h.restore();}
});

test('preterm contextual editor always shows the applicable PMA or birth gestation and preserves an explicitly recorded age',()=>{
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language:'fr'},translations});
 for(const mode of ['pma','days']){
  const entry=engine.calculate(input({growthProfile:'intergrowth',ageMode:mode,postmenstrualDays:mode==='pma'?224:'',ageDays:mode==='days'?14:'',gestationalAgeWeeks:mode==='days'?30:'',gestationalAgeDays:mode==='days'?0:'',weight:1600,height:42,headCircumference:29}));
  const html=app.batchOtherFieldsHTML({entry,draft:entry.child,units:{weight:'g',height:'cm'}});
  assert.ok(html.includes('name="'+(mode==='pma'?'postmenstrualDays':'gestationalAgeWeeks')+'"'));
  assert.ok(!html.includes('name="tricepsSkinfold"'));
 }
});

test('compact screening filters cover every stored category and notes stay below identity, without modifying scores',()=>{
 const entry=engine.calculate(input()),categories=['nutritionModerateCriteria','nutritionSevere','nutritionNoCriteria','nutritionIncomplete','nutritionAgeUnsupported','intergrowthNoScreening'];
 const entries=[{child:entry.child,result:null},...categories.map(category=>({child:entry.child,result:{...entry.result,nutrition:{...entry.result.nutrition,category}}}))];
 entries[1].result.imported=true;entries[1].result.warnings=['estimatedAge','oedemaWarning'];
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{state:workspace(entries),prefs:{language:'fr'},translations,batchPage:0});
 const before=JSON.stringify(app.state),options=app.batchKpiOptions();
 assert.deepEqual(options.map(k=>k.key),['pending',...categories]);assert.ok(options.every(k=>k.count===1));
 const filters=app.batchKpisHTML();assert.ok(!filters.includes('data-value="quality"'));assert.ok(filters.includes('data-value="all"'));
 for(const [i,key] of ['pending',...categories].entries()){app.batchFilter=key;assert.deepEqual(app.batchDisplayView().indices,[i]);}
 const html=app.batchRecordsHTML([entries[1]],[1]);
 const notes=html.indexOf('class="batch-record-notes"'),body=html.indexOf('class="batch-record-body"');
 assert.ok(notes>html.indexOf('class="batch-record-person"')&&notes<body);
 assert.ok(html.slice(notes,body).includes(app.esc(app.t('oedemaWarning'))));
 assert.ok(html.includes('Œdèmes bilatéraux\nau godet'));
 assert.equal(JSON.stringify(app.state),before);
});

test('compact contextual dialog places escaped identity, accessible SVG actions and help in header; retains conditional groups in all languages',()=>{
 const entry=engine.calculate(input({name:'<TEST>',careProtocol:'niger2025'}));
 for(const language of ['fr','en','ar']){
  const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations});
  const context={entry,draft:entry.child,units:{weight:'g',height:'cm'}},html=app.batchCorrectionDialogHTML(context);
  const top=html.slice(0,html.indexOf('<div class="dialog-body"'));
  assert.ok(top.includes('id="dialog-title"'));assert.ok(top.includes('&lt;TEST&gt;'));assert.ok(!top.includes('<TEST>'));
  assert.ok(top.indexOf('other-fields-help')<top.indexOf('id="dialog-title"'));
  assert.ok(top.indexOf('data-action="save-batch-correction"')<top.indexOf('data-action="close-dialog"'));
  assert.equal((html.match(/data-action="save-batch-correction"/g)||[]).length,1);
  assert.equal((html.match(/data-action="close-dialog"/g)||[]).length,1);
  assert.ok(top.includes('aria-label="'+app.esc(app.t('batchSaveChanges'))+'"'));assert.ok(top.includes('<svg'));
  assert.ok(!html.includes('class="toolbar"'));assert.ok(!html.slice(top.length).includes(app.esc(app.t('batchOtherFieldsHelp'))));
  for(const kind of ['references','age','units','supplements','clinical'])assert.ok(html.includes('other-fields-'+kind));
  assert.ok(html.includes('id="correction-progress"'));assert.ok(html.includes('id="correction-error"'));assert.ok(html.includes('name="maternalDanger"'));
 }
});
