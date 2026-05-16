// ===== DADU MONYUN - PLAYER SCRIPT =====

const socket = io();

// Cek apakah ini layar utama (?screen=main)
const urlParams = new URLSearchParams(window.location.search);
const isMainScreen = urlParams.get('screen') === 'main';

if (isMainScreen) {
  socket.on('connect', () => {
    socket.emit('register-main');
  });
  socket.on('registered-as-main', () => {
    // Badge dihapus
  });
}

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
      const checkbox = toggle?.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
      shakeElement(toggle);
      return;
    }
    activeColors = activeColors.filter(c => c !== color);
    toggle?.classList.remove('active');
  }
  updatePercentages();
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
  btn.innerHTML = '⚙️ SEDANG MENGOCOK...';

  // Tampilkan animasi FINGERS CROSSED
  showFingersCrossed(numDice);

  // Sembunyikan hasil sebelumnya
  clearResultBar();

  playRollSound();

  rollInterval = setInterval(() => {
    updateFingersCrossedDice(numDice);
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
    btn.innerHTML = '🎲 SPIN LAGI!';

    showResults(results);
    showResultBar(results);
    playResultSound();
  }, 200);
}

// ===== FINGERS CROSSED ANIMATION =====
function showFingersCrossed(count) {
  const container = document.getElementById('diceContainer');
  container.innerHTML = '';

  // Judul FINGERS CROSSED
  const title = document.createElement('div');
  title.className = 'fingers-crossed-title';
  title.textContent = 'FINGERS CROSSED..';
  container.appendChild(title);

  // Baris dadu
  const row = document.createElement('div');
  row.className = 'fingers-crossed-row';
  row.id = 'fingersDiceRow';

  for (let i = 0; i < count; i++) {
    const dice = document.createElement('div');
    dice.className = 'fc-dice';
    dice.id = 'fc-dice-' + i;
    dice.innerHTML = '<div class="fc-dot"></div>';
    row.appendChild(dice);
  }

  container.appendChild(row);
}

function updateFingersCrossedDice(count) {
  for (let i = 0; i < count; i++) {
    const dice = document.getElementById('fc-dice-' + i);
    if (!dice) continue;
    // Dadu tetap putih/biru muda saat spin, hanya sedikit bergetar
    dice.style.backgroundColor = '#ddeeff';
    dice.style.boxShadow = '0 4px 24px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.8)';
  }
}

// ===== BUILD DICE (hasil) =====
function getDiceDots() {
  return `<div class="dice-color-display"></div>`;
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
    dice.innerHTML = getDiceDots();

    const label = document.createElement('div');
    label.className = 'dice-label';
    label.style.color = COLOR_HEX[color];
    label.textContent = COLOR_LABEL[color];

    wrap.appendChild(dice);
    wrap.appendChild(label);
    container.appendChild(wrap);

    setTimeout(() => {
      dice.style.animationDelay = (i * 0.15) + 's';
    }, 10);
  });
}

// ===== RESULT BAR BAWAH TOMBOL =====
function showResultBar(results) {
  const bar = document.getElementById('resultBar');
  if (!bar) return;

  bar.innerHTML = '';

  const label = document.createElement('span');
  label.textContent = 'Hasil: ';
  label.style.color = '#aaa';
  label.style.marginRight = '6px';
  bar.appendChild(label);

  results.forEach((color, i) => {
    const chip = document.createElement('span');
    chip.className = 'result-chip';
    chip.textContent = COLOR_LABEL[color];
    chip.style.background = COLOR_HEX[color];
    chip.style.color = color === 'kuning' ? '#222' : '#fff';
    chip.style.animationDelay = (i * 0.1) + 's';
    bar.appendChild(chip);
  });

  bar.classList.add('visible');
}

function clearResultBar() {
  const bar = document.getElementById('resultBar');
  if (!bar) return;
  bar.innerHTML = '';
  bar.classList.remove('visible');
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

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    rollDice();
  }
  if (e.key === 'F11' || e.key === 'f') {
    toggleFullscreen();
  }
});

updatePercentages();
