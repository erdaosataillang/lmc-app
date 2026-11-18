(() => {
  const ENDPOINT = "https://asia-northeast1-urakata-app.cloudfunctions.net/lmcAppApi/maintenance";

  function showMaintenanceScreen({title, message}) {
    if (document.getElementById("lmc-maintenance-screen")) return;
    const style = document.createElement("style");
    style.textContent = `
      #lmc-maintenance-screen{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:linear-gradient(155deg,#f5f7fb,#eef3ff);font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;color:#172033}
      #lmc-maintenance-screen *{box-sizing:border-box}
      .lmc-maintenance-card{width:min(100%,390px);padding:32px 26px;border:1px solid rgba(255,255,255,.9);border-radius:30px;background:rgba(255,255,255,.88);box-shadow:0 24px 80px rgba(56,75,115,.14);text-align:center;backdrop-filter:blur(18px)}
      .lmc-maintenance-icon{display:grid;place-items:center;width:68px;height:68px;margin:0 auto 20px;border-radius:24px;background:#fff3d6;color:#a96300;font-size:30px;box-shadow:0 10px 28px rgba(169,99,0,.12)}
      .lmc-maintenance-title{margin:0 0 10px;font-size:22px;letter-spacing:-.03em}
      .lmc-maintenance-message{margin:0;color:#667085;font-size:14px;line-height:1.8;white-space:pre-wrap}
      .lmc-maintenance-reload{width:100%;margin-top:26px;padding:13px 18px;border:0;border-radius:15px;background:#2563eb;color:#fff;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(37,99,235,.2)}
    `;
    const screen = document.createElement("div");
    screen.id = "lmc-maintenance-screen";
    screen.setAttribute("role", "alert");
    const card = document.createElement("div");
    card.className = "lmc-maintenance-card";
    const icon = document.createElement("div");
    icon.className = "lmc-maintenance-icon";
    icon.textContent = "⚙";
    const heading = document.createElement("h1");
    heading.className = "lmc-maintenance-title";
    heading.textContent = title || "メンテナンス中です";
    const copy = document.createElement("p");
    copy.className = "lmc-maintenance-message";
    copy.textContent = message || "時間をおいて、もう一度お試しください。";
    const reload = document.createElement("button");
    reload.className = "lmc-maintenance-reload";
    reload.type = "button";
    reload.textContent = "もう一度確認する";
    reload.addEventListener("click", () => window.location.reload());
    card.append(icon, heading, copy, reload);
    screen.append(card);
    document.head.append(style);
    document.body.append(screen);
  }

  async function checkMaintenance() {
    try {
      const response = await fetch(ENDPOINT, {cache: "no-store", headers: {Accept: "application/json"}});
      if (!response.ok) return;
      const {maintenance} = await response.json();
      if (maintenance?.enabled === true) showMaintenanceScreen(maintenance);
    } catch (error) {
      console.warn("Maintenance status could not be checked.", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkMaintenance, {once: true});
  } else {
    checkMaintenance();
  }
})();
