import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { POST as POST_PEDIDO } from "./pedidos/route";
import { GET as GET_PEDIDO } from "./pedidos/[id]/route";
import { POST as POST_TRANSICION } from "./pedidos/[id]/transicion/route";
import { POST as POST_AJUSTE } from "./pedidos/[id]/items/[itemId]/ajuste/route";
import { GET as GET_CONVS, POST as POST_CONV } from "./chat/conversaciones/route";
import { GET as GET_CONV } from "./chat/conversaciones/[id]/route";
import { POST as POST_MSG } from "./chat/conversaciones/[id]/mensajes/route";
import { GET as GET_PAUSA, PUT as PUT_PAUSA } from "./notificaciones/pausa/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const sesion = vi.mocked(obtenerUsuarioActual);

// Ronda 6: contrato HTTP de ubicación, ajustes de peso, chat y pausa.
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

let dueno: Usuario;
let comprador: Usuario;
let tienda: Tienda;
const creados: string[] = [];

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));

beforeEach(async () => {
  const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  dueno = await registrarUsuario({ email: `test-r6-d-${suf}@almacenia.test`, password: "password123", nombre: "Dueña" });
  comprador = await registrarUsuario({ email: `test-r6-c-${suf}@almacenia.test`, password: "password123", nombre: "Comprador R6" });
  creados.push(dueno.id, comprador.id);
  tienda = await crearTienda(dueno, { nombre: "Fiambrería R6", direccion: "D", lat: -31.5375, lon: -68.5364 });
});

afterEach(async () => {
  await prisma.conversacion.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
  await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
  vi.clearAllMocks();
});

it("pedido con ubicación, ajuste de peso por la API y chat con plantillas y texto", async () => {
  const queso = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Queso R6", { unidad: "kg" }), precio: 10000, stock: 5 });
  sesion.mockResolvedValue(comprador);
  const creado = await POST_PEDIDO(req("/api/pedidos", "POST", { tiendaId: tienda.id, items: [{ productoId: queso.id, cantidad: 0.25 }], ubicacion: { lat: -31.54, lon: -68.53 } }));
  expect(creado.status).toBe(201);
  const pedido = (await creado.json()).data;
  sesion.mockResolvedValue(dueno);
  const visto = (await (await GET_PEDIDO(req("/x"), p({ id: pedido.id }))).json()).data;
  expect(visto.ubicacionComprador).toEqual({ lat: -31.54, lon: -68.53 });
  expect(visto.distanciaKm).toBeGreaterThan(0);
  await POST_TRANSICION(req("/x", "POST", { accion: "confirmar" }), p({ id: pedido.id }));
  const itemId = pedido.items[0].id;
  const prop = await POST_AJUSTE(req("/x", "POST", { accion: "proponer", importe: 2570 }), p({ id: pedido.id, itemId }));
  expect((await prop.json()).data.items[0]).toMatchObject({ ajusteEstado: "propuesto", cantidadPropuesta: 0.257 });
  expect((await POST_TRANSICION(req("/x", "POST", { accion: "marcarListo" }), p({ id: pedido.id }))).status).toBe(409);
  sesion.mockResolvedValue(comprador);
  expect((await POST_AJUSTE(req("/x", "POST", { accion: "aceptar" }), p({ id: pedido.id, itemId }))).status).toBe(200);

  // Chat: la conversación ya tiene los mensajes del ajuste; con el pedido abierto, texto libre.
  const conv = (await (await POST_CONV(req("/x", "POST", { tiendaId: tienda.id }))).json()).data;
  const detalle = (await (await GET_CONV(req("/x"), p({ id: conv.id }))).json()).data;
  expect(detalle).toMatchObject({ lado: "comprador", libre: true });
  expect(detalle.mensajes.map((m: { plantilla: string }) => m.plantilla)).toEqual(["ajuste", "ajuste"]);
  expect((await POST_MSG(req("/x", "POST", { texto: "¡Gracias! 👌" }), p({ id: conv.id }))).status).toBe(201);
  expect((await POST_MSG(req("/x", "POST", { plantilla: "no_abierta" }), p({ id: conv.id }))).status).toBe(400);
  expect((await (await GET_CONVS(req("/api/chat/conversaciones"))).json()).data).toHaveLength(1);
  sesion.mockResolvedValue(dueno);
  expect((await (await GET_CONVS(req(`/api/chat/conversaciones?tiendaId=${tienda.id}`))).json()).data[0].noLeidos).toBeGreaterThan(0);
});

it("pausa de notificaciones", async () => {
  sesion.mockResolvedValue(comprador);
  const hasta = new Date(Date.now() + 3600_000).toISOString();
  expect((await (await PUT_PAUSA(req("/x", "PUT", { hasta }))).json()).data).toMatchObject({ pausada: true });
  expect((await (await GET_PAUSA()).json()).data.pausada).toBe(true);
  expect((await (await PUT_PAUSA(req("/x", "PUT", { hasta: null }))).json()).data).toEqual({ pausada: false, pausadasHasta: null });
  expect((await PUT_PAUSA(req("/x", "PUT", { hasta: "2000-01-01T00:00:00Z" }))).status).toBe(400);
  sesion.mockResolvedValue(null);
  expect((await GET_PAUSA()).status).toBe(401);
});
