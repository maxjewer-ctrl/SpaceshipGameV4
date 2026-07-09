// Tiny indirection so game systems can request a re-render without importing
// the UI layer (avoids import cycles). main.ts wires this to ui/render.
let renderFn: () => void = () => {};
export function setRender(f: () => void) { renderFn = f; }
export function requestRender() { renderFn(); }
