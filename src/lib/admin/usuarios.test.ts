import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { crearPedido } from "@/lib/pedidos/pedidos";
import { listarUsuarios, marcarTester, cambiarEstadoCuenta, eliminarUsuario } from "./usuarios";
import { categoriaDePrueba } from "@/lib/rubros-categorias/test-helpers";

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
      nuevo: { categoriaId: await categoriaDePrueba(), variante: `Producto admin usuarios ${contador}` },
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
      nuevo: { categoriaId: await categoriaDePrueba(), variante: `Producto admin usuarios comprador ${contador}` },
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

describe("marcarTester", () => {
  it("el admin marca y desmarca a un usuario como tester", async () => {
    const admin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      const marcado = await marcarTester(admin, comprador.id, true);
      expect(marcado).toMatchObject({ id: comprador.id, esTester: true, tienda: null });
      expect((await marcarTester(admin, comprador.id, false)).esTester).toBe(false);
    } finally {
      await limpiar([admin.id, comprador.id]);
    }
  });

  it("FORBIDDEN si no es admin; ES_TESTER_INVALIDO; USUARIO_NO_ENCONTRADO", async () => {
    const admin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      await expect(marcarTester(comprador, admin.id, true)).rejects.toMatchObject<Partial<AppError>>({ code: "FORBIDDEN" });
      await expect(marcarTester(admin, comprador.id, "si" as unknown as boolean)).rejects.toMatchObject<Partial<AppError>>({
        code: "ES_TESTER_INVALIDO",
      });
      await expect(marcarTester(admin, crypto.randomUUID(), true)).rejects.toMatchObject<Partial<AppError>>({
        code: "USUARIO_NO_ENCONTRADO",
      });
    } finally {
      await limpiar([admin.id, comprador.id]);
    }
  });
});

describe("listarUsuarios: búsqueda y orden", () => {
  it("q busca por nombre, email o nombre de tienda (sin mayúsculas)", async () => {
    const admin = await crearAdmin();
    const comprador = await crearComprador();
    const { vendedor, tienda } = await crearVendedorConTienda();
    try {
      const porEmail = await listarUsuarios(admin, { q: comprador.email.toUpperCase() });
      expect(porEmail.data.map((u) => u.id)).toEqual([comprador.id]);
      const porTienda = await listarUsuarios(admin, { q: tienda.nombre.toLowerCase() });
      expect(porTienda.data.map((u) => u.id)).toEqual([vendedor.id]);
      expect(porTienda.total).toBe(1);
    } finally {
      await limpiar([admin.id, comprador.id, vendedor.id]);
    }
  });

  it("devuelve los más nuevos primero y pagina hasta el total", async () => {
    const admin = await crearAdmin();
    const a = await crearComprador();
    const b = await crearComprador();
    try {
      const primera = await listarUsuarios(admin, { page: 1, pageSize: 2 });
      expect(primera.data.map((u) => u.id)).toEqual([b.id, a.id]);
      const total = primera.total;
      const ultima = await listarUsuarios(admin, { page: Math.ceil(total / 2), pageSize: 2 });
      expect(ultima.data.length).toBeGreaterThan(0);
    } finally {
      await limpiar([admin.id, a.id, b.id]);
    }
  });
});

describe("cambiarEstadoCuenta", () => {
  it("pausa, banea con motivo y reactiva", async () => {
    const admin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      const pausado = await cambiarEstadoCuenta(admin, comprador.id, "pausada");
      expect(pausado).toMatchObject({ estadoCuenta: "pausada", motivoSuspension: null });
      const baneado = await cambiarEstadoCuenta(admin, comprador.id, "baneada", "  Publicó insultos ");
      expect(baneado).toMatchObject({ estadoCuenta: "baneada", motivoSuspension: "Publicó insultos" });
      const db = await prisma.usuario.findUniqueOrThrow({ where: { id: comprador.id } });
      expect(db.suspendidaEn).not.toBeNull();

      const activo = await cambiarEstadoCuenta(admin, comprador.id, "activa");
      expect(activo).toMatchObject({ estadoCuenta: "activa", motivoSuspension: null });
      expect((await prisma.usuario.findUniqueOrThrow({ where: { id: comprador.id } })).suspendidaEn).toBeNull();
    } finally {
      await limpiar([admin.id, comprador.id]);
    }
  });

  it("FORBIDDEN para no admins y sobre otro admin; ACCION_SOBRE_SI_MISMO; ESTADO_CUENTA_INVALIDO", async () => {
    const admin = await crearAdmin();
    const otroAdmin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      await expect(cambiarEstadoCuenta(comprador, admin.id, "pausada")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(cambiarEstadoCuenta(admin, otroAdmin.id, "pausada")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(cambiarEstadoCuenta(admin, admin.id, "pausada")).rejects.toMatchObject({ code: "ACCION_SOBRE_SI_MISMO" });
      await expect(cambiarEstadoCuenta(admin, comprador.id, "borrada" as "activa")).rejects.toMatchObject({
        code: "ESTADO_CUENTA_INVALIDO",
      });
    } finally {
      await limpiar([admin.id, otroAdmin.id, comprador.id]);
    }
  });

  it("listarUsuarios filtra por estado de cuenta", async () => {
    const admin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      await cambiarEstadoCuenta(admin, comprador.id, "pausada");
      const r = await listarUsuarios(admin, { estadoCuenta: "pausada", q: comprador.email });
      expect(r.data.map((u) => u.id)).toEqual([comprador.id]);
      const activos = await listarUsuarios(admin, { estadoCuenta: "activa", q: comprador.email });
      expect(activos.total).toBe(0);
    } finally {
      await limpiar([admin.id, comprador.id]);
    }
  });
});

describe("eliminarUsuario", () => {
  it("borra a un vendedor con su tienda, productos, pedidos y ventas", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const comprador = await crearComprador();
    try {
      const producto = await crearProducto(vendedor, tienda.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: "Fideos" }, precio: 100, stock: 10 });
      await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
      await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], compradorId: comprador.id });

      expect(await eliminarUsuario(admin, vendedor.id, vendedor.email.toUpperCase())).toEqual({ id: vendedor.id });
      expect(await prisma.usuario.findUnique({ where: { id: vendedor.id } })).toBeNull();
      expect(await prisma.tienda.findUnique({ where: { id: tienda.id } })).toBeNull();
      expect(await prisma.producto.count({ where: { tiendaId: tienda.id } })).toBe(0);
      expect(await prisma.pedido.count({ where: { tiendaId: tienda.id } })).toBe(0);
      expect(await prisma.venta.count({ where: { tiendaId: tienda.id } })).toBe(0);
      // El comprador sigue existiendo.
      expect(await prisma.usuario.findUnique({ where: { id: comprador.id } })).not.toBeNull();
    } finally {
      await limpiar([admin.id, vendedor.id, comprador.id]);
    }
  });

  it("al borrar un comprador, sus compras en otras tiendas quedan anónimas (no se rompe el historial ajeno)", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const comprador = await crearComprador();
    try {
      const producto = await crearProducto(vendedor, tienda.id, { nuevo: { categoriaId: await categoriaDePrueba(), variante: "Yerba" }, precio: 100, stock: 10 });
      await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
      const venta = await crearVentaPresencial(vendedor, tienda.id, {
        items: [{ productoId: producto.id, cantidad: 2 }],
        compradorId: comprador.id,
      });

      await eliminarUsuario(admin, comprador.id, comprador.email);
      expect(await prisma.usuario.findUnique({ where: { id: comprador.id } })).toBeNull();
      const ventaDb = await prisma.venta.findUniqueOrThrow({ where: { id: venta.id } });
      expect(ventaDb.compradorId).toBeNull();
      expect(await prisma.pedido.count({ where: { compradorId: comprador.id } })).toBe(0);
    } finally {
      await limpiar([admin.id, vendedor.id, comprador.id]);
    }
  });

  it("CONFIRMACION_INVALIDA, ACCION_SOBRE_SI_MISMO, FORBIDDEN sobre otro admin y USUARIO_NO_ENCONTRADO", async () => {
    const admin = await crearAdmin();
    const otroAdmin = await crearAdmin();
    const comprador = await crearComprador();
    try {
      await expect(eliminarUsuario(admin, comprador.id, "otro@mail.com")).rejects.toMatchObject({ code: "CONFIRMACION_INVALIDA" });
      await expect(eliminarUsuario(admin, admin.id, admin.email)).rejects.toMatchObject({ code: "ACCION_SOBRE_SI_MISMO" });
      await expect(eliminarUsuario(admin, otroAdmin.id, otroAdmin.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(eliminarUsuario(admin, crypto.randomUUID(), "x@x.com")).rejects.toMatchObject({ code: "USUARIO_NO_ENCONTRADO" });
      await expect(eliminarUsuario(comprador, admin.id, admin.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await limpiar([admin.id, otroAdmin.id, comprador.id]);
    }
  });
});
