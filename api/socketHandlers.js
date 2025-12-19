const {
  players,
  deck,
  committedMelds,
  discardPile,
  bots,
  gameState,
  RamiBot,
  initDeck,
  isValidMeld,
  nextTurn,
  startGame
} = require('./gameLogic');

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Nouveau joueur connecté :", socket.id);

    // Add player
    players[socket.id] = { hand: [], isBot: false };

    // Start with empty hand; cards are dealt when the game starts
    players[socket.id].hand = [];
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
    socket.on("addBot", (difficulty = 'medium') => {
      // Prevent adding bots if game is started
      if (gameState.gameStarted) {
        socket.emit('commitFailed', { message: 'Impossible d\'ajouter un bot pendant une partie.' });
        return;
      }
      
      const botId = `bot_${Date.now()}`;
      const difficultyName = difficulty === 'easy' ? 'Facile' : 
                            difficulty === 'hard' ? 'Difficile' : 
                            difficulty === 'realist' ? 'Réaliste' : 'Moyen';
      const bot = new RamiBot(botId, io, difficulty);
      bots[botId] = bot;
      players[botId] = { hand: [], isBot: true, botDifficulty: difficulty, botName: `Bot (${difficultyName})` };
      
      // Deal cards to bot
      if (deck.length < 13) initDeck();
      players[botId].hand = deck.splice(0, 13);
      bot.hand = players[botId].hand;
      
      io.emit("playerJoined", { id: botId, isBot: true, playerCount: Object.keys(players).length, botDifficulty: difficulty, botName: `Bot (${difficultyName})` });
      console.log(`Bot ajouté (${difficultyName}):`, botId);
    });

    // Remove all bots
    socket.on("removeAllBots", () => {
      // Prevent removing bots if game is started
      if (gameState.gameStarted) {
        socket.emit('commitFailed', { message: 'Impossible de supprimer les bots pendant une partie.' });
        return;
      }
      
      const botIds = Object.keys(bots);
      let removedCount = 0;
      
      botIds.forEach(botId => {
        // Remove bot from bots object
        delete bots[botId];
        // Remove bot from players object
        delete players[botId];
        removedCount++;
      });
      
      console.log(`${removedCount} bot(s) supprimé(s)`);
      io.emit("allBotsRemoved", { removedCount, playerCount: Object.keys(players).length });
    });

    // Start game
    socket.on("startGame", () => {
      console.log("Démarrage de la partie");
      startGame(io);
    });

    // Stop game
    socket.on("stopGame", () => {
      console.log("Arrêt de la partie");
      
      // Reset game state
      gameState.gameStarted = false;
      gameState.currentPlayer = null;
      gameState.hasDrawn = false;
      gameState.turnIndex = 0;
      committedMelds.length = 0;
      discardPile.length = 0;
      initDeck();
      
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

    // Draw card
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
      if (deck.length === 0) {
        console.warn("Deck vide, réinitialisation...");
        initDeck();
      }
      console.log("Deck avant pioche:", deck.length, "cartes");
      const card = deck.pop();
      if (!card) {
        console.error("ERREUR: Deck vide après pop, réinitialisation d'urgence...");
        initDeck();
        const newCard = deck.pop();
        if (!newCard) {
          socket.emit('commitFailed', { message: 'Le paquet est vide. La partie est terminée.' });
          return;
        }
        players[socket.id].hand.push(newCard);
        players[socket.id].hand = players[socket.id].hand.filter(c => c !== undefined && c !== null);
        gameState.hasDrawn = true;
        console.log("Hand après pioche d'urgence:", players[socket.id].hand.length, "cartes:", players[socket.id].hand);
        socket.emit("updateHand", players[socket.id].hand);
        return;
      }
      players[socket.id].hand.push(card);
      // Remove any undefined cards that might have snuck in
      players[socket.id].hand = players[socket.id].hand.filter(c => c !== undefined && c !== null);
      gameState.hasDrawn = true;
      console.log("Hand après pioche:", players[socket.id].hand.length, "cartes:", players[socket.id].hand);
      socket.emit("updateHand", players[socket.id].hand);
    });

    // Draw from discard
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
      gameState.hasDrawn = true;
      socket.emit("updateHand", players[socket.id].hand);
      io.emit("discardPileUpdate", discardPile);
    });

    // Discard card
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
      
      // Check for win condition
      if (players[socket.id].hand.length === 0) {
        const isBot = players[socket.id].isBot;
        const winnerName = isBot ? `Bot ${socket.id}` : `Joueur ${socket.id}`;
        console.log(`${winnerName} a gagné!`);
        
        io.emit("gameWon", { 
          winner: socket.id, 
          winnerName: winnerName,
          isBot: isBot
        });
        
        gameState.gameStarted = false;
        gameState.currentPlayer = null;
        gameState.hasDrawn = false;
        committedMelds.length = 0;
        discardPile.length = 0;
        
        return;
      }
      
      nextTurn(io);
    });

    // Commit meld
    socket.on('commitMeld', ({ meld, targetCard }) => {
      if (!gameState.hasDrawn) {
        socket.emit('commitFailed', { message: 'Vous devez piocher une carte avant de poser une combinaison.' });
        return;
      }
      
      const hand = players[socket.id].hand;
      const ownsAll = meld.every(c => hand.includes(c));
      if (!ownsAll) {
        socket.emit('commitFailed', { message: 'Vous ne possédez pas toutes les cartes du meld.' });
        return;
      }
      
      if (!isValidMeld(meld)) {
        socket.emit('commitFailed', { 
          message: 'Meld invalide. Il faut 3+ cartes de même valeur OU 3+ cartes consécutives de même couleur.' 
        });
        return;
      }
      
      players[socket.id].hand = hand.filter(c => !meld.includes(c));
      const committed = { player: socket.id, meld, targetCard };
      committedMelds.push(committed);
      io.emit('meldCommitted', committed);
      socket.emit('updateHand', players[socket.id].hand);
      
      if (players[socket.id].hand.length === 0) {
        const winner = socket.id;
        const winnerName = players[socket.id].isBot ? winner : 'Vous';
        const isBot = players[socket.id].isBot;
        
        io.emit("gameWon", { winner, winnerName, isBot });
        
        gameState.gameStarted = false;
        gameState.currentPlayer = null;
        gameState.hasDrawn = false;
        committedMelds.length = 0;
        discardPile.length = 0;
        
        console.log(`${winnerName} a gagné!`);
        return;
      }
    });

    // Add to meld
    socket.on('addToMeld', ({ meldIndex, cards }) => {
      if (!gameState.hasDrawn) {
        socket.emit('commitFailed', { message: 'Vous devez piocher une carte avant d\'ajouter à une combinaison.' });
        return;
      }

      if (meldIndex < 0 || meldIndex >= committedMelds.length) {
        socket.emit('commitFailed', { message: 'Combinaison invalide.' });
        return;
      }

      const hand = players[socket.id].hand;
      const ownsAll = cards.every(c => hand.includes(c));
      if (!ownsAll) {
        socket.emit('commitFailed', { message: 'Vous ne possédez pas toutes les cartes.' });
        return;
      }

      const existingMeld = committedMelds[meldIndex];
      const newMeld = [...existingMeld.meld, ...cards];

      if (!isValidMeld(newMeld)) {
        socket.emit('commitFailed', { 
          message: 'Les cartes ajoutées ne forment pas une combinaison valide avec le meld existant.' 
        });
        return;
      }

      committedMelds[meldIndex].meld = newMeld;
      players[socket.id].hand = hand.filter(c => !cards.includes(c));
      
      io.emit('meldUpdated', { meldIndex, newMeld, addedBy: socket.id });
      socket.emit('updateHand', players[socket.id].hand);
      
      if (players[socket.id].hand.length === 0) {
        const winner = socket.id;
        const winnerName = players[socket.id].isBot ? winner : 'Vous';
        const isBot = players[socket.id].isBot;
        
        io.emit("gameWon", { winner, winnerName, isBot });
        
        gameState.gameStarted = false;
        gameState.currentPlayer = null;
        gameState.hasDrawn = false;
        committedMelds.length = 0;
        discardPile.length = 0;
        
        console.log(`${winnerName} a gagné!`);
        return;
      }
    });

    socket.on("disconnect", () => {
      console.log("Déconnexion :", socket.id);
      delete players[socket.id];
      
      const index = gameState.playerOrder.indexOf(socket.id);
      if (index > -1) {
        gameState.playerOrder.splice(index, 1);
        if (gameState.playerOrder.length === 0) {
          gameState.gameStarted = false;
        }
      }
    });
  });
};
