'use strict';
// Synthetic inputs; WHO missing-position rule: Anthro quick guide, section 2.
// No patient fixtures, private audit, browser database or network required.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ClinicalEngine:C}=require('../../src/js/services/clinical-engine.js');global.ClinicalEngine=C;
const {GrowthEngine:G}=require('../../src/js/services/growth-engine.js');
const {HistoryManager:H}=require('../../src/js/services/history-manager.js');global.HistoryManager=H;
const {PDFManager:PDF}=require('../../src/js/services/pdf-manager.js');const {CSVManager:CSV}=require('../../src/js/services/csv-manager.js');
const {WorkspaceApp:App}=require('../../src/js/workspace-app.js');
const {ReleaseGuard:Guard}=require('../../src/js/workspace-bootstrap.js');
const {IntergrowthResult:IG}=require('../../src/js/services/intergrowth-result.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../../src/data',f),'utf8'));
const engine=new G(read('who-official.json'),read('who-2007.json'),read('who-additional.json'),read('cdc-growth.json'));
const input=extra=>({caseId:'FICTIF-INPUT',ageMode:'days',ageDays:365,weight:12710,height:120,gender:'M',position:'L',oedema:'n',...extra});
const scores=r=>C.indicators.map(k=>r[k]);
test('comma/point kg and metres produce the same canonical measurements, scores and saved records as g/cm',()=>{
    for(const [weight,height]of [['12,71','1,20'],['12.71','1.2'],['١٢٫٧١','١٫٢']]){
        const raw=input({weight,weightUnit:'kg',height,heightUnit:'m'}),out=engine.calculate(raw),reference=engine.calculate(input());
        assert.equal(out.child.weight,12710);assert.equal(out.child.height,120);assert(!('weightUnit' in out.child));assert(!('heightUnit' in out.child));assert.deepEqual(scores(out.result),scores(reference.result));
        H.checkChild(out.child);H.checkResult(out.result,new Set([out.child.id]));H.checkPair(out.child,out.result);
        assert.equal(G.normalize(out.child).weight,12710);assert.equal(raw.weight,weight);
    }
    assert.equal(C.measurements({weight:8500.123456789012}).weight,8500.123456789012);
    for(const extra of [{weight:'12,7,1'},{weight:'12kg'},{height:'1m20'},{weightUnit:'lb'},{heightUnit:'inch'},{weight:Infinity}])assert.throws(()=>engine.calculate(input(extra)));
});
test('total whole/fractional months use the existing WHO month and CDC precision rules with strict domains',()=>{
    const month=engine.calculate(input({ageMode:'totalMonths',ageTotalMonths:'24'}));
    const years=engine.calculate(input({ageMode:'months',ageYears:2,ageMonths:0}));assert.equal(month.child.ageDays,731);assert.deepEqual(scores(month.result),scores(years.result));
    const half=engine.calculate(input({ageMode:'totalMonths',ageTotalMonths:'18,5'}));assert.equal(half.child.totalAgeMonths,18.5);assert.equal(half.child.ageDays,563);assert(half.result.warnings.includes('estimatedAge'));H.checkChild(half.child);H.checkPair(half.child,half.result);
    const translations=read('interface-translations.json');for(const language of ['fr','en','ar']){const row=PDF.model([half],{language,translations}).rows[0];for(const group of [row.measures,row.compactMeasures,row.briefMeasures])assert(group.some(text=>text.includes(translations[language].ageTotalMonths)));}
    const [headers,cells]=[...CSV.rows(CSV.results([half]))];assert.equal(cells[headers.indexOf('weight_g')],'12710');assert.equal(cells[headers.indexOf('height_cm')],'120');assert.equal(cells[headers.indexOf('ageMode')],'totalMonths');assert.equal(cells[headers.indexOf('age_estimated')],'true');
    for(const age of [-1,229,Infinity,'12,3x'])assert.throws(()=>engine.calculate(input({ageMode:'totalMonths',ageTotalMonths:age})));
    const whole=engine.calculate(input({growthProfile:'us',position:'H',ageMode:'totalMonths',ageTotalMonths:29}));assert.equal(whole.result.ageInMonths,29.5);assert.equal(whole.result.profileContext.agePrecision,'completedMonths');
    const fractional=engine.calculate(input({growthProfile:'us',position:'H',ageMode:'totalMonths',ageTotalMonths:'29,25'}));assert.equal(fractional.result.ageInMonths,29.25);assert.equal(fractional.result.profileContext.agePrecision,'exact');H.checkResult(fractional.result,new Set([fractional.child.id]));H.checkPair(fractional.child,fractional.result);
});
test('missing oedema and position permit WHO/CDC scores with explicit assumptions; present oedema still suspends weight scores',()=>{
    for(const extra of [{height:75},{ageDays:2000,height:110},{growthProfile:'us',ageDays:1000,height:90}]){
        const out=engine.calculate(input({...extra,oedema:'',position:''}));assert.equal(out.child.oedema,'');assert.equal(out.child.position,'');assert(Number.isFinite(out.result.heightForAge.zscore));assert(out.result.warnings.includes('oedemaUnknown'));
        const observed=engine.calculate({...out.child,oedema:'n'});assert.deepEqual(scores(out.result),scores(observed.result));for(const key of ['weightForAge','bmiForAge'])assert(Number.isFinite(out.result[key].zscore));const swollen=engine.calculate({...out.child,oedema:'y'});assert.equal(swollen.result.weightForAge.zscore,null);assert.equal(swollen.result.weightForAge.error,'oedemaWarning');
        const [headers,cells]=[...CSV.rows(CSV.results([out]))];assert.equal(cells[headers.indexOf('position')],'');assert.equal(cells[headers.indexOf('measurement_position_assumed')],'true');assert(cells[headers.indexOf('warnings')].includes('oedemaUnknown'));
        assert(out.result.nutrition.category!=='nutritionNoCriteria');H.checkChild(out.child);H.checkResult(out.result,new Set([out.child.id]));H.checkPair(out.child,out.result);
    }
    const missing=engine.calculate(input({position:'',oedema:'n',muac:130,weight:8500,height:75}));assert(missing.result.warnings.includes('positionAssumedLength'));assert(missing.result.nutrition.missing.includes('position'));assert.equal(missing.result.nutrition.category,'nutritionIncomplete');
    const known=engine.calculate(input({ageDays:731,position:'L',height:90}));assert.equal(known.result.correctedHeight,89.3);
});
test('INTERGROWTH keeps its own explicit length requirement while allowing independent head circumference and unit input',()=>{
    const out=engine.calculate(input({growthProfile:'intergrowth',ageMode:'pma',ageDays:'',postmenstrualDays:224,weight:'1,6',weightUnit:'kg',height:'0,42',heightUnit:'m',headCircumference:29,position:'',oedema:''}));
    assert.equal(out.child.weight,1600);assert.equal(out.child.height,42);assert.equal(out.result.weightForAge.error,'intergrowthOedemaUnknown');assert.equal(out.result.heightForAge.error,'intergrowthLengthRequired');assert(Number.isFinite(out.result.intergrowthContext.scores.headCircumferenceForAge.zscore));IG.checkChild(out.child);IG.checkPair(out.child,out.result);
});
test('FR EN AR individual/batch/correction forms order age modes and expose labelled decimal/unit controls',()=>{
    const translations=read('interface-translations.json');
    for(const language of ['fr','en','ar'])for(const prefix of ['single','batch','correction']){
        const app=Object.assign(Object.create(App.prototype),{translations,prefs:{language}}),html=app.formHTML(prefix,{...input(),weight:'12,71',weightUnit:'kg',height:'1,2',heightUnit:'m'});
        const options=[...html.matchAll(/<option value="(days|totalMonths|months|dates)"/g)].map(m=>m[1]);assert.deepEqual(options,['days','totalMonths','months','dates']);
        assert(html.includes(`id="${prefix}-weight" name="weight" type="text" inputmode="decimal"`));assert(html.includes(`name="weightUnit" aria-label="${app.t('weightUnit')}"`));assert(html.includes('value="kg" selected'));assert(html.includes('name="ageTotalMonths"'));
        const draft=app.previewDraft({...input(),weight:'12,71',weightUnit:'kg',height:'1,2',heightUnit:'m'},'single');assert(!draft.includes('<dt>'+app.t('weight')+'</dt>'));
        const preterm=app.formHTML(prefix,{...input(),growthProfile:'intergrowth'});assert(preterm.includes('name="headCircumference"'));assert(!preterm.includes('value="totalMonths"'));
    }
});
test('switching units converts the current input once while preserving invalid unfinished text',()=>{
    const app=Object.assign(Object.create(App.prototype),{state:{draft:{weightUnit:'g',heightUnit:'cm'}}}),field={value:'12710'},form={id:'single-form',querySelector:()=>field};
    app.changeMeasureUnit({name:'weightUnit',value:'kg',closest:()=>form});assert.equal(field.value,'12.71');app.state.draft.weightUnit='kg';app.changeMeasureUnit({name:'weightUnit',value:'kg',closest:()=>form});assert.equal(field.value,'12.71');
    field.value='1,';app.changeMeasureUnit({name:'heightUnit',value:'m',closest:()=>form});assert.equal(field.value,'0.01');field.value='unfinished';app.changeMeasureUnit({name:'weightUnit',value:'g',closest:()=>form});assert.equal(field.value,'unfinished');
});
async function workerHarness({badNetwork=false,offline=false}={}){
    const bytes=new TextEncoder().encode('FICTIF-VERIFIED'),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),handlers={},maps=new Map();let inFlight=0,maximum=0,requests=0,writes=0;
    const cache={async match(url){return maps.get(url)?.clone();},async put(url,response){writes++;maps.set(url,response.clone());}};
    const context={URL,Request,Response,crypto,Uint8Array,Map,Array,Promise,Error,self:{registration:{scope:'https://fictif.invalid/app/'},location:{origin:'https://fictif.invalid'},addEventListener:(k,v)=>handlers[k]=v},caches:{open:async()=>cache},fetch:async()=>{requests++;inFlight++;maximum=Math.max(maximum,inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;if(offline)throw Error('offline');return new Response(badNetwork?'FICTIF-CORRUPTED':'FICTIF-VERIFIED');}};
    const assets=Object.fromEntries(['./','index.html','js/a.js','js/b.js','js/c.js'].map(f=>[f,digest]));vm.runInNewContext('const RELEASE='+JSON.stringify({id:'FICTIF',assets})+';\n'+fs.readFileSync(path.join(__dirname,'../scripts/service-worker.template.js'),'utf8'),context);
    return {handlers,maps,context,stats:()=>({requests,writes,maximum}),cache};
}
test('service-worker install bounds concurrency and a corrupted release never writes a partial replacement',async()=>{
    const h=await workerHarness();let install;h.handlers.install({waitUntil:p=>install=p});await install;assert(h.stats().maximum<=3);assert.equal(h.stats().writes,5);
    const bad=await workerHarness({badNetwork:true});bad.maps.set('FICTIF-OLD-CACHE',new Response('FICTIF-HISTORICAL'));bad.handlers.install({waitUntil:p=>install=p});await assert.rejects(install,/mismatch/);assert.equal(bad.stats().writes,0);assert(bad.maps.has('FICTIF-OLD-CACHE'));
});
test('service-worker repairs a corrupt cached resource online and serves verified data offline without deleting caches',async()=>{
    const h=await workerHarness();h.maps.set('https://fictif.invalid/app/js/a.js',new Response('CORRUPT'));let response;h.handlers.fetch({request:{url:'https://fictif.invalid/app/js/a.js',method:'GET',mode:'cors'},respondWith:p=>response=p});assert.equal(await (await response).text(),'FICTIF-VERIFIED');assert.equal(h.stats().requests,1);
    const off=await workerHarness({offline:true});off.maps.set('https://fictif.invalid/app/index.html',new Response('FICTIF-VERIFIED'));off.handlers.fetch({request:{url:'https://fictif.invalid/app/new-path',method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.equal(await (await response).text(),'FICTIF-VERIFIED');assert.equal(off.stats().requests,0);
});
test('failure-screen repair checks/activates a worker without accessing patient stores; failure does not reload',async t=>{
    const before={navigator:Object.getOwnPropertyDescriptor(global,'navigator'),document:global.document,location:global.location};let reloads=0,registered=0;const status={textContent:''};
    global.document={baseURI:'https://fictif.invalid/app/',documentElement:{lang:'fr'},getElementById:()=>status};global.location={reload(){reloads++;}};
    Object.defineProperty(global,'navigator',{configurable:true,value:{serviceWorker:{register:async(url,options)=>{registered++;assert.equal(url,'https://fictif.invalid/app/sw.js');assert.equal(options.updateViaCache,'none');return {active:{state:'activated'},update:async()=>{}};}}}});
    t.after(()=>{if(before.navigator)Object.defineProperty(global,'navigator',before.navigator);else delete global.navigator;global.document=before.document;global.location=before.location;Guard.repairing=false;});
    await Guard.repair();assert.equal(registered,1);assert.equal(reloads,1);
    const waiting={state:'installed',postMessage(data,ports){assert.equal(data.type,'ACTIVATE_UPDATE');this.state='activated';ports[0].postMessage({status:'activating'});},addEventListener(){},removeEventListener(){}};
    navigator.serviceWorker.register=async()=>({active:{state:'activated'},waiting,update:async()=>{}});await Guard.repair();assert.equal(reloads,2);
    waiting.state='installed';waiting.postMessage=(data,ports)=>ports[0].postMessage({error:'updateOtherTabs'});await Guard.repair();assert.equal(reloads,2);
    navigator.serviceWorker.register=async()=>{throw Error('offline');};await Guard.repair();assert.equal(reloads,2);assert(status.textContent.includes('Ne supprimez pas les données'));
});
test('install prompt needs an explicit action, a ready offline copy and successful saving first',async t=>{
    const old=global.ReleaseGuard;let saves=0,prompts=0;const prompt={async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})};global.ReleaseGuard={installPrompt:prompt};t.after(()=>{if(old===undefined)delete global.ReleaseGuard;else global.ReleaseGuard=old;});
    const app=Object.assign(Object.create(App.prototype),{offlineState:'offlineLoading',toast(){},updateInstallStatus(){},async saveImmediate(){saves++;}});
    await app.installApp();assert.equal(prompts,0);assert.equal(saves,0);app.offlineState='offlineReady';app.saveImmediate=async()=>{throw Error('full');};await app.installApp();assert.equal(prompts,0);assert.equal(global.ReleaseGuard.installPrompt,prompt);
    app.saveImmediate=async()=>{saves++;};await app.installApp();assert.equal(prompts,1);assert.equal(saves,1);assert.equal(global.ReleaseGuard.installPrompt,null);
});

test('startup guard ignores extension/blob resource failures but still blocks pinned application resources',()=>{
    const handlers={},doc={baseURI:'https://fictif.invalid/app/',documentElement:{dataset:{}},addEventListener(){}};
    const context={URL,document:doc,window:{addEventListener:(key,fn)=>handlers[key]=fn},localStorage:{getItem:()=>null},matchMedia:()=>({matches:false})};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/js/workspace-bootstrap.js'),'utf8'),context);const guard=context.window.ReleaseGuard;let failures=0;guard.fail=()=>failures++;
    const element=(tag,attrs)=>({tagName:tag,getAttribute:key=>attrs[key]??null});const pin='sha256-'+Buffer.alloc(32).toString('base64');
    for(const el of [element('SCRIPT',{src:'blob:https://fictif.invalid/extension'}),element('SCRIPT',{src:'https://third.invalid/a.js',integrity:pin}),element('LINK',{rel:'stylesheet',href:'https://third.invalid/style.css'}),element('SCRIPT',{src:'js/unmanaged.js'}),{tagName:'DIV'}]){assert.equal(guard.isReleaseResource(el),false);handlers.error({target:el});}
    assert.equal(failures,0);
    for(const el of [element('SCRIPT',{src:'js/workspace-app.js',integrity:pin}),element('LINK',{rel:'stylesheet',href:'css/workspace.css',integrity:pin})]){assert.equal(guard.isReleaseResource(el),true);handlers.error({target:el});}
    assert.equal(failures,2);
});

test('initial data verification considers pinned application CSS and ignores unrelated injected stylesheets',async t=>{
    const old=global.document,failed=Guard.failed;Guard.failed=false;t.after(()=>{global.document=old;Guard.failed=failed;});const bytes=new TextEncoder().encode('FICTIF-DATA'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');let missing=false;
    global.document={querySelector:()=>({content:JSON.stringify({'data/fictif.json':hash})}),querySelectorAll:selector=>{assert.equal(selector,'link[rel="stylesheet"][integrity]');return [{sheet:missing?null:{}}];}};
    assert.equal((await Guard.verifyData(['data/fictif.json'],[new Response(bytes)])).texts[0],'FICTIF-DATA');missing=true;await assert.rejects(Guard.verifyData(['data/fictif.json'],[new Response(bytes)]),/releaseInvalid/);
});

test('legal source access points to the exact GitHub release without a local ZIP download control in FR EN AR',()=>{
    const {legalPages}=require('../scripts/build-legal.cjs'),pages=legalPages(),repo='https://github.com/mohamedoumarougarba-til227/nutritional-zscore-calculator';
    for(const [file,html]of Object.entries(pages)){assert(html.includes('href="'+repo+'"'));assert(html.includes(repo+'/releases/tag/v'+App.version));assert(!/href="data\/(?:zscore|who-data)-sources\.(?:zip|json)"/.test(html));assert(!html.includes('<details>'));for(const doc of ['PCIMA_NIGER_2023.md','PCIMA_NIGER_2025.md','PCIMA_SOURCES.json'])assert(html.includes(repo+'/blob/v'+App.version+'/docs/references/'+doc));if(file==='legal-ar.html')assert(html.includes('dir="rtl"'));}
});

test('PCIMA privacy/attribution is explicit in every language and GPL corresponding sources remain distributable offline',()=>{
    const {content}=require('../scripts/legal-content.cjs');
    for(const language of ['fr','en','ar']){const sections=content[language].sections;const privacy=sections.find(s=>s[0]==='privacy')[2].join(' '),sources=sections.find(s=>s[0]==='sources')[2].join(' ');assert(privacy.includes('PCIMA'));assert(sources.includes('2023')&&sources.includes('2025'));assert(sources.includes('GIGS'));}
    const assets=JSON.parse(fs.readFileSync('tools/scripts/offline-assets.json','utf8'));for(const file of ['data/zscore-sources.zip','data/zscore-sources.json','data/who-data-sources.zip'])assert(assets.includes(file));
});


test('native install promotion is not cancelled and a consumed offer is released',async()=>{
 const previous=Guard.installPrompt;let notified=0,prevented=0,resolve;
 try{
  const event={preventDefault(){prevented++;},userChoice:new Promise(r=>{resolve=r;})};
  Guard.captureInstallOffer(event,()=>notified++);
  assert.equal(prevented,0);assert.equal(Guard.installPrompt,event);assert.equal(notified,1);
  resolve({outcome:'dismissed'});await event.userChoice;
  assert.equal(Guard.installPrompt,null);assert.equal(notified,2);
 }finally{Guard.installPrompt=previous;}
});
