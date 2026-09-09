# Installation Vercel — Kiz Memory V4.3.2

## Prérequis déjà en place

- Projet Vercel connecté à `kiz-memory-blob`.
- Blob en accès **Private**.
- Connexion OIDC du projet active (`BLOB_STORE_ID` visible dans la connexion Storage).
- Aucun `BLOB_READ_WRITE_TOKEN` permanent n'est nécessaire pour cette version.

## Déploiement

1. Remplacer les fichiers du projet par le contenu du ZIP V4.3.2.
2. Déployer / Redeploy sur Vercel.
3. Vérifier que l'accueil affiche `V4.3.2`.
4. Tester d'abord avec une vidéo courte, puis avec une vidéo longue.

## Test de reprise d'upload

1. Choisir une vidéo assez grosse.
2. Laisser quelques parties être envoyées.
3. Interrompre volontairement la connexion ou recharger l'application.
4. Revenir sur Kiz Memory et sélectionner **exactement le même fichier**.
5. La progression doit repartir en tenant compte des parties déjà enregistrées si la session multipart est encore valide.

## Si une session est expirée

Kiz Memory efface l'état local de cette session et demande de sélectionner à nouveau la vidéo pour repartir avec une nouvelle session propre.

## Snapshot FFmpeg

`SANDBOX_SNAPSHOT_ID` reste facultatif. Sans snapshot, le Sandbox télécharge la distribution FFmpeg statique au démarrage, ce qui ajoute du temps. Un snapshot valide améliore la vitesse mais n'est pas nécessaire au fonctionnement de base.

## Vercel Hobby

`vercel.json` utilise `maxDuration: 300` pour `api/prepare.js` et `api/render.js`, afin de rester dans la limite du plan Hobby avec Fluid Compute. Ne montez pas cette valeur au-dessus de 300 sur le plan gratuit.


### V4.3.2
Aucun réglage payant n’est requis. Si `SANDBOX_SNAPSHOT_ID` existe mais est ancien, vous pouvez le supprimer ; la V4.3.2 sait aussi retomber automatiquement sur un Sandbox propre.
