import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearPedido, transicionarPedido } from "@/lib/pedidos/pedidos";
import {
  crearVentaPresencial,
  crearVentaDesdePedido,
  obtenerVenta,
  listarVentas,
} from "./ventas";

let contador = 0;
async function crearUsuarioDePrueba(nombre = "Usuario de prueba"): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-ventas-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre,
  });
}

async function crearVendedorConTiendaYProducto(
  stock = 10
): Promise<{ vendedor: Usuario; tienda: Tienda; producto: Producto }> {
  const vendedor = await crearUsuarioDePrueba("Vendedor");
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  const producto = await crearProducto(vendedor, tienda.id, {
    nuevo: { nombre: "Producto" },
    precio: 100,
    stock,
  });
  return { vendedor, tienda, producto };
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

describe("crearVentaPresencial", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    otro = await crearUsuarioDePrueba("Otro vendedor");
    comprador = await crearUsuarioDePrueba("Comprador registrado");
  });

  afterEach(() => limpiar([vendedor.id, otro.id, comprador.id]));

  it("crea la venta, debita el stock y calcula el total", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 3 }],
    });

    expect(venta.origen).toBe("presencial");
    expect(venta.tiendaId).toBe(tienda.id);
    expect(venta.pedidoId).toBeNull();
    expect(venta.compradorId).toBeNull();
    expect(venta.total).toBe(300);
    expect(venta.items).toHaveLength(1);
    expect(venta.items[0].precioUnitario).toBe(100);

    const productoActualizado = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(productoActualizado?.stock).toBe(7);
  });

  it("acepta un compradorId opcional de un usuario existente", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    expect(venta.compradorId).toBe(comprador.id);
  });

  it("lanza COMPRADOR_INVALIDO si compradorId no existe", async () => {
    await expect(
      crearVentaPresencial(vendedor, tienda.id, {
        compradorId: "00000000-0000-0000-0000-000000000000",
        items: [{ productoId: producto.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "COMPRADOR_INVALIDO" });
  });

  it("lanza ITEMS_VACIOS si items está vacío", async () => {
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [] })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "ITEMS_VACIOS" });
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si el usuario no es el dueño", async () => {
    await expect(
      crearVentaPresencial(otro, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_ES_DUENO_DE_TIENDA" });
  });

  it("lanza TIENDA_NO_ENCONTRADA si la tienda no existe", async () => {
    await expect(
      crearVentaPresencial(vendedor, "00000000-0000-0000-0000-000000000000", {
        items: [{ productoId: producto.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });

  it("lanza PRODUCTOS_DE_OTRA_TIENDA si un producto no pertenece a la tienda", async () => {
    const otraTienda = await crearVendedorConTiendaYProducto(5);

    await expect(
      crearVentaPresencial(vendedor, tienda.id, {
        items: [{ productoId: otraTienda.producto.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRODUCTOS_DE_OTRA_TIENDA" });

    await limpiar([otraTienda.vendedor.id]);
  });

  it("lanza STOCK_INSUFICIENTE y no debita nada si algún producto no alcanza (atomicidad)", async () => {
    const otroProducto = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: "Otro producto" },
      precio: 50,
      stock: 2,
    });

    await expect(
      crearVentaPresencial(vendedor, tienda.id, {
        items: [
          { productoId: producto.id, cantidad: 1 },
          { productoId: otroProducto.id, cantidad: 99 },
        ],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "STOCK_INSUFICIENTE" });

    const productoIntacto = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(productoIntacto?.stock).toBe(10);
  });
});

describe("crearVentaDesdePedido", () => {
  let vendedorUnit: Usuario;
  let compradorUnit: Usuario;
  let tiendaUnit: Tienda;
  let productoUnit: Producto;

  beforeEach(async () => {
    ({ vendedor: vendedorUnit, tienda: tiendaUnit, producto: productoUnit } =
      await crearVendedorConTiendaYProducto(10));
    compradorUnit = await crearUsuarioDePrueba("Comprador unit");
  });

  afterEach(() => limpiar([vendedorUnit.id, compradorUnit.id]));

  it("crea la venta a partir del pedido, con los items ya congelados", async () => {
    const pedido = await crearPedido(compradorUnit, {
      tiendaId: tiendaUnit.id,
      items: [{ productoId: productoUnit.id, cantidad: 2 }],
    });

    const venta = await crearVentaDesdePedido(pedido);

    expect(venta.origen).toBe("pedido");
    expect(venta.pedidoId).toBe(pedido.id);
    expect(venta.compradorId).toBe(compradorUnit.id);
    expect(venta.total).toBe(200);
  });
});

describe("crearVentaDesdePedido (vía transicionarPedido 'entregar')", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
  });

  afterEach(() => limpiar([vendedor.id, comprador.id]));

  it("crea la venta con origen=pedido al entregar y debita el stock", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 4 }],
    });
    await transicionarPedido(vendedor, pedido.id, "confirmar");
    await transicionarPedido(vendedor, pedido.id, "marcarListo");
    await transicionarPedido(vendedor, pedido.id, "entregar");

    // transicionarPedido('entregar') ya crea la venta internamente (crearVentaDesdePedido
    // no se llama dos veces para el mismo pedido: pedidoId es unique).
    const ventas = await prisma.venta.findMany({ where: { pedidoId: pedido.id } });
    expect(ventas).toHaveLength(1);
    const venta = await obtenerVenta(vendedor, ventas[0].id);

    expect(venta?.origen).toBe("pedido");
    expect(venta?.pedidoId).toBe(pedido.id);
    expect(venta?.compradorId).toBe(comprador.id);
    expect(venta?.total).toBe(400);
  });

  it("transicionarPedido a 'entregar' deja la venta consultable con GET equivalente (obtenerVenta)", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 2 }],
    });
    await transicionarPedido(vendedor, pedido.id, "confirmar");
    await transicionarPedido(vendedor, pedido.id, "marcarListo");
    await transicionarPedido(vendedor, pedido.id, "entregar");

    const ventas = await prisma.venta.findMany({ where: { pedidoId: pedido.id } });
    expect(ventas).toHaveLength(1);

    const venta = await obtenerVenta(vendedor, ventas[0].id);
    expect(venta?.total).toBe(200);

    const productoActualizado = await prisma.producto.findUnique({ where: { id: producto.id } });
    expect(productoActualizado?.stock).toBe(8);
  });

  it("si el stock no alcanza al entregar, la transición falla con STOCK_INSUFICIENTE y el pedido queda en listo_para_retirar", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 5 }],
    });
    await transicionarPedido(vendedor, pedido.id, "confirmar");
    await transicionarPedido(vendedor, pedido.id, "marcarListo");

    // Se agota el stock por otra vía (venta presencial) antes de que se confirme la entrega.
    await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 8 }],
    });

    await expect(
      transicionarPedido(vendedor, pedido.id, "entregar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "STOCK_INSUFICIENTE" });

    const pedidoActual = await prisma.pedido.findUnique({ where: { id: pedido.id } });
    expect(pedidoActual?.estado).toBe("listo_para_retirar");
  });
});

describe("obtenerVenta", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let ajeno: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
    ajeno = await crearUsuarioDePrueba("Ajeno");
  });

  afterEach(() => limpiar([vendedor.id, comprador.id, ajeno.id]));

  it("el vendedor dueño puede verla", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const encontrada = await obtenerVenta(vendedor, venta.id);
    expect(encontrada?.id).toBe(venta.id);
  });

  it("el comprador de la venta puede verla", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const encontrada = await obtenerVenta(comprador, venta.id);
    expect(encontrada?.id).toBe(venta.id);
  });

  it("devuelve null si no existe", async () => {
    const encontrada = await obtenerVenta(vendedor, "00000000-0000-0000-0000-000000000000");
    expect(encontrada).toBeNull();
  });

  it("lanza NO_AUTORIZADO_VENTA si el usuario no es ni vendedor ni comprador", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await expect(obtenerVenta(ajeno, venta.id)).rejects.toMatchObject<Partial<AppError>>({
      code: "NO_AUTORIZADO_VENTA",
    });
  });
});

describe("listarVentas", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(20));
    otro = await crearUsuarioDePrueba("Otro");
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] });
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] });
  });

  afterEach(() => limpiar([vendedor.id, otro.id]));

  it("el dueño lista el historial de su tienda", async () => {
    const resultado = await listarVentas(vendedor, { tiendaId: tienda.id });

    expect(resultado.total).toBe(2);
    expect(resultado.data).toHaveLength(2);
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
    await expect(listarVentas(otro, { tiendaId: tienda.id })).rejects.toMatchObject<Partial<AppError>>({
      code: "NO_ES_DUENO_DE_TIENDA",
    });
  });
});
