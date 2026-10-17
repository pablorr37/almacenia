import { describe, expect, it } from "vitest";
import { contraste, parsearRubro, resolverTema, RUBROS_TEMA, TEMAS, variablesCss } from "./tema";

describe("parsearRubro", () => {
  it("acepta los rubros conocidos sin importar mayúsculas, tildes ni espacios", () => {
    expect(parsearRubro("bebidas")).toBe("bebidas");
    expect(parsearRubro(" Bebidas ")).toBe("bebidas");
    expect(parsearRubro("VINOS")).toBe("vinos");
    expect(parsearRubro("vivéro")).toBe("vivero");
    expect(parsearRubro("Almacén")).toBe("almacen");
  });

  it("devuelve null para vacío o desconocido", () => {
    expect(parsearRubro(undefined)).toBeNull();
    expect(parsearRubro("   ")).toBeNull();
    expect(parsearRubro("ferreteria")).toBeNull();
  });
});

describe("resolverTema", () => {
  it("sin variables usa almacen con la marca Permia", () => {
    const { tema, advertencia } = resolverTema({});
    expect(tema.rubro).toBe("almacen");
    expect(tema.marca).toBe("Permia");
    expect(advertencia).toBeNull();
  });

  it("toma el rubro de PERMIA_RUBRO", () => {
    const { tema } = resolverTema({ PERMIA_RUBRO: " Bebidas " });
    expect(tema.rubro).toBe("bebidas");
    expect(tema.colores).toEqual(TEMAS.bebidas.colores);
    expect(tema.fuentes).toEqual(TEMAS.bebidas.fuentes);
  });

  it("un rubro desconocido cae en almacen con advertencia que nombra el valor y los válidos", () => {
    const { tema, advertencia } = resolverTema({ PERMIA_RUBRO: "ferreteria" });
    expect(tema.rubro).toBe("almacen");
    expect(advertencia).toContain("ferreteria");
    for (const r of RUBROS_TEMA) expect(advertencia).toContain(r);
  });

  it("PERMIA_NOMBRE, PERMIA_ESLOGAN y PERMIA_DESCRIPCION pisan los textos, no los colores", () => {
    const { tema } = resolverTema({
      PERMIA_RUBRO: "bebidas",
      PERMIA_NOMBRE: "  Distribuidora Don Pepe ",
      PERMIA_ESLOGAN: "Frío y al toque.",
      PERMIA_DESCRIPCION: "Bebidas por mayor y menor.",
    });
    expect(tema.marca).toBe("Distribuidora Don Pepe");
    expect(tema.eslogan).toBe("Frío y al toque.");
    expect(tema.descripcion).toBe("Bebidas por mayor y menor.");
    expect(tema.colores).toEqual(TEMAS.bebidas.colores);
  });

  it("los textos vacíos cuentan como ausentes", () => {
    const { tema } = resolverTema({ PERMIA_RUBRO: "vinos", PERMIA_NOMBRE: "  ", PERMIA_ESLOGAN: "" });
    expect(tema.marca).toBe(TEMAS.vinos.marca);
    expect(tema.eslogan).toBe(TEMAS.vinos.eslogan);
  });

  it("no muta TEMAS", () => {
    resolverTema({ PERMIA_RUBRO: "vivero", PERMIA_NOMBRE: "Otro" });
    expect(TEMAS.vivero.marca).not.toBe("Otro");
  });
});

describe("variablesCss", () => {
  it("mapea colores, fuentes y radios a los tokens de globals.css", () => {
    const v = variablesCss(TEMAS.vinos);
    expect(v["--color-primary"]).toBe(TEMAS.vinos.colores.primary);
    expect(v["--color-primary-dark"]).toBe(TEMAS.vinos.colores.primaryDark);
    expect(v["--color-primary-soft"]).toBe(TEMAS.vinos.colores.primarySoft);
    expect(v["--color-accent-text"]).toBe(TEMAS.vinos.colores.accentText);
    expect(v["--color-text-2"]).toBe(TEMAS.vinos.colores.text2);
    expect(v["--color-placeholder"]).toBe(TEMAS.vinos.colores.placeholder);
    expect(v["--font-display"]).toBe("var(--font-cormorant), Georgia, serif");
    expect(v["--font-sans"]).toBe("var(--font-jost), system-ui, sans-serif");
    expect(v["--radius-control"]).toBe("4px");
    expect(v["--radius-card"]).toBe("6px");
  });

  it("las sombras de CTA usan el primario y el acento del tema", () => {
    const v = variablesCss(TEMAS.bebidas);
    expect(v["--shadow-cta"]).toBe("0 4px 12px rgb(109 40 217 / 0.25)");
    expect(v["--shadow-cta-accent"]).toContain("rgb(208 20 95 / 0.25)");
  });
});

describe("contraste", () => {
  it("calcula la razón WCAG", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contraste("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe.each(RUBROS_TEMA)("tema %s: accesibilidad", (rubro) => {
  const c = TEMAS[rubro].colores;
  it.each(["primary", "primaryDark", "accent", "accentDark"] as const)("blanco sobre %s ≥ 4.5", (k) => {
    expect(contraste("#ffffff", c[k])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["text", "text2", "accentText", "primaryDark"] as const)("%s sobre bg y surface ≥ 4.5", (k) => {
    expect(contraste(c[k], c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c[k], c.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
