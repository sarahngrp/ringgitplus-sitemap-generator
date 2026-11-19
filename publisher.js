'use strict';

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

let s3Client;

function getClient() {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

/**
 * Download the previous live sitemap from S3.
 * Throws NoSuchKey if not found.
 */
async function getPreviousSitemap(config) {
  const client = getClient();
  const bucket = process.env.S3_BUCKET || config.s3.bucket;

  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: config.s3.liveKey
  }));

  return await response.Body.transformToString('utf-8');
}

/**
 * Upload sitemap to S3: live file + dated history copy.
 */
async function publish(xml, config) {
  const client = getClient();
  const bucket = process.env.S3_BUCKET || config.s3.bucket;
  const contentType = config.s3.contentType;

  // Upload live sitemap
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: config.s3.liveKey,
    Body: xml,
    ContentType: contentType
  }));
  console.log(`[publisher] Uploaded live sitemap: s3://${bucket}/${config.s3.liveKey}`);

  // Upload history copy
  const today = new Date().toISOString().slice(0, 10);
  const historyKey = `${config.s3.historyPrefix}sitemap-${today}.xml`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: historyKey,
    Body: xml,
    ContentType: contentType
  }));
  console.log(`[publisher] Uploaded history: s3://${bucket}/${historyKey}`);

  // Cleanup old history files
  await cleanupHistory(config);
}

/**
 * Delete history files older than retention period.
 */
async function cleanupHistory(config) {
  const client = getClient();
  const bucket = process.env.S3_BUCKET || config.s3.bucket;
  const retentionDays = config.s3.historyRetentionDays || 30;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  try {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: config.s3.historyPrefix
    }));

    if (!response.Contents) return;

    for (const obj of response.Contents) {
      // Extract date from key: sitemap-history/sitemap-YYYY-MM-DD.xml
      const dateMatch = obj.Key.match(/sitemap-(\d{4}-\d{2}-\d{2})\.xml$/);
      if (dateMatch && dateMatch[1] < cutoffStr) {
        await client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: obj.Key
        }));
        console.log(`[publisher] Deleted old history: ${obj.Key}`);
      }
    }
  } catch (err) {
    console.warn(`[publisher] History cleanup failed: ${err.message}`);
  }
}

module.exports = { publish, getPreviousSitemap };
