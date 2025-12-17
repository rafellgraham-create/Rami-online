// Game state
let players = {};
let deck = [];
let committedMelds = [];
let discardPile = [];
let bots = {};
let gameState = {
  currentPlayer: null,
  playerOrder: [],
  turnIndex: 0,
  gameStarted: false,
  hasDrawn: false
};

// Bot class
class RamiBot {
  constructor(id, io, difficulty = 'medium') {
    this.id = id;
    this.hand = [];
    this.io = io;
    this.difficulty = difficulty;
    
    if (difficulty === 'easy') {
      this.thinkTime = 2000;
      this.meldProbability = 0.5;
      this.addToMeldProbability = 0.3;
      this.smartDiscardProbability = 0.2;
    } else if (difficulty === 'medium') {
      this.thinkTime = 1500;
      this.meldProbability = 0.75;
      this.addToMeldProbability = 0.6;
      this.smartDiscardProbability = 0.5;
    } else if (difficulty === 'hard') {
      this.thinkTime = 1000;
      this.meldProbability = 0.95;
      this.addToMeldProbability = 0.9;
      this.smartDiscardProbability = 0.85;
    } else if (difficulty === 'realist') { 
      this.thinkTime = 400;
      this.meldProbability = 1.0;
      this.addToMeldProbability = 1.0;
      this.smartDiscardProbability = 1.0;
    }
  }

  async takeTurn() {
    await this.delay(this.thinkTime);
    
    const topDiscard = discardPile[discardPile.length - 1];
    const drawFromDiscard = topDiscard && Math.random() > 0.6;
    
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
    
    if (Math.random() < this.addToMeldProbability) {
      const cardsAdded = this.tryAddToExistingMelds();
      if (cardsAdded) {
        await this.delay(this.thinkTime * 0.5);
      }
    }
    
    if (Math.random() < this.meldProbability) {
      const meldCommitted = this.tryCommitMeld();
      if (meldCommitted) {
        await this.delay(this.thinkTime * 0.5);
      }
    }
    
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
    
    const cardToDiscard = this.chooseDiscard();
    this.hand = this.hand.filter(c => c !== cardToDiscard);
    players[this.id].hand = this.hand;
    discardPile.push(cardToDiscard);
    this.io.emit("botAction", { bot: this.id, action: 'défausser', card: cardToDiscard });
    this.io.emit("discardPileUpdate", discardPile);
    
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
    
    await this.delay(500);
    nextTurn(this.io);
  }

  chooseDiscard() {
    if (Math.random() < this.smartDiscardProbability) {
      return this.smartDiscard();
    }
    return this.hand[Math.floor(Math.random() * this.hand.length)];
  }
  
  smartDiscard() {
    const cardScores = this.hand.map(card => {
      let score = 0;
      
      const rank = card === '🃏' ? null : card.slice(0, -1);
      if (rank) {
        const sameRank = this.hand.filter(c => c !== '🃏' && c.slice(0, -1) === rank).length;
        score += sameRank * 2;
      }
      
      const suit = card === '🃏' ? null : card.slice(-1);
      if (suit) {
        const sameSuit = this.hand.filter(c => c !== '🃏' && c.slice(-1) === suit).length;
        score += sameSuit;
      }
      
      if (card === '🃏') score += 10;
      
      return { card, score };
    });
    
    cardScores.sort((a, b) => a.score - b.score);
    return cardScores[0].card;
  }

  tryCommitMeld() {
    const possibleMelds = this.findPossibleMelds();
    
    if (possibleMelds.length > 0) {
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
    
    const rankGroups = {};
    this.hand.forEach(card => {
      if (card === "🃏") return;
      const rank = card.slice(0, -1);
      if (!rankGroups[rank]) rankGroups[rank] = [];
      rankGroups[rank].push(card);
    });
    
    for (const rank in rankGroups) {
      const cards = rankGroups[rank];
      if (cards.length >= 3) {
        melds.push(cards.slice(0, 3));
      }
    }
    
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
        cards.sort((a, b) => {
          const rankA = values.indexOf(a.slice(0, -1));
          const rankB = values.indexOf(b.slice(0, -1));
          return rankA - rankB;
        });
        
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
            melds.push(run.slice(0, 3));
            break;
          }
        }
      }
    }
    
    return melds;
  }

  tryAddToExistingMelds() {
    for (let i = 0; i < committedMelds.length; i++) {
      const existingMeld = committedMelds[i];
      
      for (const card of this.hand) {
        const testMeld = [...existingMeld.meld, card];
        
        if (isValidMeld(testMeld)) {
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

// Deck functions
function initDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["A","2","3","4","5","6","7","8","9","10","V","D","R"];
  // Clear existing deck by mutating it (not reassigning) so all references stay in sync
  deck.length = 0;
  for (let s of suits) {
    for (let v of values) {
      deck.push(v + s);
    }
  }
  deck.push("🃏");
  deck.push("🃏");
  // Remove any undefined/null values that might have snuck in
  const filtered = deck.filter(c => c !== undefined && c !== null);
  deck.length = 0;
  deck.push(...filtered);
  deck.sort(() => Math.random() - 0.5);
  console.log("Deck initialisé:", deck.length, "cartes");
}

// Meld validation functions
function isValidMeld(meld) {
  if (meld.length < 3) return false;
  return isValidSet(meld) || isValidRun(meld);
}

function isValidSet(meld) {
  if (meld.length < 3 || meld.length > 4) return false;
  
  const nonJokers = meld.filter(card => card !== "🃏");
  if (nonJokers.length === 0) return false;
  
  const ranks = nonJokers.map(card => card.slice(0, -1));
  const firstRank = ranks[0];
  
  if (!ranks.every(r => r === firstRank)) return false;
  
  const suits = nonJokers.map(card => card.slice(-1));
  const uniqueSuits = new Set(suits);
  return uniqueSuits.size === suits.length;
}

function isValidRun(meld) {
  if (meld.length < 3) return false;
  
  const nonJokers = meld.filter(card => card !== "🃏");
  if (nonJokers.length === 0) return false;
  
  const suits = nonJokers.map(card => card.slice(-1));
  const firstSuit = suits[0];
  
  if (!suits.every(s => s === firstSuit)) return false;
  
  const values = ["A","2","3","4","5","6","7","8","9","10","V","D","R"];
  const ranks = nonJokers.map(card => card.slice(0, -1));
  const indices = ranks.map(r => values.indexOf(r)).filter(i => i !== -1);
  
  indices.sort((a, b) => a - b);
  
  const jokerCount = meld.filter(card => card === "🃏").length;
  
  let gapsNeeded = 0;
  for (let i = 1; i < indices.length; i++) {
    const gap = indices[i] - indices[i-1] - 1;
    gapsNeeded += gap;
  }
  
  return gapsNeeded <= jokerCount;
}

// Turn management
function nextTurn(io) {
  if (!gameState.gameStarted || gameState.playerOrder.length === 0) return;
  
  gameState.turnIndex = (gameState.turnIndex + 1) % gameState.playerOrder.length;
  gameState.currentPlayer = gameState.playerOrder[gameState.turnIndex];
  gameState.hasDrawn = false;
  
  io.emit("turnStart", { player: gameState.currentPlayer });
  
  if (players[gameState.currentPlayer]?.isBot) {
    const bot = bots[gameState.currentPlayer];
    setTimeout(() => bot.takeTurn(), 1000);
  }
}

function startGame(io) {
  if (gameState.gameStarted) return;
  
  gameState.playerOrder = Object.keys(players);
  if (gameState.playerOrder.length === 0) return;
  
  // Always start from a fresh shuffled deck and fresh hands
  initDeck();
  gameState.playerOrder.forEach(playerId => {
    if (deck.length < 13) initDeck();
    players[playerId].hand = deck.splice(0, 13);
    
    if (players[playerId].isBot) {
      const bot = bots[playerId];
      if (bot) bot.hand = players[playerId].hand;
    } else {
      io.to(playerId).emit("initHand", players[playerId].hand);
    }
  });
  
  gameState.turnIndex = 0;
  gameState.currentPlayer = gameState.playerOrder[0];
  gameState.gameStarted = true;
  gameState.hasDrawn = false;
  
  io.emit("gameStarted", { playerOrder: gameState.playerOrder });
  io.emit("turnStart", { player: gameState.currentPlayer });
  
  if (players[gameState.currentPlayer]?.isBot) {
    const bot = bots[gameState.currentPlayer];
    setTimeout(() => bot.takeTurn(), 1000);
  }
}

module.exports = {
  players,
  deck,
  committedMelds,
  discardPile,
  bots,
  gameState,
  RamiBot,
  initDeck,
  isValidMeld,
  isValidSet,
  isValidRun,
  nextTurn,
  startGame
};
