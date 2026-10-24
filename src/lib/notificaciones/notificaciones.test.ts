import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { notificar } from "./notificar";
import { reemplazarCanalesParaTests, type CanalEmail, type CanalPush, type OpcionesPush } from "./canales";
import {
  listarNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
  obtenerPreferencias,
  guardarPreferencia,
  guardarSuscripcion,
  borrarSuscripcion,
} from "./notificaciones";
import { CATEGORIA_POR_TIPO, PREFERENCIA_POR_DEFECTO } from "./catalogo";
import { dentroDeFranja } from "./horario";

// 22-notificaciones.md
class PushFalso implements CanalPush {
  enviados: Array<{ endpoint: string; payload: string; opciones?: OpcionesPush }> = [];
  expirados = new Set<string>();
  habilitado() {
    return true;
  }
  async enviar(sub: { endpoint: string }, payload: string, opciones?: OpcionesPush) {
    this.enviados.push({ endpoint: sub.endpoint, payload, opciones });
    return this.expirados.has(sub.endpoint) ? ("expirada" as const) : ("ok" as const);
  }
}
class EmailFalso implements CanalEmail {
  enviados: Array<{ para: string; asunto: string; texto: string }> = [];
  constructor(private activo = true) {}
  habilitado() {
    return this.activo;
  }
  async enviar(para: string, asunto: string, texto: string) {
    this.enviados.push({ para, asunto, texto });
  }
}

describe("catálogo y franja horaria (puros)", () => {
  it("cada tipo tiene categoría; pedidos y cuenta activos por defecto, ofertas y publicidad opt-in", () => {
    expect(CATEGORIA_POR_TIPO.pedido_nuevo).toBe("pedidos");
    expect(CATEGORIA_POR_TIPO.transferencia_recibida).toBe("cuenta");
    expect(CATEGORIA_POR_TIPO.general).toBe("avisos");
    expect(CATEGORIA_POR_TIPO.oferta).toBe("ofertas");
    expect(CATEGORIA_POR_TIPO.publicidad).toBe("publicidad");
    expect(PREFERENCIA_POR_DEFECTO.pedidos).toEqual({ enApp: true, push: true, email: true });
    expect(PREFERENCIA_POR_DEFECTO.avisos).toEqual({ enApp: true, push: true, email: false });
    expect(PREFERENCIA_POR_DEFECTO.ofertas).toEqual({ enApp: false, push: false, email: false });
    expect(PREFERENCIA_POR_DEFECTO.publicidad).toEqual({ enApp: false, push: false, email: false });
  });

  it("dentroDeFranja usa la hora de San Juan (UTC-3), [inicio, fin)", () => {
    // 11:00 UTC = 08:00 San Juan
    expect(dentroDeFranja(new Date("2026-10-23T11:00:00Z"), 8, 22)).toBe(true);
    expect(dentroDeFranja(new Date("2026-10-23T10:59:00Z"), 8, 22)).toBe(false);
    // 01:00 UTC del 24 = 22:00 San Juan del 23
    expect(dentroDeFranja(new Date("2026-10-24T00:59:00Z"), 8, 22)).toBe(true);
    expect(dentroDeFranja(new Date("2026-10-24T01:00:00Z"), 8, 22)).toBe(false);
    expect(dentroDeFranja(new Date("2026-10-24T05:00:00Z"), 0, 24)).toBe(true);
  });
});

describe("notificar y centro de notificaciones", () => {
  let a: Usuario;
  let b: Usuario;
  let push: PushFalso;
  let email: EmailFalso;

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    a = await registrarUsuario({ email: `test-notif-a-${suf}@almacenia.test`, password: "password123", nombre: "A" });
    b = await registrarUsuario({ email: `test-notif-b-${suf}@almacenia.test`, password: "password123", nombre: "B" });
    push = new PushFalso();
    email = new EmailFalso();
    reemplazarCanalesParaTests({ push, email });
  });

  afterEach(async () => {
    reemplazarCanalesParaTests(null);
    await prisma.usuario.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });

  it("guarda en la app, manda push a cada suscripción y email según las preferencias por defecto", async () => {
    await guardarSuscripcion(a, { endpoint: "https://push.test/a1", keys: { p256dh: "k", auth: "x" } });
    const r = await notificar([a.id, b.id], { tipo: "pedido_nuevo", titulo: "Nuevo pedido", cuerpo: "Juan pidió 3 productos", url: "/pedidos/1" });
    expect(r.guardadas).toBe(2);
    expect(push.enviados).toHaveLength(1);
    expect(JSON.parse(push.enviados[0].payload)).toMatchObject({ title: "Nuevo pedido", body: "Juan pidió 3 productos", url: "/pedidos/1" });
    expect(email.enviados.map((e) => e.para).sort()).toEqual([a.email, b.email].sort());
    expect(await contarNoLeidas(a)).toBe(1);
  });

  it("urgencia del push por categoría: pedidos alta y corta, ofertas baja (no despiertan el teléfono)", async () => {
    await guardarSuscripcion(a, { endpoint: "https://push.test/urg", keys: { p256dh: "k", auth: "x" } });
    await guardarPreferencia(a, { categoria: "ofertas", enApp: true, push: true, email: false });
    await notificar([a.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c" });
    await notificar([a.id], { tipo: "transferencia_recibida", titulo: "t", cuerpo: "c" });
    await notificar([a.id], { tipo: "general", titulo: "t", cuerpo: "c" });
    await notificar([a.id], { tipo: "oferta", titulo: "t", cuerpo: "c" });
    expect(push.enviados.map((e) => e.opciones)).toEqual([
      { urgencia: "high", ttl: 3600 },
      { urgencia: "high", ttl: 86400 },
      { urgencia: "normal", ttl: 86400 },
      { urgencia: "low", ttl: 86400 },
    ]);
  });

  it("avisos generales no van por email por defecto; con email deshabilitado no se intenta", async () => {
    await notificar([a.id], { tipo: "general", titulo: "Hola", cuerpo: "Novedades" });
    expect(email.enviados).toHaveLength(0);
    reemplazarCanalesParaTests({ push, email: new EmailFalso(false) });
    await notificar([a.id], { tipo: "pedido_nuevo", titulo: "x", cuerpo: "y" });
    expect(await contarNoLeidas(a)).toBe(2);
  });

  it("ofertas y publicidad son opt-in; publicidad nunca a premium ni plata", async () => {
    expect((await notificar([a.id], { tipo: "oferta", titulo: "Oferta", cuerpo: "Yerba" })).guardadas).toBe(0);
    await guardarPreferencia(a, { categoria: "publicidad", enApp: true, push: true, email: false });
    await guardarPreferencia(b, { categoria: "publicidad", enApp: true, push: true, email: false });
    await prisma.usuario.update({ where: { id: b.id }, data: { plan: "premium" } });
    expect((await notificar([a.id, b.id], { tipo: "publicidad", titulo: "Promo", cuerpo: "Visitanos" })).guardadas).toBe(1);
  });

  it("solo push: la fila queda con en_app = false y no aparece en la lista ni en el contador", async () => {
    await guardarPreferencia(a, { categoria: "avisos", enApp: false, push: true, email: false });
    await guardarSuscripcion(a, { endpoint: "https://push.test/a2", keys: { p256dh: "k", auth: "x" } });
    expect((await notificar([a.id], { tipo: "general", titulo: "t", cuerpo: "c" })).guardadas).toBe(1);
    expect(push.enviados).toHaveLength(1);
    expect(await contarNoLeidas(a)).toBe(0);
    expect((await listarNotificaciones(a, {})).total).toBe(0);
  });

  it("todo apagado: no guarda nada", async () => {
    await guardarPreferencia(a, { categoria: "pedidos", enApp: false, push: false, email: false });
    expect((await notificar([a.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c" })).guardadas).toBe(0);
  });

  it("claveUnica deduplica por usuario", async () => {
    await notificar([a.id, b.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c", claveUnica: "dedupe-test" });
    const r = await notificar([a.id, b.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c", claveUnica: "dedupe-test" });
    expect(r.guardadas).toBe(0);
    expect(await contarNoLeidas(a)).toBe(1);
  });

  it("no notifica a cuentas pausadas o baneadas", async () => {
    await prisma.usuario.update({ where: { id: b.id }, data: { estadoCuenta: "pausada" } });
    expect((await notificar([a.id, b.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c" })).guardadas).toBe(1);
  });

  it("una suscripción expirada (404/410) se borra", async () => {
    await guardarSuscripcion(a, { endpoint: "https://push.test/vieja", keys: { p256dh: "k", auth: "x" } });
    push.expirados.add("https://push.test/vieja");
    await notificar([a.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c" });
    expect(await prisma.suscripcionPush.count({ where: { usuarioId: a.id } })).toBe(0);
  });

  it("un canal que tira error no rompe notificar", async () => {
    reemplazarCanalesParaTests({
      push,
      email: { habilitado: () => true, enviar: async () => Promise.reject(new Error("SMTP caído")) },
    });
    await expect(notificar([a.id], { tipo: "pedido_nuevo", titulo: "t", cuerpo: "c" })).resolves.toEqual({ guardadas: 1 });
  });

  it("listar, marcar leída (solo propias) y marcar todas", async () => {
    await notificar([a.id], { tipo: "pedido_nuevo", titulo: "uno", cuerpo: "c" });
    await notificar([a.id], { tipo: "pedido_nuevo", titulo: "dos", cuerpo: "c" });
    const lista = await listarNotificaciones(a, {});
    expect(lista.total).toBe(2);
    expect(lista.data[0].titulo).toBe("dos");
    await expect(marcarLeida(b, lista.data[0].id)).rejects.toMatchObject({ code: "NOTIFICACION_NO_ENCONTRADA" });
    await marcarLeida(a, lista.data[0].id);
    expect(await contarNoLeidas(a)).toBe(1);
    await marcarTodasLeidas(a);
    expect(await contarNoLeidas(a)).toBe(0);
  });

  it("preferencias: defaults + guardadas; categoría inválida", async () => {
    await guardarPreferencia(a, { categoria: "ofertas", enApp: true, push: false, email: false });
    const prefs = await obtenerPreferencias(a);
    expect(prefs.find((p) => p.categoria === "ofertas")).toEqual({ categoria: "ofertas", enApp: true, push: false, email: false });
    expect(prefs.find((p) => p.categoria === "pedidos")).toEqual({ categoria: "pedidos", enApp: true, push: true, email: true });
    await expect(guardarPreferencia(a, { categoria: "nada" as never, enApp: true, push: true, email: true })).rejects.toMatchObject({
      code: "CATEGORIA_INVALIDA",
    });
  });

  it("suscripciones: valida, reasigna el endpoint al usuario actual y se borra", async () => {
    await expect(guardarSuscripcion(a, { endpoint: "http://inseguro", keys: { p256dh: "k", auth: "x" } })).rejects.toMatchObject({
      code: "SUSCRIPCION_INVALIDA",
    });
    await guardarSuscripcion(a, { endpoint: "https://push.test/compartido", keys: { p256dh: "k", auth: "x" } });
    await guardarSuscripcion(b, { endpoint: "https://push.test/compartido", keys: { p256dh: "k2", auth: "x2" } });
    expect((await prisma.suscripcionPush.findUnique({ where: { endpoint: "https://push.test/compartido" } }))?.usuarioId).toBe(b.id);
    await borrarSuscripcion(b, "https://push.test/compartido");
    expect(await prisma.suscripcionPush.count({ where: { endpoint: "https://push.test/compartido" } })).toBe(0);
  });
});
