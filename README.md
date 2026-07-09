# Kiz Memory V3.6 — Auto Montage Beta

Version UX Flow Clean avec une première génération automatique côté navigateur.

## Ce qui change

- Après import vidéo : l'analyse démarre automatiquement.
- Après choix du format : l'app tente de créer une vidéo verticale 9:16 en WebM.
- Le bouton Télécharger récupère la vidéo générée si le navigateur le permet.
- La capture reste sans filigrane.
- Le partage arrive seulement à la fin.

## Limites honnêtes

Cette V3.6 est encore une bêta front-end :

- le rendu est en WebM, pas encore en MP4 ;
- l'audio peut être absent dans le montage généré ;
- certains téléphones/navigateurs peuvent bloquer MediaRecorder ou canvas.captureStream ;
- pour une vraie app finale, il faudra un moteur FFmpeg côté serveur ou FFmpeg.wasm bien optimisé.

## Structure

```text
assets/
  icon.png
  logo-mark.png
  wordmark.png

index.html
style.css
app.js
manifest.webmanifest
README.md
```
