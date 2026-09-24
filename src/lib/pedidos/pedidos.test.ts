import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import {
  crearPedido,
  obtenerPedido,
  transicionarPedido,
  transicionPermitida,
  listarPedidos,
  type EstadoPedido,
  type AccionPedido,
} from "./pedidos";

let contador = 0;
async function crearUsuarioDePrueba(nombre = "Usuario de prueba"): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-pedidos-${Date.now()}-${contador}@almacenia.test`,
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

describe("transicionPermitida", () => {
  const casosValidos: Array<[EstadoPedido, AccionPedido]> = [
    ["pendiente", "confirmar"],
    ["pendiente", "rechazar"],
    ["pendiente", "cancelar"],
    ["confirmado", "marcarListo"],
    ["listo_para_retirar", "entregar"],
  ];

  it.each(casosValidos)("permite %s -> %s", (estado, accion) => {
    expect(transicionPermitida(estado, accion)).toBe(true);
  });

  const casosInvalidos: Array<[EstadoPedido, AccionPedido]> = [
    ["confirmado", "cancelar"],
    ["listo_para_retirar", "cancelar"],
    ["entregado", "cancelar"],
    ["pendiente", "marcarListo"],
    ["pendiente", "entregar"],
    ["confirmado", "entregar"],
    ["entregado", "entregar"],
    ["rechazado", "confirmar"],
    ["cancelado", "confirmar"],
  ];

  it.each(casosInvalidos)("no permite %s -> %s", (estado, accion) => {
    expect(transicionPermitida(estado, accion)).toBe(false);
  });
});

describe("crearPedido", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
  });

  afterEach(() => limpiar([vendedor.id, comprador.id]));

  it("crea el pedido con items y precioUnitario copiado del producto", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 3 }],
    });

    expect(pedido.tiendaId).toBe(tienda.id);
    expect(pedido.compradorId).toBe(comprador.id);
    expect(pedido.estado).toBe("pendiente");
    expect(pedido.items).toHaveLength(1);
    expect(pedido.items[0].productoId).toBe(producto.id);
    expect(pedido.items[0].cantidad).toBe(3);
    expect(pedido.items[0].precioUnitario).toBe(100);
  });

  it("el precioUnitario copiado no cambia si el producto cambia de precio después", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await prisma.producto.update({ where: { id: producto.id }, data: { precio: 999 } });

    const releido = await obtenerPedido(comprador, pedido.id);
    expect(releido?.items[0].precioUnitario).toBe(100);
  });

  it("lanza ITEMS_VACIOS si items está vacío", async () => {
    await expect(
      crearPedido(comprador, { tiendaId: tienda.id, items: [] })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "ITEMS_VACIOS" });
  });

  it("lanza TIENDA_NO_ENCONTRADA si la tienda no existe", async () => {
    await expect(
      crearPedido(comprador, {
        tiendaId: "00000000-0000-0000-0000-000000000000",
        items: [{ productoId: producto.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });

  it("lanza PRODUCTOS_DE_OTRA_TIENDA si un producto no pertenece a la tienda", async () => {
    const otra = await crearVendedorConTiendaYProducto(5);

    await expect(
      crearPedido(comprador, {
        tiendaId: tienda.id,
        items: [{ productoId: otra.producto.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRODUCTOS_DE_OTRA_TIENDA" });

    await limpiar([otra.vendedor.id]);
  });

  it("lanza PRODUCTO_NO_COMPRABLE si el producto no está disponible", async () => {
    const noDisponible = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: "Pausado" },
      precio: 50,
      stock: 5,
    });
    await prisma.producto.update({ where: { id: noDisponible.id }, data: { disponible: false } });

    await expect(
      crearPedido(comprador, {
        tiendaId: tienda.id,
        items: [{ productoId: noDisponible.id, cantidad: 1 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRODUCTO_NO_COMPRABLE" });
  });

  it("lanza STOCK_INSUFICIENTE si la cantidad pedida excede el stock", async () => {
    await expect(
      crearPedido(comprador, {
        tiendaId: tienda.id,
        items: [{ productoId: producto.id, cantidad: 999 }],
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "STOCK_INSUFICIENTE" });
  });
});

describe("obtenerPedido", () => {
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

  it("el comprador dueño puede verlo", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const encontrado = await obtenerPedido(comprador, pedido.id);
    expect(encontrado?.id).toBe(pedido.id);
  });

  it("el vendedor dueño de la tienda puede verlo", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const encontrado = await obtenerPedido(vendedor, pedido.id);
    expect(encontrado?.id).toBe(pedido.id);
  });

  it("devuelve null si no existe", async () => {
    const encontrado = await obtenerPedido(comprador, "00000000-0000-0000-0000-000000000000");
    expect(encontrado).toBeNull();
  });

  it("lanza NO_AUTORIZADO_PEDIDO si el usuario no es ni comprador ni vendedor", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await expect(obtenerPedido(ajeno, pedido.id)).rejects.toMatchObject<Partial<AppError>>({
      code: "NO_AUTORIZADO_PEDIDO",
    });
  });
});

describe("transicionarPedido", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
  });

  afterEach(() => limpiar([vendedor.id, comprador.id]));

  it("el comprador puede cancelar un pedido pendiente", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const actualizado = await transicionarPedido(comprador, pedido.id, "cancelar");
    expect(actualizado.estado).toBe("cancelado");
  });

  it("el vendedor puede confirmar un pedido pendiente", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const actualizado = await transicionarPedido(vendedor, pedido.id, "confirmar");
    expect(actualizado.estado).toBe("confirmado");
  });

  it("lanza TRANSICION_INVALIDA si el comprador intenta confirmar", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await expect(
      transicionarPedido(comprador, pedido.id, "confirmar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TRANSICION_INVALIDA" });
  });

  it("lanza TRANSICION_INVALIDA si el vendedor intenta cancelar", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await expect(
      transicionarPedido(vendedor, pedido.id, "cancelar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TRANSICION_INVALIDA" });
  });

  it("lanza TRANSICION_INVALIDA si el estado actual no admite la acción", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
    await transicionarPedido(vendedor, pedido.id, "confirmar");

    await expect(
      transicionarPedido(comprador, pedido.id, "cancelar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TRANSICION_INVALIDA" });
  });

  it("lanza NO_AUTORIZADO_PEDIDO si un usuario ajeno intenta transicionar", async () => {
    const ajeno = await crearUsuarioDePrueba("Ajeno");
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await expect(
      transicionarPedido(ajeno, pedido.id, "cancelar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_AUTORIZADO_PEDIDO" });

    await limpiar([ajeno.id]);
  });

  it("lanza PEDIDO_NO_ENCONTRADO si el id no existe", async () => {
    await expect(
      transicionarPedido(comprador, "00000000-0000-0000-0000-000000000000", "cancelar")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PEDIDO_NO_ENCONTRADO" });
  });

  it("recorre el camino completo hasta entregado", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    await transicionarPedido(vendedor, pedido.id, "confirmar");
    await transicionarPedido(vendedor, pedido.id, "marcarListo");
    const entregado = await transicionarPedido(vendedor, pedido.id, "entregar");

    expect(entregado.estado).toBe("entregado");
  });
});

describe("listarPedidos", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let otroComprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
    otroComprador = await crearUsuarioDePrueba("Otro comprador");

    await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    await crearPedido(otroComprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
  });

  afterEach(() => limpiar([vendedor.id, comprador.id, otroComprador.id]));

  it("el vendedor dueño lista todos los pedidos de su tienda por tiendaId", async () => {
    const resultado = await listarPedidos(vendedor, { tiendaId: tienda.id });

    expect(resultado.total).toBe(2);
  });

  it("el comprador solo puede listar sus propios pedidos por compradorId", async () => {
    const resultado = await listarPedidos(comprador, { compradorId: comprador.id });

    expect(resultado.total).toBe(1);
    expect(resultado.data[0].compradorId).toBe(comprador.id);
  });

  it("lanza NO_AUTORIZADO_PEDIDO si compradorId no es el propio", async () => {
    await expect(
      listarPedidos(comprador, { compradorId: otroComprador.id })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_AUTORIZADO_PEDIDO" });
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si un usuario ajeno pide por tiendaId", async () => {
    await expect(
      listarPedidos(comprador, { tiendaId: tienda.id })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_ES_DUENO_DE_TIENDA" });
  });

  it("compradorId='me' resuelve al usuario autenticado", async () => {
    const resultado = await listarPedidos(comprador, { compradorId: "me" });
    expect(resultado.total).toBe(1);
    expect(resultado.data[0].compradorId).toBe(comprador.id);
  });

  it("filtra por estado", async () => {
    const resultado = await listarPedidos(comprador, { compradorId: "me", estado: "pendiente" });
    expect(resultado.total).toBe(1);

    const otroEstado = await listarPedidos(comprador, { compradorId: "me", estado: "cancelado" });
    expect(otroEstado.total).toBe(0);
  });
});

describe("Pedido.total", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Comprador");
  });

  afterEach(() => limpiar([vendedor.id, comprador.id]));

  it("es la suma de cantidad*precioUnitario de los items", async () => {
    const pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 3 }],
    });
    expect(pedido.total).toBe(producto.precio * 3);
  });
});
