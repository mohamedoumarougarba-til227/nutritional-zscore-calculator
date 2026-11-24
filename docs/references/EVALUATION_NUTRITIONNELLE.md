# PB et aide à l’orientation

Sources de l’interface 5.11.0 ; moteur combiné 4.7.0. Le cadre général conserve les règles `WHO-wasting-2023-B1-B2`, version 1.

Le cadre facultatif **PCIMA Niger janvier 2023** est désormais proposé par visite avec le profil de croissance OMS. Il porte l’identifiant `Niger-PCIMA-2023-screening-v1` et ajoute les observations d’alimentation, allaitement, trajectoire pondérale, problème médical/social et forme mixte constatée. Les nourrissons de moins de six mois et les enfants de moins de 3 kg ont un circuit d’évaluation particulier ; les seuils PB des 6–59 mois ne leur sont pas appliqués dans ce cadre. L’aide reste limitée au dépistage et à la discussion d’orientation : ni traitement, ni admission, ni guérison automatiques. Voir la [matrice complète des chapitres et des 28 annexes](PCIMA_NIGER_2023.md), y compris les divergences et exclusions.

Les paragraphes suivants décrivent le cadre général OMS. Les anciennes visites conservent ce cadre : sélectionner PCIMA pour une nouvelle visite ne modifie aucun résultat antérieur. L’édition nationale actuellement applicable et les amendements ultérieurs restent à confirmer par une autorité ou un professionnel compétent.

Les courbes de croissance OMS 2006/2007 sont distinctes des recommandations de soins. Le PB est facultatif, en millimètres. Pour les 6 à moins de 60 mois moyens OMS : moins de 115 mm fournit un critère sévère ; 115 à moins de 125 un critère modéré. PB ≥ 125 ne suffit pas à exclure les autres critères. Hors de ce groupe, la mesure reste enregistrée sans ces seuils. Les bornes de saisie 50–400 mm repèrent notamment les erreurs d’unité ; ce ne sont pas des seuils cliniques.

Le critère sévère combine PB, P/T exploitable avant arrondi et œdèmes bilatéraux prenant le godet, évalués par le soignant. Un P/T signalé comme biologiquement improbable n’est pas utilisé pour conclure. Les nouvelles réponses cliniques sont initialement non renseignées. Une inconnue ne devient jamais « non ».

Un signe de danger appelle une évaluation urgente. Avec un critère sévère, les critères OMS d’orientation hospitalière sont pris en compte. L’application ne décide pas d’une admission et ne prescrit pas. Une revue pour soins ambulatoires nécessite des réponses explicites et aucune évaluation approfondie restant à faire. Le soignant confirme le lieu de soins et organise leur continuité.

Les résultats sont versionnés et conservés dans les visites, lots, CSV et PDF. L’import vérifie leur cohérence sans remplacer les scores enregistrés ; il ne certifie pas leur exactitude médicale.

## Sources officielles

- [OMS, recommandations 2023](https://www.who.int/publications/i/item/9789240082830), B1/B2.
- [OMS, orientation hospitalière](https://www.who.int/tools/elena/interventions/sam-identification-inpatient).
- [OMS, dénutrition aiguë modérée](https://www.who.int/tools/elena/interventions/food-children-mam).
- [OMS/UNICEF, guide opérationnel, 17 septembre 2026](https://www.who.int/publications/i/item/9789240122840).

Le guide 2026 aide à mettre en œuvre les recommandations. Ses tableaux, illustrations et protocoles médicamenteux ne sont pas reproduits dans la distribution GPL. Aucun protocole national n’est déclaré appliqué sans identification de l’édition utilisée et rapprochement des règles.

## Apports locaux nécessaires

Protocole PCIMA applicable et pages utiles ; lieux de référence accessibles ; rôles autorisés ; examen et test d’appétit pratiqués ; suivi et compte rendu attendus. Les prescriptions, doses, admissions et sorties de programme ne sont pas automatisées sur une supposition de protocole. Les traductions médicales en langues locales nécessitent un traducteur et un relecteur compétents.

## Colonnes CSV des observations

`muac` : millimètres. `cannotDrink`, `vomitsEverything`, `convulsions`, `lethargy`, `acuteProblem` : `y` constat présent, `n` absent après examen, vide non renseigné. `appetite` : `good` test réussi, `poor` échoué, vide non effectué. `oedemaGrade` : `1`, `2`, `3` uniquement avec oedema=y. `furtherAssessment` : `n` aucune évaluation approfondie nécessaire selon le soignant ; `y` nécessaire et en attente ; `cleared` réalisée sans indication d’hospitalisation ; vide non renseigné. Ces réponses décrivent une évaluation professionnelle, pas une autoévaluation du parent.

## Document PCIMA de mars 2025 reçu

Le [cadre 2025](PCIMA_NIGER_2025.md), identifié séparément, ajoute les observations mère–nourrisson, le PB infantile <110 mm de 42 jours à moins de six mois avec âge exact, le poids/âge infantile et les risques MAM. Les ambiguïtés de la source suspendent les conclusions non justifiées, sans modifier les tables OMS ni les visites 2023. Le test d’appétit déclaré suit le contexte sélectionné.
