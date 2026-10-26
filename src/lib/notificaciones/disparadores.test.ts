import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, actualizarProducto, type Producto } from "@/lib/productos/productos";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { crearPedido, transicionarPedido } from "@/lib/pedidos/pedidos";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { reemplazarCanalesParaTests } from "./canales";
import { guardarPreferencia } from "./notificaciones";
import { contarSegmento, crearEnvio, listarEnvios, cancelarEnvio, procesarEnvios } from "./envios";

// 22-notificaciones.md: disparadores de pedidos y ofertas, y envíos del admin.
const creados: string[] = [];
let n = 0;
async function usuario(nombre: string, extra: Record<string, unknown> = {}): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-disp-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  if (Object.keys(extra).length) await prisma.usuario.update({ where: { id: u.id }, data: extra });
  return { ...u, ...extra } as Usuario;
}
const tipos = async (u: Usuario) =>
  (await prisma.notificacion.findMany({ where: { usuarioId: u.id }, orderBy: { creadaEn: "asc" } })).map((x) => x.tipo);

let dueno: Usuario;
let encargado: Usuario;
let cajero: Usuario;
let comprador: Usuario;
let tienda: Tienda;
let producto: Producto;

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));

beforeEach(async () => {
  dueno = await usuario("dueno");
  encargado = await usuario("enc");
  cajero = await usuario("caj");
  comprador = await usuario("comp");
  tienda = await crearTienda(dueno, { nombre: "Kiosco Notif", direccion: "D", lat: -31.5, lon: -68.5 });
  await agregarMiembro(dueno, tienda.id, { email: encargado.email, rol: "encargado" });
  await agregarMiembro(dueno, tienda.id, { email: cajero.email, rol: "empleado" }); // sin 'pedidos'
  producto = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Notif"), precio: 100, stock: 50 });
});

afterEach(async () => {
  await prisma.envioNotificacion.deleteMany({ where: { creadoPorId: { in: creados } } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
  await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
  await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

describe("pedidos", () => {
  it("pedido nuevo: al dueño y a quien tiene permiso pedidos, no al cajero", async () => {
    const pedido = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 2 }] });
    expect(await tipos(dueno)).toEqual(["pedido_nuevo"]);
    expect(await tipos(encargado)).toEqual(["pedido_nuevo"]);
    expect(await tipos(cajero)).toEqual([]);
    const notif = await prisma.notificacion.findFirstOrThrow({ where: { usuarioId: dueno.id } });
    expect(notif).toMatchObject({ url: `/pedidos/${pedido.id}`, tiendaId: tienda.id });
    expect(notif.titulo).toContain(comprador.nombre);
  });

  it("el equipo cambia el estado: el comprador recibe pedido_estado y el resto del equipo pedido_modificado", async () => {
    const pedido = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    await transicionarPedido(encargado, pedido.id, "confirmar");
    expect(await tipos(comprador)).toEqual(["pedido_estado"]);
    expect(await tipos(dueno)).toEqual(["pedido_nuevo", "pedido_modificado"]);
    expect(await tipos(encargado)).toEqual(["pedido_nuevo"]);
  });

  it("el comprador cancela: pedido_cancelado al equipo", async () => {
    const pedido = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    await transicionarPedido(comprador, pedido.id, "cancelar");
    expect(await tipos(dueno)).toEqual(["pedido_nuevo", "pedido_cancelado"]);
    expect(await tipos(comprador)).toEqual([]);
  });
});

describe("ofertas", () => {
  it("a compradores que visitaron la tienda (salvo que las desactiven); una por tienda por día; no al equipo", async () => {
    const visitante = await usuario("visit");
    const sinOptIn = await usuario("optout");
    const desconocido = await usuario("desc");
    for (const u of [visitante, sinOptIn, desconocido]) {
      await prisma.visitaPaginaTienda.create({ data: { compradorId: u.id, tiendaId: tienda.id, ultimoMes: "2026-10", ultimoValor: 5 } });
    }
    await prisma.visitaPaginaTienda.deleteMany({ where: { compradorId: desconocido.id } });
    await guardarPreferencia(sinOptIn, { categoria: "ofertas", enApp: false, push: false, email: false });
    await prisma.visitaPaginaTienda.create({ data: { compradorId: encargado.id, tiendaId: tienda.id, ultimoMes: "2026-10", ultimoValor: 5 } });

    await actualizarProducto(dueno, producto.id, { precioOferta: 80 });
    await actualizarProducto(dueno, producto.id, { precioOferta: 70 });
    expect(await tipos(visitante)).toEqual(["oferta"]);
    expect(await tipos(sinOptIn)).toEqual([]);
    expect(await tipos(desconocido)).toEqual([]);
    expect(await tipos(encargado)).toEqual([]);
    const notif = await prisma.notificacion.findFirstOrThrow({ where: { usuarioId: visitante.id } });
    expect(notif.cuerpo).toMatch(/80/);
  });

  it("quitar la oferta no notifica", async () => {
    const visitante = await usuario("visit2");
    await prisma.visitaPaginaTienda.create({ data: { compradorId: visitante.id, tiendaId: tienda.id, ultimoMes: "2026-10", ultimoValor: 5 } });
    await guardarPreferencia(visitante, { categoria: "ofertas", enApp: true, push: false, email: false });
    await actualizarProducto(dueno, producto.id, { precioOferta: null });
    expect(await tipos(visitante)).toEqual([]);
  });
});

describe("envíos del admin", () => {
  it("segmento por tienda: dueño y equipo; por lotes; conteo previo", async () => {
    const admin = await usuario("admin", { esAdmin: true });
    const segmento = { tiendaId: tienda.id };
    expect(await contarSegmento(admin, segmento)).toBe(3);
    const envio = await crearEnvio(admin, { tipo: "aviso_interno", titulo: "Corte de luz", cuerpo: "Mañana no hay sistema de 8 a 9", segmento }, 2);
    expect(envio).toMatchObject({ total: 3, enviados: 2, estado: "enviando" });
    await procesarEnvios(2);
    const [listo] = (await listarEnvios(admin)).filter((e) => e.id === envio.id);
    expect(listo).toMatchObject({ estado: "enviado", enviados: 3 });
    for (const u of [dueno, encargado, cajero]) expect(await tipos(u)).toEqual(["aviso_interno"]);
    expect(await tipos(comprador)).toEqual([]);
    await expect(cancelarEnvio(admin, envio.id)).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
  });

  it("segmento por plan y rol; validaciones; solo admin", async () => {
    const admin = await usuario("admin2", { esAdmin: true });
    await expect(contarSegmento(dueno, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const plata = await usuario("plata", { plan: "plata" });
    expect(await contarSegmento(admin, { planes: ["plata"], roles: ["comprador"], usuarioIds: [plata.id, dueno.id] } as never)).toBe(1);
    await expect(crearEnvio(admin, { tipo: "spam" as never, titulo: "t", cuerpo: "c", segmento: {} })).rejects.toMatchObject({ code: "ENVIO_INVALIDO" });
    await expect(crearEnvio(admin, { tipo: "general", titulo: "", cuerpo: "c", segmento: {} })).rejects.toMatchObject({ code: "ENVIO_INVALIDO" });
    await expect(contarSegmento(admin, { planes: ["oro" as never] })).rejects.toMatchObject({ code: "ENVIO_INVALIDO" });
  });

  it("cancelar un envío en curso lo frena", async () => {
    const admin = await usuario("admin3", { esAdmin: true });
    const envio = await crearEnvio(admin, { tipo: "general", titulo: "Hola", cuerpo: "c", segmento: { tiendaId: tienda.id } }, 1);
    expect(await cancelarEnvio(admin, envio.id)).toMatchObject({ estado: "cancelado" });
    await procesarEnvios(10);
    expect((await listarEnvios(admin)).find((e) => e.id === envio.id)?.enviados).toBe(1);
  });
});
