(() => {
  const CANONICAL_ORIGIN = "https://app.urakatabu.com";
  const BASE_PATH = "/lmc/app";
  const LEGACY_HOSTS = new Set(["lmc-mobile.sorairosystem.com"]);
  const pageAliases = new Map([
    ["", "index.html"],
    ["index", "index.html"],
    ["userregist", "userregist.html"],
    ["booking", "booking.html"],
    ["manage", "manage.html"],
    ["timetable", "timetable.html"],
    ["mypage", "mypage.html"],
    ["cue", "cue.html"],
    ["newlmc", "newlmc.html"],
  ]);

  const appUrl = page => {
    const cleanPage = String(page || "").replace(/^\/+/, "");
    return cleanPage ? `${BASE_PATH}/${cleanPage}` : `${BASE_PATH}/`;
  };

  window.LMC_APP_ORIGIN = CANONICAL_ORIGIN;
  window.LMC_APP_BASE_PATH = BASE_PATH;
  window.lmcAppUrl = appUrl;

  if (!LEGACY_HOSTS.has(window.location.hostname)) return;
  const lastSegment = window.location.pathname.split("/").filter(Boolean).pop() || "";
  const page = pageAliases.get(lastSegment) || (lastSegment.endsWith(".html") ? lastSegment : "index.html");
  window.location.replace(`${CANONICAL_ORIGIN}${appUrl(page)}${window.location.search}${window.location.hash}`);
})();
