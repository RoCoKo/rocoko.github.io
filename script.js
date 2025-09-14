import { benchmarks } from './benchmarks.js';

const API_KEY = '31FB258F6CD7538985642DE56954FCEC';
const form = document.getElementById('steam-form');
const input = document.getElementById('steamid');
const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const table = document.getElementById('results-table');
const tbody = table.querySelector('tbody');

// Cache for game details to avoid re-fetching
const gameDetailsCache = new Map();

function showLoader(show) {
  loader.classList.toggle('hidden', !show);
}
function showProgress(show) {
  progressContainer.classList.toggle('hidden', !show);
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

// Parallel processing functions
async function processGamesInBatches(games, batchSize = 10) {
  const results = [];
  const totalGames = games.length;
  let processedCount = 0;
  
  // Process games in batches
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    const batchPromises = batch.map(async (game) => {
      try {
        let details = gameDetailsCache.get(game.appid);
        if (!details) {
          details = await fetchGameDetails(game.appid);
          gameDetailsCache.set(game.appid, details);
        }
        
        const req = details ? parseRequirements(details) : null;
        const scoreObj = calculateScore(game.name, req);
        
        processedCount++;
        updateProgress(processedCount, totalGames);
        
        return scoreObj;
      } catch (err) {
        processedCount++;
        updateProgress(processedCount, totalGames);
        return calculateScore(game.name, null);
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach(result => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    });
    
    // Small delay between batches to respect API limits
    if (i + batchSize < games.length) {
      await sleep(25); // Reduced delay for faster processing
    }
  }
  
  return results;
}

function updateProgress(processed, total) {
  const percentage = Math.round((processed / total) * 100);
  setStatus(`İşleniyor: ${processed}/${total} oyun`);
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${percentage}%`;
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
  showProgress(false);
  showTable(false);
  try {
    const games = await fetchGames(steamid);
    console.log('Games found:', games.length); // Debug log
    if (!games || !games.length) {
      setStatus('Kütüphanede oyun bulunamadı. Lütfen kontrol edin:\n• Steam ID\'niz doğru mu?\n• Steam profiliniz herkese açık mı?\n• Kütüphanenizde oyun var mı?\n\nDetaylı bilgi için tarayıcı konsolunu kontrol edin (F12).');
      showLoader(false);
      return;
    }
    setStatus(`Toplam ${games.length} oyun bulundu. Paralel işleniyor...`);
    showLoader(false);
    showProgress(true);
    
    const startTime = performance.now();
    const results = await processGamesInBatches(games, 10); // 10 concurrent requests
    const endTime = performance.now();
    const processingTime = Math.round(endTime - startTime);
    results.sort((a, b) => b.score - a.score);
    renderTable(results);
    setStatus(`Tüm oyunlar işlendi. (${processingTime}ms - ${Math.round(games.length / (processingTime / 1000))} oyun/saniye)`);
    showProgress(false);
    showTable(true);
  } catch (err) {
    setStatus('Bir hata oluştu: ' + err.message);
    showProgress(false);
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
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    const parsed = JSON.parse(data.contents);
    
    if (!parsed[appid] || !parsed[appid].success) {
      throw new Error('Game details not available');
    }
    
    return parsed[appid].data.pc_requirements?.minimum || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

function parseRequirements(minReqStr) {
  if (!minReqStr) return null;
  
  // Daha kapsamlı regex patterns
  const patterns = {
    cpu: [
      /(İşlemci|Processor|CPU)\s*:?\s*([^<\n]+)/i,
      /(Intel|AMD)\s+[^<\n]+/i,
      /Core\s+[^<\n]+/i,
      /Ryzen\s+[^<\n]+/i,
      /Pentium\s+[^<\n]+/i
    ],
    gpu: [
      /(Ekran Kartı|Graphics|GPU|Video)\s*:?\s*([^<\n]+)/i,
      /(NVIDIA|GeForce|GTX|RTX)\s+[^<\n]+/i,
      /(AMD|Radeon|RX)\s+[^<\n]+/i,
      /(Intel)\s+(HD|UHD|Iris)\s+[^<\n]+/i,
      /(ATI|NVidia)\s+[^<\n]+/i
    ],
    ram: [
      /(Bellek|Memory|RAM)\s*:?\s*([^<\n]+)/i,
      /(\d+)\s*(GB|MB)\s*(RAM|Memory|Bellek)/i
    ]
  };
  
  let cpu = '';
  let gpu = '';
  let ram = 0;
  
  // CPU detection
  for (const pattern of patterns.cpu) {
    const match = minReqStr.match(pattern);
    if (match) {
      cpu = cleanModel(match[2] || match[0]);
      break;
    }
  }
  
  // GPU detection - daha akıllı parsing
  for (const pattern of patterns.gpu) {
    const match = minReqStr.match(pattern);
    if (match) {
      let gpuText = match[2] || match[0];
      
      // Uzun açıklamaları kısalt
      if (gpuText.includes('Video card with') || gpuText.includes('Shader model')) {
        // En iyi GPU'yu bul
        const gpuMatches = gpuText.match(/(ATI|NVidia|NVIDIA|AMD|GeForce|Radeon|GTX|RTX|HD|X\d+|\d+GT)/gi);
        if (gpuMatches && gpuMatches.length > 0) {
          // En yüksek numaralı GPU'yu seç
          let bestGpu = gpuMatches[0];
          for (let gpu of gpuMatches) {
            const num1 = gpu.match(/\d+/);
            const num2 = bestGpu.match(/\d+/);
            if (num1 && num2 && parseInt(num1[0]) > parseInt(num2[0])) {
              bestGpu = gpu;
            }
          }
          gpu = cleanModel(bestGpu);
        } else {
          gpu = cleanModel(gpuText);
        }
      } else {
        gpu = cleanModel(gpuText);
      }
      break;
    }
  }
  
  // RAM detection
  for (const pattern of patterns.ram) {
    const match = minReqStr.match(pattern);
    if (match) {
      const ramStr = (match[2] || match[1]).replace(/[^0-9.,]/g, '').replace(',', '.');
      ram = parseFloat(ramStr);
      if (minReqStr.match(/MB/i)) ram = Math.round(ram/1024);
      break;
    }
  }
  
  return { cpu, gpu, ram };
}

function cleanModel(str) {
  if (!str) return '';
  
  // Uzun açıklamaları temizle
  str = str.replace(/Video card with \d+ MB[^,]*/gi, '');
  str = str.replace(/Shader model \d+\.\d+/gi, '');
  str = str.replace(/or better/gi, '');
  str = str.replace(/compatible/gi, '');
  str = str.replace(/DirectX \d+\.\d+/gi, '');
  
  // "or" ile ayrılmışsa en yüksek benchmarklıyı seç
  let models = str.split(/\bor\b|veya|\/|,|\//i).map(s => s.trim()).filter(s => s.length > 0);
  
  if (models.length === 0) return '';
  
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
  if (!str) return '';
  
  // Sık kullanılan model adlarını sadeleştir
  str = str.replace(/(Intel|AMD|NVIDIA|GeForce|Radeon|Core|CPU|Processor|Ekran Kartı|Graphics|\(R\)|\(TM\))/gi, '');
  str = str.replace(/Quad-Core|Dual-Core|Six-Core|Eight-Core/gi, '');
  str = str.replace(/@.*$/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  
  // Özel durumlar için daha iyi normalizasyon
  str = str.replace(/^X(\d+)$/i, 'X$1'); // ATI X800 -> X800
  str = str.replace(/^(\d+)GT$/i, '$1GT'); // 6600GT -> 6600GT
  str = str.replace(/^(\d+)$/i, '$1'); // Sadece numara varsa olduğu gibi bırak
  
  // Model adını büyük/küçük harf duyarsızlaştır
  return str;
}

// Browser-based hardware detection
function detectHardware() {
  const hardware = {
    cores: navigator.hardwareConcurrency || 'Bilinmiyor',
    memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Bilinmiyor',
    gpu: 'Bilinmiyor',
    platform: navigator.platform || 'Bilinmiyor'
  };
  
  // Try to detect GPU via WebGL
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        hardware.gpu = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Bilinmiyor';
      }
    }
  } catch (e) {
    console.warn('GPU detection failed:', e);
  }
  
  return hardware;
}

function calculateScore(name, req) {
  const detectedHw = detectHardware();
  
  if (!req) {
    return { 
      name, 
      score: 0, 
      hw: `Tespit: CPU Çekirdek: ${detectedHw.cores}, RAM: ${detectedHw.memory}, GPU: ${detectedHw.gpu}` 
    };
  }
  
  let cpuScore = benchmarks.cpu[req.cpu] || 500;
  let gpuScore = benchmarks.gpu[req.gpu] || 500;
  let ramScore = (req.ram || 0) * 150;
  let total = Math.round(cpuScore * 0.4 + gpuScore * 0.5 + ramScore);
  
  // Show both game requirements and detected hardware
  let hw = `Gereksinim: CPU: ${req.cpu || '-'}, GPU: ${req.gpu || '-'}, RAM: ${req.ram || '-'} GB`;
  hw += ` | Tespit: CPU Çekirdek: ${detectedHw.cores}, RAM: ${detectedHw.memory}, GPU: ${detectedHw.gpu}`;
  
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

// Performance optimization: Clear cache when starting new session
function clearCache() {
  gameDetailsCache.clear();
  console.log('Cache cleared');
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

// Clear cache when form is submitted
form.addEventListener('submit', () => {
  clearCache();
});
