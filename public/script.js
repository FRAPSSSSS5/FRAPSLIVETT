// ===== DADU MONYUN - PLAYER SCRIPT =====

const socket = io();

const COLORS = ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu'];
const COLOR_HEX = {
  merah: '#ff1a1a',
  oranye: '#ffa500',
  kuning: '#ffd700',
  hijau: '#00a000',
  biru: '#1a33ff',
  ungu: '#8000ff'
};
const COLOR_LABEL = {
  merah: 'MERAH',
  oranye: 'ORANYE',
  kuning: 'KUNING',
  hijau: 'HIJAU',
  biru: 'BIRU',
  ungu: 'UNGU'
};

let activeColors = [...COLORS];
let numDice = 2;
let isRolling = false;
let rollInterval = null;
let audioCtx = null;

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
  setConnectionStatus(true);
});

socket.on('disconnect', () => {
  setConnectionStatus(false);
});

socket.on('state-update', (state) => {
  numDice = state.numDice;
  document.getElementById('numDiceSelect').value = numDice;
  if (state.activeColors) {
    syncActiveColors(state.activeColors);
  }
});

socket.on('roll-start', (data) => {
  numDice = data.numDice;
  document.getElementById('numDiceSelect').value = numDice;
  startRollingAnimation();
});

socket.on('roll-result', (data) => {
  stopRollingAnimation(data.results);
});

// ===== CONNECTION STATUS =====
function setConnectionStatus(connected) {
  const badge = document.getElementById('connectionBadge');
  const text = document.getElementById('connectionText');
  badge.className = 'connection-badge ' + (connected ? 'connected' : 'disconnected');
  text.textContent = connected ? 'Terhubung ke Server' : 'Terputus dari Server';
}

// ===== SYNC COLORS FROM SERVER =====
function syncActiveColors(serverActiveColors) {
  activeColors = [...serverActiveColors];
  COLORS.forEach(color => {
    const toggle = document.querySelector(`.color-toggle[data-color="${color}"]`);
    const checkbox = toggle?.querySelector('input[type="checkbox"]');
    const isActive = serverActiveColors.includes(color);
    if (toggle) toggle.classList.toggle('active', isActive);
    if (checkbox) checkbox.checked = isActive;
  });
  updatePercentages();
}

// ===== UPDATE NUM DICE =====
function updateNumDice() {
  numDice = parseInt(document.getElementById('numDiceSelect').value);
}

// ===== TOGGLE COLOR =====
function toggleColor(color, enabled) {
  const toggle = document.querySelector(`.color-toggle[data-color="${color}"]`);
  if (enabled) {
    if (!activeColors.includes(color)) activeColors.push(color);
    toggle?.classList.add('active');
  } else {
    if (activeColors.length <= 1) {
      // Must keep at least 1 color
      const checkbox = toggle?.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
      shakeElement(toggle);
      return;
    }
    activeColors = activeColors.filter(c => c !== color);
    toggle?.classList.remove('active');
  }
  updatePercentages();
  
  // Sync to server
  fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeColors })
  }).catch(() => {});
}

function updatePercentages() {
  const pct = activeColors.length > 0 ? (100 / activeColors.length).toFixed(1) : '0';
  COLORS.forEach(color => {
    const el = document.getElementById('pct-' + color);
    if (el) el.textContent = activeColors.includes(color) ? pct + '%' : '0%';
  });
}

function shakeElement(el) {
  if (!el) return;
  el.style.animation = 'diceShake 0.3s ease-in-out';
  setTimeout(() => el.style.animation = '', 400);
}

// ===== DICE ROLL =====
function rollDice() {
  if (isRolling) return;
  numDice = parseInt(document.getElementById('numDiceSelect').value);
  socket.emit('request-roll', { numDice });
}

function startRollingAnimation() {
  if (isRolling) return;
  isRolling = true;
  numDice = parseInt(document.getElementById('numDiceSelect').value);
  
  const btn = document.getElementById('rollBtn');
  btn.disabled = true;
  btn.classList.add('rolling');
  btn.innerHTML = '<span class="btn-icon">⚙️</span> SEDANG MENGOCOK...';
  
  document.getElementById('rollingText').classList.add('show');
  
  playRollSound();
  buildDice(numDice, null); // build rolling dice
  
  // Animate rapid color changes
  rollInterval = setInterval(() => {
    updateRollingDice();
  }, 120);
}

function stopRollingAnimation(results) {
  if (rollInterval) {
    clearInterval(rollInterval);
    rollInterval = null;
  }
  
  setTimeout(() => {
    isRolling = false;
    
    const btn = document.getElementById('rollBtn');
    btn.disabled = false;
    btn.classList.remove('rolling');
    btn.innerHTML = '<span class="btn-icon">🎲</span> GULIR LAGI!';
    
    document.getElementById('rollingText').classList.remove('show');
    
    showResults(results);
    playResultSound();
  }, 200);
}

function buildDice(count, results) {
  const container = document.getElementById('diceContainer');
  container.innerHTML = '';
  
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'dice-wrap';
    
    const dice = document.createElement('div');
    dice.className = 'dice rolling';
    dice.id = 'dice-' + i;
    dice.setAttribute('data-color', 'biru');
    
    dice.innerHTML = getDiceDots(6);
    
    const label = document.createElement('div');
    label.className = 'dice-label';
    label.id = 'label-' + i;
    label.style.color = COLOR_HEX['biru'];
    label.textContent = '?';
    
    wrap.appendChild(dice);
    wrap.appendChild(label);
    container.appendChild(wrap);
  }
}

function getDiceDots(num) {
  // Titik putih dihilangkan — dadu sekarang tampil sebagai warna solid
  return `<div class="dice-color-display"></div>`;
}

function updateRollingDice() {
  const allColors = activeColors.length > 0 ? activeColors : COLORS;
  for (let i = 0; i < numDice; i++) {
    const dice = document.getElementById('dice-' + i);
    const label = document.getElementById('label-' + i);
    if (!dice) continue;
    
    const randomColor = allColors[Math.floor(Math.random() * allColors.length)];
    dice.setAttribute('data-color', randomColor);
    dice.innerHTML = getDiceDots(Math.floor(Math.random() * 6) + 1);
    
    if (label) {
      label.style.color = COLOR_HEX[randomColor];
      label.textContent = COLOR_LABEL[randomColor];
    }
  }
}

function showResults(results) {
  const container = document.getElementById('diceContainer');
  container.innerHTML = '';
  
  results.forEach((color, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'dice-wrap';
    
    const dice = document.createElement('div');
    dice.className = 'dice result-show';
    dice.setAttribute('data-color', color);
    dice.innerHTML = getDiceDots(Math.floor(Math.random() * 6) + 1);
    
    const label = document.createElement('div');
    label.className = 'dice-label';
    label.style.color = COLOR_HEX[color];
    label.textContent = COLOR_LABEL[color];
    
    wrap.appendChild(dice);
    wrap.appendChild(label);
    container.appendChild(wrap);
    
    // Staggered animation
    setTimeout(() => {
      dice.style.animationDelay = (i * 0.15) + 's';
    }, 10);
  });
}

// ===== AUDIO =====
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playRollSound() {
  try {
    const ctx = getAudioCtx();
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 200 + Math.random() * 300;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
      }, i * 100);
    }
  } catch(e) {}
}

function playResultSound() {
  try {
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch(e) {}
}

// ===== FULLSCREEN =====
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('Fullscreen error:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    rollDice();
  }
  if (e.key === 'F11' || e.key === 'f') {
    toggleFullscreen();
  }
});

// Init
updatePercentages();
