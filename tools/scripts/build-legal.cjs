'use strict';
const fs=require('node:fs'),path=require('node:path');
const {publisher,content}=require('./legal-content.cjs');
const root=path.resolve(__dirname,'../..');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages={fr:'legal.html',en:'legal-en.html',ar:'legal-ar.html'};
const seoDescriptions={fr:'Mentions légales, confidentialité, conditions d’utilisation et licences de Z-score Niger, édité par Tout Informatique Lazaret.',en:'Legal notice, privacy, terms of use and licences for Z-score Niger, published by Tout Informatique Lazaret.',ar:'الإشعارات القانونية والخصوصية وشروط الاستخدام والتراخيص لتطبيق Z-score Niger من Tout Informatique Lazaret.'};
function legalPages(){
    const version=require('../../src/js/workspace-app.js').WorkspaceApp.version,repo='https://github.com/mohamedoumarougarba-til227/nutritional-zscore-calculator';
    const githubLabels={fr:['Projet GitHub · code et contributions','Sources de cette version · GitHub'],en:['GitHub project · code and contributions','Sources of this version · GitHub'],ar:['المشروع والكود والمساهمات · GitHub','مصادر هذا الإصدار · GitHub']};
    const links=[['Z-score · GPLv3','data/LICENSE-TIL.txt'],['PCIMA Niger · 2023',repo+'/blob/v'+version+'/docs/references/PCIMA_NIGER_2023.md'],['PCIMA Niger · 2025',repo+'/blob/v'+version+'/docs/references/PCIMA_NIGER_2025.md'],['PCIMA · Provenance',repo+'/blob/v'+version+'/docs/references/PCIMA_SOURCES.json'],['INTERGROWTH · GIGS',repo+'/blob/v'+version+'/tools/reference/intergrowth/LICENSE.md'],['WHO 2006','https://www.who.int/tools/child-growth-standards'],['WHO 2007','https://www.who.int/tools/growth-reference-data-for-5to19-years'],
        ['Anthro · b776d8a12b1c','https://github.com/WorldHealthOrganization/anthro/tree/b776d8a12b1c97369c748b561159fd2ec4f4db58'],
        ['AnthroPlus · 7cfcdb39026e','https://github.com/WorldHealthOrganization/anthroplus/tree/7cfcdb39026e9a55de55732bc3cf14c82261bcf7'],
        ['CDC 2000','https://www.cdc.gov/growthcharts/cdc-data-files.htm'],['CDC · Extended BMI 2022','https://www.cdc.gov/growthcharts/extended-bmi-data-files.htm'],['CDC · Content reuse','https://www.cdc.gov/Other/imagereuse.html'],
        ['GPL · Anthro','data/LICENSE-anthro.txt'],['GPL · AnthroPlus','data/LICENSE-anthroplus.txt'],['MIT · jsPDF','vendor/pdf/jspdf-4.2.1.umd.min.js.LICENSE.txt'],
        ['MIT · AutoTable','vendor/pdf/autotable-5.0.8.min.js.LICENSE.txt'],['PDF · Notices','vendor/pdf/NOTICE-report.txt'],['OFL · Amiri','vendor/pdf/OFL.txt'],
        ['HAPDP · Niger','https://www.hapdp.ne/legislation-nationale'],['Vercel · Privacy','https://vercel.com/legal/privacy-notice'],['TIL',publisher.website]];
    return Object.fromEntries(Object.entries(content).map(([lang,c])=>{
        const para=text=>escape(text).replace(/\{(\w+)\}/g,(_,key)=>'<bdi>'+escape(publisher[key])+'</bdi>');
        const html=`<!doctype html>
<html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">
<title>${escape(c.title)} · Z-score Niger</title><meta name="description" content="${escape(seoDescriptions[lang])}"><link rel="canonical" href="https://zscore.tilniger.com/${pages[lang]}"><link rel="stylesheet" href="css/workspace.css"><link rel="stylesheet" href="css/legal.css"></head>
<body class="legal-page"><a class="skip" href="#content">${escape(c.title)}</a>
<header class="legal-header"><a class="brand" href="./"><span class="brand-mark">Z</span><span>Z-score Niger</span></a>
<nav aria-label="Language">${Object.entries(pages).map(([code,file])=>`<a href="${file}" lang="${code}" hreflang="${code}"${code===lang?' aria-current="page"':''}>${{fr:'Français',en:'English',ar:'العربية'}[code]}</a>`).join('')}</nav></header>
<main id="content"><a href="./">${escape(c.back)}</a><h1>${escape(c.title)}</h1><p class="muted">${escape(c.updated)}</p><p>${escape(c.intro)}</p>
<nav class="legal-toc" aria-label="${escape(c.title)}">${c.sections.map(([id,title])=>`<a href="#${id}">${escape(title)}</a>`).join('')}</nav>
${c.sections.map(([id,title,paragraphs])=>`<section id="${id}" class="card"><h2>${escape(title)}</h2>${paragraphs.map(p=>`<p>${para(p)}</p>`).join('')}</section>`).join('\n')}
<section class="card"><h2>${escape(c.links)}</h2><ul class="legal-links">${[[githubLabels[lang][0],repo],[githubLabels[lang][1],repo+'/releases/tag/v'+version],...links].map(([label,url])=>`<li><a href="${escape(url)}"${url.startsWith('https:')?' target="_blank" rel="noopener noreferrer"':''}>${escape(label)}</a></li>`).join('')}</ul></section>
<footer><span>© 2026 Tout Informatique Lazaret</span><a href="mailto:${publisher.email}">${escape(c.contact)}</a></footer></main></body></html>\n`;
        return [pages[lang],html];
    }));
}
if(require.main===module)for(const [file,html]of Object.entries(legalPages()))fs.writeFileSync(path.join(root,'src',file),html);
module.exports={legalPages,pages};
