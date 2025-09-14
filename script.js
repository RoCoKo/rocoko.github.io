import { benchmarks } from './benchmarks.js';

// Backend configuration - HTTPS'den HTTP'ye istek yapmak yerine daha güvenli yaklaşım
const BACKEND_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://rocoko.github.io';
const API_KEY = '31FB258F6CD7538985642DE56954FCEC';

// DOM elements
const form = document.getElementById('steam-form');
const input = document.getElementById('steamid');
const statusDiv = document.getElementById('status');
const loader = document.getElementById('loader');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const table = document.getElementById('results-table');
const tbody = table.querySelector('tbody');

// Backend status elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

// Cache for game details to avoid re-fetching
const gameDetailsCache = new Map();

// Backend status management
let backendOnline = false;

// Check backend status with better error handling
async function checkBackendStatus() {
  try {
    // Only try backend if we're on localhost or if backend URL is HTTPS
    if (BACKEND_URL.startsWith('http://') && window.location.protocol === 'https:') {
      console.log('Skipping backend check: HTTPS to HTTP not allowed');
      setBackendStatus(false);
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      setBackendStatus(true);
      return true;
    } else {
      setBackendStatus(false);
      return false;
    }
  } catch (error) {
    console.log('Backend is offline:', error.message);
    setBackendStatus(false);
    return false;
  }
}

function setBackendStatus(online) {
  backendOnline = online;
  if (online) {
    statusIndicator.className = 'status-indicator online';
    statusText.textContent = 'Backend Online';
  } else {
    statusIndicator.className = 'status-indicator offline';
    statusText.textContent = 'Backend Offline';
  }
}

// Initialize backend status check
checkBackendStatus();
setInterval(checkBackendStatus, 10000); // Check every 10 seconds

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

// Ultra-conservative processing to avoid rate limits
async function processGamesInBatches(games, batchSize = 1) { // Process one at a time
  const results = [];
  const totalGames = games.length;
  let processedCount = 0;
  let consecutiveErrors = 0;
  let totalErrors = 0;
  const MAX_TOTAL_ERRORS = 10; // Stop if too many total errors
  
  // Process games one by one with generous delays
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    
    // Stop if too many errors
    if (totalErrors >= MAX_TOTAL_ERRORS) {
      console.log(`Too many errors (${totalErrors}), stopping processing...`);
      setStatus(`Çok fazla hata nedeniyle işlem durduruldu. ${processedCount}/${totalGames} oyun işlendi.`);
      break;
    }
    
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
      results.push(scoreObj);
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
      // Add delay between individual requests
      await sleep(1000); // 1 second delay between each request
      
    } catch (err) {
      console.warn(`Failed to fetch details for ${game.name}:`, err.message);
      processedCount++;
      updateProgress(processedCount, totalGames);
      results.push(calculateScore(game.name, null));
      
      consecutiveErrors++;
      totalErrors++;
      
      // If we get too many consecutive errors, increase delay significantly
      if (consecutiveErrors > 2) {
        console.log('Too many consecutive errors, increasing delay...');
        await sleep(5000); // 5 second delay
        consecutiveErrors = 0; // Reset counter
      } else {
        // Normal delay even on error
        await sleep(1000);
      }
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
  
  // Check backend status before processing
  const isBackendOnline = await checkBackendStatus();
  if (isBackendOnline) {
    setStatus('Backend bağlantısı kuruldu. Oyunlar getiriliyor...');
  } else {
    setStatus('Backend offline. Proxy servisleri kullanılıyor...');
  }
  
  clearTable();
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
    const results = await processGamesInBatches(games, 1); // Process one at a time to avoid rate limits
    const endTime = performance.now();
    const processingTime = Math.round(endTime - startTime);
    results.sort((a, b) => b.score - a.score);
    renderTable(results);
    setStatus(`Tüm oyunlar işlendi. (${processingTime}ms - ${Math.round(games.length / (processingTime / 1000))} oyun/saniye)`);
    showProgress(false);
    showTable(true);
  } catch (err) {
    console.error('Form submission error:', err);
    let errorMessage = 'Bir hata oluştu: ' + err.message;
    
    // Provide more specific error messages
    if (err.message.includes('proxy')) {
      errorMessage = 'Proxy servisleri çalışmıyor. Lütfen daha sonra tekrar deneyin.';
    } else if (err.message.includes('Steam API')) {
      errorMessage = 'Steam API hatası. Lütfen Steam ID\'nizi kontrol edin.';
    } else if (err.message.includes('timeout')) {
      errorMessage = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.';
    }
    
    setStatus(errorMessage);
    showProgress(false);
  }
  showLoader(false);
});

// More reliable proxy services with better error handling
const PROXY_SERVICES = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://cors-anywhere.herokuapp.com/',
  'https://cors.bridged.cc/',
  'https://api.codetabs.com/v1/proxy?quest='
];

// Track proxy health to avoid repeatedly trying failed proxies
const proxyHealth = new Map();
const MAX_FAILURES = 3;

async function fetchWithProxy(url, proxyIndex = 0, retryCount = 0) {
  // Skip proxies that have failed too many times
  if (proxyHealth.get(proxyIndex) >= MAX_FAILURES) {
    if (proxyIndex < PROXY_SERVICES.length - 1) {
      return await fetchWithProxy(url, proxyIndex + 1, 0);
    } else {
      throw new Error('Tüm proxy servisleri başarısız oldu.');
    }
  }
  
  if (proxyIndex >= PROXY_SERVICES.length) {
    throw new Error('Tüm proxy servisleri başarısız oldu.');
  }
  
  const proxyUrl = PROXY_SERVICES[proxyIndex] + encodeURIComponent(url);
  console.log(`Trying proxy ${proxyIndex + 1}: ${PROXY_SERVICES[proxyIndex]}`);
  
  // Update status to show which proxy is being used
  if (proxyIndex > 0) {
    setStatus(`Proxy ${proxyIndex + 1} deneniyor...`);
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // Reduced timeout to 15 seconds
    
    const res = await fetch(proxyUrl, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Handle rate limiting with exponential backoff
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 2000; // Increased base delay
      
      if (retryCount < 2) { // Reduced max retries
        console.log(`Rate limited. Waiting ${delay}ms before retry ${retryCount + 1}...`);
        await sleep(delay);
        return await fetchWithProxy(url, proxyIndex, retryCount + 1);
      } else {
        // Mark this proxy as failed and try next
        proxyHealth.set(proxyIndex, (proxyHealth.get(proxyIndex) || 0) + 1);
        if (proxyIndex < PROXY_SERVICES.length - 1) {
          console.log(`Max retries reached for proxy ${proxyIndex + 1}, trying next proxy...`);
          return await fetchWithProxy(url, proxyIndex + 1, 0);
        } else {
          throw new Error('Rate limit exceeded on all proxies');
        }
      }
    }
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    // Reset failure count on success
    proxyHealth.set(proxyIndex, 0);
    
    // Handle different proxy response formats
    if (data.contents) {
      // allorigins.win format
      return JSON.parse(data.contents);
    } else if (data.response) {
      // Direct Steam API response
      return data;
    } else {
      // Try to parse as direct response
      return data;
    }
  } catch (error) {
    console.warn(`Proxy ${proxyIndex + 1} failed:`, error.message);
    
    // Mark proxy as failed
    proxyHealth.set(proxyIndex, (proxyHealth.get(proxyIndex) || 0) + 1);
    
    // If it's a network error and we haven't exceeded retries, try again
    if (retryCount < 1 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
      console.log(`Network error, retrying in ${Math.pow(2, retryCount) * 2000}ms...`);
      await sleep(Math.pow(2, retryCount) * 2000);
      return await fetchWithProxy(url, proxyIndex, retryCount + 1);
    }
    
    if (proxyIndex < PROXY_SERVICES.length - 1) {
      console.log(`Trying next proxy...`);
      return await fetchWithProxy(url, proxyIndex + 1, 0);
    } else {
      throw error;
    }
  }
}

async function fetchGames(steamid) {
  // Try backend first if online
  if (backendOnline) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/steam/games/${steamid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Backend response:', data);
        return data.games || [];
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Backend error');
      }
    } catch (error) {
      console.warn('Backend failed, falling back to proxy:', error.message);
      setBackendStatus(false);
      // Fall through to proxy method
    }
  }
  
  // Fallback to proxy method
  const steamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`;
  
  try {
    const parsed = await fetchWithProxy(steamUrl);
    console.log('Proxy API Response:', parsed); // Debug log
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
  } catch (error) {
    console.error('Steam API fetch failed:', error);
    throw new Error(`Oyunlar alınamadı: ${error.message}`);
  }
}

async function fetchGameDetails(appid) {
  // Try backend first if online
  if (backendOnline) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/steam/game/${appid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.requirements || '';
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Backend error');
      }
    } catch (error) {
      console.warn(`Backend failed for game ${appid}, falling back to proxy:`, error.message);
      // Fall through to proxy method
    }
  }
  
  // Fallback to proxy method
  const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=turkish`;
  
  try {
    const parsed = await fetchWithProxy(steamUrl);
    
    if (!parsed[appid] || !parsed[appid].success) {
      throw new Error('Game details not available');
    }
    
    return parsed[appid].data.pc_requirements?.minimum || '';
  } catch (error) {
    console.warn(`Failed to fetch game details for ${appid}:`, error.message);
    
    // If it's a rate limit or CORS error, don't throw - just return null
    if (error.message.includes('429') || 
        error.message.includes('CORS') || 
        error.message.includes('Rate limit') ||
        error.message.includes('proxy')) {
      console.log(`Skipping ${appid} due to API limitations`);
      return null;
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

// Global canvas for WebGL detection to avoid context warnings
let globalCanvas = null;
let globalGL = null;
let cachedHardware = null;

// Browser-based hardware detection (cached)
function detectHardware() {
  if (cachedHardware) {
    return cachedHardware;
  }
  
  const hardware = {
    cores: navigator.hardwareConcurrency || 'Bilinmiyor',
    memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Bilinmiyor',
    gpu: 'Bilinmiyor',
    platform: navigator.platform || 'Bilinmiyor'
  };
  
  // Try to detect GPU via WebGL (reuse canvas properly)
  try {
    if (!globalCanvas) {
      globalCanvas = document.createElement('canvas');
      globalCanvas.width = 1;
      globalCanvas.height = 1;
    }
    
    if (!globalGL) {
      globalGL = globalCanvas.getContext('webgl') || globalCanvas.getContext('experimental-webgl');
    }
    
    if (globalGL) {
      const debugInfo = globalGL.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        hardware.gpu = globalGL.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Bilinmiyor';
      }
    }
  } catch (e) {
    console.warn('GPU detection failed:', e);
  }
  
  // Cache the result
  cachedHardware = hardware;
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
  cachedHardware = null; // Reset hardware detection cache
  proxyHealth.clear(); // Reset proxy health tracking
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

// Test proxy connectivity
window.testProxies = async function() {
  console.log('Testing proxy services...');
  const testUrl = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=test&steamid=76561198000000000&include_appinfo=1';
  
  for (let i = 0; i < PROXY_SERVICES.length; i++) {
    try {
      console.log(`Testing proxy ${i + 1}: ${PROXY_SERVICES[i]}`);
      const result = await fetchWithProxy(testUrl, i);
      console.log(`✓ Proxy ${i + 1} is working`);
      return i;
    } catch (error) {
      console.log(`✗ Proxy ${i + 1} failed:`, error.message);
    }
  }
  console.log('All proxies failed');
  return -1;
};

// Clear cache when form is submitted
form.addEventListener('submit', () => {
  clearCache();
});