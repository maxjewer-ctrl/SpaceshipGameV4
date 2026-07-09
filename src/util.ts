export const $ = (id: string) => document.getElementById(id)!;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const fmt = (n: number) => Math.round(n).toLocaleString();
