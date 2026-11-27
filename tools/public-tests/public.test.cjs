'use strict';
// Fictitious inputs only. These tests are independent of .local and the private suite.
// Expected domains/method: pinned WHO Anthro/AnthroPlus sources in tools/reference.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ClinicalEngine}=require('../../src/js/services/clinical-engine.js');global.ClinicalEngine=ClinicalEngine;
const {GrowthEngine}=require('../../src/js/services/growth-engine.js');
const {HistoryManager}=require('../../src/js/services/history-manager.js');global.HistoryManager=HistoryManager;
const {TransferManager}=require('../../src/js/services/transfer-manager.js');
const {EncryptedBackup}=require('../../src/js/services/encrypted-backup.js');
const {CSVManager}=require('../../src/js/services/csv-manager.js');
const {PDFManager}=require('../../src/js/services/pdf-manager.js');
const {WorkspaceApp}=require('../../src/js/workspace-app.js');
const {SupplementaryGrowth}=require('../../src/js/services/supplementary-growth.js');
const {LotAnalysis}=require('../../src/js/components/lot-analysis.js');
const json=file=>JSON.parse(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'));

test('the startup fallback remains available when bootstrap and PDF services are missing',()=>{
    const vm=require('node:vm'),root={setAttribute(name,value){this[name]=value;},append(button){this.retry=button;}};
    const document={getElementById:()=>root,createElement:()=>({addEventListener(){}})};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/js/workspace-app.js'),'utf8'),{document});
    assert.equal(root.role,'alert');
    assert.match(root.retry.textContent,/Réessayer/);
});

test('offline installation does not wait for the pinned GPL source downloads',async()=>{
    const vm=require('node:vm'),scope='https://example.test/',handlers={},writes=new Map(),requests=[];
    const read=name=>fs.readFileSync(path.join(__dirname,'../../src',name));
    const worker={
        URL,Request,Response,crypto:crypto.webcrypto,
        self:{registration:{scope},location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},
        caches:{open:async()=>({put:async(url,response)=>writes.set(url,response),match:async url=>writes.get(url)?.clone()})},
        fetch:async request=>{
            const name=new URL(request.url).pathname.slice(1)||'index.html';
            requests.push(name);
            if(name.endsWith('.zip'))throw Error('Archive connection unavailable');
            return new Response(read(name));
        }
    };
    vm.runInNewContext(read('sw.js').toString(),worker);
    let install;handlers.install({waitUntil:promise=>{install=promise;}});
    await install;
    for(const file of ['data/zscore-sources.zip','data/who-data-sources.zip']){
        assert.ok(json('src/release-manifest.json').assets[file]);
        assert.ok(!requests.includes(file));
    }
    assert.equal(writes.size,Object.keys(json('src/release-manifest.json').assets).length-2);
    assert.ok(writes.has(scope+'js/workspace-app.js'));
    let request;
    handlers.fetch({request:new Request(scope+'data/zscore-sources.zip'),respondWith:promise=>{request=promise;}});
    assert.equal((await request).status,503);
    assert.ok(requests.includes('data/zscore-sources.zip'));
});
test('public Markdown local links stay inside the distributed file selection',()=>{
    const root=path.resolve(__dirname,'../..'),files=new Set(json('tools/git-sync-allowlist.json').files);
    for(const source of [...files].filter(file=>file.endsWith('.md'))){
        const text=fs.readFileSync(path.join(root,source),'utf8');
        for(const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)){
            const href=match[1].trim().replace(/^<|>$/g,'');
            if(/^(?:https?:|mailto:|data:|#)/i.test(href))continue;
            const local=decodeURIComponent(href.split('#')[0]);if(!local)continue;
            const target=path.relative(root,path.resolve(path.dirname(path.join(root,source)),local)).split(path.sep).join('/');
            assert.ok(files.has(target),`${source}: local link is not distributed: ${href}`);
        }
    }
});
const engine=new GrowthEngine(json('src/data/who-official.json'),json('src/data/who-2007.json'),json('src/data/who-additional.json'));
const translations=json('src/data/interface-translations.json');
test('feedback links route FR EN AR on every view without embedding local records or navigating away',()=>{
    const previous=global.document,root={innerHTML:''};
    global.document={getElementById:id=>{assert.equal(id,'app-root');return root;}};
    try{
        for(const [language,id,label] of [['fr','bZ9xb7','Donner un avis ou signaler un problème'],['en','o9Dy6b','Send feedback or report a problem'],['ar','GeKzve','إرسال ملاحظة أو الإبلاغ عن مشكلة']]){
            for(const page of ['single','batch','history','references','settings']){
                const state={single:null,draft:{caseId:'FICTIF-NOT-FOR-TALLY',weight:8500},batch:[]};
                const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations,page,state,history:{recoveryErrors:[]}}),before=JSON.stringify(state);
                for(const method of ['closeChoice','closeInfo','observeHeader','updateConnection','updateSaveStatus','updateToast','syncImportNotice','renderHistoryList','refreshCapacity','enhanceSelects','updateCSVControls','syncBatchSelection'])app[method]=()=>{};
                for(const method of ['updateHTML','singleHTML','batchHTML','historyHTML','referencesHTML','settingsHTML','toolButton','icon'])app[method]=()=>'';
                app.render();
                const github=root.innerHTML.match(/<a class="github-footer-link"([^>]*)>([^<]*)<\/a>/);assert(github);assert.equal(github[2],translations[language].githubProject);assert(github[1].includes('href="https://github.com/mohamedoumarougarba-til227/nutritional-zscore-calculator"'));assert(github[1].includes('rel="noopener noreferrer"'));assert(!github[0].includes('FICTIF-NOT-FOR-TALLY'));
                const links=[...root.innerHTML.matchAll(/<a class="feedback-footer-link"([^>]*)><span class="mobile-label-wide">([^<]*)<\/span><span class="mobile-label-short">([^<]*)<\/span><\/a>/g)];assert.equal(links.length,1);
                const [markup,attributes,text,short]=links[0];assert.equal(text,label);assert.equal(short,translations[language].mobileFeedbackShort);assert.ok(attributes.includes(`href="https://tally.so/r/${id}"`));assert.ok(attributes.includes('target="_blank"'));assert.ok(attributes.includes('rel="noopener noreferrer"'));assert.ok(attributes.includes('title="'));
                assert.ok(!markup.includes('FICTIF-NOT-FOR-TALLY'));assert.ok(!/[?&]|onclick=|data-action=/.test(markup));assert.equal(JSON.stringify(state),before);
                assert.ok(!/<(?:iframe|script)[^>]+tally\.so/i.test(root.innerHTML));
                assert.ok(root.innerHTML.includes('<span class="mobile-label-short">'+translations[language].mobileLegal+'</span>'));
                assert.ok(root.innerHTML.includes('<span class="footer-version">v'+WorkspaceApp.version+'</span>'));
                assert.ok(root.innerHTML.includes('data-mobile-offline-status'));
            }
        }
    }finally{if(previous===undefined)delete global.document;else global.document=previous;}
});
const example=extra=>({name:'FICTIF-PUBLIC',caseId:'FICTIF-PUBLIC',measurementDate:'2026-10-26',ageMode:'days',ageDays:365,gender:'M',weight:8500,height:75,position:'L',oedema:'n',...extra});
const workspace=entry=>({version:1,mode:'single',draft:entry.child,batchDraft:{},single:entry,batch:[],paste:'',stale:false});
global.localStorage=Object.create(null);
Object.defineProperties(global.localStorage,{getItem:{value:key=>global.localStorage[key]??null},setItem:{value:(key,value)=>{global.localStorage[key]=String(value);}}});
class MemoryHistory {
    constructor(){this.records=HistoryManager.emptyArchive();}
    async addArchive(records){for(const store of TransferManager.stores)this.records[store].push(...structuredClone(records[store]));}
    async readArchive(){return structuredClone(this.records);}
    async visitArchive(visit){for(const store of TransferManager.stores)for(const record of this.records[store])visit(store,structuredClone(record));}
}

test('WHO reference selection respects the 60-month boundary and rejects the outer age domain',()=>{
    assert.equal(engine.calculate(example({ageDays:1826})).result.referenceFamily,'WHO2006');
    assert.equal(engine.calculate(example({ageDays:1827,position:'H'})).result.referenceFamily,'WHO2007');
    assert.throws(()=>engine.calculate(example({ageMode:'months',ageYears:19,ageMonths:1})),/ageInvalid/);
});
test('WHO 2007 has no WHZ and WAZ stops at 121 months, without extrapolation',()=>{
    const result=engine.calculate(example({ageMode:'months',ageYears:11,ageMonths:0,position:'H',height:140,weight:32000})).result;
    assert.equal(result.weightForHeight.zscore,null);assert.equal(result.weightForHeight.notApplicable,true);
    assert.equal(result.weightForAge.zscore,null);assert.equal(result.weightForAge.error,'weightAgeLimit2007');
    assert.ok(ClinicalEngine.applicable('WHO2007',120.999).includes('weightForAge'));
    assert.ok(!ClinicalEngine.applicable('WHO2007',121).includes('weightForAge'));
    assert.equal(engine.calculate(example({height:120})).result.weightForHeight.error,'outsideReference');
});
test('LMS logarithmic case and categorisation use the unrounded score',()=>{
    assert.equal(ClinicalEngine.lms(10,[1,10,.1]),0);
    assert.ok(Math.abs(ClinicalEngine.lms(10*Math.exp(.2),[0,10,.1],false)-2)<1e-12);
    assert.equal(Math.round(-2.0001*100)/100,-2);
    assert.equal(ClinicalEngine.category('weightForAge',-2.0001),'underweightModerate');
    assert.equal(ClinicalEngine.category('weightForAge',-2),'withinReference');
});
test('measurement position uses 0.7 cm correction and conservatively suspends standing infants',()=>{
    const standing=engine.calculate(example({position:'H'})).result;
    assert.equal(standing.correctedHeight,75.7);
    const infant=engine.calculate(example({ageDays:90,position:'H'})).result;
    assert.equal(infant.heightForAge.error,'infantPosition');
    const older=engine.calculate(example({ageMode:'months',ageYears:6,ageMonths:0})).result;
    assert.equal(older.heightForAge.error,'standingRequired2007');
});
test('exact dates and estimated years/months remain distinguishable',()=>{
    const exact=engine.calculate(example({ageMode:'dates',birthDate:'2025-10-26'}));
    const estimated=engine.calculate(example({ageMode:'months',ageYears:1,ageMonths:0}));
    assert.equal(exact.child.ageDays,365);assert.ok(!exact.result.warnings.includes('estimatedAge'));
    assert.ok(estimated.result.warnings.includes('estimatedAge'));
    assert.throws(()=>engine.calculate(example({ageMode:'dates',birthDate:'2025-02-30'})),/dateInvalid/);
});
test('unknown oedema is not assumed absent and present oedema suspends weight-related scores',()=>{
    assert(Number.isFinite(engine.calculate(example({oedema:''})).result.weightForAge.zscore));
    const swollen=engine.calculate(example({oedema:'y'})).result;
    assert.equal(swollen.weightForAge.zscore,null);assert.equal(swollen.bmiForAge.zscore,null);
    assert.ok(Number.isFinite(swollen.heightForAge.zscore));
});
test('absolute MUAC uses strict 115/125 mm thresholds within its intended age band',()=>{
    for(const [muac,expected] of [[114.9,'muacSevere'],[115,'muacModerate'],[124.9,'muacModerate'],[125,'muacNotLow']])assert.equal(engine.calculate(example({muac})).result.nutrition.muac,expected);
    assert.equal(engine.calculate(example({ageDays:90,muac:110})).result.nutrition.muac,'muacAgeUnsupported');
});
test('optional WHO indicators preserve the base assessment and enforce their separate age domains',()=>{
    const base=engine.calculate(example({muac:130})),extra=engine.calculate(example({muac:130,headCircumference:46,tricepsSkinfold:8,subscapularSkinfold:6}));
    assert.deepEqual(extra.result.nutrition,base.result.nutrition);
    assert.equal(Object.keys(extra.result.additionalGrowth.indicators).length,4);
    assert.equal(engine.calculate(example({ageDays:90,muac:130})).result.additionalGrowth.indicators.armCircumferenceForAge.error,'additionalAgeDomain');
    assert.throws(()=>engine.calculate(example({headCircumference:true})),/additionalMeasureInvalid/);
});
test('CSV output escapes formulas while numeric negative scores remain numeric; malformed input is refused',()=>{
    for(const text of ['=1+1','@SUM(A1)',' +42','-formula'])assert.ok(CSVManager.cell(text).startsWith('"\''));
    assert.equal(CSVManager.cell(-1.15),'"-1.15"');
    assert.throws(()=>CSVManager.parse('weight,height,gender,position,oedema,ageDays\n8500,75,M,L,n,"365'),/csvInvalid/);
    const csv=CSVManager.results([engine.calculate(example({name:'=FICTIF'}))]);assert.ok(csv.includes("'=FICTIF"));
});
test('history snapshots remain immutable and unchanged autosaves do not create duplicate versions',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
    await history.save(work);await history.save(work);work.draft.name='FICTIF-VERSION-2';await history.save(work);
    assert.equal(store.records.sessions.length,2);
    assert.equal(store.records.sessions[0].metadata.workspace.draft.name,'FICTIF-PUBLIC');
    assert.equal(store.records.sessions[1].metadata.workspace.draft.name,'FICTIF-VERSION-2');
});
test('backup export is accepted by the actual import protocol validator and restoration remaps a copy',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),entry=engine.calculate(example({headCircumference:46}));
    await history.save(workspace(entry));
    const file=await new TransferManager(store).export({language:'fr'}),verified=await TransferManager.inspect(file);
    assert.equal(verified.validator.counts.sessions,1);assert.equal(verified.validator.children.size,1);
    const saved=store.records.sessions[0],before=JSON.stringify(saved),copy=TransferManager.remapper('fictitious-import')('sessions',saved);
    assert.notEqual(copy.id,saved.id);assert.notEqual(copy.metadata.workspace.single.child.id,entry.child.id);
    assert.equal(copy.metadata.workspace.single.child.visitId,entry.child.visitId);
    HistoryManager.checkWorkspace(copy.metadata.workspace);assert.equal(JSON.stringify(saved),before);
});
test('corruption, truncation and unsupported backup versions fail before import',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store);await history.save(workspace(engine.calculate(example())));
    const text=await(await new TransferManager(store).export({language:'fr'})).text();
    await assert.rejects(TransferManager.inspect(new Blob([text.replace('FICTIF-PUBLIC','FICTIF-CHANGE')])),/importChecksum/);
    await assert.rejects(TransferManager.inspect(new Blob([text.split('\n').slice(0,-2).join('\n')])),/importChecksum/);
    await assert.rejects(TransferManager.inspect(new Blob([text.replace('"version":1','"version":999')])),/importVersion/);
    assert.equal(store.records.sessions.length,1);
});
test('synthetic encrypted backup round-trips bytes and refuses wrong passwords or modified ciphertext',async()=>{
    const plain=new Blob(['FICTIF-PUBLIC: no patient data']),password='fictitious-public-test-only';
    const cipher=await EncryptedBackup.encrypt(plain,password);
    assert.equal(await(await EncryptedBackup.decrypt(cipher,password)).text(),await plain.text());
    await assert.rejects(EncryptedBackup.decrypt(cipher,'wrong-fictitious-password'),/encryptedAuthenticationFailed/);
    const bytes=new Uint8Array(await cipher.arrayBuffer());bytes[bytes.length-1]^=1;
    await assert.rejects(EncryptedBackup.decrypt(new Blob([bytes]),password),/encryptedAuthenticationFailed/);
});
test('FR/EN/AR optional results and PDF notes retain labels and escape fictitious markup',()=>{
    const entry=engine.calculate(example({name:'<FICTIF>',headCircumference:46,muac:130}));
    const keys=Object.keys(translations.fr).sort();
    for(const language of ['fr','en','ar']){
        assert.deepEqual(Object.keys(translations[language]).sort(),keys);
        const ui=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations});
        const html=ui.resultsHTML(entry,false,true);assert.ok(!html.includes('<FICTIF>'));assert.ok(html.includes('&lt;FICTIF&gt;'));
        assert.ok(html.includes(translations[language].headCircumferenceForAge));
        assert.ok(PDFManager.model([entry],{language,translations}).rows[0].notes.some(note=>note.includes(translations[language].headCircumferenceForAge)));
    }
});
test('distributed reference bytes match all three pinned table manifests',()=>{
    for(const family of ['who','who-2007','who-additional']){
        const name=family==='who'?'who-manifest.json':family+'-manifest.json',manifest=json('src/data/'+name);
        const bytes=fs.readFileSync(path.join(__dirname,'../../src/data',manifest.file||(family==='who-2007'?'who-2007.json':'')));
        assert.equal(bytes.length,manifest.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
    }
    assert.equal(Object.keys(SupplementaryGrowth.definitions).length,4);
});
test('the public runner refuses a missing or empty suite',()=>{
    const runner=require('../scripts/test-public.cjs'),directory=path.join(__dirname,'does-not-exist');
    let message='';assert.deepEqual(runner.discover(directory),[]);
    assert.equal(runner.run(directory,{stdout:{write:()=>{}},stderr:{write:s=>{message+=s;}}}),1);
    assert.match(message,/empty green suite/);
});
test('release source canonicalization is stable before and after integrity injection',()=>{
    const {canonicalHTML}=require('../scripts/build-source-archive.cjs');
    const {renderIntegrity}=require('../scripts/build-release.cjs');
    const html='<head><script src="new.js"></script><link rel="stylesheet" href="new.css"></head>';
    const assets={'new.js':'a'.repeat(64),'new.css':'b'.repeat(64)};
    for(const file of [...['data/interface-translations.json','data/who-manifest.json','data/who-official.json','data/who-2007.json','data/who-2007-manifest.json','data/LICENSE-anthroplus.txt','data/who-additional.json','data/who-additional-manifest.json','data/cdc-growth.json','data/cdc-growth-manifest.json'],...PDFManager.fontPaths])assets[file]='c'.repeat(64);
    const generated=renderIntegrity(html,assets);
    assert.equal(canonicalHTML(html),canonicalHTML(generated));
    assert.equal(canonicalHTML(generated),canonicalHTML(canonicalHTML(generated)));
});
test('optional lot summaries keep their own reference and count visits without population inference',()=>{
    const valid=engine.calculate(example({muac:130,headCircumference:46,tricepsSkinfold:8,subscapularSkinfold:6}));
    const missing=engine.calculate(example({})),outside=engine.calculate(example({ageDays:60,muac:130}));
    const foreign=structuredClone(valid);foreign.result.additionalGrowth.referenceVersion='foreign-reference';
    const entries=[valid,structuredClone(valid),missing,outside,foreign],saved=JSON.stringify(entries);
    const reference=engine.additional.data.referenceVersion;
    const model=LotAnalysis.build(entries,valid.result.referenceVersion,{additionalReference:reference});
    const arm=model.indicators.find(item=>item.key==='armCircumferenceForAge');
    assert.deepEqual([arm.usable,arm.missing,arm.suspended,arm.unverified],[2,1,1,1]);
    assert.equal(model.identifiedCases,1);assert.equal(model.total,5);
    assert.equal(arm.categories.reduce((sum,c)=>sum+c.count,0),2);
    assert.ok(arm.categories.every(c=>c.denominator===2));
    assert.ok(LotAnalysis.csvRows(model).filter(row=>row[1]==='armCircumferenceForAge').every(row=>row[6]===reference));
    assert.equal(JSON.stringify(entries),saved);
    for(const language of ['fr','en','ar']){
        const ui=Object.assign(Object.create(WorkspaceApp.prototype),{translations,prefs:{language}});
        const html=LotAnalysis.html(model,ui,{exportButton:false});
        assert.ok(html.includes(ui.esc(translations[language].additionalResultHelp)));
        assert.ok(html.includes(reference));
    }
});
test('source archive context cannot exempt active resources or silently replace Git checks',()=>{
    const {checkPublic}=require('../scripts/check-public-files.cjs');
    const {excludedFiles}=require('../scripts/build-source-archive.cjs');
    assert.deepEqual(excludedFiles,['src/vendor/pdf/jspdf-4.2.1.umd.min.js']);
    assert.throws(()=>checkPublic({sourceArchive:true,tracked:true}),/one distribution context/);
    assert.throws(()=>checkPublic({sourceArchive:true,base:path.join(__dirname,'nonexistent-archive')}),/Missing source archive marker/);
});

test('optional history chart tables display centiles from their own indicators in FR/EN/AR without recalculation',()=>{
    const {GrowthChart}=require('../../src/js/components/growth-chart.js');
    const entry=engine.calculate(example({muac:130,headCircumference:46,tricepsSkinfold:8,subscapularSkinfold:6}));
    const saved=JSON.stringify(entry),reference=entry.result.additionalGrowth.referenceVersion;
    for(const language of ['fr','en','ar']){
        const calls=[],ui=Object.assign(Object.create(WorkspaceApp.prototype),{translations,prefs:{language}});
        ui.percentileHTML=function(value,result){calls.push(value);return WorkspaceApp.prototype.percentileHTML.call(this,value,result);};
        const html=GrowthChart.html([entry],reference,ui);
        for(const value of Object.values(entry.result.additionalGrowth.indicators))assert.ok(calls.includes(value));
        assert.ok(!calls.includes(undefined));assert.match(html,/class="centile"/);
        assert.ok(html.includes(ui.esc(reference)));
    }
    assert.equal(JSON.stringify(entry),saved);
});

// Synthetic service-worker lifecycle; no browser data or private fixtures.
// First-load documents are initially uncontrolled because the worker never claims tabs.
test('an immediate update after first-load install offers reload instead of a false failure',async t=>{
    const original=Object.getOwnPropertyDescriptor(global,'navigator');
    const worker=()=>({state:'installing',listeners:[],addEventListener(name,fn){this.listeners.push(fn);},emit(state){this.state=state;this.listeners.forEach(fn=>fn());}});
    const first=worker(),registration={active:null,installing:first,waiting:null,addEventListener(name,fn){this.onUpdate=fn;}};
    Object.defineProperty(global,'navigator',{configurable:true,value:{serviceWorker:{controller:null,register:async()=>registration,addEventListener(){}}}});
    t.after(()=>{if(original)Object.defineProperty(global,'navigator',original);else delete global.navigator;});
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{reloadAvailable:false,updateOfflineStatus(){},updateUpdateStatus(){}});
    await app.registerOffline();registration.active=first;first.emit('installed');first.emit('activated');
    assert.equal(app.reloadAvailable,false);assert.equal(app.updateError,null);
    const next=worker();registration.installing=next;registration.onUpdate();next.emit('installed');
    registration.active=next;registration.installing=null;first.emit('redundant');next.emit('activated');
    assert.equal(app.updateError,null);assert.equal(app.reloadAvailable,true);assert.equal(app.offlineState,'offlineReady');
});

test('a rejected installation still reports failure while preserving the active offline release',async t=>{
    const original=Object.getOwnPropertyDescriptor(global,'navigator');let listener;
    const next={state:'installing',addEventListener(name,fn){listener=fn;}};
    const active={state:'activated'},registration={active,installing:next,waiting:null,addEventListener(){}};
    Object.defineProperty(global,'navigator',{configurable:true,value:{serviceWorker:{controller:active,register:async()=>registration,addEventListener(){}}}});
    t.after(()=>{if(original)Object.defineProperty(global,'navigator',original);else delete global.navigator;});
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{reloadAvailable:false,updateOfflineStatus(){},updateUpdateStatus(){}});
    await app.registerOffline();registration.installing=null;next.state='redundant';listener();
    assert.equal(app.updateError,'updateFailedHelp');assert.equal(app.offlineState,'offlineReady');
    assert.equal(app.reloadAvailable,false);assert.equal(registration.active,active);
});


test('history previews distinguish an unknown MUAC from a measured value in FR EN AR',()=>{
    const missing=engine.calculate(example()),measured=engine.calculate(example({muac:114}));
    for(const language of ['fr','en','ar']){
        const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations,engine});
        const unknown=app.tableHTML([missing]);
        assert.ok(unknown.includes(app.t('muac')+' : '+app.t('unknown')));
        assert.ok(!unknown.includes(app.t('muac')+' :  mm'));
        const known=app.tableHTML([measured]);
        assert.ok(known.includes(app.t('muac')+' : '+app.number(114,1)+' mm'));
    }
});

test('PDF notes retain distinct warnings and provenance while removing exact repetitions',()=>{
    const input=engine.calculate(example()),before=JSON.stringify(input);
    input.result.warnings=['estimatedAge','estimatedAge'];
    for(const language of ['fr','en','ar']){
        const model=PDFManager.model([input],{language,translations}),notes=model.rows[0].notes;
        assert.equal(notes.length,new Set(notes).size);
        assert.equal(notes.filter(n=>n===translations[language].estimatedAge).length,1);
        assert.ok(notes.includes(translations[language][input.result.nutrition.category]));
        assert.ok(notes.some(n=>n.includes(input.result.nutrition.reference)));
        assert.equal(model.provenances[0][0],input.result.referenceVersion);
        assert.equal(model.rows[0].scores[0].split('\n')[0],'Z = -1.15');
    }
    assert.equal(input.result.warnings.length,2,'reporting never rewrites the archived input');
    assert.ok(before.includes('FICTIF-PUBLIC'));
});

test('PDF continuation markers use the original lot row in LTR and RTL and ignore ordinary rows',()=>{
    const raw=['6','FICTIF','stored measurements','notes'],before=JSON.stringify(raw);
    assert.equal(PDFManager.continuedRowIndex({section:'body',row:{index:-1,raw}}),'6');
    assert.equal(PDFManager.continuedRowIndex({section:'body',row:{index:-1,raw:[...raw].reverse()}},true),'6');
    for(const data of [null,{}, {section:'head',row:{index:-1,raw}}, {section:'body',row:{index:5,raw}},
        {section:'body',row:{index:-1,raw:['<FICTIF>']}}, {section:'body',row:{index:-1,raw:{}}}])assert.equal(PDFManager.continuedRowIndex(data),null);
    assert.equal(JSON.stringify(raw),before);
    for(const language of ['fr','en','ar'])assert.ok(translations[language].pdfRowContinuation.replace('{number}','6').includes('6'));
});


test('manual and forced safety saves never create empty or unchanged versions',async()=>{
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{growthProfile:'who',careProtocol:'niger2025'}}),store=new MemoryHistory(),history=new HistoryManager(store);
    for(const profile of ['who','us','intergrowth'])for(const ageMode of ['days','months','totalMonths','dates','pma']){
        const work=app.emptyWorkspace();work.draft={...app.emptyDraft(profile),ageMode,measurementDate:'2026-01-01',name:'  '};work.batchDraft=app.emptyDraft(profile);
        assert.equal(HistoryManager.hasWork(work),false);assert.equal(await history.save(work,'manual',true),null);assert.equal(await history.save(work,'beforeUpdate',true),null);
    }
    assert.equal(store.records.sessions.length,0);
    const work=app.emptyWorkspace();work.draft.name='FICTIF';assert.ok(await history.save(work,'automatic'));
    assert.equal(await history.save(work,'manual',true),null);work.mode='batch';work.batchDraft.ageMode='days';work.batchDraft.measurementDate='2026-01-01';assert.equal(await history.save(work,'manual',true),null);
    work.draft.cannotDrink='n';assert.ok(await history.save(work,'manual',true));work.draft.ageMonths=0;assert.ok(await history.save(work,'automatic'));
    assert.equal(store.records.sessions.length,3);assert.equal(store.records.sessions[0].metadata.workspace.draft.cannotDrink,undefined);
    for(const draft of [{ageDays:0},{oedema:'n'},{muac:'122'},{birthDate:'2026-01-01'},{caseId:'FICTIF'}])assert.ok(HistoryManager.hasWork({draft}));
});
test('real clinical versions and pending drafts survive deduplication, failed writes can retry',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
    const original=JSON.stringify(work);assert.ok(await history.save(work,'calculated'));assert.equal(await history.save(work,'manual',true),null);
    const second=structuredClone(work);second.single.result.calculatedAt='2026-11-25T01:00:00.000Z';assert.ok(await history.save(second,'calculated'));
    const third=structuredClone(second);third.draft.name='FICTIF-NEW';const write=store.addArchive.bind(store);store.addArchive=async()=>{throw Error('quota');};await assert.rejects(history.save(third,'manual',true),/quota/);store.addArchive=write;assert.ok(await history.save(third,'manual',true));
    assert.equal(store.records.sessions.length,3);assert.equal(JSON.stringify(store.records.sessions[0].metadata.workspace),original);
});
test('repeated recovery checkpoints retain the same journal and skip blank forms',()=>{
    const previous=global.localStorage,storage=new Map();global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
    try{const history=new HistoryManager(new MemoryHistory()),app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{growthProfile:'who'}}),work=app.emptyWorkspace();
        work.draft.ageMode='days';history.checkpoint(work);assert.equal(storage.size,0);work.draft.ageDays=0;history.checkpoint(work);const first=storage.get(history.journalKey);assert.ok(first);work.mode='batch';history.checkpoint(work);assert.equal(storage.get(history.journalKey),first);work.draft.ageDays=1;history.checkpoint(work);assert.notEqual(storage.get(history.journalKey),first);
        const last=storage.get(history.journalKey);history.checkpoint(app.emptyWorkspace());assert.equal(storage.get(history.journalKey),last);
    }finally{if(previous===undefined)delete global.localStorage;else global.localStorage=previous;}
});


test('parallel unchanged saves serialize and restored durable content does not create a new version',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
    const writes=await Promise.all([history.save(work,'automatic'),history.save(work,'manual',true),history.save(work,'beforeUpdate',true)]);
    assert.equal(writes.filter(Boolean).length,1);assert.equal(store.records.sessions.length,1);
    const restored=structuredClone(work);restored.single.child.id='child_restored';restored.single.result.id='result_restored';restored.single.result.childId='child_restored';
    await history.resumeSaved(restored);assert.equal(await history.save(restored,'manual',true),null);
    restored.draft.name='FICTIF-EDIT';assert.ok(await history.save(restored,'automatic'));assert.equal(store.records.sessions.length,2);
    assert.equal(store.records.sessions[0].metadata.workspace.single.child.id,work.single.child.id);
});

test('draft typing and tab hiding update one recovery journal without archiving intermediate states',async t=>{
    const storage=new Map(),previous=global.localStorage;
    global.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
    t.after(()=>{global.localStorage=previous;});
    const records=new MemoryHistory(),history=new HistoryManager(records),work=workspace(engine.calculate(example()));
    const ui=Object.assign(Object.create(WorkspaceApp.prototype),{state:work,history,readForms(){},updateSaveStatus(){}});
    await history.save(work,'calculated');
    const original=work.draft.weight;
    work.draft.weight='8600';ui.scheduleSave();ui.persistDraft();
    work.draft.weight='8700';ui.scheduleSave();
    assert.equal(storage.size,1);
    assert.equal(JSON.parse(storage.get(history.journalKey)).metadata.workspace.draft.weight,'8700');
    assert.equal(records.records.sessions.length,1);
    work.draft.weight=original;ui.persistDraft();
    assert.equal(storage.size,0);
    assert.equal(records.records.sessions.length,1);
    work.draft.weight='8750';ui.scheduleSave();
    assert.ok(await history.save(work,'beforeUpdate',true));
    assert.equal(records.records.sessions.length,2);
});

test('equivalent recalculation keeps the original calculation timestamp and real changes remain distinct',()=>{
    const before=engine.calculate(example());
    const onceMore=engine.calculate({...before.child,weight:'8,5',weightUnit:'kg'});
    assert.notEqual(before.result.id,onceMore.result.id);
    assert.equal(WorkspaceApp.retainCalculation(before,onceMore),before);
    const changed=engine.calculate({...before.child,weight:8600});
    assert.equal(WorkspaceApp.retainCalculation(before,changed),changed);
    const imported=structuredClone(before);imported.result.imported=true;
    assert.equal(WorkspaceApp.retainCalculation(imported,onceMore),onceMore);
});

 test('hidden result form is not reread as changed work after restoring a durable snapshot',async t=>{
 const original=global.document;t.after(()=>{global.document=original;});
 const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{state:work,page:'single',history});
 await history.resumeSaved(work);const before=JSON.stringify(work);
 global.document={getElementById:id=>id==='single-form'?{closest:selector=>selector==='[hidden]'?{}:null}:null};
 app.readForms();assert.equal(JSON.stringify(work),before);assert.equal(await history.save(work,'automatic'),null);
 assert.equal(store.records.sessions.length,0);
 });

test('numeric draft controls restored as strings do not create a duplicate archive',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
    work.batchDraft={name:'FICTIF-DRAFT',weight:8500,height:77.5,ageYears:2,ageMonths:0,muac:120};
    await history.resumeSaved(work);
    const restored=HistoryManager.clone(work);
    for(const k of ['weight','height','ageYears','ageMonths','muac'])restored.batchDraft[k]=String(restored.batchDraft[k]);
    assert.equal(HistoryManager.signature(work),HistoryManager.signature(restored));
    assert.equal(await history.save(restored,'automatic'),null);
    restored.batchDraft.muac='121';assert.ok(await history.save(restored,'automatic'));
    assert.equal(store.records.sessions.length,1);
});

test('equivalent measurement units do not create a new version but a changed quantity does',async()=>{
    const store=new MemoryHistory(),history=new HistoryManager(store),work=workspace(engine.calculate(example()));
    work.draft={name:'FICTIF-UNIT',weight:'12710',weightUnit:'g',height:'77,5',heightUnit:'cm'};
    assert.ok(await history.save(work,'automatic'));
    const formatted=structuredClone(work);
    Object.assign(formatted.draft,{weight:'12,71',weightUnit:'kg',height:'٠٫٧٧٥',heightUnit:'m'});
    assert.equal(await history.save(formatted,'manual',true),null);
    formatted.draft.height='0.776';
    assert.ok(await history.save(formatted,'automatic'));
    formatted.draft.height='unfinished';
    const signature=HistoryManager.signature(formatted);
    formatted.draft.heightUnit='cm';
    assert.notEqual(HistoryManager.signature(formatted),signature);
    assert.equal(store.records.sessions.length,2);
});

test('update notices dismiss without removing update or retry actions from Settings',()=>{
 const app=Object.assign(Object.create(WorkspaceApp.prototype),{translations,prefs:{language:'fr',theme:'light',growthProfile:'who'},updateError:'updateFailedHelp',offlineRegistration:{waiting:{}}});
 const old=global.document;global.document={getElementById:()=>null};
 try{
  assert.ok(app.updateHTML().includes('dismiss-update-notice'));assert.ok(app.updateHTML().includes('update-toast'));
  app.dismissUpdateNotice();assert.equal(app.updateHTML(),'');assert.equal(app.updateError,'updateFailedHelp');assert.ok(app.offlineRegistration.waiting);
  assert.ok(app.settingsHTML().includes('data-action="apply-update"'));assert.ok(app.settingsHTML().includes('data-action="check-update"'));
  app.updateError=null;assert.ok(app.updateHTML().includes(translations.fr.updateReady));
 }finally{global.document=old;}
});
test('reference help keeps all fourteen sources and verification metadata without backup search in every language',()=>{
 for(const language of ['fr','en','ar']){
  const app=Object.assign(Object.create(WorkspaceApp.prototype),{translations,prefs:{language},engine,manifest:{referenceVersion:'test-version',sha256:'test-sha'}});
  const html=app.referencesHTML();assert.ok(!html.includes('id="reference-search"'));assert.ok(html.includes('quick-guide-grid'));assert.equal((html.match(/class="source-group"/g)||[]).length,4);assert.equal((html.match(/target="_blank"/g)||[]).length,14);assert.ok(html.includes('test-sha'));assert.ok(html.includes('reference-integrity'));
 }
});

test('about dialog includes the real application version in all languages and mobile status retains retry guidance',()=>{
    const previous=global.document,dialog={dataset:{},classList:{add(){},remove(){}},showModal(){}},wide={},mobile={};
    global.document={getElementById:id=>id==='header-dialog'?dialog:null,querySelectorAll:s=>s==='[data-mobile-offline-status]'?[mobile]:[wide]};
    try{
        for(const language of ['fr','en','ar']){
            const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations,offlineState:'offlineFailed',closeInfo(){},closeChoice(){},toolButton(){return '';},updateInstallStatus(){}});
            app.showInfo('appInfo','app-info-button');
            assert.ok(dialog.innerHTML.includes(translations[language].appVersionLabel+' : v'+WorkspaceApp.version));
            assert.ok(dialog.innerHTML.includes(translations[language].aboutShort));
            app.updateOfflineStatus();
            assert.equal(wide.textContent,translations[language].offlineFailed);
            assert.equal(mobile.textContent,translations[language].mobileOfflineFailed);
            app.offlineState='offlineUpdate';app.updateOfflineStatus();
            assert.equal(mobile.textContent,translations[language].offlineUpdate);
        }
    }finally{if(previous===undefined)delete global.document;else global.document=previous;}
});


test('floating mobile navigation relocates work actions and keeps navigation and status available without a close button',()=>{
    const previous=global.document,dialog={dataset:{},classList:{add(){},remove(){}},showModal(){this.open=true;},querySelector(){return null;}},opener={setAttribute(){}};
    global.document={getElementById:id=>id==='header-dialog'?dialog:id==='menu-button'?opener:null};
    try{
        for(const language of ['fr','en','ar'])for(const page of ['single','batch','history','references','settings']){
            const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language},translations,page,closeInfo(){},closeChoice(){},updateConnection(){},updateSaveStatus(){},icon(){return ''; }});
            app.openHeaderPanel('menu');
            assert.equal(dialog.dataset.opener,'menu-button');
            assert.equal((dialog.innerHTML.match(/data-action="header-page"/g)||[]).length,5);
            assert.equal((dialog.innerHTML.match(/aria-current="page"/g)||[]).length,1);
            assert.ok(!dialog.innerHTML.includes('data-action="close-header"'));
            assert.ok(dialog.innerHTML.includes('id="menu-connection"'));
            assert.ok(!dialog.innerHTML.includes('mobile-menu-context'));
            assert.ok(dialog.innerHTML.includes('id="header-dialog-title" class="sr-only"'));
            const work=['single','batch'].includes(page);
            assert.equal(dialog.innerHTML.includes('data-save-state'),work);
            assert.equal(dialog.innerHTML.includes('data-action="new"'),work);
            assert.equal(dialog.innerHTML.includes('data-history-pane="versions"'),work);
            if(work)assert.ok(dialog.innerHTML.indexOf('data-action="new"')<dialog.innerHTML.indexOf('data-history-pane="versions"'));
        }
    }finally{if(previous===undefined)delete global.document;else global.document=previous;}
});


test('floating menu anchors stay inside the viewport and switch direction based on available space',()=>{
    const view={left:0,top:0,width:360,height:800};
    const b=WorkspaceApp.floatingBounds(view,44,60);
    assert.deepEqual(b,{left:8,top:8,right:308,bottom:688});
    assert.deepEqual(WorkspaceApp.floatingAnchor(b,{side:'right',ratio:1}),{x:308,y:688});
    assert.deepEqual(WorkspaceApp.floatingSnap(b,220,999),{side:'right',ratio:1});
    assert.deepEqual(WorkspaceApp.floatingSnap(b,8,-10),{side:'left',ratio:0});
    for(const side of ['left','right'])for(const ratio of [0,0.45,1]){
        const {x,y}=WorkspaceApp.floatingAnchor(b,{side,ratio});
        const a={left:x,right:x+44,top:y,bottom:y+44,width:44};
        const m=WorkspaceApp.floatingDialogLayout(view,a,340,355);
        assert.ok(m.x>=8&&m.x+340<=352);
        assert.ok(m.y>=8&&m.y+Math.min(355,m.maxHeight)<=792);
        if(ratio===0)assert.equal(m.direction,'down');
        if(ratio===1)assert.equal(m.direction,'up');
        assert.ok(m.direction==='down'?m.y>=a.bottom:m.y+Math.min(355,m.maxHeight)<=a.top);
    }
    const short={left:12,top:30,width:320,height:280};
    const bounds=WorkspaceApp.floatingBounds(short,44,70);
    const point=WorkspaceApp.floatingAnchor(bounds,{side:'right',ratio:1});
    const m=WorkspaceApp.floatingDialogLayout(short,{left:point.x,right:point.x+44,top:point.y,bottom:point.y+44,width:44},300,355);
    assert.ok(m.maxHeight<355);assert.ok(m.x>=20&&m.x+300<=324);assert.ok(m.y>=38);
});


test('first use follows supported browser languages and keeps explicit preferences',()=>{
    const {ReleaseGuard}=require('../../src/js/workspace-bootstrap.js');
    for(const [saved,legacy,languages,language,expected] of [
        ['ar','fr',['en-US'],'en-US','ar'],
        [null,'en',['fr-FR'],'fr-FR','en'],
        [null,null,['ar-NE','fr-FR'],'ar-NE','ar'],
        [null,null,['en-GB'],'en-GB','en'],
        [null,null,['de-DE','en-US'],'de-DE','en'],
        ['invalid',null,['es-ES'],'es-ES','fr'],
        [null,null,[],'fr-NE','fr'],
        [null,null,[],'','fr']
    ])assert.equal(ReleaseGuard.preferredLanguage(saved,legacy,languages,language),expected);
});
test('floating menu defaults to upper right and retains saved device position',()=>{
    const previous=global.localStorage;
    try{
        for(const language of ['fr','en','ar']){
            global.localStorage={getItem:()=>null};
            const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language}});
            assert.deepEqual(app.floatingPosition(),{side:'right',ratio:0});
            global.localStorage={getItem:()=>JSON.stringify({side:'left',ratio:.72})};
            delete app.floatingMenuPosition;
            assert.deepEqual(app.floatingPosition(),{side:'left',ratio:.72});
        }
    }finally{if(previous===undefined)delete global.localStorage;else global.localStorage=previous;}
});


test('contextual tour routes differ by device, are translated, and stay within the viewport',()=>{
    const tr=json('src/data/interface-translations.json');
    const desktop=WorkspaceApp.contextTourRoute(false),mobile=WorkspaceApp.contextTourRoute(true);
    assert.ok(desktop.length>45&&mobile.length>45);
    assert.ok(desktop.some(s=>s.target==='#sidebar-button')&&!mobile.some(s=>s.target==='#sidebar-button'));
    assert.ok(mobile.some(s=>s.target==='#menu-button')&&!desktop.some(s=>s.target==='#menu-button'));
    assert.ok(mobile.some(s=>s.mode==='mobile-moved')&&mobile.some(s=>s.mode==='mobile-dock'));
    assert.ok(!desktop.some(s=>s.mode==='mobile-moved'||s.mode==='mobile-dock'));
    for(const s of WorkspaceApp.contextTourSteps)for(const l of ['fr','en','ar']){
        assert.ok(tr[l][s.key+'Title']&&tr[l][s.key+'Text']&&tr[l]['tourCh'+s.chapter]);
    }
    for(const [w,h] of [[320,568],[360,800],[1440,900]])for(const y of [5,h/2,h-50]){
        const p=WorkspaceApp.contextTourPlacement({width:w,height:h},{left:8,right:52,top:y,bottom:y+44,width:44,height:44},Math.min(320,w-16),220);
        assert.ok(p.x>=8&&p.y>=8&&p.x+Math.min(320,w-16)<=w-8&&p.y+220<=h-8);
    }
});
test('contextual demo uses separate fictitious records without storage or clinical workspace mutations',()=>{
    globalThis.LotAnalysis=LotAnalysis;
    globalThis.GrowthChart=require('../../src/js/components/growth-chart.js').GrowthChart;
    globalThis.CSVManager=CSVManager;
    const engine=new GrowthEngine(json('src/data/who-official.json'),json('src/data/who-2007.json'),json('src/data/who-additional.json'),json('src/data/cdc-growth.json'));
    const app=Object.assign(Object.create(WorkspaceApp.prototype),{prefs:{language:'fr',theme:'system',dateFormat:'auto',timeZone:'system'},translations:json('src/data/interface-translations.json'),engine,manifest:json('src/data/who-manifest.json'),olderManifest:json('src/data/who-2007-manifest.json'),cdcManifest:json('src/data/cdc-growth-manifest.json'),state:{draft:{name:'PRIVATE'},batch:[]},history:{},offlineState:'offlineReady'});
    const before=JSON.stringify(app.state);
    for(const l of ['fr','en','ar']){
        const demo=app.contextTourDemo(l);
        assert.notEqual(demo.state,app.state);assert.notEqual(demo.history,app.history);assert.equal(demo.storage,undefined);
        assert.equal(demo.state.batch.length,10);assert.ok(demo.tourExample.result);
        for(const page of ['single','batch','history','settings','references']){
            demo.page=page;demo.batchPane='statistics';demo.historyPane='versions';
            const html=demo.workspaceHTML();assert.ok(html.includes('id="main-nav"'));assert.ok(!html.includes('PRIVATE'));
        }
    }
    assert.equal(JSON.stringify(app.state),before);
});
