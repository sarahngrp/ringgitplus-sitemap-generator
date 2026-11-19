'use strict';

const axios = require('axios');

/**
 * Send a notification to Google Chat webhook.
 * Falls back to stdout if GCHAT_WEBHOOK_URL is not set.
 */
async function notify(message) {
  const webhookUrl = process.env.GCHAT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(`[notifier] (no webhook configured) ${message}`);
    return;
  }

  try {
    await axios.post(webhookUrl, { text: message }, { timeout: 10000 });
    console.log('[notifier] Notification sent');
  } catch (err) {
    console.error(`[notifier] Failed to send notification: ${err.message}`);
  }
}

/**
 * Format a success notification message.
 */
function formatSuccess(safetyResult) {
  const { newCount, previousCount, delta, added, removed } = safetyResult;
  let msg = `✅ *Sitemap published successfully*\n`;
  msg += `URLs: ${newCount}`;
  if (previousCount > 0) {
    msg += ` (${delta > 0 ? '+' : ''}${delta} from previous ${previousCount})`;
  }
  msg += '\n';

  if (added.length > 0) {
    msg += `\nTop added:\n`;
    msg += added.slice(0, 5).map(u => `  + ${u}`).join('\n');
    msg += '\n';
  }
  if (removed.length > 0) {
    msg += `\nTop removed:\n`;
    msg += removed.slice(0, 5).map(u => `  - ${u}`).join('\n');
    msg += '\n';
  }

  return msg;
}

/**
 * Format a blocked notification (threshold exceeded).
 */
function formatBlocked(safetyResult) {
  const { newCount, previousCount, delta, deltaPercent, added, removed } = safetyResult;
  let msg = `⚠️ *Sitemap publish BLOCKED — threshold exceeded*\n`;
  msg += `Previous: ${previousCount}, New: ${newCount}, Delta: ${delta > 0 ? '+' : ''}${delta} (${deltaPercent}%)\n`;

  if (added.length > 0) {
    msg += `\nTop added:\n`;
    msg += added.slice(0, 10).map(u => `  + ${u}`).join('\n');
    msg += '\n';
  }
  if (removed.length > 0) {
    msg += `\nTop removed:\n`;
    msg += removed.slice(0, 10).map(u => `  - ${u}`).join('\n');
    msg += '\n';
  }

  msg += `\nRun with --force-publish to override.`;
  return msg;
}

/**
 * Format a failure notification.
 */
function formatFailure(error) {
  return `❌ *Sitemap generation failed*\n${error.message || error}`;
}

module.exports = { notify, formatSuccess, formatBlocked, formatFailure };
