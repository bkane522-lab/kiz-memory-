# Kiz Memory V4.2.6

## Correctif V4.2.6

- corrige l’erreur JavaScript `inferExtension is not defined` avant l’upload multipart ;
- conserve le Blob privé et la configuration Vercel existants ;
- aucune nouvelle variable d’environnement n’est requise ;
- le chemin source utilise désormais l’extension réelle du fichier quand elle est reconnue, sinon le MIME comme repli.

**Promesse : Vidéo → Memory → Partager.**

V4.2 ajoute la première vraie sélection automatique de passages. Aucun timestamp fixe, aucun `Math.random()` et aucun score « vibe ».

## Pipeline réel

1. Upload direct dans Vercel Blob privé.
2. FFmpeg crée une copie d'analyse légère (360×640, 8 fps) et une piste WAV mono.
3. Dans le navigateur, Kiz Memory mesure les variations d'image et l'énergie audio.
4. Quand MediaPipe est disponible, le modèle **Pose Landmarker Lite** détecte jusqu'à deux corps et mesure présence, cadrage, déplacement et variation d'orientation.
5. Un classement interne déterministe combine les mesures. Les scores ne sont pas affichés à l'utilisateur.
6. Kiz Memory choisit plusieurs fenêtres espacées, puis FFmpeg découpe réellement la vidéo source et assemble la Memory.
7. Sortie : MP4 H.264/AAC, 1080×1920, `faststart`.
8. Source + fichiers d'analyse temporaires sont supprimés après le rendu. Le résultat est temporaire et supprimable via RECOMMENCER / nettoyage automatique.

## Mode de secours honnête

Si le modèle MediaPipe ne peut pas être chargé (réseau, navigateur, CDN), Kiz Memory continue avec **mouvement mesuré + musique mesurée**. Dans ce cas l'interface ne prétend pas avoir utilisé l'IA de pose.

## MediaPipe et confidentialité

Le modèle est chargé depuis les ressources Google/MediaPipe. L'inférence Pose Landmarker s'exécute dans le navigateur sur la copie légère. Selon la documentation MediaPipe, les données d'entrée ne sont pas envoyées à Google par l'API Tasks, mais des métriques de performance/utilisation peuvent être envoyées par MediaPipe.

## Fichiers importants

- `app.js` : sélection, MediaPipe, mouvement, audio, partage.
- `api/prepare.js` : création du proxy et du WAV.
- `api/render.js` : découpe/concat FFmpeg.
- `api/upload-url.js` : ticket/fallback d’upload privé signé.
- `api/client-upload.js` : upload direct multipart Vercel Blob pour les grosses vidéos.
- `api/cleanup*.js` : confidentialité et nettoyage.
- `SETUP-VERCEL.md` : configuration.

## Limites V4.2

- Le modèle de pose n'identifie pas la qualité artistique de la danse et ne prétend pas connaître les « meilleurs moments » au sens humain.
- La sélection repose sur des critères mesurables : mouvement, variations, présence/cadrage corporel quand disponible, rotation approximée du torse et énergie audio.
- Les grosses vidéos 4K peuvent demander plusieurs minutes de traitement serveur.


## Correctif V4.2.3

- corrige la lecture des blobs privés après le transfert ;
- ajoute explicitement `access: 'private'` à toutes les URL signées Vercel Blob (`GET` et `PUT`) ;
- conserve le stockage privé CDG1 et le pipeline d'analyse existant ;
- aucun score aléatoire ni timestamp prédéfini n'a été ajouté.


## V4.2.3
- utilise le pathname réellement renvoyé par Vercel Blob après l'upload ;
- vérifie le blob privé avant de lancer FFmpeg ;
- récupère automatiquement un pathname normalisé si nécessaire ;
- force `addRandomSuffix: false` pour les uploads signés ;
- exécute le Sandbox en région `cdg1` près du Blob Paris.


## V4.2.6 — vidéos longues / gros fichiers

- upload navigateur → Blob en **multipart** via `@vercel/blob/client` ;
- Vercel Blob découpe le fichier en parties, les transfère en parallèle et retente les parties qui échouent ;
- progression réelle avec octets transférés, débit approximatif et temps restant estimé ;
- demande **Screen Wake Lock** pendant tout le pipeline pour limiter les interruptions dues à la mise en veille ;
- ré-acquisition automatique du Wake Lock quand l’onglet redevient visible ;
- fallback vers l’ancien PUT signé uniquement si le module client Blob ne peut pas être chargé ;
- limite produit conservée à **1 Go** pour ne pas promettre un traitement FFmpeg fiable au-delà avant validation.

### Limite honnête
Le Wake Lock est une demande au système, pas une garantie absolue. Android peut toujours suspendre/arrêter un navigateur (économie d’énergie, fermeture de l’application, manque de mémoire). Le multipart retente les parties pendant la session courante, mais cette V4.2.6 **ne reprend pas encore un upload après fermeture/rechargement complet de la page**.


## V4.2.6 — correction du préflight multipart
- l'upload multipart direct est désormais tenté en premier ;
- l'ancienne URL PUT signée n'est créée qu'en fallback si le module client multipart ne peut pas charger ;
- les messages d'erreur Blob sont plus précis et n'annoncent plus à tort un stockage non configuré ;
- les types vidéo autorisés côté jeton multipart sont explicites.
