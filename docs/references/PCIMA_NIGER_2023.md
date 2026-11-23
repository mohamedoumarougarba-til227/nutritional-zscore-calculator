# PCIMA Niger janvier 2023 : couverture et limites de l’adaptation

REFERENCE CONSERVÉE — cadre janvier 2023 préparé le 23 novembre 2026 dans le lot 5.10.0, puis inclus aux côtés du cadre 2025 dans les sources 5.11.0 / moteur combiné 4.7.0. Cette page décrit une aide limitée au dépistage, pas une mise en œuvre intégrale de la prise en charge PCIMA ni une validation clinique. Le cadre 2023 reste identifié dans les anciennes visites ; voir aussi [PCIMA 2025](PCIMA_NIGER_2025.md).

## Source et méthode de lecture

Document de 215 pages portant la couverture « Janvier 2023 », Direction de la Nutrition du Niger. Copie consultée : SHA-256 `91f5fffc055e99bf9de2dbda16e3dad6c6252d255912d4b6252710bc8edf48fc`, 5 725 815 octets. Les numéros ci-dessous sont les pages du PDF, concordant avec les pages imprimées des tableaux cités.

- [Notice PCIMA Niger 2023 sur ReliefWeb](https://reliefweb.int/report/niger/protocole-national-de-prise-en-charge-integree-de-la-malnutrition-aigue-janvier-2023).
- [Copie complète consultée](https://uploads.geobingan.info/attachment/d0afab0379e9415093a4aa0e36ed9817.pdf) : hébergement tiers, pas une preuve de l’édition actuellement en vigueur.
- [Epicentre/MSF, étude à Maradi](https://epicentre.msf.org/essai-randomise-de-non-inferiorite-evaluant-le-garin-yara-une-farine-enrichie-produite-localement), publiée le 1er octobre et actualisée le 9 octobre 2026 : cite le ministère, le protocole 2023 et la notice ReliefWeb. Ce recoupement n’authentifie pas une éventuelle édition ultérieure.

Lecture du texte des 215 pages, complétée par inspection des pages numérisées sans texte exploitable et des schémas/tableaux déterminants. Les contrôles visuels comprennent notamment les pages 3, 20–21, 33, 39, 43, 56, 62, 75, 92, 94, 99, 111, 123, 129, 134, 143–144, 167–169, 197–199 et 205. L’extraction seule ne suffit pas à valider la disposition d’un tableau. Les captures de contrôle et le document restent privés ; les tableaux, photographies et listes de participants ne sont pas redistribués ici.

La lecture documentaire n’est ni une relecture par un spécialiste, ni une vérification de l’actualité de chaque prescription, ni un essai terrain. Une différence peut être une limite du produit, une ambiguïté du document, une donnée à fournir par le soignant ou un défaut logiciel : ces situations sont distinguées ci-dessous.

## Ce que le logiciel applique

Le cadre de dépistage est choisi **par visite**, dans « PB et évaluation clinique ». Le cadre général OMS reste celui des anciennes visites et le défaut des nouvelles. Le choix `niger2023` exige le profil de croissance OMS ; ni le pays de la langue, ni un PB renseigné ne le sélectionnent automatiquement.

L’aide nationale porte l’identifiant `Niger-PCIMA-2023-screening-v1`, version de structure 1. Les scores LMS, leurs domaines, la correction longueur/taille et les références scientifiques restent ceux du moteur de croissance ; aucun score n’est recalculé par le module PCIMA.

| Sujet | Pages | Comportement et limite |
|---|---|---|
| Critères des 6 à moins de 60 mois | 33, 43, 56 | PB < 115 mm sévère ; 115 ≤ PB < 125 mm modéré ; P/T exploitable < −3 sévère, −3 ≤ P/T < −2 modéré ; œdèmes bilatéraux prioritaires. Combinaison par OU, sans utiliser un score arrondi ou signalé. « Critère présent » ne constitue pas une admission. |
| Appétit | 43–45 | Dans ce cadre, `good` signifie test réussi, appétit **modéré ou bon**. Ni une réponse du parent ni une quantité de sachet supposée ne remplacent le test professionnel. |
| Complications, danger, œdèmes +++ | 56, 87–106 | Observations explicites ; le logiciel invite à une évaluation adaptée/hospitalière. Il ne diagnostique pas une complication à partir du seul poids. |
| Forme mixte kwashiorkor-marasme | 56 | Nouvelle observation du soignant ; jamais inférée à partir d’un poids œdémateux. Une réponse positive avec œdèmes déclarés absents est rejetée comme contradictoire. |
| Nourrissons < 6 mois et enfants ≥ 6 mois de poids < 3 kg | 75–86 | Circuit d’évaluation particulier, y compris alimentation, allaitement, perte de poids, absence prolongée de gain et problème médical/social. Aucun seuil PB des 6–59 mois n’est appliqué dans ce circuit. Un faible poids de naissance seul n’est pas étiqueté MAS. |
| Situation particulière après six mois | 21, 38, 52–53 | Les observations de difficultés alimentaires, perte de poids, absence prolongée de gain et problème médical/social empêchent une simple proposition de revue ambulatoire sans évaluation complémentaire. Aucune durée ou perte chiffrée n’est inventée si elle n’a pas été relevée. |
| Position non renseignée | 128–135 | Le calcul de croissance conditionnel reste possible, avec son avertissement ; son P/T ne peut établir un critère national tant que la position réelle n’est pas précisée. Le PB sévère ou les œdèmes restent visibles. |
| Données incomplètes | Ensemble | Inconnu n’est jamais converti en « non ». Une liste des observations manquantes accompagne le résultat. PB ≥ 125 n’est pas une preuve de bonne santé. |
| Ambulatoire | 43–56 | Discussion d’une revue CRENAS seulement après observations explicites complètes, test réussi et absence de complication/situation particulière renseignée. Ni admission, ni accessibilité réelle du centre, ni consentement ne sont déduits. |
| ≥ 60 mois | 110–116 | Le cadre pédiatrique intégré indique sa limite ; les scores OMS 2007 disponibles restent affichés séparément. Pas d’extension des seuils PB des jeunes enfants aux adolescents/adultes/FEFA. |
| Provenance et conservation | Produit | Le cadre et les observations sont conservés avec la visite. Import : vérification de cohérence, pas certification médicale. CSV : nouvelles colonnes ajoutées en fin, colonnes antérieures conservées. PDF : cadre, observations et limites dans la langue du rapport. |

## Couverture de l’ensemble du document

« Hors périmètre » signifie **examiné mais non automatisé**, et non une exigence satisfaite par le calculateur.

| Partie | Pages | État pour ce produit |
|---|---|---|
| Couverture, préambule, sigles, sommaires | 1–14 | Provenance, limites et interdiction d’activer par défaut le protocole simplifié prises en compte. |
| I — Communauté, dépistage, WASH, urgence, acteurs | 15–32 | Seuils et observations pertinents couverts ; mobilisation, visites à domicile, approvisionnement, formation et autorisations restent des activités humaines. Pas de déclaration d’urgence à partir d’un lot. |
| II — CRENAM | 33–42 | Critères de dépistage couverts. Rations, traitement, suivi de programme, récupération après deux visites, sorties et performance ne sont pas automatisés. |
| III — CRENAS | 43–55 | Critères, appétit et besoins de revue couverts. Doses, distribution, transfert effectif, échec au traitement et sortie ne sont pas décidés par le logiciel. |
| IV — CRENI | 56–74 | Situations nécessitant une évaluation spécialisée couvertes. Phases hospitalières, médicaments, solutés, surveillance et décisions de transfert/sortie hors périmètre. |
| V — Nourrissons et enfants < 3 kg | 75–86 | Circuit spécifique et observations de risque ajoutés. TSS, préparation du lait, doses, transition et décharge restent au professionnel. |
| VI — Complications | 87–106 | Avertissements et constat de problème aigu ; aucune prescription ni diagnostic automatisé de déshydratation, choc, anémie, hypoglycémie ou infection. |
| VII — Autres groupes vulnérables | 107–116 | Limite explicite. Pas de diagnostic de TB/VIH/drépanocytose/IMOC ni de traitement ou adaptation adulte inventés. |
| VIII — Psychosocial et développement | 117–119 | À examiner par l’équipe ; les courbes seules n’évaluent pas le développement ni l’interaction parent-enfant. Aucun score développemental ajouté. |
| IX — Programme, indicateurs, supervision, enquêtes | 120–127 | Historique de mesures ≠ registre d’admissions/sorties. Pas de taux de guérison, abandon, décès ou couverture dérivé des seules mesures. L’export agrégé DHIS2 demeure préparatoire. |

### Les 28 annexes

| Annexe | Pages | Examen et traitement retenu |
|---|---|---|
| 1 — Anthropométrie | 128–135 | Œdèmes, PB, pesée, position et lecture des tables examinés. Saisie explicite et limites ; pas d’arrondi manuel substitué au LMS. |
| 2 — Fiche de dépistage | 136 | Catégories PB examinées ; pas d’assimilation automatique mesure/enfant unique. |
| 3 — Carte OMS P/T | 137–142 | Contrôle documentaire des colonnes et domaines ; tables arrondies non substituées aux données OMS numériques épinglées. |
| 4 — IMC garçons | 143 | Courbe examinée visuellement ; OMS 2007 déjà distinct d’OMS 2006. Pas de numérisation depuis l’image. |
| 5 — IMC filles | 144 | Même séparation des références, sexe préservé. |
| 6 — IMC adultes | 145–146 | Hors population de croissance couverte ; pas d’extension automatique des seuils adultes. |
| 7 — Surveillance TETU | 147–149 | Gestes, constantes et examens à renseigner par l’équipe ; le calculateur ne remplace pas cette surveillance. |
| 8 — ANJE | 150–152 | Questions d’alimentation et d’allaitement examinées. Observations synthétiques ajoutées ; pas de faux bilan ANJE exhaustif. |
| 9 — Sonde nasogastrique | 153–154 | Geste technique hors périmètre. Aucune instruction instrumentale générée par le logiciel. |
| 10 — Cathéters | 155 | Risques et compétences nécessaires examinés ; hors périmètre logiciel. |
| 11 — Histoire/examen clinique | 156–159 | Confirme que les mensurations seules ne remplacent ni interrogatoire ni examen. Pas de fiche clinique complète revendiquée. |
| 12 — Laits conditionnés | 160–161 | Préparation et conservation hors périmètre. |
| 13 — Recettes et composition | 162–166 | Examinées ; aucune recette, ration ou analyse de conformité des produits automatisée. |
| 14 a/b/c — Laits nourrissons | 167–169 | Trois tableaux images examinés ; aucune table de doses importée ou interpolée. |
| 15 — Rations enfants | 170 | Hors périmètre de prescription/approvisionnement. |
| 16 — Rations FEFA | 170–171 | Hors périmètre de la population et des prescriptions du calculateur. |
| 17 — Médicaments et vaccins | 172–182 | Examinés ; contradictions et besoin de référentiels spécifiques empêchent une transcription automatique. |
| 18 — Denrées/équipements | 183–187 | Inventaire et logistique hors périmètre ; pas de certification d’équipement. |
| 19 — Apports sur 24 h | 188 | Dossier de soins, distinct de l’historique anthropométrique. |
| 20 — Préparation journalière | 188–189 | Planification des repas hors périmètre. |
| 21 — F75 | 189–193 | Table de volumes hors périmètre ; pas de calcul de dose. |
| 22 — Référence/contre-référence | 194 | Un PDF de résultats n’est pas cette fiche officielle signée. Identité, examen, traitements et destination restent à compléter par le soignant. |
| 23 — Groupes ANJE | 195–196 | Confidentialité, soutien et intervention humaine ; pas de programme de groupe simulé. |
| 24 — TB | 196–197 | Algorithme image examiné ; pas de diagnostic TB calculé par l’application. |
| 25 — Développement | 197–198 | Grille image examinée ; pas de certification du développement à partir de la taille ou du poids. |
| 26 — Jouets | 199 | Exemples examinés ; pas de reproduction ni de recommandation automatique de fabrication. |
| 27 — Simplifié | 200–210 | **Non activé** : préambule p. 3 et mesures administratives p. 209 exigent un accord ministériel préalable adapté au contexte. |
| 28 — Participants | 210–215 | Provenance historique ; noms/téléphones non recopiés ni publiés dans ce dépôt. |

## Points connus et choix retenus

Ces constats concernent la copie examinée, pas une correction officielle du ministère. Ne pas les « réparer » dans le PDF source. Décision du projet du 23 novembre 2026 : poursuivre avec les moteurs OMS et autres profils déjà disponibles et le PCIMA 2023, sans attendre le rendez-vous d’un relecteur. Les désaccords sont exposés avec le choix logiciel retenu ; ils pourront être amendés sur source ou retour reproductible. Ils ne constituent pas une liste d’approbations à obtenir avant de poursuivre ce périmètre limité.

| Pages | Constat | Décision logicielle |
|---|---|---|
| 20 contre 33 | Schéma MAM combinant PB et P/T par ET, tableau I par OU. | Appui sur le tableau formel I, cohérent avec l’exposé d’Epicentre ; cas de discordance testés et distinction documentée. |
| 41, 54, 73, 82–86 | Critères de sortie différents selon CRENAM, CRENAS, CRENI et nourrissons ; deux visites et parfois deux jours ; modalités d’association des critères différentes. | Aucun statut « guéri » automatique ni règle de sortie unique. |
| 44–45 | Présentations distinctes du test d’appétit ; certaines plages par méthode ne se raccordent pas sans ambiguïté. | Enregistrer le résultat du test pratiqué par le professionnel ; pas de réussite calculée depuis une ration supposée. |
| 47 | Certaines quantités ATPE quotidiennes et hebdomadaires ne se déduisent pas exactement l’une de l’autre. | Pas de prescription/commande calculée. |
| 62 et 173 | Texte, tableau et note de gentamicine ne donnent pas une posologie unique cohérente. | Pas de dose générée ; confirmation spécialisée indispensable avant tout éventuel module de prescription. |
| 111 | La borne −3 d’IMC/âge apparaît avec des opérateurs différents suivant les lignes. | Aucune nouvelle classification nationale des adolescents à partir de cette ambiguïté. |
| 123 | La formule imprimée de durée moyenne de séjour comporte un multiplicateur 100. | Pas de transposition de cette formule en indicateur du produit. |
| 131–135 | Seuil pratique de position à 87 cm ; illustration p. 134 mentionnant 24 mois ; lecture de tables arrondies décrite séparément du LMS. L’exemple p. 135 donne aussi deux poids différents. | Position réelle enregistrée ; calcul OMS existant conservé, différence méthodologique exposée. |
| 205–207 | Inégalité PB incohérente dans le paragraphe p. 205 et différences avec le tableau ; critères de suivi simplifié distincts du protocole standard. | Simplifié non activé ; aucune fusion des deux protocoles. |

## Vérification et travail restant

Les tests publics synthétiques `pcima.test.cjs` portent sur le périmètre réellement intégré : bornes, priorité des critères, cas particuliers, inconnues, compatibilité des résultats OMS enregistrés, sauvegarde, CSV, modèle PDF et trois langues. Ils ne valident pas les actes, les médicaments, le terrain ou une édition nationale en vigueur.

Le développement et les essais du périmètre décrit continuent sans attendre un interlocuteur clinique. Les centres accessibles, les rôles et le test d’appétit réellement pratiqué restent des informations du service : le logiciel ne peut pas les connaître à partir des mensurations. L’édition 2023 reste la base choisie, sans être présentée comme la dernière édition officiellement en vigueur. Les retours passent par les formulaires FR/EN/AR ou les issues, avec version, scénario, mesures fictives et source attendue ; ne jamais joindre de dossier patient. Toute correction de règle doit garder sa source, son cas reproductible et son test. Les retours de testeurs ne constituent pas à eux seuls une validation clinique.

Les besoins de dossier de soins, registre de programme, référence officielle et pharmacie seraient des lots distincts ; ils ne sont pas cachés derrière une mention de conformité globale. Les médicaments et les décisions d’admission/sortie ne font pas partie de ce lot de calcul/dépistage.

Voir [évaluation nutritionnelle](EVALUATION_NUTRITIONNELLE.md), [méthode numérique](METHODE.md), [références nationales](REFERENCES_NATIONALES.md) et [validation manuelle](../maintenance/VALIDATION_MANUELLE.md).
