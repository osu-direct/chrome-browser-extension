let currentUrl = "";
let injectInterval: number | null = null;

function getBeatmapsetId(): string | null {
  const match = location.pathname.match(/beatmapsets\/(\d+)/);
  return match ? match[1] : null;
}

/* ================= Toast UI ================= */

function createToast() {
  if (document.getElementById("osu-direct-toast")) return;

  const toast = document.createElement("div");
  toast.id = "osu-direct-toast";
  toast.innerHTML = `
    <div class="odt-content">
      <div class="odt-header">
        <span class="odt-title">Initializing...</span>
        <span class="odt-percent">0%</span>
      </div>
      <div class="odt-progress-bg">
        <div class="odt-progress-bar"></div>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.id = "osu-direct-style";
  style.textContent = `
    #osu-direct-toast {
      position: fixed; bottom: 24px; right: 24px; width: 320px;
      background: #222; border-left: 4px solid #ff66aa; border-radius: 6px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.4); font-family: sans-serif;
      color: white; z-index: 9999999; opacity: 0; transform: translateY(20px);
      transition: all 0.3s ease; pointer-events: none;
    }
    #osu-direct-toast.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .odt-content { padding: 14px 18px; }
    .odt-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
    .odt-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
    .odt-percent { color: #ff66aa; }
    .odt-progress-bg { height: 4px; background: #444; border-radius: 2px; overflow: hidden; }
    .odt-progress-bar { height: 100%; width: 0%; background: #ff66aa; transition: width 0.1s linear; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
}

function updateToast(percent: number, filename?: string) {
  const toast = document.getElementById("osu-direct-toast");
  if (!toast) return;
  const bar = toast.querySelector<HTMLDivElement>(".odt-progress-bar");
  const txt = toast.querySelector<HTMLDivElement>(".odt-percent");
  const title = toast.querySelector<HTMLDivElement>(".odt-title");

  const safePercent = Math.max(0, Math.min(100, percent));
  if (bar) bar.style.width = `${safePercent}%`;
  if (txt) txt.textContent = `${Math.floor(safePercent)}%`;
  if (title && filename) title.textContent = filename;
}

function closeToast(delay = 2000) {
  setTimeout(() => {
    const toast = document.getElementById("osu-direct-toast");
    if (toast) {
      toast.classList.remove("visible");
      setTimeout(() => {
        toast.remove();
        document.getElementById("osu-direct-style")?.remove();
      }, 400);
    }
  }, delay);
}

/* ================= Logic ================= */

function sanitizeFilename(name: string): string {
  // 1. Remove control characters and reserved characters: < > : " / \ | ? *
  // 2. Remove trailing periods or spaces which can cause issues on Windows
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/[\s.]+$/, "")
    .substring(0, 255); // Max filename length safety
}

function downloadBeatmap(id: string) {
  // Scrape page for fallback filename
  const artist =
    document
      .querySelector(
        ".beatmapset-header__details-text.beatmapset-header__details-text--artist a",
      )
      ?.textContent?.trim() || "";
  const title =
    document
      .querySelector(
        ".beatmapset-header__details-text.beatmapset-header__details-text--title a",
      )
      ?.textContent?.trim() || "";
  const fileName =
    artist && title
      ? sanitizeFilename(`${id} ${artist} - ${title}.osz`)
      : `beatmapset-${id}.osz`;

  createToast();
  updateToast(0, fileName);

  chrome.runtime.sendMessage({ type: "download", id, fallbackName: fileName });

  const listener = (msg: any) => {
    if (msg.type === "progress") {
      const p = msg.total > 0 ? (msg.received / msg.total) * 100 : 0;
      updateToast(p, msg.filename);
    }
    if (msg.type === "complete") {
      updateToast(100, msg.filename);
      closeToast(2500);
      chrome.runtime.onMessage.removeListener(listener);
    }
    if (msg.type === "failed") {
      updateToast(0, "Download Failed");
      closeToast(4000);
      chrome.runtime.onMessage.removeListener(listener);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
}

function tryInject() {
  const id = getBeatmapsetId();
  const container = document.querySelector(".beatmapset-header__buttons");
  if (!id || !container || document.getElementById("osu-direct-download"))
    return;

  const btn = document.createElement("button");

  btn.id = "osu-direct-download";
  btn.type = "button";
  btn.className = "btn-osu-big btn-osu-big--beatmapset-header";
  btn.style.filter = "saturate(1.5) hue-rotate(146deg)";
  btn.innerHTML = `
    <span class="btn-osu-big__content">
      <span class="btn-osu-big__left">
        <span class="btn-osu-big__text-top">Mirror</span>
        <span class="btn-osu-big__text-bottom">osu.direct</span>
      </span>
      <span class="btn-osu-big__icon">
        <span class="fa fa-fw"><span class="fas fa-download"></span></span>
      </span>
    </span>`;
  btn.onclick = () => downloadBeatmap(id);

  container.appendChild(btn);
}

setInterval(() => {
  const regex = /\/beatmapsets\/(\d+)(?:#\w+\/\d+)?$/;
  const match =
    location.pathname.match(regex) ||
    (location.pathname + location.hash).match(regex);
  if (!match) return;
  if (location.href !== currentUrl) {
    document.getElementById("osu-direct-download")?.remove();
    tryInject();

    const mirrorButton = document.getElementById("osu-direct-download");
    if (mirrorButton) {
      currentUrl = location.href;
    }
  }
}, 250);
