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
let bots = {}; // Track bot players
let gameState = {
  currentPlayer: null,
  playerOrder: [], // ordered list of player IDs
  turnIndex: 0,
  gameStarted: false,
  hasDrawn: false // Track if current player has drawn a card this turn
};

// Bot class
class RamiBot {
  constructor(id, io) {
    this.id = id;
    this.hand = [];
    this.io = io;
    this.thinkTime = 1500; // ms delay to simulate thinking
  }

  async takeTurn() {
    await this.delay(this.thinkTime);
    
    // Decide whether to draw from discard or deck
    const topDiscard = discardPile[discardPile.length - 1];
    const drawFromDiscard = topDiscard && Math.random() > 0.6;
    
    // Draw
    if (drawFromDiscard && discardPile.length > 0) {
      const card = discardPile.pop();
      this.hand.push(card);
      players[this.id].hand = this.hand;
      this.io.emit("botAction", { bot: this.id, action: 'piocher depuis la défausse' });
      this.io.emit("discardPileUpdate", discardPile);
    } else {
      if (deck.length === 0) initDeck();
      const card = deck.pop();
      this.hand.push(card);
      players[this.id].hand = this.hand;
      this.io.emit("botAction", { bot: this.id, action: 'piocher' });
    }
    
    await this.delay(this.thinkTime);
    
    // Try to add cards to existing melds first
    const cardsAdded = this.tryAddToExistingMelds();
    if (cardsAdded) {
      await this.delay(this.thinkTime);
    }
    
    // Try to form and commit new melds
    const meldCommitted = this.tryCommitMeld();
    if (meldCommitted) {
      await this.delay(this.thinkTime);
    }
    
    // Check for win after melds (in case bot melded all cards)
    if (this.hand.length === 0) {
      console.log(`Bot ${this.id} a gagné!`);
      
      this.io.emit("gameWon", { 
        winner: this.id, 
        winnerName: `Bot ${this.id}`,
        isBot: true
      });
      
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      committedMelds = [];
      discardPile = [];
      
      return;
    }
    
    // Discard a random card
    const cardToDiscard = this.chooseDiscard();
    this.hand = this.hand.filter(c => c !== cardToDiscard);
    players[this.id].hand = this.hand;
    discardPile.push(cardToDiscard);
    this.io.emit("botAction", { bot: this.id, action: 'défausser', card: cardToDiscard });
    this.io.emit("discardPileUpdate", discardPile);
    
    // Check for win condition (no cards left)
    if (this.hand.length === 0) {
      console.log(`Bot ${this.id} a gagné!`);
      
      // Broadcast winner to all players
      this.io.emit("gameWon", { 
        winner: this.id, 
        winnerName: `Bot ${this.id}`,
        isBot: true
      });
      
      // Reset game state
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      committedMelds = [];
      discardPile = [];
      
      return; // Don't continue to next turn
    }
    
    // End turn
    await this.delay(500);
    nextTurn();
  }

  chooseDiscard() {
    // Simple strategy: discard a random card
    return this.hand[Math.floor(Math.random() * this.hand.length)];
  }

  tryCommitMeld() {
    // Try to find valid melds in hand
    const possibleMelds = this.findPossibleMelds();
    
    if (possibleMelds.length > 0) {
      // Commit the first valid meld found
      const meld = possibleMelds[0];
      this.hand = this.hand.filter(c => !meld.includes(c));
      players[this.id].hand = this.hand;
      
      const committed = { player: this.id, meld, targetCard: null };
      committedMelds.push(committed);
      this.io.emit('meldCommitted', committed);
      this.io.emit("botAction", { bot: this.id, action: 'poser une combinaison', card: meld.join(' ') });
      
      return true;
    }
    
    return false;
  }

  findPossibleMelds() {
    const melds = [];
    
    // Try to find sets (3-4 cards of same rank)
    const rankGroups = {};
    this.hand.forEach(card => {
      if (card === "🃏") return; // Skip jokers for now
      const rank = card.slice(0, -1);
      if (!rankGroups[rank]) rankGroups[rank] = [];
      rankGroups[rank].push(card);
    });
    
    for (const rank in rankGroups) {
      const cards = rankGroups[rank];
      if (cards.length >= 3) {
        // Take 3 cards for a set
        melds.push(cards.slice(0, 3));
      }
    }
    
    // Try to find runs (3+ consecutive cards of same suit)
    const suitGroups = {};
    this.hand.forEach(card => {
      if (card === "🃏") return;
      const suit = card.slice(-1);
      if (!suitGroups[suit]) suitGroups[suit] = [];
      suitGroups[suit].push(card);
    });
    
    const values = ["A","2","3","4","5","6","7","8","9","10","V","D","R"];
    for (const suit in suitGroups) {
      const cards = suitGroups[suit];
      if (cards.length >= 3) {
        // Sort by rank
        cards.sort((a, b) => {
          const rankA = values.indexOf(a.slice(0, -1));
          const rankB = values.indexOf(b.slice(0, -1));
          return rankA - rankB;
        });
        
        // Find consecutive sequences
        for (let i = 0; i <= cards.length - 3; i++) {
          const run = [cards[i]];
          for (let j = i + 1; j < cards.length; j++) {
            const prevRank = values.indexOf(cards[j-1].slice(0, -1));
            const currRank = values.indexOf(cards[j].slice(0, -1));
            if (currRank === prevRank + 1) {
              run.push(cards[j]);
            } else {
              break;
            }
          }
          if (run.length >= 3) {
            melds.push(run.slice(0, 3)); // Take first 3 cards
            break;
          }
        }
      }
    }
    
    return melds;
  }

  tryAddToExistingMelds() {
    // Try to add cards from hand to existing melds
    for (let i = 0; i < committedMelds.length; i++) {
      const existingMeld = committedMelds[i];
      
      // Try each card in hand
      for (const card of this.hand) {
        const testMeld = [...existingMeld.meld, card];
        
        if (isValidMeld(testMeld)) {
          // Add this card to the meld
          this.hand = this.hand.filter(c => c !== card);
          players[this.id].hand = this.hand;
          
          committedMelds[i].meld = testMeld;
          this.io.emit('meldUpdated', { meldIndex: i, newMeld: testMeld, addedBy: this.id });
          this.io.emit("botAction", { bot: this.id, action: 'ajouter à une combinaison', card });
          
          return true;
        }
      }
    }
    
    return false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Fonction pour créer et mélanger le paquet
function initDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["A","2","3","4","5","6","7","8","9","10","V","D","R"];
  deck = [];
  for (let s of suits) {
    for (let v of values) {
      deck.push(v + s);
    }
  }
  // Add 2 jokers
  deck.push("🃏");
  deck.push("🃏");
  // Mélange
  deck.sort(() => Math.random() - 0.5);
}

// Meld validation functions
function isValidMeld(meld) {
  if (meld.length < 3) return false;
  
  return isValidSet(meld) || isValidRun(meld);
}

function isValidSet(meld) {
  // Set: 3 or 4 cards of same rank (e.g., 7♠ 7♥ 7♦)
  if (meld.length < 3 || meld.length > 4) return false;
  
  // Filter out jokers
  const nonJokers = meld.filter(card => card !== "🃏");
  if (nonJokers.length === 0) return false; // Can't have only jokers
  
  const ranks = nonJokers.map(card => card.slice(0, -1)); // Remove suit
  const firstRank = ranks[0];
  
  // All non-joker cards must have same rank
  if (!ranks.every(r => r === firstRank)) return false;
  
  // All non-joker suits must be different
  const suits = nonJokers.map(card => card.slice(-1));
  const uniqueSuits = new Set(suits);
  return uniqueSuits.size === suits.length;
}

function isValidRun(meld) {
  // Run: 3+ consecutive cards of same suit (e.g., 5♠ 6♠ 7♠)
  if (meld.length < 3) return false;
  
  // Filter out jokers for suit checking
  const nonJokers = meld.filter(card => card !== "🃏");
  if (nonJokers.length === 0) return false; // Can't have only jokers
  
  const suits = nonJokers.map(card => card.slice(-1));
  const firstSuit = suits[0];
  
  // All non-joker cards must be same suit
  if (!suits.every(s => s === firstSuit)) return false;
  
  // Check consecutive ranks (jokers can fill gaps)
  const values = ["A","2","3","4","5","6","7","8","9","10","V","D","R"];
  const ranks = nonJokers.map(card => card.slice(0, -1));
  const indices = ranks.map(r => values.indexOf(r)).filter(i => i !== -1);
  
  // Sort indices
  indices.sort((a, b) => a - b);
  
  // Count jokers
  const jokerCount = meld.filter(card => card === "🃏").length;
  
  // Check if consecutive with jokers filling gaps
  let gapsNeeded = 0;
  for (let i = 1; i < indices.length; i++) {
    const gap = indices[i] - indices[i-1] - 1;
    gapsNeeded += gap;
  }
  
  return gapsNeeded <= jokerCount;
}

// Turn management
function nextTurn() {
  if (!gameState.gameStarted || gameState.playerOrder.length === 0) return;
  
  gameState.turnIndex = (gameState.turnIndex + 1) % gameState.playerOrder.length;
  gameState.currentPlayer = gameState.playerOrder[gameState.turnIndex];
  gameState.hasDrawn = false; // Reset draw flag for new turn
  
  io.emit("turnStart", { player: gameState.currentPlayer });
  
  // If it's a bot's turn, make it play
  if (players[gameState.currentPlayer]?.isBot) {
    const bot = bots[gameState.currentPlayer];
    setTimeout(() => bot.takeTurn(), 1000);
  }
}

function startGame() {
  if (gameState.gameStarted) return;
  
  gameState.playerOrder = Object.keys(players);
  if (gameState.playerOrder.length === 0) return;
  
  gameState.turnIndex = 0;
  gameState.currentPlayer = gameState.playerOrder[0];
  gameState.gameStarted = true;
  gameState.hasDrawn = false; // Initialize draw flag
  
  io.emit("gameStarted", { playerOrder: gameState.playerOrder });
  io.emit("turnStart", { player: gameState.currentPlayer });
  
  // If first player is a bot, start its turn
  if (players[gameState.currentPlayer]?.isBot) {
    const bot = bots[gameState.currentPlayer];
    setTimeout(() => bot.takeTurn(), 1000);
  }
}

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté :", socket.id);

  // Ajouter le joueur
  players[socket.id] = { hand: [], isBot: false };

  // Distribuer 13 cartes
  if (deck.length < 13) initDeck();
  players[socket.id].hand = deck.splice(0, 13);

  // Envoyer la main au joueur
  socket.emit("initHand", players[socket.id].hand);
  
  // Send current discard pile state
  socket.emit("discardPileUpdate", discardPile);
  
  // Send game state
  socket.emit("gameState", {
    gameStarted: gameState.gameStarted,
    currentPlayer: gameState.currentPlayer,
    playerOrder: gameState.playerOrder
  });

  // Add bot
  socket.on("addBot", () => {
    const botId = `bot_${Date.now()}`;
    const bot = new RamiBot(botId, io);
    bots[botId] = bot;
    players[botId] = { hand: [], isBot: true };
    
    // Deal cards to bot
    if (deck.length < 13) initDeck();
    players[botId].hand = deck.splice(0, 13);
    bot.hand = players[botId].hand;
    
    io.emit("playerJoined", { id: botId, isBot: true, playerCount: Object.keys(players).length });
    console.log("Bot ajouté :", botId);
  });

  // Start game
  socket.on("startGame", () => {
    console.log("Démarrage de la partie");
    startGame();
  });

  // Stop game
  socket.on("stopGame", () => {
    console.log("Arrêt de la partie");
    
    // Reset game state
    gameState.gameStarted = false;
    gameState.currentPlayer = null;
    gameState.hasDrawn = false;
    gameState.turnIndex = 0;
    committedMelds = [];
    discardPile = [];
    
    // Clear all player hands and redistribute
    Object.keys(players).forEach(playerId => {
      if (deck.length < 13) initDeck();
      players[playerId].hand = deck.splice(0, 13);
      if (players[playerId].isBot) {
        const bot = bots[playerId];
        if (bot) bot.hand = players[playerId].hand;
      } else {
        io.to(playerId).emit("initHand", players[playerId].hand);
      }
    });
    
    // Broadcast game stopped
    io.emit("gameStopped");
    io.emit("discardPileUpdate", discardPile);
  });

  // Quand un joueur pioche
  socket.on("drawCard", () => {
    if (!gameState.gameStarted || gameState.currentPlayer !== socket.id) {
      socket.emit('commitFailed', { message: 'Ce n\'est pas votre tour.' });
      return;
    }
    if (gameState.hasDrawn) {
      socket.emit('commitFailed', { message: 'Vous avez déjà pioché cette manche.' });
      return;
    }
    console.log("Le joueur", socket.id, "pioche une carte");
    if (deck.length === 0) initDeck();
    const card = deck.pop();
    players[socket.id].hand.push(card);
    gameState.hasDrawn = true; // Mark that player has drawn
    socket.emit("updateHand", players[socket.id].hand);
  });

  // Quand un joueur pioche dans la défausse
  socket.on("drawFromDiscard", () => {
    if (!gameState.gameStarted || gameState.currentPlayer !== socket.id) {
      socket.emit('commitFailed', { message: 'Ce n\'est pas votre tour.' });
      return;
    }
    if (gameState.hasDrawn) {
      socket.emit('commitFailed', { message: 'Vous avez déjà pioché cette manche.' });
      return;
    }
    console.log("Le joueur", socket.id, "pioche dans la défausse");
    if (discardPile.length === 0) {
      socket.emit('commitFailed', { message: 'La défausse est vide.' });
      return;
    }
    const card = discardPile.pop();
    players[socket.id].hand.push(card);
    gameState.hasDrawn = true; // Mark that player has drawn
    socket.emit("updateHand", players[socket.id].hand);
    io.emit("discardPileUpdate", discardPile);
  });

  // Quand un joueur défausse
  socket.on("discardCard", (card) => {
    if (!gameState.gameStarted || gameState.currentPlayer !== socket.id) {
      socket.emit('commitFailed', { message: 'Ce n\'est pas votre tour.' });
      return;
    }
    if (!gameState.hasDrawn) {
      socket.emit('commitFailed', { message: 'Vous devez piocher une carte avant de défausser.' });
      return;
    }
    console.log("Le joueur", socket.id, "défausse", card);
    players[socket.id].hand = players[socket.id].hand.filter(c => c !== card);
    discardPile.push(card);
    io.emit("playerDiscarded", { player: socket.id, card });
    io.emit("discardPileUpdate", discardPile);
    socket.emit("updateHand", players[socket.id].hand);
    
    // Check for win condition (no cards left)
    if (players[socket.id].hand.length === 0) {
      const isBot = players[socket.id].isBot;
      const winnerName = isBot ? `Bot ${socket.id}` : `Joueur ${socket.id}`;
      console.log(`${winnerName} a gagné!`);
      
      // Broadcast winner to all players
      io.emit("gameWon", { 
        winner: socket.id, 
        winnerName: winnerName,
        isBot: isBot
      });
      
      // Reset game state
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      committedMelds = [];
      discardPile = [];
      
      return; // Don't continue to next turn
    }
    
    // End turn after discard
    nextTurn();
  });

  // Quand un joueur commit un meld
  socket.on('commitMeld', ({ meld, targetCard }) => {
    // Validate: player has drawn a card this turn
    if (!gameState.hasDrawn) {
      socket.emit('commitFailed', { message: 'Vous devez piocher une carte avant de poser une combinaison.' });
      return;
    }
    
    // Validate: player owns the cards
    const hand = players[socket.id].hand;
    const ownsAll = meld.every(c => hand.includes(c));
    if (!ownsAll) {
      socket.emit('commitFailed', { message: 'Vous ne possédez pas toutes les cartes du meld.' });
      return;
    }
    
    // Validate: meld follows Rami rules
    if (!isValidMeld(meld)) {
      socket.emit('commitFailed', { 
        message: 'Meld invalide. Il faut 3+ cartes de même valeur OU 3+ cartes consécutives de même couleur.' 
      });
      return;
    }
    
    // Remove meld cards from player's hand
    players[socket.id].hand = hand.filter(c => !meld.includes(c));
    const committed = { player: socket.id, meld, targetCard };
    committedMelds.push(committed);
    io.emit('meldCommitted', committed);
    // Update the player hand
    socket.emit('updateHand', players[socket.id].hand);
    
    // Check for win condition (no cards left after meld)
    if (players[socket.id].hand.length === 0) {
      const winner = socket.id;
      const winnerName = players[socket.id].isBot ? winner : 'Vous';
      const isBot = players[socket.id].isBot;
      
      io.emit("gameWon", { winner, winnerName, isBot });
      
      // Reset game state
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      committedMelds = [];
      discardPile = [];
      
      console.log(`${winnerName} a gagné!`);
      return; // Don't continue turn
    }
  });

  // Add card to existing meld
  socket.on('addToMeld', ({ meldIndex, cards }) => {
    // Validate: player has drawn a card this turn
    if (!gameState.hasDrawn) {
      socket.emit('commitFailed', { message: 'Vous devez piocher une carte avant d\'ajouter à une combinaison.' });
      return;
    }

    // Validate: meld exists
    if (meldIndex < 0 || meldIndex >= committedMelds.length) {
      socket.emit('commitFailed', { message: 'Combinaison invalide.' });
      return;
    }

    // Validate: player owns the cards
    const hand = players[socket.id].hand;
    const ownsAll = cards.every(c => hand.includes(c));
    if (!ownsAll) {
      socket.emit('commitFailed', { message: 'Vous ne possédez pas toutes les cartes.' });
      return;
    }

    // Get the existing meld and create new combined meld
    const existingMeld = committedMelds[meldIndex];
    const newMeld = [...existingMeld.meld, ...cards];

    // Validate: new combined meld is still valid
    if (!isValidMeld(newMeld)) {
      socket.emit('commitFailed', { 
        message: 'Les cartes ajoutées ne forment pas une combinaison valide avec le meld existant.' 
      });
      return;
    }

    // Update the meld
    committedMelds[meldIndex].meld = newMeld;
    
    // Remove cards from player's hand
    players[socket.id].hand = hand.filter(c => !cards.includes(c));
    
    // Broadcast the update
    io.emit('meldUpdated', { meldIndex, newMeld, addedBy: socket.id });
    socket.emit('updateHand', players[socket.id].hand);
    
    // Check for win condition (no cards left after adding to meld)
    if (players[socket.id].hand.length === 0) {
      const winner = socket.id;
      const winnerName = players[socket.id].isBot ? winner : 'Vous';
      const isBot = players[socket.id].isBot;
      
      io.emit("gameWon", { winner, winnerName, isBot });
      
      // Reset game state
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      committedMelds = [];
      discardPile = [];
      
      console.log(`${winnerName} a gagné!`);
      return; // Don't continue turn
    }
  });

  socket.on("disconnect", () => {
    console.log("Déconnexion :", socket.id);
    delete players[socket.id];
    
    // Remove from game state
    const index = gameState.playerOrder.indexOf(socket.id);
    if (index > -1) {
      gameState.playerOrder.splice(index, 1);
      if (gameState.playerOrder.length === 0) {
        gameState.gameStarted = false;
      }
    }
  });
});

// Lancer le serveur
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});

