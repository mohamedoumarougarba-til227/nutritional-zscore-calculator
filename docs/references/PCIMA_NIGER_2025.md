# PCIMA Niger — document de mars 2025

CURRENT — sources de développement 5.11.0, moteur combiné 4.7.0. Cadre explicite `niger2025`, aide `Niger-PCIMA-2025-screening-v1`. Préparation locale du 23 novembre 2026 ; pas une annonce de déploiement ni une validation clinique.

## Source, rangement et portée

Le document reçu compte **274 pages PDF** et porte la mention « Version validée en MARS 2025 », avec un préambule signé reproduit. Empreinte SHA-256 : `e407dbe2b6b1cba3dde3108f367eb66ea4e5d529ecc9015a1c0ae85147e66d98` ; 5 667 851 octets. Ces éléments identifient la copie examinée ; ils ne constituent pas une authentification indépendante de sa diffusion ou de sa mise en vigueur nationale.

Les pages ci-dessous sont les **pages PDF, couverture comprise** : la page imprimée est généralement inférieure d’une unité. Lecture séquentielle de tout le texte, complétée par les images des pages sans texte utile et des figures/tableaux déterminants. La page 2 est blanche ; les deux dernières présentent des photographies puis la quatrième de couverture. La lecture des 28 annexes ne signifie pas que leurs actes cliniques sont exécutés par le logiciel.

Les copies originales et preuves sont conservées. Rangement local du mainteneur : `.local/references/pcima/niger/2025-03/PCIMA-Niger-2025-03.pdf` et, séparément, `.local/references/pcima/niger/2023-01/PCIMA-Niger-2023-01.pdf`. L’[inventaire de provenance](PCIMA_SOURCES.json), cette analyse et le code original sont publics. Le PDF reçu reste privé : aucune licence de redistribution intégrale établie, illustrations tierces et coordonnées personnelles dans l’annexe des participants. La GPL du logiciel ne transforme pas ce livre en œuvre sous GPL. Aucun PDF privé n’est nécessaire pour exécuter les tests synthétiques publics.

Le [cadre janvier 2023](PCIMA_NIGER_2023.md) est conservé avec son identifiant. Une visite 2023 n’est ni renommée ni recalculée en 2025. Les tables et méthodes LMS OMS 2006/2007 restent inchangées. La prise en charge nationale n’est pas une nouvelle table de Z-scores. Le cadre général OMS reste le choix initial ; les cadres Niger sont sélectionnés explicitement avec le profil de croissance OMS.

## Règles intégrées et décisions de transcription

| Sujet | Pages PDF | Comportement du logiciel |
|---|---|---|
| Critères 6 à moins de 60 mois, poids ≥ 3 kg | 71, 83, 97–99 | PB < 115 mm **ou** P/T < −3 Z **ou** œdèmes : critère sévère. PB de 115 inclus à 125 exclu **ou** P/T de −3 inclus à −2 exclu : critère modéré, avec recherche des œdèmes. « Critère présent » n’est pas un diagnostic/admission ; les inconnues restent signalées. |
| Domaine et qualité du P/T | 174–181, 214–219 | Critère national uniquement avec position réellement renseignée et Z brut valide non signalé. Ni score arrondi, ni extension du domaine LMS, ni table papier approximative à la place des données OMS. Les avertissements de position et d’œdèmes du calcul conditionnel restent affichés. |
| Risques MAM | 71–72, 270 | Facteurs positifs : âge < 24 mois, poids/âge brut valide < −3 Z, PB ≥ 115 et < 119 mm dans la colonne de risque, antécédent sévère, rechute, non-récupération, comorbidité, problème médical/social et contexte à haut risque confirmé. Les observations explicites complètent les mesures. Aucun risque territorial n’est déduit du pays ou des pourcentages d’un lot. |
| Ambiguïté PB MAM | 71 | L’autre colonne imprime `119 ≥ PB < 125`, contradictoire avec son intitulé. La branche positive explicite 115 ≤ PB < 119 est conservée ; **aucune classe automatique « sans risque »**, même à 119 mm ou au-delà. Un message et la recherche complémentaire des risques restent requis. Ne pas remplacer silencieusement par un seuil OMS différent ni en dériver une ration. |
| Couple mère–nourrisson MAMI | 45–55, 183–208 | Avant six mois, et circuit particulier après six mois si poids < 3 kg : alimentation/allaitement, trajectoire pondérale, prématurité/petit poids de naissance rapportés, risque maternel et problème médical/social observés. Pas de diagnostic de prématurité, de maladie ou de dépression calculé depuis ces réponses. |
| Poids/âge du nourrisson | 47, 50, 191 | Z brut valide non signalé < −2, avec œdèmes déclarés absents : motif d’évaluation approfondie. Le P/T n’est pas utilisé comme critère MAMI en raison du désaccord entre le corps du texte et la ligne explicitement sautée de l’annexe. Les scores de croissance disponibles restent visibles séparément. |
| PB du nourrisson | 50, 55, 187 | PB < 110 mm seulement à partir de **42 jours** et avant six mois. Âge saisi en jours ou par dates nécessaire pour établir cette borne ; avec mois estimés, seuil suspendu et explication affichée. Pas de seuil 110 avant 42 jours, ni de seuil 115/125 dans ce circuit, ni d’extension aux enfants ≥ 6 mois pesant < 3 kg. PB bas = évaluation approfondie, pas admission hospitalière automatique. |
| Urgence MAMI | 54–55 | Danger général, œdèmes, perte pondérale récente ou danger maternel aigu explicitement constaté : évaluation urgente. Les autres facteurs invitent à une revue approfondie rapide. Le logiciel ne réalise pas l’examen, le tri TETU ou l’évaluation psychiatrique. |
| Appétit | 84–85 | Dans ce cadre, `good` signifie **test professionnel 2025 réussi**, sans réutiliser l’ancienne grille de quantités/appétit modéré ou bon de 2023. Le texte décrit un test de 30 min ; l’application ne déduit pas sa réussite d’une quantité saisie ou d’une réponse parentale. |
| Revue CRENAS | 83–96 | Discussion avec le soignant seulement : critères sévères, test réussi, observations requises complètes et absence de risque connu. Inconnue ou nouveau risque interdit le raccourci de revue ambulatoire. Accès, consentement et décision du lieu de soins restent humains. |
| Transfert, récupération, sortie | 53–55, 79, 95, 134, 138 | Pas de guérison ou sortie automatique. 2025 emploie notamment des critères P/T **et** PB à deux visites au CRENAS, différents de 2023 ; transfert CRENI–CRENAS explicitement clinique, sans seuil anthropométrique de transfert. Les formulations jours/visites et MAMI divergent selon les sections. |
| Autres populations | 139–150 | Pas d’extension des seuils pédiatriques aux adolescents, adultes ou femmes enceintes/allaitantes. Les scores de croissance disponibles et le cadre national intégré restent distincts. |
| Exports et conservation | Produit | Cadre, motifs et observations conservés avec chaque visite. Nouvelles colonnes ajoutées **après** la fin CSV 2023. Rapports PDF FR/EN/AR contextualisés. Sauvegarde flux v1 et résultat schéma 4 conservés ; un ancien lecteur sans le cadre 2025 peut refuser ces nouvelles visites. Les originaux restent inchangés. |
| DHIS2 | 160–173 | Export toujours préparatoire : lignes de mesures, références d’évaluation dans le mapping, pas décompte d’admissions/guérisons/personnes uniques déduit d’un lot. |

Les risques maternels sont une observation synthétique du professionnel. Le logiciel ne stocke pas les neuf réponses de santé mentale de l’annexe, ne calcule pas de score psychiatrique et ne crée pas un second dossier patient distant. Les conditions non nutritionnelles urgentes doivent être évaluées même si les Z-scores paraissent rassurants.

## Couverture complète des chapitres

| Pages PDF | Partie examinée | Suite pour ce produit |
|---|---|---|
| 1–14 | Présentation, préambule, définitions, sommaires | Provenance et vocabulaire ; aucune homologation déduite du préambule. |
| 15–28 | Organisation, communauté, acteurs, triage | Critères utiles et observations ; mobilisation, visites à domicile et offre de soins non automatisées. |
| 29–44 | Prévention, ANJE, micronutriments, WASH, sécurité alimentaire | Contexte du guide ; pas de prestation préventive déclarée réalisée. |
| 45–70 | MAMI et alimentation thérapeutique du nourrisson | Évaluation bornée ci-dessus ; TSS, préparation des laits, posologies et suivi thérapeutique restent professionnels. |
| 71–82 | MAM/CRENAM, FEFA, risques, suivi | Facteurs de risque et seuils ; ni ration personnalisée ni décision de sortie. |
| 83–96 | CRENAS | Test observé, risques, discussion clinique ; médicaments et gestion des admissions non automatisés. |
| 97–138 | CRENI, complications, stabilisation, transition | Urgence et limites ; pas de diagnostic de choc/déshydratation, perfusion, dose, prescription ou transfert autonome. |
| 139–150 | Situations particulières et autres populations | Renvoi à une évaluation adaptée ; pas de classification nationale adulte/FEFA inventée. |
| 151–159 | Soutien psychosocial et développement | Pas de score développemental ni d’intervention revendiqués à partir du calcul de croissance. |
| 160–173 | Monitoring, registres, performances et information | Différencier visites et bénéficiaires ; pas d’indicateurs de programme inventés. |

## Couverture des 28 annexes

| Annexe | Pages PDF | Examen et limite |
|---|---|---|
| 1 — Anthropométrie | 174–181 | Techniques et position examinées ; provenance LMS existante conservée. |
| 2 — Dépistage | 182 | Fiche de comptage examinée ; pas un fichier de bénéficiaires uniques. |
| 3 — MAMI | 183–193 | Dépistage, matrice de risque et santé maternelle ; observations bornées, pas automatisation intégrale du questionnaire. |
| 4 — Suivi mère–nourrisson | 194–201 | Fiches garçons/filles ; ni conclusion de récupération ni programme de soins automatique. |
| 5 — Fiches MAMI | 202–208 | Répétitions/reformatages examinés ; ne pas compter des visites supplémentaires. |
| 6 — PCIME | 209–213 | Examen/formulaire ; pas un moteur complet PCIME. |
| 7 — Tables poids/taille | 214–219 | Tables arrondies, entête longueur persistant ; ne remplacent pas les LMS ni leurs domaines. |
| 8 et 9 — IMC/âge garçons et filles | 220 | Courbes examinées ; calcul OMS 2007 conservé séparément. |
| 10 — IMC adultes | 221–222 | Tableau examiné, pas d’ouverture d’un module adulte. |
| 11 — TETU | 222–226 | Tri/soins/surveillance ; ne sont pas des actions réalisées par l’application. |
| 12 — ANJE | 226–228 | Fiche d’alimentation examinée ; observation synthétique uniquement. |
| 13 — Sonde | 229 | Acte professionnel, non automatisé. |
| 14 — Cathéter | 230 | Risques/acte professionnel, non automatisé. |
| 15 — Suivi intensif | 231–235 | Feuilles de poids, constantes et alimentation ; pas de surveillance hospitalière revendiquée. |
| 16 — Préparation des laits | 236–237 | Conditionnements examinés ; aucune dose calculée. |
| 17 — Recettes et aliments | 237–245 | Préparations et sécurité examinées ; pas de prescription de ration. |
| 18 — Médicaments/vaccins | 246–255 | Tableaux lus et contrôlés visuellement ; incohérences ci-dessous, aucune posologie encodée. |
| 19 — Équipements/approvisionnement | 255–261 | Listes examinées ; pas de stock/service déclaré disponible. |
| 20 — Prises sur 24 h | 261 | Fiche examinée ; distincte d’une mesure de croissance. |
| 21 — Préparation quotidienne | 262 | Fiche examinée ; pas de calcul automatique de production. |
| 22 — Référence/contre-référence | 263–264 | Flux professionnel examiné ; aucun transfert réel envoyé par le logiciel. |
| 23 — Groupes de soutien ANJE | 265–266 | Activité humaine ; pas de participation déduite d’un résultat. |
| 24 — Tuberculose | 267 | Algorithme image examiné ; pas de diagnostic TB. |
| 25 — Développement | 268 | Grille image examinée ; pas de bilan de développement automatique. |
| 26 — Jouets | 269 | Image examinée ; partie inférieure tronquée dans la copie, aucun contenu manquant inventé. |
| 27 — Contexte à haut risque | 270 | Contexte confirmé à renseigner, jamais calculé depuis un petit lot. **Ce n’est pas l’annexe de protocole simplifié de 2023.** |
| 28 — Atelier de validation et fin du livre | 271–274 | Liste, photos et quatrième de couverture examinées ; coordonnées et photographies non publiées dans le dépôt. |

## Contradictions, limites et choix conservateurs

Cette liste décrit des constats dans **la copie reçue**, pas un erratum ministériel. Les règles publiques indiquent leur décision ; aucune attente de rendez-vous ne bloque la poursuite des tâches techniques sûres.

| Pages PDF | Constat | Décision |
|---|---|---|
| 49, 54–55 | Liste MAMI avec « absence de danger OU », puis arbre clinique plus précis | Ne jamais admettre un nourrisson uniquement parce qu’il n’a pas de signe de danger. |
| 50 / 191 | P/T dans le corps du texte, ligne P/T sautée dans l’annexe MAMI | Retenir WAZ/PB et observations pour cette aide ; suspendre le critère WHZ MAMI, conserver son résultat de croissance séparé. |
| 71 | Inégalité PB « sans risque » contradictoire | Pas de résultat « sans risque » ni seuil complémentaire inventé. |
| 53–55, 62, 70, 95, 138 | Critères/durées de suivi/sortie différents selon circuits ; jours et visites distincts | Ne pas dériver guérison, sortie ou admission depuis des courbes seules. |
| 58 / 60 | Réduction de supplément d’un tiers ou de moitié selon passage | Aucune quantité thérapeutique calculée. |
| 75 et autres renvois | Numéros d’annexes anciens/non concordants, notamment haut risque | Utiliser le titre et les pages réelles dans ce guide, sans réécrire la source. |
| 81–82 | Seuil de non-réponse 10 % / 15 % selon tableau/texte | Pas de seuil de performance automatique. |
| 88 / 127 / 246 | Colonne comprimés d’amoxicilline 250 mg non concordante avec les mg indiqués et d’autres tableaux | Aucune dose ou conversion thérapeutique ; pas de sélection silencieuse d’un tableau. |
| 120 / 129 | Stabilisation ≤ une semaine / pas de durée limite | Pas de sortie déclenchée par un compteur. |
| 126–127, 247, 253 | Unités/plages de médicaments divergentes ou ambiguës | Aucune prescription. |
| 127, 129, 232, 255 | Calendrier/condition de vaccination ou vitamine A différents selon sections | Aucun rappel thérapeutique personnalisé depuis ces passages. |
| 144, 150 | Inégalités et limites d’âge/sorties des populations particulières différentes | Domaine national adulte/adolescent non automatisé. |
| 164, 167 | Multiplication par 100 dans la durée moyenne et formule de gain pondéral typographiquement ambiguë | Ne pas encoder ces formules de programme. |
| 177–181, 214–219 | Repère pratique 87 cm versus âge/position ; exemple 6,5 puis 6,8 kg ; table « longueur » prolongée jusqu’à 120 cm | Garder les données LMS officielles, la position réelle et les corrections documentées, sans recopier ces approximations. |
| 185, 269 | Légende débordante et image tronquée | Ne pas reconstituer une information absente à partir d’une supposition. |
| 243 et autres tables | Conditionnement ATPE 96 g / 92 g selon passage | Pas de conversion automatique sachets/quantités. |

Pour le contexte global, voir les [recommandations OMS 2023](https://www.who.int/publications/i/item/9789240082830). Leur recommandation C1b sur le PB MAM ne résout pas silencieusement la coquille nationale. Le [guide opérationnel OMS/UNICEF de septembre 2026](https://www.who.int/publications/i/item/9789240122840) est une source complémentaire identifiée ; sa lecture exhaustive et son intégration ne sont **pas** revendiquées par ce lot PCIMA 2025.

## Vérification reproductible et revue restante

`node --test tools/public-tests/pcima-2025.test.cjs` couvre les bornes, l’inconnu, les risques, la conservation/import, les exports, les langues et le chargement hors réseau du module. `npm test` conserve aussi les tests 2023 et les cas WHO v1. Les comparaisons numériques des références restent distinctes de l’aide à l’orientation.

Revue métier encore utile : confirmation de l’édition appliquée dans le service, lecture des messages, résolution autorisée des ambiguïtés de source et essais sur situations fictives complètes. La lecture intégrale et des tests logiciels réussis **ne sont ni une validation clinique, ni un essai physique sur téléphone, ni une homologation**. L’indisponibilité du relecteur n’est pas masquée ; les branches ambiguës restent bornées plutôt que présentées comme décidées.
