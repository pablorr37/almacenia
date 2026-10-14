import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { listarProductosAdmin, listarCatalogoDeCompradores, eliminarEntradaCatalogo } from "./productos";
import { categoriaDePrueba } from "@/lib/rubros-categorias/test-helpers";

let contador = 0;
async function crearAdmin(): Promise<Usuario> {
  contador += 1;
  const usuario = await registrarUsuario({
    email: `test-admin-productos-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Admin",
  });
  await prisma.usuario.update({ where: { id: usuario.id }, data: { esAdmin: true } });
  return { ...usuario, esAdmin: true };
}

async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-admin-productos-v-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda admin productos ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

async function limpiar(usuarioIds: string[], catalogoIds: string[]) {
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds } } });
}

describe("listarProductosAdmin", () => {
  it("lanza FORBIDDEN si no es admin", async () => {
    const { vendedor } = await crearVendedorConTienda();
    try {
      await expect(listarProductosAdmin(vendedor, {})).rejects.toMatchObject<Partial<AppError>>({
        code: "FORBIDDEN",
      });
    } finally {
      await limpiar([vendedor.id], []);
    }
  });

  it("cruza productos de distintas tiendas e incluye tiendaNombre/vendedorNombre", async () => {
    const admin = await crearAdmin();
    const { vendedor: v1, tienda: t1 } = await crearVendedorConTienda();
    const { vendedor: v2, tienda: t2 } = await crearVendedorConTienda();
    const p1 = await crearProducto(v1, t1.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: `Manzana ${contador}` }, precio: 100, stock: 5 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: `Banana ${contador}` }, precio: 50, stock: 3 });

    try {
      const resultado = await listarProductosAdmin(admin, {});
      const ids = resultado.data.map((p: Producto) => p.id);
      expect(ids).toContain(p1.id);
      expect(ids).toContain(p2.id);

      const fila1 = resultado.data.find((p) => p.id === p1.id);
      expect(fila1?.tiendaNombre).toBe(t1.nombre);
      expect(fila1?.vendedorNombre).toBe(v1.nombre);
    } finally {
      await limpiar([admin.id, v1.id, v2.id], [p1.catalogoId, p2.catalogoId]);
    }
  });

  it("filtra por tiendaId", async () => {
    const admin = await crearAdmin();
    const { vendedor: v1, tienda: t1 } = await crearVendedorConTienda();
    const { vendedor: v2, tienda: t2 } = await crearVendedorConTienda();
    const p1 = await crearProducto(v1, t1.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: `Solo t1 ${contador}` }, precio: 10, stock: 1 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: `Solo t2 ${contador}` }, precio: 10, stock: 1 });

    try {
      const resultado = await listarProductosAdmin(admin, { tiendaId: t1.id });
      const ids = resultado.data.map((p) => p.id);
      expect(ids).toContain(p1.id);
      expect(ids).not.toContain(p2.id);
    } finally {
      await limpiar([admin.id, v1.id, v2.id], [p1.catalogoId, p2.catalogoId]);
    }
  });

  it("filtra por q (nombre)", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const p1 = await crearProducto(vendedor, tienda.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: "Yerba especial" }, precio: 10, stock: 1 });
    const p2 = await crearProducto(vendedor, tienda.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: "Arroz" }, precio: 10, stock: 1 });

    try {
      const resultado = await listarProductosAdmin(admin, { q: "yerba" });
      const ids = resultado.data.map((p) => p.id);
      expect(ids).toContain(p1.id);
      expect(ids).not.toContain(p2.id);
    } finally {
      await limpiar([admin.id, vendedor.id], [p1.catalogoId, p2.catalogoId]);
    }
  });
});

describe("catálogo cargado por compradores", () => {
  it("lista lo cargado por compradores con su uso y el admin borra lo que no vende ninguna tienda (saliendo de las listas)", async () => {
    const admin = await registrarUsuario({ email: `test-cat-comp-a-${Date.now()}@almacenia.test`, password: "password123", nombre: "A" });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    const comprador = await registrarUsuario({ email: `test-cat-comp-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    const entrada = await prisma.productoCatalogo.create({ data: { categoriaId: await categoriaDePrueba(), nombre: `Cargado ${Date.now()}`, creadoPorId: comprador.id } });
    const lista = await prisma.listaCompras.create({
      data: { compradorId: comprador.id, nombre: "L", items: { create: [{ catalogoId: entrada.id, cantidad: 1 }] } },
    });
    try {
      const r = await listarCatalogoDeCompradores({ ...admin, esAdmin: true }, {});
      const fila = r.data.find((x) => x.id === entrada.id)!;
      expect(fila).toMatchObject({ creadoPor: { nombre: "C" }, tiendas: 0, listas: 1 });

      await expect(listarCatalogoDeCompradores(comprador, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await eliminarEntradaCatalogo({ ...admin, esAdmin: true }, entrada.id)).toEqual({ id: entrada.id });
      expect(await prisma.productoCatalogo.findUnique({ where: { id: entrada.id } })).toBeNull();
      expect(await prisma.itemListaCompras.count({ where: { listaId: lista.id } })).toBe(0);
    } finally {
      await prisma.listaCompras.deleteMany({ where: { id: lista.id } });
      await prisma.productoCatalogo.deleteMany({ where: { id: entrada.id } });
      await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, comprador.id] } } });
    }
  });

  it("CATALOGO_EN_USO si alguna tienda lo vende", async () => {
    const admin = await registrarUsuario({ email: `test-cat-uso-a-${Date.now()}@almacenia.test`, password: "password123", nombre: "A" });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    const vendedor = await registrarUsuario({ email: `test-cat-uso-v-${Date.now()}@almacenia.test`, password: "password123", nombre: "V" });
    const tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    const producto = await crearProducto(vendedor, tienda.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: `En uso ${Date.now()}` }, precio: 10, stock: 1 });
    try {
      await expect(eliminarEntradaCatalogo({ ...admin, esAdmin: true }, producto.catalogoId)).rejects.toMatchObject({ code: "CATALOGO_EN_USO" });
    } finally {
      await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
      await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
      await prisma.tienda.deleteMany({ where: { id: tienda.id } });
      await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
    }
  });
});
