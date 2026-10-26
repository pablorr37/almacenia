import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { crearPedido, transicionarPedido } from "@/lib/pedidos/pedidos";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { PLANTILLAS, chatLibre, abrirConversacion, obtenerConversacion, enviarMensaje, listarConversaciones } from "./chat";

// 24-chat.md
const DIA = 24 * 60 * 60 * 1000;
const creados: string[] = [];
let n = 0;
async function usuario(nombre: string, extra: Record<string, unknown> = {}): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-chat-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  if (Object.keys(extra).length) await prisma.usuario.update({ where: { id: u.id }, data: extra });
  return { ...u, ...extra } as Usuario;
}

let dueno: Usuario;
let encargado: Usuario;
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
  comprador = await usuario("comp");
  tienda = await crearTienda(dueno, { nombre: "Almacén Chat", direccion: "D", lat: -31.5, lon: -68.5 });
  await agregarMiembro(dueno, tienda.id, { email: encargado.email, rol: "encargado" });
  producto = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Chat"), precio: 100, stock: 50 });
});

afterEach(async () => {
  await prisma.conversacion.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
  await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
  await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.horarioTienda.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

const vender = (cuando?: Date) =>
  crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], compradorId: comprador.id, cobrarAhora: true }).then(
    async (v) => {
      if (cuando) await prisma.venta.update({ where: { id: v.id }, data: { creadaEn: cuando } });
      return v;
    }
  );

describe("acceso al texto libre", () => {
  it("free sin compras: solo botones; las plantillas de '¿está abierta?' funcionan siempre", async () => {
    expect(await chatLibre(comprador.id, tienda.id)).toEqual({ libre: false, motivo: expect.stringMatching(/compr/i) });
    const c = await abrirConversacion(comprador, tienda.id);
    await expect(enviarMensaje(comprador, c.id, { texto: "hola" })).rejects.toMatchObject({ code: "CHAT_SOLO_BOTONES" });
    const m = await enviarMensaje(comprador, c.id, { plantilla: "abierta" });
    expect(m.texto).toBe(PLANTILLAS.abierta.texto);
    await expect(enviarMensaje(encargado, c.id, { texto: "sí" })).rejects.toMatchObject({ code: "CHAT_SOLO_BOTONES" });
    const r = await enviarMensaje(encargado, c.id, { plantilla: "si_abierta" });
    expect(r).toMatchObject({ deTienda: true, plantilla: "si_abierta" });
    await expect(enviarMensaje(comprador, c.id, { plantilla: "si_abierta" })).rejects.toMatchObject({ code: "PLANTILLA_INVALIDA" });
    await expect(enviarMensaje(comprador, c.id, { plantilla: "ajuste" as never })).rejects.toMatchObject({ code: "PLANTILLA_INVALIDA" });
  });

  it("compra hace 2 meses o menos: texto libre (con emojis); más de 2 meses: solo botones", async () => {
    const ahora = new Date();
    await vender(new Date(ahora.getTime() - 59 * DIA));
    expect((await chatLibre(comprador.id, tienda.id, ahora)).libre).toBe(true);
    const c = await abrirConversacion(comprador, tienda.id);
    const m = await enviarMensaje(comprador, c.id, { texto: "  ¿Tienen pan? 🥖😊  " }, ahora);
    expect(m.texto).toBe("¿Tienen pan? 🥖😊");
    expect((await chatLibre(comprador.id, tienda.id, new Date(ahora.getTime() + 2 * DIA))).libre).toBe(false);
  });

  it("pedido sin terminar habilita el texto; al terminarlo vuelve a solo botones (sin compra previa)", async () => {
    const p = await crearPedido(comprador, { tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    expect((await chatLibre(comprador.id, tienda.id)).libre).toBe(true);
    await transicionarPedido(comprador, p.id, "cancelar");
    expect((await chatLibre(comprador.id, tienda.id)).libre).toBe(false);
  });

  it("premium o plata (comprador o tienda): texto libre", async () => {
    await prisma.usuario.update({ where: { id: comprador.id }, data: { plan: "premium" } });
    expect((await chatLibre(comprador.id, tienda.id)).libre).toBe(true);
    await prisma.usuario.update({ where: { id: comprador.id }, data: { plan: "free" } });
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "plata" } });
    expect((await chatLibre(comprador.id, tienda.id)).libre).toBe(true);
  });

  it("validaciones: vacío, largo, tienda propia, conversación ajena", async () => {
    await prisma.usuario.update({ where: { id: comprador.id }, data: { plan: "premium" } });
    const c = await abrirConversacion(comprador, tienda.id);
    await expect(enviarMensaje(comprador, c.id, { texto: "   " })).rejects.toMatchObject({ code: "MENSAJE_INVALIDO" });
    await expect(enviarMensaje(comprador, c.id, { texto: "x".repeat(1001) })).rejects.toMatchObject({ code: "MENSAJE_INVALIDO" });
    await expect(abrirConversacion(encargado, tienda.id)).rejects.toMatchObject({ code: "CHAT_TIENDA_PROPIA" });
    const otro = await usuario("otro");
    await expect(obtenerConversacion(otro, c.id)).rejects.toMatchObject({ code: "CONVERSACION_NO_ENCONTRADA" });
    expect((await abrirConversacion(comprador, tienda.id)).id).toBe(c.id);
  });
});

describe("lectura, listados y notificaciones", () => {
  it("detalle con plantillas por rol; marca leídos; listados del comprador y de la tienda con no leídos", async () => {
    const c = await abrirConversacion(comprador, tienda.id);
    await enviarMensaje(comprador, c.id, { plantilla: "abierta" });
    const comoTienda = await listarConversaciones(dueno, tienda.id);
    expect(comoTienda[0]).toMatchObject({ id: c.id, noLeidos: 1, otraParte: { nombre: comprador.nombre } });
    const detalle = await obtenerConversacion(dueno, c.id);
    expect(detalle.plantillas.map((p) => p.clave)).toEqual(["si_abierta", "no_abierta"]);
    expect(detalle.libre).toBe(false);
    expect((await listarConversaciones(dueno, tienda.id))[0].noLeidos).toBe(0);
    const delComprador = await obtenerConversacion(comprador, c.id);
    expect(delComprador.plantillas.map((p) => p.clave)).toEqual(["abierta"]);
    expect((await listarConversaciones(comprador))[0]).toMatchObject({ id: c.id, otraParte: { nombre: "Almacén Chat" } });
  });

  it("al vendedor: notifica en horario; cerrada sin el permiso fuera de horario no notifica; con el permiso sí. Al comprador siempre", async () => {
    const c = await abrirConversacion(comprador, tienda.id);
    // Sin horarios cargados = estado desconocido → se notifica.
    await enviarMensaje(comprador, c.id, { plantilla: "abierta" });
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "mensaje_chat" } })).toBe(1);
    // Domingo 23:00 en San Juan con horario lunes a viernes: cerrada.
    await actualizarTienda(dueno, tienda.id, {
      horarios: [0, 1, 2, 3, 4, 5, 6].map((d) =>
        d === 0 || d === 6 ? { diaSemana: d, abre: null, cierra: null } : { diaSemana: d, abre: "09:00", cierra: "18:00" }
      ),
    });
    const domingoNoche = new Date("2026-10-26T02:00:00Z");
    await enviarMensaje(comprador, c.id, { plantilla: "abierta" }, domingoNoche);
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "mensaje_chat" } })).toBe(1);
    await actualizarTienda(dueno, tienda.id, { chatNotifFueraHorario: true });
    await enviarMensaje(comprador, c.id, { plantilla: "abierta" }, domingoNoche);
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "mensaje_chat" } })).toBe(2);
    await enviarMensaje(dueno, c.id, { plantilla: "no_abierta" }, domingoNoche);
    expect(await prisma.notificacion.count({ where: { usuarioId: comprador.id, tipo: "mensaje_chat" } })).toBe(1);
  });

  it("solo el propietario cambia chatNotifFueraHorario", async () => {
    await expect(actualizarTienda(encargado, tienda.id, { chatNotifFueraHorario: true })).rejects.toBeTruthy();
    expect((await actualizarTienda(dueno, tienda.id, { chatNotifFueraHorario: true })).chatNotifFueraHorario).toBe(true);
  });
});
