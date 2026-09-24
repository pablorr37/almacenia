import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { listarUsuarios } from "./usuarios";

let contador = 0;
async function crearAdmin(): Promise<Usuario> {
  contador += 1;
  const usuario = await registrarUsuario({
    email: `test-admin-usuarios-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Admin",
  });
  await prisma.usuario.update({ where: { id: usuario.id }, data: { esAdmin: true } });
  return { ...usuario, esAdmin: true };
}

async function crearComprador(): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-admin-usuarios-c-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Comprador de prueba",
  });
}

async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-admin-usuarios-v-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda admin usuarios ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

async function limpiar(usuarioIds: string[]) {
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.venta.deleteMany({ where: { compradorId: { in: usuarioIds } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

describe("listarUsuarios", () => {
  it("lanza FORBIDDEN si el usuario no es admin", async () => {
    const comprador = await crearComprador();
    try {
      await expect(listarUsuarios(comprador, {})).rejects.toMatchObject<Partial<AppError>>({
        code: "FORBIDDEN",
      });
    } finally {
      await limpiar([comprador.id]);
    }
  });

  it("filtra por rol=vendedor", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const comprador = await crearComprador();

    try {
      const resultado = await listarUsuarios(admin, { rol: "vendedor" });
      const ids = resultado.data.map((u) => u.id);
      expect(ids).toContain(vendedor.id);
      expect(ids).not.toContain(comprador.id);
      expect(resultado.data.every((u) => u.esVendedor)).toBe(true);
    } finally {
      await limpiar([admin.id, vendedor.id, comprador.id]);
    }
    void tienda;
  });

  it("filtra por plan=premium (implica esVendedor)", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
    const { vendedor: otroVendedor } = await crearVendedorConTienda();

    try {
      const resultado = await listarUsuarios(admin, { plan: "premium" });
      const ids = resultado.data.map((u) => u.id);
      expect(ids).toContain(vendedor.id);
      expect(ids).not.toContain(otroVendedor.id);
    } finally {
      await limpiar([admin.id, vendedor.id, otroVendedor.id]);
    }
  });

  it("incluye la tienda y cantidadVentas de un vendedor", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const producto = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: `Producto admin usuarios ${contador}` },
      precio: 100,
      stock: 10,
    });
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 2 }] });

    try {
      const resultado = await listarUsuarios(admin, { rol: "vendedor" });
      const fila = resultado.data.find((u) => u.id === vendedor.id);
      expect(fila?.tienda?.id).toBe(tienda.id);
      expect(fila?.cantidadVentas).toBe(1);
    } finally {
      await limpiar([admin.id, vendedor.id]);
      await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
    }
  });

  it("cuenta las compras del comprador cuando no tiene tienda", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const comprador = await crearComprador();
    const producto = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: `Producto admin usuarios comprador ${contador}` },
      precio: 50,
      stock: 5,
    });
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    try {
      const resultado = await listarUsuarios(admin, { rol: "comprador" });
      const fila = resultado.data.find((u) => u.id === comprador.id);
      expect(fila?.tienda).toBeNull();
      expect(fila?.cantidadVentas).toBe(1);
    } finally {
      await limpiar([admin.id, vendedor.id, comprador.id]);
      await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
    }
  });
});
