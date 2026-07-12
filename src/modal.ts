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

  if (MODAL_HTML) {
    ov.classList.add("show");
    $("modal").innerHTML = MODAL_HTML;
    const portImg = $("modal").querySelector<HTMLImageElement>(".portrait-dialogue img");
    if (portImg) {
      img.src = portImg.src;
      img.alt = portImg.alt;
      wrap.classList.add("show");
      ov.classList.add("has-portrait");
    } else {
      img.src = "";
      wrap.classList.remove("show");
      ov.classList.remove("has-portrait");
    }
  } else {
    ov.classList.remove("show");
    ov.classList.remove("has-portrait");
    wrap.classList.remove("show");
    img.src = "";
  }
}
