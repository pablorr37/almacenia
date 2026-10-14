import { validarCantidad, esCantidadValida, formatearCantidad, pasoDe, redondearCantidad, pesoPorImporte } from "./unidades";

describe("esCantidadValida / validarCantidad (03-productos.md, Cantidades y unidades)", () => {
  it("unidad: enteros ≥ 1", () => {
    expect(esCantidadValida("unidad", 1)).toBe(true);
    expect(esCantidadValida("unidad", 12)).toBe(true);
    expect(esCantidadValida("unidad", 1.5)).toBe(false);
    expect(esCantidadValida("unidad", 0)).toBe(false);
  });

  it("kg: hasta gramos (3 decimales), ≥ 1 g (tolerante a errores de coma flotante)", () => {
    expect(esCantidadValida("kg", 0.25)).toBe(true);
    expect(esCantidadValida("kg", 0.1 + 0.2)).toBe(true); // 0.30000000000000004
    expect(esCantidadValida("kg", 1.5)).toBe(true);
    expect(esCantidadValida("kg", 0.208)).toBe(true); // $2.500 de queso a $12.000/kg
    expect(esCantidadValida("kg", 0.001)).toBe(true);
    expect(esCantidadValida("kg", 0.2085)).toBe(false); // medio gramo
    expect(esCantidadValida("kg", 0)).toBe(false);
  });

  it("permitirCero para stock", () => {
    expect(esCantidadValida("unidad", 0, { permitirCero: true })).toBe(true);
    expect(esCantidadValida("kg", 0, { permitirCero: true })).toBe(true);
    expect(esCantidadValida("kg", -0.05, { permitirCero: true })).toBe(false);
  });

  it("no números: inválido", () => {
    expect(esCantidadValida("unidad", Number.NaN)).toBe(false);
    expect(esCantidadValida("kg", "1" as unknown as number)).toBe(false);
  });

  it("validarCantidad tira CANTIDAD_INVALIDA", () => {
    expect(() => validarCantidad("unidad", 1.5)).toThrow(expect.objectContaining({ code: "CANTIDAD_INVALIDA" }));
  });
});

describe("formatearCantidad", () => {
  it("unidades", () => {
    expect(formatearCantidad("unidad", 3)).toBe("3 u.");
  });
  it("kg: gramos por debajo de 1 kg, kg con coma arriba", () => {
    expect(formatearCantidad("kg", 0.25)).toBe("250 g");
    expect(formatearCantidad("kg", 1)).toBe("1 kg");
    expect(formatearCantidad("kg", 1.5)).toBe("1,5 kg");
    expect(formatearCantidad("kg", 2.35)).toBe("2,35 kg");
  });
});

describe("pasoDe / redondearCantidad", () => {
  it("paso: 1 por unidad, 0,05 por kg", () => {
    expect(pasoDe("unidad")).toBe(1);
    expect(pasoDe("kg")).toBe(0.05);
  });
  it("redondea al paso de la unidad", () => {
    expect(redondearCantidad("kg", 0.1 + 0.2)).toBe(0.3);
    expect(redondearCantidad("unidad", 2.0000001)).toBe(2);
  });
});

describe("pesoPorImporte (03-productos.md, \"$ Importe\")", () => {
  it("importe / precio por kg, redondeado a 1 g", () => {
    expect(pesoPorImporte(3000, 12000)).toBe(0.25);
    expect(pesoPorImporte(2500, 12000)).toBe(0.208);
    expect(pesoPorImporte(1000, 3333)).toBe(0.3);
  });
  it("0 si el importe o el precio no son positivos", () => {
    expect(pesoPorImporte(0, 12000)).toBe(0);
    expect(pesoPorImporte(-5, 12000)).toBe(0);
    expect(pesoPorImporte(3000, 0)).toBe(0);
    expect(pesoPorImporte(Number.NaN, 12000)).toBe(0);
  });
  it("el resultado siempre es una cantidad válida en kg (o 0)", () => {
    for (const importe of [1, 99, 1234.5, 5000]) {
      const kg = pesoPorImporte(importe, 7777);
      expect(kg === 0 || esCantidadValida("kg", kg)).toBe(true);
    }
  });
});
