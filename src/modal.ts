import { $ } from "./util";
import { requestRender } from "./bus";

let MODAL_HTML: string | null = null;

export function modal(html: string) { MODAL_HTML = html; drawModal(); }
export function hasModal() { return MODAL_HTML !== null; }
export function clearModal() { MODAL_HTML = null; drawModal(); }
export function closeModal() { MODAL_HTML = null; drawModal(); requestRender(); }

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
  const ov = $("overlay");
  const wrap = $("dlg-portrait-wrap");
  const img = $("dlg-portrait-img") as HTMLImageElement;
  const namePlate = $("dlg-name-plate");
  const sceneBg = $("dlg-scene-bg");

  if (MODAL_HTML) {
    ov.classList.add("show");
    const modalEl = $("modal");
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
