// ===== DADU MONYUN - ADMIN SCRIPT =====

const socket = io();

const COLOR_HEX = {
  merah: '#ff1a1a', oranye: '#ffa500', kuning: '#ffd700',
  hijau: '#00a000', biru: '#1a33ff', ungu: '#8000ff'
};
const COLORS = ['merah', 'oranye', 'kuning', 'hijau', 'biru', 'ungu'];

let adminState = {
  numDice: 2,
  mode: 'random',
  forceAll: null,
  forcedColors: [],
  activeColors: ['merah','oranye','kuning','hijau','biru','ungu'],
  isLoggedIn: false
};

// ===== SOCKET =====
socket.on('connect', () => setConnStatus(true));
socket.on('disconnect', () => setConnStatus(false));
socket.on('state-update', (state) => {
  adminState.numDice = state.numDice;
  adminState.mode = state.mode;
  adminState.forceAll = state.forceAll;
  adminState.forcedColors = state.forcedColors || [];
  if (state.activeColors) adminState.activeColors = state.activeColors;
  if (adminState.isLoggedIn) syncAdminColorToggles();
  if (adminState.isLoggedIn) syncUI();
});
socket.on('roll-result', (data) => {
  if (adminState.isLoggedIn) {
    showPreview(data.results);
    addLog(data.results);
  }
});

function setConnStatus(connected) {
  const badge = document.getElementById('connBadge');
  const text = document.getElementById('connText');
  if (badge) badge.className = 'connection-badge ' + (connected ? 'connected' : 'disconnected');
  if (text) text.textContent = connected ? 'Terhubung' : 'Terputus';
}

// ===== LOGIN =====
async function doLogin() {
  const pass = document.getElementById('passwordInput').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass })
  });
  const data = await res.json();
  
  if (data.success) {
    adminState.isLoggedIn = true;
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    
    // Load current state
    const stateRes = await fetch('/api/state');
    const state = await stateRes.json();
    adminState = { ...adminState, ...state, isLoggedIn: true };
    if (state.activeColors) adminState.activeColors = state.activeColors;
    syncUI();
    syncAdminColorToggles();
    buildPerDiceGrid();
    showToast('✅ Login berhasil! Selamat datang, Admin.');
  } else {
    const err = document.getElementById('loginError');
    err.style.display = 'block';
    err.style.animation = 'none';
    setTimeout(() => err.style.animation = '', 10);
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
  }
}

async function doLogout() {
  await fetch('/api/admin/logout', { method: 'POST' });
  adminState.isLoggedIn = false;
  document.getElementById('loginContainer').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('passwordInput').value = '';
}

// Check existing session
(async () => {
  try {
    const res = await fetch('/api/admin/check');
    const data = await res.json();
    if (data.isAdmin) {
      adminState.isLoggedIn = true;
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      
      const stateRes = await fetch('/api/state');
      const state = await stateRes.json();
      adminState = { ...adminState, ...state, isLoggedIn: true };
      syncUI();
      buildPerDiceGrid();
    }
  } catch(e) {}
})();

// ===== SYNC UI =====
function syncUI() {
  // Num dice buttons
  document.querySelectorAll('.num-dice-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i + 1) === adminState.numDice);
  });
  
  // Mode buttons
  document.getElementById('modeRandom')?.classList.toggle('active', adminState.mode === 'random');
  document.getElementById('modeForced')?.classList.toggle('active', adminState.mode === 'forced');
  
  // Force all buttons
  const forceKey = adminState.forceAll || 'random';
  document.querySelectorAll('.force-color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.force === forceKey);
  });
  
  buildPerDiceGrid();
}

// ===== SETTINGS =====
function setNumDice(n) {
  adminState.numDice = n;
  adminState.forcedColors = new Array(n).fill(null);
  
  document.querySelectorAll('.num-dice-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i + 1) === n);
  });
  
  buildPerDiceGrid();
  saveSettings();
  showToast(`🎲 Jumlah dadu: ${n}`);
}

function setMode(mode) {
  adminState.mode = mode;
  document.getElementById('modeRandom')?.classList.toggle('active', mode === 'random');
  document.getElementById('modeForced')?.classList.toggle('active', mode === 'forced');
  saveSettings();
  showToast(mode === 'random' ? '🎲 Mode: Random Normal' : '🔒 Mode: Force Warna');
}

function setForceAll(color) {
  adminState.forceAll = color === 'random' ? null : color;
  
  document.querySelectorAll('.force-color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.force === color);
  });
  
  if (color !== 'random') {
    // Update all per-dice to match
    adminState.forcedColors = new Array(adminState.numDice).fill(color);
    buildPerDiceGrid();
  }
  
  saveSettings();
  showToast(color === 'random' ? '🎲 Force: Random per dadu' : `🎨 Force semua: ${color.toUpperCase()}`);
}

function setForceDice(diceIdx, color) {
  if (!adminState.forcedColors) adminState.forcedColors = [];
  while (adminState.forcedColors.length <= diceIdx) adminState.forcedColors.push(null);
  adminState.forcedColors[diceIdx] = color === 'random' ? null : color;
  
  // Update UI for this row
  const row = document.querySelectorAll('.per-dice-row')[diceIdx];
  if (row) {
    row.querySelectorAll('.per-dice-color').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === color);
    });
  }
  
  saveSettings();
}

// ===== BUILD PER DICE GRID =====
function buildPerDiceGrid() {
  const grid = document.getElementById('perDiceGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  for (let i = 0; i < adminState.numDice; i++) {
    const currentColor = (adminState.forcedColors && adminState.forcedColors[i]) || 'random';
    
    const row = document.createElement('div');
    row.className = 'per-dice-row';
    
    const label = document.createElement('div');
    label.className = 'per-dice-label';
    label.textContent = `Dadu ${i + 1}`;
    
    const colorsDiv = document.createElement('div');
    colorsDiv.className = 'per-dice-colors';
    
    // Random option
    const randomBtn = document.createElement('div');
    randomBtn.className = 'per-dice-color' + (currentColor === 'random' ? ' selected' : '');
    randomBtn.dataset.color = 'random';
    randomBtn.title = 'Random';
    randomBtn.style.cssText = 'background:linear-gradient(135deg,#1a1a40,#3a3a70);border-color:rgba(100,150,255,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(200,220,255,0.9);';
    randomBtn.textContent = '🎲';
    randomBtn.onclick = () => setForceDice(i, 'random');
    colorsDiv.appendChild(randomBtn);
    
    // Color options
    COLORS.forEach(color => {
      const colorBtn = document.createElement('div');
      colorBtn.className = 'per-dice-color' + (currentColor === color ? ' selected' : '');
      colorBtn.dataset.color = color;
      colorBtn.title = color.toUpperCase();
      colorBtn.style.cssText = `background:${COLOR_HEX[color]};box-shadow:0 0 8px ${COLOR_HEX[color]}66;`;
      colorBtn.onclick = () => setForceDice(i, color);
      colorsDiv.appendChild(colorBtn);
    });
    
    row.appendChild(label);
    row.appendChild(colorsDiv);
    grid.appendChild(row);
  }
}

// ===== SAVE SETTINGS =====
async function saveSettings() {
  try {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: adminState.mode,
        forceAll: adminState.forceAll,
        forcedColors: adminState.forcedColors,
        numDice: adminState.numDice
      })
    });
  } catch(e) {
    showToast('⚠️ Gagal menyimpan pengaturan', true);
  }
}

// ===== ROLL =====
async function adminRoll() {
  showToast('🎲 Rolling dadu...');
  try {
    const res = await fetch('/api/admin/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numDice: adminState.numDice })
    });
    const data = await res.json();
    if (data.results) {
      showPreview(data.results);
      addLog(data.results);
      showToast('✅ Roll selesai: ' + data.results.map(c => c.toUpperCase()).join(', '));
    }
  } catch(e) {
    showToast('❌ Error rolling!', true);
  }
}

async function forceResult() {
  if (adminState.mode !== 'forced') {
    setMode('forced');
    await new Promise(r => setTimeout(r, 200));
  }
  await adminRoll();
}

async function resetRandom() {
  adminState.mode = 'random';
  adminState.forceAll = null;
  adminState.forcedColors = [];
  
  await fetch('/api/admin/reset', { method: 'POST' });
  syncUI();
  showToast('🔄 Reset ke mode random!');
}

// ===== PREVIEW =====
function showPreview(results) {
  const preview = document.getElementById('livePreview');
  if (!preview) return;
  preview.innerHTML = '';
  
  results.forEach(color => {
    const dice = document.createElement('div');
    dice.className = 'preview-dice';
    dice.style.cssText = `background:linear-gradient(135deg,${shadeColor(COLOR_HEX[color], -30)},${COLOR_HEX[color]});box-shadow:0 0 15px ${COLOR_HEX[color]}88;border-color:rgba(255,255,255,0.7);`;
    dice.textContent = color.toUpperCase();
    preview.appendChild(dice);
  });
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ===== LOG =====
function addLog(results) {
  const log = document.getElementById('resultLog');
  if (!log) return;
  
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const now = new Date();
  const time = now.getHours().toString().padStart(2,'0') + ':' + 
               now.getMinutes().toString().padStart(2,'0') + ':' +
               now.getSeconds().toString().padStart(2,'0');
  
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    ${results.map(c => `<div class="log-dot ${c}" title="${c}" style="box-shadow:0 0 5px ${COLOR_HEX[c]}"></div>`).join('')}
    <span style="flex:1">${results.map(c => `<span style="color:${COLOR_HEX[c]};font-weight:800">${c.toUpperCase()}</span>`).join(' + ')}</span>
  `;
  
  // Remove placeholder
  const placeholder = log.querySelector('[style*="text-align:center"]');
  if (placeholder) placeholder.remove();
  
  log.insertBefore(entry, log.firstChild);
  
  // Keep max 20 entries
  while (log.children.length > 20) log.removeChild(log.lastChild);
}

// ===== TOAST =====
let toastTimeout;
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'rgba(255,100,100,0.6)' : 'rgba(100,200,255,0.6)';
  toast.classList.add('show');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// Enter key for login
document.getElementById('passwordInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

// ===== ADMIN COLOR TOGGLES =====
function syncAdminColorToggles() {
  const active = adminState.activeColors || COLORS;
  const pct = active.length > 0 ? (100 / active.length).toFixed(1) : '0';
  COLORS.forEach(color => {
    const el = document.querySelector(`#adminColorToggles [data-color="${color}"]`);
    const pctEl = document.getElementById(`admin-pct-${color}`);
    if (el) {
      if (active.includes(color)) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
    if (pctEl) pctEl.textContent = active.includes(color) ? pct + '%' : '0%';
  });
}

async function adminToggleColor(color, el) {
  const active = adminState.activeColors;
  const isActive = active.includes(color);

  // Prevent disabling all colors
  if (isActive && active.length <= 1) {
    showToast('⚠️ Minimal 1 warna harus aktif!', true);
    return;
  }

  let newColors;
  if (isActive) {
    newColors = active.filter(c => c !== color);
  } else {
    newColors = [...active, color];
    newColors = COLORS.filter(c => newColors.includes(c));
  }

  adminState.activeColors = newColors;
  syncAdminColorToggles();

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeColors: newColors })
    });
    if (res.ok) {
      showToast(`🎨 ${color.toUpperCase()} ${isActive ? 'dimatikan ❌' : 'diaktifkan ✅'}`);
    } else {
      showToast('❌ Gagal: tidak terautentikasi', true);
    }
  } catch (e) {
    showToast('❌ Gagal update warna', true);
  }
}
