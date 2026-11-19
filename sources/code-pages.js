'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const algoliasearch = require('algoliasearch');
const { extractUrls } = require('../extractors/rpv4');

/**
 * Shallow-clone ringgitplus4 repo, sparse-checkout routes/pages,
 * parse each route file, return URLs.
 */
async function fetchRouteFiles(config) {
  const tmpDir = path.join(os.tmpdir(), `rpv4-routes-${Date.now()}`);
  const { repo, branch, routesPath } = config.git;
  const token = process.env.GITHUB_TOKEN;
  const repoUrl = token
    ? `https://${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;

  try {
    // Sparse clone: only routes/pages
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse --branch ${branch} ${repoUrl} ${tmpDir}`,
      { stdio: 'pipe', timeout: 60000 }
    );
    execSync(
      `git -C ${tmpDir} sparse-checkout set ${routesPath}`,
      { stdio: 'pipe', timeout: 30000 }
    );

    const routesDir = path.join(tmpDir, routesPath);
    const files = fs.readdirSync(routesDir).filter(f =>
      f.endsWith('.js') && f !== 'index.js'
    );

    const entries = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
      const urls = extractUrls(content, file);
      for (const relUrl of urls) {
        entries.push({
          url: `${config.baseUrl}${relUrl}`,
          lastmod: null
        });
      }
    }

    console.log(`[code-pages/routes] Parsed ${files.length} route files → ${entries.length} URLs`);
    return entries;
  } finally {
    // Cleanup clone
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[code-pages] Failed to cleanup ${tmpDir}: ${e.message}`);
    }
  }
}

/**
 * Fetch landing page URLs from Algolia landingPages_auto index.
 */
async function fetchLandingPages(config) {
  const client = algoliasearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY
  );
  const index = client.initIndex(config.algolia.landingPagesIndex);

  const hits = await new Promise((resolve, reject) => {
    const allHits = [];
    const browser = index.browseAll({
      attributesToRetrieve: ['fullUrl', 'urlPrefix', 'slug', 'editedAt', 'publishedAt']
    });
    browser.on('result', (content) => allHits.push(...content.hits));
    browser.on('end', () => resolve(allHits));
    browser.on('error', (err) => reject(err));
  });

  const entries = [];
  for (const hit of hits) {
    let urlPath = hit.fullUrl;
    if (!urlPath) {
      if (hit.urlPrefix && hit.slug) {
        urlPath = `/${hit.urlPrefix}/${hit.slug}`;
      } else {
        console.warn(`[code-pages/landing] Skipping hit ${hit.objectID}: no fullUrl or urlPrefix/slug`);
        continue;
      }
    }
    // Ensure URL starts with baseUrl
    const url = urlPath.startsWith('http')
      ? urlPath
      : `${config.baseUrl}${urlPath}`;

    entries.push({
      url,
      lastmod: hit.editedAt || hit.publishedAt || null
    });
  }

  console.log(`[code-pages/landing] Fetched ${entries.length} landing page URLs`);
  return entries;
}

/**
 * Fetch guide category URLs from Algolia guideCategories_auto index.
 */
async function fetchGuideCategories(config) {
  const client = algoliasearch(
    process.env.ALGOLIA_APP_ID,
    process.env.ALGOLIA_API_KEY
  );
  const index = client.initIndex(config.algolia.guideCategoriesIndex);

  const hits = await new Promise((resolve, reject) => {
    const allHits = [];
    const browser = index.browseAll({
      attributesToRetrieve: ['slug']
    });
    browser.on('result', (content) => allHits.push(...content.hits));
    browser.on('end', () => resolve(allHits));
    browser.on('error', (err) => reject(err));
  });

  const entries = [];
  for (const hit of hits) {
    if (!hit.slug) {
      console.warn(`[code-pages/guides] Skipping hit ${hit.objectID}: no slug`);
      continue;
    }
    entries.push({
      url: `${config.baseUrl}/en/blog/category/${hit.slug}/`,
      lastmod: null
    });
  }

  console.log(`[code-pages/guides] Fetched ${entries.length} guide category URLs`);
  return entries;
}

/**
 * Build static page entries from config.
 */
function getStaticPages(config) {
  const entries = config.staticPages.map(relPath => ({
    url: `${config.baseUrl}${relPath}`,
    lastmod: null
  }));

  console.log(`[code-pages/static] ${entries.length} static pages`);
  return entries;
}

/**
 * Fetch all code-sourced page URLs: route files, landing pages, guide categories, static pages.
 */
async function fetchCodePages(config) {
  const [routePages, landingPages, guideCategories, staticPages] = await Promise.all([
    fetchRouteFiles(config),
    fetchLandingPages(config),
    fetchGuideCategories(config),
    Promise.resolve(getStaticPages(config))
  ]);

  const all = [...routePages, ...landingPages, ...guideCategories, ...staticPages];
  console.log(`[code-pages] Total: ${all.length} URLs`);
  return all;
}

module.exports = { fetchCodePages };
