// Initialize socket with error handling
let socket;

// Wait for Socket.io library to load
function initSocket() {
  if (typeof io === 'undefined') {
    console.error('[Error] Socket.io library not loaded! Retrying in 500ms...');
    setTimeout(initSocket, 500);
    return;
  }
  
  try {
    // Detect if we're on Vercel (production) or local
    const isVercel = window.location.hostname.includes('vercel.app') || window.location.hostname.includes('vercel.com');
    // On Vercel, Socket.io routes through /api/, but the path should still be /socket.io/
    const socketPath = '/socket.io/';
    
    console.log('[Socket] Initializing connection to', window.location.origin, 'path:', socketPath, 'isVercel:', isVercel);
    
    // On Vercel, use only polling as WebSocket doesn't work well with serverless functions
    const transports = isVercel ? ['polling'] : ['polling', 'websocket'];
    
    socket = io(window.location.origin, {
      transports: transports,
  reconnection: true,
  reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 5000,
      path: socketPath,
      forceNew: false,
      upgrade: !isVercel, // Don't upgrade to WebSocket on Vercel
      timeout: 20000
    });

    // Debug connection
    socket.on('connect', () => {
      console.log('[Socket] ✅ Connected:', socket.id);
      // Show welcome modal on reconnection (no pre-filling)
      if (welcomeModal && !welcomeModal.classList.contains('show')) {
        welcomeModal.classList.add('show');
        if (playerNameInput) {
          playerNameInput.value = ''; // Clear input
        }
      }
      // Send player name when connected (only if modal is closed)
      if (playerName && welcomeModal && !welcomeModal.classList.contains('show')) {
        safeEmit('setPlayerName', playerName);
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket] ❌ Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] ❌ Connection error:', error);
      console.error('[Socket] Error details:', {
        message: error.message,
        type: error.type,
        description: error.description
      });
      
      // Show user-friendly error message
      if (document.getElementById('toasts')) {
        showToast('Impossible de se connecter au serveur. Vercel a des limitations avec Socket.io. Essayez de rafraîchir la page ou utilisez Railway/Render pour un meilleur support WebSocket.', 'error', 8000);
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] ✅ Reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] 🔄 Reconnection attempt', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.error('[Socket] ❌ Reconnection error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('[Socket] ❌ Reconnection failed after all attempts');
    });

    // Attach all game event listeners
    attachSocketListeners();
  } catch (error) {
    console.error('[Error] Failed to initialize socket:', error);
    // Create a dummy socket object to prevent errors
    socket = {
      emit: () => console.warn('[Socket] Socket not connected, cannot emit'),
      on: () => {},
      connected: false
    };
  }
}

// Function to attach all socket event listeners
function attachSocketListeners() {
  if (!socket) {
    console.warn('[attachSocketListeners] Socket not initialized yet');
    return;
  }

  socket.on("initHand", (hand) => {
    renderHand(hand);
    renderDiscardPile(); // Initialize discard pile display
    console.log('[client] initHand', hand);
  });

  socket.on("updateHand", (hand) => {
    console.log('[client] updateHand', hand);
    // Preserve custom ordering: only add/remove cards that changed
    const validHand = hand.filter(card => card !== undefined && card !== null && typeof card === 'string');
    
    // Create a map of card counts from server hand
    const serverCardCounts = {};
    validHand.forEach(card => {
      serverCardCounts[card] = (serverCardCounts[card] || 0) + 1;
    });
    
    // Create a map of card counts from current custom order
    const currentCardCounts = {};
    customCardOrder.forEach(card => {
      currentCardCounts[card] = (currentCardCounts[card] || 0) + 1;
    });
    
    // Remove cards that are no longer in the server hand
    customCardOrder = customCardOrder.filter(card => {
      if (serverCardCounts[card] && serverCardCounts[card] > 0) {
        serverCardCounts[card]--;
        return true;
      }
      return false;
    });
    
    // Add new cards that appeared in the server hand (add them at the end)
    Object.keys(serverCardCounts).forEach(card => {
      const count = serverCardCounts[card];
      for (let i = 0; i < count; i++) {
        customCardOrder.push(card);
      }
    });
    
    renderHand(hand);
  });

  socket.on("playerDiscarded", ({ player, card }) => {
    // Display discard notification (optional)
    // discardDiv.innerHTML = `<p>Le joueur ${player} a défaussé ${card}</p>`;
  });

  socket.on("discardPileUpdate", (pile) => {
    discardPile = pile;
    renderDiscardPile();
  });

  socket.on('meldCommitted', (data) => {
    // data: { player, meld, targetCard }
    melds.push(data);
    renderMelds();
    // Request player names for all melds
    if (socket && socket.connected) {
      safeEmit('requestPlayerNames');
    }
  });
  
  socket.on('playerNameUpdated', ({ playerId, name }) => {
    // Update meld owner names
    document.querySelectorAll(`.meld-owner[data-player-id="${playerId}"]`).forEach(el => {
      if (playerId === socket.id) {
        el.textContent = 'Vous';
      } else {
        el.textContent = name;
      }
    });
  });

  socket.on('meldUpdated', ({ meldIndex, newMeld, addedBy }) => {
    if (meldIndex >= 0 && meldIndex < melds.length) {
      melds[meldIndex].meld = newMeld;
      renderMelds();
      const isMe = addedBy === socket.id;
      showToast(isMe ? 'Cartes ajoutées au meld!' : 'Un joueur a ajouté des cartes au meld', 'success', 2000);
    }
  });

  socket.on('commitFailed', (err) => {
    console.warn('commit failed', err);
    showToast(err?.message || 'Commit failed');
  });

  socket.on('gameStarted', ({ playerOrder }) => {
    gameStarted = true;
    if (startGameBtn) startGameBtn.disabled = true;
    if (addBotEasyBtn) addBotEasyBtn.style.display = 'none';
    if (addBotMediumBtn) addBotMediumBtn.style.display = 'none';
    if (addBotHardBtn) addBotHardBtn.style.display = 'none';
    if (addBotRealistBtn) addBotRealistBtn.style.display = 'none';
    if (removeAllBotsBtn) removeAllBotsBtn.style.display = 'none';
    if (stopGameBtn) stopGameBtn.style.display = 'inline-block';
    showToast('La partie commence!', 'success', 2000);
  });

  socket.on('gameState', ({ gameStarted: started, currentPlayer }) => {
    gameStarted = started;
    if (started && startGameBtn) startGameBtn.disabled = true;
    if (started && addBotEasyBtn) addBotEasyBtn.disabled = true;
    if (started && addBotMediumBtn) addBotMediumBtn.disabled = true;
    if (started && addBotHardBtn) addBotHardBtn.disabled = true;
    if (started && addBotRealistBtn) addBotRealistBtn.disabled = true;
  });

  socket.on('gameInProgress', ({ message, currentPlayer, playerCount }) => {
    const fullMessage = `${message} ${playerCount} joueur(s) participent. Tour de ${currentPlayer}.`;
    showToast(fullMessage, 'info', 6000);
    
    // Also update the turn indicator if it exists
    if (turnIndicator) {
      turnIndicator.textContent = `Partie en cours - Tour de ${currentPlayer}`;
      turnIndicator.className = '';
    }
  });

  socket.on('turnStart', ({ player }) => {
    isMyTurn = player === socket.id;
    
    if (turnIndicator) {
      if (isMyTurn) {
        turnIndicator.textContent = "C'est votre tour!";
        turnIndicator.className = 'my-turn';
      } else {
        const isBot = player.startsWith('bot_');
        turnIndicator.textContent = isBot ? "Tour du Bot..." : `Tour de ${player}`;
        turnIndicator.className = '';
      }
    }
    
    // Enable/disable hand interaction
    if (handDiv) {
      handDiv.style.opacity = isMyTurn ? '1' : '0.6';
      const cards = handDiv.querySelectorAll('.card');
      cards.forEach(card => {
        card.style.pointerEvents = isMyTurn ? 'auto' : 'none';
      });
    }
    
    ensureDrawButton();
    updateMobileButtons();
  });

  socket.on('playerJoined', ({ id, isBot, playerCount, botName }) => {
    if (isBot) {
      showToast(`${botName || 'Bot'} ajouté (${playerCount} joueurs)`, 'success', 2000);
      // Re-enable bot buttons after successful addition
      enableBotButtons();
    }
  });

  socket.on('allBotsRemoved', ({ removedCount, playerCount }) => {
    showToast(`${removedCount} bot(s) supprimé(s) (${playerCount} joueur(s) restant(s))`, 'info', 3000);
    // Re-enable bot buttons after removal
    enableBotButtons();
  });

  socket.on('botAction', ({ bot, action, card }) => {
    const message = card ? `Bot: ${action} ${card}` : `Bot: ${action}`;
    showToast(message, 'info', 2000);
  });

  socket.on('gameWon', ({ winner, winnerName, isBot }) => {
    const isMe = winner === socket.id;
    const message = isMe ? '🎉 Vous avez gagné! 🎉' : `${winnerName} a gagné!`;
    const type = isMe ? 'success' : 'info';
    
    showToast(message, type, 6000);
    
    // Reset UI state
    gameStarted = false;
    melds = [];
    currentMeld = [];
    window.selectedMeldIndex = undefined;
    discardPile = [];
    customCardOrder = [];
    
    renderMelds();
    renderDiscardPile();
    
    // Re-enable game controls
    if (startGameBtn) startGameBtn.disabled = false;
    if (addBotEasyBtn) addBotEasyBtn.style.display = 'inline-block';
    if (addBotMediumBtn) addBotMediumBtn.style.display = 'inline-block';
    if (addBotHardBtn) addBotHardBtn.style.display = 'inline-block';
    if (addBotRealistBtn) addBotRealistBtn.style.display = 'inline-block';
    if (removeAllBotsBtn) removeAllBotsBtn.style.display = 'inline-block';
    if (stopGameBtn) stopGameBtn.style.display = 'none';
    
    // Re-enable bot buttons
    enableBotButtons();
    
    // Clear turn indicator
    if (turnIndicator) {
      turnIndicator.textContent = message;
      turnIndicator.className = isMe ? 'my-turn' : '';
    }
  });

  socket.on('playerNameUpdated', ({ playerId, name }) => {
    // Update meld owner names
    document.querySelectorAll(`.meld-owner[data-player-id="${playerId}"]`).forEach(el => {
      if (playerId === socket.id) {
        el.textContent = 'Vous';
      } else {
        el.textContent = name;
      }
    });
  });

  socket.on('gameStopped', (data) => {
    let message = 'La partie a été arrêtée';
    if (data && data.reason === 'playerDisconnected') {
      message = `La partie a été arrêtée car ${data.playerName || 'un joueur'} a quitté la partie`;
    } else if (data && data.reason === 'timeout') {
      message = `La partie a été arrêtée car ${data.playerName || 'un joueur'} n'a pas joué dans les 60 secondes`;
    }
    showToast(message, 'info', 4000);
    
    // Reset UI state
    gameStarted = false;
    melds = [];
    currentMeld = [];
    window.selectedMeldIndex = undefined;
    discardPile = [];
    customCardOrder = [];
    
    renderMelds();
    renderDiscardPile();
    
    // Re-enable game controls
    if (startGameBtn) startGameBtn.disabled = false;
    if (addBotEasyBtn) addBotEasyBtn.style.display = 'inline-block';
    if (addBotMediumBtn) addBotMediumBtn.style.display = 'inline-block';
    if (addBotHardBtn) addBotHardBtn.style.display = 'inline-block';
    if (addBotRealistBtn) addBotRealistBtn.style.display = 'inline-block';
    if (removeAllBotsBtn) removeAllBotsBtn.style.display = 'inline-block';
    if (stopGameBtn) stopGameBtn.style.display = 'none';
    
    // Re-enable bot buttons
    enableBotButtons();
    
    // Clear turn indicator
    if (turnIndicator) {
      turnIndicator.textContent = '';
      turnIndicator.className = '';
    }
  });
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSocket);
} else {
  initSocket();
}

const handDiv = document.getElementById("hand");
const drawBtn = document.getElementById("drawBtn");
const discardDiv = document.getElementById("discardPile");
const discardPileContainer = document.getElementById("discardPileContainer");
const addBotEasyBtn = document.getElementById("addBotEasyBtn");
const addBotMediumBtn = document.getElementById("addBotMediumBtn");
const addBotHardBtn = document.getElementById("addBotHardBtn");
const addBotRealistBtn = document.getElementById("addBotRealistBtn");
const removeAllBotsBtn = document.getElementById("removeAllBotsBtn");
const startGameBtn = document.getElementById("startGameBtn");
const stopGameBtn = document.getElementById("stopGameBtn");
const turnIndicator = document.getElementById("turnIndicator");
const handCountSpan = document.getElementById("handCount");
const welcomeModal = document.getElementById("welcomeModal");
const playerNameInput = document.getElementById("playerNameInput");
const enterGameBtn = document.getElementById("enterGameBtn");

// Player name (not stored, must be entered each time)
let playerName = '';

// meld state on client
let currentMeld = [];
let hoveredCard = null;
let lastTappedCard = null; // For mobile: track last tapped card
let melds = []; // list of committed melds to render
let discardPile = []; // track discard pile cards
let isMyTurn = false;
let gameStarted = false;
let customCardOrder = []; // Store custom ordering of cards

// Detect if we're on mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                (window.innerWidth <= 768);

const meldsInner = document.querySelector('.melds-inner');

// Helper function to check socket connection before emitting
function safeEmit(event, data) {
  if (!socket || !socket.connected) {
    console.error('[Socket] Not connected, cannot emit:', event);
    showToast('Connexion perdue. Veuillez rafraîchir la page.', 'error', 4000);
    return false;
  }
  socket.emit(event, data);
  return true;
}

function ensureDrawButton() {
  if (!handDiv || !drawBtn) return;
  drawBtn.onclick = () => {
    if (!isMyTurn) {
      showToast('Patientez, ce n’est pas encore votre tour.', 'info', 1500);
      return;
    }
    safeEmit("drawCard");
  };
  drawBtn.disabled = !isMyTurn;
  handDiv.appendChild(drawBtn);
}

if (drawBtn) {
  drawBtn.disabled = true;
}

// Audio setup (Web Audio) - create on demand to respect autoplay policies
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playGentleTone() {
  try {
    ensureAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, audioCtx.currentTime); // high gentle ping
    g.gain.setValueAtTime(0, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    // if audio fails, silently ignore (older browsers)
    console.warn('Audio play failed', e);
  }
}

function renderHand(hand) {
  if (handCountSpan) {
    handCountSpan.textContent = String(hand.length);
  }
  console.log('[renderHand] Rendering', hand.length, 'cards:', hand);
  // preserve the draw button inside the hand container
  handDiv.innerHTML = "";
  
  // Filter out any undefined/null cards before rendering
  const validHand = hand.filter(card => card !== undefined && card !== null && typeof card === 'string');
  if (validHand.length !== hand.length) {
    console.warn('[renderHand] Filtered out', hand.length - validHand.length, 'invalid cards');
  }
  
  // Ensure customCardOrder is initialized if empty (first time)
  if (customCardOrder.length === 0) {
    customCardOrder = validHand.slice();
  }
  
  // Render cards in custom order (preserving user's organization)
  // customCardOrder is already updated by updateHand to match server hand
  customCardOrder.forEach((card, index) => {
    if (!card || typeof card !== 'string') {
      console.error('[renderHand] Skipping invalid card:', card);
      return;
    }
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.card = card;
    div.dataset.index = index;
    div.textContent = card;
    div.draggable = true;
    
    // Add red class for hearts and diamonds
    const suit = card.slice(-1);
    if (suit === '♥' || suit === '♦') {
      div.classList.add('red');
    }
    
    // mouse handlers to track hovered card (desktop only)
    if (!isMobile) {
    div.addEventListener('mouseenter', () => {
      hoveredCard = card;
      div.classList.add('hovered');
    });
    div.addEventListener('mouseleave', () => {
      hoveredCard = null;
      div.classList.remove('hovered');
    });
    }

    // Mobile: tap to mark card as target (for operations), not to select for meld
    if (isMobile) {
      div.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Remove target class from all cards
        document.querySelectorAll('#hand .card').forEach(c => c.classList.remove('target'));
        // Mark this card as target
        lastTappedCard = card;
        div.classList.add('target');
        updateMobileButtons();
      });
      
      // Also support click for hybrid devices
      div.addEventListener('click', (e) => {
        if (isMobile) {
          e.preventDefault();
          e.stopPropagation();
          // Remove target class from all cards
          document.querySelectorAll('#hand .card').forEach(c => c.classList.remove('target'));
          // Mark this card as target
          lastTappedCard = card;
          div.classList.add('target');
          updateMobileButtons();
        }
      });
    }

    // reflect selection if card is part of currentMeld
    if (currentMeld.includes(card)) {
      div.classList.add('selected');
    }
    
    // reflect target if card is the last tapped card (mobile)
    if (isMobile && lastTappedCard === card) {
      div.classList.add('target');
    }
    
    // Drag and drop handlers (desktop only, or allow on mobile for reordering)
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    
    handDiv.appendChild(div);
  });
  // re-attach the draw button at the end of the hand
  ensureDrawButton();
  
  // Update mobile buttons state
  updateMobileButtons();
  
  // Debug: verify cards were actually rendered
  const renderedCards = handDiv.querySelectorAll('.card').length;
  console.log('[renderHand] Actually rendered', renderedCards, 'card elements in DOM');
  if (renderedCards !== hand.length) {
    console.error('[renderHand] MISMATCH! Expected', hand.length, 'cards but rendered', renderedCards);
  }
}

// Drag and drop variables
let draggedCard = null;

function handleDragStart(e) {
  draggedCard = e.target;
  e.target.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  if (draggedCard !== e.target && e.target.classList.contains('card')) {
    // Get the card values being reordered
    const draggedCardValue = draggedCard.dataset.card;
    const targetCardValue = e.target.dataset.card;
    
    // Update customCardOrder array
    const draggedIndex = customCardOrder.indexOf(draggedCardValue);
    const targetIndex = customCardOrder.indexOf(targetCardValue);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove from old position
      customCardOrder.splice(draggedIndex, 1);
      
      // Insert at new position
      const newTargetIndex = customCardOrder.indexOf(targetCardValue);
      if (draggedIndex < targetIndex) {
        customCardOrder.splice(newTargetIndex + 1, 0, draggedCardValue);
      } else {
        customCardOrder.splice(newTargetIndex, 0, draggedCardValue);
      }
    }
    
    // Reorder the visual elements
    const cards = Array.from(handDiv.querySelectorAll('.card'));
    const draggedDOMIndex = cards.indexOf(draggedCard);
    const targetDOMIndex = cards.indexOf(e.target);
    
    if (draggedDOMIndex < targetDOMIndex) {
      e.target.parentNode.insertBefore(draggedCard, e.target.nextSibling);
    } else {
      e.target.parentNode.insertBefore(draggedCard, e.target);
    }
  }
  
  return false;
}

function handleDragEnd(e) {
  e.target.style.opacity = '1';
  
  // Update all cards to remove drag-over styling
  const cards = handDiv.querySelectorAll('.card');
  cards.forEach(card => {
    card.classList.remove('over');
  });
}

// Socket listeners are now attached in attachSocketListeners() function

// Render discard pile
function renderDiscardPile() {
  if (!discardDiv) return;
  discardDiv.innerHTML = '';
  if (discardPile.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'pile-placeholder';
    placeholder.textContent = 'Aucune carte';
    discardDiv.appendChild(placeholder);
  } else {
    // Show only the top card
    const topCard = discardPile[discardPile.length - 1];
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.textContent = topCard;
    
    // Add red class for hearts and diamonds
    const suit = topCard.slice(-1);
    if (suit === '♥' || suit === '♦') {
      cardEl.classList.add('red');
    }
    
    discardDiv.appendChild(cardEl);
  }
}

// Listen for discard pile updates (moved to attachSocketListeners)

// Click discard pile to draw from it
if (discardDiv) {
  discardDiv.onclick = () => {
    if (discardPile.length > 0) {
      safeEmit("drawFromDiscard");
    }
  };
}

ensureDrawButton();

// Render melds area
function renderMelds() {
  if (!meldsInner) return;
  meldsInner.innerHTML = '';
  if (melds.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'Aucune combinaison pour le moment';
    meldsInner.appendChild(p);
    return;
  }

  melds.forEach((m, index) => {
    const container = document.createElement('div');
    container.className = 'meld';
    container.dataset.meldIndex = index;
    
    // Make meld clickable/tappable to select it for adding cards
    container.onclick = () => {
      // If this meld is already selected, deselect it
      if (window.selectedMeldIndex === index) {
        container.classList.remove('selected-meld');
        window.selectedMeldIndex = undefined;
        showToast('Meld désélectionné', 'info', 1500);
        updateMobileButtons();
        return;
      }
      
      // Remove previous selection
      document.querySelectorAll('.meld.selected-meld').forEach(el => el.classList.remove('selected-meld'));
      // Select this meld
      container.classList.add('selected-meld');
      window.selectedMeldIndex = index;
      const message = isMobile 
        ? 'Meld sélectionné. Sélectionnez des cartes puis appuyez sur "Ajouter à suite".'
        : `Meld sélectionné. Appuyez sur 'S' pour sélectionner des cartes, puis 'A' pour les ajouter.`;
      showToast(message, 'info', 3000);
      updateMobileButtons();
    };
    
    // Also support touch for mobile
    if (isMobile) {
      container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        container.click();
      });
    }
    
    const owner = document.createElement('div');
    owner.className = 'meld-owner';
    owner.textContent = m.player === socket.id ? 'Vous' : `Joueur ${m.player}`;
    container.appendChild(owner);
    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'meld-cards';
    m.meld.forEach(c => {
      const cd = document.createElement('div');
      cd.className = 'card';
      cd.textContent = c;
      
      // Add red class for hearts and diamonds
      const suit = c.slice(-1);
      if (suit === '♥' || suit === '♦') {
        cd.classList.add('red');
      }
      
      cardsWrap.appendChild(cd);
    });
    container.appendChild(cardsWrap);
    meldsInner.appendChild(container);
  });
}

// Keyboard handlers:
// 's' to select/deselect hovered card
// 'z' to commit meld (create a suite with selected cards)
// 'a' to add selected cards to an existing meld (must click on a meld first)
// 'd' to discard the hovered card
document.addEventListener('keydown', (ev) => {
  // 's' to select/deselect hovered card (or last tapped on mobile)
  if (ev.key === 's' || ev.key === 'S') {
    const cardToSelect = hoveredCard || (isMobile ? lastTappedCard : null);
    if (cardToSelect) {
      const cardEls = Array.from(document.querySelectorAll('#hand .card'));
      const el = cardEls.find(x => x.textContent === cardToSelect);
      
      if (currentMeld.includes(cardToSelect)) {
        // Deselect if already selected
        currentMeld = currentMeld.filter(c => c !== cardToSelect);
        if (el) el.classList.remove('selected');
      } else {
        // Select if not already selected
        currentMeld.push(cardToSelect);
        if (el) el.classList.add('selected');
      }
      if (isMobile) {
        updateMobileButtons();
      }
    }
  }
  // 'z' to commit meld (create a suite with selected cards)
  if (ev.key === 'z' || ev.key === 'Z') {
    if (currentMeld.length > 0) {
      const target = hoveredCard || (isMobile ? lastTappedCard : null);
      console.log('Attempting commitMeld payload:', { meld: currentMeld.slice(), targetCard: target });
      safeEmit('commitMeld', { meld: currentMeld.slice(), targetCard: target });
      // clear local selection; server will broadcast the committed meld
      currentMeld = [];
      // remove selected classes
      document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
      if (isMobile) {
        lastTappedCard = null;
        updateMobileButtons();
      }
    }
  }
  // 'a' to add selected cards to a meld (must click on a meld first)
  if (ev.key === 'a' || ev.key === 'A') {
    if (currentMeld.length > 0 && window.selectedMeldIndex !== undefined) {
      safeEmit('addToMeld', { meldIndex: window.selectedMeldIndex, cards: currentMeld.slice() });
      // clear local selection
      currentMeld = [];
      window.selectedMeldIndex = undefined;
      // remove selected classes
      document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
      document.querySelectorAll('.meld.selected-meld').forEach(el => el.classList.remove('selected-meld'));
      if (isMobile) {
        lastTappedCard = null;
        updateMobileButtons();
      }
    } else if (currentMeld.length > 0) {
      showToast('Sélectionnez d\'abord un meld en cliquant/appuyant dessus', 'error', 3000);
    }
  }
  // 'd' to discard the hovered card (or last tapped on mobile)
  if (ev.key === 'd' || ev.key === 'D') {
    const cardToDiscard = hoveredCard || (isMobile ? lastTappedCard : null);
    if (cardToDiscard && isMyTurn) {
      safeEmit("discardCard", cardToDiscard);
      // Remove from selection if it was selected
      currentMeld = currentMeld.filter(c => c !== cardToDiscard);
      const cardEls = Array.from(document.querySelectorAll('#hand .card'));
      const el = cardEls.find(x => x.textContent === cardToDiscard);
      if (el) el.classList.remove('selected');
      if (isMobile) {
        lastTappedCard = null;
        updateMobileButtons();
      }
    } else if (!isMyTurn) {
      showToast('Patientez, ce n\'est pas encore votre tour.', 'info', 1500);
    } else if (!cardToDiscard) {
      showToast(isMobile ? 'Appuyez sur une carte pour la défausser' : 'Survolez une carte pour la défausser avec "D"', 'info', 2000);
    }
  }
});

// Meld and game event listeners moved to attachSocketListeners()

// small toast utility
const toasts = document.getElementById('toasts');
function showToast(text, type = 'error', ttl = 4000) {
  if (!toasts) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  toasts.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 300ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 350);
  }, ttl);
}

// Helper function to enable all bot buttons (used when game ends)
function enableBotButtons() {
  if (addBotEasyBtn && !gameStarted) addBotEasyBtn.disabled = false;
  if (addBotMediumBtn && !gameStarted) addBotMediumBtn.disabled = false;
  if (addBotHardBtn && !gameStarted) addBotHardBtn.disabled = false;
  if (addBotRealistBtn && !gameStarted) addBotRealistBtn.disabled = false;
}

// Bot controls - each click adds exactly one bot
if (addBotEasyBtn) {
  addBotEasyBtn.onclick = () => {
    safeEmit('addBot', 'easy');
  };
}

if (addBotMediumBtn) {
  addBotMediumBtn.onclick = () => {
    safeEmit('addBot', 'medium');
  };
}

if (addBotHardBtn) {
  addBotHardBtn.onclick = () => {
    safeEmit('addBot', 'hard');
  };
}

if (addBotRealistBtn) {
  addBotRealistBtn.onclick = () => {
    safeEmit('addBot', 'realist');
  };
}

if (removeAllBotsBtn) {
  removeAllBotsBtn.onclick = () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer tous les bots ?')) {
      safeEmit('removeAllBots');
    }
  };
}

if (startGameBtn) {
  startGameBtn.onclick = () => {
    safeEmit('startGame');
  };
}

if (stopGameBtn) {
  stopGameBtn.onclick = () => {
    if (confirm('Êtes-vous sûr de vouloir arrêter la partie?')) {
      safeEmit('stopGame');
    }
  };
}

// All game state listeners moved to attachSocketListeners()

// Ensure DOM is ready before verifying elements
document.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] Initializing...');
  console.log('[Debug] Elements check:', {
    handDiv: !!handDiv,
    drawBtn: !!drawBtn,
    startGameBtn: !!startGameBtn,
    socket: !!socket,
    socketConnected: socket?.connected,
    socketId: socket?.id
  });
  
  // Re-attach button handlers in case they weren't found initially
  if (addBotEasyBtn && !addBotEasyBtn.onclick) {
    addBotEasyBtn.onclick = () => safeEmit('addBot', 'easy');
  }
  if (addBotMediumBtn && !addBotMediumBtn.onclick) {
    addBotMediumBtn.onclick = () => safeEmit('addBot', 'medium');
  }
  if (addBotHardBtn && !addBotHardBtn.onclick) {
    addBotHardBtn.onclick = () => safeEmit('addBot', 'hard');
  }
  if (addBotRealistBtn && !addBotRealistBtn.onclick) {
    addBotRealistBtn.onclick = () => safeEmit('addBot', 'realist');
  }
  if (removeAllBotsBtn && !removeAllBotsBtn.onclick) {
    removeAllBotsBtn.onclick = () => {
      if (confirm('Êtes-vous sûr de vouloir supprimer tous les bots ?')) {
        safeEmit('removeAllBots');
      }
    };
  }
  if (startGameBtn && !startGameBtn.onclick) {
    startGameBtn.onclick = () => safeEmit('startGame');
  }
  if (stopGameBtn && !stopGameBtn.onclick) {
    stopGameBtn.onclick = () => {
      if (confirm('Êtes-vous sûr de vouloir arrêter la partie?')) {
        safeEmit('stopGame');
      }
    };
  }
  
  ensureDrawButton();
  
  // Help modal functionality
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const modalClose = document.querySelector('.modal-close');
  
  if (helpBtn && helpModal) {
    helpBtn.onclick = () => {
      helpModal.classList.add('show');
    };
  }
  
  if (modalClose) {
    modalClose.onclick = () => {
      helpModal.classList.remove('show');
    };
  }
  
  // Close modal when clicking outside of it
  if (helpModal) {
    helpModal.onclick = (e) => {
      if (e.target === helpModal) {
        helpModal.classList.remove('show');
      }
    };
  }
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && helpModal && helpModal.classList.contains('show')) {
      helpModal.classList.remove('show');
    }
  });
  
  // Mobile action buttons
  setupMobileActions();
  
  // Prevent clicks on buttons from deselecting cards (mobile)
  if (isMobile) {
    // Prevent event propagation from all buttons to avoid deselection
    document.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }
  
  // Welcome modal handling - always show on page load/reconnection
  if (welcomeModal && playerNameInput && enterGameBtn) {
    // Always show welcome modal (no pre-filling)
    welcomeModal.classList.add('show');
    playerNameInput.value = ''; // Clear input
    
    // Handle Enter button click
    enterGameBtn.onclick = () => {
      const name = playerNameInput.value.trim();
      if (name.length === 0) {
        showToast('Veuillez entrer un nom', 'error', 2000);
        return;
      }
      if (name.length > 20) {
        showToast('Le nom ne peut pas dépasser 20 caractères', 'error', 2000);
        return;
      }
      playerName = name;
      welcomeModal.classList.remove('show');
      if (socket && socket.connected) {
        safeEmit('setPlayerName', playerName);
      }
    };
    
    // Handle Enter key in input
    playerNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        enterGameBtn.click();
      }
    });
  }
  
  // Check if socket is connected, if not, show error
  if (!socket || !socket.connected) {
    console.warn('[DOMContentLoaded] Socket not connected yet, waiting...');
    socket.once('connect', () => {
      console.log('[DOMContentLoaded] Socket connected after DOM ready');
      // Send player name when connected
      if (playerName) {
        safeEmit('setPlayerName', playerName);
      }
    });
  }
});

// Function to update mobile button states
function updateMobileButtons() {
  if (!isMobile) return;
  
  const mobileSelectBtn = document.getElementById('mobileSelectBtn');
  const mobileMeldBtn = document.getElementById('mobileMeldBtn');
  const mobileAddToMeldBtn = document.getElementById('mobileAddToMeldBtn');
  const mobileDiscardBtn = document.getElementById('mobileDiscardBtn');
  
  // Buttons might not exist yet, so check
  if (!mobileMeldBtn && !mobileAddToMeldBtn && !mobileDiscardBtn) return;
  
  if (mobileSelectBtn) {
    mobileSelectBtn.disabled = !isMyTurn || !lastTappedCard;
  }
  
  if (mobileMeldBtn) {
    mobileMeldBtn.disabled = !isMyTurn || currentMeld.length === 0;
  }
  
  if (mobileAddToMeldBtn) {
    mobileAddToMeldBtn.disabled = !isMyTurn || currentMeld.length === 0 || window.selectedMeldIndex === undefined;
  }
  
  if (mobileDiscardBtn) {
    mobileDiscardBtn.disabled = !isMyTurn || !lastTappedCard;
  }
}

// Setup mobile action buttons
function setupMobileActions() {
  if (!isMobile) return;
  
  const mobileSelectBtn = document.getElementById('mobileSelectBtn');
  const mobileMeldBtn = document.getElementById('mobileMeldBtn');
  const mobileAddToMeldBtn = document.getElementById('mobileAddToMeldBtn');
  const mobileDiscardBtn = document.getElementById('mobileDiscardBtn');
  
  // Select button: add last tapped card to selection for meld
  if (mobileSelectBtn) {
    mobileSelectBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (lastTappedCard) {
        const cardEls = Array.from(document.querySelectorAll('#hand .card'));
        const el = cardEls.find(x => x.textContent === lastTappedCard);
        
        if (currentMeld.includes(lastTappedCard)) {
          // Deselect if already selected
          currentMeld = currentMeld.filter(c => c !== lastTappedCard);
          if (el) el.classList.remove('selected');
        } else {
          // Select for meld
          currentMeld.push(lastTappedCard);
          if (el) el.classList.add('selected');
        }
        updateMobileButtons();
      } else {
        showToast('Appuyez sur une carte d\'abord', 'info', 2000);
      }
    };
  }
  
  // Create meld button
  if (mobileMeldBtn) {
    mobileMeldBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentMeld.length > 0 && isMyTurn) {
        const target = lastTappedCard || null;
        safeEmit('commitMeld', { meld: currentMeld.slice(), targetCard: target });
        currentMeld = [];
        document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('#hand .card.target').forEach(el => el.classList.remove('target'));
        lastTappedCard = null;
        updateMobileButtons();
      }
    };
  }
  
  // Add to meld button
  if (mobileAddToMeldBtn) {
    mobileAddToMeldBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentMeld.length > 0 && window.selectedMeldIndex !== undefined && isMyTurn) {
        safeEmit('addToMeld', { meldIndex: window.selectedMeldIndex, cards: currentMeld.slice() });
  currentMeld = [];
  window.selectedMeldIndex = undefined;
        document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('#hand .card.target').forEach(el => el.classList.remove('target'));
        document.querySelectorAll('.meld.selected-meld').forEach(el => el.classList.remove('selected-meld'));
        lastTappedCard = null;
        updateMobileButtons();
      } else if (currentMeld.length > 0) {
        showToast('Sélectionnez d\'abord un meld en appuyant dessus', 'error', 3000);
      }
    };
  }
  
  // Discard button
  if (mobileDiscardBtn) {
    mobileDiscardBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMyTurn) {
        let cardToDiscard = null;
        if (lastTappedCard) {
          cardToDiscard = lastTappedCard;
        } else if (currentMeld.length > 0) {
          // Discard the last selected card
          cardToDiscard = currentMeld[currentMeld.length - 1];
        }
        
        if (cardToDiscard) {
          safeEmit("discardCard", cardToDiscard);
          // Remove from selection if it was selected
          currentMeld = currentMeld.filter(c => c !== cardToDiscard);
          const cardEls = Array.from(document.querySelectorAll('#hand .card'));
          const el = cardEls.find(x => x.textContent === cardToDiscard);
          if (el) {
            el.classList.remove('selected');
            el.classList.remove('target');
          }
          lastTappedCard = null;
          updateMobileButtons();
        } else {
          showToast('Appuyez sur une carte puis sur "Défausser"', 'info', 2000);
        }
      } else {
        showToast('Patientez, ce n\'est pas encore votre tour.', 'info', 1500);
      }
    };
  }
  
  // Update buttons on turn change
  const originalTurnStart = socket?.on;
  // This will be handled in the turnStart event listener
}

// Debug: Verify all elements are found (also log immediately)
console.log('[Debug] Elements check (immediate):', {
  handDiv: !!handDiv,
  drawBtn: !!drawBtn,
  startGameBtn: !!startGameBtn,
  socket: !!socket,
  socketConnected: socket?.connected
});
