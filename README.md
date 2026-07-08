# Kiz Memory — V3.1 Brand Lock

Cette version verrouille l’identité visuelle validée : logo luxe couple + couronne, or royal, violet profond, noir premium.

## Objectifs

- Revenir au branding validé, sans logo abstrait différent.
- Garder une UX V3 simplifiée.
- Supprimer le filigrane gênant sur l’écran caméra.
- Mettre le partage uniquement à la fin.
- Garder un parcours clair : accueil → choix entrée → capture/import → analyse → format → génération → résultat.

## Structure

```text
assets/
  brand-header.png
  brand-board.png
  icon.png

index.html
style.css
app.js
manifest.webmanifest
README.md
```

## Important

Prototype front-end : l’analyse IA et la génération du montage sont simulées.
Pour le vrai export MP4 automatique, il faudra ajouter un moteur vidéo, par exemple FFmpeg côté serveur ou une solution mobile dédiée.
