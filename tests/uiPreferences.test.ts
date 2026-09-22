import { describe, expect, it } from "vitest";
import { translateUiText } from "../src/ui/ptPT";
import { clampZoom } from "../src/ui/preferences";

describe("UI preferences and localisation", () => {
  it("clamps interface zoom to the supported range", () => {
    expect(clampZoom(0.4)).toBe(0.85);
    expect(clampZoom(1.12)).toBe(1.1);
    expect(clampZoom(1.9)).toBe(1.6);
  });

  it("expands analytical abbreviations in Portuguese", () => {
    expect(translateUiText("ADR")).toBe("ADR (Tarifa média diária)");
    expect(translateUiText("RevPAR")).toBe("RevPAR (Receita por quarto disponível)");
    expect(translateUiText("OTB occupancy")).toBe("Ocupação em carteira");
    expect(translateUiText("+5.0 pp")).toBe("+5.0 pontos percentuais");
  });

  it("does not repeatedly expand ADR and RevPAR", () => {
    expect(translateUiText("ADR (Tarifa média diária)")).toBe("ADR (Tarifa média diária)");
    expect(translateUiText("RevPAR (Receita por quarto disponível)")).toBe("RevPAR (Receita por quarto disponível)");
  });
});
