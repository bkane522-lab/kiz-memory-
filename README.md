# Kiz Memory V4.0 — Fondation honnête

Kiz Memory doit rester extrêmement simple :

**Vidéo → Memory → Partager**

## Ce que cette version fait réellement

- accueil réduit à **FILMER** et **CHOISIR UNE VIDÉO** ;
- capture caméra via `getUserMedia` + `MediaRecorder` lorsque le navigateur le permet ;
- import d'une vidéo du téléphone ;
- vérification réelle des métadonnées vidéo (durée et dimensions) ;
- aperçu vidéo ;
- enregistrement du fichier ;
- partage natif du fichier lorsque `navigator.share` et `navigator.canShare` l'autorisent ;
- traitement local uniquement dans cette version.

## Ce qui a été supprimé

- score « vibe » ;
- `Math.random()` présenté comme analyse ;
- faux « meilleurs moments » ;
- timestamps fixes 8/22/38/56/73/88 % ;
- labels fictifs « Golden moment », « Danse intense », etc. ;
- choix Soirée / Workshop / Freestyle ;
- choix 15 / 30 / 60 secondes ;
- faux écran « Résumé IA » ;
- boutons Instagram/TikTok qui ne ciblaient pas réellement ces applications ;
- génération Canvas/WebM présentée comme montage intelligent.

## Limite volontaire de V4.0

Cette version **ne prétend pas encore sélectionner les meilleurs passages** et ne génère pas encore le MP4 final de la future V1. Elle sert de base UX/entrée/sortie honnête avant le branchement du vrai moteur d'analyse mesurable et du pipeline FFmpeg.

## Étape suivante

V4.1 : analyse mesurable des images et de l'audio, sans score aléatoire ni affirmation invérifiable.
