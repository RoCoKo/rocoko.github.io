#!/usr/bin/env node
/*
  Scrape SystemRequirementsLab (CYRI) game requirement pages and output normalized JSON.
  Input: one or more URLs via CLI or a file with URLs (one per line)
  Usage examples:
    node scrape-cyri.js --url https://www.systemrequirementslab.com/cyri/requirements/borderlands-4/27317
    node scrape-cyri.js --file cyri-urls.txt
    node scrape-cyri.js --file cyri-urls.txt --out data/cyri.json

  Notes:
  - Be gentle: includes throttling. Adjust RATE_MS if needed.
  - Output accumulates JSON array of games with min/recommended blocks when found.
*/

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const RATE_MS = 1200; // throttle between requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { urls: [], file: null, out: 'cyri-data.json' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--url' && args[i + 1]) {
      opts.urls.push(args[++i]);
    } else if (a === '--file' && args[i + 1]) {
      opts.file = args[++i];
    } else if (a === '--out' && args[i + 1]) {
      opts.out = args[++i];
    }
  }
  return opts;
}

function readUrlsFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function textBetween(haystack, start, end) {
  const i = haystack.indexOf(start);
  if (i === -1) return null;
  const j = haystack.indexOf(end, i + start.length);
  if (j === -1) return null;
  return haystack.slice(i + start.length, j);
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlToTextPreserveBreaks(html) {
  let s = html
    .replace(/<(br|BR)\s*\/?>(\s*)/g, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<(p|div|li|h\d)(\b[^>]*)?>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // collapse 3+ newlines to 2
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseRequirementsBlock(text) {
  // Expect lines like "CPU: ...", "RAM: ..." etc.
  const lines = text.split(/\n|\r/).map(s => s.trim()).filter(Boolean);
  const result = {};
  for (const line of lines) {
    const m = line.match(/^([A-Za-z ][A-Za-z ]*?):\s*(.+)$/);
    if (!m) continue;
    const key = normalizeKey(m[1]);
    const val = m[2].trim();
    result[key] = val;
  }
  return result;
}

function extractTitle(html) {
  // Try H1 text containing "System Requirements"
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const t = stripHtml(h1Match[1]);
    return t.replace(/ System Requirements.*$/i, '').trim();
  }
  // Fallback to title tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return stripHtml(titleMatch[1]).replace(/ System Requirements.*$/i, '').trim();
  }
  return null;
}

function findSectionText(html, headerText, stopHeaders = []) {
  const lowerHtml = html.toLowerCase();
  const headerIdx = lowerHtml.indexOf(headerText.toLowerCase());
  if (headerIdx === -1) return null;
  const startIdx = headerIdx + headerText.length;
  // Find nearest stop header after start
  let endIdx = html.length;
  for (const stop of stopHeaders) {
    const p = lowerHtml.indexOf(stop.toLowerCase(), startIdx);
    if (p !== -1 && p < endIdx) endIdx = p;
  }
  // Also guard with a max window size
  endIdx = Math.min(endIdx, startIdx + 8000);
  const sectionHtml = html.slice(startIdx, endIdx);
  const text = htmlToTextPreserveBreaks(sectionHtml);
  // Keep only lines like KEY: value
  const lines = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  const kvLines = [];
  for (const line of lines) {
    if (/^[A-Z][A-Z ]{1,30}:\s*/.test(line)) kvLines.push(line);
  }
  return kvLines.join('\n') || null;
}

function parseCyriPage(html, url) {
  const gameTitle = extractTitle(html);
  // Minimum
  let minBlock = null;
  minBlock = findSectionText(
    html,
    'System Requirements (Minimum)',
    ['Recommended Requirements', 'Latest Graphic Cards', 'Driver Update', 'Online games Test Latency']
  );
  if (!minBlock) {
    // Fallback to verbose text variant
    minBlock = findSectionText(
      html,
      'System Requirements (Minimum)',
      ['Recommended Requirements']
    );
  }
  const minParsed = minBlock ? parseRequirementsBlock(minBlock) : null;

  // Recommended
  const recBlock = findSectionText(
    html,
    'Recommended Requirements',
    ['Latest Graphic Cards', 'Driver Update', 'Online games Test Latency']
  );
  const recParsed = recBlock ? parseRequirementsBlock(recBlock) : null;

  return {
    source: 'systemrequirementslab',
    url,
    game: gameTitle || null,
    requirements: {
      minimum: minParsed,
      recommended: recParsed
    }
  };
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    validateStatus: s => s >= 200 && s < 400
  });
  return res.data;
}

async function main() {
  const opts = parseArgs();
  let urls = [...opts.urls];
  if (opts.file) {
    urls = urls.concat(readUrlsFromFile(opts.file));
  }
  urls = Array.from(new Set(urls));
  if (urls.length === 0) {
    console.error('No URLs provided. Use --url or --file.');
    process.exit(1);
  }

  const outPath = path.resolve(process.cwd(), opts.out);
  const results = [];

  for (let idx = 0; idx < urls.length; idx++) {
    const url = urls[idx];
    try {
      console.log(`[${idx + 1}/${urls.length}] Fetching`, url);
      const html = await fetchHtml(url);
      const parsed = parseCyriPage(html, url);
      results.push(parsed);
    } catch (err) {
      console.error('Failed:', url, '-', err.message);
      results.push({ source: 'systemrequirementslab', url, error: err.message });
    }
    if (idx < urls.length - 1) {
      await sleep(RATE_MS);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log('Saved', outPath);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


