/** Loaded before the application; errors never authorize calculations or erase local work. */
class ReleaseGuard {
    static failed = false;
    static installPrompt = null;
    static captureInstallOffer(event,notify) {
        // Do not cancel the browser's native installation promotion.
        // Keep the optional in-app route while this offer is available.
        this.installPrompt=event;
        notify();
        if(event.userChoice&&typeof event.userChoice.then==='function'){
            const clear=()=>{if(this.installPrompt===event){this.installPrompt=null;notify();}};
            event.userChoice.then(clear,clear);
        }
    }
    static preferredLanguage(saved,legacy,languages=[],language='') {
        const supported=['fr','en','ar'];
        for(const choice of [saved,legacy])if(supported.includes(choice))return choice;
        for(const locale of [...(Array.isArray(languages)?languages:[]),language]){
            const base=typeof locale==='string'?locale.trim().toLowerCase().split(/[-_]/)[0]:'';
            if(supported.includes(base))return base;
        }
        return 'fr';
    }
    static isReleaseResource(target,baseURI=document.baseURI) {
        const script=target?.tagName==='SCRIPT',style=target?.tagName==='LINK'&&target.getAttribute('rel')==='stylesheet';
        if((!script&&!style)||!/^sha256-[A-Za-z0-9+/]{43}=$/.test(target.getAttribute('integrity')||''))return false;
        try{const base=new URL(baseURI),url=new URL(target.getAttribute(script?'src':'href'),base);return url.protocol===base.protocol&&url.origin===base.origin&&url.pathname.startsWith(new URL('.',base).pathname);}catch(_){return false;}
    }
    static waitWorker(worker,states) {
        if(states.includes(worker.state))return Promise.resolve();
        return new Promise((resolve,reject)=>{
            const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',inspect);error?reject(error):resolve();};
            const inspect=()=>{if(states.includes(worker.state))finish();else if(worker.state==='redundant')finish(Error('repairFailed'));};
            const timer=setTimeout(()=>finish(Error('repairFailed')),120000);worker.addEventListener('statechange',inspect);inspect();
        });
    }
    static async repair() {
        if(this.repairing)return;this.repairing=true;
        const lang=document.documentElement.lang,copy={fr:['Réparation des fichiers… Les dossiers et sauvegardes ne sont pas effacés.','Réparation impossible pour le moment. Vérifiez Internet et fermez les autres onglets de cette application, puis réessayez. Ne supprimez pas les données du site.'],en:['Repairing application files… Records and backups are not erased.','Repair is unavailable now. Check your connection and close other tabs of this app, then retry. Do not clear site data.'],ar:['جارٍ إصلاح ملفات التطبيق… لا تُحذف الملفات أو النسخ الاحتياطية.','تعذر الإصلاح حاليًا. تحقق من الإنترنت وأغلق علامات تبويب التطبيق الأخرى ثم أعد المحاولة. لا تمسح بيانات الموقع.']}[lang]||null;
        const messages=copy||['Repairing application files…','Repair failed. Do not clear site data.'],status=document.getElementById('release-repair-status');
        if(status)status.textContent=messages[0];
        try{
            if(!('serviceWorker' in navigator))throw Error('repairFailed');
            const registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI).href,{updateViaCache:'none'});
            await registration.update();
            let worker=registration.waiting||registration.installing;
            if(worker){await this.waitWorker(worker,['installed','activating','activated']);worker=registration.waiting||worker;
                if(worker.state==='installed')await new Promise((resolve,reject)=>{
                    const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('repairFailed'));},15000);
                    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.error?reject(Error(event.data.error)):resolve();};
                    worker.postMessage({type:'ACTIVATE_UPDATE'},[channel.port2]);
                });
                await this.waitWorker(worker,['activated']);
            }else if(!registration.active)throw Error('repairFailed');
            location.reload();
        }catch(_){if(status)status.textContent=messages[1];}
        finally{this.repairing=false;}
    }
    static async digest(bytes) {
        const hash=await crypto.subtle.digest('SHA-256',bytes);
        return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
    }
    static async verifyData(paths,responses) {
        if(this.failed||paths.length!==responses.length||responses.some(r=>!r.ok))throw new Error('releaseInvalid');
        if([...document.querySelectorAll('link[rel="stylesheet"][integrity]')].some(link=>!link.sheet))throw new Error('releaseInvalid');
        let pins;try{pins=JSON.parse(document.querySelector('meta[name="zscore-data-integrity"]')?.content||'{}');}catch(_){throw new Error('releaseInvalid');}
        const bytes=await Promise.all(responses.map(r=>r.arrayBuffer())),hashes=await Promise.all(bytes.map(b=>this.digest(b)));
        if(this.failed||paths.some((path,i)=>!Object.hasOwn(pins,path)||!/^[a-f0-9]{64}$/.test(pins[path])||hashes[i]!==pins[path]))throw new Error('releaseInvalid');
        return {texts:bytes.map(b=>new TextDecoder('utf-8',{fatal:true}).decode(b)),hashes};
    }
    static fail() {
        this.failed=true;
        const root=document.getElementById('app-root');if(!root)return;
        const lang=document.documentElement.lang;
        const messages={fr:['Les fichiers de cette version sont incomplets ou incohérents. Aucun calcul n’a été ouvert. Vos sauvegardes locales restent conservées. Réessayez lorsque la version complète est disponible.','Réessayer'],
            en:['This version has incomplete or inconsistent files. No calculator was opened. Your local backups are kept. Try again when the complete version is available.','Try again'],
            ar:['ملفات هذا الإصدار غير مكتملة أو غير متوافقة. لم تُفتح أداة الحساب. تبقى نسخك المحلية محفوظة. أعد المحاولة عندما يتوفر الإصدار الكامل.','أعد المحاولة']};
        const [message,label]=messages[lang]||messages.fr;
        root.textContent='';root.setAttribute('role','alert');root.className='startup';
        const p=document.createElement('p');p.textContent=message;
        const button=document.createElement('button');button.className='btn';button.textContent=label;button.addEventListener('click',()=>location.reload());
        const repair=document.createElement('button');repair.className='btn primary';repair.textContent=({fr:'Réparer les fichiers sans effacer mes données',en:'Repair files without erasing my data',ar:'إصلاح الملفات دون مسح بياناتي'})[lang]||'Repair files without erasing my data';repair.addEventListener('click',()=>this.repair());
        const status=document.createElement('p');status.id='release-repair-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
        root.append(p,repair,button,status);
    }
}
if(typeof module!=='undefined'&&module.exports)module.exports={ReleaseGuard};
else {window.ReleaseGuard=ReleaseGuard;
(() => {
    let prefs = {},legacy='';
    try { prefs = JSON.parse(localStorage.getItem('zscore-ui-v2') || '{}')||{}; } catch (_) { /* Settings are optional. */ }
    try { legacy=localStorage.getItem('zscore-app-language'); } catch (_) { /* Settings are optional. */ }
    const theme=['light','dark','system'].includes(prefs.theme)?prefs.theme:'system';
    const dark = theme === 'dark' || theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const device=typeof navigator==='undefined'?{}:navigator;
    document.documentElement.lang = ReleaseGuard.preferredLanguage(prefs.language,legacy,device.languages,device.language);
    document.documentElement.dir = document.documentElement.lang === 'ar' ? 'rtl' : 'ltr';
    window.addEventListener('beforeinstallprompt',event=>ReleaseGuard.captureInstallOffer(event,()=>window.dispatchEvent(new Event('zscore-install-ready'))));
    window.addEventListener('appinstalled',()=>{ReleaseGuard.installPrompt=null;window.dispatchEvent(new Event('zscore-install-ready'));});
    window.addEventListener('error',event=>{
        if(ReleaseGuard.isReleaseResource(event.target))ReleaseGuard.fail();
    },true);
    document.addEventListener('DOMContentLoaded',()=>{if(ReleaseGuard.failed)ReleaseGuard.fail();});
})();
}
