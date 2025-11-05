const socket = io();

const handDiv = document.getElementById("hand");
const drawBtn = document.getElementById("drawBtn");
const discardDiv = document.getElementById("discardPile");
const discardPileContainer = document.getElementById("discardPileContainer");

// meld state on client
let currentMeld = [];
let hoveredCard = null;
let melds = []; // list of committed melds to render
let discardPile = []; // track discard pile cards

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
  hand.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.card = card;
    div.textContent = card;
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
    handDiv.appendChild(div);
  });
  // re-attach the draw button at the end of the hand
  if (drawBtn) {
    // ensure draw button is the last child
    drawBtn.onclick = () => socket.emit("drawCard");
    handDiv.appendChild(drawBtn);
  }
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

  melds.forEach(m => {
    const container = document.createElement('div');
    container.className = 'meld';
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
      cardsWrap.appendChild(cd);
    });
    container.appendChild(cardsWrap);
    meldsInner.appendChild(container);
  });
}

// Keyboard handlers: 'e' to add hovered card to current meld, 'r' to commit meld
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'e' || ev.key === 'E') {
    if (hoveredCard && !currentMeld.includes(hoveredCard)) {
      currentMeld.push(hoveredCard);
      // re-render hand to show selection
      // get last known hand from DOM by reading hand text nodes (simpler: request server to re-send hand?)
      // We'll just toggle class on matching card elements in DOM
      const cardEls = Array.from(document.querySelectorAll('#hand .card'));
      const el = cardEls.find(x => x.textContent === hoveredCard && !x.classList.contains('selected'));
      if (el) el.classList.add('selected');
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
});

// receive meld broadcasts
socket.on('meldCommitted', (data) => {
  // data: { player, meld, targetCard }
  melds.push(data);
  renderMelds();
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
