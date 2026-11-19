'use strict';

const axios = require('axios');

/**
 * Rewrite WordPress staging domain to production.
 */
function rewriteDomain(url, config) {
  return url.replace(
    new RegExp(`https?://${config.wordpress.stagingDomain}`, 'g'),
    `https://${config.wordpress.productionDomain}`
  );
}

/**
 * Convert UTC datetime string from WordPress to Malaysia +08:00.
 */
function utcToMalaysia(gmtString) {
  if (!gmtString) return null;
  const date = new Date(gmtString + 'Z'); // Treat as UTC
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Fetch all blog post URLs via WordPress REST API (paginated).
 */
async function fetchPosts(config) {
  const { baseUrl: wpBaseUrl, postsPerPage } = config.wordpress;
  const entries = [];
  let page = 1;

  while (true) {
    let response;
    try {
      response = await axios.get(
        `${wpBaseUrl}/wp-json/wp/v2/posts`,
        {
          params: {
            per_page: postsPerPage,
            page,
            _fields: 'link,modified_gmt'
          },
          timeout: 30000
        }
      );
    } catch (err) {
      // WordPress returns 400 when page exceeds total
      if (err.response && err.response.status >= 400) break;
      throw err;
    }

    const posts = response.data;
    if (!posts || posts.length === 0) break;

    for (const post of posts) {
      entries.push({
        url: rewriteDomain(post.link, config),
        lastmod: utcToMalaysia(post.modified_gmt)
      });
    }

    if (posts.length < postsPerPage) break;
    page++;
  }

  return entries;
}

/**
 * Fetch blog category URLs via WordPress REST API.
 * Only includes categories with count > 0.
 */
async function fetchCategories(config) {
  const { baseUrl: wpBaseUrl } = config.wordpress;
  const entries = [];
  let page = 1;

  while (true) {
    let response;
    try {
      response = await axios.get(
        `${wpBaseUrl}/wp-json/wp/v2/categories`,
        {
          params: {
            per_page: 100,
            page,
            _fields: 'link,count'
          },
          timeout: 30000
        }
      );
    } catch (err) {
      if (err.response && err.response.status >= 400) break;
      throw err;
    }

    const categories = response.data;
    if (!categories || categories.length === 0) break;

    for (const cat of categories) {
      if (cat.count > 0) {
        entries.push({
          url: rewriteDomain(cat.link, config),
          lastmod: null
        });
      }
    }

    if (categories.length < 100) break;
    page++;
  }

  return entries;
}

/**
 * Fetch all blog URLs (posts + categories).
 */
async function fetchBlog(config) {
  const [posts, categories] = await Promise.all([
    fetchPosts(config),
    fetchCategories(config)
  ]);

  console.log(`[blog] Fetched ${posts.length} posts, ${categories.length} categories`);
  return [...posts, ...categories];
}

module.exports = { fetchBlog };
