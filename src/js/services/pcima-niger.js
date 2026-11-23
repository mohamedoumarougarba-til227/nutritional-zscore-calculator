/** Independently written, bounded screening support from Niger PCIMA January 2023.
 * Source pages: 33, 43-44, 56, 75, 82, 128-135. Not a treatment protocol.
 * WHO LMS scores are never changed here. Historical WHO assessments keep their rules.
 */
class PcimaNiger {
    static reference = 'Niger-PCIMA-2023-screening-v1';
    static source = 'https://reliefweb.int/report/niger/protocole-national-de-prise-en-charge-integree-de-la-malnutrition-aigue-janvier-2023';
    static observations = ['breastfeeding','feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem','mixedMalnutrition'];
    static fields = ['careProtocol', ...this.observations];
    static assess(child, result, base) {
        const n = {...base, reference:this.reference, criteria:[...base.criteria], reasons:[...base.reasons], missing:[...base.missing]};
        const age = child.totalAgeMonths;
        // A score obtained using an assumed position cannot establish a national P/T criterion.
        const wh = result?.weightForHeight;
        const validZ = !!child.position && Number.isFinite(wh?.zscoreRaw) && wh.flagged === false;
        const danger = n.reasons.includes('dangerPresent');
        if (age >= 60) {
            return {...n, category:'pcimaOutsideScope', orientation:danger?'orientationUrgent':'pcimaOutsideReview', muac:'muacAgeUnsupported', criteria:[]};
        }
        const infant = age < 6 || child.weight < 3000;
        if (infant) {
            n.category = 'pcimaInfantContext';
            n.muac = 'muacAgeUnsupported';
            n.criteria = [];
            n.missing = n.missing.filter(k => !['muac','appetite','furtherAssessment','weightForHeight'].includes(k));
            if (!child.position && !n.missing.includes('position')) n.missing.push('position');
            if (child.oedema === 'y') n.criteria.push('criterionOedema');
            if (validZ && wh.zscoreRaw < -3) n.criteria.push('criterionWhzSevere');
            if (age >= 6 && child.weight < 3000) n.reasons.push('pcimaWeightBelow3kg');
            for (const key of ['breastfeeding','feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem']) {
                if (!child[key]) n.missing.push(key);
            }
            if (child.mixedMalnutrition === 'y') n.reasons.push('pcimaMixedPresent');
            const risk = n.criteria.length || child.acuteProblem === 'y' || child.appetite === 'poor' || child.mixedMalnutrition === 'y' || ['feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem'].some(k => child[k] === 'y');
            n.orientation = danger?'orientationUrgent':risk?'pcimaInfantRiskReview':'pcimaInfantReview';
        } else {
            // Table I uses OR, despite the conflicting simplified flowchart on page 20.
            n.criteria = n.criteria.filter(k => !['criterionWhzSevere','criterionWhzModerate'].includes(k));
            if (validZ && wh.zscoreRaw < -3) n.criteria.push('criterionWhzSevere');
            else if (validZ && wh.zscoreRaw < -2) n.criteria.push('criterionWhzModerate');
            const severe = n.criteria.some(k => ['criterionMuacSevere','criterionWhzSevere','criterionOedema'].includes(k));
            const moderate = n.criteria.some(k => ['criterionMuacModerate','criterionWhzModerate'].includes(k));
            const complete = child.oedema === 'n' && typeof child.muac === 'number' && validZ;
            n.category = severe?'nutritionSevere':moderate?'nutritionModerateCriteria':complete?'nutritionNoCriteria':'nutritionIncomplete';
            if (!validZ && child.oedema !== 'y' && !n.missing.includes('weightForHeight')) n.missing.push('weightForHeight');
            for (const key of ['feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem','mixedMalnutrition']) if (!child[key]) n.missing.push(key);
            if (child.mixedMalnutrition === 'y') n.reasons.push('pcimaMixedPresent');
            const clinicalRisk = ['feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem'].some(k => child[k] === 'y');
            if (danger) n.orientation = 'orientationUrgent';
            else if (child.mixedMalnutrition === 'y' || severe && n.reasons.length) n.orientation = 'orientationInpatient';
            else if (clinicalRisk) n.orientation = 'orientationClinicalAssessment';
            else if (severe) n.orientation = 'orientationSevereAssessment';
            else if (child.acuteProblem === 'y' || child.appetite === 'poor') n.orientation = 'orientationClinicalAssessment';
            else n.orientation = moderate?'orientationNutritionAssessment':'orientationCompleteAssessment';
            if (severe && !n.reasons.length && !clinicalRisk && !n.missing.length && ['n','cleared'].includes(child.furtherAssessment)) n.orientation = 'pcimaOutpatientReview';
        }
        for (const key of ['feedingDifficulty','recentWeightLoss','poorWeightGain','medicalSocialProblem']) if (child[key] === 'y') n.reasons.push('pcimaReason'+key[0].toUpperCase()+key.slice(1));
        n.missing = [...new Set(n.missing)];
        return n;
    }
}
if(typeof module!=='undefined'&&module.exports)module.exports={PcimaNiger};else window.PcimaNiger=PcimaNiger;
