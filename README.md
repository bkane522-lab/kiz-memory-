# Kiz Memory V3.7 — Résumé & Montage bêta

Version corrigée selon les retours UX/UI :

- typographies réduites et plus propres ;
- bouton Accueil plus visible pendant la navigation ;
- suppression du grand cercle violet autour du logo ;
- import vidéo qui déclenche automatiquement l’analyse ;
- après analyse, affichage d’un vrai écran **Résumé IA** ;
- génération d’un montage vertical bêta en WebM quand le navigateur le permet ;
- résultat téléchargeable ou partageable via le partage Android ;
- capture caméra sans filigrane.

## Limites honnêtes

Cette version reste un prototype navigateur. Le montage bêta est généré côté navigateur via `canvas.captureStream()` et `MediaRecorder`. Selon Android/navigateur, le rendu peut être en WebM et l’audio peut ne pas être conservé. Pour une vraie app pro avec MP4 + audio fiable, il faudra ajouter FFmpeg côté serveur ou une solution native.
