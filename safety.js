'use strict';

const { getPreviousSitemap } = require('./publisher');

/**
 * Count <url> tags in a sitemap XML string.
 */
function countUrls(xml) {
  const matches = xml.match(/<url>/g);
  return matches ? matches.length : 0;
}

/**
 * Extract all <loc> values from a sitemap XML string.
 */
function extractLocs(xml) {
  const locs = new Set();
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    locs.add(match[1]);
  }
  return locs;
}

/**
 * Check if the new sitemap is safe to publish by comparing against the previous one.
 * Returns { safe, previousCount, newCount, deltaPercent, added, removed }
 */
async function checkSafety(newXml, config) {
  let previousXml;
  try {
    previousXml = await getPreviousSitemap(config);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      console.log('[safety] No previous sitemap found (first run) — skipping threshold check');
      return {
        safe: true,
        previousCount: 0,
        newCount: countUrls(newXml),
        deltaPercent: null,
        added: [],
        removed: []
      };
    }
    throw err;
  }

  const previousCount = countUrls(previousXml);
  const newCount = countUrls(newXml);

  if (previousCount === 0) {
    console.log('[safety] Previous sitemap was empty — skipping threshold check');
    return {
      safe: true,
      previousCount,
      newCount,
      deltaPercent: null,
      added: [],
      removed: []
    };
  }

  const delta = newCount - previousCount;
  const deltaPercent = (Math.abs(delta) / previousCount) * 100;
  const threshold = config.safety.thresholdPercent;

  // Compute diff (top 20 added/removed)
  const previousLocs = extractLocs(previousXml);
  const newLocs = extractLocs(newXml);

  const added = [...newLocs].filter(url => !previousLocs.has(url)).slice(0, 20);
  const removed = [...previousLocs].filter(url => !newLocs.has(url)).slice(0, 20);

  const safe = deltaPercent <= threshold;

  console.log(`[safety] Previous: ${previousCount}, New: ${newCount}, Delta: ${delta > 0 ? '+' : ''}${delta} (${deltaPercent.toFixed(2)}%), Threshold: ±${threshold}%`);
  if (!safe) {
    console.log(`[safety] THRESHOLD EXCEEDED — publish blocked`);
    console.log(`[safety] Top added URLs:`);
    added.forEach(url => console.log(`  + ${url}`));
    console.log(`[safety] Top removed URLs:`);
    removed.forEach(url => console.log(`  - ${url}`));
  }

  return {
    safe,
    previousCount,
    newCount,
    deltaPercent: Math.round(deltaPercent * 100) / 100,
    delta,
    added,
    removed
  };
}

module.exports = { checkSafety };
