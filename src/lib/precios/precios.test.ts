import { tasaIva, calcularPrecio, desglosar, margenDesde } from "./precios";
import { normalizarCuit } from "@/lib/tiendas/cuit";

// 20-precios-facturacion.md
const RI = "responsable_inscripto" as const;
const MONO = "monotributo" as const;

describe("tasaIva", () => {
  it("21, 10,5, 27, 0 y exento", () => {
    expect([tasaIva("iva_21"), tasaIva("iva_10_5"), tasaIva("iva_27"), tasaIva("iva_0"), tasaIva("exento")]).toEqual([0.21, 0.105, 0.27, 0, 0]);
  });
});

describe("calcularPrecio", () => {
  it("responsable inscripto: neto = costo + margen; final = neto + IVA + internos", () => {
    expect(calcularPrecio({ condicion: RI, costo: 1000, margen: 30, alicuota: "iva_21", internos: 0 })).toBe(1573);
    expect(calcularPrecio({ condicion: RI, costo: 1000, margen: 30, alicuota: "iva_10_5", internos: 0 })).toBe(1436.5);
    expect(calcularPrecio({ condicion: RI, costo: 1000, margen: 30, alicuota: "iva_27", internos: 0 })).toBe(1651);
    expect(calcularPrecio({ condicion: RI, costo: 1000, margen: 30, alicuota: "exento", internos: 0 })).toBe(1300);
    expect(calcularPrecio({ condicion: RI, costo: 1000, margen: 30, alicuota: "iva_21", internos: 8 })).toBe(1677);
  });

  it("monotributo y exento: el IVA no suma (el costo ya lo incluye)", () => {
    expect(calcularPrecio({ condicion: MONO, costo: 1000, margen: 30, alicuota: "iva_21", internos: 0 })).toBe(1300);
    expect(calcularPrecio({ condicion: "exento", costo: 1000, margen: 30, alicuota: "iva_21", internos: 8 })).toBe(1404);
  });

  it("redondea el precio final a 2 decimales", () => {
    expect(calcularPrecio({ condicion: RI, costo: 333.33, margen: 33.33, alicuota: "iva_21", internos: 0 })).toBe(537.76);
  });
});

describe("desglosar", () => {
  it("RI: neto, IVA e internos que suman el precio final", () => {
    expect(desglosar(1573, { condicion: RI, alicuota: "iva_21", internos: 0 })).toEqual({ neto: 1300, iva: 273, internos: 0 });
    const d = desglosar(1677, { condicion: RI, alicuota: "iva_21", internos: 8 });
    expect(d.neto).toBeCloseTo(1300, 4);
    expect(d.iva).toBeCloseTo(273, 4);
    expect(d.internos).toBeCloseTo(104, 4);
  });

  it("monotributo: IVA 0; los internos se separan igual", () => {
    expect(desglosar(1300, { condicion: MONO, alicuota: "iva_21", internos: 0 })).toEqual({ neto: 1300, iva: 0, internos: 0 });
    expect(desglosar(1404, { condicion: MONO, alicuota: "iva_21", internos: 8 })).toEqual({ neto: 1300, iva: 0, internos: 104 });
  });

  it("la suma siempre cierra exacta con el precio", () => {
    const d = desglosar(999.99, { condicion: RI, alicuota: "iva_10_5", internos: 3 });
    expect(Math.round((d.neto + d.iva + d.internos) * 10000) / 10000).toBe(999.99);
  });
});

describe("margenDesde", () => {
  it("vuelve al margen original (ida y vuelta)", () => {
    expect(margenDesde(1573, { condicion: RI, costo: 1000, alicuota: "iva_21", internos: 0 })).toBe(30);
    expect(margenDesde(1300, { condicion: MONO, costo: 1000, alicuota: "iva_21", internos: 0 })).toBe(30);
    expect(margenDesde(1404, { condicion: MONO, costo: 1000, alicuota: "iva_21", internos: 8 })).toBe(30);
  });

  it("negativo si se vende por debajo del costo; null sin costo", () => {
    expect(margenDesde(900, { condicion: MONO, costo: 1000, alicuota: "iva_21", internos: 0 })).toBe(-10);
    expect(margenDesde(900, { condicion: MONO, costo: 0, alicuota: "iva_21", internos: 0 })).toBeNull();
  });
});

describe("normalizarCuit", () => {
  it("acepta 11 dígitos con dígito verificador válido, con o sin guiones", () => {
    expect(normalizarCuit("20-12345678-6")).toBe("20123456786");
    expect(normalizarCuit("20123456786")).toBe("20123456786");
  });

  it("rechaza formato o dígito verificador inválido", () => {
    expect(normalizarCuit("20-12345678-9")).toBeNull();
    expect(normalizarCuit("2012345678")).toBeNull();
    expect(normalizarCuit("abc")).toBeNull();
  });
});
