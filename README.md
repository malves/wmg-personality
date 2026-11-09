# Mon profil DISC

Site interne permettant aux collaborateurs de passer un test de personnalité DISC
(blocs de 4 items, « le plus » / « le moins ») et de découvrir les profils de leurs collègues.
L'administrateur crée les comptes, compose l'avatar de chacun, édite les questions et les textes de profils.

Stack : Node.js, Express, EJS, SQLite (better-sqlite3). Aucun build front, aucun framework.

## Lancer en local

```bash
cp .env.example .env     # ajustez ADMIN_EMAIL / ADMIN_PASSWORD si besoin
npm install
npm start                # http://localhost:3020
```

Au premier démarrage, la base `data/personality.db` est créée et remplie :
24 blocs de questions, 17 profils, 10 conseils de collaboration, réglages par défaut,
et le compte administrateur (identifiants affichés dans la console).

- Collaborateurs : `http://localhost:3020`
- Administration : `http://localhost:3020/admin`

`npm run dev` relance automatiquement le serveur à chaque modification. `npm test` lance les tests (scoring, groupes, radar, présentation, avatars).

## Composer un avatar

Admin → Collaborateurs → Avatar ouvre le builder, rangé en six onglets : Visage (forme, teint, morphologie, nez, lèvres, détails, pilosité), Cheveux (19 coiffures), Regard (yeux, cils, sourcils, lunettes et monture), Tenue (10 vêtements, couleur secondaire, motif), Accessoires (couvre-chef, boucles d'oreilles, cou) et Fond. Chaque palette accepte une couleur libre (pastille « + »), « Annuler » (ou Ctrl+Z) revient en arrière, « Mélanger » tire au sort l'onglet courant et « Tout au hasard » le personnage entier.

Les avatars déjà enregistrés gardent exactement leur dessin : toute option absente prend la valeur neutre. Pour ajouter une option, compléter `SCHEMA` et la fonction de dessin correspondante dans `public/js/avatar.js` ; le builder, la normalisation et les tests (`test/avatar.test.js`) suivent le schéma.

## Inviter un collaborateur

1. Admin → Collaborateurs → Nouveau collaborateur (prénom, nom, email).
2. Composez son avatar (bouton « Avatar »).
3. Pour apparaître vous-même sur la page Équipe, cochez « Visible sur la page Équipe » sur votre fiche admin (décoché par défaut).
4. Copiez le lien d'invitation affiché sur sa fiche et envoyez-le lui (Slack, mail).
   Le lien est valable 14 jours ; il choisit son mot de passe en l'ouvrant.
5. Pour un mot de passe oublié : « Régénérer le lien » sur sa fiche, même principe.


## Suivre une session en direct

Admin → En direct affiche la carte de l'équipe pendant que tout le monde répond. Chaque personne part du centre et rejoint sa zone DISC au fil de ses réponses. Elle entre dans un groupe à partir de 6 réponses, et les groupes deviennent définitifs quand toute l'équipe a terminé. Chaque groupe évolue à partir du précédent (réglage `live_groups`) : une réponse isolée ne redistribue donc pas l'équipe, et les groupes finaux dépendent aussi de l'ordre des réponses.

Un clic sur un groupe ouvre sa fiche : ses membres, ses points forts, la façon de s'adresser à ce profil et les points à surveiller. Un clic sur un avatar ouvre la même fiche pour le profil de cette personne, une fois son test terminé. Ces textes viennent de Admin → Profils.

Le bouton « Lien de la carte » donne une adresse secrète qui affiche la carte seule, en plein écran et sans connexion : prénoms, avatars, groupes et profil de chacun, sans réponses ni scores. « Révoquer » la remplace et coupe aussitôt les écrans ouverts.

Seuls les collaborateurs visibles sur la page Équipe y figurent. Avant de projeter la page, utilisez « Masquer les réponses » pour cacher le détail des choix. Derrière un proxy, la route `/admin/live/stream` doit rester ouverte longtemps et sans mise en tampon.

## Présenter le DISC avant le test

Admin → En direct → « Démarrer l'explication » lance une présentation sur tous les écrans ouverts : la page admin et la carte publique. Les quatre boules quittent les coins de la carte, expliquent le DISC, les quatre grandes tendances et le déroulé du test, puis retournent à leur place : la carte reprend, avec les avatars.

Rien ne défile tout seul : les flèches ← et → du clavier changent de diapositive, et → sur la dernière ramène à la carte. Elles fonctionnent sur la page admin, et sur la carte publique si elle est ouverte dans un navigateur connecté en admin. Sinon, utilisez la télécommande qui remplace le bouton sur la page admin. Elle permet aussi de terminer à tout moment. Les écrans restent synchronisés, et un écran ouvert en cours de route rejoint la bonne diapositive.

Les textes et les déplacements des boules sont dans `public/js/deck-slides.js`. Les avatars n'y servent que de public : aucune diapositive ne montre le résultat de quelqu'un, et la démonstration de la carte utilise des points anonymes.

## Déployer avec Docker

```bash
# Dans un fichier .env à côté du docker-compose.yml.
# SESSION_SECRET, ADMIN_EMAIL et ADMIN_PASSWORD sont obligatoires : compose refuse de démarrer sans eux.
# SESSION_SECRET=une-longue-chaine-aleatoire
# ADMIN_EMAIL=vous@societe.fr
# ADMIN_PASSWORD=un-mot-de-passe-solide
# BASE_URL=https://disc.societe.fr
# TRUST_PROXY=1          # si derrière un reverse proxy HTTPS

docker compose up -d --build
```

L'application écoute sur le port `3020` de l'hôte. Les données (base SQLite + logo) sont dans le volume `disc-data`.

Sauvegarde : copiez le volume `disc-data` ; il contient tous les comptes, résultats et textes modifiés.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port d'écoute | `3020` |
| `SESSION_SECRET` | secret des sessions (obligatoire en production) | valeur de dev |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | compte admin créé au premier démarrage | `admin@example.com` / aléatoire |
| `BASE_URL` | URL publique pour les liens d'invitation (modifiable dans l'admin) | déduite de la requête |
| `TRUST_PROXY` | `1` derrière un reverse proxy HTTPS (cookie `secure`) | `0` |
| `DATA_DIR` | dossier de la base et des uploads | `./data` |
| `TZ` | fuseau horaire (salutation d'accueil, dates) | `Europe/Paris` en Docker |

## Structure

```
server.js                 serveur Express
src/db.js                 schéma SQLite, seed, helpers
src/disc.js               scoring DISC et résolution du profil (pur, testé)
src/radar.js              radar SVG des 4 dimensions (pur, testé)
src/auth.js               sessions SQLite, gardes, limiteur de connexion
src/live.js               état du test en direct et diffusion (Server-Sent Events)
src/groups.js             regroupement par similarité, position sur la carte DISC
src/deck.js               déroulé de la présentation (pur, testé)
src/routes/               auth, app (accueil, équipe, résultat), test (API), admin/*
src/views/                layouts + pages EJS
src/seed/                 questions, profils, conseils, texte de consentement
public/js/avatar.js       rendu SVG des avatars (schéma du builder, 26 réglages) et blobs, partagé serveur/navigateur
public/js/test.js         déroulé du test côté client
public/js/builder.js      builder d'avatar (admin), onglets générés depuis le schéma
public/js/result-export.js  export PNG du résultat
public/js/deck-slides.js  présentation : textes, déplacements (partagé serveur/navigateur)
public/js/deck.js         présentation : scène et animations, par-dessus la carte
public/css/               styles app (mobile), admin (desktop) et présentation (deck.css)
data/                     base SQLite + uploads (volume Docker)
```

## Scoring

Pour chaque bloc répondu : +1 « plus » sur la dimension de l'item choisi le plus, +1 « moins » sur celle de l'item choisi le moins.
Score brut = plus − moins ; score normalisé = (brut + N) / (2N) × 100 (50 = neutre).
Profil : dimension la plus haute, combinée à la deuxième si elle dépasse 55 ; profil « équilibré » si aucune ne dépasse 55.
