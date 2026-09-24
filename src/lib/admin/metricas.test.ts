import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearPedido } from "@/lib/pedidos/pedidos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { obtenerMetricas } from "./metricas";

// Rango amplio fijo: como los datos de otros tests corriendo en paralelo también
// caen "ahora", las aserciones comparan un delta (antes/después de crear los
// fixtures de este test) en vez de un total absoluto, para no ser sensibles al
// ruido de otras suites concurrentes contra la misma base.
const RANGO_AMPLIO = { desde: "2000-01-01T00:00:00.000Z", hasta: "2100-01-01T00:00:00.000Z" };

let contador = 0;
async function crearAdmin(): Promise<Usuario> {
  contador += 1;
  const usuario = await registrarUsuario({
    email: `test-metricas-admin-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Admin",
  });
  await prisma.usuario.update({ where: { id: usuario.id }, data: { esAdmin: true } });
  return { ...usuario, esAdmin: true };
}

async function crearUsuarioDePrueba(): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-metricas-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Usuario de prueba",
  });
}

async function limpiar(usuarioIds: string[]) {
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.pedido.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

describe("obtenerMetricas", () => {
  it("lanza FORBIDDEN si el usuario no es admin", async () => {
    const noAdmin = await crearUsuarioDePrueba();
    try {
      await expect(obtenerMetricas(noAdmin, RANGO_AMPLIO)).rejects.toMatchObject<Partial<AppError>>({
        code: "FORBIDDEN",
      });
    } finally {
      await limpiar([noAdmin.id]);
    }
  });

  it("lanza RANGO_INVALIDO si desde > hasta", async () => {
    const admin = await crearAdmin();
    try {
      await expect(
        obtenerMetricas(admin, { desde: "2026-01-02", hasta: "2026-01-01" })
      ).rejects.toMatchObject<Partial<AppError>>({ code: "RANGO_INVALIDO" });
    } finally {
      await limpiar([admin.id]);
    }
  });

  it("cuenta ventas, pedidos por estado, tiendas nuevas/de baja y usuarios nuevos", async () => {
    const admin = await crearAdmin();

    const antes = await obtenerMetricas(admin, RANGO_AMPLIO);

    const vendedor = await crearUsuarioDePrueba();
    const comprador = await crearUsuarioDePrueba();
    const tienda = await crearTienda(vendedor, {
      nombre: `Tienda métricas ${contador}`,
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    const producto = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: `Producto métricas ${contador}` },
      precio: 100,
      stock: 10,
    });
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 2 }] });
    await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    await actualizarTienda(vendedor, tienda.id, { activa: false });

    const despues = await obtenerMetricas(admin, RANGO_AMPLIO);

    expect(despues.ventas.cantidad - antes.ventas.cantidad).toBe(1);
    expect(despues.ventas.totalFacturado - antes.ventas.totalFacturado).toBe(200);
    expect(despues.pedidos.pendiente - antes.pedidos.pendiente).toBe(1);
    expect(despues.tiendasNuevas - antes.tiendasNuevas).toBe(1);
    expect(despues.tiendasDadasDeBaja - antes.tiendasDadasDeBaja).toBe(1);
    expect(despues.usuariosNuevos - antes.usuariosNuevos).toBe(2); // vendedor + comprador (admin ya estaba)

    await limpiar([admin.id, vendedor.id, comprador.id]);
    await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
  });
});
