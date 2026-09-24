import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { listarVentasAdmin } from "./ventas";

let contador = 0;
async function crearAdmin(): Promise<Usuario> {
  contador += 1;
  const usuario = await registrarUsuario({
    email: `test-admin-ventas-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Admin",
  });
  await prisma.usuario.update({ where: { id: usuario.id }, data: { esAdmin: true } });
  return { ...usuario, esAdmin: true };
}

async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-admin-ventas-v-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda admin ventas ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

async function limpiar(usuarioIds: string[], catalogoIds: string[]) {
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds } } });
}

describe("listarVentasAdmin", () => {
  it("lanza FORBIDDEN si no es admin", async () => {
    const { vendedor } = await crearVendedorConTienda();
    try {
      await expect(listarVentasAdmin(vendedor, {})).rejects.toMatchObject<Partial<AppError>>({
        code: "FORBIDDEN",
      });
    } finally {
      await limpiar([vendedor.id], []);
    }
  });

  it("cruza ventas de distintas tiendas, con items y tiendaNombre", async () => {
    const admin = await crearAdmin();
    const { vendedor: v1, tienda: t1 } = await crearVendedorConTienda();
    const { vendedor: v2, tienda: t2 } = await crearVendedorConTienda();
    const p1 = await crearProducto(v1, t1.id, { nuevo: { nombre: `P1 ${contador}` }, precio: 100, stock: 5 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { nombre: `P2 ${contador}` }, precio: 50, stock: 5 });
    const venta1 = await crearVentaPresencial(v1, t1.id, { items: [{ productoId: p1.id, cantidad: 2 }] });
    const venta2 = await crearVentaPresencial(v2, t2.id, { items: [{ productoId: p2.id, cantidad: 1 }] });

    try {
      const resultado = await listarVentasAdmin(admin, {});
      const ids = resultado.data.map((v) => v.id);
      expect(ids).toContain(venta1.id);
      expect(ids).toContain(venta2.id);

      const fila1 = resultado.data.find((v) => v.id === venta1.id);
      expect(fila1?.tiendaNombre).toBe(t1.nombre);
      expect(fila1?.total).toBe(200);
      expect(fila1?.items).toHaveLength(1);
      expect(fila1?.items[0].productoNombre).toBe(p1.nombre);
    } finally {
      await limpiar([admin.id, v1.id, v2.id], [p1.catalogoId, p2.catalogoId]);
    }
  });

  it("filtra por tiendaId", async () => {
    const admin = await crearAdmin();
    const { vendedor: v1, tienda: t1 } = await crearVendedorConTienda();
    const { vendedor: v2, tienda: t2 } = await crearVendedorConTienda();
    const p1 = await crearProducto(v1, t1.id, { nuevo: { nombre: `Filtro P1 ${contador}` }, precio: 10, stock: 5 });
    const p2 = await crearProducto(v2, t2.id, { nuevo: { nombre: `Filtro P2 ${contador}` }, precio: 10, stock: 5 });
    const venta1 = await crearVentaPresencial(v1, t1.id, { items: [{ productoId: p1.id, cantidad: 1 }] });
    const venta2 = await crearVentaPresencial(v2, t2.id, { items: [{ productoId: p2.id, cantidad: 1 }] });

    try {
      const resultado = await listarVentasAdmin(admin, { tiendaId: t1.id });
      const ids = resultado.data.map((v) => v.id);
      expect(ids).toContain(venta1.id);
      expect(ids).not.toContain(venta2.id);
    } finally {
      await limpiar([admin.id, v1.id, v2.id], [p1.catalogoId, p2.catalogoId]);
    }
  });
});
