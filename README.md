# Kiz Memory V4.0.3.2 — Fondation honnête

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

## Limite volontaire de V4.0.3

Cette version **ne prétend pas encore sélectionner les meilleurs passages** et ne génère pas encore le MP4 final de la future V1. Elle sert de base UX/entrée/sortie honnête avant le branchement du vrai moteur d'analyse mesurable et du pipeline FFmpeg.

## Étape suivante

V4.1 : analyse mesurable des images et de l'audio, sans score aléatoire ni affirmation invérifiable.


## Correctif V4.0.3.2
- validation des métadonnées vidéo plus robuste sur mobile ;
- délai de lecture porté à 45 s ;
- élément vidéo de contrôle attaché au DOM pour les navigateurs mobiles ;
- gestion des durées 0/Infinity ;
- diagnostic HEVC/H.265 sans présenter le fichier comme corrompu.


## Correctif V4.0.3
- L’import ne dépend plus d’un test de décodage navigateur bloquant.
- Les fichiers MP4 mobiles sont acceptés dès lors qu’ils sont non vides et de type vidéo.
- L’aperçu tente ensuite la lecture sans invalider le fichier en cas d’échec du moteur média du navigateur.


## V4.0.3
- numéro de version visible à l’écran ;
- cache navigateur/Vercel neutralisé pendant les tests ;
- aperçu chargé seulement après affichage du lecteur ;
- le File Android est conservé jusqu’à la création du Blob URL ;
- un échec d’aperçu ne rejette jamais la vidéo.
