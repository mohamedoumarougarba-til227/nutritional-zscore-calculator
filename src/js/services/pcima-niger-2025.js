/** Bounded, independently written screening support: Niger PCIMA March 2025.
 * PDF pages 45-55, 71-72, 83-85, 183-208. See PCIMA_NIGER_2025.md.
 * No treatment, admission, discharge or replacement of WHO LMS calculations.
 */
const Pcima2023Base=typeof module!=='undefined'&&module.exports?require('./pcima-niger.js').PcimaNiger:globalThis.PcimaNiger;
class PcimaNiger2025 {
    static reference='Niger-PCIMA-2025-screening-v1';
    static source='https://github.com/mohamedoumarougarba-til227/nutritional-zscore-calculator/blob/main/docs/references/PCIMA_NIGER_2025.md';
    static extraObservations=['prematureOrLowBirthWeight','maternalRisk','maternalDanger','previousSevereWasting','moderateRelapse','notRecovering','comorbidity','highRiskContext'];
    static infantObservations=['breastfeeding','feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem','prematureOrLowBirthWeight','maternalRisk','maternalDanger'];
    static childObservations=['feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem','mixedMalnutrition','previousSevereWasting','moderateRelapse','notRecovering','comorbidity','highRiskContext'];
    static observations(child) { return child.totalAgeMonths<6||child.weight<3000?this.infantObservations:this.childObservations; }
    static usable(score) { return Number.isFinite(score?.zscoreRaw)&&score.flagged===false; }
    static assess(child,result,base) {
        // Reuse the unchanged shared 115/125 and -3/-2 screening criteria, not 2023 follow-up rules.
        const n=Pcima2023Base.assess(child,result,base);
        n.reference=this.reference;
        if(child.totalAgeMonths>=60)return n;
        const infant=child.totalAgeMonths<6||child.weight<3000;
        const required=this.observations(child);
        n.missing=n.missing.filter(k=>!Pcima2023Base.observations.includes(k));
        for(const key of required)if(!child[key])n.missing.push(key);
        const danger=n.reasons.includes('dangerPresent');
        if(infant){
            // The MAMI annex explicitly skips WHZ. Do not infer an infant admission from WHZ.
            n.criteria=n.criteria.filter(k=>k==='criterionOedema');
            n.missing=n.missing.filter(k=>!['position','weightForHeight'].includes(k));
            if(child.totalAgeMonths>=6)n.reasons=n.reasons.filter(k=>k!=='pcimaWeightBelow3kg');
            if(child.totalAgeMonths>=6)n.reasons.push('pcima2025WeightBelow3kg');
            if(child.oedema==='n'&&this.usable(result?.weightForAge)){
                if(result.weightForAge.zscoreRaw<-2)n.criteria.push('pcimaInfantWazLow');
            }else if(child.oedema!=='y')n.missing.push('weightForAge');
            // Completed/estimated months cannot establish the exact six-week boundary.
            const exact=['days','dates'].includes(child.ageMode)&&Number.isInteger(child.ageDays);
            const pbAge=child.totalAgeMonths<6&&exact&&child.ageDays>=42;
            n.muac=pbAge?(n.muacMm===null?'muacMissing':n.muacMm<110?'pcimaInfantMuacLow':'pcimaInfantMuacNotLow'):'muacAgeUnsupported';
            if(pbAge&&n.muacMm===null)n.missing.push('muac');
            if(child.totalAgeMonths<6&&!exact)n.reasons.push('pcimaInfantMuacAgeUncertain');
            if(n.muac==='pcimaInfantMuacLow')n.criteria.push('pcimaInfantMuacCriterion');
            for(const key of ['prematureOrLowBirthWeight','maternalRisk','maternalDanger'])if(child[key]==='y')n.reasons.push('pcima2025Reason'+key[0].toUpperCase()+key.slice(1));
            const risk=n.criteria.length||n.reasons.some(k=>!['pcimaInfantMuacAgeUncertain','pcima2025WeightBelow3kg'].includes(k))||child.breastfeeding==='n';
            if(child.breastfeeding==='n')n.reasons.push('pcimaNotBreastfed');
            const urgent=danger||child.oedema==='y'||child.recentWeightLoss==='y'||child.maternalDanger==='y';
            n.orientation=urgent?'orientationUrgent':risk?'pcima2025InfantRiskReview':'pcima2025InfantReview';
        }else{
            const mam=n.category==='nutritionModerateCriteria';
            const risks=[];
            if(mam){
                if(child.totalAgeMonths<24)risks.push('pcimaMamAgeRisk');
                if(typeof child.muac==='number'&&child.muac>=115&&child.muac<119)risks.push('pcimaMamMuacRisk');
                if(child.oedema==='n'&&this.usable(result?.weightForAge)&&result.weightForAge.zscoreRaw<-3)risks.push('pcimaMamWazRisk');
                else if(child.oedema!=='y'&&!this.usable(result?.weightForAge))n.missing.push('weightForAge');
                // Table VIII has a contradictory "without risk" PB inequality. Never declare no risk.
                n.reasons.push('pcimaMamRiskReview');
            }
            for(const key of ['previousSevereWasting','moderateRelapse','notRecovering','comorbidity','highRiskContext'])if(child[key]==='y')risks.push('pcima2025Reason'+key[0].toUpperCase()+key.slice(1));
            n.reasons.push(...risks);
            if(!danger&&risks.length&&n.category!=='nutritionSevere')n.orientation='orientationClinicalAssessment';
            // New unknown/risk observations cannot inherit the 2023 complete outpatient-review shortcut.
            if(n.orientation==='pcimaOutpatientReview')n.orientation=risks.length||n.missing.length?'orientationSevereAssessment':'pcima2025OutpatientReview';
        }
        n.reasons=[...new Set(n.reasons)];n.missing=[...new Set(n.missing)];
        return n;
    }
}
if(typeof module!=='undefined'&&module.exports)module.exports={PcimaNiger2025};else window.PcimaNiger2025=PcimaNiger2025;
