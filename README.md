# Rami en Ligne - Jeu de Cartes

Un jeu de Rami multijoueur avec des adversaires bots IA.

## Fonctionnalités

- **Gameplay multijoueur** avec Socket.io
- **Adversaires bots IA** avec 4 niveaux de difficulté (Facile, Moyen, Difficile, Réaliste)
- **Gameplay au tour par tour**
- **Validation des combinaisons** pour les séries et les suites
- **Interface responsive** pour desktop et mobile
- **Système de pseudos** pour personnaliser votre identité
- **Timer de 60 secondes** par tour pour maintenir le rythme
- **Tableau des joueurs** pour suivre tous les participants

## Développement Local

```bash
# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

Le jeu sera disponible sur `http://localhost:3000`

## Déploiement sur Vercel

### Important : Limitations de Socket.io sur Vercel

⚠️ **Les fonctions serverless de Vercel ont des limitations avec les connexions WebSocket.** Socket.io nécessite des connexions persistantes qui peuvent ne pas fonctionner de manière fiable sur le niveau gratuit de Vercel.

### Options de Déploiement Recommandées :

1. **Vercel avec Mode Polling (Configuration Actuelle)**
   - Utilise le polling HTTP long au lieu des WebSockets
   - Fonctionne mais avec une latence plus élevée
   - Déployer avec : `vercel --prod`

2. **Plateformes Alternatives (Recommandé)**
   - **Railway.app** - Meilleur pour les applications WebSocket
   - **Render.com** - Le niveau gratuit supporte les WebSockets
   - **Heroku** - Choix classique pour les applications Node.js
   - **DigitalOcean App Platform**
   - **Fly.io**

### Déployer sur Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel --prod
```

### Déployer sur Railway (Recommandé)

1. Créer un compte sur [railway.app](https://railway.app)
2. Connecter votre dépôt GitHub
3. Railway détectera et déploiera automatiquement
4. Votre application aura un support WebSocket complet

## Structure du Projet

```
Rami-online/
├── api/
│   ├── index.js          # Point d'entrée principal pour Vercel
│   ├── server.js         # Configuration de l'application Express
│   ├── gameLogic.js      # État du jeu et logique des bots
│   └── socketHandlers.js # Gestionnaires d'événements Socket.io
├── public/
│   ├── index.html        # Interface du jeu
│   ├── script.js         # Logique côté client
│   └── style.css         # Styles
├── server.js             # Serveur de développement local
├── vercel.json           # Configuration Vercel
└── package.json
```

## Comment Jouer

1. **Ajouter des Bots** : Cliquez sur les boutons de bots pour ajouter des adversaires IA
2. **Démarrer la Partie** : Cliquez sur "Démarrer la partie"
3. **Votre Tour** : 
   - Piochez une carte (depuis la pioche ou la défausse)
   - Formez des combinaisons (3+ cartes)
   - Défaussez une carte pour terminer votre tour
4. **Gagner** : Soyez le premier à vous débarrasser de toutes vos cartes !

## Règles du Jeu

- **Série** : 3-4 cartes de même valeur (ex: 7♠ 7♥ 7♦)
- **Suite** : 3+ cartes consécutives de la même famille (ex: 5♠ 6♠ 7♠)
- **Jokers** (🃏) peuvent remplacer n'importe quelle carte

## Raccourcis Clavier

- `S` - Sélectionner/déselectionner la carte survolée
- `Z` - Créer une combinaison (suite) avec les cartes sélectionnées
- `A` - Ajouter les cartes sélectionnées à une combinaison existante (doit cliquer sur une combinaison d'abord)
- `D` - Défausser la carte survolée

## Technologies

- Node.js + Express
- Socket.io pour la communication en temps réel
- JavaScript Vanilla (client)
- HTML5/CSS3

## Implémentation des Bots

Le jeu dispose d'un système de bots sophistiqué ! Voici comment ils fonctionnent :

### Niveaux de Difficulté des Bots

Chaque niveau de difficulté est défini par quatre paramètres clés qui influencent le comportement du bot :

#### 1. **Bot Facile**
- **Temps de réflexion** : 2 secondes
- **Probabilité de créer une combinaison** : 50%
- **Probabilité d'ajouter à une combinaison existante** : 30%
- **Probabilité de défausse intelligente** : 20%
- **Comportement** : Le bot fait des mouvements plus aléatoires, forme rarement des combinaisons et défausse souvent au hasard. Parfait pour les débutants.

#### 2. **Bot Moyen**
- **Temps de réflexion** : 1.5 secondes
- **Probabilité de créer une combinaison** : 75%
- **Probabilité d'ajouter à une combinaison existante** : 60%
- **Probabilité de défausse intelligente** : 50%
- **Comportement** : Le bot forme stratégiquement des combinaisons, utilise parfois la défausse intelligente, et peut ajouter des cartes aux combinaisons existantes. Un adversaire équilibré.

#### 3. **Bot Difficile**
- **Temps de réflexion** : 1 seconde
- **Probabilité de créer une combinaison** : 95%
- **Probabilité d'ajouter à une combinaison existante** : 90%
- **Probabilité de défausse intelligente** : 85%
- **Comportement** : Le bot forme agressivement des combinaisons, utilise presque toujours la défausse intelligente, et maximise ses chances de gagner. Un défi de taille.

#### 4. **Bot Réaliste**
- **Temps de réflexion** : 0.4 secondes
- **Probabilité de créer une combinaison** : 100%
- **Probabilité d'ajouter à une combinaison existante** : 100%
- **Probabilité de défausse intelligente** : 100%
- **Comportement** : Le bot joue de manière optimale, forme toujours des combinaisons quand possible, et utilise exclusivement la défausse intelligente. Un adversaire redoutable.

### Fonctionnement Détaillé des Bots

#### Cycle de Tour d'un Bot

Chaque tour d'un bot suit une séquence précise :

1. **Phase de Réflexion Initiale**
   - Le bot attend son `thinkTime` (variable selon la difficulté)
   - Simule un temps de réflexion humain

2. **Phase de Pioche**
   - Le bot décide aléatoirement (60% de chance) de piocher depuis la défausse si une carte est disponible
   - Sinon, il pioche depuis la pioche
   - Émet une notification de son action

3. **Phase de Réflexion Post-Pioche**
   - Le bot attend à nouveau son `thinkTime`
   - Analyse ses options

4. **Phase d'Ajout aux Combinaisons Existantes**
   - Avec une probabilité définie par `addToMeldProbability`, le bot tente d'ajouter une carte à une combinaison existante sur la table
   - Parcourt toutes les combinaisons existantes
   - Pour chaque combinaison, teste si une de ses cartes peut l'étendre
   - Si une carte valide est trouvée, l'ajoute immédiatement
   - Si une carte est ajoutée, attend un délai supplémentaire (50% du `thinkTime`)

5. **Phase de Création de Combinaison**
   - Avec une probabilité définie par `meldProbability`, le bot tente de créer une nouvelle combinaison
   - Utilise `findPossibleMelds()` pour détecter toutes les combinaisons possibles dans sa main
   - Sélectionne la première combinaison trouvée et la pose sur la table
   - Si une combinaison est créée, attend un délai supplémentaire

6. **Vérification de Victoire**
   - Si la main du bot est vide après avoir posé des combinaisons, il gagne immédiatement

7. **Phase de Défausse**
   - Le bot choisit une carte à défausser en utilisant `chooseDiscard()`
   - Avec une probabilité définie par `smartDiscardProbability`, utilise la défausse intelligente
   - Sinon, défausse une carte aléatoire
   - Émet une notification de son action

8. **Vérification de Victoire Finale**
   - Si la main est vide après la défausse, le bot gagne

9. **Fin du Tour**
   - Attend 500ms supplémentaires
   - Passe au tour suivant

#### Détection des Combinaisons Possibles (`findPossibleMelds()`)

Le bot utilise un algorithme sophistiqué pour détecter toutes les combinaisons possibles :

1. **Détection des Séries (même valeur)**
   - Groupe toutes les cartes par valeur (A, 2, 3, ..., R)
   - Pour chaque valeur ayant 3+ cartes, crée une série
   - Ignore les jokers dans cette phase

2. **Détection des Suites (même famille, consécutives)**
   - Groupe toutes les cartes par famille (♠, ♥, ♦, ♣)
   - Pour chaque famille ayant 3+ cartes :
     - Trie les cartes par ordre de valeur (A, 2, 3, ..., 10, V, D, R)
     - Parcourt la séquence triée pour trouver des suites consécutives
     - Détecte les suites de 3+ cartes consécutives
   - Ignore les jokers dans cette phase

3. **Retour des Combinaisons**
   - Retourne toutes les combinaisons possibles trouvées
   - Les séries sont prioritaires sur les suites

#### Défausse Intelligente (`smartDiscard()`)

La défausse intelligente utilise un système de scoring pour déterminer la carte la moins utile :

1. **Calcul du Score pour Chaque Carte**
   - Pour chaque carte dans la main :
     - **Score de valeur** : +2 points par carte de même valeur dans la main
     - **Score de famille** : +1 point par carte de même famille dans la main
     - **Score de joker** : +10 points (les jokers sont très précieux)
   
2. **Exemple de Calcul**
   - Si le bot a : `[7♠, 7♥, 7♦, 8♠, 9♠, K♣]`
   - `7♠` : 2×3 (3 cartes de valeur 7) + 1×2 (2 cartes de famille ♠) = 8 points
   - `8♠` : 1×2 (2 cartes de famille ♠) = 2 points
   - `K♣` : 1×1 (1 carte de famille ♣) = 1 point
   - Le bot défaussera `K♣` (score le plus bas)

3. **Sélection de la Carte à Défausser**
   - Trie toutes les cartes par score croissant
   - Défausse la carte avec le score le plus bas (la moins utile)

#### Ajout aux Combinaisons Existantes (`tryAddToExistingMelds()`)

Le bot peut étendre les combinaisons déjà posées sur la table :

1. **Parcours des Combinaisons**
   - Parcourt toutes les combinaisons existantes sur la table
   - Pour chaque combinaison, teste chaque carte de sa main

2. **Validation**
   - Pour chaque carte, crée une combinaison test en ajoutant la carte à la combinaison existante
   - Utilise `isValidMeld()` pour valider la nouvelle combinaison
   - Si valide, ajoute immédiatement la carte et met à jour la combinaison

3. **Priorité**
   - Le bot teste les combinaisons dans l'ordre où elles apparaissent
   - S'arrête dès qu'une carte valide est trouvée

### Caractéristiques Avancées

- **Délais Humains** : Les bots attendent entre leurs actions pour simuler un comportement humain réaliste
- **Notifications** : Toutes les actions des bots sont annoncées aux autres joueurs

### Personnalisation

Le code des bots se trouve dans `api/gameLogic.js` dans la classe `RamiBot`. Vous pouvez facilement modifier :
- Les probabilités de chaque niveau
- Les temps de réflexion
- L'algorithme de défausse intelligente
- La logique de détection des combinaisons

## Licence?

MIT
