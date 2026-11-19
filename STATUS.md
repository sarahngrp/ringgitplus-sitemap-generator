# RPD-5796: Sitemap Generator — Status

**Last updated:** 2026-11-19

## What this is

Standalone Node.js generator that runs nightly as a Fargate task, pulling URLs from 3 sources (Algolia products, WordPress blog, RPv4 route files), validating them, and publishing to S3. A Cloudflare worker (Mikko's T3 task) will serve the sitemap from S3.

**Scope:** RP EN only. Dev tasks T1 (generator code) and T2 (route extractor).

## Current state

**All 12 modules are written and syntax-checked.** The generator is code-complete per the plan.

### Files

```
index.js              — Orchestrator with --dry-run, --output, --force-publish flags
config.json           — 25 category slug mappings, Algolia indices, WP config, thresholds, static pages
xml-builder.js        — {url, lastmod} → sorted XML with W3C datetime (+08:00)
validator.js          — Pass 1: format checks, dedup. Pass 2: HTTP 200, canonical, noindex, soft 404
safety.js             — ±2% count threshold against previous sitemap
publisher.js          — S3 upload (live + 30-day history)
notifier.js           — Google Chat webhook (success/blocked/failure)
sources/products.js   — Algolia productsListing browseAll → PDP URLs
sources/blog.js       — WordPress REST API → posts + categories
sources/code-pages.js — Git sparse clone routes + Algolia landing/guides + static pages
extractors/rpv4.js    — Regex extraction of url fields from route files
Dockerfile            — Node 20 alpine + git
```

### Branches

- `next` — active development (3 commits, HEAD)
- `stable` — production (points to commit 264ed52)
- `main` — safety net (points to commit 264ed52)
- Flow: `next` merges into `stable` directly (no cherry-picking)

### Commits on `next`

```
5d89f46 Fix WordPress category URL normalization
264ed52 Add .gitignore and remove node_modules from tracking
7ca6756 Initial scaffold: sitemap generator with all modules
```

## What's been tested

| Module | Status | Notes |
|--------|--------|-------|
| Blog source | PASS | 8,800 posts + 93 categories. Fixed `./` in WP category links |
| Route extractor | PASS | 28 files → 390 URLs from local rpv4 repo |
| Format validator | PASS | Rejects staging domains, query strings, tag/author/pagination, wrong domains. Deduplicates with lastmod preference |
| HTTP validator | PASS | Correctly catches 404s, non-self canonicals (e.g. `/en/blog/` → canonical is homepage) |
| XML builder | PASS | Well-formed XML, sorted, W3C +08:00, `&` escaping |
| Products source | NOT TESTED | Needs `ALGOLIA_APP_ID` + `ALGOLIA_API_KEY` |
| Landing pages / guide categories | NOT TESTED | Needs Algolia credentials |
| S3 publish + safety | NOT TESTED | Needs `S3_BUCKET` |
| Google Chat notify | NOT TESTED | Needs `GCHAT_WEBHOOK_URL` |

## What's left to do

### Immediate next steps (when resuming)

1. **Test with Algolia credentials** — Run products, landing pages, and guide categories sources with real credentials to verify URL counts and formats
2. **Full dry run** — `ALGOLIA_APP_ID=xxx ALGOLIA_API_KEY=xxx GITHUB_TOKEN=xxx node index.js --dry-run --output ./test-sitemap.xml`
3. **Diff against current sitemap** — Download `https://ringgitplus.com/sitemap.xml`, compare URL lists. Expect close to ~7,650 URLs with all differences explainable
4. **Test S3 publish** — With `S3_BUCKET=ringgitplus-v4-files`, test upload + safety check + history cleanup
5. **Test notifications** — Verify Google Chat messages render correctly

### Deployment (after testing)

6. **Fargate task setup** — ECS task definition, scheduled rule (nightly), env vars from Secrets Manager
7. **Cloudflare worker update (T3 — Mikko)** — Change `/sitemap.xml` route in `ringgitplus-com.js:2081-2084` from `v4origin.ringgitplus.com` to fetch from S3 `ringgitplus-v4-files` bucket. Follow existing `/sitemap_ms.xml` pattern in `ringgitplus-com-static-routes.js:95-96`

### Safe deployment notes

- The generator publishes to `sitemap-generated.xml` in S3 — a **different key** from the live sitemap
- The live `/sitemap.xml` continues routing to `v4origin` via Cloudflare worker until Mikko switches it
- Nothing changes on the live site until the worker update (T3)
- Rollback = revert Mikko's one-line worker change

## Key references in other repos

- `ringgitplus4/server.js:955-1020` — 25 category slug → product code mappings
- `ringgitplus4/migration/index.js:586-598` — discontinued/draft filtering logic
- `ringgitplus4/server/wordpress-queries.js:16` — staging domain rewrite pattern
- `ringgitplus4/routes/pages/*.js` — 28 route definition files
- `ringgitplus-cloudflare-workers/ringgitplus-com.js:2081-2084` — current `/sitemap.xml` routing
- `ringgitplus-cloudflare-workers/ringgitplus-com-static-routes.js:95-96` — `/sitemap_ms.xml` S3 pattern (reference for T3)

## How to run

```bash
# Install
npm install

# Local dry run (needs Algolia + GitHub credentials)
ALGOLIA_APP_ID=xxx ALGOLIA_API_KEY=xxx GITHUB_TOKEN=xxx \
  node index.js --dry-run --output ./test-sitemap.xml

# Full run with S3 publish
ALGOLIA_APP_ID=xxx ALGOLIA_API_KEY=xxx S3_BUCKET=ringgitplus-v4-files \
  GITHUB_TOKEN=xxx GCHAT_WEBHOOK_URL=xxx \
  node index.js

# Force publish (bypass ±2% safety threshold)
node index.js --force-publish
```
