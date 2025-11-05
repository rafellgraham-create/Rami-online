const socket = io();

const handDiv = document.getElementById("hand");
const drawBtn = document.getElementById("drawBtn");
const discardDiv = document.getElementById("discardPile");

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
    div.textContent = card;
    div.onclick = () => socket.emit("discardCard", card);
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
  discardDiv.innerHTML = `<p>Le joueur ${player} a défaussé ${card}</p>`;
});

drawBtn.onclick = () => {
  socket.emit("drawCard");
};
