import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import {
  normalizarNombre,
  listarRubros,
  crearRubro,
  actualizarRubro,
  eliminarRubro,
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
} from "./rubros-categorias";

// 17-rubros-categorias.md
const PREFIJO = `T${Date.now()}`;
let contador = 0;

async function crearUsuario(esAdmin: boolean): Promise<Usuario> {
  contador += 1;
  const u = await registrarUsuario({
    email: `test-rubcat-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Usuario rubros",
  });
  if (!esAdmin) return u;
  await prisma.usuario.update({ where: { id: u.id }, data: { esAdmin: true } });
  return { ...u, esAdmin: true };
}

let admin: Usuario;
let comun: Usuario;

beforeAll(async () => {
  admin = await crearUsuario(true);
  comun = await crearUsuario(false);
});

afterAll(async () => {
  const ids = [admin.id, comun.id];
  await prisma.horarioTienda.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.productoCatalogo.deleteMany({ where: { categoria: { nombre: { startsWith: PREFIJO } } } });
  await prisma.categoriaProducto.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
  await prisma.rubro.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
});

describe("normalizarNombre", () => {
  it("minúsculas, sin tildes y con espacios simples", () => {
    expect(normalizarNombre("  Plantas   de INTERIOR ")).toBe("plantas de interior");
    expect(normalizarNombre("Verdulería")).toBe("verduleria");
    expect(normalizarNombre("Ñoquis")).toBe("noquis");
  });
});

describe("rubros", () => {
  it("el admin crea, renombra y borra; la lista sale ordenada por orden y nombre", async () => {
    const b = await crearRubro(admin, { nombre: `${PREFIJO} Vivero`, orden: 5 });
    const a = await crearRubro(admin, { nombre: `${PREFIJO} Almacén`, orden: 5 });
    const c = await crearRubro(admin, { nombre: `${PREFIJO} Ferretería`, orden: 1 });
    expect(b).toMatchObject({ nombre: `${PREFIJO} Vivero`, orden: 5 });

    const propios = (await listarRubros()).filter((r) => r.nombre.startsWith(PREFIJO));
    expect(propios.map((r) => r.id)).toEqual([c.id, a.id, b.id]);

    const renombrado = await actualizarRubro(admin, c.id, { nombre: `${PREFIJO} Ferretería y bazar`, orden: 9 });
    expect(renombrado).toMatchObject({ nombre: `${PREFIJO} Ferretería y bazar`, orden: 9 });

    await eliminarRubro(admin, c.id);
    expect((await listarRubros()).some((r) => r.id === c.id)).toBe(false);
  });

  it("no permite duplicados por nombre normalizado", async () => {
    await crearRubro(admin, { nombre: `${PREFIJO} Kiosco` });
    await expect(crearRubro(admin, { nombre: `  ${PREFIJO.toLowerCase()}   kíosco ` })).rejects.toMatchObject({
      code: "NOMBRE_DUPLICADO",
    });
  });

  it("valida el nombre (largo y groserías)", async () => {
    await expect(crearRubro(admin, { nombre: " a " })).rejects.toMatchObject({ code: "NOMBRE_INVALIDO" });
    await expect(crearRubro(admin, { nombre: "x".repeat(41) })).rejects.toMatchObject({ code: "NOMBRE_INVALIDO" });
    await expect(crearRubro(admin, { nombre: "Kiosco pelotudo" })).rejects.toMatchObject({ code: "TEXTO_NO_PERMITIDO" });
  });

  it("solo el admin escribe", async () => {
    await expect(crearRubro(comun, { nombre: `${PREFIJO} Bazar` })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no se borra un rubro en uso; uno inexistente da RUBRO_NO_ENCONTRADO", async () => {
    const rubro = await crearRubro(admin, { nombre: `${PREFIJO} Carnicería` });
    await crearTienda(comun, {
      nombre: "Tienda con rubro",
      direccion: "Calle 1",
      lat: -31.53,
      lon: -68.52,
      rubroId: rubro.id,
    });
    await expect(eliminarRubro(admin, rubro.id)).rejects.toMatchObject({ code: "RUBRO_EN_USO" });
    await expect(actualizarRubro(admin, "no-existe", { nombre: "X Y" })).rejects.toMatchObject({
      code: "RUBRO_NO_ENCONTRADO",
    });
  });
});

describe("categorías de producto", () => {
  it("el admin crea, renombra y borra; se listan por nombre y se filtran por texto sin tildes", async () => {
    const queso = await crearCategoria(admin, { nombre: `${PREFIJO} Queso` });
    const arroz = await crearCategoria(admin, { nombre: `${PREFIJO} Arroz` });
    const plantas = await crearCategoria(admin, { nombre: `${PREFIJO} Plantas de interior` });

    const propias = (await listarCategorias()).filter((c) => c.nombre.startsWith(PREFIJO));
    expect(propias.map((c) => c.id)).toEqual([arroz.id, plantas.id, queso.id]);

    const filtradas = await listarCategorias(`${PREFIJO} PLÁNTAS`);
    expect(filtradas.map((c) => c.id)).toEqual([plantas.id]);

    const renombrada = await actualizarCategoria(admin, queso.id, { nombre: `${PREFIJO} Quesos` });
    expect(renombrada.nombre).toBe(`${PREFIJO} Quesos`);

    await eliminarCategoria(admin, plantas.id);
    expect((await listarCategorias()).some((c) => c.id === plantas.id)).toBe(false);
  });

  it("no permite duplicados ni escribir sin ser admin", async () => {
    await crearCategoria(admin, { nombre: `${PREFIJO} Gaseosa` });
    await expect(crearCategoria(admin, { nombre: `${PREFIJO} GASEOSA` })).rejects.toMatchObject({
      code: "NOMBRE_DUPLICADO",
    });
    await expect(crearCategoria(comun, { nombre: `${PREFIJO} Vino` })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no se borra una categoría en uso; una inexistente da CATEGORIA_NO_ENCONTRADA", async () => {
    const yerba = await crearCategoria(admin, { nombre: `${PREFIJO} Yerba` });
    await prisma.productoCatalogo.create({ data: { nombre: `${PREFIJO} Yerba Playadito`, categoriaId: yerba.id } });
    await expect(eliminarCategoria(admin, yerba.id)).rejects.toMatchObject({ code: "CATEGORIA_EN_USO" });
    await expect(eliminarCategoria(admin, "no-existe")).rejects.toMatchObject({ code: "CATEGORIA_NO_ENCONTRADA" });
  });
});
