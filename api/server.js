const express = require("express");
const path = require("path");

const app = express();

// Import game logic
const {
  players,
  gameState
} = require('./gameLogic');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    players: Object.keys(players).length,
    gameStarted: gameState.gameStarted
  });
});

// Serve the main HTML for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = app;
