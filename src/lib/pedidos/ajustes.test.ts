import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { crearPedido, obtenerPedido, transicionarPedido } from "./pedidos";
import { ajustarItem } from "./ajustes";

// 04-pedidos.md (ronda 6): ubicación del comprador y ajuste de peso.
const creados: string[] = [];
let n = 0;
async function usuario(nombre: string): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-ajuste-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  return u;
}

let dueno: Usuario;
let cajero: Usuario;
let comprador: Usuario;
let tienda: Tienda;
let queso: Producto;
let gaseosa: Producto;

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));

beforeEach(async () => {
  dueno = await usuario("dueno");
  cajero = await usuario("cajero");
  comprador = await usuario("comp");
  tienda = await crearTienda(dueno, { nombre: "Fiambrería Ajuste", direccion: "D", lat: -31.5375, lon: -68.5364 });
  await agregarMiembro(dueno, tienda.id, { email: cajero.email, rol: "empleado" }); // sin 'pedidos'
  queso = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Queso ajuste", { unidad: "kg" }), precio: 10000, stock: 5 });
  gaseosa = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Gaseosa ajuste"), precio: 2000, stock: 10 });
});

afterEach(async () => {
  await prisma.conversacion.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
  await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
  await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

async function pedidoConfirmado(conGaseosa = true) {
  const items = [{ productoId: queso.id, cantidad: 0.25 }, ...(conGaseosa ? [{ productoId: gaseosa.id, cantidad: 1 }] : [])];
  const p = await crearPedido(comprador, { tiendaId: tienda.id, items });
  await transicionarPedido(dueno, p.id, "confirmar");
  return p;
}
const itemQueso = (p: { items: Array<{ id: string; productoId: string }> }) => p.items.find((i) => i.productoId === queso.id)!.id;

describe("ubicación del comprador", () => {
  it("se guarda al pedir y solo la ve el equipo, con la distancia a la tienda", async () => {
    const p = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: gaseosa.id, cantidad: 1 }],
      ubicacion: { lat: -31.5465, lon: -68.5364 }, // ~1 km al sur
    });
    const visto = await obtenerPedido(dueno, p.id);
    expect(visto?.ubicacionComprador).toEqual({ lat: -31.5465, lon: -68.5364 });
    expect(visto?.distanciaKm).toBeCloseTo(1, 1);
    expect(visto?.tiendaUbicacion).toEqual({ lat: -31.5375, lon: -68.5364 });
    const propio = await obtenerPedido(comprador, p.id);
    expect(propio?.ubicacionComprador).toBeNull();
    expect(propio?.distanciaKm).toBeNull();
  });

  it("es opcional y se valida", async () => {
    const p = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: gaseosa.id, cantidad: 1 }] });
    expect((await obtenerPedido(dueno, p.id))?.ubicacionComprador).toBeNull();
    await expect(
      crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: gaseosa.id, cantidad: 1 }], ubicacion: { lat: 200, lon: 0 } })
    ).rejects.toMatchObject({ code: "UBICACION_INVALIDA" });
  });
});

describe("ajuste de peso", () => {
  it("propuesta por peso → el comprador acepta → la cantidad pasa a la propuesta; notifica y deja mensaje en el chat", async () => {
    const p = await pedidoConfirmado();
    const r = await ajustarItem(dueno, p.id, itemQueso(p), { accion: "proponer", cantidad: 0.257 });
    const item = r.items.find((i) => i.productoId === queso.id)!;
    expect(item).toMatchObject({ ajusteEstado: "propuesto", cantidad: 0.25, cantidadPropuesta: 0.257 });
    expect(await prisma.notificacion.count({ where: { usuarioId: comprador.id, tipo: "pedido_ajuste" } })).toBe(1);
    const final = await ajustarItem(comprador, p.id, itemQueso(p), { accion: "aceptar" });
    expect(final.items.find((i) => i.productoId === queso.id)).toMatchObject({ ajusteEstado: "aceptado", cantidad: 0.257, cantidadOriginal: 0.25 });
    expect(final.total).toBe(2570 + 2000);
    const mensajes = await prisma.mensaje.findMany({ where: { pedidoId: p.id }, orderBy: { creadoEn: "asc" } });
    expect(mensajes.map((m) => [m.plantilla, m.deTienda])).toEqual([
      ["ajuste", true],
      ["ajuste", false],
    ]);
  });

  it("propuesta por importe: el peso sale del precio por kg (redondeado a 1 g)", async () => {
    const p = await pedidoConfirmado();
    const r = await ajustarItem(dueno, p.id, itemQueso(p), { accion: "proponer", importe: 2600 });
    expect(r.items.find((i) => i.productoId === queso.id)?.cantidadPropuesta).toBe(0.26);
  });

  it("rechazo → nueva propuesta, o rechazo → ratifica → el comprador quita el producto", async () => {
    const p = await pedidoConfirmado();
    const id = itemQueso(p);
    await ajustarItem(dueno, p.id, id, { accion: "proponer", cantidad: 0.3 });
    await ajustarItem(comprador, p.id, id, { accion: "rechazar" });
    await ajustarItem(dueno, p.id, id, { accion: "proponer", cantidad: 0.27 });
    await ajustarItem(comprador, p.id, id, { accion: "rechazar" });
    const rat = await ajustarItem(dueno, p.id, id, { accion: "ratificar" });
    expect(rat.items.find((i) => i.id === id)).toMatchObject({ ajusteEstado: "ratificado", cantidadPropuesta: 0.27 });
    await expect(ajustarItem(comprador, p.id, id, { accion: "rechazar" })).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
    const sinQueso = await ajustarItem(comprador, p.id, id, { accion: "quitar" });
    expect(sinQueso.estado).toBe("confirmado");
    expect(sinQueso.total).toBe(2000);
    expect(sinQueso.items.find((i) => i.id === id)?.ajusteEstado).toBe("quitado");
  });

  it("quitar el único producto cancela el pedido", async () => {
    const p = await pedidoConfirmado(false);
    const id = itemQueso(p);
    await ajustarItem(dueno, p.id, id, { accion: "proponer", cantidad: 0.4 });
    await ajustarItem(comprador, p.id, id, { accion: "rechazar" });
    await ajustarItem(dueno, p.id, id, { accion: "ratificar" });
    expect((await ajustarItem(comprador, p.id, id, { accion: "quitar" })).estado).toBe("cancelado");
  });

  it("con ajustes pendientes no pasa a listo; la venta usa lo acordado y deja afuera lo quitado", async () => {
    const p = await pedidoConfirmado();
    await ajustarItem(dueno, p.id, itemQueso(p), { accion: "proponer", cantidad: 0.257 });
    await expect(transicionarPedido(dueno, p.id, "marcarListo")).rejects.toMatchObject({ code: "AJUSTES_PENDIENTES" });
    await ajustarItem(comprador, p.id, itemQueso(p), { accion: "aceptar" });
    await transicionarPedido(dueno, p.id, "marcarListo");
    await transicionarPedido(dueno, p.id, "entregar");
    const venta = await prisma.venta.findFirstOrThrow({ where: { pedidoId: p.id }, include: { items: true } });
    expect(venta.items.map((i) => [i.productoId, Number(i.cantidad)]).sort()).toEqual(
      [
        [queso.id, 0.257],
        [gaseosa.id, 1],
      ].sort()
    );
  });

  it("permisos, estado y tipo de producto", async () => {
    const pendiente = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: queso.id, cantidad: 0.25 }] });
    await expect(ajustarItem(dueno, pendiente.id, itemQueso(pendiente), { accion: "proponer", cantidad: 0.3 })).rejects.toMatchObject({
      code: "AJUSTE_NO_PERMITIDO",
    });
    const p = await pedidoConfirmado();
    const idGaseosa = p.items.find((i) => i.productoId === gaseosa.id)!.id;
    await expect(ajustarItem(dueno, p.id, idGaseosa, { accion: "proponer", cantidad: 2 })).rejects.toMatchObject({ code: "AJUSTE_NO_PERMITIDO" });
    await expect(ajustarItem(cajero, p.id, itemQueso(p), { accion: "proponer", cantidad: 0.3 })).rejects.toMatchObject({ code: "NO_AUTORIZADO_PEDIDO" });
    await expect(ajustarItem(comprador, p.id, itemQueso(p), { accion: "proponer", cantidad: 0.3 })).rejects.toMatchObject({ code: "NO_AUTORIZADO_PEDIDO" });
    await expect(ajustarItem(dueno, p.id, itemQueso(p), { accion: "aceptar" })).rejects.toMatchObject({ code: "NO_AUTORIZADO_PEDIDO" });
    await expect(ajustarItem(dueno, p.id, itemQueso(p), { accion: "proponer", cantidad: 0 })).rejects.toMatchObject({ code: "CANTIDAD_INVALIDA" });
    await expect(ajustarItem(dueno, p.id, itemQueso(p), { accion: "ratificar" })).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
    await expect(ajustarItem(comprador, p.id, itemQueso(p), { accion: "aceptar" })).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
  });
});
