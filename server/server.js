const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'monyun123';

// Game state
let gameState = {
  mode: 'random', // 'random' | 'forced'
  forcedColors: [], // array of colors per dice slot, e.g. ['merah', 'biru', null, null]
  forceAll: null, // if set, all dice get this color
  numDice: 2,
  lastResult: [],
  isRolling: false,
  activeColors: ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu']
};

const COLORS = ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu'];

function getRandomColor(activeColors) {
  if (!activeColors || activeColors.length === 0) activeColors = COLORS;
  return activeColors[Math.floor(Math.random() * activeColors.length)];
}

function rollDice(numDice, mode, forcedColors, forceAll, activeColors) {
  const results = [];
  for (let i = 0; i < numDice; i++) {
    if (mode === 'forced') {
      if (forceAll) {
        results.push(forceAll);
      } else if (forcedColors && forcedColors[i]) {
        results.push(forcedColors[i]);
      } else {
        results.push(getRandomColor(activeColors));
      }
    } else {
      results.push(getRandomColor(activeColors));
    }
  }
  return results;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'dadu-monyun-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, '../public')));

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Password salah!' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

app.get('/api/state', (req, res) => {
  res.json(gameState);
});

// Admin routes
app.post('/api/admin/roll', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  
  const { numDice } = req.body;
  if (numDice) gameState.numDice = parseInt(numDice);
  
  gameState.isRolling = true;
  io.emit('roll-start', { numDice: gameState.numDice });
  
  setTimeout(() => {
    const results = rollDice(
      gameState.numDice,
      gameState.mode,
      gameState.forcedColors,
      gameState.forceAll,
      gameState.activeColors
    );
    gameState.lastResult = results;
    gameState.isRolling = false;
    io.emit('roll-result', { results, numDice: gameState.numDice });
    res.json({ success: true, results });
  }, 2500);
});

app.post('/api/admin/settings', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  
  const { mode, forcedColors, forceAll, numDice, activeColors } = req.body;
  
  if (mode !== undefined) gameState.mode = mode;
  if (forcedColors !== undefined) gameState.forcedColors = forcedColors;
  if (forceAll !== undefined) gameState.forceAll = forceAll;
  if (numDice !== undefined) gameState.numDice = parseInt(numDice);
  if (activeColors !== undefined) gameState.activeColors = activeColors;
  
  io.emit('state-update', gameState);
  res.json({ success: true, gameState });
});

app.post('/api/admin/reset', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  
  gameState.mode = 'random';
  gameState.forcedColors = [];
  gameState.forceAll = null;
  
  io.emit('state-update', gameState);
  res.json({ success: true });
});

// Player roll - setiap pengguna spin sendiri, tidak mempengaruhi pengguna lain
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('state-update', gameState);

  // Tiap socket punya state rolling sendiri
  let socketRolling = false;

  socket.on('request-roll', (data) => {
    if (socketRolling) return; // cegah spam
    socketRolling = true;

    const requestedDice = (data && data.numDice) ? parseInt(data.numDice) : gameState.numDice;

    // Kirim roll-start hanya ke pengguna ini saja (bukan broadcast)
    socket.emit('roll-start', { numDice: requestedDice });

    setTimeout(() => {
      const results = rollDice(
        requestedDice,
        gameState.mode,
        gameState.forcedColors,
        gameState.forceAll,
        gameState.activeColors
      );
      // Kirim hasil hanya ke pengguna ini saja
      socket.emit('roll-result', { results, numDice: requestedDice });
      socketRolling = false;
    }, 2500);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

server.listen(PORT, () => {
  console.log(`🎲 DADU MONYUN Server running on http://localhost:${PORT}`);
  console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
});
