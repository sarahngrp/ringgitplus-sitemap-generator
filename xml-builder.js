'use strict';

/**
 * Convert various date formats to W3C datetime with Malaysia timezone (+08:00).
 * Handles: Unix timestamps (seconds), ISO strings, already-formatted W3C strings.
 */
function toW3CDatetime(input) {
  if (!input) return null;

  // Already in W3C format with timezone
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(input)) {
    return input;
  }

  let date;
  if (typeof input === 'number') {
    // Unix timestamp (seconds) — convert to ms
    date = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    date = new Date(input);
  }

  if (isNaN(date.getTime())) return null;

  // Convert to Malaysia time (+08:00)
  const myt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = myt.getUTCFullYear();
  const mm = String(myt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(myt.getUTCDate()).padStart(2, '0');
  const hh = String(myt.getUTCHours()).padStart(2, '0');
  const mi = String(myt.getUTCMinutes()).padStart(2, '0');
  const ss = String(myt.getUTCSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+08:00`;
}

/**
 * XML-escape a URL string (& → &amp;).
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a sitemap XML string from an array of { url, lastmod } entries.
 * Sorted alphabetically by URL. lastmod in W3C format with +08:00.
 */
function buildXml(entries) {
  const sorted = [...entries].sort((a, b) => a.url.localeCompare(b.url));

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const entry of sorted) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(entry.url)}</loc>\n`;
    if (entry.lastmod) {
      const formatted = toW3CDatetime(entry.lastmod);
      if (formatted) {
        xml += `    <lastmod>${formatted}</lastmod>\n`;
      }
    }
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

module.exports = { buildXml, toW3CDatetime, escapeXml };
