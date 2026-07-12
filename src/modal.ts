import { $ } from "./util";
import { requestRender } from "./bus";

let MODAL_HTML: string | null = null;

export function modal(html: string) { MODAL_HTML = html; drawModal(); }
export function hasModal() { return MODAL_HTML !== null; }
export function clearModal() { MODAL_HTML = null; drawModal(); }
export function closeModal() { MODAL_HTML = null; drawModal(); requestRender(); }

function drawModal() {
  const ov = $("overlay");
  const wrap = $("dlg-portrait-wrap");
  const img = $("dlg-portrait-img") as HTMLImageElement;
  const namePlate = $("dlg-name-plate");

  if (MODAL_HTML) {
    ov.classList.add("show");
    $("modal").innerHTML = MODAL_HTML;
    const portImg = $("modal").querySelector<HTMLImageElement>(".portrait-dialogue img");
    const titleEl = $("modal").querySelector<HTMLElement>(".dialogue-title");
    if (portImg) {
      img.src = portImg.src;
      img.alt = portImg.alt;
      wrap.classList.add("show");
      ov.classList.add("has-portrait");
      namePlate.innerHTML = titleEl ? titleEl.innerHTML : "";
      namePlate.classList.add("show");
    } else {
      img.src = "";
      wrap.classList.remove("show");
      ov.classList.remove("has-portrait");
      namePlate.classList.remove("show");
      namePlate.innerHTML = "";
    }
  } else {
    ov.classList.remove("show");
    ov.classList.remove("has-portrait");
    wrap.classList.remove("show");
    namePlate.classList.remove("show");
    img.src = "";
  }
}
