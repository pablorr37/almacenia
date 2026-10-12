import { contieneGroseria, exigirTextoPermitido } from "./moderacion";

describe("contieneGroseria", () => {
  it.each([
    "Puto el que lee",
    "boludo",
    "Pelotudos",
    "la concha de tu hermana",
    "hdp",
    "mierda",
    "P.U.T.O",
    "p u t o",
    "pel0tud0",
    "B0LUUUDO",
    "Poronga 1kg",
    "sorete",
    "fuck you",
  ])("bloquea %j", (texto) => {
    expect(contieneGroseria(texto)).toBe(true);
  });

  it.each([
    "Pan casero",
    "Calabaza",
    "Concha y Toro Cabernet",
    "Pijama de algodón",
    "Forro polar",
    "Disputa",
    "Computadora",
    "Fernet 750ml",
    "Culotte",
    "Puré de tomate",
    "Mortadela (kg)",
    "Cerveza Quilmes 1L",
  ])("deja pasar %j", (texto) => {
    expect(contieneGroseria(texto)).toBe(false);
  });
});

describe("exigirTextoPermitido", () => {
  it("lanza TEXTO_NO_PERMITIDO con el nombre del campo", () => {
    expect(() => exigirTextoPermitido("pelotudo", "El nombre")).toThrow(
      expect.objectContaining({ code: "TEXTO_NO_PERMITIDO", message: expect.stringContaining("El nombre") })
    );
    expect(() => exigirTextoPermitido("Yerba mate", "El nombre")).not.toThrow();
  });
});
