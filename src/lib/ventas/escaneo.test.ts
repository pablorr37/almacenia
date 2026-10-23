import { productoPorCodigo, normalizarCodigo } from "./escaneo";

// 05-ventas.md, "Escanear producto"
const productos = [
  { id: "p-yerba", nombre: "Yerba", codigoBarras: "7790001001238" },
  { id: "p-upc", nombre: "Gaseosa importada", codigoBarras: "012345678905" },
  { id: "p-suelto", nombre: "Tomate", codigoBarras: null },
];

describe("normalizarCodigo", () => {
  it("deja solo los dígitos; vacío si no hay", () => {
    expect(normalizarCodigo(" 779-0001-00123 8\n")).toBe("7790001001238");
    expect(normalizarCodigo("hola")).toBe("");
  });
});

describe("productoPorCodigo", () => {
  it("encuentra por código de barras exacto", () => {
    expect(productoPorCodigo(productos, "7790001001238")?.id).toBe("p-yerba");
  });

  it("UPC-A (12) y EAN-13 con 0 adelante son el mismo código, en las dos direcciones", () => {
    expect(productoPorCodigo(productos, "0012345678905")?.id).toBe("p-upc");
    const conEan = [{ id: "x", nombre: "X", codigoBarras: "0012345678905" }];
    expect(productoPorCodigo(conEan, "012345678905")?.id).toBe("x");
  });

  it("acepta el id del producto (QR propio) y devuelve null si no hay coincidencia", () => {
    expect(productoPorCodigo(productos, "p-suelto")?.id).toBe("p-suelto");
    expect(productoPorCodigo(productos, "1111111111116")).toBeNull();
    expect(productoPorCodigo(productos, "")).toBeNull();
  });
});
