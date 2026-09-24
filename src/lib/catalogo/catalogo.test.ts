import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  buscarEnCatalogo,
  obtenerProductoCatalogo,
  crearProductoNuevoEnCatalogo,
} from "./catalogo";

async function limpiar(ids: string[]) {
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: ids } } });
}

describe("crearProductoNuevoEnCatalogo", () => {
  const creados: string[] = [];
  afterEach(() => limpiar(creados.splice(0)));

  it("crea el producto de catálogo", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Yerba Cruz de Malta 1kg" });
    creados.push(p.id);

    expect(p.nombre).toBe("Yerba Cruz de Malta 1kg");
    expect(p.codigoBarras).toBeNull();
  });

  it("lanza CODIGO_BARRAS_DUPLICADO si el código ya existe", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Arroz", codigoBarras: "7791234567890" });
    creados.push(p.id);

    await expect(
      crearProductoNuevoEnCatalogo({ nombre: "Arroz otra marca", codigoBarras: "7791234567890" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CODIGO_BARRAS_DUPLICADO" });
  });
});

describe("buscarEnCatalogo", () => {
  const creados: string[] = [];
  afterEach(() => limpiar(creados.splice(0)));

  it("lanza BUSQUEDA_CATALOGO_INVALIDA sin q ni codigoBarras", async () => {
    await expect(buscarEnCatalogo({})).rejects.toMatchObject<Partial<AppError>>({
      code: "BUSQUEDA_CATALOGO_INVALIDA",
    });
  });

  it("encuentra por nombre parcial case-insensitive", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Fideos Matarazzo 500g" });
    creados.push(p.id);

    const resultados = await buscarEnCatalogo({ q: "matarazzo" });
    expect(resultados.some((r) => r.id === p.id)).toBe(true);
  });

  it("encuentra por código de barras exacto", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Aceite", codigoBarras: "7790001112223" });
    creados.push(p.id);

    const resultados = await buscarEnCatalogo({ codigoBarras: "7790001112223" });
    expect(resultados).toHaveLength(1);
    expect(resultados[0].id).toBe(p.id);
  });
});

describe("obtenerProductoCatalogo", () => {
  it("devuelve null si no existe", async () => {
    expect(await obtenerProductoCatalogo("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
