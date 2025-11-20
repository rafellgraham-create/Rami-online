const httpServer = require('./api/index');

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🎮 Game ready!`);
});
