# Kiz Memory V4.3.1 — Vidéos longues

V4.3.1 est une version de stabilisation. Elle ne change ni le design principal ni le moteur de sélection IA : elle réduit surtout les transferts et le travail serveur inutiles sur les vidéos longues.

## Ce qui change

### 1. Upload multipart reprenable

- La vidéo est découpée en parties de 8 Mo.
- Trois parties maximum sont envoyées en parallèle pour rester raisonnable sur mobile.
- Chaque partie dispose de plusieurs tentatives automatiques en cas d'erreur réseau.
- Les parties terminées sont mémorisées localement.
- Si l'onglet ou le navigateur est interrompu, rouvrir Kiz Memory puis sélectionner **la même vidéo** permet de reprendre les parties déjà terminées tant que la session multipart Vercel est encore valide.
- L'upload reste direct téléphone → Vercel Blob privé. Le fichier vidéo ne transite pas dans une fonction serverless.
- Authentification : OIDC du projet Vercel ; aucun `BLOB_READ_WRITE_TOKEN` permanent n'est requis.

> Limite du Web : si Android supprime complètement le fichier sélectionné ou si la session multipart Vercel a expiré, l'utilisateur doit sélectionner de nouveau la vidéo et une nouvelle session peut être nécessaire. V4.3.1 ne prétend pas garantir une reprise après n'importe quelle fermeture du système.

### 2. Préparation FFmpeg en une seule passe

`api/prepare.js` ne produit plus un proxy vidéo **et** un gros fichier WAV PCM séparé.

Une seule passe FFmpeg crée un MP4 d'analyse très léger :

- 240 × 426 ;
- 4 images/s ;
- H.264 ;
- AAC mono 16 kHz / 32 kb/s lorsque la source contient de l'audio.

Le navigateur analyse alors le mouvement, MediaPipe et l'énergie audio à partir de cette seule copie.

### 3. Rendu des passages uniquement

`api/render.js` ne télécharge plus toute la source dans le Sandbox avant le montage final.

Le moteur :

1. reçoit les passages retenus ;
2. ouvre uniquement ces fenêtres temporelles de la source privée ;
3. encode au maximum 6 petits clips ;
4. concatène ces clips ;
5. supprime source + proxy avant d'enregistrer le MP4 final.

La sortie reste MP4 H.264/AAC, 1080 × 1920.

### 4. Nettoyage

Les anciennes routes expérimentales `api/client-upload.js` et `api/getkip` ne font pas partie du ZIP V4.3.1.

## Mode gratuit

La limite produit reste fixée à **900 Mo par vidéo** afin de conserver une marge sous le stockage Blob Hobby de 1 Go pendant les tests. Les fichiers temporaires sont supprimés autant que possible après traitement.

Cette limite est un choix de Kiz Memory V4.3.1 pour le mode gratuit, pas une promesse qu'une vidéo de 900 Mo passera dans toutes les conditions réseau ou tous les téléphones.

## Ce qui ne change pas

- aucun score aléatoire ;
- sélection par mesures réelles ;
- MediaPipe Pose quand disponible ;
- mouvement + audio comme repli mesurable ;
- Blob privé ;
- interface principale simple ;
- aucun service payant ajouté.

## Limite de calcul Hobby

V4.3.1 configure `prepare` et `render` à 300 secondes, qui est le maximum actuel des Vercel Functions Hobby avec Fluid Compute. Le pipeline a été réduit pour rester autant que possible sous cette limite, mais une vidéo extrêmement longue ou difficile à transcoder peut encore dépasser 5 minutes de traitement serveur. Dans ce cas, Kiz Memory doit signaler l'échec plutôt que promettre un traitement illimité.
