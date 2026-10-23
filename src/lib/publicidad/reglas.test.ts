import sharp from "sharp";
import { proporcionValida, destinoValido, elegirPonderado, diasNoUsados, ESPACIOS, ESPACIOS_BANNER } from "./reglas";
import { firmarToken, verificarToken } from "./token";
import { procesarImagenAviso } from "./piezas";

// 21-publicidad.md: reglas puras, token firmado y procesamiento de piezas.
describe("reglas", () => {
  it("espacios", () => {
    expect(ESPACIOS).toEqual(["inicio", "lista", "comparar", "tienda_pie", "pin_mapa", "push"]);
    expect(ESPACIOS_BANNER).toEqual(["inicio", "lista", "comparar", "tienda_pie"]);
  });

  it("proporción por espacio: apaisada 2,5–7; comparar 1–1,5", () => {
    expect(proporcionValida("inicio", 320, 100)).toBe(true);
    expect(proporcionValida("lista", 320, 50)).toBe(true);
    expect(proporcionValida("tienda_pie", 300, 250)).toBe(false);
    expect(proporcionValida("comparar", 300, 250)).toBe(true);
    expect(proporcionValida("comparar", 320, 100)).toBe(false);
  });

  it("destino: vacío, ruta interna o https", () => {
    for (const ok of [null, undefined, "", "/tiendas/abc", "https://almacenia.store/x"]) expect(destinoValido(ok)).toBe(true);
    for (const mal of ["//evil.com", "http://inseguro.com", "javascript:alert(1)", "tiendas/abc", "https://"]) expect(destinoValido(mal)).toBe(false);
  });

  it("elegirPonderado respeta los pesos", () => {
    const items = [{ id: "a", peso: 1 }, { id: "b", peso: 3 }];
    expect(elegirPonderado(items, () => 0)?.id).toBe("a");
    expect(elegirPonderado(items, () => 0.24)?.id).toBe("a");
    expect(elegirPonderado(items, () => 0.26)?.id).toBe("b");
    expect(elegirPonderado(items, () => 0.999)?.id).toBe("b");
    expect(elegirPonderado([], () => 0.5)).toBeNull();
  });

  it("diasNoUsados", () => {
    expect(diasNoUsados({ dias: 5, diasConsumidos: 2 })).toBe(3);
    expect(diasNoUsados({ dias: 5, diasConsumidos: 7 })).toBe(0);
  });
});

describe("token firmado", () => {
  const payload = { c: "camp", p: "pieza", e: "inicio" as const, u: null, n: "nonce-1" };
  it("ida y vuelta, y vence a la hora", () => {
    const ahora = new Date("2026-10-23T12:00:00Z");
    const token = firmarToken(payload, ahora);
    expect(verificarToken(token, ahora)).toMatchObject(payload);
    expect(verificarToken(token, new Date(ahora.getTime() + 61 * 60 * 1000))).toBeNull();
  });
  it("rechaza tokens alterados o basura", () => {
    const token = firmarToken(payload);
    const [cuerpo, firma] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ ...payload, c: "otra" })).toString("base64url");
    expect(verificarToken(`${otro}.${firma}`)).toBeNull();
    expect(verificarToken(`${cuerpo}.x${firma.slice(1)}`)).toBeNull();
    expect(verificarToken("basura")).toBeNull();
    expect(verificarToken("")).toBeNull();
  });
});

describe("procesarImagenAviso", () => {
  const png = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#0a7" } }).png().toBuffer();

  it("convierte a WebP con ancho máximo 640 y valida la proporción", async () => {
    const r = await procesarImagenAviso("inicio", await png(1280, 400), "image/png");
    expect(r).toMatchObject({ ancho: 640, alto: 200, contentType: "image/webp" });
    expect((await sharp(r.buffer).metadata()).format).toBe("webp");
    await expect(procesarImagenAviso("inicio", await png(300, 250), "image/png")).rejects.toMatchObject({ code: "PROPORCION_INVALIDA" });
  });

  it("GIF animado → WebP animado", async () => {
    const frames = await Promise.all(
      ["#f00", "#0f0"].map((c) => sharp({ create: { width: 320, height: 100, channels: 3, background: c } }).raw().toBuffer())
    );
    // Dos cuadros de 320×100 apilados: sharp arma un GIF de 2 páginas con pageHeight.
    const animado = await sharp(Buffer.concat(frames), { raw: { width: 320, height: 200, channels: 3, pageHeight: 100 } as never })
      .gif({ loop: 0 })
      .toBuffer();
    const r = await procesarImagenAviso("lista", animado, "image/gif");
    const meta = await sharp(r.buffer, { animated: true }).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.pages).toBe(2);
    expect(r).toMatchObject({ ancho: 320, alto: 100 });
  });

  it("formato o tamaño inválidos", async () => {
    await expect(procesarImagenAviso("inicio", Buffer.from("x"), "image/svg+xml")).rejects.toMatchObject({ code: "TIPO_ARCHIVO_INVALIDO" });
    await expect(procesarImagenAviso("inicio", Buffer.alloc(1024 * 1024 + 1), "image/gif")).rejects.toMatchObject({
      code: "ARCHIVO_DEMASIADO_GRANDE",
    });
  });
});
