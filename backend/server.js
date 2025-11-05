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

  // Quand un joueur pioche
  socket.on("drawCard", () => {
    console.log("Le joueur", socket.id, "pioche une carte");
    if (deck.length === 0) initDeck();
    const card = deck.pop();
    players[socket.id].hand.push(card);
    socket.emit("updateHand", players[socket.id].hand);
  });

  // Quand un joueur défausse
  socket.on("discardCard", (card) => {
    console.log("Le joueur", socket.id, "défausse", card);
    players[socket.id].hand = players[socket.id].hand.filter(c => c !== card);
    io.emit("playerDiscarded", { player: socket.id, card });
    socket.emit("updateHand", players[socket.id].hand);
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

