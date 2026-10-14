import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import {
  normalizarItems,
  crearLista,
  listarListas,
  obtenerLista,
  actualizarLista,
  eliminarLista,
} from "./listas";
import { categoriaDePrueba } from "@/lib/rubros-categorias/test-helpers";

describe("normalizarItems", () => {
  it("suma cantidades de catalogoId repetidos", () => {
    expect(
      normalizarItems([
        { catalogoId: "a", cantidad: 1 },
        { catalogoId: "b", cantidad: 2 },
        { catalogoId: "a", cantidad: 3 },
      ])
    ).toEqual([
      { catalogoId: "a", cantidad: 4 },
      { catalogoId: "b", cantidad: 2 },
    ]);
  });

  it("ITEMS_LISTA_INVALIDOS: no array, cantidad ≤ 0, sin catalogoId, más de 100", () => {
    const invalidos: unknown[] = [
      "x",
      [{ catalogoId: "a", cantidad: 0 }],
      [{ catalogoId: "a", cantidad: -1 }],
      [{ cantidad: 1 }],
      Array.from({ length: 101 }, (_, i) => ({ catalogoId: `c${i}`, cantidad: 1 })),
    ];
    for (const items of invalidos) {
      expect(() => normalizarItems(items)).toThrow(expect.objectContaining({ code: "ITEMS_LISTA_INVALIDOS" }));
    }
  });
});

describe("listas de compras (14-listas-compras.md)", () => {
  let comprador: Usuario;
  let otro: Usuario;
  let yerba: string;
  let fideos: string;

  beforeEach(async () => {
    comprador = await registrarUsuario({ email: `test-listas-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    otro = await registrarUsuario({ email: `test-listas-o-${Date.now()}@almacenia.test`, password: "password123", nombre: "O" });
    yerba = (await prisma.productoCatalogo.create({ data: { categoriaId: await categoriaDePrueba(), nombre: "Yerba test listas", marca: "Playadito" } })).id;
    fideos = (await prisma.productoCatalogo.create({ data: { categoriaId: await categoriaDePrueba(), nombre: "Fideos test listas" } })).id;
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: [comprador.id, otro.id] } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: [yerba, fideos] } } });
  });

  it("crea una lista con sus ítems y los datos del producto de catálogo", async () => {
    const lista = await crearLista(comprador, {
      nombre: "  Semana  ",
      items: [{ catalogoId: yerba, cantidad: 2 }, { catalogoId: fideos, cantidad: 1 }],
    });
    expect(lista.nombre).toBe("Semana");
    expect(lista.compradorId).toBe(comprador.id);
    expect(lista.items).toHaveLength(2);
    expect(lista.items.find((i) => i.catalogoId === yerba)).toMatchObject({
      cantidad: 2,
      producto: { nombre: "Yerba test listas", marca: "Playadito" },
    });
  });

  it("venta por peso: acepta 0,25 kg en productos por kg y rechaza fracciones en productos por unidad", async () => {
    await prisma.productoCatalogo.update({ where: { id: fideos }, data: { unidad: "kg" } });
    const lista = await crearLista(comprador, { nombre: "Fiambre", items: [{ catalogoId: fideos, cantidad: 0.25 }] });
    expect(lista.items[0]).toMatchObject({ cantidad: 0.25, producto: { unidad: "kg" } });

    await expect(
      crearLista(comprador, { nombre: "X", items: [{ catalogoId: yerba, cantidad: 1.5 }] })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CANTIDAD_INVALIDA" });
    // En kg se admiten gramos (03-productos.md); la lista redondea a 1 g.
    const enGramos = await crearLista(comprador, { nombre: "Gramos", items: [{ catalogoId: fideos, cantidad: 0.2085 }] });
    expect(enGramos.items[0].cantidad).toBe(0.209);
  });

  it("NOMBRE_LISTA_INVALIDO vacío o de más de 80 caracteres", async () => {
    for (const nombre of ["   ", "x".repeat(81)]) {
      await expect(crearLista(comprador, { nombre, items: [] })).rejects.toMatchObject<Partial<AppError>>({
        code: "NOMBRE_LISTA_INVALIDO",
      });
    }
  });

  it("CATALOGO_NO_ENCONTRADO con un catalogoId inexistente", async () => {
    await expect(
      crearLista(comprador, { nombre: "L", items: [{ catalogoId: "00000000-0000-0000-0000-000000000000", cantidad: 1 }] })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CATALOGO_NO_ENCONTRADO" });
  });

  it("puede haber muchas listas; listarListas pagina y ordena por actualización", async () => {
    await crearLista(comprador, { nombre: "Primera", items: [{ catalogoId: yerba, cantidad: 1 }] });
    await crearLista(comprador, { nombre: "Segunda", items: [] });
    await crearLista(otro, { nombre: "Ajena", items: [] });

    const r = await listarListas(comprador, {});
    expect(r.total).toBe(2);
    expect(r.data.map((l) => l.nombre)).toEqual(["Segunda", "Primera"]);
    expect(r.data[1].cantidadItems).toBe(1);
  });

  it("actualizarLista reemplaza los ítems y cambia el nombre", async () => {
    const lista = await crearLista(comprador, { nombre: "L", items: [{ catalogoId: yerba, cantidad: 1 }] });
    const act = await actualizarLista(comprador, lista.id, { nombre: "Nueva", items: [{ catalogoId: fideos, cantidad: 3 }] });
    expect(act.nombre).toBe("Nueva");
    expect(act.items.map((i) => [i.catalogoId, i.cantidad])).toEqual([[fideos, 3]]);
  });

  it("una lista ajena no existe para otro usuario (LISTA_NO_ENCONTRADA)", async () => {
    const lista = await crearLista(comprador, { nombre: "Privada", items: [] });
    await expect(obtenerLista(otro, lista.id)).rejects.toMatchObject<Partial<AppError>>({ code: "LISTA_NO_ENCONTRADA" });
    await expect(actualizarLista(otro, lista.id, { nombre: "X" })).rejects.toMatchObject<Partial<AppError>>({
      code: "LISTA_NO_ENCONTRADA",
    });
    await expect(eliminarLista(otro, lista.id)).rejects.toMatchObject<Partial<AppError>>({ code: "LISTA_NO_ENCONTRADA" });
  });

  it("eliminarLista borra la lista y sus ítems", async () => {
    const lista = await crearLista(comprador, { nombre: "Borrar", items: [{ catalogoId: yerba, cantidad: 1 }] });
    expect(await eliminarLista(comprador, lista.id)).toEqual({ id: lista.id });
    expect(await prisma.itemListaCompras.count({ where: { listaId: lista.id } })).toBe(0);
    await expect(obtenerLista(comprador, lista.id)).rejects.toMatchObject<Partial<AppError>>({ code: "LISTA_NO_ENCONTRADA" });
  });
});

describe("moderación del nombre de la lista", () => {
  it("TEXTO_NO_PERMITIDO si el nombre tiene groserías", async () => {
    const u = await registrarUsuario({ email: `test-lista-mod-${Date.now()}@almacenia.test`, password: "password123", nombre: "L" });
    try {
      await expect(crearLista(u, { nombre: "Compras del boludo", items: [] })).rejects.toMatchObject({ code: "TEXTO_NO_PERMITIDO" });
    } finally {
      await prisma.usuario.delete({ where: { id: u.id } });
    }
  });
});
