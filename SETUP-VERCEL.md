# Installation Vercel — Kiz Memory V4.2.1

## 1. Remplacer le projet

Remplace le contenu de l'ancien dépôt par ce ZIP puis déploie sur Vercel.

## 2. Vercel Blob privé obligatoire

Dans Vercel : **Storage → Blob → Create Store → Private**, puis connecte le store au projet et redéploie.

## 3. Snapshot FFmpeg fortement recommandé

Sans snapshot, FFmpeg est téléchargé dans chaque Sandbox. Pour accélérer :

```bash
npm install
vercel link
vercel env pull .env.local
npm run build:snapshot
```

Ajoute la valeur affichée `SANDBOX_SNAPSHOT_ID` dans les variables d'environnement Vercel puis redéploie.

## 4. Accès réseau côté navigateur

V4.2 charge MediaPipe Tasks Vision 1.0.1 depuis jsDelivr et le modèle Pose Landmarker Lite depuis `storage.googleapis.com`. Si ces ressources sont bloquées, l'application utilise automatiquement le mode mesurable mouvement + musique sans prétendre avoir utilisé l'IA.

## 5. Premier test

Commence avec une vidéo de 30 à 90 secondes. Le parcours attendu :

1. CHOISIR UNE VIDÉO
2. transfert privé réel
3. création d'une copie légère
4. analyse image par image (compteur réel)
5. découpe/assemblage FFmpeg
6. **Votre Memory est prête**

## 6. Confidentialité

Le cron quotidien supprime les fichiers `kiz-memory/` âgés de plus de 24 h. La source et les fichiers d'analyse sont supprimés immédiatement après un rendu réussi. Le résultat est supprimé quand l'utilisateur choisit RECOMMENCER.
