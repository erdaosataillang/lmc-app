"use strict";

const {createHash} = require("node:crypto");
const {logger} = require("firebase-functions");
const {defineSecret} = require("firebase-functions/params");

const discordErrorWebhookUrl = defineSecret("DISCORD_ERROR_WEBHOOK_URL");
const recentAlerts = new Map();
const DEDUPLICATION_MS = 10 * 60 * 1000;
const MAX_RECENT_ALERTS = 500;
let missingWebhookLogged = false;

function truncate(value, maxLength) {
  const text = String(value ?? "");
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function redact(value, maxLength = 1200) {
  return truncate(value, maxLength)
      .replace(/([?&](?:code|token|access_token|id_token|key|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]")
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
      .replace(/(?<!\d)(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/g, "[PHONE]")
      .replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s]+/gi, "[DISCORD_WEBHOOK]");
}

function safePage(value) {
  try {
    const url = new URL(String(value || ""), "https://lmc-mobile.sorairosystem.com");
    return truncate(url.pathname || "/", 180);
  } catch (_) {
    return "/";
  }
}

function normalizeAlert(input = {}) {
  const source = truncate(input.source || "server", 40);
  const kind = truncate(input.kind || "error", 40);
  const page = safePage(input.page || "/");
  const message = redact(input.message || "Unknown error", 1200);
  const stack = redact(input.stack || "", 2800);
  const fingerprint = createHash("sha256")
      .update(`${source}\n${kind}\n${page}\n${message}\n${stack.split("\n")[0] || ""}`)
      .digest("hex");
  const userHash = input.uid ? createHash("sha256").update(String(input.uid)).digest("hex").slice(0, 12) : "";
  return {source, kind, page, message, stack, fingerprint, userHash};
}

function claimAlert(fingerprint, now = Date.now()) {
  const previous = recentAlerts.get(fingerprint);
  if (previous && now - previous.sentAt < DEDUPLICATION_MS) {
    previous.suppressed += 1;
    return {send: false, suppressed: previous.suppressed};
  }
  const suppressed = previous?.suppressed || 0;
  recentAlerts.set(fingerprint, {sentAt: now, suppressed: 0});
  if (recentAlerts.size > MAX_RECENT_ALERTS) {
    for (const [key, value] of recentAlerts) {
      if (now - value.sentAt >= DEDUPLICATION_MS) recentAlerts.delete(key);
    }
    while (recentAlerts.size > MAX_RECENT_ALERTS) recentAlerts.delete(recentAlerts.keys().next().value);
  }
  return {send: true, suppressed};
}

function discordPayload(alert, suppressed) {
  const fields = [
    {name: "発生元", value: `${alert.source} / ${alert.kind}`, inline: true},
    {name: "ページ", value: alert.page, inline: true},
    {name: "識別子", value: alert.fingerprint.slice(0, 12), inline: true},
  ];
  if (alert.userHash) fields.push({name: "ユーザー", value: `匿名ID ${alert.userHash}`, inline: true});
  if (suppressed > 0) fields.push({name: "前回までの重複", value: `${suppressed}件`, inline: true});
  if (alert.stack) fields.push({name: "スタック", value: `\`\`\`\n${truncate(alert.stack.replace(/```/g, "'''"), 980)}\n\`\`\``});
  return {
    username: "LMC Error Monitor",
    allowed_mentions: {parse: []},
    embeds: [{
      title: "LMCアプリでエラーを検知",
      description: truncate(alert.message, 2000),
      color: 0xE85D75,
      fields,
      footer: {text: "個人情報を除去して送信しています"},
      timestamp: new Date().toISOString(),
    }],
  };
}

async function notifyDiscordAlert(input) {
  const alert = normalizeAlert(input);
  const claim = claimAlert(alert.fingerprint);
  if (!claim.send) return {sent: false, reason: "duplicate"};

  const webhookUrl = discordErrorWebhookUrl.value().trim();
  if (!webhookUrl) {
    if (!missingWebhookLogged) {
      logger.warn("Discord error webhook is not configured");
      missingWebhookLogged = true;
    }
    return {sent: false, reason: "not_configured"};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(discordPayload(alert, claim.suppressed)),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn("Discord error notification failed", {status: response.status});
      return {sent: false, reason: `http_${response.status}`};
    }
    return {sent: true};
  } catch (error) {
    logger.warn("Discord error notification failed", {message: error.name || "unknown"});
    return {sent: false, reason: error.name || "network_error"};
  } finally {
    clearTimeout(timeout);
  }
}

function withDiscordErrorAlert(source, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      await notifyDiscordAlert({source, kind: "server", message: error.message, stack: error.stack});
      throw error;
    }
  };
}

module.exports = {
  discordErrorWebhookUrl,
  notifyDiscordAlert,
  withDiscordErrorAlert,
  _test: {claimAlert, discordPayload, normalizeAlert, redact, safePage},
};
