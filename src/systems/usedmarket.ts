// The second-hand rack — dead captains' modules, salvage, and auction lots.
// This is CORE_LOOP.md pillar 1 ("parts with provenance") and the mechanical
// realization of Debtor's Row / the Auction Floor: modules cheaper than yard-
// new, but each carries pre-existing WEAR (the honest catch — cheap today,
// refit sooner) and a story. Which ports stock it, and how rough the stock,
// is the port's economic character.
import { S, log, mk } from "../state";
import { MODS } from "../content";
import { stats } from "../derive";
import { rand, ri, pick } from "../rng";
import { requestRender } from "../bus";
import { wearTier } from "./wear";
import type { UsedItem } from "../types";

// Curated dead-ship names — the registry plates the salvage came off. Kept
// small and evocative; provenance is flavor, not a name generator to scale.
const SHIP_NAMES = [
  "Vesper", "Grey Lantern", "Marrow's Kin", "Saint Ledger", "Dust Sparrow",
  "Cold Harbor", "Nine of Coins", "Last Tuesday", "Hollow Bell", "Redshift Mary",
  "Quiet Percy", "Ampersand", "Long Odds", "Tallow Moon", "Second Verse",
];
const CAP_FIRST = ["R.", "M.", "J.", "S.", "A.", "T.", "V.", "K.", "O.", "N."];
const CAP_LAST = ["Osei", "Voss", "Calder", "Renn", "Ibarra", "Sloane", "Achebe", "Duarte", "Fenn", "Marsh"];

function capName(): string { return "Capt. " + pick(CAP_FIRST) + " " + pick(CAP_LAST); }
function shipName(): string { return "the " + pick(SHIP_NAMES); }

// Per-port participation: pool of module types, wear range, and a provenance
// voice. Ports not listed here simply have no rack.
interface RackDef {
  label: string;                       // panel title in the yard
  pool: string[];                      // module types that can appear
  wear: [number, number];              // pre-existing wear range
  count: [number, number];             // how many items to stock
  provenance: (t: string) => string;   // the story line
}

const RACKS: Record<string, RackDef> = {
  solace: {
    label: "Debtor's Row rack",
    pool: ["cargohold", "fueltank", "cabin", "medbay", "shields", "weapons", "hydro", "quarters", "workshop"],
    wear: [20, 55],
    count: [2, 4],
    provenance: () => {
      const c = capName(), s = shipName();
      return pick([
        `${c} didn't make the last berth payment. The estate sold ${s} to the Row for parts.`,
        `Pulled from ${s} after ${c} didn't come back from the Verge run.`,
        `${c}'s own rig. The Row doesn't ask how it ended up here; neither should you.`,
        `Off ${s}. The registry burn's still on the housing — somebody sanded at it and gave up.`,
      ]);
    },
  },
  foundry: {
    label: "Ferro's salvage rack",
    pool: ["workshop", "weapons", "shields", "armory", "reactor", "fueltank"],
    wear: [12, 40],
    count: [2, 3],
    provenance: () => {
      const s = shipName();
      return pick([
        `Ferro pulled this off ${s} herself. "Ran nine years, never once lied to me."`,
        `Salvage off ${s}. Runs a touch hot — but you'll always know exactly where you stand with it.`,
        `${s}'s, before the tow. Ferro trued it once already; it'll outlast something new.`,
      ]);
    },
  },
  havens: {
    label: "Auction lots (as-is)",
    pool: ["smuggler", "weapons", "shields", "luxcabin", "cabin", "armory", "cargohold"],
    wear: [35, 70],
    count: [2, 4],
    provenance: (t) => {
      const c = capName();
      return pick([
        `Lot sold sealed. No registry, no questions. ${c}'s, if the plate's honest — it isn't.`,
        `Came off something the Folly would rather not have appraised. Works. Mostly.`,
        `Auction overflow. The last owner didn't collect, and the Red Sky doesn't hold lots for sentiment.`,
        `Hot the day it landed, cold now. ${MODS[t].n}, as-is, buyer beware, house takes no returns.`,
      ]);
    },
  },
};

// Priced below yard-new, and cheaper the more worn — the whole trade is
// "pay less now, pay the refit sooner."
function usedPrice(t: string, wear: number): number {
  const factor = 0.70 - wear / 300;   // wear 0 → .70, 40 → .567, 70 → .467
  return Math.max(1, Math.round(MODS[t].price * factor));
}

// Stock holds for a 3-day window from when it was generated — stable across a
// dock visit, and you can't wait-scum a better rack overnight (a reroll costs
// three days of salaries and food).
const RESTOCK_DAYS = 3;

export function refreshUsedMarket() {
  const def = RACKS[S.loc];
  if (!def) { S.usedMarket = null; return; }
  if (S.usedMarket && S.usedMarket.loc === S.loc && S.day - S.usedMarket.day < RESTOCK_DAYS) return;
  const items: UsedItem[] = [];
  const n = ri(def.count[0], def.count[1]);
  const used = new Set<string>();
  let guard = 20;
  while (items.length < n && guard-- > 0) {
    const t = pick(def.pool);
    if (used.has(t)) continue;              // one of each type per rack
    used.add(t);
    // A favored Ferro relationship surfaces cleaner salvage.
    const lowWear = S.loc === "foundry" && S.flags.yard_favor;
    const wear = lowWear
      ? ri(def.wear[0] - 8, def.wear[1] - 12)
      : ri(def.wear[0], def.wear[1]);
    const w = Math.max(0, wear);
    items.push({ id: S.uid++, t, wear: w, price: usedPrice(t, w), story: def.provenance(t) });
  }
  S.usedMarket = { loc: S.loc, day: S.day, label: def.label, items };
}

export function usedStockHere(): UsedItem[] {
  refreshUsedMarket();
  return S.usedMarket ? S.usedMarket.items : [];
}
export function usedRackLabel(): string {
  return S.usedMarket ? S.usedMarket.label : "";
}

export function condLabel(wear: number): string {
  const tier = wearTier({ t: "", on: true, dmg: false, wear });
  return tier === "failing" ? "well-worn" : tier === "worn" ? "worn" : "sound";
}

export function buyUsed(id: number) {
  refreshUsedMarket();
  if (!S.usedMarket) return;
  const i = S.usedMarket.items.findIndex((x) => x.id === id);
  if (i < 0) return;
  const item = S.usedMarket.items[i];
  const nonCore = S.modules.filter((m) => !MODS[m.t].core).length;
  if (nonCore >= S.slotsMax) { log("No free slot — buy a hull expansion first."); requestRender(); return; }
  if (S.credits < item.price) { log("Not enough credits for that piece."); requestRender(); return; }
  S.credits -= item.price;
  S.usedMarket.items.splice(i, 1);       // salvage is one-of-a-kind
  const m = mk(item.t);
  m.wear = item.wear;
  S.modules.push(m);
  const st = stats();
  if (MODS[item.t].pw && st.powerUse > st.powerOut) {
    m.on = false;
    log(`Installed a second-hand ${MODS[item.t].n} (−${item.price}cr) — ${condLabel(item.wear)}, and the reactor can't feed it yet. OFFLINE until you free up power.`);
  } else {
    log(`Installed a second-hand ${MODS[item.t].n} (−${item.price}cr) — ${condLabel(item.wear)}. ${item.story}`);
  }
  requestRender();
}
