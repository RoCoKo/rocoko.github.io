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
    console.log('Games found:', games.length); // Debug log
    if (!games || !games.length) {
      setStatus('Kütüphanede oyun bulunamadı. Lütfen kontrol edin:\n• Steam ID\'niz doğru mu?\n• Steam profiliniz herkese açık mı?\n• Kütüphanenizde oyun var mı?\n\nDetaylı bilgi için tarayıcı konsolunu kontrol edin (F12).');
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
  console.log('API Response:', data); // Debug log
  
  if (!data.contents) {
    throw new Error('API yanıtı boş geldi.');
  }
  
  let parsed;
  try {
    parsed = JSON.parse(data.contents);
  } catch (e) {
    console.error('JSON parse error:', e);
    throw new Error('API yanıtı parse edilemedi.');
  }
  
  console.log('Parsed Response:', parsed); // Debug log
  console.log('Games array:', parsed.response?.games); // Debug log
  
  if (!parsed.response) {
    throw new Error('Steam API yanıtında response bulunamadı.');
  }
  
  if (parsed.response.error) {
    throw new Error(`Steam API hatası: ${parsed.response.error.error_desc || 'Bilinmeyen hata'}`);
  }
  
  // Check if games array exists and has content
  const games = parsed.response.games || [];
  console.log('Final games count:', games.length);
  
  if (games.length === 0) {
    console.warn('Games array is empty. This could be due to:');
    console.warn('1. Steam profile is private');
    console.warn('2. No games in library');
    console.warn('3. API key issues');
    console.warn('4. Steam ID format issues');
  }
  
  return games;
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

// Test function to debug Steam API - can be called from browser console
window.testSteamAPI = async function(steamid) {
  console.log('Testing Steam API for ID:', steamid);
  try {
    const games = await fetchGames(steamid);
    console.log('Test successful. Games found:', games.length);
    return games;
  } catch (error) {
    console.error('Test failed:', error);
    return null;
  }
};
