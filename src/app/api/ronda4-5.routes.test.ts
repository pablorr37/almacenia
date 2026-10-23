import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { GET as GET_PUNTOS } from "./gamificacion/puntos/route";
import { GET as GET_PRECIOS } from "./puntos/precios/route";
import { GET as GET_PLAN } from "./puntos/plan/route";
import { POST as POST_CANJE } from "./puntos/canjes/premium/route";
import { PUT as PUT_RENOVACION } from "./puntos/renovacion/route";
import { POST as POST_TRANSFER } from "./puntos/transferencias/route";
import { GET as GET_EQUIPO } from "./puntos/equipo/route";
import { GET as GET_ORDENES, POST as POST_ORDEN } from "./pagos/ordenes/route";
import { DELETE as DELETE_ORDEN } from "./pagos/ordenes/[id]/route";
import { GET as GET_ADMIN_PAGOS } from "./admin/pagos/route";
import { POST as POST_CONFIRMAR } from "./admin/pagos/[id]/confirmar/route";
import { GET as GET_CAMPANIAS, POST as POST_CAMPANIA } from "./tiendas/[tiendaId]/campanias/route";
import { POST as POST_ACCION_CAMPANIA } from "./campanias/[id]/[accion]/route";
import { GET as GET_ADMIN_CAMPANIAS } from "./admin/campanias/route";
import { POST as POST_MODERAR } from "./admin/campanias/[id]/moderar/route";
import { GET as GET_AVISO } from "./avisos/route";
import { POST as POST_IMPRESION } from "./avisos/impresion/route";
import { GET as GET_CLIC } from "./avisos/clic/route";
import { GET as GET_NOTIFS } from "./notificaciones/route";
import { GET as GET_NO_LEIDAS } from "./notificaciones/no-leidas/route";
import { POST as POST_LEIDA } from "./notificaciones/[id]/leida/route";
import { POST as POST_LEER_TODAS } from "./notificaciones/leer-todas/route";
import { GET as GET_PREFS, PUT as PUT_PREFS } from "./notificaciones/preferencias/route";
import { GET as GET_CLAVE } from "./push/clave/route";
import { POST as POST_SUB, DELETE as DELETE_SUB } from "./push/suscripcion/route";
import { GET as GET_ENVIOS, POST as POST_ENVIO } from "./admin/envios/route";
import { POST as POST_CONTAR } from "./admin/envios/contar/route";
import { POST as POST_CANCELAR_ENVIO } from "./admin/envios/[id]/cancelar/route";
import { POST as POST_CRON } from "./cron/tareas/route";
import { GET as GET_ADS_TXT } from "../ads.txt/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const sesion = vi.mocked(obtenerUsuarioActual);

// 21-publicidad.md, 22-notificaciones.md, 23-puntos-pagos.md: contrato HTTP.
const url = (path: string) => `http://localhost${path}`;
const req = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url(path), { method, body: body === undefined ? undefined : JSON.stringify(body), headers });
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });
const UA = { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130" };

const creados: string[] = [];
let n = 0;
async function usuario(nombre: string, extra: Record<string, unknown> = {}): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-r45-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  if (Object.keys(extra).length) await prisma.usuario.update({ where: { id: u.id }, data: extra });
  return { ...u, ...extra } as Usuario;
}

let dueno: Usuario;
let admin: Usuario;
let comprador: Usuario;
let tienda: Tienda;

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));

beforeEach(async () => {
  dueno = await usuario("dueno");
  admin = await usuario("admin", { esAdmin: true });
  comprador = await usuario("comprador");
  tienda = await crearTienda(dueno, { nombre: "Almacén Rutas", direccion: "D", lat: -31.5, lon: -68.5 });
  await prisma.eventoPuntos.create({ data: { usuarioId: dueno.id, tipo: "prueba", puntos: 2000 } });
});

afterEach(async () => {
  await prisma.envioNotificacion.deleteMany({ where: { creadoPorId: { in: creados } } });
  await prisma.campaniaAviso.deleteMany({ where: { tiendaId: tienda.id } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
  vi.clearAllMocks();
  delete process.env.CRON_TOKEN;
  delete process.env.ADS_TXT;
});

describe("puntos y pagos", () => {
  it("saldo, precios, canje premium, plan y renovación; 401 sin sesión", async () => {
    sesion.mockResolvedValue(null);
    expect((await POST_CANJE()).status).toBe(401);
    sesion.mockResolvedValue(dueno);
    expect((await (await GET_PUNTOS()).json()).data).toEqual({ total: 2000, saldo: 2000, ganados: 2000 });
    expect((await (await GET_PRECIOS()).json()).data).toMatchObject({ premiumPuntos: 1500, premiumDias: 30 });
    const canje = await POST_CANJE();
    expect(canje.status).toBe(200);
    expect((await canje.json()).data).toMatchObject({ plan: "premium", saldo: 500 });
    expect((await POST_CANJE()).status).toBe(409);
    expect((await (await PUT_RENOVACION(req("/api/puntos/renovacion", "PUT", { modo: "puntos" }))).json()).data).toEqual({ renovacionAuto: "puntos" });
    expect((await PUT_RENOVACION(req("/api/puntos/renovacion", "PUT", { modo: "x" }))).status).toBe(400);
    const plan = (await (await GET_PLAN()).json()).data;
    expect(plan).toMatchObject({ plan: "premium", renovacionAuto: "puntos", ordenPendiente: null });
    expect(plan.planVenceEn).toBeTruthy();
  });

  it("transferencias y equipo", async () => {
    sesion.mockResolvedValue(dueno);
    const r = await POST_TRANSFER(req("/api/puntos/transferencias", "POST", { tiendaId: tienda.id, aUsuarioId: comprador.id, puntos: 10 }));
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("NO_ES_DEL_EQUIPO");
    expect((await (await GET_EQUIPO(req(`/api/puntos/equipo?tiendaId=${tienda.id}`))).json()).data).toEqual([]);
  });

  it("orden de premium en pesos: crear, listar, confirmar por admin; cancelar", async () => {
    sesion.mockResolvedValue(comprador);
    const creada = await POST_ORDEN(req("/api/pagos/ordenes", "POST", { concepto: "premium" }));
    expect(creada.status).toBe(201);
    const { orden, instrucciones } = (await creada.json()).data;
    expect(instrucciones).toContain(orden.codigo);
    expect((await POST_ORDEN(req("/api/pagos/ordenes", "POST", { concepto: "premium" }))).status).toBe(409);
    expect((await POST_ORDEN(req("/api/pagos/ordenes", "POST", { concepto: "publicidad" }))).status).toBe(400);
    expect((await (await GET_ORDENES()).json()).data).toHaveLength(1);
    expect((await POST_CONFIRMAR(req("/x", "POST"), p({ id: orden.id }))).status).toBe(403);
    sesion.mockResolvedValue(admin);
    const lista = (await (await GET_ADMIN_PAGOS(req("/api/admin/pagos?estado=pendiente&pageSize=100"))).json());
    expect(lista.data.some((o: { id: string }) => o.id === orden.id)).toBe(true);
    expect((await POST_CONFIRMAR(req("/x", "POST"), p({ id: orden.id }))).status).toBe(200);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: comprador.id } })).plan).toBe("premium");
    sesion.mockResolvedValue(comprador);
    expect((await DELETE_ORDEN(req("/x", "DELETE"), p({ id: orden.id }))).status).toBe(409);
  });
});

describe("publicidad", () => {
  it("crear campaña (multipart), moderar, ver el aviso, impresión y clic", async () => {
    sesion.mockResolvedValue(dueno);
    const form = new FormData();
    form.set("espacio", "inicio");
    form.set("titulo", "Promo");
    form.set("desde", new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(new Date()));
    form.set("dias", "2");
    form.set("pago", "puntos");
    form.set("texto", "Pan caliente todo el día");
    const creada = await POST_CAMPANIA(new NextRequest(url(`/api/tiendas/${tienda.id}/campanias`), { method: "POST", body: form }), p({ tiendaId: tienda.id }));
    expect(creada.status).toBe(201);
    const { campania } = (await creada.json()).data;
    expect(campania).toMatchObject({ estado: "en_moderacion", puntosPagados: 200 });
    expect((await (await GET_CAMPANIAS(req("/x"), p({ tiendaId: tienda.id }))).json()).data).toHaveLength(1);

    expect((await POST_MODERAR(req("/x", "POST", { aprobar: true }), p({ id: campania.id }))).status).toBe(403);
    sesion.mockResolvedValue(admin);
    expect((await (await GET_ADMIN_CAMPANIAS(req("/api/admin/campanias?estado=en_moderacion&pageSize=100"))).json()).data.some(
      (c: { id: string }) => c.id === campania.id
    )).toBe(true);
    expect((await POST_MODERAR(req("/x", "POST", { aprobar: true }), p({ id: campania.id }))).status).toBe(200);

    sesion.mockResolvedValue(comprador);
    const aviso = (await (await GET_AVISO(req("/api/avisos?espacio=inicio"))).json()).data;
    expect(aviso).toMatchObject({ campaniaId: campania.id, texto: "Pan caliente todo el día" });
    expect((await GET_AVISO(req("/api/avisos?espacio=techo"))).status).toBe(400);
    expect((await POST_IMPRESION(new NextRequest(url("/api/avisos/impresion"), { method: "POST", body: aviso.token, headers: UA }))).status).toBe(204);
    const clic = await GET_CLIC(req(`/api/avisos/clic?token=${encodeURIComponent(aviso.token)}`, "GET", undefined, UA));
    expect(clic.status).toBe(302);
    expect(clic.headers.get("location")).toBe(url(`/tiendas/${tienda.id}`));
    expect(await prisma.eventoAviso.count({ where: { campaniaId: campania.id } })).toBe(2);

    sesion.mockResolvedValue(dueno);
    expect((await POST_ACCION_CAMPANIA(req("/x", "POST"), p({ id: campania.id, accion: "pausar" }))).status).toBe(200);
    expect((await POST_ACCION_CAMPANIA(req("/x", "POST"), p({ id: campania.id, accion: "volar" }))).status).toBe(404);
    expect((await POST_ACCION_CAMPANIA(req("/x", "POST"), p({ id: campania.id, accion: "finalizar" }))).status).toBe(200);
  });

  it("aviso para invitado; ads.txt desde ADS_TXT", async () => {
    sesion.mockResolvedValue(null);
    expect((await (await GET_AVISO(req("/api/avisos?espacio=lista"))).json()).data).toBeNull();
    expect((await GET_ADS_TXT()).status).toBe(404);
    process.env.ADS_TXT = "google.com, pub-1, DIRECT, f08c47fec0942fa0\\nexample.com, 2, RESELLER";
    const ads = await GET_ADS_TXT();
    expect(ads.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await ads.text()).toBe("google.com, pub-1, DIRECT, f08c47fec0942fa0\nexample.com, 2, RESELLER\n");
  });
});

describe("notificaciones", () => {
  it("lista, contador, leída, leer todas, preferencias y suscripción push", async () => {
    await prisma.notificacion.createMany({
      data: [
        { usuarioId: comprador.id, tipo: "general", titulo: "Uno", cuerpo: "c" },
        { usuarioId: comprador.id, tipo: "general", titulo: "Dos", cuerpo: "c" },
      ],
    });
    sesion.mockResolvedValue(null);
    expect((await GET_NO_LEIDAS()).status).toBe(401);
    sesion.mockResolvedValue(comprador);
    expect((await (await GET_NO_LEIDAS()).json()).data).toEqual({ cantidad: 2 });
    const lista = await (await GET_NOTIFS(req("/api/notificaciones?page=1"))).json();
    expect(lista.total).toBe(2);
    expect((await POST_LEIDA(req("/x", "POST"), p({ id: lista.data[0].id }))).status).toBe(204);
    expect((await POST_LEIDA(req("/x", "POST"), p({ id: "00000000-0000-0000-0000-000000000000" }))).status).toBe(404);
    expect((await POST_LEER_TODAS()).status).toBe(204);
    expect((await (await GET_NO_LEIDAS()).json()).data).toEqual({ cantidad: 0 });

    expect((await (await GET_PREFS()).json()).data).toHaveLength(5);
    expect((await PUT_PREFS(req("/x", "PUT", { categoria: "ofertas", enApp: true, push: true, email: false }))).status).toBe(200);
    expect((await PUT_PREFS(req("/x", "PUT", { categoria: "nada", enApp: true, push: true, email: false }))).status).toBe(400);

    expect((await (await GET_CLAVE()).json()).data).toHaveProperty("clavePublica");
    const sub = { endpoint: "https://push.test/r45", keys: { p256dh: "k", auth: "a" } };
    expect((await POST_SUB(req("/x", "POST", sub))).status).toBe(204);
    expect((await POST_SUB(req("/x", "POST", { endpoint: "nope" }))).status).toBe(400);
    expect((await DELETE_SUB(req("/x", "DELETE", { endpoint: sub.endpoint }))).status).toBe(204);
  });

  it("envíos del admin", async () => {
    sesion.mockResolvedValue(dueno);
    expect((await GET_ENVIOS()).status).toBe(403);
    sesion.mockResolvedValue(admin);
    const seg = { tiendaId: tienda.id };
    expect((await (await POST_CONTAR(req("/x", "POST", { segmento: seg }))).json()).data).toEqual({ cantidad: 1 });
    const envio = await POST_ENVIO(req("/x", "POST", { tipo: "general", titulo: "Hola", cuerpo: "Novedades", segmento: seg }));
    expect(envio.status).toBe(201);
    const { id } = (await envio.json()).data;
    expect((await POST_CANCELAR_ENVIO(req("/x", "POST"), p({ id }))).status).toBe(409);
    expect((await (await GET_ENVIOS()).json()).data.some((e: { id: string }) => e.id === id)).toBe(true);
  });
});

describe("tareas programadas", () => {
  it("POST /api/cron/tareas: 503 sin CRON_TOKEN, 401 con token incorrecto, 200 con el bueno", async () => {
    expect((await POST_CRON(req("/api/cron/tareas", "POST"))).status).toBe(503);
    process.env.CRON_TOKEN = "secreto-de-prueba";
    expect((await POST_CRON(req("/api/cron/tareas", "POST", undefined, { authorization: "Bearer otro" }))).status).toBe(401);
    const ok = await POST_CRON(req("/api/cron/tareas", "POST", undefined, { authorization: "Bearer secreto-de-prueba" }));
    expect(ok.status).toBe(200);
    expect(Object.keys((await ok.json()).data).sort()).toEqual(["campanias", "envios", "planes", "publicidadPush"]);
  });
});
