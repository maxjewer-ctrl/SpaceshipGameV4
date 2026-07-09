import { $ } from "./util";
import { requestRender } from "./bus";

let MODAL_HTML: string | null = null;

export function modal(html: string) { MODAL_HTML = html; drawModal(); }
export function hasModal() { return MODAL_HTML !== null; }
export function clearModal() { MODAL_HTML = null; drawModal(); }
export function closeModal() { MODAL_HTML = null; drawModal(); requestRender(); }

function drawModal() {
  const ov = $("overlay");
  if (MODAL_HTML) { ov.classList.add("show"); $("modal").innerHTML = MODAL_HTML; }
  else ov.classList.remove("show");
}
