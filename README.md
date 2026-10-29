# VIE AU CONGO V16 — pack prêt à déployer

Ce pack héberge **le jeu HTML et le serveur de comptes/chat dans un seul service web**. Il n'est donc pas nécessaire d'héberger le HTML séparément pour tester le chat : le serveur sert automatiquement `public/index.html` et les routes `/api/...` ainsi que Socket.IO.

## Déploiement avec Render depuis Android

### A. Mettre les fichiers dans GitHub
1. Télécharge et décompresse le ZIP.
2. Crée un dépôt GitHub vide (par exemple `vie-au-congo-online`).
3. Téléverse **le contenu de ce dossier** à la racine du dépôt : `server.js`, `package.json`, `render.yaml`, `.gitignore`, `README.md` et le dossier `public/` contenant `index.html`.
4. Vérifie que `render.yaml` et `package.json` sont bien à la racine du dépôt, et non dans un sous-dossier supplémentaire.

### B. Déployer le Blueprint sur Render
1. Connecte-toi à Render et autorise l'accès au dépôt GitHub.
2. Dans Render, choisis **New → Blueprint** (ou l'option de création d'un Blueprint depuis un dépôt).
3. Sélectionne le dépôt `vie-au-congo-online`.
4. Render lit `render.yaml`, installe les dépendances (`npm install`), démarre le serveur (`npm start`) et génère automatiquement `JWT_SECRET`.
5. Attends que le déploiement affiche **Live**. Ouvre l'URL `https://...onrender.com` fournie par Render.

Si l'option Blueprint n'est pas proposée, crée **New → Web Service**, connecte le même dépôt, puis choisis :
- Runtime / Language : `Node`
- Build command : `npm install`
- Start command : `npm start`
- Environment variable : `JWT_SECRET` = une longue valeur aléatoire secrète (au moins 32 caractères). Ne la publie pas.
- Health check path : `/health`

## Tester le jeu et le chat
1. Ouvre l'URL Render : la page du jeu et le serveur utilisent la même adresse HTTPS.
2. Dans le jeu, ouvre **« Jouer en ligne & discuter »**.
3. Crée un compte avec un nom de 3 à 20 caractères (lettres sans accent, chiffres ou `_`) et un mot de passe d'au moins 8 caractères. N'utilise pas un mot de passe personnel réutilisé.
4. Ouvre la même URL dans un autre navigateur ou sur un autre appareil, crée un second compte, puis teste le salon public et les messages privés.
5. Vérifie le serveur en ouvrant `https://TON-URL.onrender.com/health`. La réponse attendue contient `"ok":true`.

## Limites importantes
- Le serveur ajoute comptes, salon public et messages privés, mais **pas** la synchronisation du monde 3D ou des personnages.
- Le stockage actuel est un fichier local `data/db.json`. Sur un hébergement gratuit sans disque persistant, les comptes et messages peuvent être perdus lors de certains redéploiements ou redémarrages. Ce pack sert à tester le prototype, pas à garantir une conservation permanente.
- Un service Render gratuit peut s'endormir après une période d'inactivité ; le premier chargement suivant peut prendre du temps.
- Il n'y a pas encore de modération avancée, de signalement ni de blocage d'utilisateurs. Ne partage pas d'informations personnelles dans le chat.

## Fichiers
- `server.js` : API, authentification, chat public et messagerie privée.
- `public/index.html` : jeu VIE AU CONGO V16.
- `package.json` : dépendances et commande de lancement.
- `render.yaml` : configuration de déploiement Render.
