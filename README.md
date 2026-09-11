# Kiz Memory V4.4.1 — Memories séparées

V4.4.1 conserve la base technique longue vidéo validée en V4.3.2, mais change le produit final : **Kiz Memory ne recolle plus les passages**.

## Parcours

Vidéo filmée ou choisie → analyse réelle → plusieurs clips séparés → regarder / partager / enregistrer.

## Résultat V4.4.1

Selon la durée de la vidéo source, Kiz Memory crée automatiquement de 1 à 5 Memories indépendantes. Les vidéos longues utilisent des durées cibles simples et déterministes comme **17 s, 19 s, 25 s et 30 s**. Les clips courts restent adaptés à la durée réellement disponible.

Chaque Memory :

- est un fichier MP4 séparé ;
- H.264 + AAC lorsque la source contient du son ;
- 1080 × 1920, 9:16 ;
- conserve le son original du passage ;
- peut être regardée, enregistrée ou partagée indépendamment ;
- n'est jamais concaténée avec une autre Memory.

## Analyse

La sélection reste fondée sur des mesures réelles : mouvement, variation, cadrage, énergie audio et MediaPipe Pose lorsque le modèle est disponible. Aucun score aléatoire n'est utilisé.

## Vidéos longues

- upload direct multipart vers Vercel Blob privé avec `uploadPresigned` ;
- OIDC du projet, sans `BLOB_READ_WRITE_TOKEN` permanent ;
- Wake Lock demandé pendant l'envoi et le traitement lorsque le navigateur l'autorise ;
- une seule copie d'analyse légère : 240 × 426, 2 fps ;
- l'énergie audio est extraite sous forme de petites métadonnées, sans gros WAV PCM ;
- `api/render.js` ouvre uniquement les fenêtres temporelles retenues ;
- aucun concat final : un rendu MP4 par Memory.

## Confidentialité

Les sources, proxies et résultats sont stockés dans le Blob privé temporaire. Les sources et proxies sont supprimés pendant le pipeline et les résultats sont nettoyés ensuite par les routes prévues à cet effet.

## Mode gratuit

La taille source reste limitée à 900 Mo pour conserver une marge sous le quota Blob Hobby pendant les tests. Cette limite produit ne garantit pas qu'une vidéo de 900 Mo fonctionnera sur toute connexion ou tout téléphone.

`api/prepare.js` et `api/render.js` conservent `maxDuration: 300` dans `vercel.json`. Kiz Memory signale un échec si le traitement dépasse les ressources disponibles au lieu de prétendre pouvoir traiter sans limite.

## Sandbox FFmpeg

V4.4.1 conserve le correctif validé de V4.3.2 : FFmpeg est d'abord recherché dans le Sandbox ; s'il manque, il est installé via le gestionnaire système. Un ancien `SANDBOX_SNAPSHOT_ID` ne bloque pas définitivement le pipeline : le code retente avec un Sandbox propre.
