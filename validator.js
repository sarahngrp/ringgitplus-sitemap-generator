'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const pLimit = require('p-limit');

/**
 * Normalize URL for deduplication: lowercase, consistent trailing slash.
 */
function normalizeUrl(url) {
  let normalized = url.toLowerCase().trim();
  // Ensure trailing slash for paths (but not for .html URLs)
  if (!normalized.endsWith('/') && !normalized.match(/\.\w+$/)) {
    normalized += '/';
  }
  return normalized;
}

/**
 * Pass 1: Format-based validation (no HTTP requests).
 * Returns { valid: [...], rejected: [...] }
 */
function formatCheck(entries, config) {
  const valid = [];
  const rejected = [];
  const seen = new Map(); // normalized URL → entry

  const excludePatterns = (config.validation.excludePatterns || []).map(p => new RegExp(p));

  for (const entry of entries) {
    const { url } = entry;
    let reason = null;

    // Must start with https://ringgitplus.com
    if (!url.startsWith('https://ringgitplus.com')) {
      reason = 'does not start with https://ringgitplus.com';
    }
    // No query string or fragment
    else if (url.includes('?') || url.includes('#')) {
      reason = 'contains query string or fragment';
    }
    // No staging domain
    else if (url.includes('wpcomstaging.com')) {
      reason = 'contains staging domain';
    }
    // Exclude tag/author/pagination patterns
    else if (excludePatterns.some(p => p.test(url))) {
      reason = 'matches exclude pattern';
    }

    if (reason) {
      rejected.push({ url, reason });
      continue;
    }

    // Deduplication
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) {
      const existing = seen.get(normalized);
      // Keep entry with lastmod if the existing one doesn't have one
      if (!existing.lastmod && entry.lastmod) {
        seen.set(normalized, entry);
      }
      continue; // Skip duplicate
    }

    seen.set(normalized, entry);
  }

  // Collect deduplicated entries
  for (const entry of seen.values()) {
    valid.push(entry);
  }

  console.log(`[validator/format] ${valid.length} valid, ${rejected.length} rejected, ${entries.length - valid.length - rejected.length} duplicates removed`);
  return { valid, rejected };
}

/**
 * Pass 2: HTTP validation — check status, canonical, noindex, soft 404.
 * Returns { valid: [...], rejected: [...] }
 */
async function httpCheck(entries, config) {
  const concurrency = config.validation.httpConcurrency || 20;
  const timeout = config.validation.httpTimeoutMs || 10000;
  const limit = pLimit(concurrency);

  const valid = [];
  const rejected = [];
  let checked = 0;

  const tasks = entries.map(entry =>
    limit(async () => {
      checked++;
      if (checked % 100 === 0) {
        console.log(`[validator/http] Checked ${checked}/${entries.length}...`);
      }

      try {
        const response = await axios.get(entry.url, {
          timeout,
          maxRedirects: 0,
          headers: {
            'User-Agent': 'RinggitPlus-Sitemap-Validator/1.0'
          },
          // We need the full response to check headers and HTML
          validateStatus: (status) => true
        });

        // Must be HTTP 200 (any redirect = fail)
        if (response.status !== 200) {
          rejected.push({ url: entry.url, reason: `HTTP ${response.status}` });
          return;
        }

        // Check X-Robots-Tag header
        const robotsHeader = response.headers['x-robots-tag'];
        if (robotsHeader && robotsHeader.toLowerCase().includes('noindex')) {
          rejected.push({ url: entry.url, reason: 'X-Robots-Tag noindex' });
          return;
        }

        const html = typeof response.data === 'string' ? response.data : '';
        if (!html) {
          valid.push(entry);
          return;
        }

        const $ = cheerio.load(html);

        // Check meta robots noindex
        const metaRobots = $('meta[name="robots"]').attr('content') || '';
        if (metaRobots.toLowerCase().includes('noindex')) {
          rejected.push({ url: entry.url, reason: 'meta robots noindex' });
          return;
        }

        // Self-canonical check
        const canonical = $('link[rel="canonical"]').attr('href');
        if (canonical) {
          const canonicalNorm = normalizeUrl(canonical);
          const urlNorm = normalizeUrl(entry.url);
          if (canonicalNorm !== urlNorm) {
            rejected.push({ url: entry.url, reason: `non-self canonical: ${canonical}` });
            return;
          }
        }

        // Soft 404 check
        const title = $('title').text() || '';
        if (/page not found|404/i.test(title)) {
          rejected.push({ url: entry.url, reason: `soft 404 (title: "${title.substring(0, 50)}")` });
          return;
        }

        valid.push(entry);
      } catch (err) {
        const reason = err.code === 'ECONNABORTED'
          ? 'timeout'
          : err.code || err.message;
        rejected.push({ url: entry.url, reason: `request failed: ${reason}` });
      }
    })
  );

  await Promise.all(tasks);

  console.log(`[validator/http] ${valid.length} valid, ${rejected.length} rejected`);
  return { valid, rejected };
}

/**
 * Run both validation passes.
 * Returns { entries: [...], formatRejected: [...], httpRejected: [...] }
 */
async function validate(entries, config) {
  console.log(`[validator] Starting validation of ${entries.length} URLs...`);

  // Pass 1: format checks
  const format = formatCheck(entries, config);

  // Pass 2: HTTP checks
  const http = await httpCheck(format.valid, config);

  // Log summary of rejected URLs
  const allRejected = [...format.rejected, ...http.rejected];
  if (allRejected.length > 0) {
    console.log(`\n[validator] Rejected URLs summary (${allRejected.length} total):`);
    for (const { url, reason } of allRejected.slice(0, 50)) {
      console.log(`  REJECTED: ${url} — ${reason}`);
    }
    if (allRejected.length > 50) {
      console.log(`  ... and ${allRejected.length - 50} more`);
    }
  }

  return {
    entries: http.valid,
    formatRejected: format.rejected,
    httpRejected: http.rejected
  };
}

module.exports = { validate, formatCheck, httpCheck };
