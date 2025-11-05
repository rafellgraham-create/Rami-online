const socket = io();

const handDiv = document.getElementById("hand");
const drawBtn = document.getElementById("drawBtn");
const discardDiv = document.getElementById("discardPile");

function renderHand(hand) {
  handDiv.innerHTML = "";
  hand.forEach(card => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = card;
    div.onclick = () => socket.emit("discardCard", card);
    handDiv.appendChild(div);
  });
}

socket.on("initHand", (hand) => {
  renderHand(hand);
});

socket.on("updateHand", (hand) => {
  renderHand(hand);
});

socket.on("playerDiscarded", ({ player, card }) => {
  discardDiv.innerHTML = `<p>Le joueur ${player} a défaussé ${card}</p>`;
});

drawBtn.onclick = () => {
  socket.emit("drawCard");
};
