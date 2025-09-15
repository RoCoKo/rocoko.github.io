import { benchmarks } from './benchmarks.js';

// Backend configuration - HTTPS'den HTTP'ye istek yapmak yerine daha güvenli yaklaşım
const BACKEND_URL = 'https://020575e0a80b.ngrok-free.app';
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

// Optimized processing with parallel requests
async function processGamesInBatches(games, batchSize = 5) { // Process 5 at a time
  const results = [];
  const totalGames = games.length;
  let processedCount = 0;
  let consecutiveErrors = 0;
  let totalErrors = 0;
  const MAX_TOTAL_ERRORS = 20; // Increased error tolerance
  
  // Process games in batches
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);
    
    // Stop if too many errors
    if (totalErrors >= MAX_TOTAL_ERRORS) {
      setStatus(`Çok fazla hata nedeniyle işlem durduruldu. ${processedCount}/${totalGames} oyun işlendi.`);
      break;
    }
    
    // Process batch in parallel
    const batchPromises = batch.map(async (game) => {
      try {
        let details = gameDetailsCache.get(game.appid);
        if (!details) {
          details = await fetchGameDetails(game.appid);
          gameDetailsCache.set(game.appid, details);
        }
        
        const req = details ? parseRequirements(details) : null;
        return calculateScore(game.name, req);
      } catch (err) {
        return calculateScore(game.name, null);
      }
    });
    
    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      processedCount += batch.length;
      updateProgress(processedCount, totalGames);
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < games.length) {
        await sleep(200); // Reduced delay to 200ms
      }
      
    } catch (err) {
      // If entire batch fails, process individually
      for (const game of batch) {
        try {
          let details = gameDetailsCache.get(game.appid);
          if (!details) {
            details = await fetchGameDetails(game.appid);
            gameDetailsCache.set(game.appid, details);
          }
          
          const req = details ? parseRequirements(details) : null;
          results.push(calculateScore(game.name, req));
        } catch (err) {
          results.push(calculateScore(game.name, null));
          consecutiveErrors++;
          totalErrors++;
        }
        processedCount++;
        updateProgress(processedCount, totalGames);
      }
      
      // If we get too many consecutive errors, increase delay
      if (consecutiveErrors > 3) {
        await sleep(2000); // 2 second delay
        consecutiveErrors = 0;
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
    if (!games || !games.length) {
      setStatus('Kütüphanede oyun bulunamadı. Lütfen kontrol edin:\n• Steam ID\'niz doğru mu?\n• Steam profiliniz herkese açık mı?\n• Kütüphanenizde oyun var mı?\n\nDetaylı bilgi için tarayıcı konsolunu kontrol edin (F12).');
      showLoader(false);
      return;
    }
    setStatus(`Toplam ${games.length} oyun bulundu. Hızlı işleniyor...`);
    showLoader(false);
    showProgress(true);
    
    const startTime = performance.now();
    const results = await processGamesInBatches(games, 5); // Process 5 at a time for speed
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
    if (err.message.includes('backend')) {
      errorMessage = 'Backend sunucusuna bağlanılamadı. Lütfen sunucunun ve ngrok tünelinin çalıştığından emin olun.';
    } else if (err.message.includes('Steam API')) {
      errorMessage = 'Steam API hatası. Lütfen Steam ID\'nizi kontrol edin ve profilinizin herkese açık olduğundan emin olun.';
    } else if (err.message.includes('timeout')) {
      errorMessage = 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.';
    } else if (err.message.includes('oyun bulunamadı')) {
      errorMessage = err.message; // Use the specific message from fetchGames
    }
    
    setStatus(errorMessage);
    showProgress(false);
  }
  showLoader(false);
});

async function fetchGames(steamid) {
  const response = await fetch(`${BACKEND_URL}/api/steam/games/${steamid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Bilinmeyen bir backend hatası oluştu.' }));
    throw new Error(errorData.error || 'Backend error');
  }

  const data = await response.json();
  if (!data.games || data.games.length === 0) {
    throw new Error('Kütüphanede oyun bulunamadı veya profil gizli.');
  }
  return data.games;
}

async function fetchGameDetails(appid) {
  const response = await fetch(`${BACKEND_URL}/api/steam/game/${appid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    // Don't throw for a single game, just return null to not stop the whole process.
    console.error(`Oyun detayı alınamadı (appid: ${appid}). Sunucu yanıtı: ${response.status}`);
    return null;
  }

  const data = await response.json();
  // Return the requirements string, or an empty string if not available
  return data.data?.pc_requirements?.minimum || '';
}

function parseRequirements(minReqStr) {
  if (!minReqStr) return null;
  
  // More comprehensive regex patterns for better parsing
  const patterns = {
    cpu: [
      /(İşlemci|Processor|CPU)\s*:?\s*([^<\n\r]+)/i,
      /(Intel|AMD)\s+[^<\n\r]+/i,
      /Core\s+[^<\n\r]+/i,
      /Ryzen\s+[^<\n\r]+/i,
      /Pentium\s+[^<\n\r]+/i,
      /Celeron\s+[^<\n\r]+/i,
      /Athlon\s+[^<\n\r]+/i,
      /FX\s+[^<\n\r]+/i
    ],
    gpu: [
      /(Ekran Kartı|Graphics|GPU|Video)\s*:?\s*([^<\n\r]+)/i,
      /(NVIDIA|GeForce|GTX|RTX)\s+[^<\n\r]+/i,
      /(AMD|Radeon|RX)\s+[^<\n\r]+/i,
      /(Intel)\s+(HD|UHD|Iris|Arc)\s+[^<\n\r]+/i,
      /(ATI|NVidia)\s+[^<\n\r]+/i,
      /(GTX|RTX|GT)\s+\d+[^<\n\r]*/i,
      /(RX|HD|R9|R7|R5)\s+\d+[^<\n\r]*/i
    ],
    ram: [
      /(Bellek|Memory|RAM)\s*:?\s*([^<\n\r]+)/i,
      /(\d+)\s*(GB|MB)\s*(RAM|Memory|Bellek)/i,
      /(\d+)\s*(GB|MB)\s*(of\s+)?(RAM|Memory|Bellek)/i
    ]
  };
  
  let cpu = '';
  let gpu = '';
  let ram = 0;
  
  // CPU detection with better matching
  for (const pattern of patterns.cpu) {
    const match = minReqStr.match(pattern);
    if (match) {
      let cpuText = match[2] || match[0];
      // Clean up common prefixes and suffixes
      cpuText = cpuText.replace(/^(Intel|AMD)\s+/i, '').trim();
      cpu = cleanModel(cpuText);
      if (cpu) break;
    }
  }
  
  // GPU detection with improved parsing
  for (const pattern of patterns.gpu) {
    const match = minReqStr.match(pattern);
    if (match) {
      let gpuText = match[2] || match[0];
      
      // Handle complex GPU descriptions
      if (gpuText.includes('Video card with') || gpuText.includes('Shader model')) {
        // Extract the best GPU from the description
        const gpuMatches = gpuText.match(/(ATI|NVidia|NVIDIA|AMD|GeForce|Radeon|GTX|RTX|HD|UHD|Iris|Arc|X\d+|\d+GT|RX\d+)/gi);
        if (gpuMatches && gpuMatches.length > 0) {
          // Find the highest numbered GPU
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
      if (gpu) break;
    }
  }
  
  // RAM detection with better number parsing
  for (const pattern of patterns.ram) {
    const match = minReqStr.match(pattern);
    if (match) {
      let ramText = match[2] || match[1];
      // Extract numbers from the text
      const ramMatch = ramText.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
      if (ramMatch) {
        ram = parseFloat(ramMatch[1]);
        if (ramMatch[2].toUpperCase() === 'MB') {
          ram = Math.round(ram / 1024 * 10) / 10; // Convert MB to GB with 1 decimal
        }
        break;
      }
    }
  }
  
  return { cpu, gpu, ram };
}

function cleanModel(str) {
  if (!str) return '';
  
  // Clean up common descriptions and technical details
  str = str.replace(/Video card with \d+ MB[^,]*/gi, '');
  str = str.replace(/Shader model \d+\.\d+/gi, '');
  str = str.replace(/or better/gi, '');
  str = str.replace(/compatible/gi, '');
  str = str.replace(/DirectX \d+\.\d+/gi, '');
  str = str.replace(/OpenGL \d+\.\d+/gi, '');
  str = str.replace(/Vulkan \d+\.\d+/gi, '');
  str = str.replace(/@.*$/g, ''); // Remove clock speeds
  str = str.replace(/\(.*?\)/g, ''); // Remove parentheses content
  str = str.replace(/\s+/g, ' ').trim(); // Clean up whitespace
  
  // Handle multiple options separated by "or", "veya", "/", ","
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
  
  // Remove common brand names and technical terms
  str = str.replace(/(Intel|AMD|NVIDIA|GeForce|Radeon|Core|CPU|Processor|Ekran Kartı|Graphics|\(R\)|\(TM\)|\(C\))/gi, '');
  str = str.replace(/Quad-Core|Dual-Core|Six-Core|Eight-Core|Octa-Core/gi, '');
  str = str.replace(/@.*$/g, ''); // Remove clock speeds
  str = str.replace(/\(.*?\)/g, ''); // Remove parentheses
  str = str.replace(/\s+/g, ' ').trim(); // Clean up whitespace
  
  // Special cases for better normalization
  str = str.replace(/^X(\d+)$/i, 'X$1'); // ATI X800 -> X800
  str = str.replace(/^(\d+)GT$/i, '$1GT'); // 6600GT -> 6600GT
  str = str.replace(/^(\d+)Ti$/i, '$1Ti'); // 1060Ti -> 1060Ti
  str = str.replace(/^(\d+)$/i, '$1'); // Keep pure numbers
  
  // Normalize common GPU series
  str = str.replace(/^GTX\s*(\d+)/i, 'GTX $1');
  str = str.replace(/^RTX\s*(\d+)/i, 'RTX $1');
  str = str.replace(/^RX\s*(\d+)/i, 'RX $1');
  str = str.replace(/^HD\s*(\d+)/i, 'HD $1');
  
  return str.trim();
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
    // GPU detection failed - keep silent
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
      hw: `Gereksinim: CPU: -, GPU: -, RAM: - GB | Tespit: CPU Çekirdek: ${detectedHw.cores}, RAM: ${detectedHw.memory}, GPU: ${detectedHw.gpu}` 
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
}

// Test function to debug Steam API - can be called from browser console
window.testSteamAPI = async function(steamid) {
  try {
    const games = await fetchGames(steamid);
    return games;
  } catch (error) {
    return null;
  }
};

// Clear cache when form is submitted
form.addEventListener('submit', () => {
  clearCache();
});