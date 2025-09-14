import { benchmarks } from './benchmarks.js';

const API_KEY = '31FB258F6CD7538985642DE56954FCEC';
const form = document.getElementById('steam-form');
const input = document.getElementById('steamid');
const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const table = document.getElementById('results-table');
const tbody = table.querySelector('tbody');

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const steamid = input.value.trim();
  if (!/^\d{17}$/.test(steamid)) {
    setStatus('Geçerli bir 64-bit Steam ID giriniz.');
    return;
  }
  clearTable();
  setStatus('Oyunlar getiriliyor...');
  showLoader(true);
  showTable(false);
  try {
    const games = await fetchGames(steamid);
    if (!games.length) {
      setStatus('Kütüphanede oyun bulunamadı.');
      showLoader(false);
      return;
    }
    setStatus(`Toplam ${games.length} oyun bulundu. İşleniyor...`);
    const results = [];
    for (let i = 0; i < games.length; i++) {
      setStatus(`Oyun ${i+1}/${games.length} işleniyor...`);
      const game = games[i];
      let details;
      try {
        details = await fetchGameDetails(game.appid);
      } catch (err) {
        details = null;
      }
      let req = details ? parseRequirements(details) : null;
      let scoreObj = calculateScore(game.name, req);
      results.push(scoreObj);
      await sleep(100); // API limitine takılmamak için
    }
    results.sort((a, b) => b.score - a.score);
    renderTable(results);
    setStatus('Tüm oyunlar işlendi.');
    showTable(true);
  } catch (err) {
    setStatus('Bir hata oluştu: ' + err.message);
  }
  showLoader(false);
});

async function fetchGames(steamid) {
  const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Oyunlar alınamadı.');
  const data = await res.json();
  const parsed = JSON.parse(data.contents);
  return parsed.response.games || [];
}

async function fetchGameDetails(appid) {
  const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=turkish`)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Oyun detayı alınamadı.');
  const data = await res.json();
  const parsed = JSON.parse(data.contents);
  if (!parsed[appid] || !parsed[appid].success) throw new Error('Detay yok');
  return parsed[appid].data.pc_requirements?.minimum || '';
}

function parseRequirements(minReqStr) {
  if (!minReqStr) return null;
  // Türkçe ve İngilizce anahtar kelimeleri destekle
  const cpuMatch = minReqStr.match(/(İşlemci|Processor)\s*:?\s*([^<\n]+)/i);
  const gpuMatch = minReqStr.match(/(Ekran Kartı|Graphics)\s*:?\s*([^<\n]+)/i);
  const ramMatch = minReqStr.match(/(Bellek|Memory)\s*:?\s*([^<\n]+)/i);
  let cpu = cpuMatch ? cleanModel(cpuMatch[2]) : '';
  let gpu = gpuMatch ? cleanModel(gpuMatch[2]) : '';
  let ram = 0;
  if (ramMatch) {
    const ramStr = ramMatch[2].replace(/[^0-9.,]/g, '').replace(',', '.');
    ram = parseFloat(ramStr);
    if (minReqStr.match(/MB/i)) ram = Math.round(ram/1024);
  }
  return { cpu, gpu, ram };
}

function cleanModel(str) {
  // "or" ile ayrılmışsa en yüksek benchmarklıyı seç
  let models = str.split(/\bor\b|veya|\/|,|\//i).map(s => s.trim());
  let best = models[0];
  let bestScore = 0;
  for (let m of models) {
    let norm = normalizeModel(m);
    let score = benchmarks.cpu[norm] || benchmarks.gpu[norm] || 0;
    if (score > bestScore) {
      best = norm;
      bestScore = score;
    }
  }
  return normalizeModel(best);
}

function normalizeModel(str) {
  // Sık kullanılan model adlarını sadeleştir
  str = str.replace(/(Intel|AMD|NVIDIA|GeForce|Radeon|Core|CPU|Processor|Ekran Kartı|Graphics|\(R\)|\(TM\))/gi, '');
  str = str.replace(/Quad-Core|Dual-Core|Six-Core|Eight-Core/gi, '');
  str = str.replace(/@.*$/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  // Model adını büyük/küçük harf duyarsızlaştır
  return str;
}

function calculateScore(name, req) {
  if (!req) return { name, score: 0, hw: 'Bilinmiyor' };
  let cpuScore = benchmarks.cpu[req.cpu] || 500;
  let gpuScore = benchmarks.gpu[req.gpu] || 500;
  let ramScore = (req.ram || 0) * 150;
  let total = Math.round(cpuScore * 0.4 + gpuScore * 0.5 + ramScore);
  let hw = `CPU: ${req.cpu || '-'}, GPU: ${req.gpu || '-'}, RAM: ${req.ram || '-'} GB`;
  return { name, score: total, hw };
}

function renderTable(results) {
  clearTable();
  results.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${r.score}</td><td>${r.hw}</td>`;
    tbody.appendChild(tr);
  });
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}
