import { describe, expect, it } from "vitest";
import { NPCS } from "../src/content";
import { npcPortrait } from "../src/ui/portraits";

const STATION_PORTRAITS = ["nym_quell", "ilya_veer", "oss_varda", "sen_asha"] as const;

describe("station portrait dossiers", () => {
  it("resolves every authored portrait and dossier", () => {
    for (const key of STATION_PORTRAITS) {
      expect(npcPortrait(key), `${key} portrait`).toBeTruthy();
      expect(NPCS[key], `${key} content`).toBeTruthy();
      expect(NPCS[key].dossier?.species, `${key} species`).toBeTruthy();
      expect(NPCS[key].dossier?.role, `${key} role`).toBeTruthy();
      expect(NPCS[key].dossier?.note, `${key} field note`).toBeTruthy();
      expect(NPCS[key].planets).not.toEqual([]);
    }
  });

  it("reuses the matching crew species models where requested", () => {
    expect(NPCS.nym_quell.modelKey).toBe("corbin");
    expect(NPCS.ilya_veer.modelKey).toBe("tomas");
  });
});
