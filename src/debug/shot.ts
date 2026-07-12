// Dev-only self-screenshot. The in-app preview browser runs the page in a
// backgrounded/hidden tab, so the native screenshot has no compositor surface
// to grab and hangs — and rAF is throttled for the same reason. Instead the
// page renders its own pixels and POSTs them to the /__shot dev middleware
// (see vite.config.ts), which drops them at .shots/latest.png for tooling to
// read. Two capture paths:
//   • a live WebGL walk scene → read the canvas directly (force a few sim
//     frames first, since rAF is asleep and the buffer may be stale/blank);
//   • any plain-DOM screen → rasterize via an SVG <foreignObject>, which the
//     browser renders in-process without needing a compositor frame.
// Gated behind import.meta.env.DEV in main.ts; never ships.

async function post(blob: Blob | null): Promise<string> {
  if (!blob) return "shot: capture failed";
  const res = await fetch("/__shot", { method: "POST", body: blob });
  return `shot ${Math.round(blob.size / 1024)}KB → .shots/latest.png (${res.status})`;
}

async function canvasShot(canvas: HTMLCanvasElement): Promise<string> {
  const step = (window as any).__walkStep;
  if (typeof step === "function") for (let i = 0; i < 3; i++) step(0.02);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return post(blob);
}

async function domShot(full: boolean): Promise<string> {
  const root = document.documentElement;
  const w = root.clientWidth;
  const h = full ? Math.max(root.scrollHeight, root.clientHeight) : root.clientHeight;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.querySelectorAll("script").forEach((s) => s.remove());
  // SVG foreignObject cannot load external resources — even same-origin URLs.
  // Inline every <img> src as a data URI so portraits and icons render.
  const liveImgs = Array.from(document.querySelectorAll("img"));
  const cloneImgs = Array.from(clone.querySelectorAll("img"));
  await Promise.all(cloneImgs.map(async (_ci, i) => {
    const ci = _ci as HTMLImageElement;
    const live = liveImgs[i] as HTMLImageElement | undefined;
    if (!live?.src || !live.complete || live.naturalWidth === 0) return;
    try {
      const tmp = document.createElement("canvas");
      tmp.width = live.naturalWidth; tmp.height = live.naturalHeight;
      tmp.getContext("2d")!.drawImage(live, 0, 0);
      ci.src = tmp.toDataURL();
    } catch { /* tainted — leave as-is */ }
  }));
  // <canvas> serializes blank inside foreignObject — swap each clone canvas
  // for an <img> carrying the live canvas's current bitmap.
  const liveCv = Array.from(document.querySelectorAll("canvas"));
  Array.from(clone.querySelectorAll("canvas")).forEach((cc, i) => {
    const live = liveCv[i]; if (!live) return;
    try {
      const img = document.createElement("img");
      img.setAttribute("src", live.toDataURL());
      img.setAttribute("style", cc.getAttribute("style") || "");
      img.setAttribute("class", cc.getAttribute("class") || "");
      img.setAttribute("width", String(live.clientWidth || live.width));
      img.setAttribute("height", String(live.clientHeight || live.height));
      cc.parentNode?.replaceChild(img, cc);
    } catch { /* tainted canvas — leave the blank */ }
  });
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><foreignObject x='0' y='0' width='${w}' height='${h}'>${xml}</foreignObject></svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image();
  const ok = await new Promise<boolean>((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = url; });
  if (!ok) return "shot: DOM raster image load failed";
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const cx = cv.getContext("2d")!;
  cx.fillStyle = getComputedStyle(document.body).backgroundColor || "#08090c";
  cx.fillRect(0, 0, w, h);
  cx.drawImage(img, 0, 0);
  let blob: Blob | null = null;
  try { blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png")); }
  catch { return "shot: DOM canvas tainted (an external-origin image is on screen)"; }
  return post(blob);
}

// window.__shot() → grabs whatever's on screen. { full:false } clips DOM shots
// to the viewport instead of the whole scrollable page.
export function installShot() {
  (window as any).__shot = (opts: { full?: boolean } = {}) => {
    // A visible modal means the interesting pixels are DOM, not the 3D canvas.
    const modalOpen = document.getElementById("overlay")?.classList.contains("show");
    const canvas = document.querySelector(".walk3d-canvas") as HTMLCanvasElement | null;
    return canvas && !modalOpen ? canvasShot(canvas) : domShot(opts.full !== false);
  };
}
