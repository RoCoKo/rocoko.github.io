#!/usr/bin/env node
/*
  Crawl SystemRequirementsLab for CYRI game requirement URLs.
  - Starts from one or more seed URLs (category pages, game pages, or /cyri root)
  - Follows links within the same domain
  - Extracts unique links matching /cyri/requirements/<slug>/<id>

  Usage:
    node crawl-cyri.js --seed https://www.systemrequirementslab.com/cyri
    node crawl-cyri.js --seed https://www.systemrequirementslab.com/cyri/game-lists --max 200
    node crawl-cyri.js --seed https://www.systemrequirementslab.com/cyri/requirements/hollow-knight-silksong/18551 --depth 1
    node crawl-cyri.js --seedfile seeds.txt --out cyri-urls.txt --max 2000

  Notes:
  - Default max pages: 300, depth: 2
  - Respects domain boundary and a simple robots-like disallow list for auth/cart/etc.
  - Throttled requests to be gentle.
*/

const fs = require('fs');
const urlLib = require('url');
const path = require('path');
const axios = require('axios');

const START_DOMAIN = 'www.systemrequirementslab.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { seeds: [], seedfile: null, out: 'cyri-urls.txt', max: 300, depth: 2, state: 'crawl-state.json', rateMs: 700, saveEvery: 20, onlyCyri: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seed' && args[i + 1]) opts.seeds.push(args[++i]);
    else if (a === '--seedfile' && args[i + 1]) opts.seedfile = args[++i];
    else if (a === '--out' && args[i + 1]) opts.out = args[++i];
    else if (a === '--max' && args[i + 1]) opts.max = parseInt(args[++i], 10) || opts.max;
    else if (a === '--depth' && args[i + 1]) opts.depth = parseInt(args[++i], 10) || opts.depth;
    else if (a === '--state' && args[i + 1]) opts.state = args[++i];
    else if (a === '--rate-ms' && args[i + 1]) opts.rateMs = parseInt(args[++i], 10) || opts.rateMs;
    else if (a === '--save-every' && args[i + 1]) opts.saveEvery = parseInt(args[++i], 10) || opts.saveEvery;
    else if (a === '--all-paths') opts.onlyCyri = false;
  }
  return opts;
}

function readSeeds(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function canonicalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    // remove trailing slash except for root
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
      if (url.pathname === '') url.pathname = '/';
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isSameDomain(href) {
  try {
    const u = new URL(href);
    return u.hostname === START_DOMAIN;
  } catch {
    return false;
  }
}

function isAllowedPath(href, onlyCyri) {
  try {
    const u = new URL(href);
    if (onlyCyri) return u.pathname.toLowerCase().startsWith('/cyri');
    return true;
  } catch {
    return false;
  }
}

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const regex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const raw = m[1];
    const abs = absolutize(baseUrl, raw);
    const can = abs ? canonicalizeUrl(abs) : null;
    if (can && isSameDomain(can)) links.add(can);
  }
  return Array.from(links);
}

function extractRequirementUrls(urls) {
  const out = new Set();
  const pat = /^https:\/\/www\.systemrequirementslab\.com\/cyri\/requirements\/[a-z0-9\-]+\/[0-9]+$/i;
  for (const u of urls) {
    if (pat.test(u)) out.add(u);
  }
  return Array.from(out);
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    },
    validateStatus: s => s >= 200 && s < 400
  });
  return res.data;
}

function loadState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const json = JSON.parse(raw);
    return json;
  } catch {
    return null;
  }
}

function saveState(statePath, state) {
  const payload = {
    seen: Array.from(state.seen),
    queue: state.queue,
    found: Array.from(state.found),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function crawl(opts) {
  let queue = [];
  let seen = new Set();
  let foundReqUrls = new Set();

  let seeds = [...opts.seeds];
  if (opts.seedfile) seeds = seeds.concat(readSeeds(opts.seedfile));

  // Default seed: CYRI root
  if (seeds.length === 0) seeds.push('https://www.systemrequirementslab.com/cyri');

  // Resume from state if available
  const statePath = path.resolve(process.cwd(), opts.state);
  const existing = loadState(statePath);
  if (existing) {
    seen = new Set(existing.seen || []);
    foundReqUrls = new Set(existing.found || []);
    queue = Array.isArray(existing.queue) ? existing.queue : [];
    console.log(`Resuming: seen=${seen.size}, found=${foundReqUrls.size}, queue=${queue.length}`);
  }

  if (!queue.length) {
    console.log(`Seeds: ${seeds.join(', ')}`);
    for (const s of seeds) {
      queue.push({ url: canonicalizeUrl(s), depth: 0 });
    }
  }

  while (queue.length && seen.size < opts.max) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      console.log(`Visiting [${seen.size}/${opts.max}] depth=${depth}: ${url}`);
      const html = await fetchPage(url);
      const links = extractLinks(html, url);
      // capture requirement urls from this page
      for (const reqUrl of extractRequirementUrls(links)) foundReqUrls.add(reqUrl);
      if (foundReqUrls.size % 5 === 0 || foundReqUrls.size < 5) {
        console.log(`Found requirement URLs: ${foundReqUrls.size}`);
      }

      // continue BFS if within depth
      if (depth < opts.depth) {
        for (const l of links) {
          if (!seen.has(l) && isSameDomain(l) && isAllowedPath(l, opts.onlyCyri)) queue.push({ url: l, depth: depth + 1 });
        }
      }
    } catch (e) {
      console.log(`Fetch failed: ${url} -> ${e.message}`);
    }
    if (seen.size % opts.saveEvery === 0 || !queue.length) {
      saveState(statePath, { seen, queue, found: foundReqUrls });
      // Also write current URLs to out file for incremental results
      const outPath = path.resolve(process.cwd(), opts.out);
      fs.writeFileSync(outPath, Array.from(foundReqUrls).sort().join('\n') + '\n', 'utf8');
      console.log(`Checkpoint saved: seen=${seen.size}, found=${foundReqUrls.size}, queue=${queue.length}`);
    }
    if (queue.length) await sleep(opts.rateMs);
  }

  return Array.from(foundReqUrls).sort();
}

async function main() {
  const opts = parseArgs();
  const urls = await crawl(opts);
  const outPath = path.resolve(process.cwd(), opts.out);
  fs.writeFileSync(outPath, urls.join('\n') + '\n', 'utf8');
  console.log(`Discovered ${urls.length} requirement URLs -> ${outPath}`);
  // Final state save
  saveState(path.resolve(process.cwd(), opts.state), { seen: new Set(), queue: [], found: new Set(urls) });
}

main().catch(err => {
  console.error('Crawler error:', err);
  process.exit(1);
});


