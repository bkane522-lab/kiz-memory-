# Kiz Memory — Template interactif

Version corrigée du prototype Kiz Memory, fidèle à la direction visuelle vendue : violet/or, écrans premium, capture intelligente, import, analyse IA, timeline, vibe score, workshop brain, studio de récap, export et partage.

## Ce qui fonctionne dans cette version

- Navigation entre les écrans.
- Bouton créer une Memory.
- Capture caméra via navigateur si autorisée.
- Enregistrement vidéo via MediaRecorder si supporté.
- Bouton flash/torche avec détection de compatibilité.
- Import vidéo depuis la galerie.
- Analyse IA simulée avec progression.
- Timeline magique animée.
- Vibe Score.
- Workshop Brain.
- Choix de format.
- Choix de style.
- Sélection/retrait des clips.
- Personnalisation titre/date/lieu.
- Partage via Web Share API si disponible.
- WhatsApp via lien de partage.
- Téléchargement d’une fiche récap JSON.

## Limites honnêtes

Le vrai partage direct vers Instagram/TikTok avec fichier vidéo n’est pas totalement contrôlable depuis une PWA navigateur. Le navigateur peut ouvrir la feuille de partage Android via `navigator.share`, ou ouvrir Instagram/TikTok, mais l’utilisateur devra souvent sélectionner le fichier manuellement.

Le vrai montage MP4 final nécessite ensuite un moteur vidéo : FFmpeg côté serveur, FFmpeg WASM, ou une API vidéo dédiée.
