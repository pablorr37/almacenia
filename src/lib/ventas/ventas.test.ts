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
  transicionarVenta,
} from "./ventas";
import { categoriaDePrueba } from "@/lib/rubros-categorias/test-helpers";

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
    nuevo: { categoriaId: await categoriaDePrueba(), variante: "Producto" },
    precio: 100,
    stock,
  });
  return { vendedor, tienda, producto };
}

async function limpiar(usuarioIds: string[]) {
  await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
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

  it("venta por peso: debita 1,25 kg del stock y calcula el total por kg", async () => {
    await prisma.productoCatalogo.update({ where: { id: producto.catalogoId }, data: { unidad: "kg" } });
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1.25 }],
    });
    expect(venta.total).toBe(125);
    expect(venta.items[0].cantidad).toBe(1.25);
    const actualizado = await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } });
    expect(Number(actualizado.stock)).toBe(8.75);
  });

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
    expect(Number(productoActualizado?.stock)).toBe(7);
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
      nuevo: { categoriaId: await categoriaDePrueba(), variante: "Otro producto" },
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
    expect(Number(productoIntacto?.stock)).toBe(10);
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
    expect(Number(productoActualizado?.stock)).toBe(8);
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

describe("venta de mostrador: estado de cobro", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda, producto } = await crearVendedorConTiendaYProducto(10));
    comprador = await crearUsuarioDePrueba("Cliente");
    otro = await crearUsuarioDePrueba("Otro");
    await prisma.tienda.update({ where: { id: tienda.id }, data: { mediosDePago: ["efectivo", "transferencia"] } });
  });

  afterEach(() => limpiar([vendedor.id, comprador.id, otro.id]));

  const stock = async () => Number((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock);
  const puntosVendedor = () => prisma.eventoPuntos.count({ where: { usuarioId: vendedor.id, tipo: "venta_realizada" } });

  it("sin cobrarAhora (default) nace cobrada, como antes", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] });
    expect(venta.estado).toBe("cobrada");
    expect(venta.cobradaEn).not.toBeNull();
  });

  it("cerrar por cobrar: descuenta stock, guarda medio y nota, y no otorga puntos todavía", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 2 }],
      cobrarAhora: false,
      medioPago: "transferencia",
      nota: "Paga el viernes",
    });
    expect(venta).toMatchObject({ estado: "por_cobrar", medioPago: "transferencia", nota: "Paga el viernes", cobradaEn: null });
    expect(await stock()).toBe(8);
    expect(await puntosVendedor()).toBe(0);
  });

  it("cobrar: pasa a cobrada y otorga los puntos", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 2 }],
      cobrarAhora: false,
      medioPago: "efectivo",
    });
    const cobrada = await transicionarVenta(vendedor, venta.id, "cobrar");
    expect(cobrada.estado).toBe("cobrada");
    expect(cobrada.cobradaEn).not.toBeNull();
    expect(await puntosVendedor()).toBe(1);
    expect(await stock()).toBe(8);
  });

  it("anular: devuelve el stock y no otorga puntos", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 3 }],
      cobrarAhora: false,
      medioPago: "efectivo",
    });
    const anulada = await transicionarVenta(vendedor, venta.id, "anular");
    expect(anulada.estado).toBe("anulada");
    expect(anulada.anuladaEn).not.toBeNull();
    expect(await stock()).toBe(10);
    expect(await puntosVendedor()).toBe(0);
  });

  it("TRANSICION_INVALIDA si no está por cobrar; NO_ES_DUENO_DE_TIENDA para otro usuario", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
      cobrarAhora: false,
      medioPago: "efectivo",
    });
    await expect(transicionarVenta(otro, venta.id, "cobrar")).rejects.toMatchObject({ code: "NO_ES_DUENO_DE_TIENDA" });
    await transicionarVenta(vendedor, venta.id, "cobrar");
    await expect(transicionarVenta(vendedor, venta.id, "anular")).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
    await expect(transicionarVenta(vendedor, venta.id, "otra" as "cobrar")).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
    await expect(transicionarVenta(vendedor, crypto.randomUUID(), "cobrar")).rejects.toMatchObject({ code: "VENTA_NO_ENCONTRADA" });
  });

  it("MEDIO_PAGO_INVALIDO si la tienda no acepta ese medio", async () => {
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], medioPago: "qr" })
    ).rejects.toMatchObject({ code: "MEDIO_PAGO_INVALIDO" });
    expect(await stock()).toBe(10);
  });

  it("cliente por email: se asocia; COMPRADOR_INVALIDO si no existe; VENTA_PROPIA si es el vendedor", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
      compradorEmail: comprador.email.toUpperCase(),
    });
    expect(venta.compradorId).toBe(comprador.id);
    expect(venta.comprador).toEqual({ nombre: comprador.nombre, email: comprador.email });
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], compradorEmail: "nadie@almacenia.test" })
    ).rejects.toMatchObject({ code: "COMPRADOR_INVALIDO" });
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], compradorEmail: vendedor.email })
    ).rejects.toMatchObject({ code: "VENTA_PROPIA" });
  });

  it("NOTA_INVALIDA con más de 200 caracteres", async () => {
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], nota: "x".repeat(201) })
    ).rejects.toMatchObject({ code: "NOTA_INVALIDA" });
  });

  it("usa el precio de oferta si el producto lo tiene", async () => {
    await prisma.producto.update({ where: { id: producto.id }, data: { precioOferta: 80 } });
    const venta = await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 2 }] });
    expect(venta.total).toBe(160);
  });

  it("los ítems traen nombre y unidad del producto", async () => {
    const venta = await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] });
    expect(venta.items[0]).toMatchObject({ nombre: "Prueba Producto", unidad: "unidad" });
  });

  it("listarVentas filtra por estado", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }] });
    const porCobrar = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
      cobrarAhora: false,
    });
    const r = await listarVentas(vendedor, { tiendaId: tienda.id, estado: "por_cobrar" });
    expect(r.data.map((v) => v.id)).toEqual([porCobrar.id]);
  });
});
