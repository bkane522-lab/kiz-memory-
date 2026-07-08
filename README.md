# Kiz Memory V3 — UX/UI Clean

Version V3 simplifiée de Kiz Memory.

## Objectifs corrigés

- Supprimer le filigrane gênant sur l’écran caméra.
- Réduire le nombre d’informations visibles à chaque étape.
- Garder une seule action principale par écran.
- Déplacer le partage uniquement après la génération.
- Améliorer l’expérience mobile/PWA.

## Flow V3

1. Accueil luxe
2. Choix d’entrée : filmer ou importer
3. Capture claire sans watermark
4. Analyse simplifiée
5. Choix du format vertical
6. Génération automatique simulée
7. Résultat & partage
8. Confidentialité

## Structure

```text
assets/
  icon.svg
  logo.svg

index.html
style.css
app.js
manifest.webmanifest
README.md
```

## Important

Cette V3 est un prototype front-end.

Fonctions réelles intégrées selon support navigateur :
- caméra via getUserMedia
- enregistrement via MediaRecorder
- flash/torche si supporté par le navigateur et le téléphone
- import vidéo local
- partage Android via navigator.share

Le vrai montage IA automatique nécessitera ensuite :
- détection vidéo réelle,
- moteur d’export MP4,
- traitement serveur ou moteur local type FFmpeg,
- gestion RGPD/consentement/floutage.
