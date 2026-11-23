'use strict';
// Synthetic cases. Source/page mapping and excluded clinical acts: PCIMA_NIGER_2023.md.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ClinicalEngine}=require('../../src/js/services/clinical-engine.js');global.ClinicalEngine=ClinicalEngine;
const {GrowthEngine}=require('../../src/js/services/growth-engine.js');
const {NutritionAssessment:N}=require('../../src/js/services/nutrition-assessment.js');
const {PcimaNiger:P}=require('../../src/js/services/pcima-niger.js');
const {HistoryManager:H}=require('../../src/js/services/history-manager.js');global.HistoryManager=H;
const {TransferManager}=require('../../src/js/services/transfer-manager.js');
const {EncryptedBackup}=require('../../src/js/services/encrypted-backup.js');
const {CSVManager:CSV}=require('../../src/js/services/csv-manager.js');
const {PDFManager:PDF}=require('../../src/js/services/pdf-manager.js');
const {WorkspaceApp:App}=require('../../src/js/workspace-app.js');
const {ReportingExport}=require('../../src/js/services/reporting-export.js');
const root=path.resolve(__dirname,'../..'),json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const engine=new GrowthEngine(...['who-official','who-2007','who-additional','cdc-growth'].map(n=>json('src/data/'+n+'.json')));
const translations=json('src/data/interface-translations.json');
const raw=extra=>({caseId:'FICTIF-PCIMA',name:'FICTIF-PCIMA',measurementDate:'2026-11-23',ageMode:'totalMonths',ageTotalMonths:12,weight:8500,height:75,gender:'M',position:'L',oedema:'n',growthProfile:'who',careProtocol:'niger2023',...extra});
const observed=extra=>raw({muac:114,cannotDrink:'n',vomitsEverything:'n',convulsions:'n',lethargy:'n',acuteProblem:'n',appetite:'good',furtherAssessment:'n',feedingDifficulty:'n',recentWeightLoss:'n',poorWeightGain:'n',medicalSocialProblem:'n',mixedMalnutrition:'n',...extra});
const assess=(extra={},z=0)=>N.assess({...observed(extra),totalAgeMonths:extra.totalAgeMonths??12},{weightForHeight:{zscoreRaw:z,flagged:false}});
const validate=e=>{H.checkChild(e.child);H.checkResult(e.result,new Set([e.child.id]));H.checkPair(e.child,e.result);};
const workspace=e=>({version:1,mode:'single',draft:e.child,batchDraft:{},single:e,batch:[],paste:'',stale:false});

test('PCIMA 2023 is opt-in; historical WHO v1 assessments stay byte-for-byte identical to the prepared baseline',()=>{
    const fixture=json('tools/verification/nutrition-who-v1.json');
    for(const c of fixture.cases)assert.deepEqual(N.assess(c.child,c.result),c.expected);
    const implicit=engine.calculate(raw({careProtocol:''})),explicit=engine.calculate(raw());
    assert.equal(implicit.result.nutrition.reference,'WHO-wasting-2023-B1-B2');assert.equal(explicit.result.nutrition.reference,P.reference);
    for(const key of ClinicalEngine.indicators)assert.deepEqual(implicit.result[key],explicit.result[key]);
    assert.equal(implicit.result.correctedHeight,explicit.result.correctedHeight);
});
test('tables I and XI: OR criteria, exact 115/125 mm and unrounded -3/-2 boundaries',()=>{
    for(const [pb,z,expected]of [[114.999,0,'nutritionSevere'],[115,0,'nutritionModerateCriteria'],[124.999,0,'nutritionModerateCriteria'],[125,0,'nutritionNoCriteria'],[130,-3.00001,'nutritionSevere'],[130,-3,'nutritionModerateCriteria'],[130,-2.00001,'nutritionModerateCriteria'],[130,-2,'nutritionNoCriteria']])assert.equal(assess({muac:pb},z).category,expected);
    assert.equal(assess({muac:120},0).category,'nutritionModerateCriteria');
    assert.equal(assess({muac:130},-2.5).category,'nutritionModerateCriteria');
});
test('oedema takes precedence; flagged, missing or assumed-position P/T cannot establish a national criterion',()=>{
    const n=assess({oedema:'y',oedemaGrade:'3',muac:130});assert.equal(n.category,'nutritionSevere');assert.equal(n.orientation,'orientationInpatient');
    for(const wh of [{zscoreRaw:-4,flagged:true},{zscoreRaw:null,flagged:false},{}])assert.equal(N.assess({...observed({muac:130}),totalAgeMonths:12},{weightForHeight:wh}).category,'nutritionIncomplete');
    const assumed=assess({position:'',muac:130},-4);assert.equal(assumed.category,'nutritionIncomplete');assert(!assumed.criteria.includes('criterionWhzSevere'));assert(assumed.missing.includes('position'));
    assert.equal(assess({position:'',muac:114},-4).category,'nutritionSevere');
});
test('unknown oedema or clinical observations never become absent; moderate/good appetite alone cannot admit',()=>{
    const n=assess({oedema:'',feedingDifficulty:'',mixedMalnutrition:''});assert(n.missing.includes('oedema'));assert(n.missing.includes('mixedMalnutrition'));assert.notEqual(n.orientation,'pcimaOutpatientReview');
    assert.equal(assess().orientation,'pcimaOutpatientReview');
    for(const [key,value] of [['furtherAssessment','y'],['appetite','poor'],['acuteProblem','y'],['recentWeightLoss','y'],['feedingDifficulty','y'],['poorWeightGain','y'],['medicalSocialProblem','y']])assert.notEqual(assess({[key]:value}).orientation,'pcimaOutpatientReview');
});
test('chapter V: <6 months and >=6 months weighing <3 kg use the infant pathway without young-child MUAC thresholds',()=>{
    for(const extra of [{totalAgeMonths:5.999,weight:5000},{totalAgeMonths:6,weight:2999.999},{totalAgeMonths:12,weight:2900}]){
        const n=assess({...extra,muac:100});assert.equal(n.category,'pcimaInfantContext');assert.equal(n.muac,'muacAgeUnsupported');assert(!n.criteria.includes('criterionMuacSevere'));assert.notEqual(n.orientation,'pcimaOutpatientReview');
    }
    assert.equal(assess({totalAgeMonths:6,weight:3000}).category,'nutritionSevere');
    assert.equal(assess({totalAgeMonths:60,weight:2900}).category,'pcimaOutsideScope');
});
test('infant feeding, loss, stagnation, oedema and medical/social risks prompt review without an automatic MAS or recovery label',()=>{
    const infant={totalAgeMonths:3,muac:100,breastfeeding:'y'};
    assert.equal(assess(infant).orientation,'pcimaInfantReview');
    for(const extra of [{feedingDifficulty:'y'},{recentWeightLoss:'y'},{poorWeightGain:'y'},{medicalSocialProblem:'y'},{oedema:'y',oedemaGrade:'1'},{appetite:'poor'}]){const n=assess({...infant,...extra});assert.equal(n.orientation,'pcimaInfantRiskReview');assert.equal(n.category,'pcimaInfantContext');}
    assert(assess({...infant,breastfeeding:''}).missing.includes('breastfeeding'));
});
test('mixed malnutrition is a clinician observation, not inferred from a suppressed weight score; danger always wins',()=>{
    const mixed=assess({mixedMalnutrition:'y',oedema:'y',oedemaGrade:'1'});assert(mixed.reasons.includes('pcimaMixedPresent'));assert.equal(mixed.orientation,'orientationInpatient');
    assert.throws(()=>engine.calculate(raw({mixedMalnutrition:'y',oedema:'n'})),/pcimaMixedConflict/);
    assert.equal(assess({oedema:'y',oedemaGrade:'1',mixedMalnutrition:''}).reasons.includes('pcimaMixedPresent'),false);
    for(const extra of [{},{totalAgeMonths:3},{totalAgeMonths:60}])assert.equal(assess({...extra,convulsions:'y'}).orientation,'orientationUrgent');
});
test('invalid protocol, non-WHO profile and non-observation values are rejected before calculation',()=>{
    for(const extra of [{careProtocol:'niger2025'},{careProtocol:'simplified'},{feedingDifficulty:true},{breastfeeding:'yes'},{mixedMalnutrition:1}])assert.throws(()=>engine.calculate(raw(extra)));
    for(const profile of ['us','intergrowth'])assert.throws(()=>N.normalize(raw({growthProfile:profile})),/pcimaProfileRequired/);
    assert.equal(N.normalize(raw({recentWeightLoss:'n'})).recentWeightLoss,'n');
});
test('saved national assessments round-trip without recomputation, and altered reference or observations fail pair validation',()=>{
    const e=engine.calculate(observed());validate(e);const restored=JSON.parse(JSON.stringify(e));validate(restored);assert.deepEqual(e,restored);
    const w=workspace(e),before=JSON.stringify(w);H.checkWorkspace(w);assert.equal(JSON.stringify(w),before);
    const changed=structuredClone(e);changed.result.nutrition.reference=N.reference;assert.throws(()=>H.checkPair(changed.child,changed.result),/importInvalid/);
    const changedObservation=structuredClone(e);changedObservation.child.recentWeightLoss='y';assert.throws(()=>H.checkPair(changedObservation.child,changedObservation.result),/importInvalid/);
});
test('fictitious streamed and encrypted backups retain the selected context and reject corruption',async()=>{
    global.localStorage={};const e=engine.calculate(observed()),history=new H({}),snapshot=history.makeSnapshot(workspace(e),'test');
    const records=H.emptyArchive();records.sessions.push(snapshot);
    const storage={visitArchive:async visit=>{for(const store of TransferManager.stores)for(const record of records[store])visit(store,record);}};
    const plain=await new TransferManager(storage).export({language:'fr'}),parsed=await TransferManager.inspect(plain);assert.equal(parsed.validator.counts.sessions,1);
    assert((await plain.text()).includes('niger2023'));
    const password='FICTIF-PCIMA-password-only',enc=await EncryptedBackup.encrypt(plain,password),dec=await EncryptedBackup.decrypt(enc,password);assert.equal(await dec.text(),await plain.text());
    await assert.rejects(TransferManager.inspect(new Blob([(await plain.text()).replace('niger2023','who2023')])));
});
test('CSV preserves old column positions and appends the clinical context/observations; explicit input mapping retains them',()=>{
    const e=engine.calculate(observed({recentWeightLoss:'y'})),rows=[...CSV.rows(CSV.results([e]))],header=rows[0],line=rows[1];assert.equal(line.length,header.length);
    assert.equal(header[header.indexOf('furtherAssessment')+1],'nutrition_category');assert.equal(header.at(-1),'nutrition_reasons');
    for(const field of P.fields)assert.equal(line[header.indexOf(field)],String(e.child[field]??''));
    const columns=['gender','ageMode','ageTotalMonths','measurementDate','weight','height','position','oedema',...P.fields],input=columns.join(',')+'\n'+columns.map(k=>raw({recentWeightLoss:'y'})[k]??'').join(',');
    const c=CSV.parse(input,{extended:true})[0];assert.equal(c.careProtocol,'niger2023');assert.equal(c.recentWeightLoss,'y');assert.equal(c.feedingDifficulty,'');
});
test('FR EN AR forms and reports identify this context and observations; WHO results retain their own sources',()=>{
    const e=engine.calculate(observed({recentWeightLoss:'y'}));
    for(const language of ['fr','en','ar']){
        const app=Object.assign(Object.create(App.prototype),{translations,prefs:{language}}),html=app.formHTML('single',raw());
        assert(html.includes('name="careProtocol"'));for(const field of P.observations)assert(html.includes('name="'+field+'"'));
        const preview=app.previewDraft(observed({recentWeightLoss:'y'}),'single');assert(preview.includes(translations[language].careNiger2023));assert(preview.includes(translations[language].pcimaAppetitePassed));assert(!preview.includes('>niger2023<'));
        const result=app.nutritionHTML(e.child,e.result);assert(result.includes(P.source));assert(result.includes(translations[language].pcimaHelp));assert(!result.includes('href="https://www.who.int/publications'));
        const report=PDF.model([e],{translations,language});assert(JSON.stringify(report).includes(translations[language].recentWeightLoss));assert(JSON.stringify(report).includes(P.reference));assert(JSON.stringify(report).includes(translations[language].pcimaHelp));
        const who=engine.calculate(raw({careProtocol:''}));assert(app.nutritionHTML(who.child,who.result).includes('href="https://www.who.int/publications'));
    }
});
test('all new result/observation labels and compact-table labels exist in FR EN AR',()=>{
    const keys=new Set([...P.fields,...P.observations,'pcimaHelp','pcimaAppetitePassed','pcimaProfileRequired','pcimaMixedConflict','careProtocolInvalid']);
    for(const extra of [{},{totalAgeMonths:3},{totalAgeMonths:3,feedingDifficulty:'y'},{totalAgeMonths:60},{oedema:'y',mixedMalnutrition:'y'},{recentWeightLoss:'y',poorWeightGain:'y',medicalSocialProblem:'y',feedingDifficulty:'y'}]){
        const n=assess(extra);for(const key of [n.category,n.orientation,...n.criteria,...n.reasons,...n.missing])keys.add(key);keys.add(n.category+'Short');keys.add(n.orientation+'Short');
    }
    for(const language of ['fr','en','ar'])for(const key of keys)assert.equal(typeof translations[language][key],'string',language+': '+key);
});
test('browser script order and offline allowlist include the national module, with no network operation in its rules',()=>{
    const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8'),assets=json('tools/scripts/offline-assets.json');assert(html.indexOf('services/pcima-niger.js')<html.indexOf('services/nutrition-assessment.js'));assert(assets.includes('js/services/pcima-niger.js'));
    const context={};context.window=context;context.globalThis=context;vm.createContext(context);
    for(const file of ['pcima-niger.js','nutrition-assessment.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/js/services',file),'utf8'),context);
    assert.equal(context.NutritionAssessment.assess({...observed(),totalAgeMonths:12},{weightForHeight:{zscoreRaw:0,flagged:false}}).reference,P.reference);
    assert(!/\b(?:fetch|XMLHttpRequest|localStorage|indexedDB)\s*[.(]/.test(fs.readFileSync(path.join(root,'src/js/services/pcima-niger.js'),'utf8')));
});
test('national aggregate provenance survives and DHIS2 requires a context-aware mapping, never programme outcome counts',()=>{
    const entries=[engine.calculate(observed()),engine.calculate(raw({careProtocol:''}))],before=JSON.stringify(entries),report=ReportingExport.aggregate(entries,'202611');
    assert.deepEqual(report.assessmentReferences,[P.reference,N.reference].sort());assert.equal(report.unit,'measurement-rows');assert.equal(report.counts.rows,2);
    const profile={format:'zscore-dhis2-mapping',version:1,unit:'measurement-rows',orgUnit:'A0000000001',dataSet:'A0000000002',mappings:[{metric:'rows',dataElement:'A0000000003',categoryOptionCombo:'A0000000004'}]};
    assert.throws(()=>ReportingExport.dhis2(report,profile),/reportProtocolMappingRequired/);
    assert.equal(ReportingExport.dhis2(report,{...profile,assessmentReferences:report.assessmentReferences}).dataValues[0].value,'2');assert.equal(JSON.stringify(entries),before);
    assert(!Object.keys(report.counts).some(k=>/recovered|admission|cured|unique|death|abandon/i.test(k)));
});
