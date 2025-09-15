const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://rocoko.github.io', 'http://localhost:3000'],
  methods: ['GET', 'OPTIONS'], // Allow GET and OPTIONS methods
  allowedHeaders: ['Content-Type'], // Allow Content-Type header
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Add compression for faster responses
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minute cache
  next();
});

// Steam API Key (you can move this to environment variables)
const STEAM_API_KEY = '31FB258F6CD7538985642DE56954FCEC';

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // Max 100 requests per minute per IP

function rateLimit(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(clientIP)) {
    requestCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const clientData = requestCounts.get(clientIP);
  
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }
  
  clientData.count++;
  next();
}

// Apply rate limiting to API endpoints
app.use('/api', rateLimit);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    message: 'Backend is running' 
  });
});

// Steam API proxy endpoints
app.get('/api/steam/games/:steamid', async (req, res) => {
  try {
    const { steamid } = req.params;
    
    // Validate Steam ID format
    if (!/^\d{17}$/.test(steamid)) {
      return res.status(400).json({ 
        error: 'Invalid Steam ID format. Must be 17 digits.' 
      });
    }

    const steamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`;
    
    const response = await axios.get(steamUrl, {
      timeout: 10000, // Reduced timeout for faster response
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data.response) {
      return res.status(400).json({ 
        error: 'Steam API response missing data' 
      });
    }

    if (response.data.response.error) {
      return res.status(400).json({ 
        error: `Steam API error: ${response.data.response.error.error_desc || 'Unknown error'}` 
      });
    }

    const games = response.data.response.games || [];
    
    res.json({
      success: true,
      games: games,
      count: games.length
    });

  } catch (error) {
    console.error('Steam API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request timeout. Please try again.' 
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch games from Steam API' 
    });
  }
});

app.get('/api/steam/game/:appid', async (req, res) => {
  try {
    const { appid } = req.params;
    
    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ 
        error: 'Invalid App ID format' 
      });
    }

    const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=turkish`;
    
    const response = await axios.get(steamUrl, {
      timeout: 8000, // Reduced timeout for faster response
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data[appid] || !response.data[appid].success) {
      return res.status(404).json({ 
        error: 'Game details not available' 
      });
    }

    const gameData = response.data[appid].data;

    res.json({
      success: true,
      data: gameData
    });

  } catch (error) {
    console.error('Steam Store API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({ 
        error: 'Request timeout' 
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch game details' 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Steam Benchmark Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎮 Steam games: http://localhost:${PORT}/api/steam/games/{steamid}`);
  console.log(`🎯 Game details: http://localhost:${PORT}/api/steam/game/{appid}`);
});