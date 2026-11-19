'use strict';

/**
 * Parse RPv4 route file content and extract URL strings.
 * Route files export arrays of objects with `url` fields.
 *
 * @param {string} content - File content string
 * @param {string} filename - Filename (for logging)
 * @returns {string[]} Array of relative URL strings
 */
function extractUrls(content, filename) {
  const urls = [];
  const regex = /url:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    urls.push(match[1]);
  }

  if (urls.length === 0) {
    console.warn(`[rpv4-extractor] No URLs found in ${filename}`);
  }

  return urls;
}

module.exports = { extractUrls };
