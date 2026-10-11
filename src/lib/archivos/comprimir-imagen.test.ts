import { dimensionesDestino, mensajeErrorSubida, LADO_MAXIMO } from "./comprimir-imagen";

describe("dimensionesDestino", () => {
  it("reduce una foto de cámara 12 MP a 1600 px del lado mayor, manteniendo la proporción", () => {
    expect(dimensionesDestino(4000, 3000)).toEqual({ ancho: 1600, alto: 1200 });
    expect(dimensionesDestino(3000, 4000)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it("no agranda imágenes chicas", () => {
    expect(dimensionesDestino(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(dimensionesDestino(LADO_MAXIMO, 100)).toEqual({ ancho: LADO_MAXIMO, alto: 100 });
  });

  it("redondea a píxeles enteros", () => {
    expect(dimensionesDestino(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
    expect(dimensionesDestino(5000, 3333)).toEqual({ ancho: 1600, alto: 1067 });
  });
});

describe("mensajeErrorSubida", () => {
  it("prioriza el mensaje del servidor", () => {
    expect(mensajeErrorSubida(new Error("x"), "No se pudo guardar la foto en el almacenamiento.")).toBe(
      "No se pudo guardar la foto en el almacenamiento."
    );
  });

  it("un fallo de red (TypeError de fetch) sugiere la galería", () => {
    expect(mensajeErrorSubida(new TypeError("Failed to fetch"), null)).toMatch(/galería/);
  });

  it("cualquier otro error: mensaje genérico", () => {
    expect(mensajeErrorSubida(new Error("x"), null)).toBe("No pudimos subir la imagen. Probá de nuevo.");
  });
});
