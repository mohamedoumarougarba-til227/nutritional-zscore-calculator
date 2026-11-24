/** Versioned decision support, separate from WHO LMS growth calculations.
 * Independently written implementation of WHO 2023 recommendations B1/B2.
 * No prescribing, national admission decision or declaration of recovery.
 */
const PcimaNutrition=typeof module!=='undefined'&&module.exports?require('./pcima-niger.js').PcimaNiger:globalThis.PcimaNiger;
const Pcima2025Nutrition=typeof module!=='undefined'&&module.exports?require('./pcima-niger-2025.js').PcimaNiger2025:globalThis.PcimaNiger2025;
class NutritionAssessment {
    static version = 1;
    static reference = 'WHO-wasting-2023-B1-B2';
    static sources = ['https://www.who.int/publications/i/item/9789240082830', 'https://www.who.int/publications/i/item/9789240122840'];
    static dangerFields = ['cannotDrink','vomitsEverything','convulsions','lethargy'];
    static legacyInputFields = ['muac', ...this.dangerFields, 'acuteProblem','appetite','oedemaGrade','furtherAssessment'];
    static inputFields = [...this.legacyInputFields, ...PcimaNutrition.fields, ...Pcima2025Nutrition.extraObservations];
    static nationalFields = PcimaNutrition.fields;
    static nationalSource = PcimaNutrition.source;
    static isNational(nutrition) { return [PcimaNutrition.reference,Pcima2025Nutrition.reference].includes(nutrition?.reference); }
    static is2025(nutrition) { return nutrition?.reference===Pcima2025Nutrition.reference; }
    static helpKey(nutrition) { return this.is2025(nutrition)?'pcima2025Help':'pcimaHelp'; }
    static sourceFor(nutrition) { return this.is2025(nutrition)?Pcima2025Nutrition.source:PcimaNutrition.source; }
    static observationsFor(child) {
        if(child.careProtocol!=='niger2025')return child.careProtocol==='niger2023'?PcimaNutrition.observations:[];
        // Keep every optional observation accessible while age/weight inputs are being edited.
        return [...PcimaNutrition.observations,...Pcima2025Nutrition.extraObservations];
    }
    static observationLabel(key,value,national=false) {
        if (!value) return 'unknown';
        if (key==='appetite') return value==='good'?(national==='2025'?'pcima2025AppetitePassed':national?'pcimaAppetitePassed':'appetiteGood'):value==='poor'?'appetitePoor':'unknown';
        if (key==='oedemaGrade') return ['1','2','3'].includes(value)?'grade'+value:'unknown';
        if (key==='furtherAssessment') return {n:'assessmentNone',y:'assessmentNeeded',cleared:'assessmentCleared'}[value]||'unknown';
        return value==='y'?'yes':value==='n'?'no':'unknown';
    }
    static normalize(raw) {
        const values = {};
        if (raw.muac !== undefined && raw.muac !== null && raw.muac !== '') {
            if (!['number','string'].includes(typeof raw.muac) || !String(raw.muac).trim() || !Number.isFinite(Number(raw.muac)) || Number(raw.muac)<50 || Number(raw.muac)>400) throw new Error('muacInvalid');
            values.muac = Number(raw.muac);
        }
        for (const key of [...this.dangerFields,'acuteProblem','appetite','oedemaGrade','furtherAssessment']) {
            const value = raw[key] ?? '';
            const allowed = key==='appetite'?['','good','poor']:key==='oedemaGrade'?['','1','2','3']:key==='furtherAssessment'?['','n','y','cleared']:['','n','y'];
            if (!allowed.includes(value)) throw new Error('clinicalInputInvalid');
            if (value) values[key] = value;
        }
        if (raw.oedema==='n' && values.oedemaGrade) throw new Error('oedemaConflict');
        if (!['',undefined,'who2023','niger2023','niger2025'].includes(raw.careProtocol)) throw new Error('careProtocolInvalid');
        if (['niger2023','niger2025'].includes(raw.careProtocol) && !['',undefined,'who'].includes(raw.growthProfile)) throw new Error('pcimaProfileRequired');
        if (raw.careProtocol) values.careProtocol = raw.careProtocol;
        for (const key of [...PcimaNutrition.observations,...Pcima2025Nutrition.extraObservations]) {
            const value = raw[key] ?? '';
            if (!['','n','y'].includes(value)) throw new Error('clinicalInputInvalid');
            if (value) values[key] = value;
        }
        if (raw.mixedMalnutrition==='y' && raw.oedema==='n') throw new Error('pcimaMixedConflict');
        return values;
    }
    static assess(child, result) {
        const base = this.assessWho(child,result);
        if(child.careProtocol==='niger2025')return Pcima2025Nutrition.assess(child,result,base);
        return child.careProtocol === 'niger2023' ? PcimaNutrition.assess(child,result,base) : base;
    }
    static assessWho(child, result) {
        const age=child.totalAgeMonths, eligible=child.growthProfile!=='intergrowth'&&age>=6&&age<60;
        if(child.growthProfile==='intergrowth')return {version:this.version,reference:'INTERGROWTH2015-postnatal-context',muacMm:typeof child.muac==='number'?child.muac:null,muac:'muacAgeUnsupported',category:'intergrowthNoScreening',orientation:this.dangerFields.some(key=>child[key]==='y')?'orientationUrgent':'intergrowthClinicalReview',criteria:[],reasons:this.dangerFields.some(key=>child[key]==='y')?['dangerPresent']:[],missing:[]};
        const pb=typeof child.muac==='number'?child.muac:null;
        const muac=pb===null?'muacMissing':!eligible?'muacAgeUnsupported':pb<115?'muacSevere':pb<125?'muacModerate':'muacNotLow';
        const wh=result?.weightForHeight;
        const validZ=typeof wh?.zscoreRaw==='number'&&Number.isFinite(wh.zscoreRaw)&&wh.flagged===false;
        const severe=eligible&&(child.oedema==='y'||muac==='muacSevere'||validZ&&wh.zscoreRaw<-3);
        const moderate=eligible&&(muac==='muacModerate'||validZ&&wh.zscoreRaw>=-3&&wh.zscoreRaw<-2);
        const complete=eligible&&!!child.position&&child.oedema==='n'&&pb!==null&&validZ;
        const category=!eligible?'nutritionAgeUnsupported':severe?'nutritionSevere':moderate?'nutritionModerateCriteria':complete?'nutritionNoCriteria':'nutritionIncomplete';
        const danger=this.dangerFields.some(key=>child[key]==='y');
        const criteria=[];
        if(eligible){
            if(muac==='muacSevere')criteria.push('criterionMuacSevere');
            else if(muac==='muacModerate')criteria.push('criterionMuacModerate');
            if(validZ&&wh.zscoreRaw<-3)criteria.push('criterionWhzSevere');
            else if(validZ&&wh.zscoreRaw<-2)criteria.push('criterionWhzModerate');
            if(child.oedema==='y')criteria.push('criterionOedema');
        }
        const reasons=[];
        if(danger)reasons.push('dangerPresent');
        if(child.acuteProblem==='y')reasons.push('acuteProblemPresent');
        if(child.appetite==='poor')reasons.push('appetitePoor');
        if(child.oedema==='y'&&child.oedemaGrade==='3')reasons.push('oedemaSevere');
        let orientation;
        if(danger)orientation='orientationUrgent';
        else if(!eligible)orientation='orientationAgeSpecific';
        else if(severe&&reasons.length)orientation='orientationInpatient';
        else if(severe)orientation='orientationSevereAssessment';
        else if(child.acuteProblem==='y'||child.appetite==='poor')orientation='orientationClinicalAssessment';
        else if(moderate)orientation='orientationNutritionAssessment';
        else orientation='orientationCompleteAssessment';
        // Passing the appetite test alone never establishes outpatient eligibility.
        const missing=[...this.dangerFields,'acuteProblem','appetite','furtherAssessment'].filter(key=>!child[key]);
        if(!child.oedema)missing.push('oedema');
        if(eligible&&!child.position)missing.push('position');
        if(child.oedema==='y'&&!child.oedemaGrade)missing.push('oedemaGrade');
        if(eligible&&pb===null)missing.push('muac');
        if(eligible&&!validZ&&child.oedema!=='y')missing.push('weightForHeight');
        if(severe&&!reasons.length&&!missing.length&&['n','cleared'].includes(child.furtherAssessment))orientation='orientationOutpatientReview';
        return {version:this.version,reference:this.reference,muacMm:pb,muac,category,orientation,criteria,reasons,missing};
    }
    static check(child,result) {
        if(!result.nutrition||result.nutrition.version!==this.version)throw new Error('importVersion');
        if(JSON.stringify(result.nutrition)!==JSON.stringify(this.assess(child,result)))throw new Error('importInvalid');
    }
}
if(typeof module!=='undefined'&&module.exports)module.exports={NutritionAssessment};else window.NutritionAssessment=NutritionAssessment;
