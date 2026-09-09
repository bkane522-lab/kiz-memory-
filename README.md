# Kiz Memory V4.2.7

## Correctif OIDC / gratuit

Cette version supprime la dépendance au mécanisme `@vercel/blob/client` qui cherchait un `BLOB_READ_WRITE_TOKEN`.

Le projet utilise désormais le schéma suivant :

1. le navigateur demande `/api/upload-url` ;
2. la fonction Vercel s’authentifie auprès de Blob avec l’OIDC du projet ;
3. elle génère une URL PUT signée, limitée à un seul chemin et expirant automatiquement ;
4. le téléphone envoie directement la vidéo vers le Blob privé ;
5. le pipeline existant reprend : proxy léger, analyse mouvement/corps/musique, FFmpeg, Memory finale.

Aucun token permanent `BLOB_READ_WRITE_TOKEN` n’est nécessaire pour cette V4.2.7.

## Limite produit actuelle

La V4.2.7 accepte jusqu’à 1 Go par vidéo. Pour rester dans le quota Hobby, supprimer les anciens fichiers de test du dossier `kiz-memory/` avant d’envoyer une nouvelle vidéo volumineuse.

## Confidentialité

Le Blob reste privé. Les URL d’upload sont temporaires et limitées à une seule opération PUT et à un chemin précis.

## Pipeline

Vidéo → upload privé signé → proxy léger → analyse réelle → sélection de passages → FFmpeg → MP4 final → nettoyage.
