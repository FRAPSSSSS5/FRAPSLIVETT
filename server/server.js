const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'monyun123';

let gameState = {
  mode: 'random',
  forcedColors: [],
  forceAll: null,
  numDice: 2,
  lastResult: [],
  isRolling: false,
  activeColors: ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu']
};

const COLORS = ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu'];

// Simpan socket ID layar utama (laptop untuk live)
let mainScreenSocketId = null;

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

// Daftarkan layar utama (laptop live)
app.post('/api/register-main-screen', (req, res) => {
  const { socketId } = req.body;
  if (socketId) {
    mainScreenSocketId = socketId;
    console.log('Main screen registered:', socketId);
    res.json({ success: true, message: 'Layar utama terdaftar!' });
  } else {
    res.json({ success: false });
  }
});

// Cek apakah layar utama aktif
app.get('/api/main-screen-status', (req, res) => {
  const isActive = mainScreenSocketId && io.sockets.sockets.get(mainScreenSocketId);
  res.json({ active: !!isActive, socketId: mainScreenSocketId });
});

// Admin roll — kirim HANYA ke layar utama
app.post('/api/admin/roll', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const { numDice } = req.body;
  if (numDice) gameState.numDice = parseInt(numDice);

  // Cek apakah layar utama masih konek
  const mainSocket = mainScreenSocketId ? io.sockets.sockets.get(mainScreenSocketId) : null;

  if (mainSocket) {
    // Kirim hanya ke layar utama
    mainSocket.emit('roll-start', { numDice: gameState.numDice });
    setTimeout(() => {
      const results = rollDice(gameState.numDice, gameState.mode, gameState.forcedColors, gameState.forceAll, gameState.activeColors);
      gameState.lastResult = results;
      mainSocket.emit('roll-result', { results, numDice: gameState.numDice });
      res.json({ success: true, results });
    }, 2500);
  } else {
    // Layar utama belum terdaftar
    res.json({ success: false, message: 'Layar utama belum terdaftar! Buka https://livedice.mooo.com?screen=main dulu.' });
  }
});

app.post('/api/admin/settings', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  const { mode, forcedColors, forceAll, numDice, activeColors } = req.body;
  if (mode !== undefined) gameState.mode = mode;
  if (forcedColors !== undefined) gameState.forcedColors = forcedColors;
  if (forceAll !== undefined) gameState.forceAll = forceAll;
  if (numDice !== undefined) gameState.numDice = parseInt(numDice);
  if (activeColors !== undefined) gameState.activeColors = activeColors;
  res.json({ success: true, gameState });
});

app.post('/api/admin/reset', (req, res) => {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  gameState.mode = 'random';
  gameState.forcedColors = [];
  gameState.forceAll = null;
  res.json({ success: true });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('state-update', gameState);
  socket.emit('your-socket-id', socket.id);

  // Jika client daftar sebagai layar utama
  socket.on('register-main', () => {
    mainScreenSocketId = socket.id;
    console.log('Main screen via socket:', socket.id);
    socket.emit('registered-as-main', { success: true });
  });

  // Player biasa spin sendiri (tidak pengaruh ke orang lain)
  let socketRolling = false;
  socket.on('request-roll', (data) => {
    if (socketRolling) return;
    socketRolling = true;
    const requestedDice = (data && data.numDice) ? parseInt(data.numDice) : gameState.numDice;
    socket.emit('roll-start', { numDice: requestedDice });
    setTimeout(() => {
      const results = rollDice(requestedDice, gameState.mode, gameState.forcedColors, gameState.forceAll, gameState.activeColors);
      socket.emit('roll-result', { results, numDice: requestedDice });
      socketRolling = false;
    }, 2500);
  });

  socket.on('disconnect', () => {
    if (mainScreenSocketId === socket.id) {
      mainScreenSocketId = null;
      console.log('Main screen disconnected');
    }
    console.log('Client disconnected:', socket.id);
  });
});

app.get('/FPG6413', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

server.listen(PORT, () => {
  console.log(`🎲 Server running on http://localhost:${PORT}`);
  console.log(`🔑 Admin password: ${ADMIN_PASSWORD}`);
});
