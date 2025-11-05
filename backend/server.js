const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { doesNotMatch } = require("assert");
const { kMaxLength } = require("buffer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir les fichiers statiques du dossier frontend
app.use(express.static(path.join(__dirname, "../frontend")));

let players = {};
let deck = [];
let committedMelds = [];
let discardPile = []; // Track discarded cards

// Fonction pour créer et mélanger le paquet
function initDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  deck = [];
  for (let s of suits) {
    for (let v of values) {
      deck.push(v + s);
    }
  }
  // Mélange
  deck.sort(() => Math.random() - 0.5);
}

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté :", socket.id);

  // Ajouter le joueur
  players[socket.id] = { hand: [] };

  // Distribuer 7 cartes
  if (deck.length < 14) initDeck();
  players[socket.id].hand = deck.splice(0, 7);

  // Envoyer la main au joueur
  socket.emit("initHand", players[socket.id].hand);
  
  // Send current discard pile state
  socket.emit("discardPileUpdate", discardPile);

  // Quand un joueur pioche
  socket.on("drawCard", () => {
    console.log("Le joueur", socket.id, "pioche une carte");
    if (deck.length === 0) initDeck();
    const card = deck.pop();
    players[socket.id].hand.push(card);
    socket.emit("updateHand", players[socket.id].hand);
  });

  // Quand un joueur pioche dans la défausse
  socket.on("drawFromDiscard", () => {
    console.log("Le joueur", socket.id, "pioche dans la défausse");
    if (discardPile.length === 0) {
      socket.emit('commitFailed', { message: 'La défausse est vide.' });
      return;
    }
    const card = discardPile.pop();
    players[socket.id].hand.push(card);
    socket.emit("updateHand", players[socket.id].hand);
    io.emit("discardPileUpdate", discardPile);
  });

  // Quand un joueur défausse
  socket.on("discardCard", (card) => {
    console.log("Le joueur", socket.id, "défausse", card);
    players[socket.id].hand = players[socket.id].hand.filter(c => c !== card);
    discardPile.push(card);
    io.emit("playerDiscarded", { player: socket.id, card });
    io.emit("discardPileUpdate", discardPile);
    socket.emit("updateHand", players[socket.id].hand);
  });

  // Quand un joueur commit un meld
  socket.on('commitMeld', ({ meld, targetCard }) => {
    // basic validation: player owns the cards
    const hand = players[socket.id].hand;
    const ownsAll = meld.every(c => hand.includes(c));
    if (!ownsAll) {
      socket.emit('commitFailed', { message: 'Vous ne possédez pas toutes les cartes du meld.' });
      return;
    }
    // remove meld cards from player's hand
    players[socket.id].hand = hand.filter(c => !meld.includes(c));
    const committed = { player: socket.id, meld, targetCard };
    committedMelds.push(committed);
    io.emit('meldCommitted', committed);
    // update the player hand
    socket.emit('updateHand', players[socket.id].hand);
  });

  socket.on("disconnect", () => {
    console.log("Déconnexion :", socket.id);
    delete players[socket.id];
  });
});

// Lancer le serveur
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});

