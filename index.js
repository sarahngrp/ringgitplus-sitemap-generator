'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { fetchProducts } = require('./sources/products');
const { fetchBlog } = require('./sources/blog');
const { fetchCodePages } = require('./sources/code-pages');
const { validate } = require('./validator');
const { buildXml } = require('./xml-builder');
const { checkSafety } = require('./safety');
const { publish } = require('./publisher');
const { notify, formatSuccess, formatBlocked, formatFailure } = require('./notifier');

// Parse CLI flags
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';
const forcePublish = args.includes('--force-publish');
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

function validateEnv() {
  const required = ['ALGOLIA_APP_ID', 'ALGOLIA_API_KEY'];
  if (!dryRun) {
    required.push('S3_BUCKET');
  }
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function main() {
  console.log('=== RinggitPlus Sitemap Generator ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (forcePublish) console.log('Force publish: ON');
  console.log('');

  validateEnv();

  // 1. Collect URLs from all 3 sources in parallel
  console.log('--- Collecting URLs ---');
  const [productUrls, blogUrls, codePageUrls] = await Promise.all([
    fetchProducts(config),
    fetchBlog(config),
    fetchCodePages(config)
  ]);

  console.log(`\nRaw counts: products=${productUrls.length}, blog=${blogUrls.length}, code-pages=${codePageUrls.length}`);
  const allUrls = [...productUrls, ...blogUrls, ...codePageUrls];
  console.log(`Total raw: ${allUrls.length}\n`);

  // 2. Validate all URLs
  console.log('--- Validating URLs ---');
  const { entries: validEntries, formatRejected, httpRejected } = await validate(allUrls, config);
  console.log(`\nAfter validation: ${validEntries.length} valid (${formatRejected.length} format-rejected, ${httpRejected.length} http-rejected)\n`);

  // 3. Build XML
  console.log('--- Building XML ---');
  const xml = buildXml(validEntries);
  console.log(`XML size: ${(Buffer.byteLength(xml) / 1024).toFixed(1)} KB\n`);

  // 4. Write to local file if --output specified
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.writeFileSync(resolved, xml, 'utf8');
    console.log(`Written to: ${resolved}\n`);
  }

  // 5. Safety check against previous sitemap
  console.log('--- Safety Check ---');
  let safetyResult;
  if (dryRun) {
    console.log('Skipping safety check in dry-run mode');
    safetyResult = { safe: true, newCount: validEntries.length, previousCount: 0, delta: 0, added: [], removed: [] };
  } else {
    safetyResult = await checkSafety(xml, config);
  }
  console.log('');

  // 6. Publish or block
  if (!safetyResult.safe && !forcePublish) {
    console.log('--- BLOCKED: Threshold exceeded ---');
    await notify(formatBlocked(safetyResult));
    console.log('\nExiting (threshold exceeded). Use --force-publish to override.');
    process.exit(0);
  }

  if (!dryRun) {
    console.log('--- Publishing to S3 ---');
    await publish(xml, config);
    await notify(formatSuccess(safetyResult));
  } else {
    console.log('--- Dry run complete (skipping S3 upload) ---');
  }

  console.log('\nDone.');
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('\nFATAL ERROR:', err);
    try {
      await notify(formatFailure(err));
    } catch (notifyErr) {
      console.error('Failed to send failure notification:', notifyErr.message);
    }
    process.exit(1);
  });
}

module.exports = { main };
