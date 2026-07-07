# Kiz Memory — Prototype Vertical Social Recap

Prototype front-end de l'application **Kiz Memory**.

## Objectif
Transformer une vidéo de soirée ou workshop Kizomba en récap vertical prêt pour les réseaux sociaux : Instagram Reels, TikTok, YouTube Shorts, WhatsApp Status.

## Inclus
- Accueil premium
- Création d'une Memory
- Import vidéo local
- Simulation d'analyse IA
- Choix de format vertical : 15s, 30s, 45s, 60s
- Timeline magique
- Aperçu vertical 9:16
- Choix du style de montage
- Sélection de clips
- Personnalisation : titre, date, lieu
- Export social simulé
- Galerie souvenirs
- Memory Capsule
- Mode confidentialité
- PWA manifest

## Important
Cette version est un **prototype visuel/interactif**. Elle ne fait pas encore un vrai rendu vidéo final.
Pour une vraie version, il faudra ajouter :
- détection de moments forts côté IA,
- recadrage vertical intelligent,
- moteur de montage vidéo, par exemple FFmpeg côté serveur ou mobile,
- gestion du consentement / floutage / confidentialité.

## Lancer le projet
Ouvrir simplement `index.html` dans un navigateur.

Pour un test plus propre en local :
```bash
python3 -m http.server 8000
```
Puis ouvrir : `http://localhost:8000`
