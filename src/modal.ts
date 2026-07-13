import { requestRender } from "./bus";

// Modal STATE is a plain in-memory string, deliberately independent of the DOM:
// hasModal() (the guard every system gates on) is pure, so the whole sim runs
// headlessly in Node — the renderer below simply no-ops when the DOM skeleton
// isn't mounted. (This is the seed of the ModalQueue decoupling in BETA_PLAN.)
let MODAL_HTML: string | null = null;

export function modal(html: string) { MODAL_HTML = html; drawModal(); }
export function hasModal() { return MODAL_HTML !== null; }
export function clearModal() { MODAL_HTML = null; drawModal(); }
export function closeModal() { MODAL_HTML = null; drawModal(); requestRender(); }

// Read the current modal HTML (headless harness inspects/dismisses modals
// without a DOM). Null when no modal is open.
export function modalHTML() { return MODAL_HTML; }

function sceneKey(modalEl: HTMLElement): string {
  const t = (modalEl.querySelector(".scene-loc")?.textContent || "").toLowerCase();
  if (/engine/.test(t)) return "engine";
  if (/cockpit/.test(t)) return "cockpit";
  if (/sick.?bay|medical|imogen/.test(t)) return "medical";
  if (/galley/.test(t)) return "galley";
  if (/debris|vesper|cutter|skiff|kestrel.lane|wreck|space|eva/.test(t)) return "space";
  if (/station|port|dock|harbor|solace|foundry|meridian|verge|havens/.test(t)) return "station";
  return "ship";
}

function drawModal() {
  // Headless / pre-boot: no DOM skeleton mounted → render is a no-op. Modal
  // state (MODAL_HTML) has already been set by the caller and drives hasModal().
  const ov = typeof document !== "undefined" ? document.getElementById("overlay") : null;
  if (!ov) return;
  const wrap = document.getElementById("dlg-portrait-wrap")!;
  const img = document.getElementById("dlg-portrait-img") as HTMLImageElement;
  const namePlate = document.getElementById("dlg-name-plate")!;
  const sceneBg = document.getElementById("dlg-scene-bg")!;

  if (MODAL_HTML) {
    ov.classList.add("show");
    const modalEl = document.getElementById("modal")!;
    modalEl.innerHTML = MODAL_HTML;
    const portImg = modalEl.querySelector<HTMLImageElement>(".portrait-dialogue img");
    const titleEl = modalEl.querySelector<HTMLElement>(".dialogue-title");
    if (portImg) {
      img.src = portImg.src;
      img.alt = portImg.alt;
      wrap.classList.add("show");
      ov.classList.add("has-portrait");
      ov.dataset.scene = sceneKey(modalEl);
      sceneBg.classList.add("show");
      namePlate.innerHTML = titleEl ? titleEl.innerHTML : "";
      namePlate.classList.add("show");
    } else {
      img.src = "";
      wrap.classList.remove("show");
      ov.classList.remove("has-portrait");
      delete ov.dataset.scene;
      sceneBg.classList.remove("show");
      namePlate.classList.remove("show");
      namePlate.innerHTML = "";
    }
  } else {
    ov.classList.remove("show");
    ov.classList.remove("has-portrait");
    delete ov.dataset.scene;
    wrap.classList.remove("show");
    sceneBg.classList.remove("show");
    namePlate.classList.remove("show");
    img.src = "";
  }
}
