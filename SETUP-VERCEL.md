# Installation Vercel — Kiz Memory V4.4.1

## Prérequis

- Projet Vercel connecté à `kiz-memory-blob`.
- Blob en accès **Private**.
- OIDC actif sur la connexion Storage (`BLOB_STORE_ID` disponible).
- `BLOB_WEBHOOK_PUBLIC_KEY` disponible via la connexion Blob.
- Aucun `BLOB_READ_WRITE_TOKEN` permanent requis.

## Déploiement

1. Remplacer le contenu du projet par le contenu du ZIP V4.4.1.
2. Déployer / Redeploy sur Vercel.
3. Vérifier que l'accueil affiche `V4.4.1`.
4. Tester d'abord une vidéo courte puis une vidéo longue.

## Comportement attendu

Une vidéo source doit produire **plusieurs Memories séparées**, pas un seul montage assemblé. Sur une vidéo assez longue, les clips utilisent notamment des durées cibles de 17 s, 19 s, 25 s et 30 s.

Chaque carte résultat possède ses propres boutons :

- REGARDER ;
- PARTAGER ;
- ENREGISTRER.

## Sandbox

`SANDBOX_SNAPSHOT_ID` est facultatif. S'il est absent ou invalide, Kiz Memory utilise un Sandbox propre et prépare FFmpeg via le système lorsque nécessaire.

## Plan Hobby

`vercel.json` conserve `maxDuration: 300` pour `api/prepare.js` et `api/render.js`. Aucun service payant supplémentaire n'est ajouté par V4.4.1.


## V4.4.2 — vidéos > 200 Mo

- plafond source : 900 Mo ;
- upload multipart direct vers Blob privé ;
- proxy d’analyse à 2 fps ;
- 4 vCPU pour préparation et rendu ;
- la source est supprimée avant le stockage des Memories finales afin de préserver le quota Blob Hobby.
- test local validé avec une source réelle de 225 Mo et une source concaténée de 447 Mo.


## V4.4.3
Aucune nouvelle variable d'environnement. Le plafond reste 900 Mio. Pour les sources >= 300 Mio, le mode d'analyse allégé est automatique.
