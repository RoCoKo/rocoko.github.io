import { benchmarks } from './benchmarks.js';

// DOM elements
const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const table = document.getElementById('results-table');
const tbody = table.querySelector('tbody');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const reloadBtn = document.getElementById('reload');
const steamIdInput = document.getElementById('steamid');
const fetchLibBtn = document.getElementById('fetch-library');
const userCpuInput = document.getElementById('user-cpu');
const userGpuInput = document.getElementById('user-gpu');
const userRamInput = document.getElementById('user-ram');
const applyHwBtn = document.getElementById('apply-hw');

const API_BASE = (typeof localStorage !== 'undefined' && localStorage.getItem('apiBase')) || 'http://localhost:3000';

const state = {
  requirements: [],
  libGames: [],
  dataset: [], // current rendered list
  userHw: { cpuModel: '', gpuModel: '', ramGb: 0 }
};

function showLoader(show) {
  loader.classList.toggle('hidden', !show);
}
function showTable(show) {
  table.classList.toggle('hidden', !show);
}
function setStatus(msg) {
  statusDiv.textContent = msg;
}
function clearTable() {
  tbody.innerHTML = '';
}

function decodeHtmlEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}

async function loadRequirements() {
  showLoader(true);
  setStatus('Loading requirements JSON...');
  try {
    const [res] = await Promise.all([
      fetch('cyri-data.json', { cache: 'no-cache' }),
      new Promise(resolve => setTimeout(resolve, 10)) // Minimum 10ms display for loader
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(`Sistem gereksinim verisi yüklendi. Başlamak için kütüphanenizi getirin.`);
    return data;
  } catch (e) {
    setStatus(`Failed to load JSON: ${e.message}`);
    return [];
  } finally {
    showLoader(false);
  }
}

function computeScoreFromMinimum(min) {
  if (!min) return { score: 0, hw: 'Veri yok', parts: { cpu: null, gpu: null, ramGb: 0 } };

  const cpuCandidates = splitAlternatives(min.cpu);
  const gpuCandidates = splitAlternatives(min.video_card || min.graphics || '');

  const cpuModel = pickKnownModel(cpuCandidates, benchmarks.cpu);
  const gpuModel = pickKnownModel(gpuCandidates, benchmarks.gpu);

  const ramGb = extractNumberGb(min.ram || '');
  const vramGb = extractNumberGb(min.dedicated_video_ram || '') || 0;

  const cpuRaw = cpuModel ? benchmarks.cpu[cpuModel] : 500;
  const gpuRaw = gpuModel ? benchmarks.gpu[gpuModel] : 500;

  const cpuScore = cpuRaw * 0.4;
  const gpuScore = gpuRaw * 0.5;
  const ramScore = Math.max(0, ramGb) * 150;
  const total = Math.round(cpuScore + gpuScore + ramScore);

  let hw = `CPU: ${min.cpu || '?'} | GPU: ${min.video_card || min.graphics || '?'}${vramGb ? ` (${vramGb} GB VRAM)` : ''} | RAM: ${ramGb || '?'} GB`;
  return { score: total, hw, parts: { cpu: cpuModel, gpu: gpuModel, ramGb } };
}

function extractNumberGb(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  return unit === 'MB' ? Math.round((value / 1024) * 10) / 10 : value;
}

function normalizeModel(str) {
  if (!str) return '';
  let s = String(str)
    .replace(/\(R\)|\(TM\)|\(C\)/gi, '')
    .replace(/Intel|AMD|NVIDIA|GeForce|Radeon|Core|CPU|Processor|Graphics/gi, '')
    .replace(/@.*$/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+\d+\s*(GB|MB)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^GTX\s*(\d+)/i, 'GTX $1')
       .replace(/^RTX\s*(\d+)/i, 'RTX $1')
       .replace(/^RX\s*(\d+)/i, 'RX $1')
       .replace(/^HD\s*(\d+)/i, 'HD $1');
  return s;
}

function splitAlternatives(text) {
  if (!text) return [];
  const parts = String(text).split(/\s*[/|,]|\bor\b/i).map(s => normalizeModel(s)).map(s => s.trim()).filter(Boolean);
  // ensure uniqueness while preserving order
  return [...new Set(parts)];
}

function pickKnownModel(models, table) {
  for (const m of models) {
    if (table[m]) return m;
  }
  return models[0] || '';
}

function normTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/®|™/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeUserScores() {
  const cpuModel = normalizeModel(state.userHw.cpuModel);
  const gpuModel = normalizeModel(state.userHw.gpuModel);
  const cpu = benchmarks.cpu[cpuModel] || null;
  const gpu = benchmarks.gpu[gpuModel] || null;
  const ramGb = Number(state.userHw.ramGb) || 0;
  return { cpuModel, gpuModel, cpu, gpu, ramGb };
}

function checkMeetsMin(minParts) {
  if (!minParts) return { label: 'Veri yok', value: null };
  const user = computeUserScores();
  const reqCpu = minParts.cpu ? benchmarks.cpu[minParts.cpu] : null;
  const reqGpu = minParts.gpu ? benchmarks.gpu[minParts.gpu] : null;
  const reqRam = minParts.ramGb || 0;

  const cpuOk = reqCpu == null || (user.cpu != null && user.cpu >= reqCpu);
  const gpuOk = reqGpu == null || (user.gpu != null && user.gpu >= reqGpu);
  const ramOk = user.ramGb >= reqRam;

  if ((reqCpu != null && user.cpu == null) || (reqGpu != null && user.gpu == null)) {
    return { label: 'Veri yok', value: null };
  }
  const ok = cpuOk && gpuOk && ramOk;
  return { label: ok ? 'Evet' : 'Hayır', value: ok };
}

function renderTable(items) {
  clearTable();
  items.forEach((item, i) => {
    const tr = document.createElement('tr');
    const meets = item._meets?.label || 'Veri yok';
    const gameName = decodeHtmlEntities(item.game || item.name || 'Unknown');
    tr.innerHTML = `<td>${i + 1}</td><td>${gameName}</td><td>${item._score}</td><td>${item._hw}</td><td>${meets}</td>`;
    tbody.appendChild(tr);
  });
}

function filterAndSort(data) {
  const q = (searchInput.value || '').toLowerCase();
  const dir = sortSelect.value;
  const filtered = data.filter(x => ((x.game || x.name || '')).toLowerCase().includes(q));
  filtered.sort((a, b) => dir === 'asc' ? a._score - b._score : b._score - a._score);
  return filtered;
}

async function fetchLibrary(steamid) {
  const url = `${API_BASE}/api/steam/games/${steamid}`;
  showLoader(true);
  setStatus('Steam kütüphanesi alınıyor...');
  try {
    const res = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const games = (json.games || []).map(g => ({ appid: g.appid, name: g.name }));
    setStatus(`Kütüphane: ${games.length} oyun`);
    return games;
  } catch (e) {
    setStatus(`Kütüphane alınamadı: ${e.message}`);
    return [];
  } finally {
    showLoader(false);
  }
}

function buildReqIndex(reqs) {
  const idx = new Map();
  for (const r of reqs) {
    const key = normTitle(r.game);
    if (key) idx.set(key, r);
  }
  return idx;
}

function joinLibraryWithRequirements(library, reqs) {
  const idx = buildReqIndex(reqs);
  return library.map(g => {
    const key = normTitle(g.name);
    const match = idx.get(key);
    if (!match) {
      return { ...g, game: g.name, _score: 0, _hw: 'Veri yok', _meets: { label: 'Veri yok', value: null } };
    }
    const { score, hw, parts } = computeScoreFromMinimum(match.requirements?.minimum);
    const meets = checkMeetsMin(parts);
    return { ...g, game: match.game || g.name, _score: score, _hw: hw, _meets: meets };
  });
}

function applyAndRender() {
  const list = filterAndSort(state.dataset);
  showTable(true);
  renderTable(list);
}

function detectHardware() {
  // RAM: navigator.deviceMemory is a simple and effective API
  if (navigator.deviceMemory) {
    userRamInput.value = navigator.deviceMemory;
  }

  // GPU: WebGL is the most common way, but the result string needs parsing.
  // CPU: There is no reliable way to get CPU model in browser JS for privacy reasons.
  try {
    const canvas = document.createElement('canvas');
    // Prevent canvas from being visible
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const gpuString = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        let gpuModel = gpuString;
        const angleMatch = gpuString.match(/ANGLE \((.*)\)/);
        if (angleMatch && angleMatch[1]) {
            gpuModel = angleMatch[1];
        }

        gpuModel = gpuModel.replace(/ Direct3D.*/, '').replace(/ vs_.* ps_.*$/, '').replace(/\s*\([^)]*\)/, '');

        userGpuInput.value = gpuModel.trim();
      }
    }
    document.body.removeChild(canvas);
  } catch (e) {
    console.error("Could not detect GPU info:", e);
  }
}

async function init() {
  detectHardware();
  state.requirements = await loadRequirements();

  const apply = () => applyAndRender();
  searchInput.addEventListener('input', apply);
  sortSelect.addEventListener('change', apply);
  reloadBtn.addEventListener('click', async () => {
    state.requirements = await loadRequirements();
    if (state.libGames.length) {
      state.dataset = joinLibraryWithRequirements(state.libGames, state.requirements);
    }
    applyAndRender();
  });

  fetchLibBtn?.addEventListener('click', async () => {
    const steamid = (steamIdInput.value || '').trim();
    if (!/^\d{17}$/.test(steamid)) {
      setStatus('Geçersiz SteamID64. (17 haneli)');
      return;
    }
    state.libGames = await fetchLibrary(steamid);
    state.dataset = joinLibraryWithRequirements(state.libGames, state.requirements);
    applyAndRender();
  });

  applyHwBtn?.addEventListener('click', () => {
    state.userHw = {
      cpuModel: userCpuInput.value || '',
      gpuModel: userGpuInput.value || '',
      ramGb: Number(userRamInput.value || 0)
    };
    // Recompute meets for current dataset
    state.dataset = state.dataset.map(item => {
      // items may be both raw req entries or joined games
      const min = item.requirements?.minimum;
      const parts = min ? computeScoreFromMinimum(min).parts : undefined;
      const meets = parts ? checkMeetsMin(parts) : item._hw === 'Veri yok' ? { label: 'Veri yok', value: null } : checkMeetsMin(undefined);
      return { ...item, _meets: meets };
    });
    applyAndRender();
  });

}

init();