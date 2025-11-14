const socket = io({
  transports: ['polling'], // Use polling instead of WebSocket for Vercel
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

const handDiv = document.getElementById("hand");
const drawBtn = document.getElementById("drawBtn");
const discardDiv = document.getElementById("discardPile");
const discardPileContainer = document.getElementById("discardPileContainer");
const addBotEasyBtn = document.getElementById("addBotEasyBtn");
const addBotMediumBtn = document.getElementById("addBotMediumBtn");
const addBotHardBtn = document.getElementById("addBotHardBtn");
const startGameBtn = document.getElementById("startGameBtn");
const stopGameBtn = document.getElementById("stopGameBtn");
const turnIndicator = document.getElementById("turnIndicator");

// meld state on client
let currentMeld = [];
let hoveredCard = null;
let melds = []; // list of committed melds to render
let discardPile = []; // track discard pile cards
let isMyTurn = false;
let gameStarted = false;
let customCardOrder = []; // Store custom ordering of cards

const meldsInner = document.querySelector('.melds-inner');

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
  // preserve the draw button inside the hand container
  const drawBtn = document.getElementById("drawBtn");
  handDiv.innerHTML = "";
  
  // Sync custom order with actual hand
  // Remove cards no longer in hand
  customCardOrder = customCardOrder.filter(card => hand.includes(card));
  
  // Add new cards that aren't in custom order yet
  hand.forEach(card => {
    if (!customCardOrder.includes(card)) {
      customCardOrder.push(card);
    }
  });
  
  // Render in custom order
  customCardOrder.forEach((card, index) => {
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
    
    div.onclick = () => socket.emit("discardCard", card);
    
    // mouse handlers to track hovered card
    div.addEventListener('mouseenter', () => {
      hoveredCard = card;
      div.classList.add('hovered');
    });
    div.addEventListener('mouseleave', () => {
      hoveredCard = null;
      div.classList.remove('hovered');
    });

    // reflect selection if card is part of currentMeld
    if (currentMeld.includes(card)) {
      div.classList.add('selected');
    }
    
    // Drag and drop handlers
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    
    handDiv.appendChild(div);
  });
  // re-attach the draw button at the end of the hand
  if (drawBtn) {
    // ensure draw button is the last child
    drawBtn.onclick = () => socket.emit("drawCard");
    handDiv.appendChild(drawBtn);
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

socket.on("initHand", (hand) => {
  renderHand(hand);
  renderDiscardPile(); // Initialize discard pile display
});

socket.on("updateHand", (hand) => {
  // find newly added card(s): if hand length increased, animate the last card(s)
  const prevCards = Array.from(document.querySelectorAll('#hand .card')).map(el => el.textContent);
  renderHand(hand);

  // apply enter animation to cards that are new
  const newCards = hand.filter(c => !prevCards.includes(c));
  if (newCards.length > 0) {
    // animate from right-to-left order: newest last
    newCards.forEach((cardText) => {
      // find matching card element (first occurrence)
      const el = Array.from(document.querySelectorAll('#hand .card')).find(e => e.textContent === cardText);
      if (el) {
        el.classList.add('enter');
        // after slide-in, play tone + bounce
        el.addEventListener('animationend', () => {
          el.classList.remove('enter');
          // small delay then bounce
          requestAnimationFrame(() => {
            el.classList.add('bounce');
            el.addEventListener('animationend', () => el.classList.remove('bounce'), { once: true });
          });
          // play audio; browsers require a user gesture before audio will play.
          playGentleTone();
          // scroll the hand to show the newly added card
          handDiv.scrollTo({ left: handDiv.scrollWidth, behavior: 'smooth' });
        }, { once: true });
      }
    });
  }
});

socket.on("playerDiscarded", ({ player, card }) => {
  // Display discard notification (optional)
  // discardDiv.innerHTML = `<p>Le joueur ${player} a défaussé ${card}</p>`;
});

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

// Listen for discard pile updates
socket.on("discardPileUpdate", (pile) => {
  discardPile = pile;
  renderDiscardPile();
});

// Click discard pile to draw from it
if (discardDiv) {
  discardDiv.onclick = () => {
    if (discardPile.length > 0) {
      socket.emit("drawFromDiscard");
    }
  };
}

drawBtn.onclick = () => {
  socket.emit("drawCard");
};

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
    
    // Make meld clickable to select it for adding cards
    container.onclick = () => {
      // Remove previous selection
      document.querySelectorAll('.meld.selected-meld').forEach(el => el.classList.remove('selected-meld'));
      // Select this meld
      container.classList.add('selected-meld');
      window.selectedMeldIndex = index;
      showToast(`Meld sélectionné. Appuyez sur 'E' pour sélectionner des cartes, puis 'A' pour les ajouter.`, 'info', 3000);
    };
    
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

// Keyboard handlers: 'e' to add hovered card to current meld, 'r' to commit meld
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'e' || ev.key === 'E') {
    if (hoveredCard) {
      const cardEls = Array.from(document.querySelectorAll('#hand .card'));
      const el = cardEls.find(x => x.textContent === hoveredCard);
      
      if (currentMeld.includes(hoveredCard)) {
        // Deselect if already selected
        currentMeld = currentMeld.filter(c => c !== hoveredCard);
        if (el) el.classList.remove('selected');
      } else {
        // Select if not already selected
        currentMeld.push(hoveredCard);
        if (el) el.classList.add('selected');
      }
    }
  }
  if (ev.key === 'r' || ev.key === 'R') {
    // commit current meld while mouse is over a select card (hoveredCard may be target)
    if (currentMeld.length > 0) {
      const target = hoveredCard || null;
      console.log('Attempting commitMeld payload:', { meld: currentMeld.slice(), targetCard: target });
      socket.emit('commitMeld', { meld: currentMeld.slice(), targetCard: target });
      // clear local selection; server will broadcast the committed meld
      currentMeld = [];
      // remove selected classes
      document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
    }
  }
  // 'a' to add selected cards to a meld (must click on a meld first)
  if (ev.key === 'a' || ev.key === 'A') {
    if (currentMeld.length > 0 && window.selectedMeldIndex !== undefined) {
      socket.emit('addToMeld', { meldIndex: window.selectedMeldIndex, cards: currentMeld.slice() });
      // clear local selection
      currentMeld = [];
      window.selectedMeldIndex = undefined;
      // remove selected classes
      document.querySelectorAll('#hand .card.selected').forEach(el => el.classList.remove('selected'));
      document.querySelectorAll('.meld.selected-meld').forEach(el => el.classList.remove('selected-meld'));
    } else if (currentMeld.length > 0) {
      showToast('Sélectionnez d\'abord un meld en cliquant dessus', 'error', 3000);
    }
  }
});

// receive meld broadcasts
socket.on('meldCommitted', (data) => {
  // data: { player, meld, targetCard }
  melds.push(data);
  renderMelds();
});

// receive meld update broadcasts
socket.on('meldUpdated', ({ meldIndex, newMeld, addedBy }) => {
  if (meldIndex >= 0 && meldIndex < melds.length) {
    melds[meldIndex].meld = newMeld;
    renderMelds();
    const isMe = addedBy === socket.id;
    showToast(isMe ? 'Cartes ajoutées au meld!' : 'Un joueur a ajouté des cartes au meld', 'success', 2000);
  }
});

// handle commit failures from server
socket.on('commitFailed', (err) => {
  console.warn('commit failed', err);
  showToast(err?.message || 'Commit failed');
});

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

// Bot controls
if (addBotEasyBtn) {
  addBotEasyBtn.onclick = () => {
    socket.emit('addBot', 'easy');
  };
}

if (addBotMediumBtn) {
  addBotMediumBtn.onclick = () => {
    socket.emit('addBot', 'medium');
  };
}

if (addBotHardBtn) {
  addBotHardBtn.onclick = () => {
    socket.emit('addBot', 'hard');
  };
}

if (startGameBtn) {
  startGameBtn.onclick = () => {
    socket.emit('startGame');
  };
}

if (stopGameBtn) {
  stopGameBtn.onclick = () => {
    if (confirm('Êtes-vous sûr de vouloir arrêter la partie?')) {
      socket.emit('stopGame');
    }
  };
}

// Game state listeners
socket.on('gameStarted', ({ playerOrder }) => {
  gameStarted = true;
  if (startGameBtn) startGameBtn.disabled = true;
  if (addBotEasyBtn) addBotEasyBtn.style.display = 'none';
  if (addBotMediumBtn) addBotMediumBtn.style.display = 'none';
  if (addBotHardBtn) addBotHardBtn.style.display = 'none';
  if (stopGameBtn) stopGameBtn.style.display = 'inline-block';
  showToast('La partie commence!', 'success', 2000);
});

socket.on('gameState', ({ gameStarted: started, currentPlayer }) => {
  gameStarted = started;
  if (started && startGameBtn) startGameBtn.disabled = true;
  if (started && addBotEasyBtn) addBotEasyBtn.disabled = true;
  if (started && addBotMediumBtn) addBotMediumBtn.disabled = true;
  if (started && addBotHardBtn) addBotHardBtn.disabled = true;
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
  
  if (drawBtn) {
    drawBtn.disabled = !isMyTurn;
  }
});

socket.on('playerJoined', ({ id, isBot, playerCount, botName }) => {
  if (isBot) {
    showToast(`${botName || 'Bot'} ajouté (${playerCount} joueurs)`, 'success', 2000);
  }
});

socket.on('botAction', ({ bot, action, card }) => {
  const message = card ? `Bot: ${action} ${card}` : `Bot: ${action}`;
  showToast(message, 'info', 2000);
});

// Handle game won
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
  if (stopGameBtn) stopGameBtn.style.display = 'none';
  
  // Clear turn indicator
  if (turnIndicator) {
    turnIndicator.textContent = message;
    turnIndicator.className = isMe ? 'my-turn' : '';
  }
});

// Handle game stopped
socket.on('gameStopped', () => {
  showToast('La partie a été arrêtée', 'info', 3000);
  
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
  if (stopGameBtn) stopGameBtn.style.display = 'none';
  
  // Clear turn indicator
  if (turnIndicator) {
    turnIndicator.textContent = '';
    turnIndicator.className = '';
  }
});
