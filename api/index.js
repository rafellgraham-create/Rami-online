const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const httpServer = createServer(app);

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

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true
});

// Setup socket handlers
require('./socketHandlers')(io);

// For Vercel, we need to export the app
module.exports = httpServer;
