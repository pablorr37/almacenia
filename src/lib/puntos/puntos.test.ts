import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { saldoPuntos, puntosGanados } from "@/lib/gamificacion/gamificacion";
import { cambiarPlanUsuario } from "@/lib/admin/usuarios";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { canjearPremium, configurarRenovacion, vencerPlanes } from "./canjes";
import { transferirPuntos, equipoParaTransferir } from "./transferencias";
import { preciosVigentes } from "./precios";

// 23-puntos-pagos.md
const DIA = 24 * 60 * 60 * 1000;
const sinCanales = { habilitado: () => false, enviar: async () => "ok" as const };

const creados: string[] = [];
let n = 0;
async function usuario(nombre: string): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-puntos-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  return u;
}
async function darPuntos(u: Usuario, puntos: number) {
  await prisma.eventoPuntos.create({ data: { usuarioId: u.id, tipo: "prueba", puntos } });
}
const leer = (u: Usuario) => prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });

beforeAll(() => reemplazarCanalesParaTests({ push: sinCanales, email: { habilitado: () => false, enviar: async () => {} } }));
afterAll(() => reemplazarCanalesParaTests(null));
afterEach(async () => {
  await prisma.configuracionSistema.deleteMany({});
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

describe("precios vigentes", () => {
  it("salen de la configuración del admin", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "canje.premium_puntos", valor: 900 } });
    const p = await preciosVigentes();
    expect(p).toMatchObject({ premiumPuntos: 900, premiumDias: 30, premiumArs: 3000, transferenciaMax: 500, transferenciaMesMax: 2000 });
    expect(p.publicidad.inicio).toEqual({ puntos: 100, ars: 1000, unidad: "dia" });
    expect(p.publicidad.pin_mapa).toEqual({ puntos: 50, ars: 500, unidad: "dia" });
    expect(p.publicidad.push).toEqual({ puntos: 300, ars: 3000, unidad: "envio" });
  });
});

describe("canjearPremium", () => {
  it("free con saldo: pasa a premium 30 días, también sus tiendas; el radio no baja", async () => {
    const u = await usuario("canje");
    const tienda = await crearTienda(u, { nombre: "Tienda Canje", direccion: "D", lat: -31.5, lon: -68.5 });
    await darPuntos(u, 1600);
    const ahora = new Date("2026-10-23T12:00:00Z");
    const r = await canjearPremium(u, ahora);
    expect(r).toMatchObject({ plan: "premium", saldo: 100 });
    expect(new Date(r.planVenceEn).getTime()).toBe(ahora.getTime() + 30 * DIA);
    expect((await prisma.tienda.findUniqueOrThrow({ where: { id: tienda.id } })).plan).toBe("premium");
    expect(await puntosGanados(u.id)).toBe(1600);
    const ev = await prisma.eventoPuntos.findFirstOrThrow({ where: { usuarioId: u.id, tipo: "canje_premium" } });
    expect(Number(ev.puntos)).toBe(-1500);
  });

  it("premium con vencimiento: extiende desde el vencimiento actual", async () => {
    const u = await usuario("extiende");
    await darPuntos(u, 3000);
    const ahora = new Date("2026-10-23T12:00:00Z");
    const r1 = await canjearPremium(u, ahora);
    const r2 = await canjearPremium(u, new Date(ahora.getTime() + DIA));
    expect(new Date(r2.planVenceEn).getTime()).toBe(new Date(r1.planVenceEn).getTime() + 30 * DIA);
    expect(await saldoPuntos(u.id)).toBe(0);
  });

  it("PUNTOS_INSUFICIENTES sin saldo, y no cambia nada", async () => {
    const u = await usuario("pobre");
    await darPuntos(u, 1499.9);
    await expect(canjearPremium(u)).rejects.toMatchObject({ code: "PUNTOS_INSUFICIENTES" });
    expect((await leer(u)).plan).toBe("free");
    expect(await saldoPuntos(u.id)).toBe(1499.9);
  });

  it("dos canjes simultáneos no gastan dos veces el mismo saldo", async () => {
    const u = await usuario("carrera");
    await darPuntos(u, 1500);
    const r = await Promise.allSettled([canjearPremium(u), canjearPremium(u)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldoPuntos(u.id)).toBe(0);
  });

  it("plata → PLAN_YA_SUPERIOR; premium manual → PLAN_SIN_VENCIMIENTO", async () => {
    const plata = await usuario("plata");
    await prisma.usuario.update({ where: { id: plata.id }, data: { plan: "plata" } });
    await darPuntos(plata, 5000);
    await expect(canjearPremium(plata)).rejects.toMatchObject({ code: "PLAN_YA_SUPERIOR" });
    const manual = await usuario("manual");
    await prisma.usuario.update({ where: { id: manual.id }, data: { plan: "premium" } });
    await darPuntos(manual, 5000);
    await expect(canjearPremium(manual)).rejects.toMatchObject({ code: "PLAN_SIN_VENCIMIENTO" });
  });

  it("el admin asignando el plan a mano lo deja sin vencimiento", async () => {
    const admin = await usuario("admin");
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    const u = await usuario("asignado");
    await darPuntos(u, 1500);
    await canjearPremium(u);
    await cambiarPlanUsuario({ ...admin, esAdmin: true }, u.id, "premium");
    expect((await leer(u)).planVenceEn).toBeNull();
  });
});

describe("renovación y vencimiento (vencerPlanes)", () => {
  const ahora = new Date("2026-11-30T12:00:00Z");
  async function premiumQueVence(nombre: string, venceEn: Date, renovacionAuto: "ninguna" | "puntos" | "pesos") {
    const u = await usuario(nombre);
    await prisma.usuario.update({ where: { id: u.id }, data: { plan: "premium", planVenceEn: venceEn, renovacionAuto } });
    await crearTienda(u, { nombre: `T ${nombre}`, direccion: "D", lat: -31.5, lon: -68.5 });
    await prisma.tienda.updateMany({ where: { vendedorId: u.id }, data: { plan: "premium" } });
    return u;
  }

  it("configurarRenovacion valida el modo", async () => {
    const u = await usuario("modo");
    await expect(configurarRenovacion(u, "pesos")).resolves.toEqual({ renovacionAuto: "pesos" });
    await expect(configurarRenovacion(u, "tarjeta" as never)).rejects.toMatchObject({ code: "RENOVACION_INVALIDA" });
  });

  it("sin renovación: vuelve a free (también las tiendas) y se notifica", async () => {
    const u = await premiumQueVence("vence", new Date(ahora.getTime() - 1000), "ninguna");
    const r = await vencerPlanes(ahora);
    expect(r.vencidos).toBeGreaterThanOrEqual(1);
    expect(await leer(u)).toMatchObject({ plan: "free", planVenceEn: null });
    expect((await prisma.tienda.findFirstOrThrow({ where: { vendedorId: u.id } })).plan).toBe("free");
    expect(await prisma.notificacion.count({ where: { usuarioId: u.id, tipo: "plan_vencido" } })).toBe(1);
    // idempotente
    await vencerPlanes(ahora);
    expect(await prisma.notificacion.count({ where: { usuarioId: u.id, tipo: "plan_vencido" } })).toBe(1);
  });

  it("renovación por puntos con saldo: canjea y extiende desde el vencimiento", async () => {
    const vence = new Date(ahora.getTime() - 1000);
    const u = await premiumQueVence("renueva", vence, "puntos");
    await darPuntos(u, 2000);
    await vencerPlanes(ahora);
    const fila = await leer(u);
    expect(fila.plan).toBe("premium");
    expect(fila.planVenceEn?.getTime()).toBe(vence.getTime() + 30 * DIA);
    expect(await saldoPuntos(u.id)).toBe(500);
    expect(await prisma.notificacion.count({ where: { usuarioId: u.id, tipo: "plan_renovado" } })).toBe(1);
  });

  it("renovación por puntos sin saldo: vence", async () => {
    const u = await premiumQueVence("sinsaldo", new Date(ahora.getTime() - 1000), "puntos");
    await darPuntos(u, 10);
    await vencerPlanes(ahora);
    expect((await leer(u)).plan).toBe("free");
  });

  it("renovación por pesos: crea la orden, mantiene el plan durante la gracia y después vence", async () => {
    const vence = new Date(ahora.getTime() - 1000);
    const u = await premiumQueVence("pesos", vence, "pesos");
    const r = await vencerPlanes(ahora);
    expect(r.enGracia).toBeGreaterThanOrEqual(1);
    expect((await leer(u)).plan).toBe("premium");
    const orden = await prisma.ordenPago.findFirstOrThrow({ where: { usuarioId: u.id } });
    expect(orden).toMatchObject({ concepto: "premium", estado: "pendiente" });
    expect(Number(orden.montoArs)).toBe(3000);
    await vencerPlanes(new Date(ahora.getTime() + DIA));
    expect(await prisma.ordenPago.count({ where: { usuarioId: u.id } })).toBe(1);
    await vencerPlanes(new Date(vence.getTime() + 3 * DIA + 1000));
    expect((await leer(u)).plan).toBe("free");
    expect((await prisma.ordenPago.findUniqueOrThrow({ where: { id: orden.id } })).estado).toBe("vencida");
  });

  it("avisa una sola vez cuando faltan 3 días o menos", async () => {
    const u = await premiumQueVence("aviso", new Date(ahora.getTime() + 2 * DIA), "ninguna");
    await vencerPlanes(ahora);
    await vencerPlanes(new Date(ahora.getTime() + 60 * 60 * 1000));
    expect(await prisma.notificacion.count({ where: { usuarioId: u.id, tipo: "plan_por_vencer" } })).toBe(1);
    expect((await leer(u)).plan).toBe("premium");
  });
});

describe("transferencias en el equipo", () => {
  let dueno: Usuario;
  let emp: Usuario;
  let ajeno: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    dueno = await usuario("dueno");
    emp = await usuario("emp");
    ajeno = await usuario("ajeno");
    tienda = await crearTienda(dueno, { nombre: "Tienda Transfer", direccion: "D", lat: -31.5, lon: -68.5 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });
  });

  it("un empleado le transfiere al dueño: eventos con contraparte, notificación, y no cuenta como ganado", async () => {
    await darPuntos(emp, 100);
    expect(await transferirPuntos(emp, { tiendaId: tienda.id, aUsuarioId: dueno.id, puntos: 40.5 })).toEqual({ saldo: 59.5 });
    expect(await saldoPuntos(dueno.id)).toBe(40.5);
    expect(await puntosGanados(dueno.id)).toBe(0);
    const recibido = await prisma.eventoPuntos.findFirstOrThrow({ where: { usuarioId: dueno.id, tipo: "transferencia_recibida" } });
    expect(recibido).toMatchObject({ tiendaId: tienda.id, contraparteUsuarioId: emp.id });
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "transferencia_recibida" } })).toBe(1);
  });

  it("equipoParaTransferir lista al resto del equipo", async () => {
    expect((await equipoParaTransferir(emp, tienda.id)).map((p) => p.id)).toEqual([dueno.id]);
    await expect(equipoParaTransferir(ajeno, tienda.id)).rejects.toMatchObject({ code: "NO_ES_DEL_EQUIPO" });
  });

  it("valida equipo, a uno mismo, puntos, topes y saldo", async () => {
    await darPuntos(dueno, 5000);
    await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: ajeno.id, puntos: 1 })).rejects.toMatchObject({ code: "NO_ES_DEL_EQUIPO" });
    await expect(transferirPuntos(ajeno, { tiendaId: tienda.id, aUsuarioId: dueno.id, puntos: 1 })).rejects.toMatchObject({ code: "NO_ES_DEL_EQUIPO" });
    await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: dueno.id, puntos: 1 })).rejects.toMatchObject({ code: "ACCION_SOBRE_SI_MISMO" });
    for (const puntos of [0, -1, 1.25, NaN]) {
      await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: emp.id, puntos })).rejects.toMatchObject({ code: "PUNTOS_INVALIDOS" });
    }
    await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: emp.id, puntos: 501 })).rejects.toMatchObject({ code: "TOPE_TRANSFERENCIA" });
    await expect(transferirPuntos(emp, { tiendaId: tienda.id, aUsuarioId: dueno.id, puntos: 1 })).rejects.toMatchObject({ code: "PUNTOS_INSUFICIENTES" });
  });

  it("tope mensual configurable", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "puntos.transferencia_mes_max", valor: 600 } });
    await darPuntos(dueno, 5000);
    const ahora = new Date("2026-10-23T12:00:00Z");
    await transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: emp.id, puntos: 500 }, ahora);
    await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: emp.id, puntos: 101 }, ahora)).rejects.toMatchObject({
      code: "TOPE_TRANSFERENCIA_MES",
    });
    await expect(transferirPuntos(dueno, { tiendaId: tienda.id, aUsuarioId: emp.id, puntos: 100 }, ahora)).resolves.toBeTruthy();
  });
});
