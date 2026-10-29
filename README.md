# VIE AU CONGO V16 — Portail + jeu + serveur

Cette version affiche une vraie page d'accueil à `/`, garde le jeu à `/jeu.html` et conserve les API de compte et le chat Socket.IO.

## Mettre à jour le dépôt GitHub existant
1. Décompressez ce ZIP.
2. Dans le dépôt `Vie-au-congo-online`, remplacez les anciens fichiers par tous ceux de ce pack, en conservant exactement cette structure :
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `public/index.html` (page d'accueil)
   - `public/jeu.html` (jeu complet)
3. Enregistrez les modifications avec **Commit changes**.
4. Render devrait redéployer automatiquement. Sinon, dans Render, choisissez **Manual Deploy → Deploy latest commit**.
5. Ouvrez l'URL Render : `/` doit afficher le portail et `/jeu.html` doit ouvrir le jeu.
6. `/health` doit retourner un petit JSON avec `"ok":true`.

## Variable obligatoire
Le service doit posséder `JWT_SECRET`, avec au moins 32 caractères aléatoires. Le fichier `render.yaml` demande à Render de générer cette valeur pour un nouveau déploiement Blueprint. Si le service a été créé manuellement, ajoutez-la dans Environment.

## Limites
- Le chat public et les messages privés nécessitent des comptes distincts.
- Les personnages ne sont pas encore synchronisés dans un monde 3D partagé.
- Le fichier de données local peut être perdu sur un hébergement sans disque persistant ; ce pack est pour les tests.
- Une fois connecté, n'utilise pas un mot de passe réutilisé et ne partage pas d'informations personnelles.
