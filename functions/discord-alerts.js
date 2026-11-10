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

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? truncate(url.href, 1000) : "";
  } catch (_) {
    return "";
  }
}

function japaneseKind(kind) {
  return ({
    error: "JavaScript実行エラー",
    unhandledrejection: "非同期処理の未処理エラー",
    console: "画面処理で捕捉されたエラー",
    api: "API通信エラー",
    server: "サーバー処理エラー",
    manual: "手動エラー報告",
  })[kind] || "アプリケーションエラー";
}

function japaneseExplanation(message, kind) {
  const value = String(message || "");
  if (/ReferenceError|is not defined|not defined/i.test(value)) {
    return "必要な変数または機能が読み込まれていない状態で処理が実行されました。";
  }
  if (/TypeError|is not a function|cannot read (?:properties|property)/i.test(value)) {
    return "想定と異なる形式のデータまたは値が使われ、処理を続けられませんでした。";
  }
  if (/SyntaxError|unexpected token|JSON/i.test(value)) {
    return "受け取ったデータまたはプログラムの構文を正しく解釈できませんでした。";
  }
  if (/permission[-_ ]denied|insufficient permissions|forbidden|403/i.test(value)) {
    return "必要な権限がないため、処理を実行できませんでした。";
  }
  if (/unauth|authentication|ログイン|401/i.test(value)) {
    return "ログイン情報または認証状態の確認に失敗しました。";
  }
  if (/timeout|timed out|deadline/i.test(value)) {
    return "処理が制限時間内に完了しませんでした。";
  }
  if (/network|fetch|load failed|failed to load|offline|接続/i.test(value)) {
    return "通信またはデータの読み込みに失敗しました。ネットワーク状態や接続先を確認してください。";
  }
  if (/not found|404|見つかりません/i.test(value)) {
    return "必要なデータまたはページが見つかりませんでした。";
  }
  if (/internal|500|server/i.test(value) || kind === "server") {
    return "サーバー内部の処理中に問題が発生しました。";
  }
  return "アプリの処理中に予期しない問題が発生しました。原文とスタック情報を確認してください。";
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
  const uid = truncate(input.uid || "", 180);
  const userName = truncate(input.userName || "", 120);
  const userIcon = safeImageUrl(input.userIcon);
  const environment = truncate(input.environment || (source === "client" ? "Webアプリ" : "Firebase Functions"), 120);
  const userAgent = truncate(input.userAgent || "", 600);
  const viewport = truncate(input.viewport || "", 80);
  const online = input.online === true ? "オンライン" : input.online === false ? "オフライン" : "不明";
  const kindJa = japaneseKind(kind);
  const explanationJa = japaneseExplanation(message, kind);
  return {
    source, kind, kindJa, explanationJa, page, message, stack, fingerprint,
    uid, userName, userIcon, environment, userAgent, viewport, online,
  };
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
    {name: "エラー分類", value: alert.kindJa, inline: true},
    {name: "発生環境", value: alert.environment, inline: true},
    {name: "発生元", value: `${alert.source} / ${alert.kind}`, inline: true},
    {name: "ページ", value: alert.page, inline: true},
    {name: "識別子", value: alert.fingerprint.slice(0, 12), inline: true},
  ];
  if (alert.userName) fields.push({name: "アカウント名", value: alert.userName, inline: true});
  if (alert.uid) fields.push({name: "ユーザーID", value: alert.uid, inline: false});
  if (alert.viewport) fields.push({name: "画面サイズ", value: alert.viewport, inline: true});
  fields.push({name: "通信状態", value: alert.online, inline: true});
  if (suppressed > 0) fields.push({name: "前回までの重複", value: `${suppressed}件`, inline: true});
  fields.push({name: "エラー原文", value: truncate(alert.message, 1000)});
  if (alert.userAgent) fields.push({name: "端末・ブラウザ", value: truncate(alert.userAgent, 1000)});
  if (alert.stack) fields.push({name: "スタック", value: `\`\`\`\n${truncate(alert.stack.replace(/```/g, "'''"), 980)}\n\`\`\``});
  const embed = {
    title: `LMC: ${alert.kindJa}`,
    description: alert.explanationJa,
    color: 0xE85D75,
    fields,
    footer: {text: "認証情報とWebhook URLのみ保護しています"},
    timestamp: new Date().toISOString(),
  };
  if (alert.userName || alert.userIcon) {
    embed.author = {name: alert.userName || "LMCユーザー"};
    if (alert.userIcon) embed.author.icon_url = alert.userIcon;
  }
  if (alert.userIcon) embed.thumbnail = {url: alert.userIcon};
  return {
    username: "LMC Error Monitor",
    allowed_mentions: {parse: []},
    embeds: [embed],
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
  _test: {claimAlert, discordPayload, japaneseExplanation, japaneseKind, normalizeAlert, redact, safePage},
};
