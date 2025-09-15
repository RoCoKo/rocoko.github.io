import { benchmarks } from './benchmarks.js';

// Backend configuration - HTTPS'den HTTP'ye istek yapmak yerine daha güvenli yaklaşım
const BACKEND_URL = 'https://1b42b640d155.ngrok-free.app';
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
const hardwareInfoDiv = document.getElementById('hardware-info');

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
      mode: 'cors',
      headers: {
        'ngrok-skip-browser-warning': '1'
      }
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
      setStatus(`Processing stopped due to too many errors. ${processedCount}/${totalGames} games processed.`);
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
  setStatus(`Processing: ${processed}/${total} games`);
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${percentage}%`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const steamid = input.value.trim();
  if (!/^\d{17}$/.test(steamid)) {
    setStatus('Please enter a valid 64-bit Steam ID.');
    return;
  }
  
  // Check backend status before processing
  const isBackendOnline = await checkBackendStatus();
  if (isBackendOnline) {
    setStatus('Backend connection established. Fetching games...');
  } else {
    setStatus('Backend offline. Using proxy services...');
  }
  
  clearTable();
  showLoader(true);
  showProgress(false);
  showTable(false);
  try {
    const games = await fetchGames(steamid);
    if (!games || !games.length) {
      setStatus('No games found in the library. Please check:\n• Is your Steam ID correct?\n• Is your Steam profile public?\n• Do you have games in your library?\n\nCheck the browser console (F12) for more details.');
      showLoader(false);
      return;
    }
    setStatus(`Found ${games.length} games in total. Processing quickly...`);
    showLoader(false);
    showProgress(true);
    
    const startTime = performance.now();
    const results = await processGamesInBatches(games, 5); // Process 5 at a time for speed
    const endTime = performance.now();
    const processingTime = Math.round(endTime - startTime);
    results.sort((a, b) => b.score - a.score);
    renderTable(results);
    setStatus(`All games processed. (${processingTime}ms - ${Math.round(games.length / (processingTime / 1000))} games/second)`);
    showProgress(false);
    showTable(true);
  } catch (err) {
    console.error('Form submission error:', err);
    let errorMessage = 'An error occurred: ' + err.message;
    
    // Provide more specific error messages
    if (err.message.includes('backend')) {
      errorMessage = 'Could not connect to the backend server. Please make sure the server and ngrok tunnel are running.';
    } else if (err.message.includes('Steam API')) {
      errorMessage = 'Steam API error. Please check your Steam ID and make sure your profile is public.';
    } else if (err.message.includes('timeout')) {
      errorMessage = 'The request timed out. Please try again.';
    } else if (err.message.includes('game not found')) {
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
    headers: { 
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1'
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'An unknown backend error occurred.' }));
    throw new Error(errorData.error || 'Backend error');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected response format (not JSON). A temporary HTML page was probably received.');
  }
  const data = await response.json();
  if (!data.games || data.games.length === 0) {
    throw new Error('No games found in library or profile is private.');
  }
  return data.games;
}

async function fetchGameDetails(appid) {
  const response = await fetch(`${BACKEND_URL}/api/steam/game/${appid}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1'
    }
  });

  if (!response.ok) {
    // Don't throw for a single game, just return null to not stop the whole process.
    console.error(`Could not get game details (appid: ${appid}). Server response: ${response.status}`);
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    console.error(`Game detail in unexpected format (appid: ${appid}).`);
    return null;
  }
  const data = await response.json();
  // Return only minimum requirements, or an empty string if not available
  const pcReq = data.data?.pc_requirements || {};
  return pcReq.minimum || '';
}

function parseRequirements(minReqStr) {
  if (!minReqStr) return null;
  
  // Normalize HTML to plain text first so regex can work reliably
  const htmlToText = (html) => {
    try {
      // Preserve some structure before stripping
      const normalized = String(html)
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(li|p|ul|ol)>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '- ');
      const temp = document.createElement('div');
      temp.innerHTML = normalized;
      const text = (temp.textContent || temp.innerText || '').replace(/\u00A0/g, ' ');
      return text;
    } catch (_) {
      return String(html);
    }
  };
  
  const text = htmlToText(minReqStr)
    .replace(/\r?\n/g, '\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
  
  // More comprehensive regex patterns for better parsing
  const patterns = {
    cpu: [
      /(CPU|Processor)\s*:?\s*([^\n\r]+)/i,
      /(Intel|AMD)\s+[^<\n\r]+/i,
      /Core\s+[^<\n\r]+/i,
      /Ryzen\s+[^<\n\r]+/i,
      /Pentium\s+[^<\n\r]+/i,
      /Celeron\s+[^<\n\r]+/i,
      /Athlon\s+[^<\n\r]+/i,
      /FX\s+[^<\n\r]+/i
    ],
    gpu: [
      /(Graphics|GPU|Video)\s*:?\s*([^\n\r]+)/i,
      /(NVIDIA|GeForce|GTX|RTX)\s+[^<\n\r]+/i,
      /(AMD|Radeon|RX)\s+[^<\n\r]+/i,
      /(Intel)\s+(HD|UHD|Iris|Arc)\s+[^<\n\r]+/i,
      /(ATI|NVidia)\s+[^<\n\r]+/i,
      /(GTX|RTX|GT)\s+\d+[^<\n\r]*/i,
      /(RX|HD|R9|R7|R5)\s+\d+[^<\n\r]*/i
    ],
    ram: [
      /(Memory|RAM)\s*:?\s*([^\n\r]+)/i,
      /(\d+)\s*(GB|MB)\s*(Memory|RAM)/i,
      /(\d+)\s*(GB|MB)\s*(of\s+)?(Memory|RAM)/i
    ]
  };
  
  let cpu = '';
  let gpu = '';
  let ram = 0;
  
  // CPU detection with better matching
  for (const pattern of patterns.cpu) {
    const match = text.match(pattern);
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
    const match = text.match(pattern);
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
    const match = text.match(pattern);
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
  str = str.replace(/,?\s*(and|or)?\s*integrated graphics not (supported|recommended)/gi, '');
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
  
  // Handle multiple options separated by "or", "/", ","
  let models = str.split(/\bor\b|\/|,|\//i).map(s => s.trim()).filter(s => s.length > 0);
  
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
  str = str.replace(/(Intel|AMD|NVIDIA|GeForce|Radeon|Core|CPU|Processor|Graphics|\(R\)|\(TM\)|\(C\))/gi, '');
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
    cores: navigator.hardwareConcurrency || 'Unknown',
    memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown',
    gpu: 'Unknown',
    platform: navigator.platform || 'Unknown'
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
        const gpuString = globalGL.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (gpuString) {
          // Try to extract a clean name, especially from ANGLE wrappers
          const match = gpuString.match(/\((?:[^,]+,\s*)?([^,(]+)/);
          hardware.gpu = match ? match[1].trim() : gpuString;
        } else {
          hardware.gpu = 'Unknown';
        }
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
  if (!req) {
    return {
      name,
      score: 0,
      hw: `No data`
    };
  }

  let cpuScore = benchmarks.cpu[req.cpu] || 500;
  let gpuScore = benchmarks.gpu[req.gpu] || 500;
  let ramScore = (req.ram || 0) * 150;
  let total = Math.round(cpuScore * 0.4 + gpuScore * 0.5 + ramScore);

  // Show game requirements in a cleaner format
  let hw = `CPU: ${req.cpu || '?'} | GPU: ${req.gpu || '?'} | RAM: ${req.ram || '?'} GB`;

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