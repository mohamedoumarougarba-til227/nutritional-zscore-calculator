# Méthode et périmètre actuels

## Profil américain explicite — sources 5.9.0 / moteur 4.5.0

Réglages propose OMS 2006/2007 ou OMS avant deux ans puis CDC 2000/IMC étendu 2022. Ce choix est conservé par visite et modifiable explicitement dans le formulaire ; la préférence seule ne réécrit pas les travaux existants. Les imports peuvent indiquer `growthProfile` (`who`/`us`). CDC couvre 24 à moins de 240 mois sans poids/taille. Catégories, courbes et résumés sont séparés des références OMS ; âge déclaré, âge utilisé et méthode figurent dans les sorties. Voir [méthode CDC](CDC.md).

Contrôles numériques, modèles de sortie et parcours navigateur datés sont distingués dans la [matrice manuelle](../maintenance/VALIDATION_MANUELLE.md). Les observations décrites n'établissent ni validation clinique, ni accessibilité complète ou impression papier. La version publiée est identifiée par son tag, son SHA et son manifeste ; elle peut différer du checkout de travail.


CURRENT — sources 5.9.0, moteur combiné 4.5.0. Cette page explique le calcul ; ce n’est pas un protocole de traitement.

## Références et domaines

| Référence | Indicateurs | Domaine des nouveaux calculs |
|---|---|---|
| OMS Child Growth Standards | Poids/âge, longueur-taille/âge, poids/longueur-taille, IMC/âge | Avant 60 mois moyens ; poids/longueur de 45 à 110 cm, poids/taille de 65 à 120 cm après harmonisation |
| OMS Reference 2007 | Taille/âge, IMC/âge ; poids/âge | De 60 à moins de 229 mois moyens ; poids/âge seulement avant 121 mois ; aucun poids/taille extrapolé |
| OMS, mesures complémentaires facultatives | Périmètre crânien/âge, PB/âge, plis tricipital/âge et sous-scapulaire/âge | Avant 60 mois ; périmètre crânien dès la naissance ; PB et plis dès 91 jours |
| Profil américain, CDC 2000 / IMC étendu 2022 | Poids/âge, taille/âge, IMC/âge ; aucun poids/taille | De 24 à moins de 240 mois ; OMS avant 24 mois |

Sources épinglées : [Anthro `b776d8a12b1c97369c748b561159fd2ec4f4db58`](https://github.com/WorldHealthOrganization/anthro/tree/b776d8a12b1c97369c748b561159fd2ec4f4db58) et [AnthroPlus `7cfcdb39026e9a55de55732bc3cf14c82261bcf7`](https://github.com/WorldHealthOrganization/anthroplus/tree/7cfcdb39026e9a55de55732bc3cf14c82261bcf7). Les tables originales, conversions et manifestes SHA-256 sont distribués avec leurs notices GPL. Les quatre standards complémentaires ont été publiés séparément en [2007](https://www.who.int/publications/i/item/9789241547185) ; ils ne sont pas la référence OMS 2007 destinée aux enfants plus âgés.

## Âge, mesures et LMS

Les dates utilisent des jours UTC et sont vérifiées ; un âge en années/mois est signalé comme estimé. Un mois moyen OMS vaut 30,4375 jours. Le passage de référence suit cet âge moyen : une date anniversaire calendaire peut différer légèrement. Les tables quotidiennes OMS Child Growth Standards sont indexées au jour arrondi ; AnthroPlus utilise les paramètres LMS interpolés entre les mois publiés. Aucune extrapolation hors du domaine.

Le poids est saisi en grammes, la taille et le périmètre crânien en centimètres, le PB et les plis cutanés en millimètres. PB/âge convertit explicitement les millimètres en centimètres pour la table OMS. Les unités CSV non standard doivent être choisies dans l’assistant ; les mesures complémentaires conservent leurs unités affichées.

Pour L différent de zéro : `Z = ((mesure/M)^L − 1)/(L × S)` ; pour L nul : `Z = ln(mesure/M)/S`. Les indicateurs de poids, PB et plis utilisent l’extension linéaire publiée au-delà de ±3 Z ; taille/âge et périmètre crânien/âge n’utilisent pas cette extension. Les scores sont affichés à deux décimales. Les catégories utilisent le score avant arrondi ; les drapeaux suivent les règles de chaque indicateur sur le score arrondi. Un drapeau invite à vérifier la mesure ; ce n’est pas un diagnostic.

Avant 731 jours, une mesure debout est ajustée de +0,7 cm ; à partir de 731 jours, une longueur couchée est ajustée de −0,7 cm. Choix conservateur propre à l’application : avant neuf mois moyens, une mesure debout suspend les indicateurs dépendant de la taille ; ce choix est distingué des sorties du logiciel R OMS. Avec AnthroPlus, la taille doit être mesurée debout, sans correction automatique.

## Résultats suspendus et dépistage

Les œdèmes doivent être renseignés : l’inconnu n’est pas transformé en absence. Les œdèmes présents suspendent les indicateurs dépendant du poids. Un score hors domaine, une mesure absente, une position incompatible ou une mesure signalée ne deviennent jamais implicitement un résultat normal.

Le PB absolu et l’évaluation clinique sont séparés du PB/âge. Pour les 6 à moins de 60 mois moyens : PB strictement inférieur à 115 mm, puis de 115 à moins de 125 mm, avec combinaison des critères et observations disponibles selon l’aide OMS documentée. Le PB/âge et les autres indicateurs complémentaires affichent seulement une position par rapport à −2/+2 Z ; ils ne modifient pas ces seuils ni la synthèse clinique et ne posent pas de diagnostic.

Les centiles OMS utilisent le score avant arrondi, dans le domaine −3 à +3. Le profil CDC suit ses méthodes LMS/IMC étendu et la fonction normale décrites dans [CDC](CDC.md), avec centile indisponible s’il s’arrondit à 0 ou 100 ; la limite OMS −3/+3 ne lui est pas appliquée. `P 12,4` est une position dans la distribution de référence, pas une probabilité de maladie. Les valeurs manquantes, signalées ou issues d’une autre référence ne sont pas reliées artificiellement dans les courbes.

L’affichage à une décimale utilise `P < 0,1` pour un centile disponible inférieur à 0,1 et `P > 99,9` pour un centile supérieur à 99,9, afin de ne pas le présenter comme exactement 0 ou 100. Les bornes 0,1 et 99,9 s’affichent sans inégalité. C’est une convention de présentation commune aux résultats, à l’historique et aux PDF ; la valeur numérique conservée/exportée en CSV, sa disponibilité et les classifications du moteur ne changent pas.

Les résultats enregistrés conservent leur référence et version ; leur lecture, impression et export ne les recalculent pas. Les agrégats décrivent des fiches de mesure et non automatiquement des enfants uniques ou une population représentative. Voir [DHIS2 préparatoire](INTEROPERABILITE.md).

## Vérifier et interpréter

`npm test` couvre un socle public synthétique ; `npm run verify:public` compare les sorties numériques à des attentes conservées séparément. Les cas complémentaires utilisent une évaluation Python Decimal indépendante des tables TSV, explicitement distincte d’une exécution du paquet R OMS. La suite privée, la relecture métier et les essais physiques ont des portées différentes. Aucune certification OMS, gouvernementale ou clinique n’est revendiquée.

Le [profil américain OMS/CDC](CDC.md) et le [profil postnatal INTERGROWTH](INTERGROWTH.md) sont raccordés explicitement aux sources courantes ; INTERGROWTH conserve son PMA exact, ses équations et sa portée séparés. Le [relevé des autres références](REFERENTIELS_COMPLEMENTAIRES.md) conserve les recherches historiques ; elles ne sont pas toutes activées. Les décisions de soins, l’orientation locale et les traitements relèvent du professionnel et du protocole applicable.

## Saisie et observations manquantes — 5.9.0

Les unités sont explicites : kg × 1 000 → g et m × 100 → cm ; les résultats, courbes, PDF et CSV restent en g/cm. Un changement de sélecteur convertit la valeur déjà saisie. La virgule, le point et les chiffres décimaux arabes sont acceptés ; aucune détection automatique d’unité. Les mois seuls utilisent 30,4375 jours et le même arrondi au jour que le mode années/mois. Les mois décimaux restent un âge estimé ; avec CDC, les mois entiers ont le même décalage +0,5 que les années/mois, les mois fractionnaires sont utilisés sans ce décalage (le champ technique agePrecision=exact désigne cette indexation, pas une date de naissance connue).

Sans position renseignée, la longueur couchée avant 731 jours et la taille debout ensuite sont présumées pour OMS 2006, sans correction de 0,7 cm : [guide officiel WHO Anthro Survey Analyser, mesure manquante](https://www.who.int/docs/default-source/child-growth/child-growth-standards/anthro-survey-analyser-quickguide.pdf). Pour OMS 2007 et CDC (dès deux ans), la taille debout est présumée sans correction ; cette hypothèse est affichée et ne remplace pas la position réellement mesurée. La valeur du champ reste vide dans le dossier et les exports. Une position explicitement renseignée garde ses corrections/politiques existantes. La synthèse ne conclut pas à l’absence de critère sur une position inconnue. INTERGROWTH n’applique pas cette présomption : la longueur seule est suspendue si sa position n’est pas confirmée, les mesures indépendantes disponibles restent calculables.

Des œdèmes inconnus restent inconnus dans le dossier : les scores liés au poids sont calculés avec un avertissement conditionnel, selon la convention numérique du [logiciel OMS anthro](https://github.com/WorldHealthOrganization/anthro/blob/master/man/anthro_zscores.Rd). Leur interprétation nécessite de confirmer l’absence d’œdèmes. Aucune observation négative n’est enregistrée automatiquement ; la synthèse conserve les observations manquantes et ne conclut pas à une absence de critère. Des œdèmes déclarés présents suspendent les scores liés au poids. INTERGROWTH conserve sa règle distincte de suspension si les œdèmes sont inconnus. Les domaines, coefficients LMS, seuils et résultats antérieurs avec observations complètes sont inchangés. Les comparaisons numériques automatisées, les contrôles navigateur et la validation physique/métier sont des preuves distinctes.

Le CSV ajoute en fin de ligne les colonnes warnings, measurement_position_used, measurement_position_assumed et age_estimated. Elles distinguent observation brute, convention utilisée et âge estimé sans modifier l’ordre des colonnes précédentes. Les codes d’avertissement restent techniques ; les messages localisés sont dans l’interface et les PDF. Le format de sauvegarde n’est pas remplacé par ce CSV.
