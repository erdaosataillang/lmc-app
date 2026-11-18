(() => {
  const MEASUREMENT_ID = "G-9FC2GBN6RD";
  const hostname = window.location.hostname;

  if (window.__lmcAnalyticsLoaded || hostname === "localhost" || hostname === "127.0.0.1" || window.location.pathname.startsWith("/dev/")) {
    return;
  }
  window.__lmcAnalyticsLoaded = true;

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return "";
    }
  }

  const pageLocation = safeUrl(window.location.href);
  const pageReferrer = safeUrl(document.referrer);
  let identifiedUserId = "";
  let pageViewSent = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
    functionality_storage: "denied",
    personalization_storage: "denied",
    security_storage: "granted",
  });
  window.gtag("js", new Date());
  window.gtag("set", {
    page_location: pageLocation,
    page_referrer: pageReferrer,
  });
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: pageLocation,
    page_referrer: pageReferrer,
  });

  function sendPageView() {
    if (pageViewSent) return;
    pageViewSent = true;
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: pageLocation,
      page_referrer: pageReferrer,
    });
  }

  const pageViewTimer = window.setTimeout(sendPageView, 2500);
  window.addEventListener("pagehide", sendPageView, {once: true});

  async function anonymizeUserId(value) {
    if (!value || !window.crypto?.subtle) return "";
    const bytes = new TextEncoder().encode(`lmc-ga4-user:${value}`);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }

  const loader = document.createElement("script");
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.append(loader);

  window.LMCAnalytics = Object.freeze({
    async setUser(user, properties = {}) {
      const sourceId = typeof user === "string" ? user : user?.uid;
      if (!sourceId || user?.isAnonymous === true) {
        identifiedUserId = "";
        window.gtag("config", MEASUREMENT_ID, {send_page_view: false, user_id: null});
        return;
      }

      const hash = await anonymizeUserId(sourceId);
      if (!hash) return;
      const userId = `lmc_${hash}`;
      const accountType = ["administrator", "member"].includes(properties.accountType)
        ? properties.accountType
        : "member";
      window.gtag("config", MEASUREMENT_ID, {send_page_view: false, user_id: userId});
      window.gtag("set", "user_properties", {account_type: accountType});

      if (!pageViewSent) {
        window.clearTimeout(pageViewTimer);
        sendPageView();
      } else if (identifiedUserId !== userId) {
        window.gtag("event", "user_context", {
          account_type: accountType,
          page_location: pageLocation,
        });
      }
      identifiedUserId = userId;
    },
    trackEvent(name, parameters = {}) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(name)) return;
      const safeParameters = {};
      for (const [key, value] of Object.entries(parameters)) {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || /(?:name|email|phone|tel|address|user|uid|line)/i.test(key)) continue;
        if (["string", "number", "boolean"].includes(typeof value)) safeParameters[key] = value;
      }
      window.gtag("event", name, safeParameters);
    },
  });
})();
