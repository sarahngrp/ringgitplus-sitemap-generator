'use strict';

const algoliasearch = require('algoliasearch');

/**
 * Fetch product detail page URLs from Algolia productsListing index.
 * Uses browseAll() to iterate over all records.
 *
 * @param {object} config - Full config object
 * @returns {Promise<Array<{url: string, lastmod: string|null}>>}
 */
async function fetchProducts(config) {
  const client = algoliasearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY
  );
  const index = client.initIndex(config.algolia.productsIndex);

  const hits = await new Promise((resolve, reject) => {
    const allHits = [];
    const browser = index.browseAll({
      filters: 'discontinued != true AND draft != true',
      attributesToRetrieve: ['pageUrl', 'product', 'editedAt', 'createdAt']
    });

    browser.on('result', (content) => {
      allHits.push(...content.hits);
    });

    browser.on('end', () => resolve(allHits));
    browser.on('error', (err) => reject(err));
  });

  const entries = [];
  const { categorySlugMap, excludedVerticals, baseUrl } = config;

  for (const hit of hits) {
    // Skip excluded verticals
    if (excludedVerticals.includes(hit.product)) continue;

    if (!hit.pageUrl) {
      console.warn(`[products] Skipping hit ${hit.objectID}: missing pageUrl`);
      continue;
    }

    const slug = categorySlugMap[hit.product];
    if (!slug) {
      console.warn(`[products] Skipping hit ${hit.objectID}: unmapped category "${hit.product}"`);
      continue;
    }

    const url = `${baseUrl}/en/${slug}/${hit.pageUrl}.html`;
    const lastmod = hit.editedAt || hit.createdAt || null;

    entries.push({ url, lastmod });
  }

  console.log(`[products] Fetched ${entries.length} product URLs (from ${hits.length} hits)`);
  return entries;
}

module.exports = { fetchProducts };
