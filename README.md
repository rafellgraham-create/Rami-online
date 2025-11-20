# Rami Online - Card Game

A multiplayer Rami (Rummy) card game with AI bot opponents.

## Features

- **Multiplayer gameplay** with Socket.io
- **AI Bot opponents** with 4 difficulty levels (Easy, Medium, Hard, Realist)
- **Real-time game updates**
- **Turn-based gameplay**
- **Meld validation** for sets and runs

## Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start
```

The game will be available at `http://localhost:3000`

## Deployment to Vercel

### Important: Socket.io Limitation on Vercel

⚠️ **Vercel's serverless functions have limitations with WebSocket connections.** Socket.io requires persistent connections which may not work reliably on Vercel's free tier.

### Recommended Deployment Options:

1. **Vercel with Polling Mode (Current Setup)**
   - Uses HTTP long polling instead of WebSockets
   - Works but has higher latency
   - Deploy with: `vercel --prod`

2. **Alternative Platforms (Recommended)**
   - **Railway.app** - Better for WebSocket apps
   - **Render.com** - Free tier supports WebSockets
   - **Heroku** - Classic choice for Node.js apps
   - **DigitalOcean App Platform**
   - **Fly.io**

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Deploy to Railway (Recommended)

1. Create account at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Railway will auto-detect and deploy
4. Your app will have full WebSocket support

## Project Structure

```
wuii/
├── api/
│   ├── index.js          # Main entry point for Vercel
│   ├── server.js         # Express app setup
│   ├── gameLogic.js      # Game state and bot logic
│   └── socketHandlers.js # Socket.io event handlers
├── public/
│   ├── index.html        # Game interface
│   ├── script.js         # Client-side logic
│   └── style.css         # Styling
├── server.js             # Local development server
├── vercel.json           # Vercel configuration
└── package.json
```

## How to Play

1. **Add Bots**: Click the bot buttons to add AI opponents
2. **Start Game**: Click "Démarrer la partie"
3. **Your Turn**: 
   - Draw a card (from deck or discard pile)
   - Form melds (3+ cards)
   - Discard a card to end your turn
4. **Win**: Be the first to discard all your cards!

## Game Rules

- **Set**: 3-4 cards of the same rank (e.g., 7♠ 7♥ 7♦)
- **Run**: 3+ consecutive cards of the same suit (e.g., 5♠ 6♠ 7♠)
- **Jokers** (🃏) can substitute for any card

## Keyboard Shortcuts

- `E` - Add hovered card to current meld
- `R` - Commit current meld
- `A` - Add selected cards to existing meld

## Technologies

- Node.js + Express
- Socket.io for real-time communication
- Vanilla JavaScript (client)
- HTML5/CSS3

## Bot Implementation

Your game already has a sophisticated bot system! Here's what it does:

### Bot Difficulty Levels

1. **Easy** - Makes random moves, rarely forms melds
2. **Medium** - Strategically forms melds, some smart discarding
3. **Hard** - Aggressive meld formation, smart card management
4. **Realist** - Ultra-fast, nearly perfect play

### Bot Features

- **Smart Drawing**: Evaluates whether to draw from deck or discard pile
- **Meld Formation**: Automatically detects and forms sets/runs
- **Strategic Discarding**: Keeps valuable cards, discards low-value ones
- **Add to Melds**: Can extend existing melds on the table
- **Human-like Delays**: Thinks before making moves for realism

The bot AI is in `api/gameLogic.js` - feel free to customize the difficulty settings!

## License

MIT
