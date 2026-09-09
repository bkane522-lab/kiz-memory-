# Installation Vercel — Kiz Memory V4.2.7

## Configuration requise

- Vercel Hobby convient pour les tests.
- Un Blob privé `kiz-memory-blob` connecté au même projet.
- Connexion OIDC active.
- Aucun `BLOB_READ_WRITE_TOKEN` permanent requis par cette version.

## À ne pas faire

- Ne pas cliquer sur `Revoke Token` pour résoudre l’upload.
- Ne pas recréer le Blob.
- Ne pas ajouter de carte bancaire uniquement pour ce correctif.

## Déploiement

1. Remplacer les fichiers du projet par le contenu du ZIP V4.2.7.
2. Déployer sur Vercel.
3. Vérifier que l’accueil affiche `V4.2.7`.
4. Avant un gros test, supprimer les anciens fichiers inutiles dans Storage > Manage Blobs > `kiz-memory/` afin de rester sous le quota Hobby.
