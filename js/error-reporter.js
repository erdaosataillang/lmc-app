const ERROR_ENDPOINT = "https://asia-northeast1-urakata-app.cloudfunctions.net/lmcAppApi/client-errors";
const DEDUPLICATION_MS = 10 * 60 * 1000;
const MAX_QUEUE_SIZE = 5;
const recentErrors = new Map();
const queue = [];
let authReference = null;
let sending = false;
let reporting = false;

function truncate(value, maxLength) {
    const text = String(value ?? "");
    return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function redact(value, maxLength) {
    return truncate(value, maxLength)
        .replace(/([?&](?:code|token|access_token|id_token|key|secret|password)=)[^&#\s]+/gi, "$1[REDACTED]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
        .replace(/(^|[^\d])(?:\+?81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/g, "$1[PHONE]");
}

function errorText(value) {
    if (value instanceof Error) return value.message || value.name;
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    try { return JSON.stringify(value); }
    catch (_) { return Object.prototype.toString.call(value); }
}

function fingerprint(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function normalize(input = {}) {
    const kind = ["error", "unhandledrejection", "console", "api", "manual"].includes(input.kind) ? input.kind : "error";
    const sourceError = input.error instanceof Error ? input.error : null;
    const message = redact(input.message || sourceError?.message || "Unknown client error", 1600);
    const stack = redact(input.stack || sourceError?.stack || "", 4000);
    const page = location.pathname || "/";
    return {kind, message, stack, page};
}

function shouldIgnore(report) {
    return !report.message ||
        /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(report.message) ||
        /AbortError|The operation was aborted/i.test(report.message);
}

function isDuplicate(report) {
    const key = fingerprint(`${report.kind}\n${report.page}\n${report.message}\n${report.stack.split("\n")[0] || ""}`);
    const now = Date.now();
    const previous = recentErrors.get(key) || 0;
    recentErrors.set(key, now);
    for (const [candidate, timestamp] of recentErrors) {
        if (now - timestamp >= DEDUPLICATION_MS) recentErrors.delete(candidate);
    }
    return now - previous < DEDUPLICATION_MS;
}

async function flush() {
    if (sending || !queue.length || !authReference?.currentUser) return;
    sending = true;
    const report = queue.shift();
    try {
        const token = await authReference.currentUser.getIdToken();
        reporting = true;
        await fetch(ERROR_ENDPOINT, {
            method: "POST",
            headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
            body: JSON.stringify(report),
            cache: "no-store",
            keepalive: true,
        });
    } catch (_) {
        // 障害通知自体の失敗で、アプリや通知処理を再帰的に失敗させない。
    } finally {
        reporting = false;
        sending = false;
        if (queue.length) setTimeout(flush, 250);
    }
}

export function captureClientError(input) {
    if (reporting) return;
    const report = normalize(input);
    if (shouldIgnore(report) || isDuplicate(report)) return;
    if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
    queue.push(report);
    void flush();
}

export function setErrorReporterAuth(auth) {
    authReference = auth || null;
    void flush();
}

window.addEventListener("error", event => {
    if (event.error) {
        captureClientError({kind: "error", error: event.error, message: event.message});
        return;
    }
    const source = event.target?.src || event.target?.href;
    if (source) {
        let resource = "resource";
        try { resource = new URL(source, location.href).pathname; } catch (_) {}
        captureClientError({kind: "error", message: `Resource load failed: ${resource}`});
    }
}, true);

window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    captureClientError({
        kind: "unhandledrejection",
        error: reason instanceof Error ? reason : null,
        message: errorText(reason),
    });
});

const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
    originalConsoleError(...args);
    if (reporting) return;
    const error = args.find(value => value instanceof Error);
    captureClientError({
        kind: "console",
        error,
        message: args.map(errorText).join(" "),
    });
};

window.LMCErrorReporter = {capture: captureClientError, setAuth: setErrorReporterAuth};
