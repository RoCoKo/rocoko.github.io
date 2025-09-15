import { benchmarks } from './benchmarks.js';

// DOM elements
const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const table = document.getElementById('results-table');
const tbody = table.querySelector('tbody');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const reloadBtn = document.getElementById('reload');

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

async function loadRequirements() {
  showLoader(true);
  setStatus('Loading requirements JSON...');
  try {
    const res = await fetch('cyri-data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setStatus(`Loaded ${data.length} entries.`);
    return data;
  } catch (e) {
    setStatus(`Failed to load JSON: ${e.message}`);
    return [];
  } finally {
    showLoader(false);
  }
}

function computeScoreFromMinimum(min) {
  if (!min) return { score: 0, hw: 'No data' };
  const cpuModel = normalizeModel(min.cpu || '');
  const gpuModel = normalizeModel(min.video_card || min.graphics || '');
  const ramGb = extractNumberGb(min.ram || '');
  const vramGb = extractNumberGb(min.dedicated_video_ram || '') || 0;

  const cpuScore = (benchmarks.cpu[cpuModel] || 500) * 0.4;
  const gpuScore = (benchmarks.gpu[gpuModel] || 500) * 0.5;
  const ramScore = Math.max(0, ramGb) * 150;
  const total = Math.round(cpuScore + gpuScore + ramScore);

  let hw = `CPU: ${min.cpu || '?'} | GPU: ${min.video_card || min.graphics || '?'}${vramGb ? ` (${vramGb} GB VRAM)` : ''} | RAM: ${ramGb || '?'} GB`;
  return { score: total, hw };
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

function renderTable(items) {
  clearTable();
  items.forEach((item, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${item.game || 'Unknown'}</td><td>${item._score}</td><td>${item._hw}</td>`;
    tbody.appendChild(tr);
  });
}

function filterAndSort(data) {
  const q = (searchInput.value || '').toLowerCase();
  const dir = sortSelect.value;
  const filtered = data.filter(x => (x.game || '').toLowerCase().includes(q));
  filtered.sort((a, b) => dir === 'asc' ? a._score - b._score : b._score - a._score);
  return filtered;
}

async function init() {
  const data = await loadRequirements();
  const enriched = data.map(entry => {
    const { score, hw } = computeScoreFromMinimum(entry.requirements?.minimum);
    return { ...entry, _score: score, _hw: hw };
  });
  const apply = () => renderTable(filterAndSort(enriched));
  searchInput.addEventListener('input', apply);
  sortSelect.addEventListener('change', apply);
  reloadBtn.addEventListener('click', async () => {
    const fresh = await loadRequirements();
    const enriched2 = fresh.map(entry => {
      const { score, hw } = computeScoreFromMinimum(entry.requirements?.minimum);
      return { ...entry, _score: score, _hw: hw };
    });
    renderTable(filterAndSort(enriched2));
  });
  showTable(true);
  apply();
}

init();