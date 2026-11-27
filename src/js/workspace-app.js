/** Public, local-first workspace: no administrator credentials and no remote mutation API. */
const NutritionUI=typeof module!=='undefined'&&module.exports?require('./services/nutrition-assessment.js').NutritionAssessment:globalThis.NutritionAssessment;
const SecureBackup=typeof module!=='undefined'&&module.exports?require('./services/encrypted-backup.js').EncryptedBackup:globalThis.EncryptedBackup;
const ReportingUI=typeof module!=='undefined'&&module.exports?require('./services/reporting-export.js').ReportingExport:globalThis.ReportingExport;
const SupplementaryUI=typeof module!=='undefined'&&module.exports?require('./services/supplementary-growth.js').SupplementaryGrowth:globalThis.SupplementaryGrowth;
const ProfileUI=typeof module!=='undefined'&&module.exports?require('./services/growth-profile.js').GrowthProfile:globalThis.GrowthProfile;
const PretermUI=typeof module!=='undefined'&&module.exports?require('./services/reference-intergrowth.js').IntergrowthPostnatal:globalThis.IntergrowthPostnatal;
const QualityUI=typeof module!=='undefined'&&module.exports?require('./services/lot-quality.js').LotQuality:globalThis.LotQuality;
const CentileUI=typeof module!=='undefined'&&module.exports?require('./services/percentile-display.js').PercentileDisplay:globalThis.PercentileDisplay;
const DateUI=typeof module!=='undefined'&&module.exports?require('./services/pdf-manager.js').PDFManager:typeof PDFManager!=='undefined'?PDFManager:null;
const DraftHistoryUI=typeof module!=='undefined'&&module.exports?require('./services/history-manager.js').HistoryManager:globalThis.HistoryManager;
class WorkspaceApp {
    static version = '5.14.0';
    static resultIndicators(result) { return result?.applicableIndicators||ClinicalEngine.indicators; }
    static draftForProfile(draft,profile) {
        ProfileUI.read({growthProfile:profile});
        return {...draft,growthProfile:profile,
            ageMode:profile==='intergrowth'&&['months','totalMonths'].includes(draft.ageMode)||profile!=='intergrowth'&&draft.ageMode==='pma'?'days':draft.ageMode};
    }
    static draftForAgeMode(draft,mode) {
        const next={...draft,ageMode:mode};
        if(next.growthProfile==='intergrowth'){
            if(mode==='pma')for(const key of ['ageDays','birthDate','gestationalAgeWeeks','gestationalAgeDays'])next[key]='';
            else next.postmenstrualDays='';
        }
        return next;
    }
    percentileHTML(value,result) {
        if (result?.schemaVersion!==4 || result.percentileVersion!==1 || !Number.isFinite(value?.zscore)) return '';
        const display=CentileUI.text(value,n=>this.number(n,1));
        const label=display===null?this.t('percentileExtreme'):this.t('percentileLabel')+' : '+display;
        return `<span class="centile" title="${this.esc(display===null?label:this.t('centileHelp'))}" aria-label="${this.esc(label)}"><bdi dir="ltr">P ${this.esc(display??'—')}</bdi></span>`;
    }
    constructor() {
        this.storage = new StorageManager(); this.history = new HistoryManager(this.storage);
        this.state = this.emptyWorkspace(); this.page = 'single'; this.historyPage = 0; this.search = '';
        this.batchPage = 0; this.singleEditing = false;
        this.sessions = []; this.preparedImport = null; this.saving = Promise.resolve();
        this.saveState = 'ready'; this.translations = null; this.engine = null; this.offlineState = 'offlineLoading';
        let prefs = {};
        try { prefs = JSON.parse(localStorage.getItem('zscore-ui-v2') || '{}'); } catch (_) { /* Keep work independent of optional settings. */ }
        this.prefs = { language: ['fr', 'en', 'ar'].includes(prefs.language) ? prefs.language : localStorage.getItem('zscore-app-language') || 'fr', theme: ['light', 'dark', 'system'].includes(prefs.theme) ? prefs.theme : 'system' };
        if (!['fr', 'en', 'ar'].includes(this.prefs.language)) this.prefs.language = 'fr';
        this.prefs.navCollapsed = prefs.navCollapsed === true;
        this.prefs.dateFormat=['auto','dmy','mdy','iso'].includes(prefs.dateFormat)?prefs.dateFormat:'auto';
        this.prefs.timeZone=DateUI.validTimeZone(prefs.timeZone)?prefs.timeZone:'system';
        this.prefs.growthProfile = ['us','intergrowth'].includes(prefs.growthProfile)?prefs.growthProfile:'who';
        this.prefs.careProtocol=WorkspaceApp.defaultCareProtocol(this.prefs.growthProfile,prefs.careProtocol);
        this.state = this.emptyWorkspace();
    }
    static defaultCareProtocol(profile,protocol){return profile==='who'&&['niger2023','niger2025'].includes(protocol)?protocol:'';}
    emptyDraft(growthProfile=this.prefs?.growthProfile||'who') { return { caseId: '', name: '', ageMode: growthProfile==='intergrowth'?'days':'months', postmenstrualDays:'', gestationalAgeWeeks:'', gestationalAgeDays:'', ageYears: '', ageMonths: '', ageTotalMonths:'', weightUnit:'g',heightUnit:'cm', ageDays: '', birthDate: '', measurementDate: ClinicalEngine.today(), weight: '', height: '', gender: '', position: '', oedema: '', growthProfile, careProtocol:WorkspaceApp.defaultCareProtocol(growthProfile,this.prefs?.careProtocol) }; }
    emptyWorkspace() { return { version: 1, draft: this.emptyDraft(), batchDraft: this.emptyDraft(), single: null, batch: [], paste: '', mode: 'single', stale: false }; }
    t(key) { const own=table=>table&&Object.hasOwn(table,key)&&typeof table[key]==='string'?table[key]:'';return own(this.translations?.[this.prefs.language])||own(this.translations?.fr)||String(key??''); }
    esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    transfers(){return this.transfer||=new TransferManager(this.storage);}
    transferStatus(done=null){const target=document.getElementById('transfer-status');if(target)target.textContent=done===null?'':typeof done==='number'?this.t('transferProgress').replace('{done}',this.number(done,0)):this.t('transferPreparing');}
    stagesHTML(){
        const info=this.stageInfo,busy=this.stageBusy||this.transferBusy;
        return `<h2 id="stage-copies-title">${this.t('stageTitle')}</h2><p class="hint">${this.t('stageHelp')}</p><div class="toolbar"><button class="btn" data-action="stage-local-copy" ${busy?'disabled':''}>${this.t('stageCreate')}</button><button class="btn" data-action="stage-refresh" ${busy?'disabled':''}>${this.t('stageRefresh')}</button></div>${this.stageBusy?`<p role="status">${this.t('transferPreparing')}</p>`:''}${info?.incomplete?`<p class="notice warn">${this.t('stageDiscoveryPartial')}</p>`:''}${!info?`<p class="meta">${this.t('stageNotLoaded')}</p>`:info.items.length?info.items.map(s=>`<article class="history-item"><div><div class="item-title"><bdi dir="auto">${this.esc(s.fileName||this.t('stageUnnamed'))}</bdi></div><p class="item-sub">${this.t(s.source==='local'?'stageLocal':'stageFile')} · ${this.date(s.createdAt)}<br>${this.t(s.status)} · ${this.formatBytes(s.bytes)}<br><bdi dir="ltr">${this.esc(s.name.slice(-12))}</bdi></p></div><button class="btn" data-action="stage-review" data-name="${this.esc(s.name)}" ${s.available&&!busy?'':'disabled'}>${this.t('stageReview')}</button></article>`).join(''):`<p>${this.t('stageEmpty')}</p>`}${info?`<div class="pagination"><button class="btn" data-action="stage-previous" ${busy||info.page===0?'disabled':''}>${this.t('previous')}</button><span role="status">${this.t('page')} ${info.page+1}/${info.pages} · ${info.total} ${this.t('stageCopies')}</span><button class="btn" data-action="stage-next" ${busy||info.page>=info.pages-1?'disabled':''}>${this.t('next')}</button></div>`:''}`;
    }
    async refreshStages(){
        if(this.stageBusy)return;this.stageBusy=true;const epoch=this.renderEpoch;
        const focus=document.activeElement?.dataset?.action;
        const update=()=>{if(epoch!==this.renderEpoch||this.page!=='history')return;const target=document.getElementById('stage-copies');if(target)target.innerHTML=this.stagesHTML();};update();
        try{this.stageInfo=await this.transfers().listStages(this.stagePage||0);this.stagePage=this.stageInfo.page;}
        catch(_){if(epoch===this.renderEpoch)this.toast('stageListFailed',true);}
        finally{this.stageBusy=false;update();if(['stage-refresh','stage-previous','stage-next'].includes(focus)&&epoch===this.renderEpoch)document.querySelector(`[data-action="${focus}"]`)?.focus();}
    }
    async createLocalCopy(){
        if(this.transferBusy||this.stageBusy)return;this.transferBusy=true;this.transferStatus(true);
        document.querySelectorAll('[data-action="export-backup"],[data-action="password-export"],[data-action="stage-local-copy"]').forEach(b=>{b.disabled=true;});
        try{
            await this.saveImmediate('beforeExport');await this.transfers().createLocalCopy(this.prefs,n=>this.transferStatus(n));this.stagePage=0;
            if(this.page==='history'){this.sessions=await this.history.catalog();this.renderHistoryList();}
            this.toast('stageCreated');
        }catch(_){this.toast('stageCopyFailed',true);}
        finally{this.transferBusy=false;this.transferStatus();document.querySelectorAll('[data-action="export-backup"],[data-action="password-export"],[data-action="stage-local-copy"]').forEach(b=>{b.disabled=false;});if(this.page==='history'){await this.refreshStages();await this.refreshCapacity();}}
    }
    showImportPreview(prepared,name,duplicate){
        this.preparedImport=prepared;this.importOverview={name,duplicate};const r=prepared.counts;
        const previews=prepared.previews||[];
        this.dialog('importPreview',`<p class="lede">${this.t('importHelp')}</p>${duplicate?`<p class="notice warn">${this.t('importDuplicate')}</p>`:''}<p><bdi dir="auto">${this.esc(name)}</bdi></p><div class="preview-grid import-counts">${['sessions','children','results'].map(k=>`<div class="card"><div class="stat">${r[k]}</div><div>${this.t(k)}</div></div>`).join('')}</div><p class="hint">${this.t('importCountsHelp')}</p>${previews.length?`<h3>${this.t('stageRecentVersions')}</h3><p class="hint">${this.t('stagePreviewHelp')}</p>${previews.map(p=>`<article class="history-item"><div><div class="item-title"><bdi>${this.esc(p.name||this.t('draft'))}</bdi></div><p class="item-sub">${this.date(p.createdAt)} · ${p.count} ${this.t('count')}</p></div><button class="btn" data-action="stage-preview-session" data-seq="${p.seq}">${this.t('preview')}</button></article>`).join('')}`:''}`,`<button class="btn primary" data-action="commit-import">${this.t('confirmImport')}</button>`);
    }
    async reviewStage(name){
        const epoch=this.renderEpoch,request=this.importRequest=(this.importRequest||0)+1;
        if(this.preparedImport?.format==='stream')this.transfers().release(this.preparedImport);this.preparedImport=null;let prepared;
        try{
            this.transferStatus(true);prepared=await this.transfers().resume(name,n=>{if(epoch!==this.renderEpoch||request!==this.importRequest)throw new Error('stageCancelled');this.transferStatus(n);});
            const duplicate=await this.transfers().hasImported(prepared);
            if(epoch!==this.renderEpoch||request!==this.importRequest){this.transfers().release(prepared);return;}
            const item=this.stageInfo?.items.find(s=>s.name===name);this.showImportPreview(prepared,item?.fileName||this.t('stageUnnamed'),duplicate);
        }catch(error){if(prepared)this.transfers().release(prepared);if(epoch===this.renderEpoch&&request===this.importRequest)this.toast(error.message,true);}
        finally{if(request===this.importRequest)this.transferStatus();}
    }
    async previewStageVersion(seq){
        const prepared=this.preparedImport;if(prepared?.format!=='stream')return;
        try{
            this.stagePreviewSession=await this.transfers().readPreview(prepared,seq,n=>{if(this.preparedImport!==prepared)throw new Error('stageCancelled');this.transferStatus(n);});
            if(this.preparedImport!==prepared)return;this.stagePreviewPage=0;this.renderStagePreview();
        }catch(error){if(this.preparedImport===prepared)this.toast(error.message,true);}
        finally{this.transferStatus();}
    }
    renderStagePreview(){
        const s=this.stagePreviewSession,w=s?.metadata?.workspace;if(!w)return;const entries=[...(w.single?[w.single]:[]),...(w.batch||[])],pages=Math.max(1,Math.ceil(entries.length/50));
        this.stagePreviewPage=Math.min(pages-1,Math.max(0,this.stagePreviewPage||0));const rows=entries.slice(this.stagePreviewPage*50,(this.stagePreviewPage+1)*50),paste=w.paste||'';
        const draft=(value,mode)=>{const html=this.previewDraft(value,mode);return html?`<details><summary>${this.t('draft')} · ${this.t(mode)}</summary>${html}</details>`:'';};
        this.dialog('preview',`<p class="lede">${this.t('stageReadOnly')}</p><p class="meta">${this.date(s.createdAt)}</p>${draft(w.draft,'single')}${draft(w.batchDraft,'batch')}${paste?`<details><summary>CSV</summary><p class="hint">${this.t('stagePastePreview')}</p><pre>${this.esc(paste.slice(0,4000))}</pre></details>`:''}${rows.length?`<div class="table-scroll">${this.tableHTML(rows)}</div>`:''}${w.single?this.resultsHTML(w.single,w.stale,true):''}`,`${this.paginationHTML({current:this.stagePreviewPage,pages,total:entries.length,from:entries.length?this.stagePreviewPage*50+1:0,to:Math.min(entries.length,(this.stagePreviewPage+1)*50)},{action:'stage-detail-page',previousAction:'stage-detail-previous',nextAction:'stage-detail-next'})}<button class="btn primary" data-action="stage-back">${this.t('stageBack')}</button>`);
    }
    date(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? DateUI.exportTimestamp(date,this.prefs.language,this.prefs?.timeZone,this.prefs?.dateFormat) : this.t('unknown'); }
    calendarDate(value) { try { ClinicalEngine.dateDays(value); return DateUI.detailedDate(value,this.prefs.language,this.prefs.dateFormat); } catch (_) { return this.t('unknown'); } }
    number(value, digits = 2) { return value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString(this.prefs.language, { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
    async init() {
        try {
            const paths=['data/interface-translations.json','data/who-manifest.json','data/who-official.json','data/who-2007-manifest.json','data/who-2007.json','data/who-additional-manifest.json','data/who-additional.json','data/cdc-growth-manifest.json','data/cdc-growth.json'];
            const responses=await Promise.all(paths.map(path=>fetch(path)));
            const {texts,hashes}=await ReleaseGuard.verifyData(paths,responses);
            this.translations=JSON.parse(texts[0]);
            const manifest=JSON.parse(texts[1]),text=texts[2];
            if(hashes[2]!==manifest.sha256)throw new Error('referenceInvalid');
            const olderManifest=JSON.parse(texts[3]);if(hashes[4]!==olderManifest.sha256)throw new Error('referenceInvalid');
            const additionalManifest=JSON.parse(texts[5]);if(hashes[6]!==additionalManifest.sha256)throw Error('referenceInvalid');
            const cdcManifest=JSON.parse(texts[7]);if(hashes[8]!==cdcManifest.sha256)throw Error('referenceInvalid');
            this.engine = new GrowthEngine(JSON.parse(text),JSON.parse(texts[4]),JSON.parse(texts[6]),JSON.parse(texts[8])); this.manifest = manifest;this.olderManifest=olderManifest;this.cdcManifest=cdcManifest;
            await this.storage.initialize(); this.sessions = await this.history.catalog();
            if(ReleaseGuard.failed)throw new Error('releaseInvalid');
            this.applyPreferences(); this.render(); this.events();
            window.addEventListener('online', () => this.updateConnection()); window.addEventListener('offline', () => this.updateConnection());
            window.addEventListener('zscore-install-ready',()=>this.updateInstallStatus());
            window.addEventListener('pagehide', () => this.checkpoint());
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.persistDraft(); });
            matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (this.prefs.theme === 'system') this.applyPreferences(); });
            await this.registerOffline();
        } catch (error) {
            if(!this.translations||error.message==='releaseInvalid'){ReleaseGuard.fail();console.error('Release verification failed',error);return;}
            const root = document.getElementById('app-root'); root.textContent = this.t(error.message) + ' — ' + this.t('error');
            root.setAttribute('role', 'alert'); console.error('Workspace initialization failed', error);
        }
    }
    applyPreferences() {
        document.documentElement.lang = this.prefs.language; document.documentElement.dir = this.prefs.language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.dataset.theme = this.prefs.theme === 'dark' || this.prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        document.documentElement.dataset.navCollapsed = String(!!this.prefs.navCollapsed);
        document.title = this.t('brand');
    }
    persistPreferences() {
        try { localStorage.setItem('zscore-ui-v2', JSON.stringify(this.prefs)); localStorage.setItem('zscore-app-language', this.prefs.language); }
        catch (error) { this.toast('unsaved', true); }
    }
    icon(name) {
        if (name === 'pdf' || name === 'csv') {
            const color = name === 'pdf' ? '#b42318' : '#176448';
            return `<svg class="ui-icon" data-format="${name}" viewBox="0 0 32 36" aria-hidden="true" focusable="false"><path d="M7 1h13l7 7v26H7Z" fill="#fff" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/><path d="M20 1v8h7" fill="none" stroke="${color}" stroke-width="1.8"/><rect x="1" y="17" width="30" height="14" rx="2" fill="${color}"/><text x="16" y="27.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="10" fill="#fff">${name.toUpperCase()}</text></svg>`;
        }
        const paths = {
            settings: '<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z"/><circle cx="12" cy="12" r="3"/>',
            export: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',
            language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
            light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
            dark: '<path d="M20.5 13.5A9 9 0 0 1 10.5 3a9 9 0 1 0 10 10.5Z"/>',
            system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/><circle cx="12" cy="10.5" r="3"/><path d="M12 7.5v6"/>',
            menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
            check: '<path d="m5 12 4 4L19 6"/>',
            close: '<path d="m6 6 12 12M6 18 18 6"/>',
            edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m13 6 5 5"/>',
            save: '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
            trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
            run: '<path d="m8 4 12 8-12 8V4Z"/>',
            plus: '<path d="M12 4v16M4 12h16"/>',
            new: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
            csv: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M3 15h18"/>',
            pdf: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
            compact: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M8 9v11M15 9v11M8 14h14"/>',
            print: '<path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 13h10v8H7zM17 10h1"/>',
            info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
            single: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h2M14 18h2"/>',
            batch: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
            history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
            references: '<path d="M12 5C8 2 4 3 3 4v16c3-2 6-2 9 0 3-2 6-2 9 0V4c-3-2-6-2-9 1Zm0 0v15"/>',
            chart: '<path d="M4 3v18h17M8 17v-5M13 17V7M18 17v-8"/>',
            previous: '<path d="m15 5-7 7 7 7"/>',
            next: '<path d="m9 5 7 7-7 7"/>'
        };
        return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
    }
    actionLabelHTML(key, desktopFormat = false) {
        const compactKey={resumeWork:'resumeCompact',newWork:'newWorkCompact',exportPDF:'exportPDFCompactLabel',exportCSV:'exportCSVCompactLabel',pdfShort:'exportPDFCompactLabel',csvShort:'exportCSVCompactLabel',editMeasures:'editCompact',showResults:'resultsTitle'}[key];
        const text=compactKey?`<span class="action-text-wide">${this.esc(this.t(key))}</span><span class="action-text-compact">${this.esc(this.t(compactKey))}</span>`:this.esc(this.t(key));
        if(!desktopFormat)return `<span class="action-label" aria-hidden="true">${text}</span>`;
        const desktopKey={exportPDF:'desktopExportFormat',exportCSV:'desktopExportFormat',importCSV:'desktopChooseFormat',csvTemplateShort:'desktopTemplateFormat',lotExport:'desktopSummaryFormat',lotExportOlder:'desktopSummaryOlderFormat'}[key];
        return `<span class="action-label format-action-label" aria-hidden="true"><span class="format-original-label">${text}</span><span class="format-desktop-label">${desktopKey?this.esc(this.t(desktopKey)):''}</span></span>`;
    }
    toolButton(label, icon, action = '', {disabled=false, primary=false, attrs='', submit=false, showLabel=false, labelKey=label} = {}) {
        const name=this.esc(this.t(label));
        const desktopFormat=showLabel&&['pdf','csv'].includes(icon)&&['exportPDF','exportCSV','pdfShort','csvShort','csvTemplateShort','lotExport','lotExportOlder'].includes(labelKey);
        return `<button type="${submit?'submit':'button'}" class="icon-button${primary?' primary':''}${showLabel?' action-with-label':''}${desktopFormat?' desktop-format-action':''}"${action?` data-action="${action}"`:''} title="${name}" aria-label="${name}" ${disabled?'disabled':''} ${attrs}>${this.icon(icon)}${showLabel?this.actionLabelHTML(labelKey,desktopFormat):''}</button>`;
    }
    infoButton(key, label, id = 'info-' + key) {
        return `<button type="button" id="${id}" class="field-info" data-action="show-info" data-info="${key}" aria-expanded="false" aria-controls="info-popup" aria-label="${this.esc(this.t('helpAbout')+' '+this.t(label))}">${this.icon('info')}</button>`;
    }
    showInfo(key, opener) {
        if(!['ageHint','weightHint','positionHint','intergrowthAgeHelp','intergrowthLengthRequired','usAgeHelp','csvHelp','bmiHelp','centileHelp','appInfo','scoreHelp','batchContext','growthProfileVisitHelp','clinicalHelp','pcimaHelp','pcima2025Help','intergrowthNoScreening','additionalMeasureHelp','referenceChartHelp','referenceChartHelpOlder','cdcChartHelp','cdcInterpretation','additionalResultHelp','intergrowthDescriptive','intergrowthUnsupportedMeasures','muacHelp','pcimaMuacHelp','pcima2025MuacHelp','qualityHelp','qualityExportHelp','analysisPreparationHelp','lotHelpWho','lotHelpOlder','lotHelpCdc','lotHelpIntergrowth'].includes(key))return;
        if(key!=='appInfo'){this.openInfo(key,opener);return;}
        this.closeInfo();this.closeChoice();
        const d=document.getElementById('header-dialog');d.dataset.opener=opener;
        d.classList.remove('mobile-actions-dialog');d.classList.add('app-info-dialog');
        const text=key==='appInfo'?`<p class="app-info-version"><strong>${this.esc(this.t('appVersionLabel'))} : v${this.esc(WorkspaceApp.version)}</strong></p>`+['appUsageNotice','free','scopeText','privacyText'].map(k=>`<p>${this.esc(this.t(k))}</p>`).join(''):key==='scoreHelp'?['weightForAge','heightForAge','weightForHeight','bmiForAge','bmiHelp','resultsIntro'].map(k=>`<p>${this.esc(this.t(k))}</p>`).join(''):`<p>${this.esc(this.t(key))}</p>`;
        d.innerHTML=`<div class="dialog-top"><h2 id="header-dialog-title">${this.t('aboutShort')}</h2>${this.toolButton('close','close','close-header')}</div><div class="dialog-body">${text}</div>`;
        d.showModal();
    }
    closeInfo(focus=false) {
        const active=this.activeInfo;if(!active)return;this.activeInfo=null;
        const popup=document.getElementById('info-popup');if(popup){if(popup.hidePopover&&popup.matches(':popover-open'))popup.hidePopover();popup.hidden=true;}
        const button=document.getElementById(active.opener);
        if(button){button.setAttribute('aria-expanded','false');if(active.description)button.setAttribute('aria-describedby',active.description);else button.removeAttribute('aria-describedby');if(focus)button.focus({preventScroll:true});}
    }
    openInfo(key,opener) {
        if(this.activeInfo?.opener===opener){this.closeInfo(true);return;}
        this.closeInfo();this.closeChoice();const button=document.getElementById(opener);if(!button)return;
        let popup=document.getElementById('info-popup');
        if(!popup){popup=document.createElement('div');popup.id='info-popup';popup.className='info-popup';popup.hidden=true;popup.setAttribute('popover','manual');popup.setAttribute('role','region');popup.setAttribute('aria-labelledby','info-popup-title');document.body.append(popup);}
        const lotRules={lotHelpWho:'lotRules',lotHelpOlder:'lotRulesOlder',lotHelpCdc:'cdcLotRules',lotHelpIntergrowth:'intergrowthDescriptive'};
        const keys=key==='scoreHelp'?['weightForAge','heightForAge','weightForHeight','bmiForAge','bmiHelp','resultsIntro']:lotRules[key]?['lotScope','lotIdentifiers',lotRules[key]]:[key];
        const messages=key==='batchContext'?this.batchContextNotes().map(n=>this.t(n.label).replace('{count}',this.number(n.count,0))+' '+this.t(n.key)):keys.map(k=>this.t(k));
        popup.innerHTML=`<div class="info-popup-top"><strong id="info-popup-title">${this.esc(this.t('information'))}</strong>${this.toolButton('close','close','close-info')}</div><div id="info-popup-text">${messages.map(text=>`<p>${this.esc(text)}</p>`).join('')}</div>`;
        popup.dir=document.documentElement.dir||'ltr';this.activeInfo={opener,description:button.getAttribute('aria-describedby')};button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby','info-popup-text');
        const rect=button.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight,width=Math.min(360,Math.max(0,vw-16));
        popup.style.width=width+'px';popup.style.maxHeight=Math.max(40,vh-16)+'px';popup.style.left=Math.max(8,Math.min(popup.dir==='rtl'?rect.right-width:rect.left,vw-width-8))+'px';popup.style.top=Math.max(8,Math.min(rect.bottom+6,vh-48))+'px';
        popup.hidden=false;if(popup.showPopover)popup.showPopover();const height=popup.getBoundingClientRect().height;
        if(rect.bottom+height+14>vh){const above=rect.top-14,below=vh-rect.bottom-14;if(above>below){popup.style.maxHeight=Math.max(40,above)+'px';popup.style.top=Math.max(8,rect.top-Math.min(height,above)-6)+'px';}else popup.style.maxHeight=Math.max(40,below)+'px';}
    }
    batchView() {
        const size=8,total=this.state.batch.length,pages=Math.max(1,Math.ceil(total/size));
        const current=Math.min(pages-1,Math.max(0,Number.isInteger(this.batchPage)?this.batchPage:0));
        return {current,pages,total,start:current*size,from:total?current*size+1:0,to:Math.min(total,(current+1)*size),entries:this.state.batch.slice(current*size,(current+1)*size)};
    }
    batchContextNotes() {
        const batch=this.state.batch,imported=batch.filter(e=>e.result?.imported).length,estimated=batch.filter(e=>e.result?.warnings?.includes('estimatedAge')).length;
        return [{key:'importedResult',label:'importedEntries',count:imported},{key:'estimatedAge',label:'estimatedAgeEntries',count:estimated}].filter(n=>n.count);
    }
    batchPagination(view) {
        if(!view.total)return '';
        return this.paginationHTML(view,{action:'batch-page',label:'batchPages'});
    }
    paginationRange(view,short=false) { return this.t(short?'paginationRangeShort':'paginationRange').replace('{from}',this.number(view.from,0)).replace('{to}',this.number(view.to,0)).replace('{total}',this.number(view.total,0)); }
    paginationHTML(view,{action,label='pagination',previousAction=action,nextAction=action,busy=false,statusId=''}={}) {
        const windowHTML=compact=>{
            const candidates=compact==='mobile'?[view.current,view.current===view.pages-1?view.current-1:view.current+1]:(view.pages<=5&&!compact?Array.from({length:view.pages},(_,i)=>i):[0,...(compact?[]:[view.current-1]),view.current,...(compact?[]:[view.current+1]),view.pages-1]);
            const pages=[...new Set(candidates.filter(p=>p>=0&&p<view.pages))].sort((a,b)=>a-b);
            return pages.map((p,i)=>`${i&&p>pages[i-1]+1?'<span class="page-gap" aria-hidden="true">…</span>':''}<button type="button" class="page-number" data-action="${action}" data-page="${p}" ${p===view.current?'aria-current="page"':''} ${busy?'disabled':''} aria-label="${this.esc(this.t('page')+' '+this.number(p+1,0))}">${this.number(p+1,0)}</button>`).join('');
        };
        return `<nav class="list-pagination" aria-label="${this.esc(this.t(label))}"><span ${statusId?`id="${statusId}"`:''} role="status" aria-live="polite" aria-atomic="true"><span class="range-wide">${this.esc(this.paginationRange(view))}</span><span class="range-mobile">${this.esc(this.paginationRange(view,true))}</span></span><div class="page-buttons">${this.toolButton('previous','previous',previousAction,{disabled:busy||view.current===0,attrs:`data-page="${view.current-1}"`})}<div class="page-window pager-wide">${windowHTML(false)}</div><div class="page-window pager-compact">${windowHTML(true)}</div><div class="page-window pager-mobile">${windowHTML("mobile")}</div>${this.toolButton('next','next',nextAction,{disabled:busy||view.current===view.pages-1,attrs:`data-page="${view.current+1}"`})}</div></nav>`;
    }
    focusPagination(action) {
        const buttons=document.querySelectorAll?.(`[data-action="${action}"][aria-current="page"]`);
        if(buttons)Array.from(buttons).find(b=>b.getClientRects().length)?.focus({preventScroll:true});
    }
    openHeaderPanel(kind) {
        if (!['language','theme','growthProfile','careProtocol','menu'].includes(kind)) return;
        if(kind!=='menu'){this.openChoice(kind+'-button',kind);return;}
        this.closeInfo();this.closeChoice();
        const d = document.getElementById('header-dialog');
        d.classList.remove('app-info-dialog','mobile-actions-dialog');
        const names = {fr:'Français',en:'English',ar:'العربية'};
        const options = kind === 'menu' ? ['single','batch','history','references','settings'] : kind === 'language' ? ['fr','en','ar'] : ['system','light','dark'];
        const current = kind === 'menu' ? this.page : this.prefs[kind];
        d.dataset.opener = kind + '-button';
        d.innerHTML = `<div class="dialog-top"><h2 id="header-dialog-title">${this.t(kind)}</h2><button class="icon-button" data-action="close-header" aria-label="${this.esc(this.t('close'))}">${this.icon('close')}</button></div><div class="dialog-body header-options">${options.map(value => `<button class="header-choice" data-action="${kind === 'menu' ? 'header-page' : 'set-preference'}" data-kind="${kind}" data-value="${value}" ${kind === 'menu' ? (current === value ? 'aria-current="page"' : '') : `aria-pressed="${current === value}"`}>${kind === 'theme' ? this.icon(value) : ''}<span class="choice-label"${kind === 'language' ? ` lang="${value}" dir="auto"` : ''}>${kind === 'language' ? names[value] : this.t(value)}</span>${current === value ? this.icon('check') : ''}</button>`).join('')}</div>`;
        document.getElementById(d.dataset.opener)?.setAttribute('aria-expanded','true');
        d.showModal();
        d.querySelector('[aria-pressed="true"],[aria-current="page"]')?.focus();
    }
    openMobileActions() {
        if(!['single','batch'].includes(this.page))return;
        this.closeInfo();this.closeChoice();
        const selector=this.page==='batch'?(document.getElementById('measure-card')?.hidden?'.batch-actions button':'.form-top-actions button'):this.state.single&&!this.singleEditing?'.result-toolbar button':'.form-top-actions button,.result-toolbar [data-action="show-results"]';
        const buttons=[...document.querySelectorAll('#page-content '+selector.split(',').join(',#page-content '))];
        const d=document.getElementById('header-dialog');d.classList.remove('app-info-dialog');d.classList.add('mobile-actions-dialog');d.dataset.opener='mobile-actions-button';
        d.innerHTML=`<div class="dialog-top"><h2 id="header-dialog-title">${this.t('mobileActions')}</h2>${this.toolButton('close','close','close-header')}</div><div class="mobile-actions-grid"></div>`;
        const grid=d.querySelector('.mobile-actions-grid');
        for(const button of buttons){const copy=button.cloneNode(true);copy.removeAttribute('id');grid.append(copy);}
        document.getElementById('mobile-actions-button')?.setAttribute('aria-expanded','true');d.showModal();
    }
    setPreference(kind, value) {
        const allowed = {language:['fr','en','ar'],theme:['system','light','dark'],growthProfile:['who','us','intergrowth'],careProtocol:['','niger2023','niger2025']};
        if (!Object.hasOwn(allowed,kind) || !allowed[kind].includes(value)) return;
        if(kind==='careProtocol'&&value&&this.prefs.growthProfile!=='who'){this.toast('pcimaProfileRequired',true);return;}
        this.readForms(); this.prefs[kind] = value;
        if(kind==='growthProfile')this.prefs.careProtocol=WorkspaceApp.defaultCareProtocol(value,this.prefs.careProtocol);
        this.persistPreferences(); this.applyPreferences();
        // Only blank drafts may inherit a preference. Existing visits and entered measurements are never changed.
        if(['growthProfile','careProtocol'].includes(kind))for(const key of ['draft','batchDraft']){
            const draft=this.state[key];if(!draft)continue;
            if(key==='draft'&&this.state.single)continue;
            const probe={...draft};
            // A preference alone is not a clinical observation; keep all other fields in the work check.
            delete probe.careProtocol;
            if(probe.growthProfile==='intergrowth'&&probe.ageMode==='days')probe.ageMode='months';
            if(!HistoryManager.hasWork({draft:probe})){
                if(kind==='growthProfile')this.state[key]=this.emptyDraft(value);
                else this.state[key]={...draft,careProtocol:WorkspaceApp.defaultCareProtocol(draft.growthProfile||'who',value)};
            }
        }
        document.getElementById('header-dialog').close(); this.render(kind + '-button');
    }
    choiceDisplay(select) {
        const value=select.selectedOptions[0]?.textContent||'';
        if(select.dataset?.choicePrefix)return select.dataset.choicePrefix+' ('+value+')';
        if(select.dataset?.choiceBirthLabel&&select.value==='dates')return select.dataset.choiceBirthLabel;
        return value;
    }
    enhanceSelects() {
        if(typeof document.querySelectorAll!=='function')return;
        for(const p of document.querySelectorAll('#single-form>p.hint,#batch-form>p.hint'))p.style.marginBlock='8px';
        for(const b of document.querySelectorAll('.additional-fields>[data-action="clear-unsupported-skinfolds"]'))b.style.marginBlockStart='10px';
        for(const select of document.querySelectorAll('#single-form select,#batch-form select')){
            if(select.hidden)continue;
            const label=select.labels?.[0],id=select.id+'-picker',valueId=id+'-value';
            if(label){label.id=select.id+'-label';label.htmlFor=id;}
            const button=document.createElement('button');button.type='button';button.id=id;button.className='choice-trigger'+(select.hasAttribute('data-title-choice')?' title-choice':'');
            button.dataset.action='open-select';button.dataset.select=select.id;button.setAttribute('role','combobox');
            button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls','choice-popup');button.setAttribute('aria-expanded','false');
            button.setAttribute('aria-labelledby',[label?.id,valueId].filter(Boolean).join(' '));
            if(select.hasAttribute('aria-describedby'))button.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
            button.innerHTML=`<span id="${valueId}" class="choice-value">${this.esc(this.choiceDisplay(select))}</span><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>`;
            select.before(button);select.hidden=true;
        }
    }
    choicePopup() {
        let popup=document.getElementById('choice-popup');
        if(!popup){popup=document.createElement('div');popup.id='choice-popup';popup.className='choice-popup';popup.hidden=true;popup.setAttribute('role','listbox');popup.setAttribute('popover','manual');document.body.append(popup);}
        return popup;
    }
    closeChoice(focus=false) {
        const active=this.activeChoice;if(!active)return;
        this.activeChoice=null;
        const popup=document.getElementById('choice-popup');
        if(popup){if(popup.hidePopover&&popup.matches(':popover-open'))popup.hidePopover();popup.hidden=true;}
        const button=document.getElementById(active.buttonId);button?.setAttribute('aria-expanded','false');
        if(focus)button?.focus({preventScroll:true});
    }
    openChoice(buttonId,kind,selectId='') {
        this.closeInfo();
        if(this.activeChoice?.buttonId===buttonId){this.closeChoice(true);return;}
        this.closeChoice();
        const button=document.getElementById(buttonId);if(!button)return;
        const select=selectId?document.getElementById(selectId):null;
        if(!select&&!['language','theme','growthProfile','careProtocol'].includes(kind))return;
        const names={fr:'Français',en:'English',ar:'العربية'};
        const options=select?[...select.options].map(o=>({value:o.value,label:o.textContent,disabled:o.disabled})):(kind==='language'?['fr','en','ar']:kind==='growthProfile'?['who','us','intergrowth']:kind==='careProtocol'?['','niger2025','niger2023']:['system','light','dark']).map(value=>({value,label:kind==='language'?names[value]:this.t(kind==='growthProfile'?value==='intergrowth'?'profileINTERGROWTH':value==='us'?'profileUS':'profileWHO':kind==='careProtocol'?value==='niger2025'?'careNiger2025':value==='niger2023'?'careNiger2023':'careWHO':value),disabled:kind==='careProtocol'&&!!value&&this.prefs.growthProfile!=='who'}));
        const current=select?select.value:this.prefs[kind],popup=this.choicePopup();
        popup.dir=document.documentElement.dir||'ltr';popup.setAttribute('aria-label',select?(document.getElementById(select.id+'-label')?.textContent||''):this.t(kind==='careProtocol'?'careProtocolDefault':kind==='growthProfile'?'growthProfileDefault':kind));
        popup.innerHTML=options.map(o=>`<button type="button" role="option" aria-selected="${o.value===current}" tabindex="${o.value===current?'0':'-1'}" data-action="choice-value" data-value="${this.esc(o.value)}" ${o.disabled?'disabled':''}>${kind==='theme'?this.icon(o.value):''}<span${kind==='language'?` lang="${o.value}" dir="auto"`:''}>${this.esc(o.label)}</span>${o.value===current?this.icon('check'):''}</button>`).join('');
        this.activeChoice={buttonId,kind,selectId};button.setAttribute('aria-expanded','true');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls','choice-popup');
        const rect=button.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight,width=Math.min(Math.max(rect.width,180),Math.max(0,vw-16));
        popup.style.width=width+'px';popup.style.maxHeight=Math.min(320,vh-16)+'px';
        popup.style.left=Math.max(8,Math.min(popup.dir==='rtl'?rect.right-width:rect.left,vw-width-8))+'px';
        popup.style.top=Math.max(8,Math.min(rect.bottom+4,vh-48))+'px';
        popup.hidden=false;if(popup.showPopover)popup.showPopover();
        const height=popup.getBoundingClientRect().height;
        if(rect.bottom+height+12>vh){
            const below=vh-rect.bottom-12,above=rect.top-12;
            if(above>below){popup.style.maxHeight=Math.max(36,Math.min(320,above))+'px';popup.style.top=Math.max(8,rect.top-Math.min(height,above)-4)+'px';}
            else popup.style.maxHeight=Math.max(36,below)+'px';
        }
        (popup.querySelector('[aria-selected="true"]:not(:disabled)')||popup.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
    }
    chooseValue(value) {
        const active=this.activeChoice;if(!active)return;
        const select=active.selectId?document.getElementById(active.selectId):null;
        if(select){
            if(![...select.options].some(o=>o.value===value&&!o.disabled))return;
            if(select.value===value){this.closeChoice(true);return;}
            select.value=value;
            const display=document.getElementById(active.buttonId+'-value');if(display)display.textContent=this.choiceDisplay(select);
            this.closeChoice(true);
            select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));
        }else{this.closeChoice();this.setPreference(active.kind,value);}
    }
    choiceKey(event) {
        const popup=document.getElementById('choice-popup');
        if(this.activeChoice){
            if(event.key==='Escape'){event.preventDefault();this.closeChoice(true);return;}
            if(event.key==='Tab'){this.closeChoice(true);return;}
            if(!popup?.contains(event.target))return;
            const options=[...popup.querySelectorAll('button:not(:disabled)')],index=options.indexOf(document.activeElement);
            let target;
            if(event.key==='ArrowDown')target=options[(index+1)%options.length];
            else if(event.key==='ArrowUp')target=options[(index-1+options.length)%options.length];
            else if(event.key==='Home')target=options[0];else if(event.key==='End')target=options.at(-1);
            else if(event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
                const now=Date.now();this.choiceSearch=now-(this.choiceSearchTime||0)<700?(this.choiceSearch||'')+event.key:event.key;this.choiceSearchTime=now;
                target=options.find(o=>o.textContent.trim().toLocaleLowerCase().startsWith(this.choiceSearch.toLocaleLowerCase()));
            }
            if(target){event.preventDefault();options.forEach(o=>o.tabIndex=-1);target.tabIndex=0;target.focus();}
        }else if(['ArrowDown','ArrowUp'].includes(event.key)){
            const button=event.target.closest('[data-action="open-select"],[data-action="header-panel"]');
            if(button&&button.dataset.kind!=='menu'){event.preventDefault();this.openChoice(button.id,button.dataset.kind||'field',button.dataset.select||'');}
        }
    }
    render(focusId = '') {
        this.closeChoice();this.closeInfo();
        this.renderEpoch = (this.renderEpoch || 0) + 1;
        document.getElementById('app-root').innerHTML = `
            <a class="skip" href="#main">${this.t('skip')}</a>
            <header class="topbar workspace-topbar"><div class="brand-group"><button id="sidebar-button" class="brand-mark brand-toggle" data-action="toggle-sidebar" aria-controls="main-nav" aria-expanded="${!this.prefs.navCollapsed}" title="${this.esc(this.t(this.prefs.navCollapsed?'expandMenu':'collapseMenu'))}" aria-label="${this.esc(this.t('brand')+' · '+this.t(this.prefs.navCollapsed?'expandMenu':'collapseMenu'))}">Z</button><button id="menu-button" class="brand-mark mobile-menu-button" data-action="header-panel" data-kind="menu" aria-haspopup="dialog" aria-controls="header-dialog" aria-expanded="false" aria-label="${this.esc(this.t('brand')+' · '+this.t('menu'))}">Z</button><div class="workspace-context"><div class="page-title-group"><h1>${this.t(this.page)}</h1></div><div class="workspace-status-line">${['single','batch'].includes(this.page)?'<span class="save-state" data-save-state aria-live="polite"></span>':''}<span id="connection" class="connection-badge" role="status"></span></div></div></div><div class="workspace-heading-actions">${['single','batch'].includes(this.page)?`${this.toolButton('resumeWork','history','page',{showLabel:true,attrs:'data-page="history" data-history-pane="versions"'})}${this.toolButton('newWork','new','new',{showLabel:true})}`:''}</div></header>
            <div class="shell"><aside class="sidebar"><nav id="main-nav" class="nav" aria-label="${this.t('brand')}">${['single','batch','history','references','settings'].map(p => `<button data-action="page" data-page="${p}" title="${this.esc(this.t(p))}" aria-label="${this.esc(this.t(p))}" ${this.page === p ? 'aria-current="page"' : ''}>${this.icon(p)}<span class="nav-text">${this.t(p)}</span></button>`).join('')}</nav></aside>
            <main id="main" tabindex="-1"><div class="print-header"><h2>${this.t('brand')}</h2><p>${this.t('appUsageNotice')}</p></div>
              <div id="update-notice">${this.updateHTML()}</div>
              <div id="page-content">${this.page === 'single' ? this.singleHTML() : this.page === 'batch' ? this.batchHTML() : this.page === 'history' ? this.historyHTML() : this.page === 'settings' ? this.settingsHTML() : this.referencesHTML()}</div>
              ${this.history.recoveryErrors.length ? `<div class="notice warn" role="alert">${this.t('recoveryDamaged')}</div>` : ''}
              <footer class="compact-footer"><a class="feedback-footer-link" href="${this.prefs.language==='ar'?'https://tally.so/r/GeKzve':this.prefs.language==='en'?'https://tally.so/r/o9Dy6b':'https://tally.so/r/bZ9xb7'}" target="_blank" rel="noopener noreferrer" title="${this.esc(this.prefs.language==='ar'?'يتطلب الاتصال بالإنترنت':this.prefs.language==='en'?'External feedback form — internet required':'Formulaire externe — connexion Internet requise')}"><span class="mobile-label-wide">${this.esc(this.prefs.language==='ar'?'إرسال ملاحظة أو الإبلاغ عن مشكلة':this.prefs.language==='en'?'Send feedback or report a problem':'Donner un avis ou signaler un problème')}</span><span class="mobile-label-short">${this.esc(this.t('mobileFeedbackShort'))}</span></a><a class="github-footer-link" href="https://github.com/mohamedoumarougarba-til227/nutritional-zscore-calculator" target="_blank" rel="noopener noreferrer" title="${this.esc(this.t('githubProjectHelp'))}">${this.t('githubProject')}</a><div class="footer-meta"><a class="legal-footer-link" href="${this.prefs.language==='ar'?'legal-ar.html':this.prefs.language==='en'?'legal-en.html':'legal.html'}" target="_blank" rel="noopener noreferrer"><span class="mobile-label-wide">${this.t('legalNoticeLink')}</span><span class="mobile-label-short">${this.t('mobileLegal')}</span></a><span class="footer-version">v${WorkspaceApp.version}</span></div><div class="footer-offline"><span class="mobile-label-wide" data-offline-status>${this.t(this.offlineState)}</span><span class="mobile-label-short" data-mobile-offline-status>${this.t(this.offlineState==='offlineFailed'?'mobileOfflineFailed':this.offlineState)}</span><span class="about-label">${this.t('aboutShort')}</span>${this.toolButton('information','info','show-info',{attrs:'id="app-info-button" data-info="appInfo"'})}</div></footer>
            </main></div>${['single','batch'].includes(this.page)?`<nav class="mobile-action-dock" aria-label="${this.esc(this.t('mobileActions'))}"><button id="mobile-actions-button" class="btn primary" data-action="mobile-actions" aria-haspopup="dialog" aria-controls="header-dialog" aria-expanded="false">${this.icon('batch')}<span>${this.t('mobileActions')}</span></button></nav>`:''}`;
        this.observeHeader();
        this.updateConnection(); this.updateSaveStatus(); this.updateToast(); this.syncImportNotice();
        if (this.page === 'history') this.renderHistoryList();
        if (this.page === 'history') this.refreshCapacity();
        if (this.page === 'single' && this.state.single?.result) this.renderFollowup().catch(error=>console.warn('Follow-up read failed',error));
        this.enhanceSelects();
        this.updateCSVControls();
        if(this.page==='batch')this.syncBatchSelection();
        if(focusId)document.getElementById(focusId)?.focus();
    }
    observeHeader() {
        this.headerObserver?.disconnect();
        const header=document.querySelector('.workspace-topbar');
        if(!header)return;
        const measure=()=>document.documentElement.style.setProperty('--workspace-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
        measure();
        if(typeof ResizeObserver==='function'){this.headerObserver=new ResizeObserver(measure);this.headerObserver.observe(header);}
    }
    installHTML() {
        const ready=this.offlineState==='offlineReady',prompt=globalThis.ReleaseGuard?.installPrompt;
        return `<section class="card settings-install"><h2>${this.icon('system')}${this.t('installHelp')}</h2><p role="status">${this.t(ready?'installReady':'installPending')}</p>${prompt?`<button class="btn primary" data-action="install-app" ${ready?'':'disabled'}>${this.t('installApp')}</button>`:''}<details class="settings-install-guide"><summary>${this.t('installInstructionsTitle')}</summary><p>${this.t('installInstructions')}</p></details></section>`;
    }
    updateInstallStatus(){const section=document.getElementById('install-status');if(section)section.innerHTML=this.installHTML();}
    async installApp(){
        const prompt=globalThis.ReleaseGuard?.installPrompt;if(!prompt){this.toast('installUnavailable');return;}
        if(this.offlineState!=='offlineReady'){this.toast('installPending');return;}
        let prompted=false;try{await this.saveImmediate('beforeInstall',true);prompted=true;await prompt.prompt();await prompt.userChoice;}
        catch(_){this.toast('installUnavailable',true);}
        finally{if(prompted&&globalThis.ReleaseGuard?.installPrompt===prompt)globalThis.ReleaseGuard.installPrompt=null;this.updateInstallStatus();}
    }
    dateSettingsHTML() {
        const labels={fr:{zone:'Fuseau horaire',format:'Format des dates',system:'Automatique (appareil)',auto:'Automatique (langue)',help:'Ces préférences modifient l’affichage, jamais les dates de naissance ni les mesures enregistrées. Les champs de date natifs suivent les réglages du navigateur.'},en:{zone:'Time zone',format:'Date format',system:'Automatic (device)',auto:'Automatic (language)',help:'These preferences change display, never recorded birth dates or measurements. Native date fields follow browser settings.'},ar:{zone:'المنطقة الزمنية',format:'تنسيق التاريخ',system:'تلقائي (الجهاز)',auto:'تلقائي (اللغة)',help:'تغيّر هذه الإعدادات العرض فقط دون تغيير تواريخ الميلاد أو القياسات المحفوظة. تتبع حقول التاريخ الأصلية إعدادات المتصفح.'}}[this.prefs.language];
        const zones=[...new Set(['UTC','Africa/Niamey',Intl.DateTimeFormat().resolvedOptions().timeZone,this.prefs.timeZone,...(Intl.supportedValuesOf?.('timeZone')||[])])].filter(v=>v&&v!=='system'&&DateUI.validTimeZone(v)).sort();
        const select=(key,label,choices)=>'<div class="setting-row"><label for="'+key+'-button">'+this.esc(label)+'</label><select class="choice-trigger" id="'+key+'-button" data-date-preference="'+key+'">'+choices.map(([v,name])=>'<option value="'+this.esc(v)+'"'+(this.prefs[key]===v?' selected':'')+'>'+this.esc(name)+'</option>').join('')+'</select></div>';
        return select('timeZone',labels.zone,[['system',labels.system],...zones.map(v=>[v,v])])+select('dateFormat',labels.format,[['auto',labels.auto],['dmy','JJ/MM/AAAA · DD/MM/YYYY'],['mdy','MM/DD/YYYY'],['iso','YYYY-MM-DD']])+'<p class="hint">'+this.esc(labels.help)+'</p>';
    }
    settingsHTML() {
        const names={fr:'Français',en:'English',ar:'العربية'};
        const label=kind=>kind==='growthProfile'?'growthProfileDefault':kind==='careProtocol'?'careProtocolDefault':kind;
        const value=kind=>kind==='language'?names[this.prefs.language]:this.t(kind==='growthProfile'?this.prefs.growthProfile==='intergrowth'?'profileINTERGROWTH':this.prefs.growthProfile==='us'?'profileUS':'profileWHO':kind==='careProtocol'?this.prefs.careProtocol==='niger2025'?'careNiger2025':this.prefs.careProtocol==='niger2023'?'careNiger2023':'careWHO':this.prefs.theme);
        const picker=kind=>`<div class="setting-row"><label id="${kind}-label" for="${kind}-button">${this.t(label(kind))}</label><button id="${kind}-button" class="choice-trigger" data-action="header-panel" data-kind="${kind}" aria-haspopup="listbox" aria-controls="choice-popup" aria-expanded="false" aria-labelledby="${kind}-label ${kind}-value">${this.icon(kind==='theme'?this.prefs.theme:kind==='careProtocol'?'references':'language')}<span class="choice-value" id="${kind}-value"${kind==='language'?' dir="auto"':''}>${this.esc(value(kind))}</span><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>`;
        return `<div class="settings-layout"><section class="card settings-card settings-preferences" aria-labelledby="settings-preferences-title"><h2 id="settings-preferences-title">${this.icon('settings')}${this.t('settingsPreferences')}</h2><p class="hint">${this.t('settingsHelp')}</p><div class="settings-grid">${picker('language')}${picker('theme')}${this.dateSettingsHTML()}</div></section><section class="card settings-card settings-clinical" aria-labelledby="settings-clinical-title"><h2 id="settings-clinical-title">${this.icon('references')}${this.t('settingsClinical')}</h2><div class="settings-grid">${picker('growthProfile')}${picker('careProtocol')}</div><p class="hint">${this.t('growthProfileDefaultHelp')}</p><p class="hint">${this.t('careProtocolDefaultHelp')}</p></section><section class="card settings-update" aria-labelledby="settings-update-title"><h2 id="settings-update-title">${this.icon('history')}${this.t('settingsUpdates')}</h2><p class="settings-version">${this.t('updateCurrent').replace('{version}',WorkspaceApp.version)}</p><p class="hint">${this.t('settingsUpdateHelp')}</p><div id="settings-update-status">${this.updateSettingsHTML()}</div></section><div id="install-status">${this.installHTML()}</div></div>`;
    }
    resultHeadingHTML(entry) {
        const child=entry?.child;
        return `<div class="results-heading-group"><h2 id="results-title" class="flow-focus" tabindex="-1">${this.t('resultsTitle')}</h2>${child?`<div class="result-status"><strong><bdi>${this.esc(child.name || child.caseId || this.t('unknown'))}</bdi></strong>${entry.result.status!=='complete'?`<span class="badge">${this.esc(this.t(entry.result.status))}</span>`:''}</div>${this.infoButton('centileHelp','percentileLabel')}`:''}</div>`;
    }
    profileDetailsHTML(child,result) {
        if(!child?.growthProfile&&!result?.profileContext)return '';
        const e=v=>this.esc(v),t=k=>e(this.t(k)),context=result?.profileContext;
        if(result?.intergrowthContext){const a=result.intergrowthContext.age;return `<div class="profile-context"><p>${t('profileINTERGROWTH')}</p><p>${t('postmenstrualDays')} : ${e(a.postmenstrualDays)} · ${t('ageDays')} : ${e(a.chronologicalDays??this.t('unknown'))} · ${t('birthGestationDays')} : ${e(a.birthGestationDays??this.t('unknown'))}</p><p>${t('intergrowthDescriptive')}</p></div>`;}
        const policy=child.growthProfile==='us'||context?.profile==='us'?'profileUS':'profileWHO';
        const ages=context?`<p>${t('reportedAgeMonths')} : ${e(this.number(context.reportedAgeInMonths,3))} · ${t('calculationAgeMonths')} : ${e(this.number(result.ageInMonths,3))} · ${t('agePrecision')} : ${t(context.agePrecision)}</p>`:'';
        const methods=result?.referenceFamily==='CDC2000'?`<p>${t('cdcInterpretation')}</p>${['weightForAge','heightForAge','bmiForAge'].filter(k=>result[k]?.method).map(k=>`<p>${t(k)} : ${e(result[k].method)} · ${t('modifiedZscore')} : ${e(this.number(result[k].modifiedZscore,3))}</p>`).join('')}${Number.isFinite(result.bmiForAge?.percentOfP95)?`<p>${t('percentOfP95')} : ${e(this.number(result.bmiForAge.percentOfP95,1))} %</p>`:''}`:'';
        return `<div class="profile-context"><p>${t('growthProfile')} : ${t(policy)}</p>${ages}${methods}</div>`;
    }
    resultActionsHTML(child) {
        const exports=()=>`${this.toolButton('exportPDF','pdf','export-pdf',{disabled:this.pdfBusy,showLabel:true})}${this.toolButton('exportCSV','csv','csv-results',{showLabel:true})}`;
        const editing=!!this.singleEditing;
        return `<div class="toolbar compact-toolbar result-toolbar">${this.toolButton('print','print','print',{showLabel:true})}${exports()}${child.caseId?this.toolButton('newVisit','plus','new-visit',{showLabel:true,labelKey:'newVisitShort'}):''}<button id="single-view-toggle" class="icon-button action-with-label" data-action="${editing?'show-results':'edit-measures'}" aria-controls="measure-card" aria-expanded="${editing}" title="${this.esc(this.t(editing?'showResults':'editMeasures'))}" aria-label="${this.esc(this.t(editing?'showResults':'editMeasures'))}">${this.icon(editing?'chart':'edit')}${this.actionLabelHTML(editing?'showResults':'editMeasures')}</button>${!editing?this.toolButton('saveNow','save','save',{showLabel:true,labelKey:'saveShort'}):''}</div>`;
    }
    // Preserve the current disclosure when a profile/protocol rebuilds the same mobile entry form.
    renderEntryProfile(prefix,focusId) {
        const mobile=typeof matchMedia==='function'&&matchMedia('(max-width: 680px)').matches;
        const section=()=>document.getElementById(prefix+'-form')?.querySelector?.('.clinical-fields');
        const previous=mobile?section()?.open:undefined;
        this.render(focusId);
        if(typeof previous==='boolean'){const next=section();if(next)next.open=previous;}
    }
    /** The postnatal model does not calculate skinfold Z-scores. Preserve existing values until explicitly cleared. */
    formSectionSummary(prefix,title,help,brief='') {
        return `<summary class="form-section-summary" data-section-title="${this.esc(title)}"><span class="form-section-title">${this.t(title)}</span>${this.infoButton(help,title,`${prefix}-${help}-section-info`)}${brief?`<span class="form-section-brief">${this.esc(this.t(brief))}</span>`:''}</summary>`;
    }
    static compactEntryForm(prefix){return prefix==='single'||prefix==='batch';}
    static desktopSingleSections(prefix){return prefix==='single'&&typeof matchMedia==='function'&&matchMedia('(min-width: 681px)').matches;}
    additionalFormHTML(prefix,data,ig,field) {
        const skinfolds=['tricepsSkinfold','subscapularSkinfold'];
        const hasSkinfolds=skinfolds.some(key=>SupplementaryUI.present(data[key]));
        if(ig&&!hasSkinfolds)return '';
        const open=WorkspaceApp.desktopSingleSections(prefix)||(ig?hasSkinfolds:SupplementaryUI.fields.some(key=>SupplementaryUI.present(data[key])));
        const summaryKey=!ig&&data.growthProfile==='us'?'additionalMeasuresWho':'additionalMeasures';
        const numeric='min="1.8" max="40" step="0.1" inputmode="decimal"';
        const fields=(ig?'':field('headCircumference','number','min="25" max="64" step="0.1" inputmode="decimal"'))
            +field('tricepsSkinfold','number',numeric)+field('subscapularSkinfold','number',numeric);
        const clear=ig?`<button type="button" class="btn" data-action="clear-unsupported-skinfolds" data-prefix="${prefix}">${this.t('clearUnsupportedSkinfolds')}</button>`:'';
        return `<details class="additional-fields"${open?' open':''}>${WorkspaceApp.compactEntryForm(prefix)?this.formSectionSummary(prefix,summaryKey,ig?'intergrowthUnsupportedMeasures':'additionalMeasureHelp',ig?'intergrowthUnsupportedMeasures':''):`<summary>${this.t(summaryKey)}</summary><p class="hint">${this.t(ig?'intergrowthUnsupportedMeasures':'additionalMeasureHelp')}</p>`}<div class="form-grid">${fields}</div>${clear}</details>`;
    }
    formHTML(prefix, data, batch = false) {
        const ig=data.growthProfile==='intergrowth',compact=WorkspaceApp.compactEntryForm(prefix);
        const clinicalHelp=data.careProtocol==='niger2025'?'pcima2025Help':data.careProtocol==='niger2023'?'pcimaHelp':ig?'intergrowthNoScreening':'clinicalHelp';
        const clinicalBrief=ig?'uiClinicalPretermBrief':data.careProtocol==='niger2023'||data.careProtocol==='niger2025'?'uiClinicalPcimaBrief':'uiClinicalWhoBrief';
        const ageHelp=ig?'intergrowthAgeHelp':data.growthProfile==='us'?'usAgeHelp':'ageHint',positionHelp=ig?'intergrowthLengthRequired':'positionHint';
        const labelKey=key=>({caseId:'caseShort',name:'nameShort',oedema:'oedemaShort',ageMode:'ageShort',...(compact?{ageMonths:'uiMonthsShort'}:{}),growthProfile:'growthProfileVisit'}[key]||key);
        const label=(key,hint='')=>`<div class="field-label"><label for="${prefix}-${key}">${this.t(labelKey(key))}${['caseId','name'].includes(key)?` <small>(${this.t('optional')})</small>`:''}</label>${hint?this.infoButton(hint,key,`${prefix}-${key}-info`):''}</div>`;
        const field = (key, type = 'text', attrs = '', hint = '') => `<div class="field" data-field="${key}">${label(key,hint)}<input id="${prefix}-${key}" name="${key}" type="${type}" value="${this.esc(data[key])}" ${attrs}${compact&&['ageYears','ageMonths'].includes(key)?` placeholder="${this.esc(this.t(labelKey(key)))}"`:''}${hint ? ` aria-describedby="${prefix}-${key}-hint"` : ''}>${hint ? `<p id="${prefix}-${key}-hint" class="sr-only">${this.t(hint)}</p>` : ''}</div>`;
        const select = (key, options, hint = '') => `<div class="field" data-field="${key}">${label(key,hint)}<select id="${prefix}-${key}" name="${key}"${hint ? ` aria-describedby="${prefix}-${key}-hint"` : ''}>${options.map(([value,text]) => `<option value="${value}" ${data[key] === value ? 'selected' : ''}>${this.t(text)}</option>`).join('')}</select>${hint ? `<p id="${prefix}-${key}-hint" class="sr-only">${this.t(hint)}</p>` : ''}</div>`;
        const measurement=(key,base,alternative,labelKey)=>{
            const unit=data[key+'Unit']||base;
            const input=`<input id="${prefix}-${key}" name="${key}" type="text" inputmode="decimal" autocomplete="off" value="${this.esc(data[key])}">`;
            const units=`<label class="sr-only" for="${prefix}-${key}Unit">${this.t(key+'Unit')}</label><select id="${prefix}-${key}Unit" name="${key}Unit" aria-label="${this.t(key+'Unit')}"${compact?` data-title-choice data-choice-prefix="${this.esc(this.t(labelKey))}"`:''}>${[base,alternative].map(u=>`<option value="${u}" ${unit===u?'selected':''}>${u}</option>`).join('')}</select>`;
            const info=key==='weight'?this.infoButton('weightHint',labelKey,`${prefix}-${key}-info`):'';
            return compact?`<div class="field title-measurement" data-field="${key}"><div class="field-label"><label class="sr-only" for="${prefix}-${key}">${this.t(labelKey)}</label>${units}${info}</div>${input}</div>`:`<div class="field" data-field="${key}"><div class="field-label"><label for="${prefix}-${key}">${this.t(labelKey)}</label>${info}</div><div class="measurement-entry">${input}${units}</div></div>`;
        };
        return `<form id="${prefix}-form" class="clinical-entry-form${compact?' individual-compact-form':''}" novalidate><div class="form-grid entry-core-grid${compact?' entry-flow-grid':''}${compact&&ig?' entry-flow-preterm':''}">${compact?'':`<h3 class="entry-group-title">${this.t('uiIdentity')}</h3>`}${compact&&!ig?'<div class="entry-primary-row">':''}
            ${field('caseId', 'text', 'maxlength="100" autocomplete="off"')}${field('name', 'text', `maxlength="100" autocomplete="off" placeholder="${this.t('namePlaceholder')}"`)}
            ${compact?'':`<h3 class="entry-group-title">${this.t('uiAgeSex')}</h3>`}<div class="field${compact?' title-age':''}" data-field="ageMode">${compact?`<div class="field-label"><label class="sr-only" for="${prefix}-ageMode">${this.t('ageShort')}</label>`:label('ageMode',ageHelp)}<select id="${prefix}-ageMode" name="ageMode" aria-describedby="${prefix}-ageMode-hint"${compact?` data-title-choice data-choice-birth-label="${this.esc(this.t('birthDate'))}"`:''}>${(ig?['days','dates','pma']:['days','totalMonths','months','dates']).map(mode => `<option value="${mode}" ${data.ageMode === mode ? 'selected' : ''}>${this.t(mode)}</option>`).join('')}</select>${compact?this.infoButton(ageHelp,'ageMode',`${prefix}-ageMode-info`)+'</div>':''}<p id="${prefix}-ageMode-hint" class="sr-only">${this.t(ageHelp)}</p>${compact?'':'</div>'}
            <div class="age-fields" data-age="months" ${data.ageMode !== 'months' ? 'hidden' : ''}>${field('ageYears','number','min="0" max="19" step="1" inputmode="numeric"')}${field('ageMonths','number','min="0" max="11" step="1" inputmode="numeric"')}</div>
            <div class="age-fields" data-age="totalMonths" ${data.ageMode!=='totalMonths'?'hidden':''}>${field('ageTotalMonths','text','inputmode="decimal" autocomplete="off"')}</div>
            <div class="age-fields" data-age="dates" ${data.ageMode !== 'dates' ? 'hidden' : ''}>${field('birthDate','date',`max="${ClinicalEngine.today()}"`)}</div>
            <div class="age-fields" data-age="days" ${data.ageMode !== 'days' ? 'hidden' : ''}>${field('ageDays','number',`min="0" max="${ig?448:data.growthProfile==='us'?7304:6970}" step="1" inputmode="numeric"`)}</div>
            ${ig?`<div class="age-fields" data-age="pma" ${data.ageMode!=='pma'?'hidden':''}>${field('postmenstrualDays','number','min="189" max="448" step="1" inputmode="numeric"')}</div>${compact?'</div>':''}<div class="age-fields" data-gestation ${data.ageMode==='pma'?'hidden':''}>${field('gestationalAgeWeeks','number','min="0" max="36" step="1" inputmode="numeric"')}${field('gestationalAgeDays','number','min="0" max="6" step="1" inputmode="numeric"')}</div>${compact?'':`</div><p class="hint">${this.t('intergrowthAgeHelp')}</p><div class="form-grid">`}`:compact?'</div>':''}
            ${field('measurementDate','date',`max="${ClinicalEngine.today()}"`)}
            ${select('gender',[['','choose'],['M','male'],['F','female']])}${compact&&!ig?'</div><div class="entry-measure-row">':''}${compact?'':`<h3 class="entry-group-title">${this.t('uiAnthropometry')}</h3>`}${measurement('weight','g','kg','weightMeasure')}${measurement('height','cm','m','heightMeasure')}${ig?field('headCircumference','number','min="0" step="any" inputmode="decimal"'):''}
            ${ig?'':`${field('muac','number','min="50" max="400" step="0.1" inputmode="decimal"',data.careProtocol==='niger2025'?'pcima2025MuacHelp':data.careProtocol==='niger2023'?'pcimaMuacHelp':'muacHelp')}`}${select('oedema',[['','unknown'],['n','no'],['y','yes']])}${select('position',(ig?[['','choose'],['L','lying']]:[['','choose'],['L','lying'],['H','standing']]),positionHelp)}${compact&&!ig?'</div>':''}
            </div><details class="reference-profile" open>${compact?this.formSectionSummary(prefix,'settingsClinical','growthProfileVisitHelp'):`<summary>${this.t('settingsClinical')}</summary>`}<div class="form-grid">${select('growthProfile',[['who','profileWHO'],['us','profileUS'],['intergrowth','profileINTERGROWTH']])}${select('careProtocol',[['','careWHO'],['niger2025','careNiger2025'],['niger2023','careNiger2023']])}</div>${compact?'':`<p class="hint">${this.t('growthProfileVisitHelp')}</p>`}</details><details class="clinical-fields"${(WorkspaceApp.desktopSingleSections(prefix)||NutritionUI.inputFields.some(k=>!['careProtocol','muac'].includes(k)&&data[k]!==undefined&&data[k]!==''))?' open':''}>${compact?this.formSectionSummary(prefix,'clinicalSection',clinicalHelp,clinicalBrief):`<summary>${this.t('clinicalSection')}</summary><p class="hint">${this.t(clinicalHelp)}</p>`}<div class="form-grid">${ig?`${field('muac','number','min="50" max="400" step="0.1" inputmode="decimal"',data.careProtocol==='niger2025'?'pcima2025MuacHelp':data.careProtocol==='niger2023'?'pcimaMuacHelp':'muacHelp')}`:''}${select('oedemaGrade',[['','unknown'],['1','grade1'],['2','grade2'],['3','grade3']])}${NutritionUI.dangerFields.map(key=>select(key,[['','unknown'],['n','no'],['y','yes']])).join('')}${select('acuteProblem',[['','unknown'],['n','no'],['y','yes']])}${select('appetite',[['','unknown'],['good',data.careProtocol==='niger2025'?'pcima2025AppetitePassed':data.careProtocol==='niger2023'?'pcimaAppetitePassed':'appetiteGood'],['poor','appetitePoor']])}${select('furtherAssessment',[['','unknown'],['n','assessmentNone'],['y','assessmentNeeded'],['cleared','assessmentCleared']])}${NutritionUI.observationsFor(data).map(key=>select(key,[['','unknown'],['n','no'],['y','yes']])).join('')}</div></details>${this.additionalFormHTML(prefix,data,ig,field)}<div id="${prefix}-error" class="notice error" role="alert" tabindex="-1" hidden></div></form>`;
    }
    viewNav(scope,items,active){
        return `<nav class="workspace-view-nav" aria-label="${this.esc(this.t(scope==='single'?'resultsTitle':scope==='history'?'history':'batch'))}">${items.map(([key,label,icon])=>`<button type="button" data-action="workspace-view" data-scope="${scope}" data-view="${key}" aria-controls="${scope==='batch'&&key==='entry'?'measure-card':scope+'-view-'+key}" aria-pressed="${key===active}">${this.icon(icon)}<span>${this.esc(this.t(label))}</span></button>`).join('')}</nav>`;
    }
    selectWorkspaceView(scope,view){
        const allowed=scope==='single'?['summary','charts','details']:scope==='batch'?['entry','results','quality','statistics']:scope==='history'?['backup','versions']:[];
        if(scope!==this.page||!allowed.includes(view))return;
        if(scope==='single')this.singleView=view;else if(scope==='history')this.historyPane=view;else {this.batchPane=view;const card=document.getElementById('batch-results-card');if(card)card.hidden=view==='entry';}
        for(const panel of document.querySelectorAll('[data-workspace-panel="'+scope+'"]'))panel.hidden=panel.dataset.view!==view;
        if(scope==='batch'&&view==='quality'&&typeof window!=='undefined'&&window.innerWidth<=680){const review=document.querySelector('#batch-view-quality .quality-review');if(review)review.open=true;}
        for(const button of document.querySelectorAll('[data-action="workspace-view"][data-scope="'+scope+'"]'))button.setAttribute('aria-pressed',String(button.dataset.view===view));
        const active=document.querySelector?.('#'+scope+'-view-'+view);
        const header=document.querySelector?.('.workspace-topbar'),nav=document.querySelector?.('.workspace-view-nav');
        if(active?.getBoundingClientRect&&header?.getBoundingClientRect&&nav?.getBoundingClientRect){
            const top=Math.max(header.getBoundingClientRect().bottom,nav.getBoundingClientRect().bottom);
            if(active.getBoundingClientRect().top<top-4){
                const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
                active.scrollIntoView?.({block:'start',behavior:reduced?'instant':'smooth'});
            }
        }
    }
    singleHTML() {
        const hasResult=!!this.state.single?.result, dashboard=hasResult&&!this.singleEditing;
        return `<div class="workspace-grid single-workspace clinical-workspace${dashboard?' results-view':' entry-view'}"><section class="card" id="measure-card"${dashboard?' hidden':''}><div class="card-top"><h2>${this.t('formTitle')}</h2><div class="toolbar compact-toolbar form-top-actions">${this.toolButton('calculate','run','',{primary:true,submit:true,attrs:'form="single-form"',showLabel:true,labelKey:'calculateShort'})}${this.toolButton('saveNow','save','save',{showLabel:true,labelKey:'saveShort'})}</div></div>${this.formHTML('single', this.state.draft)}</section>
            <section class="card${!hasResult?' entry-preview-card':''}" id="results-card"><div id="single-results">${this.resultsHTML(this.state.single, this.state.stale)}</div></section></div>`;
    }
    resultsHTML(entry, stale = false, preview = false) {
        if (!entry?.result) return `${this.resultHeadingHTML()}<div class="empty"><div class="empty-symbol" aria-hidden="true">${this.icon('chart')}</div><h3>${this.t('blank')}</h3><p>${this.t('resultsIntro')}</p></div>`;
        const { child, result } = entry;
        const status=`<div class="result-status"><strong>${this.esc(child.name || child.caseId || this.t('unknown'))}</strong><span class="badge">${this.esc(this.t(result.status))}</span></div>`;
        const notices=`${stale ? `<p class="notice warn" data-stale-notice role="status">${this.t('stale')}</p>` : ''}${result.imported ? `<p class="notice warn${preview?'':' import-print-notice'}">${this.t('importedResult')}</p>` : ''}`;
        const indicators=WorkspaceApp.resultIndicators(result).map(key => {
            const v = result[key], hasValue = v && typeof v.zscore === 'number' && Number.isFinite(v.zscore);
            const category = v?.classification;
            const severe = /Severe|severe|obesity|Obesity|bmiBelow3|bmiAbove3/.test(category || '');
            return `<div class="indicator ${severe ? 'severe' : result.referenceFamily!=='INTERGROWTH2015'&&!['withinReference','bmiWithin','cdcHealthyWeight','cdcBetween3And97'].includes(category) ? 'caution' : ''}"><div><div class="label">${this.t(key)}${key==='bmiForAge'?this.infoButton(result.referenceFamily==='CDC2000'?'cdcInterpretation':'bmiHelp','bmiForAge',preview?'preview-bmi-info':'result-bmi-info'):''}</div><div class="category">${this.esc(hasValue ? this.t(category||'intergrowthDescriptive') : this.t('notCalculated'))}</div></div><div class="indicator-values"><div class="score" aria-label="${this.esc(this.t('zscoreLabel')+' : '+(hasValue?this.number(v.zscore):this.t('notCalculated')))}" title="${this.esc(this.t('zscoreHelp'))}"><span class="score-prefix" aria-hidden="true">Z</span> ${hasValue ? this.number(v.zscore) : '—'}</div>${this.percentileHTML(v,result)}</div>${v?.flagged ? `<div class="flag">${this.t('flagged')}</div>` : ''}${v?.error ? `<div class="flag">${this.esc(this.t(v.error))}</div>` : ''}</div>`;
          }).join('');
        const warnings=`${(result.warnings || []).map(w => `<p class="notice warn">${this.esc(this.t(w))}</p>`).join('')}${['WHO2007','CDC2000'].includes(result.referenceFamily)?`<p class="hint">${this.t(result.referenceFamily==='CDC2000'?'cdcCoverage':'coverage2007')}</p>`:''}`;
        const measures=`<div class="meta result-measures"><p>${this.t('caseId')} : ${this.esc(child.caseId || this.t('unknown'))} · ${this.t('measurementDate')} : ${this.calendarDate(child.measurementDate)}</p><p>${this.t('ageDays')} : ${this.esc(child.ageDays ?? this.t('unknown'))} · ${this.t('weight')} : ${this.number(child.weight,0)} · ${this.t('height')} : ${this.number(child.height,1)}${result.schemaVersion===4&&Number.isFinite(result.bmi)?` · ${this.t('bmi')} : ${this.number(result.bmi,2)} kg/m²`:''}</p><p>${this.t('gender')} : ${this.t(child.gender === 'M' ? 'male' : child.gender === 'F' ? 'female' : 'unknown')} · ${this.t('position')} : ${this.t(child.position === 'L' ? 'lying' : child.position === 'H' ? 'standing' : 'unknown')} · ${this.t('oedema')} : ${this.t(child.oedema === 'y' ? 'yes' : child.oedema === 'n' ? 'no' : 'unknown')}</p>${result.correctedHeight ? `<p>${this.t('adjustedHeight')} : ${this.number(result.correctedHeight,1)} ${this.t('unitCm')}</p>` : ''}<p>${this.t('calculatedAt')} : ${this.date(result.calculatedAt)}</p><p>${this.t('referenceVersion')} : ${this.esc(result.referenceVersion || 'unknown')} · ${this.t('engineVersion')} : ${this.esc(result.engineVersion || this.t('unknown'))}</p>${this.profileDetailsHTML(child,result)}</div>`;
        if(preview)return `<div class="record-preview">${status}${notices}${this.nutritionHTML(child,result,true)}${warnings}<h3 class="growth-heading">${this.t(result.referenceFamily==='CDC2000'?'growthResultsCdc':'growthResults')}</h3><div class="indicator-grid">${indicators}</div>${this.additionalResultsHTML(result,true)}<details class="result-record" open><summary>${this.t('calculationDetails')}</summary>${measures}</details></div>`;
        const value=v=>this.esc(v??this.t('unknown'));
        const pairs=[['measurementDate',this.calendarDate(child.measurementDate)],...(result.intergrowthContext?[['postmenstrualDays',result.intergrowthContext.age.postmenstrualDays]]:[['ageDays',child.ageDays]]),['gender',this.t(child.gender==='M'?'male':child.gender==='F'?'female':'unknown')],['weight',this.number(child.weight,0)],['height',this.number(child.height,1)],['muac',result.nutrition?.muacMm==null?this.t('unknown'):this.number(result.nutrition.muacMm,1)+' mm'],...(Number.isFinite(result.bmi)?[['bmi',this.number(result.bmi,2)+' kg/m²']]:[]),['oedemaShort',this.t(child.oedema==='y'?'yes':child.oedema==='n'?'no':'unknown')],['position',this.t(child.position==='L'?'lying':child.position==='H'?'standing':'unknown')]];
        const detailMeasures=[['caseId',child.caseId||this.t('unknown')],...pairs,...(result.correctedHeight?[['adjustedHeight',this.number(result.correctedHeight,1)+' '+this.t('unitCm')]]:[])];
        const detailReferences=[['calculatedAt',this.date(result.calculatedAt)],['referenceVersion',result.referenceVersion],...(result.additionalGrowth?[['additionalReferenceVersion',result.additionalGrowth.referenceVersion]]:[]),['engineVersion',result.engineVersion]];
        const detailRow=(items,kind)=>`<dl class="measurement-snapshot detail-snapshot detail-${kind}">${items.map(([key,v])=>`<div><dt>${this.t(key)}</dt><dd><bdi>${value(v)}</bdi></dd></div>`).join('')}</dl>`;
        const detailGrid=detailRow(detailMeasures,'measures')+detailRow(detailReferences,'references');
        const active=['summary','charts','details'].includes(this.singleView)?this.singleView:'summary';
        const panel=(key,content)=>`<section id="single-view-${key}" class="result-view-panel" data-workspace-panel="single" data-view="${key}"${active===key?'':' hidden'}>${content}</section>`;
        const summary=`${this.nutritionHTML(child,result,true)}${warnings}<section class="result-clinical" aria-label="${this.esc(this.t('growthResults'))}"><h3 class="growth-heading">${this.t(result.referenceFamily==='CDC2000'?'growthResultsCdc':'growthResults')}</h3><div class="indicator-grid">${indicators}</div>${this.additionalResultsHTML(result,true,false)}</section>`;
        const history=`<section class="result-record"><div class="record-heading"><h3>${this.t('followup')}</h3>${child.caseId?`<button class="btn" data-action="view-case" data-case-id="${value(child.caseId)}" title="${this.esc(this.t('viewCaseVersions'))}">${this.icon('history')}<span>${this.t('viewVersionsShort')}</span></button>`:''}</div><p class="hint">${this.t('followupHelp')}</p><div data-single-history></div></section>`;
        return `<div class="dashboard-toolbar">${this.resultHeadingHTML(entry)}${this.resultActionsHTML(child)}</div>${this.viewNav('single',[['summary','uiSummary','single'],['charts','chartsDashboard','chart'],['details','calculationDetails','info']],active)}${notices}<div data-single-visits>${child.caseId?'':`<p class="hint">${this.t('caseWithoutId')}</p>`}</div>${panel('summary',summary)}${panel('charts',`<section class="dashboard-charts" aria-label="${this.esc(this.t('chartsDashboard'))}"><h3>${this.t('chartsDashboard')}</h3><div data-single-charts></div></section>`)}${panel('details',`<section class="result-record compact-record detail-record"><h3>${this.t('calculationDetails')}</h3>${detailGrid}${this.profileDetailsHTML(child,result)}</section>${history}`)}`;
    }
    additionalResultsHTML(result,expanded=false,showReference=true) {
        const extra=result?.additionalGrowth;if(!extra)return '';
        const e=v=>this.esc(v),t=k=>e(this.t(k));
        const titleKey=result.referenceFamily==='CDC2000'?'additionalResultsWho':'additionalResults',helpKey=result.referenceFamily==='INTERGROWTH2015'?'intergrowthDescriptive':'additionalResultHelp';
        return `<details class="additional-results"${expanded?' open':''}><summary>${t(titleKey)}${showReference?'':this.infoButton(helpKey,titleKey,'summary-additional-info')}</summary><p class="hint${showReference?'':' summary-print-help'}">${t(helpKey)}</p><dl class="measurement-snapshot">${Object.entries(extra.indicators).map(([key,v])=>`<div><dt>${t(key)}</dt><dd>${e(this.number(v.measure,1))} ${e(v.unit)} · ${Number.isFinite(v.zscore)?'Z '+e(this.number(v.zscore)):'—'}${this.percentileHTML(v,result)}</dd><p>${t(v.error||v.classification||'intergrowthDescriptive')}${v.flagged?' · '+t('flagged'):''}</p></div>`).join('')}</dl>${showReference?`<p class="meta">${t('referenceVersion')} : ${e(extra.referenceVersion)}</p>`:''} </details>`;
    }
    nutritionHTML(child,result,compact=false) {
        if(result?.referenceFamily==='INTERGROWTH2015')return `<section class="nutrition-result"><h3>${this.t('profileINTERGROWTH')}</h3><p>${this.t('intergrowthNoScreening')}</p>${result.nutrition?.reasons.includes('dangerPresent')?`<p class="notice warn">${this.t('orientationUrgent')}</p>`:''}</section>`;
        const n=result?.nutrition;if(!n)return '';const label=key=>this.esc(this.t(key));
        const national=NutritionUI.isNational(n),help=national?NutritionUI.helpKey(n):'clinicalHelp';
        const titleKey=NutritionUI.is2025(n)?'screeningTitlePcima2025':national?'screeningTitlePcima':result.referenceFamily==='CDC2000'?'screeningTitleWho':'screeningTitle';
        // A threshold is not the measured MUAC. Display both together only when the stored criterion matches the stored classification.
        const pbCriterion=({muacSevere:'criterionMuacSevere',muacModerate:'criterionMuacModerate',pcimaInfantMuacLow:'pcimaInfantMuacCriterion'})[n.muac];
        const mergePb=compact&&Number.isFinite(n.muacMm)&&!!pbCriterion&&n.criteria?.includes(pbCriterion);
        const criteria=(n.criteria||[]).map(key=>label(key)+(mergePb&&key===pbCriterion?' ('+this.esc(this.number(n.muacMm,1))+' mm)':'')).join(' · ');
        const pbDetails=mergePb?'':`<p>${label('muac')} : ${n.muacMm===null?this.t('unknown'):this.number(n.muacMm,1)+' mm'} · ${label(n.muac)}</p>`;
        const sources=national?`<a href="${NutritionUI.sourceFor(n)}" target="_blank" rel="noopener noreferrer">PCIMA Niger · ${NutritionUI.is2025(n)?'2025':'2023'}</a>`:`<a href="https://www.who.int/publications/i/item/9789240082830" target="_blank" rel="noopener noreferrer">OMS 2023</a> · <a href="https://www.who.int/publications/i/item/9789240122840" target="_blank" rel="noopener noreferrer">OMS / UNICEF 2026</a>`;
        const observations=national?`<dl class="clinical-observation-grid">${NutritionUI.inputFields.filter(k=>!['muac','careProtocol'].includes(k)&&child[k]).map(k=>`<div><dt>${label(k)}</dt><dd>${label(NutritionUI.observationLabel(k,child[k],NutritionUI.is2025(n)?'2025':true))}</dd></div>`).join('')}</dl>`:'';
        return `<section class="nutrition-result ${n.category==='nutritionSevere'||['orientationUrgent','orientationInpatient'].includes(n.orientation)?'clinical-urgent':''}" aria-label="${label('clinicalSection')}"><h3>${label(titleKey)}${compact?this.infoButton(help,titleKey,'summary-screening-info'):''}</h3><strong>${label(n.category)}</strong>${criteria?`<p>${criteria}</p>`:''}<p><b>${label('orientationTitle')}</b> — ${label(n.orientation)}</p>${n.reasons.length?`<p>${n.reasons.map(k=>label(k)).join(' · ')}</p>`:''}<details class="screening-details"><summary title="${label('assessmentDetails')}">${label('detailsShort')}</summary>${pbDetails}<p class="clinical-method-note${compact?' summary-print-help':''}">${label(help)}</p>${n.missing.length?`<div class="clinical-missing"><strong>${label('assessmentMissing')}</strong><ul>${n.missing.map(k=>`<li>${label(k)}</li>`).join('')}</ul></div>`:''}<p>${label('clinicalReference')} : ${this.esc(n.reference)} · v${n.version}</p>${observations}${sources}</details></section>`;
    }
    lotModels(){
        if(!this.engine?.older)return [LotAnalysis.build(this.state.batch,this.engine?.data.referenceVersion)];
        const family=e=>e.result?.referenceFamily||ProfileUI.family(e.child);
        return [['WHO2006',this.engine.data.referenceVersion],['WHO2007',this.engine.older.data.referenceVersion],...(this.engine.cdc?[['CDC2000',this.engine.cdc.data.referenceVersion]]:[]),['INTERGROWTH2015','INTERGROWTH2015-postnatal-gigs-fb58fe6596d4']].flatMap(([key,reference])=>{const entries=this.state.batch.filter(e=>family(e)===key);return entries.length?[LotAnalysis.build(entries,reference,{family:key,additionalReference:this.engine.additional?.data.referenceVersion})]:[];});
    }
    lotSummaryHTML(options={}){return this.lotModels().map(model=>LotAnalysis.html(model,this,options)).join('');}
    batchDisplayView(){
        const query=this.historySearchKey(this.batchSearch||''),filter=this.batchFilter||'all',size=8;
        const signalled=filter==='quality'?new Set(QualityUI.build(this.state.batch).rows.filter(r=>r.codes.length).map(r=>r.index-1)):null;
        const rows=this.state.batch.map((entry,index)=>({entry,index})).filter(({entry,index})=>{
            const {child,result}=entry;
            return (!query||this.historySearchKey([child.name,child.caseId,child.measurementDate].filter(Boolean).join(' ')).includes(query))&&(filter==='all'||(filter==='quality'?signalled.has(index):filter==='pending'?!result:filter==='unclassified'?!!result&&!result.nutrition?.category:result?.nutrition?.category===filter));
        });
        const total=rows.length,pages=Math.max(1,Math.ceil(total/size)),current=Math.min(pages-1,Math.max(0,this.batchPage||0)),start=current*size,shown=rows.slice(start,start+size);
        return {total,pages,current,start,from:total?start+1:0,to:Math.min(total,start+size),entries:shown.map(r=>r.entry),indices:shown.map(r=>r.index)};
    }
    batchUnit(key,child){
        const chosen=child&&this.batchUnitsByVisit?.get(child.visitId||child.id)?.[key];
        return key==='weight'?((chosen||this.batchWeightUnit)==='kg'?'kg':'g'):((chosen||this.batchHeightUnit)==='m'?'m':'cm');
    }
    static batchDisplayMeasure(value,key,unit){
        if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return null;
        return ClinicalEngine.shiftDecimal(Number(value),key==='weight'&&unit==='kg'?-3:key==='height'&&unit==='m'?-2:0);
    }
    batchUnitPicker(key,scope='table'){
        const label=this.t(key==='weight'?'pdfWeightShort':'pdfHeightShort'),unit=this.batchUnit(key);
        return '<label class="batch-unit-picker">'+this.esc(label)+' <select id="batch-unit-'+scope+'-'+key+'" data-batch-unit="'+key+'" aria-label="'+this.esc(label+' · '+this.t('batchDisplayUnit'))+'">'+(key==='weight'?['g','kg']:['cm','m']).map(u=>'<option value="'+u+'"'+(u===unit?' selected':'')+'>'+u+'</option>').join('')+'</select></label>';
    }
    static inlineBatchFields=['weight','height','muac','headCircumference','tricepsSkinfold','subscapularSkinfold','name','caseId','birthDate','measurementDate','gender','position','oedema','ageDays','ageTotalMonths','ageYears','ageMonths','postmenstrualDays','gestationalAgeWeeks','gestationalAgeDays'];
    static sameBatchField(key,original,edited){
        if(String(original??'')===String(edited??''))return true;
        if(!['weight','height','muac',...SupplementaryUI.fields,'ageTotalMonths'].includes(key))return false;
        try{return ClinicalEngine.decimal(original)===ClinicalEngine.decimal(edited);}
        catch(_){return false;}
    }
    static inlineCorrectedBatch(workspace,index,key,value,unit,engine){
        const entry=workspace?.batch?.[index];
        if(!Number.isInteger(index)||index<0||!entry||!this.inlineBatchFields.includes(key))throw Error('batchCorrectionChanged');
        const patch={[key]:value};
        if(['weight','height'].includes(key)){
            if(!(key==='weight'?['g','kg']:['cm','m']).includes(unit))throw Error('measureUnitInvalid');
            patch[key+'Unit']=unit;
        }else if(['muac',...SupplementaryUI.fields,'ageTotalMonths'].includes(key)&&value!=='')patch[key]=ClinicalEngine.decimal(value,key==='ageTotalMonths'?'ageInvalid':'additionalMeasureInvalid');
        if(entry.result)return this.correctedBatch(workspace,index,patch,engine);
        const raw={...entry.child,...patch};delete raw.id;
        const child=engine.constructor.normalize(raw);HistoryManager.checkChild(child);
        const next=HistoryManager.clone(workspace);next.batch[index]={child,result:null};return next;
    }
    batchEditable(child,index,key,label,display,unit=''){
        const ctx=this.batchInlineEdit,active=!!ctx&&ctx.workspace===this.state&&ctx.index===index&&ctx.entry===this.state?.batch?.[index]&&ctx.key===key,id='batch-inline-'+index+'-'+key,name=this.esc(label);
        if(!active)return '<button type="button" class="batch-inline-value" id="'+id+'" data-action="batch-inline-open" data-index="'+index+'" data-field="'+key+'" title="'+this.esc(this.t('batchInlineEdit')+' · '+label)+'" aria-label="'+this.esc(this.t('batchInlineEdit')+' · '+label+' : '+display)+'"><bdi dir="auto">'+this.esc(display)+'</bdi></button>';
        const choices={gender:[['M','male'],['F','female']],position:[['','unknown'],['L','lying'],['H','standing']],oedema:[['','unknown'],['n','no'],['y','yes']]},disabled=ctx.busy?' disabled':'';
        const control=choices[key]?'<select id="'+id+'" data-inline-input aria-label="'+name+'"'+disabled+'>'+choices[key].map(([v,k])=>'<option value="'+v+'"'+(ctx.value===v?' selected':'')+'>'+this.esc(this.t(k))+'</option>').join('')+'</select>':'<input id="'+id+'" data-inline-input aria-label="'+name+'" type="'+(['birthDate','measurementDate'].includes(key)?'date':'text')+'"'+(!['name','caseId','birthDate','measurementDate'].includes(key)?' inputmode="decimal"':'')+' value="'+this.esc(ctx.value)+'"'+disabled+'>';
        return '<span class="batch-inline-editor">'+control+(ctx.unit?'<small>'+ctx.unit+'</small>':'')+'<span class="batch-inline-actions"><button type="button" class="btn primary" data-action="batch-inline-save"'+disabled+' title="'+this.esc(this.t(ctx.entry.result?'batchCorrectionApply':'batchInlineSave'))+'" aria-label="'+this.esc(this.t(ctx.entry.result?'batchCorrectionApply':'batchInlineSave'))+'">'+this.icon('check')+'</button><button type="button" class="btn" data-action="batch-inline-cancel"'+disabled+' title="'+this.esc(this.t('cancel'))+'" aria-label="'+this.esc(this.t('cancel'))+'">'+this.icon('close')+'</button></span>'+(ctx.error?'<span class="batch-inline-error" role="alert">'+this.esc(this.t(ctx.error))+'</span>':'')+'</span>';
    }
    batchMeasureHTML(child,index,key){
        const unit=this.batchUnit(key,child),value=WorkspaceApp.batchDisplayMeasure(child[key],key,unit);
        const display=value===null?'—':value.toLocaleString(this.prefs.language,{minimumFractionDigits:unit==='cm'?1:0,maximumFractionDigits:6});
        return this.batchEditable(child,index,key,this.t(key==='weight'?'pdfWeightShort':'pdfHeightShort')+' ('+unit+')',display,unit);
    }
    openBatchInline(index,key){
        if(this.batchComputing||this.csvBusy||this.csvReading||this.batchCorrection?.busy||this.batchInlineEdit?.busy)return;
        if(this.batchInlineEdit&&this.batchInlineEdit.workspace===this.state&&this.batchInlineEdit.entry===this.state.batch[this.batchInlineEdit.index]){this.toast('batchInlineFinish',true);return;}
        const entry=this.state.batch[index];if(!Number.isInteger(index)||index<0||!entry||!WorkspaceApp.inlineBatchFields.includes(key))return;
        const unit=['weight','height'].includes(key)?this.batchUnit(key,entry.child):'',raw=unit?WorkspaceApp.batchDisplayMeasure(entry.child[key],key,unit):key==='ageTotalMonths'?entry.child.ageTotalMonths??entry.child.totalAgeMonths:entry.child[key];
        this.batchInlineEdit={workspace:this.state,index,entry,key,unit,value:String(raw??''),initial:String(raw??''),busy:false};
        this.refreshBatchBrowser();const field=document.getElementById('batch-inline-'+index+'-'+key);field?.focus();field?.select?.();
    }
    cancelBatchInline(){
        const ctx=this.batchInlineEdit;if(!ctx||ctx.busy)return;this.batchInlineEdit=null;this.refreshBatchBrowser();document.getElementById('batch-inline-'+ctx.index+'-'+ctx.key)?.focus();
    }
    async saveBatchInline(){
        const ctx=this.batchInlineEdit;if(!ctx||ctx.busy)return;
        const current=()=>this.batchInlineEdit===ctx&&this.state===ctx.workspace&&this.state.batch[ctx.index]===ctx.entry&&this.page==='batch';
        if(!current()){this.batchInlineEdit=null;this.toast('batchCorrectionChanged',true);return;}
        if(WorkspaceApp.sameBatchField(ctx.key,ctx.initial,ctx.value)){this.cancelBatchInline();return;}
        ctx.busy=true;ctx.error='';this.refreshBatchBrowser();
        try{
            const next=WorkspaceApp.inlineCorrectedBatch(ctx.workspace,ctx.index,ctx.key,ctx.value,ctx.unit,this.engine);
            await this.saveImmediate('beforeBatchCorrection',true);if(!current())throw Error('batchCorrectionChanged');
            await this.history.save(next,'correctedBatch',true);if(!current())throw Error('batchCorrectionChanged');
            this.batchInlineEdit=null;this.state=next;this.saveState='saved';this.checkpoint(false);this.render('batch-inline-'+ctx.index+'-'+ctx.key);this.toast(ctx.entry.result?'batchCorrectionSaved':'batchInlineSaved');
        }catch(error){if(current()){ctx.error=error.message;ctx.busy=false;this.refreshBatchBrowser();document.getElementById('batch-inline-'+ctx.index+'-'+ctx.key)?.focus();}else{this.batchInlineEdit=null;this.toast(error.message,true);}}
        finally{ctx.busy=false;}
    }
    batchRecordsHTML(entries,indices){
        const t=k=>this.esc(this.t(k)),num=(v,d=0)=>this.number(v,d),known=v=>v!==null&&v!==undefined&&v!=='';
        const short={weightForAge:'shortWFA',heightForAge:'shortHFA',weightForHeight:'shortWFH',bmiForAge:'shortBFA'};
        const field=(label,body)=>'<div class="batch-record-field"><span class="batch-record-label">'+this.esc(label)+'</span><div class="batch-record-value">'+body+'</div></div>';
        const splitLabel=(key)=>this.prefs.language==='fr'?({oedemaShort:'Œdèmes bilatéraux\nau godet',headCircumference:'Périmètre\ncrânien (cm)'}[key]||this.t(key)):this.t(key);
        return '<div class="batch-record-list" role="list">'+entries.map(({child,result},i)=>{
            const index=indices[i],edit=(key,display,label=key)=>this.batchEditable(child,index,key,this.t(label),String(display??'—')),date=v=>known(v)?this.calendarDate(v):'—',f=(key,value)=>field(splitLabel(key),value);
            const age=child.ageMode==='dates'?f('birthDate',edit('birthDate',date(child.birthDate)))+f('ageDays',this.esc(num(child.ageDays))):child.ageMode==='pma'?f('postmenstrualDays',edit('postmenstrualDays',num(child.postmenstrualDays))):child.ageMode==='months'?f('ageYears',edit('ageYears',num(child.ageYears)))+f('ageMonths',edit('ageMonths',num(child.ageMonths))):child.ageMode==='totalMonths'?f('ageTotalMonths',edit('ageTotalMonths',num(child.ageTotalMonths??child.totalAgeMonths,2))):f('ageDays',edit('ageDays',num(child.ageDays)));
            const birth=child.ageMode==='dates'?'':f('birthDate',this.esc(date(child.birthDate)));
            const gest=child.growthProfile==='intergrowth'&&child.ageMode!=='pma'?f('gestationalAgeWeeks',edit('gestationalAgeWeeks',num(child.gestationalAgeWeeks)))+f('gestationalAgeDays',edit('gestationalAgeDays',num(child.gestationalAgeDays))):'';
            const extras=SupplementaryUI.fields.filter(k=>known(child[k])).map(k=>f(k,edit(k,num(child[k],1)))).join('');
            const scores=result?WorkspaceApp.resultIndicators(result):ClinicalEngine.indicators;
            const score=(key,v,additional=false)=>{
                const valid=Number.isFinite(v?.zscore),category=v?.classification;
                return '<div class="batch-record-field batch-record-score'+(v?.flagged?' score-flagged':'')+'"><span class="batch-record-label" title="'+t(key)+'">'+t(short[key]||key)+'</span><div class="batch-record-score-content"><div class="batch-record-score-value"><strong><bdi dir="ltr">'+(valid?this.esc(num(v.zscore,2)):'—')+'</bdi></strong>'+(additional?'':this.percentileHTML(v,result))+'</div>'+(result?'<small>'+t(valid?category||'intergrowthDescriptive':(v?.error==='oedemaWarning'?'pdfOedemaSuspended':v?.error)||(v?.notApplicable?'pdfScreeningNA':'measureMissing'))+'</small>':'<span class="sr-only">'+t('notCalculated')+'</span>')+(v?.flagged?'<small class="flag">'+t('flagged')+'</small>':'')+(valid&&v?.error?'<small class="flag">'+t(v.error)+'</small>':'')+'</div></div>';
            };
            const n=result?.nutrition,urgent=n&&(n.category==='nutritionSevere'||['orientationUrgent','orientationInpatient'].includes(n.orientation));
            const screening=n?'<div class="batch-record-screening'+(urgent?' clinical-urgent':'')+'"><strong>'+t(n.category+'Short')+'</strong><span>'+t(n.orientation+'Short')+'</span>'+((n.criteria||[]).length?'<small>'+n.criteria.map(t).join(' · ')+'</small>':'')+'</div>':'<div class="batch-record-screening"><strong>'+t(result?(result.referenceFamily==='INTERGROWTH2015'?'pdfScreeningNA':'unknown'):'notCalculated')+'</strong></div>';
            const extraScores=Object.entries(result?.additionalGrowth?.indicators||{}).map(([key,v])=>score(key,v,true)).join('');
            const notes=[...(result?.imported?['importedResult']:[]),...(result?.warnings||[])];
            if(result&&[...scores.map(k=>result[k]),...Object.values(result.additionalGrowth?.indicators||{})].some(v=>!Number.isFinite(v?.zscore)&&v?.error==='oedemaWarning'))notes.push('oedemaWarning');
            const noteHTML=notes.length?'<div class="batch-record-notes">'+[...new Set(notes)].map(k=>'<p>'+t(k)+'</p>').join('')+'</div>':'';

            const heightLabel=this.prefs.language==='fr'?'Longueur /\ntaille ('+this.batchUnit('height',child)+')':this.t('pdfHeightShort')+' ('+this.batchUnit('height',child)+')';
            return '<article class="batch-record" role="listitem"><div class="batch-record-delete">'+this.toolButton('batchDeleteRow','trash','batch-delete-row',{attrs:'data-index="'+index+'" id="batch-delete-'+index+'"'})+'</div><div class="batch-record-identity"><div class="batch-record-select"><input type="checkbox" data-batch-select="'+index+'" aria-label="'+t('batchSelectRow')+' '+this.esc(num(index+1))+'"'+(this.batchSelectionSet().has(index)?' checked':'')+'><span class="batch-record-index">'+this.esc(num(index+1))+'</span></div><div class="batch-record-person">'+edit('name',child.name||this.t('unknown'))+'<div class="batch-record-id-date">'+edit('caseId',child.caseId||this.t('unknown'))+'<span aria-hidden="true">·</span>'+edit('measurementDate',date(child.measurementDate))+'</div></div><div class="batch-record-tools"><button type="button" class="btn row-correction" id="batch-correct-'+index+'" data-action="batch-correct" data-index="'+index+'" title="'+t('batchOtherFields')+'" aria-label="'+t('batchOtherFields')+'">'+t('batchOtherFields')+'</button></div>'+noteHTML+'</div><div class="batch-record-body"><div class="batch-record-measures">'+age+birth+gest+f('gender',edit('gender',this.t(child.gender==='M'?'male':child.gender==='F'?'female':'unknown')))+field(this.t('pdfWeightShort')+' ('+this.batchUnit('weight',child)+')',this.batchMeasureHTML(child,index,'weight'))+field(heightLabel,this.batchMeasureHTML(child,index,'height'))+f('muac',edit('muac',num(child.muac,1)))+f('position',edit('position',this.t(child.position==='L'?'lying':child.position==='H'?'standing':'unknown')))+f('oedemaShort',edit('oedema',this.t(child.oedema==='y'?'yes':child.oedema==='n'?'no':'unknown')))+(Number.isFinite(result?.bmi)?f('bmi',this.esc(num(result.bmi,2))+' kg/m²'):'')+extras+scores.map(k=>score(k,result?.[k])).join('')+extraScores+(result?field(this.t('uiScreening'),screening):'')+'</div></div></article>';
        }).join('')+'</div>';
    }
    batchBrowserHTML(){
        const view=this.batchDisplayView();
        return view.total?this.batchRecordsHTML(view.entries,view.indices)+this.batchPagination(view):'<div class="empty">'+this.t(this.state.batch.length?'uiNoMatch':'emptyBatch')+'</div>';
    }
    refreshBatchBrowser(){const target=document.getElementById('batch-browser-live');if(target)target.innerHTML=this.batchBrowserHTML();this.syncBatchKpis();this.syncBatchSelection();}
    batchSelectionSet(){
        const batch=this.state.batch;
        if(this.batchSelectionSource!==batch){this.batchSelectionSource=batch;this.batchSelected=new Set();}
        return this.batchSelected;
    }
    batchSelectionHTML(){
        const selected=this.batchSelectionSet(),total=this.state.batch.length,all=total>0&&selected.size===total;
        const label=this.esc(this.t('batchSelectAll'));
        return '<div class="batch-selection-bar" role="group" aria-label="'+label+'"><label class="batch-select-all" title="'+label+'"><input type="checkbox" id="batch-select-all" aria-label="'+label+'"'+(all?' checked':'')+(!total?' disabled':'')+'></label><span id="batch-selected-count" aria-live="polite" aria-label="'+this.esc(this.t('batchSelectedCount').replace('{count}',this.number(selected.size,0)))+'">'+this.esc(this.number(selected.size,0))+'</span>'+this.toolButton('batchDeleteSelected','trash','batch-delete-selected',{disabled:!selected.size})+'</div>';
    }
    syncBatchSelection(){
        const selected=this.batchSelectionSet(),total=this.state.batch.length,page=document.getElementById('batch-select-all'),count=document.getElementById('batch-selected-count'),remove=document.querySelector?.('[data-action="batch-delete-selected"]');
        if(page){page.checked=total>0&&selected.size===total;page.indeterminate=selected.size>0&&!page.checked;page.disabled=!total||!!this.batchDeleting;}
        if(count){count.textContent=this.number(selected.size,0);count.setAttribute('aria-label',this.t('batchSelectedCount').replace('{count}',this.number(selected.size,0)));}
        if(remove)remove.disabled=!selected.size||!!this.batchDeleting;
        for(const input of document.querySelectorAll?.('[data-batch-select]')||[]) {input.checked=selected.has(Number(input.dataset.batchSelect));input.disabled=!!this.batchDeleting;}
    }
    toggleBatchSelection(input){
        if(this.batchDeleting||this.batchComputing||this.batchInlineEdit){this.syncBatchSelection();return;}
        const selected=this.batchSelectionSet(),indices=input.id==='batch-select-all'?Array.from({length:this.state.batch.length},(_,i)=>i):[Number(input.dataset.batchSelect)];
        for(const i of indices)if(Number.isInteger(i)&&i>=0&&i<this.state.batch.length){if(input.checked)selected.add(i);else selected.delete(i);}
        this.syncBatchSelection();
    }
    static batchWithoutRows(workspace,indices){
        const selected=new Set(indices);
        if(!selected.size||[...selected].some(i=>!Number.isInteger(i)||i<0||i>=workspace.batch.length))throw Error('batchCorrectionChanged');
        const next=HistoryManager.clone(workspace);next.batch=next.batch.filter((_,i)=>!selected.has(i));HistoryManager.checkWorkspace(next);return next;
    }
    async deleteBatchRows(indices){
        if(this.batchDeleting||this.batchComputing||this.csvBusy||this.csvReading||this.batchCorrection?.busy||this.batchInlineEdit)return;
        const source=this.state,batch=source.batch,selected=[...new Set(indices)].sort((a,b)=>a-b);
        if(!selected.length||selected.some(i=>!Number.isInteger(i)||i<0||i>=batch.length))return;
        if(!window.confirm(this.t('batchDeleteConfirm').replace('{count}',this.number(selected.length,0))))return;
        this.batchDeleting=true;this.syncBatchSelection();
        try{
            const next=WorkspaceApp.batchWithoutRows(source,selected);
            await this.saveImmediate('beforeBatchDelete',true);
            if(this.state!==source||source.batch!==batch||this.page!=='batch')throw Error('batchCorrectionChanged');
            await this.history.save(next,'batchDeleted',true);
            if(this.state!==source||source.batch!==batch||this.page!=='batch')throw Error('batchCorrectionChanged');
            this.state=next;this.batchSelectionSource=null;this.batchSelected=new Set();this.batchPane='results';this.batchPage=Math.min(this.batchPage||0,this.batchDisplayView().pages-1);this.saveState=HistoryManager.hasWork(next)?'saved':'ready';this.checkpoint(false);
            this.batchDeleting=false;this.render('batch-results-title');this.toast('batchDeleteDone');
        }finally{this.batchDeleting=false;this.syncBatchSelection();}
    }
    batchKpiOptions(){
        const entries=this.state.batch,keys=['pending','nutritionModerateCriteria','nutritionSevere','nutritionNoCriteria','nutritionIncomplete','nutritionAgeUnsupported','intergrowthNoScreening'];
        const counts=new Map(keys.map(k=>[k,0]));let assessed=0;
        for(const {result} of entries){
            const key=!result?'pending':result.nutrition?.category||'unclassified';
            if(result?.nutrition?.category)assessed++;
            counts.set(key,(counts.get(key)||0)+1);
        }
        return [...counts].map(([key,count])=>({key,count,disabled:!entries.length||(key!=='pending'&&key!=='unclassified'&&!assessed),label:key==='pending'?'notCalculated':key==='unclassified'?'unknown':this.t(key+'Short')===key+'Short'?key:key+'Short'}));
    }
    batchMobileFilterHTML(){
        const active=this.batchFilter||'all',opts=[{key:'all',count:this.state.batch.length,label:'uiAll',disabled:false},...this.batchKpiOptions()];
        if(active==='quality')opts.push({key:'quality',count:QualityUI.build(this.state.batch).rows.filter(r=>r.codes.length).length,label:'qualityTitle',disabled:false});
        return '<select id="batch-mobile-filter" class="batch-mobile-filter" aria-label="'+this.esc(this.t('uiScreeningFilter'))+'">'+opts.map(({key,count,label,disabled})=>'<option value="'+this.esc(key)+'"'+(active===key?' selected':'')+(disabled?' disabled':'')+'>'+this.esc(this.t(label)+' · '+(disabled?'—':this.number(count,0)))+'</option>').join('')+'</select>';
    }
    batchKpisHTML(){
        const active=this.batchFilter||'all';
        return '<div class="batch-kpis" role="group" aria-label="'+this.esc(this.t('uiScreeningFilter'))+'">'+this.batchSelectionHTML()+this.batchMobileFilterHTML()+this.batchKpiOptions().map(({key,count,disabled,label})=>'<button type="button" class="batch-kpi" data-action="batch-kpi-filter" data-value="'+this.esc(key)+'" aria-pressed="'+(active===key)+'"'+(disabled?' disabled':'')+'><span>'+this.esc(this.t(label))+'</span><strong>'+ (disabled&&key!=='pending'?'—':this.number(count,0))+'</strong></button>').join('')+'</div>';
    }
    syncBatchKpis(){
        const mobile=document.getElementById?.('batch-mobile-filter');if(mobile)mobile.value=this.batchFilter||'all';
        for(const button of document.querySelectorAll?.('[data-action="batch-kpi-filter"]')||[])button.setAttribute('aria-pressed',String(button.dataset.value===(this.batchFilter||'all')));
    }
    setBatchKpiFilter(value,toggle=true){
        if(value!=='all'&&!this.batchKpiOptions().some(k=>k.key===value&&!k.disabled))return;
        this.batchFilter=toggle&&(this.batchFilter||'all')===value?'all':value;
        this.batchPage=0;
        this.refreshBatchBrowser();
    }
    batchHTML() {
        const view=this.batchView(),disabled=!view.total;
        const active=['entry','results','quality','statistics'].includes(this.batchPane)?this.batchPane:(view.total?'results':'entry');
        const hide=key=>active===key?'':' hidden';
        const overview=this.batchKpisHTML();
        const nav=this.viewNav('batch',[['entry','uiEntry','plus'],['results','batchList','batch'],['quality','qualityTitle','check'],['statistics','uiStatistics','chart']],active);
        return `<div class="workspace-grid batch-workspace clinical-workspace">${nav}<section class="card" id="measure-card" data-workspace-panel="batch" data-view="entry"${hide('entry')}><div class="card-top"><h2>${this.t('formTitle')}</h2><div class="toolbar compact-toolbar form-top-actions">${this.toolButton('addBatch','plus','',{primary:true,submit:true,showLabel:true,attrs:'form="batch-form"'})}</div></div>${this.formHTML('batch',this.state.batchDraft,true)}<section class="csv-tools" aria-labelledby="csv-tools-toggle"><div class="csv-tools-heading"><div class="csv-heading-label"><button type="button" class="csv-tools-toggle" id="csv-tools-toggle" data-action="toggle-csv" aria-expanded="${!!this.state.paste}" aria-controls="csv-tools-body csv-heading-actions"><span>${this.t('csvTools')}</span></button>${this.infoButton('csvHelp','csvTools','csv-help-button')}</div><div id="csv-heading-actions" class="toolbar compact-toolbar csv-heading-actions"${this.state.paste?'':' hidden'}><label class="icon-button action-with-label file-label desktop-format-action" title="${this.esc(this.t('importCSV'))}">${this.icon('csv')}${this.actionLabelHTML('importCSV',true)}<input class="file-input" type="file" id="csv-file" aria-label="${this.esc(this.t('importCSV'))}" accept=".csv,text/csv"></label>${this.toolButton('csvTemplate','csv','csv-template',{showLabel:true,labelKey:'csvTemplateShort'})}<button id="csv-parse-button" class="btn" data-action="parse-csv">${this.t('parseCSV')}</button></div></div><div id="csv-tools-body" class="csv-tools-body"${this.state.paste?'':' hidden'}><div class="field"><label for="paste-data">${this.t('pasteLabel')}</label><textarea id="paste-data" rows="3">${this.esc(this.state.paste)}</textarea></div><p id="csv-progress" role="status" aria-live="polite"></p></div></section></section>
          <section class="card batch-results-card" id="batch-results-card"${active==='entry'?' hidden':''}><div class="card-top"><div class="batch-heading"><h2 id="batch-results-title" class="flow-focus" tabindex="-1">${this.t('batchList')} <span class="batch-count">(${this.number(view.total,0)})</span></h2>${this.batchContextNotes().length?this.infoButton('batchContext','batchList','batch-context-info'):''}</div><div class="batch-filter-bar batch-header-filters" data-workspace-panel="batch" data-view="results"${hide('results')}><label><span class="sr-only">${this.t('uiSearchLot')}</span><input placeholder="${this.esc(this.t('uiSearchLot'))}" id="batch-search" type="search" value="${this.esc(this.batchSearch||'')}" autocomplete="off"></label></div><div class="toolbar compact-toolbar batch-actions">${this.toolButton('computeBatch','run','calculate-batch',{primary:true,disabled,showLabel:true,labelKey:'calculateShort'})}${this.toolButton('exportCSV','csv','csv-results',{disabled,showLabel:true,labelKey:'csvShort'})}${this.toolButton('exportPDF','pdf','export-pdf',{disabled:disabled||this.pdfBusy,showLabel:true,labelKey:'pdfShort'})}${this.toolButton('exportPDFCompact','compact','export-pdf',{disabled:disabled||this.pdfBusy,attrs:'data-layout="compact"',showLabel:true,labelKey:'pdfCompactShort'})}${this.toolButton('print','print','print',{disabled,showLabel:true})}${this.toolButton('saveNow','save','save',{showLabel:true,labelKey:'saveShort'})}</div></div><div id="batch-view-results" data-workspace-panel="batch" data-view="results"${hide('results')}>${overview}<div class="batch-browser" id="batch-browser-live">${this.batchBrowserHTML()}</div></div><div id="batch-view-quality" data-workspace-panel="batch" data-view="quality"${hide('quality')}><div data-lot-quality>${view.total?this.qualityHTML({open:true}):`<p class="hint">${this.t('emptyBatch')}</p>`}</div></div><div id="batch-view-statistics" data-workspace-panel="batch" data-view="statistics"${hide('statistics')}>${view.total?this.lotSummaryHTML({compactHelp:true}):`<p class="hint">${this.t('emptyBatch')}</p>`}</div></section></div><div id="batch-print" class="print-only"></div>`;
    }
    qualityHTML({open=false}={}) {
        if(this.qualityWorkspace!==this.state||this.qualityBatch!==this.state.batch){this.qualityWorkspace=this.state;this.qualityBatch=this.state.batch;this.qualityPage=0;this.qualityFilter='';}
        const report=QualityUI.build(this.state.batch),rows=report.rows.filter(r=>r.codes.length&&(!this.qualityFilter||r.codes.includes(this.qualityFilter))),pages=Math.max(1,Math.ceil(rows.length/8));
        this.qualityPage=Math.min(Math.max(0,this.qualityPage||0),pages-1);
        const start=this.qualityPage*8,shown=rows.slice(start,start+8),e=v=>this.esc(v),t=k=>e(this.t(k));
        const mobile='<div class="quality-mobile-bar"><span class="quality-mobile-total">'+e(this.number(report.signalledRows,0))+' / '+e(this.number(report.total,0))+' '+this.infoButton('qualityHelp','qualityTitle','quality-mobile-info')+'</span><select id="quality-mobile-filter" aria-label="'+t('qualityTitle')+'"><option value=""'+(!this.qualityFilter?' selected':'')+'>'+t('mobileAllSignals')+' · '+e(this.number(report.signalledRows,0))+'</option>'+QualityUI.codes.filter(k=>report.counts[k]).map(k=>'<option value="'+e(k)+'"'+(this.qualityFilter===k?' selected':'')+'>'+t(k)+' · '+e(this.number(report.counts[k],0))+'</option>').join('')+'</select></div>';
        const counts=QualityUI.codes.filter(k=>report.counts[k]).map(k=>`<div><dt><button type="button" class="quality-filter-button" data-action="quality-filter" data-value="${e(k)}" aria-pressed="${this.qualityFilter===k}"><span>${t(k)}</span><strong>${e(this.number(report.counts[k],0))}</strong></button></dt></div>`).join('');
        const table=shown.length?`<div class="table-scroll"><table><caption class="sr-only">${t('qualityRows')}</caption><thead><tr><th scope="col">${t('qualityRecord')}</th><th scope="col">${t('qualitySignals')}</th><th scope="col">${t('preview')}</th></tr></thead><tbody>${shown.map(r=>`<tr><th scope="row">${e(this.number(r.index,0))}</th><td>${r.codes.map(t).join(' · ')}</td><td><button class="btn" data-action="quality-view" data-index="${r.index-1}" aria-label="${t('preview')} · ${t('qualityRecord')} ${e(this.number(r.index,0))}">${t('preview')}</button></td></tr>`).join('')}</tbody></table></div>${this.paginationHTML({current:this.qualityPage,pages,total:rows.length,from:start+1,to:start+shown.length},{action:'quality-page',previousAction:'quality-previous',nextAction:'quality-next'})}`:`<p>${t('qualityNoSignals')}</p>`;
        return `<details class="lot-analysis quality-review"${open?' open':''}><summary><span class="quality-heading-layout"><span class="quality-heading-title">${t('qualityTitle')} · ${e(this.number(report.signalledRows,0))} / ${e(this.number(report.total,0))}${this.infoButton('qualityHelp','qualityTitle','quality-review-info')}</span></span></summary>${mobile}${counts?`<dl class="lot-overview quality-heading-counts quality-filter-row">${counts}</dl>`:''}<p class="batch-print-help">${t('qualityHelp')}</p>${table}<p class="hint batch-print-help">${t('analysisPreparationHelp')}</p><div class="toolbar quality-exports"><div class="quality-export-action"><button class="btn" data-action="quality-csv" aria-label="${t('qualityExport')}"><span class="mobile-label-wide">${t('qualityExport')}</span><span class="mobile-label-short">${t('mobileReview')}</span></button>${this.infoButton('qualityExportHelp','qualityExport','quality-export-info')}</div><div class="quality-export-action"><button class="btn" data-action="analysis-csv" aria-label="${t('analysisPreparationExport')}"><span class="mobile-label-wide">${t('analysisPreparationExport')}</span><span class="mobile-label-short">${t('mobileAnalysis')}</span></button>${this.infoButton('analysisPreparationHelp','analysisPreparationExport','quality-analysis-info')}</div></div></details>`;
    }
    renderQuality() {
        const target=document.querySelector('[data-lot-quality]');if(!target)return;
        target.innerHTML=this.qualityHTML({open:true});this.focusPagination('quality-page');
    }
    downloadQuality(analysis=false) {
        const rows=analysis?QualityUI.analysisRows(this.state.batch):QualityUI.reviewRows(this.state.batch);
        const csv='\uFEFF'+rows.map(row=>row.map(CSVManager.cell).join(',')).join('\r\n');
        this.download(csv,(analysis?'zscore-preparation-analyse':'zscore-controle-qualite')+'-'+DateUI.exportFileStamp(new Date(),this.prefs?.timeZone)+'.csv','text/csv');
    }
    static correctedBatch(workspace,index,draft,engine) {
        if(!Number.isInteger(index)||index<0||!workspace?.batch?.[index])throw Error('batchCorrectionChanged');
        const original=workspace.batch[index].child,raw={...original,...draft,growthProfile:draft.growthProfile||original.growthProfile||'who',visitId:original.visitId};
        delete raw.id;
        const entry=engine.calculate(raw);
        HistoryManager.checkChild(entry.child);HistoryManager.checkResult(entry.result,new Set([entry.child.id]));HistoryManager.checkPair(entry.child,entry.result);
        const next=HistoryManager.clone(workspace);next.batch[index]=entry;
        return next;
    }
    static pendingBatchCorrection(workspace,index,draft,engine) {
        const original=workspace?.batch?.[index]?.child;
        if(!Number.isInteger(index)||index<0||!original)throw Error('batchCorrectionChanged');
        const raw={...original,...draft,visitId:original.visitId,growthProfile:draft.growthProfile||original.growthProfile||'who'};
        delete raw.id;
        // These selectors affect the presentation only. Stored inputs remain grams and centimetres.
        delete raw.displayWeightUnit;delete raw.displayHeightUnit;
        for(const key of ['weightUnit','heightUnit'])delete raw[key];
        for(const key of ['muac',...SupplementaryUI.fields])if(raw[key]!==''&&raw[key]!=null)raw[key]=ClinicalEngine.decimal(raw[key],'additionalMeasureInvalid');
        const child=engine.constructor.normalize(raw);
        HistoryManager.checkChild(child);
        const next=HistoryManager.clone(workspace);next.batch[index]={child,result:null};HistoryManager.checkWorkspace(next);
        return next;
    }
    static correctionAgeFields(mode){
        return ({dates:['birthDate'],days:['ageDays'],months:['ageYears','ageMonths'],totalMonths:['ageTotalMonths'],pma:['postmenstrualDays']})[mode]||[];
    }
    static correctionAgeChange(draft,mode,original){
        const next=WorkspaceApp.draftForAgeMode(draft,mode);
        for(const key of ['birthDate','ageDays','ageYears','ageMonths','ageTotalMonths','postmenstrualDays'])next[key]='';
        if(mode===original.ageMode)for(const key of ['birthDate','ageDays','ageYears','ageMonths','ageTotalMonths','postmenstrualDays'])next[key]=original[key]??(key==='ageTotalMonths'&&mode==='totalMonths'?original.totalAgeMonths:'')??'';
        if(next.growthProfile==='intergrowth'&&mode!=='pma'&&original.growthProfile==='intergrowth'&&original.ageMode!=='pma'){
            next.gestationalAgeWeeks=draft.gestationalAgeWeeks??original.gestationalAgeWeeks;
            next.gestationalAgeDays=draft.gestationalAgeDays??original.gestationalAgeDays;
        }
        return next;
    }
    static otherFieldsChanged(context){
        if(!context.initialDraft)return true;
        const keys=new Set([...Object.keys(context.initialDraft),...Object.keys(context.draft)]);
        return [...keys].some(key=>!this.sameBatchField(key,context.initialDraft[key],context.draft[key]));
    }
    openBatchCorrection(index) {
        if(this.batchComputing||this.csvBusy||this.csvReading||this.batchCorrection?.busy)return;
        const entry=this.state.batch[index];if(!Number.isInteger(index)||index<0||!entry)return;
        const draft={...this.emptyDraft('who'),careProtocol:'',...HistoryManager.clone(entry.child),growthProfile:entry.child.growthProfile||'who'};
        if(draft.ageMode==='totalMonths')draft.ageTotalMonths=entry.child.ageTotalMonths??entry.child.totalAgeMonths;
        this.batchCorrection={workspace:this.state,index,entry,draft,initialDraft:HistoryManager.clone(draft),
            units:{weight:this.batchUnit('weight',entry.child),height:this.batchUnit('height',entry.child)}};
        this.renderBatchCorrection();
    }
    readBatchCorrection() {
        const context=this.batchCorrection,form=document.getElementById('correction-form');if(!context||!form)return;
        const {displayWeightUnit,displayHeightUnit,...fields}=Object.fromEntries(new FormData(form));
        if(fields.careProtocol===''&&context.draft.careProtocol==='who2023')fields.careProtocol='who2023';
        context.draft={...context.draft,...fields};
        if(['g','kg'].includes(displayWeightUnit))context.units.weight=displayWeightUnit;
        if(['cm','m'].includes(displayHeightUnit))context.units.height=displayHeightUnit;
    }
    batchOtherFieldsHTML(context){
        const d=context.draft,original=context.entry.child,ig=d.growthProfile==='intergrowth',t=k=>this.esc(this.t(k));
        const group=(key,content,kind)=>'<section class="other-fields-group other-fields-'+kind+'"><h3>'+t(key)+'</h3><div class="other-fields-grid">'+content+'</div></section>';
        const field=(key,type='text',attrs='')=>'<div class="field"><label for="correction-'+key+'">'+t(key)+'</label><input id="correction-'+key+'" name="'+key+'" type="'+type+'" value="'+this.esc(d[key])+'" '+attrs+'></div>';
        const select=(key,options,current=d[key],label=key)=>'<div class="field"><label for="correction-'+key+'">'+t(label)+'</label><select id="correction-'+key+'" name="'+key+'">'+options.map(([value,text])=>'<option value="'+this.esc(value)+'"'+(String(current??'')===value?' selected':'')+'>'+this.esc(this.t(text))+'</option>').join('')+'</select></div>';
        const tri=[['','unknown'],['n','no'],['y','yes']],profile=select('growthProfile',[['who','profileWHO'],['us','profileUS'],['intergrowth','profileINTERGROWTH']],d.growthProfile,'growthProfileVisit');
        const protocol=select('careProtocol',[['','careWHO'],['niger2025','careNiger2025'],['niger2023','careNiger2023']],d.careProtocol==='who2023'?'':d.careProtocol);
        const modes=(ig?['days','dates','pma']:['days','totalMonths','months','dates']).map(k=>[k,k]);
        const ageMode=select('ageMode',modes,d.ageMode).replace('<label for="correction-ageMode">','<label class="sr-only" for="correction-ageMode">');
        const ageOldKeys=WorkspaceApp.correctionAgeFields(original.ageMode);
        const oldAge=ageOldKeys.map(k=>t(k)+' : '+this.esc(k==='birthDate'&&original[k]?this.calendarDate(original[k]):original[k]??(k==='ageTotalMonths'?original.totalAgeMonths:null)??this.t('unknown'))).join(' · ');
        const oldAgeHTML='<p class="hint other-age-original">'+t('batchPreviousAge')+' : '+t(original.ageMode)+' · '+oldAge+'</p>';
        const ageChanged=d.ageMode!==original.ageMode;
        const ageInputs=(ageChanged||ig&&d.ageMode==='pma')?WorkspaceApp.correctionAgeFields(d.ageMode).map(k=>field(k,k==='birthDate'?'date':'text',k==='birthDate'?'max="'+ClinicalEngine.today()+'"':'inputmode="decimal"')).join(''):'';
        const gestation=ig&&d.ageMode!=='pma'?field('gestationalAgeWeeks','number','min="0" max="36" step="1"')+field('gestationalAgeDays','number','min="0" max="6" step="1"'):'';
        const unit=(key,units,label)=>select('display'+(key==='weight'?'Weight':'Height')+'Unit',units.map(u=>{
            const value=WorkspaceApp.batchDisplayMeasure(original[key],key,u);
            return [u,(value===null?'—':value.toLocaleString(this.prefs.language,{maximumFractionDigits:6}))+' '+u];
        }),context.units?.[key]||this.batchUnit(key,original),label);
        const clinical=select('oedemaGrade',[['','unknown'],['1','grade1'],['2','grade2'],['3','grade3']])+NutritionUI.dangerFields.map(k=>select(k,tri)).join('')+select('acuteProblem',tri)+select('appetite',[['','unknown'],['good',d.careProtocol==='niger2025'?'pcima2025AppetitePassed':d.careProtocol==='niger2023'?'pcimaAppetitePassed':'appetiteGood'],['poor','appetitePoor']])+select('furtherAssessment',[['','unknown'],['n','assessmentNone'],['y','assessmentNeeded'],['cleared','assessmentCleared']])+NutritionUI.observationsFor(d).map(k=>select(k,tri)).join('');
        const supplements=field('headCircumference','text','inputmode="decimal"')+(!ig||SupplementaryUI.present(d.tricepsSkinfold)||SupplementaryUI.present(d.subscapularSkinfold)?field('tricepsSkinfold','text','inputmode="decimal"')+field('subscapularSkinfold','text','inputmode="decimal"'):'');
        const position=ig&&d.position==='H'?select('position',[['','unknown'],['L','lying'],['H','standing']]):'';
        return '<form id="correction-form" class="clinical-entry-form batch-other-fields" novalidate>'+group('settingsClinical',profile+protocol,'references')+group('ageMode',ageMode+oldAgeHTML+ageInputs+gestation,'age')+group('batchDisplayUnit',unit('weight',['g','kg'],'weightUnit')+unit('height',['cm','m'],'heightUnit'),'units')+group('additionalMeasures',supplements+position,'supplements')+(ig&&(SupplementaryUI.present(d.tricepsSkinfold)||SupplementaryUI.present(d.subscapularSkinfold))?'<p class="notice warn">'+t('intergrowthUnsupportedMeasures')+'</p>':'')+group('clinicalSection',clinical,'clinical')+'<div id="correction-error" class="notice error" role="alert" tabindex="-1" hidden></div></form>';
    }
    batchCorrectionDialogHTML(context){
        const t=k=>this.esc(this.t(k)),child=context.entry.child;
        const info='<details class="other-fields-help"><summary title="'+t('batchOtherFieldsHelp')+'" aria-label="'+this.esc(this.t('helpAbout')+' '+this.t('batchOtherFields'))+'">'+this.icon('info')+'</summary><p>'+t('batchOtherFieldsHelp')+'</p></details>';
        const identity='<span class="other-fields-identity"><bdi>'+this.esc(child.name||this.t('unknown'))+'</bdi>'+(child.caseId?' <span aria-hidden="true">·</span> <bdi>'+this.esc(child.caseId)+'</bdi>':'')+'</span>';
        const actions='<div class="other-fields-actions">'+this.toolButton('batchSaveChanges','save','save-batch-correction',{primary:true})+this.toolButton('close','close','close-dialog')+'</div>';
        return '<div class="dialog-top other-fields-heading">'+info+'<h2 id="dialog-title">'+t('batchOtherFields')+'</h2>'+identity+actions+'</div><div class="dialog-body" role="region" aria-labelledby="dialog-title" tabindex="0"><p id="correction-progress" role="status" aria-live="polite"></p>'+this.batchOtherFieldsHTML(context)+'</div>';
    }
    renderBatchCorrection(focus='correction-growthProfile') {
        const context=this.batchCorrection;if(!context)return;
        const previousMode=context.draft.ageMode,previousProfile=context.draft.growthProfile;
        const dialog=document.getElementById('workspace-dialog');
        dialog.classList.remove('csv-mapping-dialog');dialog.classList.add('batch-other-fields-dialog');
        dialog.innerHTML=this.batchCorrectionDialogHTML(context);
        if(!dialog.open)dialog.showModal();
        const form=document.getElementById('correction-form');
        form.addEventListener('submit',event=>{event.preventDefault();this.saveBatchCorrection();});
        form.addEventListener('change',event=>{
            if(!['ageMode','growthProfile','careProtocol'].includes(event.target.name))return;
            this.readBatchCorrection();
            if(event.target.name==='growthProfile'){
                const next=WorkspaceApp.draftForProfile(context.draft,event.target.value);
                context.draft=next.ageMode!==previousMode?WorkspaceApp.correctionAgeChange(next,next.ageMode,context.entry.child):next;
                // A national screening protocol is not valid for the US or preterm profile.
                // Keep the explicit choice visible; validation requires the user to select a valid protocol.
                if(previousProfile!==next.growthProfile&&next.growthProfile!=='intergrowth')for(const key of ['postmenstrualDays','gestationalAgeWeeks','gestationalAgeDays'])context.draft[key]='';
            }else if(event.target.name==='ageMode')context.draft=WorkspaceApp.correctionAgeChange(context.draft,event.target.value,context.entry.child);
            this.renderBatchCorrection('correction-'+event.target.name);
        });
        document.getElementById(focus)?.focus();
    }
    async saveBatchCorrection() {
        const context=this.batchCorrection;if(!context||context.busy)return;
        const current=()=>this.batchCorrection===context&&this.state===context.workspace&&this.state.batch[context.index]===context.entry;
        this.readBatchCorrection();context.busy=true;
        const dialog=document.getElementById('workspace-dialog'),form=document.getElementById('correction-form');
        const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>{b.disabled=true;});if(form)form.inert=true;
        dialog.setAttribute('aria-busy','true');document.getElementById('correction-progress').textContent=this.t('saving');
        try{
            const changed=WorkspaceApp.otherFieldsChanged(context);
            const next=changed?WorkspaceApp.pendingBatchCorrection(context.workspace,context.index,context.draft,this.engine):context.workspace;
            if(changed){
                await this.saveImmediate('beforeBatchCorrection',true);
                if(!current())throw Error('batchCorrectionChanged');
                await this.history.save(next,'correctedBatch',true);
                if(!current())throw Error('batchCorrectionChanged');
            }
            if(context.units){this.batchUnitsByVisit||=new Map();this.batchUnitsByVisit.set(context.entry.child.visitId||context.entry.child.id,{...context.units});}
            this.batchCorrection=null;this.state=next;
            if(changed){this.batchPane='results';this.batchSearch='';this.batchFilter='all';this.batchPage=Math.floor(context.index/8);this.saveState='saved';this.checkpoint(false);}
            dialog.close();this.render('batch-correct-'+context.index);
            this.toast(changed?'batchOtherFieldsSaved':'batchDisplaySaved');
        }catch(error){if(form)form.inert=false;if(current())this.formError('correction',error.message);else this.toast(error.message,true);}
        finally{context.busy=false;dialog.removeAttribute('aria-busy');buttons.forEach(b=>{b.disabled=false;});if(form)form.inert=false;const progress=document.getElementById('correction-progress');if(progress)progress.textContent='';}
    }
    preparePrint() {
        const target=document.getElementById('batch-print');
        if(target)target.innerHTML=this.page==='batch'?this.lotSummaryHTML({open:true,exportButton:false})+this.tableHTML(this.state.batch):'';
    }
    tableHTML(entries, {compact=false,editable=false,offset=0,indices=null} = {}) {
        const indicators = ClinicalEngine.indicators.filter(key=>entries.some(e=>WorkspaceApp.resultIndicators(e.result).includes(key)));
        const visual=compact&&editable;const columns = ['name','weight','height',...(visual?['muac','uiScreening']:[]),...indicators];
        const number = (value,digits=2) => `<bdi class="score-number" dir="ltr">${this.number(value,digits)}</bdi>`;
        const note = key => `<div class="${compact&&key==='withinReference'?'sr-only':'item-sub'}">${this.esc(this.t(key))}</div>`;
        const cell = (key,value) => `<td role="cell"${indicators.includes(key)?' class="score"':''}><span class="cell-label" aria-hidden="true">${this.esc(visual&&['weight','height'].includes(key)?this.t(key==='weight'?'pdfWeightShort':'pdfHeightShort')+' ('+this.batchUnit(key)+')':this.t(key))}</span><div class="cell-value">${value}</div></td>`;
        return `<table class="results-table" role="table" aria-label="${this.esc(this.t('resultsTitle'))}"><thead role="rowgroup"><tr role="row">${columns.map(key=>`<th role="columnheader" scope="col">${visual&&['weight','height'].includes(key)?this.batchUnitPicker(key):`<abbr title="${this.esc(this.t(key))}">${this.esc(this.t(compact?({weightForAge:'shortWFA',heightForAge:'shortHFA',weightForHeight:'shortWFH',bmiForAge:'shortBFA',weight:'weightShort',height:'heightShort'}[key]||key):key))}</abbr>`}</th>`).join('')}</tr></thead><tbody role="rowgroup">${entries.map(({child,result},i)=>{
            const index=indices?.[i]??offset+i;
            const identity=`<bdi dir="auto" class="item-title">${this.esc(child.name||child.caseId||this.t('unknown'))}</bdi><div class="item-sub"><bdi dir="auto">${this.esc(child.name?child.caseId||'':'')}</bdi></div>${child.measurementDate?`<div class="${compact?'sr-only':'item-sub'}">${this.esc(this.t('measurementDate'))} : <bdi>${this.esc(this.calendarDate(child.measurementDate))}</bdi></div>`:''}${result?.nutrition?`<div class="item-sub">${this.t('muac')} : ${result.nutrition.muacMm==null?this.t('unknown'):this.esc(this.number(result.nutrition.muacMm,1))+' mm'}</div>${compact?`<details class="row-assessment ${result.nutrition.category==='nutritionSevere'||['orientationUrgent','orientationInpatient'].includes(result.nutrition.orientation)?'clinical-urgent':''}"><summary>${this.esc(this.t(result.nutrition.category+'Short'))} · ${this.esc(this.t(result.nutrition.orientation+'Short'))}</summary><p>${this.esc(this.t(result.nutrition.category))}</p><p>${this.esc(this.t(result.nutrition.orientation))}</p><p>${(result.nutrition.criteria||[]).map(k=>this.esc(this.t(k))).join(' · ')}</p>${result.referenceFamily==='INTERGROWTH2015'?(result.warnings||[]).map(note).join(''):''}</details>`:`<div class="item-sub">${this.esc(this.t(result.nutrition.category))} · ${this.esc(this.t(result.nutrition.orientation))}</div>`}`:''}${this.additionalResultsHTML(result)}${!result?note('notCalculated'):''}${result?.imported&&!compact?note('importedResult'):''}${(result?.warnings||[]).filter(key=>!compact||result?.referenceFamily!=='INTERGROWTH2015'&&key!=='estimatedAge').map(note).join('')}`;
            const displayIdentity=visual?`<bdi dir="auto" class="item-title">${this.esc(child.name||child.caseId||this.t('unknown'))}</bdi><div class="item-sub"><bdi>${this.esc(child.name?child.caseId||'':'')}</bdi> · ${this.esc(this.calendarDate(child.measurementDate))}</div>${result?.imported?note('importedResult'):''}${(result?.warnings||[]).filter(k=>k!=='estimatedAge').map(note).join('')}`:identity;
            const n=result?.nutrition,screening=n?`<div class="batch-screening ${n.category==='nutritionSevere'||['orientationUrgent','orientationInpatient'].includes(n.orientation)?'clinical-urgent':''}"><strong>${this.esc(this.t(n.category+'Short'))}</strong><div>${this.esc(this.t(n.orientation+'Short'))}</div>${(n.criteria||[]).map(k=>`<div class="item-sub">${this.esc(this.t(k))}</div>`).join('')}</div>`:note(result?(result.referenceFamily==='INTERGROWTH2015'?'pdfScreeningNA':'unknown'):'notCalculated');
            return `<tr role="row"${visual&&!result?' class="pending-batch-row"':''}>${cell('name',displayIdentity+(visual?`<button class="btn row-preview" data-action="quality-view" data-index="${index}">${this.icon('info')}${this.t('preview')}</button>`:'')+(editable?`<button type="button" id="batch-correct-${index}" class="btn row-correction" data-action="batch-correct" data-index="${index}" aria-label="${this.esc(this.t('batchCorrectionEdit')+' · '+this.t('qualityRecord')+' '+this.number(index+1,0)+' · '+(child.name||child.caseId||this.t('unknown')))}">${this.icon('edit')}<span>${this.t('batchCorrectionEdit')}</span></button>`:''))}${cell('weight',visual?this.batchMeasureHTML(child,index,'weight'):number(child.weight,0))}${cell('height',visual?this.batchMeasureHTML(child,index,'height'):number(child.height,1))}${visual?cell('muac',this.batchEditable(child,index,'muac',this.t('muac'),this.number(child.muac,1)))+cell('uiScreening',screening):''}${indicators.map(key=>{
                if(visual&&!result)return cell(key,`<span class="pending-score" title="${this.esc(this.t('notCalculated'))}"><span aria-hidden="true">—</span><span class="sr-only">${this.esc(this.t('notCalculated'))}</span></span>`);
                const value=key==='bmiForAge'&&result?.schemaVersion!==4?null:result?.[key],hasValue=typeof value?.zscore==='number'&&Number.isFinite(value.zscore);
                const category=value?.classification;
                return cell(key,`${hasValue?number(value.zscore):'<span class="score-number">—</span>'}${this.percentileHTML(value,result)}${note(hasValue?(category||(result?.referenceFamily==='INTERGROWTH2015'?'intergrowthDescriptive':'unknown')):key==='bmiForAge'&&result&&!result.schemaVersion===4?'indicatorNotStored':'notCalculated')}${value?.flagged?note('flagged'):''}${value?.error?note(value.error):''}`);
            }).join('')}</tr>`;
        }).join('')}</tbody></table>`;
    }
    static historyMatches(session,filter){
        const w=session.metadata?.workspace,entries=w?[...(w.single?[w.single]:[]),...(w.batch||[])]:[];
        const mode=session.summary?.mode||w?.mode,records=session.summary?.records??entries.length,calculated=session.summary?.calculated??entries.filter(e=>!!e.result).length;
        return filter==='all'||filter===mode||filter==='imported'&&!!session.metadata?.importedAt||filter==='draft'&&!records||filter==='pending'&&records>0&&!calculated||filter==='complete'&&records>0&&calculated===records||filter==='mixed'&&calculated>0&&calculated<records;
    }
    historyKpisHTML(){
        const active=this.historyFilter||'all',labels={all:'historyAll',draft:'historyDrafts',imported:'imported',batch:'batch',single:'single',complete:'historyComplete',pending:'notCalculated',mixed:'historyMixed'};
        const sessions=this.sessions||[];
        return Object.entries(labels).map(([key,label])=>'<button type="button" class="history-kpi" data-action="history-kpi" data-value="'+key+'" aria-pressed="'+(active===key)+'"><span>'+this.esc(this.t(label))+'</span><strong>'+this.esc(this.number(sessions.filter(s=>WorkspaceApp.historyMatches(s,key)).length,0))+'</strong></button>').join('');
    }
    historyHTML() {
        const active=this.historyPane==='versions'?'versions':'backup';
        return `${this.viewNav('history',[['backup','historyBackupTab','save'],['versions','historyVersionsTab','history']],active)}<div id="history-view-backup" data-workspace-panel="history" data-view="backup"${active==='backup'?'':' hidden'}><div class="toolbar"><button class="btn primary" data-action="export-backup" aria-label="${this.esc(this.t('exportAll'))}"><span class="mobile-label-wide">${this.t('exportAll')}</span><span class="mobile-label-short">${this.t('mobileExportAll')}</span></button><button class="btn" data-action="password-export" aria-label="${this.esc(this.t('exportEncrypted'))}"><span class="mobile-label-wide">${this.t('exportEncrypted')}</span><span class="mobile-label-short">${this.t('mobileExportEncrypted')}</span></button><label class="btn file-label"><span class="mobile-label-wide">${this.t('importBackup')}</span><span class="mobile-label-short">${this.t('mobileImportBackup')}</span><input aria-label="${this.esc(this.t('importBackup'))}" class="file-input" type="file" id="backup-file" accept=".zscore,.enc,application/x-ndjson,application/octet-stream"></label></div><p class="hint">${this.t('exportSensitive')}</p><p class="hint">${this.t('transferHelp')}</p><p id="transfer-status" role="status" aria-live="polite"></p><section id="storage-capacity" class="card capacity" aria-labelledby="storage-capacity-title" aria-live="polite">${this.capacityHTML()}</section></div><div id="history-view-versions" data-workspace-panel="history" data-view="versions"${active==='versions'?'':' hidden'}><div class="history-filter-bar"><div class="field search"><label for="history-search">${this.t('search')}</label><input type="search" id="history-search" placeholder="${this.esc(this.t('search'))}" value="${this.esc(this.search)}"></div><div class="field history-mobile-filter"><label for="history-filter">${this.t('historyFilter')}</label><select id="history-filter">${['all','single','batch','imported','draft','pending','complete','mixed'].map(k=>`<option value="${k}"${(this.historyFilter||'all')===k?' selected':''}>${this.t(({all:'historyAll',pending:'notCalculated',complete:'historyComplete',mixed:'historyMixed'}[k]||k))}</option>`).join('')}</select></div><div id="history-kpis" class="history-kpis">${this.historyKpisHTML()}</div></div><div id="history-list" class="list"></div><div id="history-pages"></div><p class="meta">${this.t('allPreserved')}</p></div>`;
    }
    formatBytes(value) {
        if(!Number.isSafeInteger(value)||value<0)return this.t('storageUnknown');
        const large=value>=1024**3;return `<bdi dir="ltr">${this.number(value/(large?1024**3:1024**2),1)}</bdi> ${this.t(large?'unitGiB':'unitMiB')}`;
    }
    static storageEstimate(value) {
        const valid=number=>Number.isSafeInteger(number)&&number>=0;
        return {usage:valid(value?.usage)?value.usage:null,quota:valid(value?.quota)&&value.quota>0?value.quota:null};
    }
    capacityHTML() {
        const stats=this.history?.catalogStats,estimate=this.capacityInfo||{usage:null,quota:null},size=stats?.backupBytes;
        const near=estimate.quota&&estimate.usage!==null&&estimate.usage>=estimate.quota*.8;
        return `<h2 id="storage-capacity-title">${this.t('storageTitle')}</h2><dl class="capacity-data"><dt>${this.t('versions')}</dt><dd>${stats?this.number(stats.versions,0):this.t('storageUnknown')}</dd><dt>${this.t('storageBackupEstimate')}</dt><dd>${this.formatBytes(size)}</dd><dt>${this.t('storageOriginEstimate')}</dt><dd>${this.formatBytes(estimate.usage)}</dd><dt>${this.t('storageQuotaEstimate')}</dt><dd>${this.formatBytes(estimate.quota)}</dd><dt>${this.t('encryptedLimit')}</dt><dd><bdi dir="ltr">1</bdi> GiB</dd></dl>${near?`<p class="notice warn">${this.t('storageNearFull')}</p>`:''}<p class="hint">${this.t('storageCapacityNote')}</p><div class="toolbar"><button class="btn" data-action="capacity-refresh" ${this.capacityBusy?'disabled':''}>${this.t(this.capacityBusy?'storageCapacityLoading':'storageCapacityRefresh')}</button></div>`;
    }
    async refreshCapacity(provider=()=>navigator.storage?.estimate?.()) {
        if(this.capacityBusy)return;this.capacityBusy=true;
        const restoreFocus=document.activeElement?.dataset?.action==='capacity-refresh';
        const update=()=>{const target=document.getElementById('storage-capacity');if(target)target.innerHTML=this.capacityHTML();};update();
        try{this.capacityInfo=WorkspaceApp.storageEstimate(await provider());}catch(_){this.capacityInfo={usage:null,quota:null};}
        finally{this.capacityBusy=false;update();if(restoreFocus)document.querySelector?.('#storage-capacity [data-action="capacity-refresh"]')?.focus();}
    }
    historyName(session) {
        const w=session.metadata?.workspace;
        return session.name || w?.draft?.name || w?.draft?.caseId || w?.batchDraft?.name || w?.batchDraft?.caseId || w?.single?.child?.caseId || this.t('draft');
    }
    historySearchKey(text) { return String(text??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase(this.prefs.language).trim().replace(/\s+/gu,' '); }
    historySearchText(session) {
        // Saved versions are immutable. A WeakMap avoids retaining discarded catalogs.
        this.historySearchIndex ||= new WeakMap();
        if (!session.summary && !this.historySearchIndex.has(session)) {
            const w = session.metadata?.workspace;
            const people = [w?.draft, w?.batchDraft, w?.single?.child, ...(w?.batch || []).map(e => e.child)];
            this.historySearchIndex.set(session, `${session.name || ''} ${people.map(c => `${c?.name || ''} ${c?.caseId || ''}`).join(' ')} ${session.createdAt || ''}`.toLocaleLowerCase());
        }
        const name=this.historyName(session),aliases=name===this.t('draft')?this.t('draftSearchAliases'):'';
        return this.historySearchKey(`${session.summary?.searchText || this.historySearchIndex.get(session) || ''} ${name} ${aliases}`);
    }
    renderHistoryList() {
        const query = this.historySearchKey(this.search);
        const filter=this.historyFilter||'all';
        const filtered=this.sessions.filter(s=>(!query||this.historySearchText(s).includes(query))&&WorkspaceApp.historyMatches(s,filter));
        const kpis=document.getElementById('history-kpis');if(kpis)kpis.innerHTML=this.historyKpisHTML();
        const mobile=document.getElementById('history-filter');if(mobile)mobile.value=filter;
        const pages = Math.max(1, Math.ceil(filtered.length / 8)); this.historyPage = Math.max(0, Math.min(Number.isFinite(this.historyPage) ? this.historyPage : 0,pages-1));
        const rows = filtered.slice(this.historyPage*8,(this.historyPage+1)*8);
        document.getElementById('history-list').innerHTML = rows.length ? rows.map(s => {
            const w = s.metadata.workspace, count = s.summary?s.summary.count:new Set([...(w?.batch || []).map(e => e.child.id), ...(w?.single ? [w.single.child.id] : [])]).size;
            const reason = s.metadata.importedAt ? 'imported' : s.metadata.reason || 'automatic';
            const name = this.historyName(s);
            const detail = `${this.date(s.createdAt)} · ${this.t(reason)} · ${count} ${this.t('count')}`;
            const mode=s.summary?.mode||w?.mode,records=s.summary?.records??((w?.single?1:0)+(w?.batch?.length||0)),calculated=s.summary?.calculated??((w?.single?.result?1:0)+(w?.batch||[]).filter(e=>!!e.result).length);
            const state=!records?'draft':!calculated?'notCalculated':calculated===records?'historyComplete':'historyMixed';
            return `<article class="history-item"><div><div class="item-title">${this.esc(name)}</div><div class="item-sub">${this.esc(detail)}</div><div class="history-tags"><span>${this.t(mode==='batch'?'batch':'single')}</span><span>${this.t(state)}${records?' · '+this.number(calculated,0)+' / '+this.number(records,0):''}</span></div></div><button class="btn" data-action="preview" data-id="${this.esc(s.id)}" aria-label="${this.esc(`${this.t('preview')} · ${name} · ${detail}`)}">${this.t('preview')}</button></article>`;
        }).join('') : `<div class="card empty">${this.t('emptyHistory')}</div>`;
        const view={current:this.historyPage,pages,total:filtered.length,from:filtered.length?this.historyPage*8+1:0,to:Math.min(filtered.length,(this.historyPage+1)*8)};
        document.getElementById('history-pages').innerHTML=this.paginationHTML(view,{action:'history-page',previousAction:'history-previous',nextAction:'history-next',statusId:'history-pagination'});
        document.querySelector('[data-action="history-previous"]').disabled = this.historyPage === 0;
        document.querySelector('[data-action="history-next"]').disabled = this.historyPage >= pages-1;
    }
    quickGuideHTML() {
        return `<section class="card full quick-guide" aria-labelledby="quick-guide-title"><h2 id="quick-guide-title">${this.t('quickGuideTitle')}</h2><div class="quick-guide-grid">${['Measure','Resume','Transfer','Offline','Reports'].map(topic=>`<details><summary>${this.t('quickGuide'+topic)}</summary><p>${this.t('quickGuide'+topic+'Text')}</p></details>`).join('')}</div></section>`;
    }
    referencesHTML() {
        const links = [['sourceClinical2023','https://www.who.int/publications/i/item/9789240082830'],['sourceClinical2026','https://www.who.int/publications/i/item/9789240122840'],['sourceWHO','https://www.who.int/tools/child-growth-standards/standards'],['sourceAnthro','https://www.who.int/toolkits/child-growth-standards/software'],['sourceClassification','https://www.who.int/data/nutrition/nlis/info/malnutrition-in-children/'],['sourceCode','https://github.com/WorldHealthOrganization/anthro/tree/'+this.engine.data.sourceCommit+'/data-raw/growthstandards'],['sourceLicense','data/LICENSE-anthro.txt'],['sourceWHO2007','https://www.who.int/tools/growth-reference-data-for-5to19-years'],['sourceLicense2007','data/LICENSE-anthroplus.txt'],['sourceCDC','https://www.cdc.gov/growthcharts/cdc-data-files.htm'],['sourceCDC2022','https://www.cdc.gov/growthcharts/extended-bmi-data-files.htm'],['sourceIntergrowth','https://intergrowth21.com/tools-resources/postnatal-growth-preterm-infants'],['sourceIntergrowthUse','https://globalhealthtrainingcentre.tghn.org/preterm-infant-feeding-and-growth-monitoring-implementation-intergrowth-21st-protocol/faqs/'],['sourceIntergrowthCode','https://github.com/ropensci/gigs/blob/fb58fe6596d4b289d5362c5efe00f882984d3186/R/ig_png.R']];
        const sourceGroups=[[['referenceCare',links.slice(0,2)],['referencePreterm',links.slice(11)],['referenceCDC',links.slice(9,11)]],[['referenceWHO',links.slice(2,9)]]];
        const helpCard=([title,text])=>`<section class="card"><h2>${this.t(title)}</h2><p>${this.t(text)}</p></section>`;
        return `<div class="reference-grid">${this.quickGuideHTML()}<section class="card full"><span class="eyebrow">OMS / WHO · 2006 / 2007 · CDC 2000 / 2022 · INTERGROWTH</span><h2>${this.t('references')}</h2><div class="source-groups">${sourceGroups.map(column=>`<div class="source-column">${column.map(([title,items])=>`<section class="source-group"><h3>${this.t(title)}</h3><ul class="source-links">${items.map(([k,url])=>`<li><a href="${url}" target="_blank" rel="noopener noreferrer">${this.t(k)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul></section>`).join('')}</div>`).join('')}</div><details class="reference-integrity"><summary>${this.t('referenceBoth')}</summary><p class="meta">${this.esc(this.manifest.referenceVersion)}<br>SHA-256 : ${this.manifest.sha256}</p>${this.olderManifest?`<p class="meta">${this.esc(this.olderManifest.referenceVersion)}<br>SHA-256 : ${this.olderManifest.sha256}</p>`:''}${this.cdcManifest?`<p class="meta">${this.esc(this.cdcManifest.referenceVersion)}<br>SHA-256 : ${this.cdcManifest.sha256}</p>`:''}<p class="meta">${this.esc(PretermUI.reference)} · ${this.esc(PretermUI.version)}</p></details></section><div class="reference-help-column">${[['scope','scopeText'],['measurementHelp','measurementHelpText'],['validationTitle','validationText']].map(helpCard).join('')}</div><div class="reference-help-column">${[['method','methodText'],['privacyTitle','privacyText']].map(helpCard).join('')}<section class="card"><h2>${this.t('updateCurrent').replace('{version}',WorkspaceApp.version)}</h2><button class="btn" data-action="check-update" ${this.offlineRegistration?'':'disabled'}>${this.t('updateCheck')}</button></section></div></div>`;
    }
    events() {
        this.choicePopup();
        document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=document.querySelector('.export-menu[open]');if(menu){event.preventDefault();menu.removeAttribute('open');menu.querySelector('summary')?.focus();return;}}if(this.activeInfo&&event.key==='Escape'){event.preventDefault();this.closeInfo(true);return;}this.choiceKey(event);});
        document.addEventListener('pointerdown',event=>{const menu=document.querySelector('.export-menu[open]');if(menu&&!menu.contains(event.target))menu.removeAttribute('open');if(this.activeChoice&&!document.getElementById('choice-popup')?.contains(event.target)&&!document.getElementById(this.activeChoice.buttonId)?.contains(event.target))this.closeChoice();if(this.activeInfo&&!document.getElementById('info-popup')?.contains(event.target)&&!document.getElementById(this.activeInfo.opener)?.contains(event.target))this.closeInfo();});
        window.addEventListener('resize',()=>{this.closeChoice();this.closeInfo();if(window.innerWidth<=680){const review=document.querySelector('#batch-view-quality .quality-review');if(review)review.open=true;}});
        window.addEventListener('scroll',event=>{if(this.activeChoice&&!document.getElementById('choice-popup')?.contains(event.target))this.closeChoice();if(this.activeInfo&&!document.getElementById('info-popup')?.contains(event.target))this.closeInfo();},true);
        window.addEventListener('beforeprint',()=>this.preparePrint());
        window.addEventListener('afterprint',()=>{const target=document.getElementById('batch-print');if(target)target.textContent='';});
        const header = document.getElementById('header-dialog');
        header.addEventListener('close', () => {
            if (header.open) return;
            const opener = document.getElementById(header.dataset.opener);
            opener?.setAttribute('aria-expanded','false'); opener?.focus({preventScroll:true});
        });
        header.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const buttons = [...header.querySelectorAll('button:not(:disabled)')];
            const first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
        header.addEventListener('click', event => {
            if (event.target !== header) return;
            const r = header.getBoundingClientRect();
            if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) header.close();
        });
        window.addEventListener('resize',()=>{if(innerWidth>680&&header.open&&header.classList.contains('mobile-actions-dialog'))header.close();});
        document.getElementById('workspace-dialog').addEventListener('cancel',event=>{if(this.batchCorrection?.busy)event.preventDefault();});
        document.getElementById('workspace-dialog').addEventListener('keydown',event=>this.workspaceDialogKey(event));
        document.getElementById('workspace-dialog').addEventListener('close',()=>this.workspaceDialogClosed());
        document.getElementById('app-root').addEventListener('submit', async event => {
            if(header.open&&header.classList.contains('mobile-actions-dialog'))header.close();
            event.preventDefault(); this.readForms();
            try {
                if (event.target.id === 'single-form') { this.state.single = WorkspaceApp.retainCalculation(this.state.single,this.engine.calculate(this.state.draft)); this.state.draft.visitId = this.state.single.child.visitId; this.state.stale = false; await this.saveImmediate('calculated'); this.singleEditing=false;this.singleView='summary'; this.render('results-title'); }
                else if (event.target.id === 'batch-form') {
                    if(this.csvBusy||this.csvReading||this.batchComputing)return;
                    const child = GrowthEngine.normalize(this.state.batchDraft);
                    if (this.state.batch.length >= CSVManager.batchSize) throw new Error('batchLimit');
                    this.state.batch.push({ child, result: null }); this.batchPage=Math.floor((this.state.batch.length-1)/8);this.batchPane='entry';this.batchSearch='';this.batchFilter='all';this.state.batchDraft = this.emptyDraft(); await this.saveImmediate('automatic'); this.render('batch-caseId');
                }
            } catch (error) { this.formError(event.target.id.startsWith('batch') ? 'batch' : 'single',error.message); }
        });
        document.getElementById('app-root').addEventListener('keydown',event=>{
            if(!event.target.matches?.('[data-inline-input]')||event.isComposing)return;
            if(event.key==='Enter'){event.preventDefault();this.saveBatchInline();}
            else if(event.key==='Escape'){event.preventDefault();this.cancelBatchInline();}
        });
        document.getElementById('app-root').addEventListener('input', event => {
            if(event.target.matches?.('[data-inline-input]')){if(this.batchInlineEdit&&!this.batchInlineEdit.busy)this.batchInlineEdit.value=event.target.value;return;}
            if(event.target.id==='batch-search'){if(this.batchInlineEdit&&this.batchInlineEdit.workspace===this.state){event.target.value=this.batchSearch||'';return;}this.batchSearch=event.target.value;this.batchPage=0;this.refreshBatchBrowser();return;}
            if (event.target.id === 'history-search') { this.search = event.target.value; this.historyPage = 0; this.renderHistoryList(); return; }
            const displayOnly=['weightUnit','heightUnit'].includes(event.target.name)&&this.changeMeasureUnit(event.target);
            if (event.target.closest('#single-form,#batch-form') || event.target.id === 'paste-data') {
                this.readForms();
                if(!displayOnly&&event.target.closest('#single-form')&&this.state.single)this.updateDraftStaleness();
                this.scheduleSave();
            }
        });
        document.getElementById('app-root').addEventListener('change', async event => {
            if(event.target.dataset?.datePreference){const key=event.target.dataset.datePreference,value=event.target.value;if((key==='dateFormat'&&['auto','dmy','mdy','iso'].includes(value))||(key==='timeZone'&&DateUI.validTimeZone(value))){this.prefs[key]=value;this.persistPreferences();this.render(key+'-button');}return;}
            if(event.target.id==='batch-select-all'||event.target.dataset?.batchSelect!==undefined){this.toggleBatchSelection(event.target);return;}
            if(event.target.matches?.('[data-inline-input]')){if(this.batchInlineEdit&&!this.batchInlineEdit.busy)this.batchInlineEdit.value=event.target.value;return;}
            if(event.target.dataset?.batchUnit){
                const key=event.target.dataset.batchUnit,unit=event.target.value,id=event.target.id;
                if(this.batchInlineEdit&&this.batchInlineEdit.workspace===this.state){event.target.value=this.batchUnit(key);this.toast('batchInlineFinish',true);return;}
                if(key==='weight'&&['g','kg'].includes(unit))this.batchWeightUnit=unit;
                if(key==='height'&&['cm','m'].includes(unit))this.batchHeightUnit=unit;
                this.refreshBatchBrowser();document.getElementById(id)?.focus();return;
            }
            if(event.target.id==='batch-mobile-filter'){
                if(this.batchInlineEdit&&this.batchInlineEdit.workspace===this.state){this.syncBatchKpis();return;}
                this.setBatchKpiFilter(event.target.value,false);return;
            }
            if(event.target.id==='quality-mobile-filter'){
                const value=event.target.value;if(value&&!QualityUI.codes.includes(value))return;
                this.qualityFilter=value;this.qualityPage=0;this.renderQuality();document.getElementById('quality-mobile-filter')?.focus({preventScroll:true});return;
            }
            if(event.target.id==='history-filter'){this.historyFilter=event.target.value;this.historyPage=0;this.renderHistoryList();return;}

            if (event.target.name === 'ageMode') {
                const form = event.target.closest('form'); form.querySelectorAll('[data-age]').forEach(div => { div.hidden = div.dataset.age !== event.target.value; });
                const prefix=form.id==='single-form'?'single':'batch';this.readForms();const draft=prefix==='single'?this.state.draft:this.state.batchDraft;
                if(draft.growthProfile==='intergrowth'){this.state[prefix==='single'?'draft':'batchDraft']=WorkspaceApp.draftForAgeMode(draft,draft.ageMode);this.render(prefix+'-ageMode');}
                this.scheduleSave();
            } else if (event.target.name === 'growthProfile') {
                this.readForms();const form=event.target.closest('form'),prefix=form.id==='single-form'?'single':'batch';
                const key=prefix==='single'?'draft':'batchDraft';
                this.state[key]=WorkspaceApp.draftForProfile(this.state[key],event.target.value);
                this.renderEntryProfile(prefix,prefix+'-growthProfile-picker');this.scheduleSave();
            } else if (event.target.name === 'careProtocol') {
                this.readForms();const prefix=event.target.closest('form').id==='single-form'?'single':'batch';
                this.renderEntryProfile(prefix,prefix+'-careProtocol-picker');this.scheduleSave();
            } else if (event.target.id === 'backup-file') {
                const file = event.target.files[0]; if (file) await this.previewImport(file); event.target.value = '';
            } else if (event.target.id === 'csv-file') {
                const file = event.target.files[0]; if (file) await this.readCSVFile(file); event.target.value = '';
            }
        });
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-action]'); if (!button) return;
            event.preventDefault(); this.action(button.dataset.action,button).catch(error => this.toast(error.message,true));
        });
    }
    workspaceDialogKey(event) {
        const dialog=document.getElementById('workspace-dialog');
        if(event.key!=='Tab'||event.defaultPrevented||!dialog.open)return;
        const controls=[...dialog.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')].filter(e=>e.tabIndex>=0&&!e.disabled&&e.getClientRects().length&&!e.closest('[inert]'));
        if(!controls.length){event.preventDefault();return;}
        const first=controls[0],last=controls.at(-1),active=document.activeElement;
        if(event.shiftKey&&active===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
    }
    workspaceDialogClosed() {
        // Native close events are queued: a dialog may already have been reopened.
        if(document.getElementById('workspace-dialog').open)return;
        this.batchCorrection=null;
        document.querySelectorAll('#workspace-dialog input[type="password"]').forEach(input=>{input.value='';});
        this.encryptedPending=null;this.previewRequest=(this.previewRequest||0)+1;this.importRequest=(this.importRequest||0)+1;
        this.previewedVersion=null;this.stagePreviewSession=null;
        if(this.preparedImport?.format==='stream'){this.transfers().release(this.preparedImport);this.preparedImport=null;}
    }
    changeMeasureUnit(select) {
        const form=select.closest('form');if(!form)return;
        const draft=form.id==='correction-form'?this.batchCorrection?.draft:this.state[form.id==='single-form'?'draft':'batchDraft'];
        if(!draft)return;const key=select.name==='weightUnit'?'weight':'height',old=draft[select.name]||(key==='weight'?'g':'cm'),next=select.value;
        const input=form.querySelector('[name="'+key+'"]');if(!input)return false;
        const allowed=key==='weight'?['g','kg']:['cm','m'];
        if(!allowed.includes(old)||!allowed.includes(next))return false;
        if(old===next||!input.value.trim())return true;
        try{
            const places=u=>u==='kg'?3:u==='m'?2:0,amount=ClinicalEngine.decimal(input.value,'measureUnitInvalid');
            const converted=ClinicalEngine.shiftDecimal(amount,places(old)-places(next));
            if(!Number.isFinite(converted)||ClinicalEngine.shiftDecimal(amount,places(old))!==ClinicalEngine.shiftDecimal(converted,places(next)))return false;
            input.value=String(converted);
            return true;
        }catch(_){return false;/* Keep invalid text for explicit validation. */}
    }
    readForms() {
        for (const prefix of ['single','batch']) {
            const form = document.getElementById(prefix+'-form'); if (!form || form.closest?.('[hidden]')) continue;
            const key = prefix === 'single' ? 'draft' : 'batchDraft';
            this.state[key] = {...this.state[key],...Object.fromEntries(new FormData(form))};
            if(this.state[key].growthProfile==='intergrowth'&&this.state[key].ageMode!=='pma')this.state[key].postmenstrualDays='';
        }
        const paste = document.getElementById('paste-data'); if (paste && !this.csvBusy && !this.csvReading) this.state.paste = paste.value;
        this.state.mode = this.page === 'batch' ? 'batch' : this.page === 'single' ? 'single' : this.state.mode;
    }
    updateDraftStaleness(){
        const baseline=this.singleEditBaseline;
        this.state.stale=baseline?.entry!==this.state.single||baseline.signature!==DraftHistoryUI.signature({draft:this.state.draft});
        const target=document.getElementById('single-results'),existing=target?.querySelector('[data-stale-notice]');
        if(!this.state.stale){existing?.remove();return;}
        if(target&&!existing){
            const notice=document.createElement('p');notice.className='notice warn';notice.setAttribute('role','status');notice.setAttribute('data-stale-notice','');notice.textContent=this.t('stale');
            target.querySelector('.dashboard-toolbar')?.after(notice);
        }
    }
    checkpoint(captureForm = true) {
        if (captureForm) this.readForms();
        try { this.history.checkpoint(this.state); return true; } catch (error) { this.saveState = 'unsaved'; this.updateSaveStatus(); return false; }
    }
    persistDraft(){
        if(!this.checkpoint())return this.queueSave();
        this.saveState=HistoryManager.hasWork(this.state)?'saved':'ready';
        this.updateSaveStatus();
    }
    scheduleSave() {
        this.saveRevision=(this.saveRevision||0)+1;
        clearTimeout(this.saveTimer);
        if(this.checkpoint()){this.saveState=HistoryManager.hasWork(this.state)?'saved':'ready';this.updateSaveStatus();}
        else this.saveTimer=setTimeout(()=>this.persistDraft(),800);
    }
    static retainCalculation(previous,calculated){
        if(!previous?.result||previous.result.imported||previous.child.visitId!==calculated.child.visitId)return calculated;
        const comparable=entry=>{
            const {id,createdAt,...draft}=entry.child;
            const {id:resultId,childId,calculatedAt,...result}=entry.result;
            return DraftHistoryUI.signature({draft,result});
        };
        return comparable(previous)===comparable(calculated)?previous:calculated;
    }
    queueSave(reason='automatic',force=false) {
        const source=this.state,revision=this.saveRevision||0,request=this.saveRequest=(this.saveRequest||0)+1;
        const workspace = HistoryManager.clone(this.state);
        const current=()=>this.state===source&&this.saveRequest===request&&(this.saveRevision||0)===revision;
        this.saveState='saving';this.updateSaveStatus();
        this.saving = this.saving.catch(()=>{}).then(async()=>{
            try { const snapshot=await this.history.save(workspace,reason,force); if(current()){this.saveState=HistoryManager.hasWork(workspace)?'saved':'ready';this.updateSaveStatus();} return snapshot; }
            catch (error) { if(current()){this.saveState='unsaved';this.updateSaveStatus();}throw error; }
        });
        // The caller can await a durable save; background failures are visible and handled.
        this.saving.catch(error=>console.warn('Local save failed',error));
        return this.saving;
    }
    async saveImmediate(reason='automatic',force=false) { clearTimeout(this.saveTimer); this.checkpoint(false); return this.queueSave(reason,force); }
    updateSaveStatus() { document.querySelectorAll('[data-save-state]').forEach(el=>{ el.textContent=this.t(this.saveState==='saved'?'savedShort':this.saveState);el.title=this.t(this.saveState);el.setAttribute('aria-label',this.t(this.saveState)); el.classList.toggle('error',this.saveState==='unsaved'); }); }
    formError(prefix,key) { const el=document.getElementById(prefix+'-error'); if(el){ el.textContent=this.t(key)===key?this.t('error'):this.t(key); el.hidden=false; el.focus({preventScroll:true}); el.scrollIntoView({block:'nearest'}); } else this.toast(key,true); }
    syncImportNotice() {
        const result=this.page==='single'?this.state.single?.result:null;
        if(!result?.imported){clearTimeout(this.importNoticeTimer);this.importNoticeResult=null;this.importNoticeOpen=false;}
        else if(this.importNoticeResult!==result){
            clearTimeout(this.importNoticeTimer);this.importNoticeResult=result;this.importNoticeOpen=true;
            this.importNoticeTimer=setTimeout(()=>this.dismissImportNotice(),7000);
        }
        this.updateImportNotice();
    }
    updateImportNotice() {
        const notice=document.getElementById('import-toast');if(!notice)return;
        notice.hidden=!this.importNoticeOpen;
        notice.querySelector('[data-import-notice-text]').textContent=this.t('importedResult');
        notice.querySelector('button').title=this.t('close');
    }
    dismissImportNotice() {
        clearTimeout(this.importNoticeTimer);this.importNoticeOpen=false;
        const notice=document.getElementById('import-toast');
        if(notice?.contains(document.activeElement))document.getElementById('results-title')?.focus({preventScroll:true});
        this.updateImportNotice();
    }
    updateToast(){const el=document.getElementById('toast');if(el){el.textContent=this.toastKey?(this.t(this.toastKey)===this.toastKey?this.t('error'):this.t(this.toastKey)):'';el.setAttribute('role',this.toastIsError?'alert':'status');}}
    toast(key,error=false) { this.toastKey=key;this.toastIsError=error;this.updateToast();clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toastKey=null;this.updateToast();},6500); }
    async action(action,button) {
        if(action==='dismiss-update-notice'){this.dismissUpdateNotice();return;}
        if(this.batchDeleting||this.batchInlineEdit?.busy)return;
        if(action==='batch-inline-open'){this.openBatchInline(Number(button.dataset.index),button.dataset.field);return;}
        if(action==='batch-inline-save'){await this.saveBatchInline();return;}
        if(action==='batch-inline-cancel'){this.cancelBatchInline();return;}
        if(this.batchInlineEdit&&this.batchInlineEdit.workspace===this.state&&this.batchInlineEdit.entry===this.state.batch[this.batchInlineEdit.index]){this.toast('batchInlineFinish',true);return;}
        if(action==='batch-kpi-filter'){if(!button.disabled)this.setBatchKpiFilter(button.dataset.value);return;}
        this.readForms();
        if(action==='batch-delete-row'||action==='batch-delete-selected'){await this.deleteBatchRows(action==='batch-delete-row'?[Number(button.dataset.index)]:[...this.batchSelectionSet()]);return;}
        button.closest?.('.mobile-actions-dialog')?.close();
        if(action==='workspace-view')this.selectWorkspaceView(button.dataset.scope,button.dataset.view);
        else if(action==='dismiss-import-notice')this.dismissImportNotice();
        else if(action==='toggle-sidebar'){this.prefs.navCollapsed=!this.prefs.navCollapsed;this.persistPreferences();this.applyPreferences();this.render('sidebar-button');}
        else if(action==='open-select')this.openChoice(button.id,'field',button.dataset.select);
        else if(action==='choice-value')this.chooseValue(button.dataset.value);
        else if(action==='clear-unsupported-skinfolds'){
            const prefix=button.dataset.prefix;
            if(!['single','batch'].includes(prefix))return;
            const key=prefix==='single'?'draft':'batchDraft';
            if(this.state[key]?.growthProfile!=='intergrowth')return;
            for(const field of ['tricepsSkinfold','subscapularSkinfold'])this.state[key][field]='';
            this.render(prefix+'-growthProfile-picker');this.scheduleSave();
        }
        else if(action==='show-info')this.showInfo(button.dataset.info,button.id);
        else if(action==='close-info')this.closeInfo(true);
        else if(action==='toggle-csv'){
            const open=button.getAttribute('aria-expanded')!=='true';
            button.setAttribute('aria-expanded',String(open));
            for(const id of ['csv-tools-body','csv-heading-actions'])document.getElementById(id).hidden=!open;
        }
        else if(action==='batch-page'){const page=Number(button.dataset.page);if(Number.isInteger(page)){this.batchPage=page;this.render('batch-results-title');}}
        else if(action==='mobile-actions')this.openMobileActions();
        else if(action==='header-panel')this.openHeaderPanel(button.dataset.kind);
        else if(action==='close-header')document.getElementById('header-dialog').close();
        else if(action==='set-preference')this.setPreference(button.dataset.kind,button.dataset.value);
        else if(action==='header-page'){
            if(!['single','batch','history','references','settings'].includes(button.dataset.value))return;
            const d=document.getElementById('header-dialog');d.dataset.opener='';d.close();
            this.page=button.dataset.value;if(this.page==='history'){this.historyPane='backup';this.sessions=await this.history.catalog();}this.render('main');
        }
        else if(action==='apply-update')await this.applyUpdate();
        else if(action==='install-app')await this.installApp();
        else if(action==='check-update')await this.checkUpdate();
        else if(action==='capacity-refresh')await this.refreshCapacity();
        else if(action==='stage-refresh')await this.refreshStages();
        else if(action==='stage-previous'||action==='stage-next'){this.stagePage=(this.stagePage||0)+(action==='stage-next'?1:-1);await this.refreshStages();}
        else if(action==='stage-local-copy')await this.createLocalCopy();
        else if(action==='stage-review')await this.reviewStage(button.dataset.name);
        else if(action==='stage-preview-session')await this.previewStageVersion(Number(button.dataset.seq));
        else if(action==='stage-detail-previous'||action==='stage-detail-next'){this.stagePreviewPage+=(action==='stage-detail-next'?1:-1);this.renderStagePreview();this.focusPagination('stage-detail-page');}
        else if(action==='stage-detail-page'){const page=Number(button.dataset.page);if(Number.isInteger(page)&&page>=0){this.stagePreviewPage=page;this.renderStagePreview();this.focusPagination('stage-detail-page');}}
        else if(action==='stage-back'&&this.preparedImport)this.showImportPreview(this.preparedImport,this.importOverview.name,this.importOverview.duplicate);
        else if(action==='page'){ this.page=button.dataset.page; if(this.page==='history'){this.historyPane=button.dataset.historyPane==='versions'?'versions':'backup';this.sessions=await this.history.catalog();} this.render(); document.getElementById('main').focus({preventScroll:true}); }
        else if(action==='edit-measures'||action==='show-results'){
            this.singleEditing=action==='edit-measures';
            if(this.singleEditing&&!this.state.stale&&this.state.single)this.singleEditBaseline={entry:this.state.single,signature:DraftHistoryUI.signature({draft:this.state.draft})};
            this.render(this.singleEditing?'single-caseId':'results-title');
        }
        else if(action==='save'){ const hasWork=HistoryManager.hasWork(this.state),snapshot=await this.saveImmediate('manual',true); this.toast(!hasWork?'manualEmpty':snapshot?'manualSaved':'manualUnchanged'); if(this.page==='history'){this.sessions=await this.history.catalog();this.renderHistoryList();await this.refreshCapacity();} }
        else if(action==='new'){ await this.saveImmediate('beforeNew'); this.state=this.emptyWorkspace();this.singleEditing=false;this.singleView='summary';this.batchPane='entry';this.batchSearch='';this.batchFilter='all';this.state.mode=this.page==='batch'?'batch':'single';this.batchPage=0; this.saveState='ready'; this.render(this.page==='batch'?'batch-caseId':'single-caseId'); }
        else if(action==='new-visit'){
            const child = this.state.single?.child;if(!child?.caseId)return;
            await this.saveImmediate('beforeNew');this.state=this.emptyWorkspace();this.singleEditing=false;this.singleView='summary';
            Object.assign(this.state.draft,{caseId:child.caseId,name:child.name,gender:child.gender,birthDate:child.birthDate || '',ageMode:child.birthDate?'dates':child.ageMode || 'months',growthProfile:child.growthProfile||'who',careProtocol:child.careProtocol||''});
            if(child.growthProfile==='intergrowth')Object.assign(this.state.draft,{gestationalAgeWeeks:child.gestationalAgeWeeks,gestationalAgeDays:child.gestationalAgeDays,postmenstrualDays:'',ageDays:''});
            this.page='single';await this.saveImmediate('automatic');this.render('single-caseId');
        }
        else if(action==='view-case'){this.historyFilter='all';this.search=button.dataset.caseId;this.historyPage=0;this.sessions=await this.history.catalog();this.page='history';this.historyPane='versions';this.render('history-search');}
        else if(action==='calculate-batch'){
            if(this.batchComputing||this.csvBusy||this.csvReading)return;
            button.disabled=true;const workspace=this.state,entries=[];this.batchComputing=true;
            try { for(let i=0;i<workspace.batch.length;i++){if(this.state!==workspace||this.page!=='batch')return;const entry=workspace.batch[i];entries.push(WorkspaceApp.retainCalculation(entry,this.engine.calculate(entry.child)));if(i%100===99)await new Promise(resolve=>setTimeout(resolve,0));}if(this.state!==workspace||this.page!=='batch')return;workspace.batch=entries;this.batchPane='results';await this.saveImmediate('calculated');this.render('batch-results-title'); }
            finally {this.batchComputing=false;button.disabled=false;}
        }
        else if(action==='parse-csv') await this.addCSV(this.state.paste);
        else if(action==='csv-confirm'){
            const pending=this.pendingCSV;if(!pending||pending.workspace!==this.state||pending.epoch!==this.renderEpoch||this.page!=='batch'){this.pendingCSV=null;this.toast('csvCancelled');return;}
            const mapping={};for(const field of CSVManager.fields){const value=document.getElementById('csv-map-'+field)?.value;if(value)mapping[field]=value;}
            const options={mapping};for(const key of ['weightUnit','heightUnit','muacUnit','dateFormat','oedemaCodes'])options[key]=document.getElementById('csv-'+key).value;
            try{CSVManager.options(pending.text,options);}catch(_){this.toast('csvMappingInvalid',true);return;}await this.addCSV(pending.text,options);
        }
        else if(action==='csv-template'&&this.state.batchDraft.growthProfile==='intergrowth')this.download('name,caseId,growthProfile,ageMode,postmenstrualDays,weight,height,headCircumference,gender,position,oedema\r\nExemple fictif,PRETERM-001,intergrowth,pma,224,1600,42,29,M,L,n\r\n','zscore-intergrowth-modele.csv','text/csv');
        else if(action==='csv-template')this.download('name,caseId,ageYears,ageMonths,weight,height,gender,position,oedema,muac\r\nExemple fictif,TEST-001,1,0,8500,75,M,L,n,130\r\n','zscore-modele.csv','text/csv');
        else if(action==='quality-filter'){
            if(!QualityUI.codes.includes(button.dataset.value))return;
            this.qualityFilter=this.qualityFilter===button.dataset.value?'':button.dataset.value;this.qualityPage=0;this.renderQuality();
            document.querySelector?.('[data-action="quality-filter"][data-value="'+button.dataset.value+'"]')?.focus({preventScroll:true});
        }
        else if(action==='quality-page'||action==='quality-previous'||action==='quality-next'){
            const page=action==='quality-page'?Number(button.dataset.page):(this.qualityPage||0)+(action==='quality-next'?1:-1);
            if(Number.isInteger(page)&&page>=0){this.qualityPage=page;this.renderQuality();}
        }
        else if(action==='batch-correct')this.openBatchCorrection(Number(button.dataset.index));
        else if(action==='save-batch-correction')await this.saveBatchCorrection();
        else if(action==='quality-view'){
            const index=Number(button.dataset.index),entry=this.state.batch[index];
            if(Number.isInteger(index)&&index>=0&&entry)this.dialog('qualityRecord',`<p>${this.t('qualityRecord')} ${this.number(index+1,0)} · ${this.t('qualityReadOnly')}</p>${entry.result?this.resultsHTML(entry,false,true):this.previewDraft({...entry.child,ageTotalMonths:entry.child.ageTotalMonths??entry.child.totalAgeMonths,weightUnit:'g',heightUnit:'cm'},'batch','measurementSummary')+`<p class="notice">${this.t('pdfUncalculated')}</p>`}`,`<button class="btn" data-action="batch-correct" data-index="${index}">${this.icon('edit')}${this.t('batchCorrectionEdit')}</button>`);
        }
        else if(action==='quality-csv'||action==='analysis-csv')this.downloadQuality(action==='analysis-csv');
        else if(action==='reporting')this.reportingDialog();
        else if(action==='download-report')this.downloadReport(false);
        else if(action==='download-dhis2')this.downloadReport(true);
        else if(action==='export-summary'){const models=this.lotModels(),model=models.find(m=>m.family===(button.dataset.family||'WHO2006'))||models[0];if(model)this.download(CSVManager.summary(model),'zscore-resume-lot-'+model.family+'-'+DateUI.exportFileStamp(new Date(),this.prefs?.timeZone)+'.csv','text/csv');}
        else if(action==='csv-results'){ const entries=this.page==='batch'?this.state.batch:this.state.single?[this.state.single]:[]; this.download(CSVManager.results(entries),'zscore-resultats-'+DateUI.exportFileStamp(new Date(),this.prefs?.timeZone)+'.csv','text/csv'); }
        else if(action==='print'){
            if(this.page==='single')await this.individualReportDialog(true);
            else if(this.page==='batch'&&this.state.batch.length&&!this.pdfBusy){
                const printWindow=window.open('about:blank','_blank');
                if(!printWindow){this.toast('pdfPrintPopup',true);return;}
                printWindow.opener=null;printWindow.document.body.textContent=this.t('pdfPreparing');
                await this.exportPDF('detailed',{printWindow});
            }else if(this.page!=='batch')window.print();
        }
        else if(action==='export-pdf'){if(this.page==='single')await this.individualReportDialog(false);else await this.exportPDF(button.dataset.layout);}
        else if(action==='individual-report-confirm')await this.confirmIndividualReport();
        else if(action==='password-export')this.passwordDialog();
        else if(action==='confirm-encrypted-export')await this.passwordOperation(false,button);
        else if(action==='unlock-backup')await this.passwordOperation(true,button);
        else if(action==='export-backup')await this.exportBackup();
        else if(action==='history-kpi'){
            if(!['all','single','batch','imported','draft','pending','complete','mixed'].includes(button.dataset.value))return;
            this.historyFilter=(this.historyFilter||'all')===button.dataset.value?'all':button.dataset.value;this.historyPage=0;this.renderHistoryList();
            document.querySelector?.('[data-action="history-kpi"][data-value="'+button.dataset.value+'"]')?.focus({preventScroll:true});
        }
        else if(action==='history-previous'||action==='history-next'){this.historyPage+=action==='history-next'?1:-1;this.renderHistoryList();this.focusPagination('history-page');}
        else if(action==='history-page'){const page=Number(button.dataset.page);if(Number.isInteger(page)&&page>=0){this.historyPage=page;this.renderHistoryList();this.focusPagination('history-page');}}
        else if(action==='preview')await this.previewSession(this.sessions.find(s=>s.id===button.dataset.id));
        else if(action==='preview-page'){
            const page=Number(button.dataset.page);
            if(this.previewedVersion&&Number.isInteger(page)&&page>=0){this.previewPage=page;this.renderVersionPreview(true);}
        }
        else if(action==='close-dialog'){if(this.batchCorrection?.busy)return;document.querySelectorAll('#workspace-dialog input[type="password"]').forEach(input=>{input.value='';});this.encryptedPending=null;document.getElementById('workspace-dialog').close();}
        else if(action==='restore'){const selected=this.previewedVersion||this.sessions.find(s=>s.id===button.dataset.id);if(selected?.id===button.dataset.id&&selected.metadata?.workspace)await this.restore(selected);else this.toast('historyReadFailed',true);}
        else if(action==='commit-import'){
            if(!this.preparedImport)return;button.disabled=true;
            try{await this.transfers().commit(this.preparedImport);this.preparedImport=null;document.getElementById('workspace-dialog').close();this.sessions=await this.history.catalog();this.page='history';this.historyPane='versions';this.render('main');this.toast('importDone');}
            finally{button.disabled=false;}
        }
    }
    download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type:type==='application/pdf'?type:type+';charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    reportingDialog() {
        this.reportingEntries=HistoryManager.clone(this.state.batch);
        const period=(this.state.batch.find(e=>e.child.measurementDate)?.child.measurementDate||ClinicalEngine.today()).slice(0,7);
        this.dialog('reportTitle',`<p>${this.t('reportHelp')}</p><div class="field"><label for="report-period">${this.t('reportPeriod')}</label><input id="report-period" type="month" value="${this.esc(period)}"></div><details><summary>${this.t('reportMapping')}</summary><p>${this.t('reportMappingHelp')}</p><div class="field"><label for="report-profile">${this.t('reportMapping')}</label><textarea id="report-profile" rows="6" maxlength="20000" spellcheck="false" dir="ltr"></textarea></div></details>`,`<button class="btn" data-action="download-report">${this.t('reportGeneric')}</button><button class="btn" data-action="download-dhis2">${this.t('reportDhis2')}</button>`);
    }
    downloadReport(dhis2) {
        const period=document.getElementById('report-period').value.replace('-','');
        const report=ReportingUI.aggregate(this.reportingEntries,period);
        let output=report;
        if(dhis2){let profile;try{profile=JSON.parse(document.getElementById('report-profile').value);}catch(_){throw new Error('reportMappingInvalid');}output=ReportingUI.dhis2(report,profile);}
        this.download(JSON.stringify(output,null,2),'zscore-'+(dhis2?'dhis2-':'aggregate-')+period+'-'+DateUI.exportFileStamp(new Date(),this.prefs?.timeZone)+'.json','application/json');
        this.toast('reportExported');
    }
    passwordDialog(file=null) {
        if(this.transferBusy||this.cryptoBusy){this.toast('transferPreparing');return;}
        this.encryptedPending=file;
        this.dialog(file?'unlockBackup':'exportEncrypted',`<p>${this.t('encryptedHelp')}</p><div class="field"><label for="backup-password">${this.t('backupPassword')}</label><input id="backup-password" type="password" minlength="12" maxlength="1024" autocomplete="${file?'current-password':'new-password'}"></div>${file?'':`<div class="field"><label for="backup-password-confirm">${this.t('backupPasswordConfirm')}</label><input id="backup-password-confirm" type="password" minlength="12" maxlength="1024" autocomplete="new-password"></div>`}`,`<button class="btn primary" data-action="${file?'unlock-backup':'confirm-encrypted-export'}">${this.t(file?'unlockBackup':'exportEncrypted')}</button>`);
        document.getElementById('backup-password').focus();
    }
    async passwordOperation(unlock,button) {
        if(this.cryptoBusy||this.transferBusy)return;
        const input=document.getElementById('backup-password'),confirm=document.getElementById('backup-password-confirm');
        let password=input.value;
        if(password.length<12||new TextEncoder().encode(password).length>1024){this.toast('backupPasswordInvalid',true);input.focus();return;}
        if(!unlock&&password!==confirm.value){this.toast('backupPasswordMismatch',true);confirm.focus();return;}
        const file=this.encryptedPending,epoch=this.renderEpoch;this.cryptoBusy=true;
        input.value='';if(confirm)confirm.value='';this.encryptedPending=null;button.disabled=true;
        document.getElementById('workspace-dialog').close();
        try{
            if(unlock){
                const blob=await SecureBackup.decrypt(file,password);
                if(epoch!==this.renderEpoch)return;
                await this.previewImport(new File([blob],(file.name||'backup.zscore.enc').replace(/\.enc$/i,''),{type:'application/x-ndjson'}),{decrypted:true});
            }else await this.exportBackup(password);
        }catch(error){this.toast(error.message,true);}
        finally{password='';this.cryptoBusy=false;button.disabled=false;}
    }
    async exportBackup(password=null){
        if(this.transferBusy)return;this.transferBusy=true;this.transferStatus(true);this.toast('transferPreparing');
        document.querySelectorAll('[data-action="export-backup"],[data-action="password-export"]').forEach(b=>{b.disabled=true;});
        try{
            this.readForms();
            const snapshot=HistoryManager.hasWork(this.state)?this.history.makeSnapshot(this.state,'beforeExport'):null;
            let unsaved=null;
            try{await this.saveImmediate('beforeExport');}
            catch(error){if(!snapshot)throw error;unsaved=snapshot;}
            let content=await this.transfers().export(this.prefs,n=>this.transferStatus(n),unsaved);
            if(password!==null)content=await SecureBackup.encrypt(content,password);
            this.download(content,'zscore-sauvegarde-'+DateUI.exportFileStamp(new Date(),this.prefs?.timeZone)+(password!==null?'.zscore.enc':'.zscore'),password!==null?'application/octet-stream':'application/x-ndjson');this.toast(unsaved?'exportUnsaved':password!==null?'encryptedReady':'exportSensitive',!!unsaved);
            if(this.page==='history'){this.sessions=await this.history.catalog();this.renderHistoryList();await this.refreshCapacity();}
        }finally{this.transferBusy=false;this.transferStatus();document.querySelectorAll('[data-action="export-backup"],[data-action="password-export"]').forEach(b=>{b.disabled=false;});}
    }
    async individualReportDialog(print){
        const entry=this.state.single;
        if(!entry?.result||this.pdfBusy)return;
        const refresh=async()=>{
            const child=entry.child;
            const history=child.caseId?await this.history.caseVisits(child.caseId,child.gender,child.birthDate):{entries:[]};
            if(this.state.single!==entry||this.page!=='single')return;
            // Use the visible result for its visit, even before an autosave completes.
            const visitKey=HistoryManager.visitKey(entry);
            const birthDates=new Set([child.birthDate,...history.entries.map(visit=>visit.child.birthDate)].filter(Boolean));
            const identityConflict=history.identityConflict||birthDates.size>1;
            const saved=identityConflict?[]:history.entries.filter(visit=>HistoryManager.visitKey(visit)!==visitKey);
            const visits=[...saved,entry];
            const engines=[...this.chartEngines(visits),this.engine.additional].filter(Boolean);
            const context={entry,visits,engines,print};
            this.individualReport=context;
            this.dialog('pdfReportOptions',`${identityConflict?`<p class="notice warn">${this.t('followupIdentityWarning')}</p>`:''}
                <div class="report-period">
                    <label>${this.t('pdfPeriodFrom')} <input type="date" id="report-from"></label>
                    <label>${this.t('pdfPeriodTo')} <input type="date" id="report-to"></label>
                </div>
                <fieldset class="report-choices"><legend>${this.t('pdfContent')}</legend><div id="report-sections"></div></fieldset>
                <p id="report-status" role="status"></p>`,`<button class="btn primary" data-action="individual-report-confirm">${this.t(print?'print':'exportPDF')}</button>`);
            const dialog=document.getElementById('workspace-dialog');
            const update=()=>{
                const from=dialog.querySelector('#report-from').value,to=dialog.querySelector('#report-to').value;
                const previous=dialog.querySelector('#report-sections');
                const choices=new Map([...previous.querySelectorAll('input')].map(input=>[input.value,input.checked]));
                const invalid=from&&to&&from>to;
                context.charts=PDFManager.reportCharts(invalid?[]:visits.filter(e=>(!from||e.child.measurementDate>=from)&&(!to||e.child.measurementDate<=to)),engines);
                previous.innerHTML=PDFManager.reportSections.map((key,index)=>{
                    const available=!index||context.charts.sections[key].length;
                    const hint=available?'':this.t(index===2||index===4?'pdfTrendUnavailable':'pdfGrowthUnavailable');
                    return `<div><label><input type="checkbox" value="${key}" ${available?'':`disabled aria-describedby="report-hint-${index}"`} ${available&&(choices.get(key)??!index)?'checked':''}> ${this.t(key)}</label>${hint?` <small id="report-hint-${index}">${hint}</small>`:''}</div>`;
                }).join('');
                dialog.querySelector('#report-status').textContent=invalid?this.t('pdfPeriodInvalid'):'';
                dialog.querySelector('[data-action="individual-report-confirm"]').disabled=!!invalid;
            };
            dialog.querySelectorAll('input[type="date"]').forEach(input=>input.addEventListener('change',update));
            update();
        };
        try{await refresh();}catch(_){this.toast('pdfUnavailable',true);}
    }
    async confirmIndividualReport(){
        const report=this.individualReport;
        if(!report||this.state.single!==report.entry||this.page!=='single'||this.pdfBusy)return;
        const sections=[...document.querySelectorAll('#report-sections input:checked:not(:disabled)')].map(input=>input.value);
        const status=document.getElementById('report-status');
        if(!sections.length){status.textContent=this.t('pdfSelectSection');return;}
        const printWindow=report.print?window.open('about:blank','_blank'):null;
        if(report.print&&!printWindow){status.textContent=this.t('pdfPrintPopup');return;}
        if(printWindow){printWindow.opener=null;printWindow.document.body.textContent=this.t('pdfPreparing');}
        document.getElementById('workspace-dialog').close();
        await this.exportPDF('detailed',{sections,charts:report.charts,printWindow});
    }
    async exportPDF(layout='detailed',report={}){
        if(this.pdfBusy)return;
        const mode=this.page==='batch'?'batch':'single',entries=HistoryManager.clone(mode==='batch'?this.state.batch:this.state.single?[this.state.single]:[]);
        const options={mode,layout,language:this.prefs.language,translations:this.translations,dateFormat:this.prefs.dateFormat,timeZone:this.prefs.timeZone,stale:mode==='single'&&this.state.stale,
            sections:report.sections,charts:report.charts,print:!!report.printWindow};
        if(!entries.length)throw new Error('pdfInvalid');
        this.pdfBusy=true;this.toast('pdfPreparing');
        document.querySelectorAll('[data-action="export-pdf"]').forEach(button=>{button.disabled=true;});
        try{
            const fonts=this.pdfFonts||await PDFManager.loadFonts();this.pdfFonts=fonts;
            const now=new Date();
            const result=PDFManager.build(entries,options,{jsPDF:window.jspdf?.jsPDF,autoTable:window.autoTable,fonts,now});
            if(report.printWindow){
                const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
                report.printWindow.location.replace(url);
                setTimeout(()=>URL.revokeObjectURL(url),60000);
            }else this.download(result.bytes,'zscore-'+mode+(mode==='batch'&&layout==='compact'?'-compact':'')+'-'+options.language+'-'+DateUI.exportFileStamp(now,this.prefs?.timeZone)+'.pdf','application/pdf');
            this.toast('pdfReady');
        }catch(error){report.printWindow?.close();this.toast(error.message==='pdfInvalid'?'pdfInvalid':'pdfUnavailable',true);}
        finally{this.pdfBusy=false;document.querySelectorAll('[data-action="export-pdf"]').forEach(button=>{button.disabled=this.page==='batch'&&!this.state.batch.length;});}
    }
    updateCSVControls(){
        for(const id of ['csv-file','paste-data','csv-parse-button']){
            const control=document.getElementById(id);if(control)control.disabled=!!(this.csvBusy||this.csvReading);
        }
    }
    csvMappingDialog(text,info){
        this.pendingCSV={text,workspace:this.state,epoch:this.renderEpoch};
        const select=(id,label,values,selected)=>`<div class="field"><label for="${id}">${this.esc(label)}</label><select id="${id}">${values.map(([v,label])=>`<option value="${this.esc(v)}"${v===selected?' selected':''}>${this.esc(label)}</option>`).join('')}</select></div>`;
        const mappedFields=list=>list.map(field=>select('csv-map-'+field,this.t(field),[['',this.t('csvIgnore')],...info.headers.map(h=>[h,h])],info.mapping[field]||'')).join('');
        const fields=mappedFields(CSVManager.fields.filter(field=>!NutritionUI.inputFields.includes(field)||field==='muac'));
        const clinical=NutritionUI.inputFields.filter(field=>field!=='muac');
        const unit=(key,label,values,selected)=>select('csv-'+key,this.t(label),values,selected);
        const sample=`<div class="table-scroll"><table><caption>${this.t('csvSample')}</caption><thead><tr>${info.headers.map(h=>`<th scope="col">${this.esc(h)}</th>`).join('')}</tr></thead><tbody>${info.sample.map(row=>`<tr>${row.map(v=>`<td>${this.esc(v.length>200?v.slice(0,200)+'…':v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        const units=unit('weightUnit','csvWeightUnit',[['',this.t('csvChooseUnit')],['g','g'],['kg','kg']],info.weightUnit)+unit('heightUnit','csvHeightUnit',[['cm','cm'],['m','m'],['mm','mm']],'cm')+unit('muacUnit','csvMuacUnit',[['mm','mm'],['cm','cm']],info.muacUnit)+unit('dateFormat','csvDateFormat',[['iso','YYYY-MM-DD'],['dmy','DD/MM/YYYY'],['mdy','MM/DD/YYYY']],'iso')+unit('oedemaCodes','oedema',[['text',this.t('csvOedemaText')],['who12','1 = '+this.t('yes')+' ; 2 = '+this.t('no')],['zeroone','0 = '+this.t('no')+' ; 1 = '+this.t('yes')]],'text');
        this.dialog('csvMapping',`<p>${this.t('csvMappingHelp')}</p><p>${this.t('growthProfile')} : ${this.t(this.state.batchDraft.growthProfile==='intergrowth'?'profileINTERGROWTH':this.state.batchDraft.growthProfile==='us'?'profileUS':'profileWHO')}</p>${sample}<div class="form-grid">${units}${fields}</div><details${clinical.some(field=>info.mapping[field])?' open':''}><summary>${this.t('clinicalSection')}</summary><div class="form-grid">${mappedFields(clinical)}</div></details><p id="csv-dialog-status" role="alert"></p>`,`<button class="btn primary" data-action="csv-confirm">${this.t('parseCSV')}</button>`);
        document.getElementById('workspace-dialog').classList.add('csv-mapping-dialog');
    }
    async readCSVFile(file){
        if(this.csvBusy||this.csvReading||this.batchComputing)return;
        if(file.size>CSVManager.maxBytes){this.toast('csvTooLarge',true);return;}
        const workspace=this.state,epoch=this.renderEpoch;
        this.csvReading=true;this.updateCSVControls();let text;
        try{text=await file.text();}
        catch(error){if(this.state===workspace&&this.page==='batch')this.toast('csvReadFailed',true);return;}
        finally{this.csvReading=false;this.updateCSVControls();}
        if(this.state!==workspace||this.page!=='batch'||this.renderEpoch!==epoch){this.toast('csvCancelled');return;}
        await this.addCSV(text);
    }
    async addCSV(text,options=null){
        if(this.csvBusy||this.csvReading||this.batchComputing)return;
        this.readForms();
        const workspace=this.state,epoch=this.renderEpoch;
        const current=()=>this.state===workspace&&this.renderEpoch===epoch&&this.page==='batch';
        try{const info=CSVManager.inspect(text);if(!options&&info.needsMapping){this.csvMappingDialog(text,info);return;}}
        catch(error){this.toast(error.message==='csvTooLarge'?'csvTooLarge':'csvInvalid',true);return;}
        this.csvBusy=true;this.updateCSVControls();
        let children;
        try{
            const growthProfile=this.state.batchDraft.growthProfile||'who';
            children=!options&&text.length<100000?CSVManager.parse(text,{extended:!!this.engine?.older,growthProfile}):await CSVManager.parseAsync(text,{...options,extended:!!this.engine?.older,growthProfile,cancelled:()=>!current(),progress:count=>{const target=document.getElementById('csv-progress');if(target)target.textContent=this.t('csvChecking')+' '+this.number(count,0);}});
        }catch(error){this.csvBusy=false;this.updateCSVControls();if(current()){this.toast(['csvTooLarge','csvRowsLimit','csvMappingInvalid','csvCancelled'].includes(error.message)?error.message:'csvInvalid',true);const target=globalThis.document?.getElementById('csv-dialog-status')||globalThis.document?.getElementById('csv-progress');if(target&&error.csvLine)target.textContent=this.t('csvErrorLine').replace('{line}',error.csvLine)+' · '+this.t(error.message);}return;}
        try{
            if(options)document.getElementById('workspace-dialog')?.close();
            const entries=children.map(child=>({child,result:null}));
            if(workspace.batch.length+entries.length<=CSVManager.batchSize){workspace.batch.push(...entries);this.state.paste='';this.batchPage=Math.floor((workspace.batch.length-1)/8);await this.saveImmediate('imported');}
            else{
                // One durable transaction: no partially-created series on quota/collision failure.
                const all=[...workspace.batch,...entries],records=HistoryManager.emptyArchive();let first;
                for(let start=0;start<all.length;start+=CSVManager.batchSize){const next=HistoryManager.clone({...workspace,batch:all.slice(start,start+CSVManager.batchSize),paste:'',mode:'batch'});if(start)next.single=null;const snapshot=this.history.makeSnapshot(next,'imported');snapshot.name=`CSV ${ClinicalEngine.today()} · ${start+1}–${Math.min(start+CSVManager.batchSize,all.length)}`;HistoryManager.checkWorkspace(next);records.sessions.push(snapshot);if(!first)first=next;}
                await this.history.storage.addArchive(records);
                if(current()){this.state=first;this.history.lastSaved=HistoryManager.signature(first);this.batchPage=0;this.saveState='saved';this.pendingCSV=null;this.csvBusy=false;this.render('batch-results-title');this.toast('csvSplit');return;}
            }
            this.pendingCSV=null;if(current()){this.render('batch-results-title');this.toast('added');}
        }
        catch(error){if(current()){this.render('batch-results-title');this.toast('unsaved',true);}}
        finally{this.csvBusy=false;this.updateCSVControls();}
    }
    dialog(title,html,buttons='') {const d=document.getElementById('workspace-dialog');d.classList?.remove('batch-other-fields-dialog');d.classList?.toggle('csv-mapping-dialog',title==='csvMapping');d.innerHTML=`<div class="dialog-top"><h2 id="dialog-title">${this.t(title)}</h2><button class="btn" data-action="close-dialog" aria-label="${this.t('close')}">×</button></div><div class="dialog-body" role="region" aria-labelledby="dialog-title" tabindex="0">${html}</div><div class="toolbar">${buttons}<button class="btn" data-action="close-dialog">${this.t('close')}</button></div>`;if(!d.open)d.showModal();}
    async previewSession(row){
        const epoch=this.renderEpoch,request=this.previewRequest=(this.previewRequest||0)+1;let session;
        try{session=await this.history.version(row);}catch(_){if(request===this.previewRequest)this.toast('historyReadFailed',true);return;}
        if(epoch!==this.renderEpoch||request!==this.previewRequest)return;
        if(!session){this.toast('historyReadFailed',true);return;}
        this.previewedVersion=session;
        if(!session?.metadata?.workspace)return;
        this.previewPage=0;this.renderVersionPreview();
    }
    versionPreviewView() {
        const w=this.previewedVersion?.metadata?.workspace;
        const entries=w?[...(w.single?[w.single]:[]),...(w.batch||[])]:[],total=entries.length,size=8,pages=Math.max(1,Math.ceil(total/size));
        const current=Math.min(pages-1,Math.max(0,Number.isInteger(this.previewPage)?this.previewPage:0));
        return {current,pages,total,start:current*size,from:total?current*size+1:0,to:Math.min(total,(current+1)*size),entries:entries.slice(current*size,(current+1)*size)};
    }
    renderVersionPreview(focus=false) {
        const session=this.previewedVersion;if(!session?.metadata?.workspace)return;
        const w=session.metadata.workspace;
        const view=this.versionPreviewView();
        this.dialog('preview',`<p class="lede">${this.t('previewHelp')}</p><p class="meta">${this.date(session.createdAt)}</p><p class="meta">${this.t(w.mode === 'batch' ? 'batch' : 'single')}</p>${this.previewDraft(w.draft,'single')}${this.previewDraft(w.batchDraft,'batch')}${w.paste?`<p class="hint">CSV</p><pre>${this.esc(w.paste)}</pre>`:''}${view.total?`<div class="table-scroll">${this.tableHTML(view.entries)}</div>${this.paginationHTML(view,{action:'preview-page',label:'previewPages'})}`:''}${w.single?this.resultsHTML(w.single,w.stale,true):''}`,`<button class="btn primary" data-action="restore" data-id="${this.esc(session.id)}">${this.t('restore')}</button>`);
        if(focus)this.focusPagination('preview-page');
    }
    previewDraft(draft, mode, titleKey='draft') {
        if (!draft || !HistoryManager.hasWork({[mode === 'batch' ? 'batchDraft' : 'draft']:draft})) return '';
        const ageFields = draft.ageMode === 'dates' ? ['birthDate'] : draft.ageMode === 'days' ? ['ageDays'] : draft.ageMode==='totalMonths'?['ageTotalMonths']:['ageYears','ageMonths'];
        const fields=['caseId','name','ageMode',...ageFields,'measurementDate','weight','weightUnit','height','heightUnit','gender','position','oedema','growthProfile','postmenstrualDays','gestationalAgeWeeks','gestationalAgeDays',...NutritionUI.inputFields,...SupplementaryUI.fields];
        const labels = { gender:{M:'male',F:'female'}, position:{L:'lying',H:'standing'}, oedema:{n:'no',y:'yes'} };
        const value = key => {
            if(['birthDate','measurementDate'].includes(key))return this.calendarDate(draft[key]);
            if(key==='careProtocol')return draft[key]==='niger2025'?this.t('careNiger2025'):draft[key]==='niger2023'?this.t('careNiger2023'):draft[key]==='who2023'?this.t('careWHO'):draft[key];
            if(NutritionUI.inputFields.includes(key)&&key!=='muac'){
                const label=NutritionUI.observationLabel(key,draft[key],draft.careProtocol==='niger2025'?'2025':draft.careProtocol==='niger2023');
                return label==='unknown'?draft[key]:this.t(label);
            }
            return key === 'growthProfile' ? this.t(draft[key]==='intergrowth'?'profileINTERGROWTH':draft[key]==='us'?'profileUS':'profileWHO') : key === 'ageMode' ? this.t(draft[key]) : labels[key]?.[draft[key]] ? this.t(labels[key][draft[key]]) : draft[key];
        };
        return `<h3>${this.t(titleKey)}${titleKey==='draft'?' · '+this.t(mode):''}</h3><div class="preview-grid">${fields.filter(k=>draft[k]!==''&&draft[k]!==undefined&&draft[k]!==null).map(k=>`<dl><dt>${this.t(k==='weight'&&draft.weightUnit?'weightMeasure':k==='height'&&draft.heightUnit?'heightMeasure':k)}</dt><dd>${this.esc(value(k))}</dd></dl>`).join('')}</div>`;
    }
    async restore(session){
        if(!session?.metadata?.workspace)return;
        HistoryManager.checkWorkspace(session.metadata.workspace);
        await this.saveImmediate('beforeRestore');
        const workspace=HistoryManager.clone(session.metadata.workspace), map=new Map();
        for(const entry of [...workspace.batch,...(workspace.single?[workspace.single]:[])]){
            const id=entry.child.id;if(!map.has(id))map.set(id,'child_'+crypto.randomUUID());entry.child.id=map.get(id);
            if(entry.result){entry.result.id='result_'+crypto.randomUUID();entry.result.childId=entry.child.id;}
        }
        if(workspace.single && !Object.keys(workspace.draft||{}).length)workspace.draft={...workspace.single.child};
        workspace.draft={...this.emptyDraft('who'),careProtocol:'',...workspace.draft};workspace.batchDraft={...this.emptyDraft('who'),careProtocol:'',...workspace.batchDraft};
        if(workspace.single?.child?.visitId && !workspace.draft.visitId)workspace.draft.visitId=workspace.single.child.visitId;
        delete workspace.draft.id;delete workspace.batchDraft.id;
        // A stored source is already durable; resuming it alone is not a new version.
        // A journal-only recovery must still be durably saved before exposing the copy.
        const origin=this.sessions?.find(row=>row.id===session.id)?.origin;
        if(['stored','memory'].includes(origin?.kind)&&typeof this.history.resumeSaved==='function')await this.history.resumeSaved(workspace);
        else await this.history.save(workspace,'restoreCopy',true);
        this.state=workspace;this.singleEditing=!!workspace.stale;this.singleView='summary';this.batchPane=workspace.batch.length?'results':'entry';this.batchSearch='';this.batchFilter='all';this.batchPage=0;this.checkpoint(false);this.page=workspace.mode==='batch'?'batch':'single';document.getElementById('workspace-dialog').close();this.render('main');this.toast('restored');
    }
    async previewImport(file,{decrypted=false}={}){
        if(this.transferBusy||this.cryptoBusy&&!decrypted){this.toast('transferPreparing');return;}
        const encryptedEpoch=this.renderEpoch;
        if(await SecureBackup.isEncrypted(file)){
            if(encryptedEpoch===this.renderEpoch)this.passwordDialog(file);
            return;
        }
        const epoch=this.renderEpoch,request=this.importRequest=(this.importRequest||0)+1;
        if(this.preparedImport?.format==='stream')this.transfers().release(this.preparedImport);this.preparedImport=null;
        let prepared;
        try{
            this.toast('transferPreparing');this.transferStatus(true);
            prepared=await this.transfers().prepare(file,n=>{if(request===this.importRequest)this.transferStatus(n);});
            const duplicate=await this.transfers().hasImported(prepared);
            if(epoch!==this.renderEpoch||request!==this.importRequest){this.transfers().release(prepared);return;}
            this.showImportPreview(prepared,file.name,duplicate);
        }catch(error){if(prepared?.format==='stream')this.transfers().release(prepared);if(request!==this.importRequest)return;this.preparedImport=null;this.toast(error instanceof SyntaxError||error instanceof TypeError?'importInvalid':error.message,true);}
        finally{if(request===this.importRequest)this.transferStatus();}
    }
    chartEngines(entries){
        const engines=this.engine.older?[this.engine.young,this.engine.older,this.engine.cdc].filter(Boolean)
            .filter(engine=>entries.some(e=>e.result?.referenceVersion===engine.data.referenceVersion)):[this.engine];
        const intergrowth=entries.find(e=>e.result?.referenceFamily==='INTERGROWTH2015');
        if(intergrowth)engines.push({data:{referenceVersion:intergrowth.result.referenceVersion}});
        return engines.length?engines:[this.engine.young||this.engine];
    }
    chartsHTML(entries){
        const additional=entries.filter(e=>e.result?.additionalGrowth?.referenceVersion.startsWith('WHO-child-additional-'));
        return this.chartEngines(entries).map(engine=>GrowthChart.referenceHTML(entries.filter(e=>e.result?.referenceVersion===engine.data.referenceVersion),engine,this,{compactHelp:true})+GrowthChart.html(entries,engine.data.referenceVersion,this)).join('')
            +(this.engine.additional&&additional.length?GrowthChart.referenceHTML(additional,this.engine.additional,this,{compactHelp:true})+GrowthChart.html(additional,this.engine.additional.data.referenceVersion,this):'');
    }
    async renderFollowup(){
        const entry=this.state.single,child=entry?.child,epoch=this.renderEpoch;if(!entry?.result)return;
        const {entries,identityConflict}=child.caseId?await this.history.caseVisits(child.caseId,child.gender,child.birthDate):{entries:[entry],identityConflict:false};
        if(epoch!==this.renderEpoch || this.page!=='single' || this.state.single!==entry)return;
        const target=document.getElementById('single-results');if(!target)return;
        const visits=target.querySelector('[data-single-visits]'),charts=target.querySelector('[data-single-charts]');
        if(visits&&child.caseId)visits.innerHTML=identityConflict?`<p class="notice warn">${this.t('followupIdentityWarning')}</p>`:'';
        if(charts)charts.innerHTML=this.chartsHTML(entries.length?entries:[entry]);
        const history=target.querySelector('[data-single-history]');
        if(history){
            const rows=entries.length?entries:[entry],e=v=>this.esc(v),allPreterm=rows.every(row=>row.result?.intergrowthContext);
            history.innerHTML=`<div class="table-scroll"><table class="visit-history-table"><thead><tr>${['measurementDate',allPreterm?'postmenstrualDays':'ageDays','weight','height','muac','referenceVersion'].map(k=>`<th scope="col">${e(this.t(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(({child:c,result:r})=>`<tr><td>${e(this.calendarDate(c.measurementDate))}</td><td>${e((allPreterm?r?.intergrowthContext?.age.postmenstrualDays:c.ageDays)??this.t('unknown'))}</td><td>${e(this.number(c.weight,0))}</td><td>${e(this.number(c.height,1))}</td><td>${e(r?.nutrition?.muacMm==null?this.t('unknown'):this.number(r.nutrition.muacMm,1)+' mm')}</td><td>${e(r?.referenceVersion||this.t('unknown'))}</td></tr>`).join('')}</tbody></table></div>`;
        }
    }
    updateConnection(){const badge=document.getElementById('connection');if(badge){const online=navigator.onLine;badge.dataset.connection=online?'online':'offline';badge.innerHTML=`<span class="dot" aria-hidden="true"></span>${this.t(online?'online':'offline')}`;}}
    updateOfflineStatus(){document.querySelectorAll('[data-offline-status]').forEach(el=>{el.textContent=this.t(this.offlineState);});document.querySelectorAll('[data-mobile-offline-status]').forEach(el=>{el.textContent=this.t(this.offlineState==='offlineFailed'?'mobileOfflineFailed':this.offlineState);});this.updateInstallStatus();}
    updateNoticeState(){
        const available=!!this.offlineRegistration?.waiting||!!this.reloadAvailable;
        const error=this.updateError||'';
        return {available,error,key:available||error?JSON.stringify([available,error,this.updateAssetError||'']):''};
    }
    updateHTML(){
        const {available,error,key}=this.updateNoticeState();
        if(!key||this.updateNoticeDismissed===key)return '';
        return `<div class="notice update-toast ${error?'warn':'recovery'}" role="${error?'alert':'status'}"><div class="update-toast-heading"><strong>${this.t(error?'updateFailed':'updateReady')}</strong>${this.toolButton('close','close','dismiss-update-notice')}</div><p>${this.t(error?'updateFailedHelp':'updateHelp')}</p>${error&&error!=='updateFailedHelp'?`<p>${this.esc(this.t(error))}</p>`:''}<button class="btn" data-action="${available?'apply-update':'check-update'}" ${this.updateApplying?'disabled':''}>${this.t(this.updateApplying?'updateSaving':available?'updateApply':'updateRetry')}</button></div>`;
    }
    dismissUpdateNotice(){
        this.updateNoticeDismissed=this.updateNoticeState().key;
        clearTimeout(this.updateNoticeTimer);this.updateNoticeTimer=null;
        const el=document.getElementById('update-notice');if(el)el.innerHTML='';
    }
    updateSettingsHTML(){
        const {available,error}=this.updateNoticeState();
        return `${available||error?`<div class="settings-update-state ${error?'update-state-warning':''}" role="status"><strong>${this.t(error?'updateFailed':'updateReady')}</strong><details><summary>${this.t('updateDetailsTitle')}</summary><p>${this.t(error?'updateFailedHelp':'updateHelp')}</p>${error&&error!=='updateFailedHelp'?`<p>${this.esc(this.t(error))}</p>`:''}${error&&this.updateAssetError?`<p><bdi>${this.esc(this.updateAssetError)}</bdi></p>`:''}</details></div>`:''}<div class="toolbar settings-update-actions"><button class="btn" data-action="check-update" ${this.updateChecking||this.updateApplying?'disabled':''}>${this.t(this.updateChecking?'settingsChecking':'updateCheck')}</button>${available?`<button class="btn primary" data-action="apply-update" ${this.updateApplying||this.updateChecking?'disabled':''}>${this.t(this.updateApplying?'updateSaving':'updateApply')}</button>`:''}</div>`;
    }
    updateUpdateStatus(){
        const {key}=this.updateNoticeState();
        if(key!==this.updateNoticeKey){
            clearTimeout(this.updateNoticeTimer);this.updateNoticeKey=key;this.updateNoticeDismissed='';
            if(key)this.updateNoticeTimer=setTimeout(()=>this.dismissUpdateNotice(),5000);
        }
        const el=document.getElementById('update-notice');if(el)el.innerHTML=this.updateHTML();
        const settings=document.getElementById('settings-update-status');if(settings)settings.innerHTML=this.updateSettingsHTML();
        document.querySelectorAll('#page-content [data-action="check-update"]').forEach(button=>{button.disabled=!!this.updateChecking||!!this.updateApplying||!('serviceWorker' in navigator);button.textContent=this.t(this.updateChecking?'settingsChecking':'updateCheck');});
    }
    async checkUpdate(){
        if(this.updateChecking||this.updateApplying)return;
        if(!navigator.onLine){this.toast('settingsUpdateOffline',true);return;}
        if(!this.offlineRegistration){await this.registerOffline();if(!this.offlineRegistration)return;}
        this.updateChecking=true;this.updateError=null;this.updateAssetError='';this.updateNoticeKey=null;this.updateUpdateStatus();
        try{await this.offlineRegistration.update();if(!this.updateError)this.toast('updateChecked');}
        catch(error){this.updateError='updateFailedHelp';console.warn('Service worker update failed',error);}
        finally{this.updateChecking=false;this.updateUpdateStatus();}
    }
    activateWaitingWorker(worker){
        return new Promise((resolve,reject)=>{
            const channel=new MessageChannel(),sw=navigator.serviceWorker;
            const cleanup=()=>{clearTimeout(timer);sw.removeEventListener('controllerchange',changed);channel.port1.close();};
            const changed=()=>{cleanup();resolve();};
            const timer=setTimeout(()=>{cleanup();reject(new Error('updateFailed'));},10000);
            sw.addEventListener('controllerchange',changed);
            channel.port1.onmessage=event=>{if(event.data?.error){cleanup();reject(new Error(event.data.error));}};
            try{worker.postMessage({type:'ACTIVATE_UPDATE'},[channel.port2]);}catch(_){cleanup();reject(new Error('updateFailed'));}
        });
    }
    async applyUpdate(){
        if(this.updateApplying)return;
        const worker=this.offlineRegistration?.waiting;
        if(!worker&&!this.reloadAvailable)return;
        this.readForms();this.updateApplying=true;this.updateError=null;
        const root=document.getElementById('app-root');root.inert=true;this.updateUpdateStatus();
        try{
            try{await this.saveImmediate('beforeUpdate',true);}catch(_){throw new Error('updateSaveFailed');}
            if(worker)await this.activateWaitingWorker(worker);
            location.reload();
        }catch(error){this.updateError=error.message;this.toast(error.message,true);}
        finally{root.inert=false;this.updateApplying=false;this.updateUpdateStatus();}
    }
    async registerOffline(){
        if(!('serviceWorker' in navigator)){this.offlineState='offlineFailed';this.updateOfflineStatus();return;}
        try{
            const registration=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
            this.offlineRegistration=registration;
            const controlled=!!navigator.serviceWorker.controller;
            if(!this.offlineListeners){
                this.offlineListeners=true;
                navigator.serviceWorker.addEventListener('message',event=>{
                    if(event.data?.type!=='RELEASE_INSTALL_FAILED')return;
                    const asset=String(event.data.asset||'');
                    this.updateAssetError=/^[a-zA-Z0-9_./-]{1,200}$/.test(asset)?asset:'';
                    this.updateError='updateFailedHelp';this.updateUpdateStatus();
                });
                navigator.serviceWorker.addEventListener('controllerchange',()=>{this.offlineState='offlineReady';this.updateAssetError='';this.updateError=null;this.reloadAvailable=true;this.updateOfflineStatus();this.updateUpdateStatus();});
            }
            const inspect=()=>{
                if(registration.active){this.offlineState='offlineReady';this.updateOfflineStatus();}
                this.updateUpdateStatus();
            };
            const watch=worker=>{
                if(!worker)return;
                const isUpdate=!!registration.active;
                let installed=['installed','activating','activated'].includes(worker.state);
                worker.addEventListener('statechange',()=>{
                    // A successfully installed worker becoming obsolete is normal replacement,
                    // not a failed download. An uncontrolled first-load tab may see an update
                    // activate immediately, so it must still offer the saved-work reload.
                    if(['installed','activating','activated'].includes(worker.state)){installed=true;this.updateError=null;this.updateAssetError='';}
                    if(worker.state==='redundant'&&!installed){if(!registration.active)this.offlineState='offlineFailed';this.updateError='updateFailedHelp';this.updateOfflineStatus();}
                    if(worker.state==='activated'){
                        if(isUpdate)this.reloadAvailable=true;
                        else if(!controlled)this.reloadAvailable=false;
                    }
                    inspect();
                });
            };
            registration.addEventListener('updatefound',()=>watch(registration.installing));
            watch(registration.installing);inspect();
        }catch(error){this.offlineState=navigator.serviceWorker.controller?'offlineReady':'offlineFailed';this.updateError='updateFailedHelp';this.updateOfflineStatus();this.updateUpdateStatus();console.warn('Offline setup failed',error);}
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { WorkspaceApp };
else {
    if(typeof ReleaseGuard==='undefined'){
        const root=document.getElementById('app-root');root.textContent='Fichiers indisponibles. Aucun calcul ouvert. Réessayez. / Files unavailable. No calculator opened. Try again. / الملفات غير متاحة. لم تُفتح أداة الحساب. أعد المحاولة.';root.setAttribute('role','alert');root.className='startup';
        const retry=document.createElement('button');retry.className='btn';retry.textContent='Réessayer / Try again / أعد المحاولة';retry.addEventListener('click',()=>location.reload());root.append(retry);
    }else try{if(ReleaseGuard.failed)throw new Error('releaseInvalid');const workspaceApp=new WorkspaceApp();workspaceApp.init();}catch(_){ReleaseGuard.fail();}
}
