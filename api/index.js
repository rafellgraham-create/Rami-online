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
const publicPath = path.join(__dirname, "../public");
console.log("Public path:", publicPath);

// Explicitly serve CSS and JS files
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(publicPath, 'style.css'), (err) => {
    if (err) {
      console.error('Error serving style.css:', err);
      res.status(404).send('Not found');
    }
  });
});

app.get('/script.js', (req, res) => {
  res.sendFile(path.join(publicPath, 'script.js'), (err) => {
    if (err) {
      console.error('Error serving script.js:', err);
      res.status(404).send('Not found');
    }
  });
});

// Serve all other static files
app.use(express.static(publicPath, {
  maxAge: '1d',
  etag: true
}));

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
  allowEIO3: true,
  path: '/socket.io/',
  serveClient: false // We're using CDN for client library
});

// Setup socket handlers
require('./socketHandlers')(io);

// For Vercel, we need to export a handler
// Vercel serverless functions expect a handler, but Socket.io needs persistent connections
// So we export the httpServer which Vercel will use
module.exports = httpServer;

// Also export as default for compatibility
module.exports.default = httpServer;
