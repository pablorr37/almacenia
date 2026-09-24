import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { listarProductosAdmin } from "./productos";

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
    const p1 = await crearProducto(v1, t1.id, { nuevo: { nombre: `Manzana ${contador}` }, precio: 100, stock: 5 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { nombre: `Banana ${contador}` }, precio: 50, stock: 3 });

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
    const p1 = await crearProducto(v1, t1.id, { nuevo: { nombre: `Solo t1 ${contador}` }, precio: 10, stock: 1 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { nombre: `Solo t2 ${contador}` }, precio: 10, stock: 1 });

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
    const p1 = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Yerba especial" }, precio: 10, stock: 1 });
    const p2 = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Arroz" }, precio: 10, stock: 1 });

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
