import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { crearOrdenPremium, listarMisOrdenes, cancelarOrden, listarOrdenesAdmin, confirmarOrdenManual } from "./ordenes";
import { PagoManual, codigoOrden } from "./procesador";

// 23-puntos-pagos.md: pagos en pesos con el adaptador manual.
const creados: string[] = [];
let n = 0;
async function usuario(nombre: string, extra: Record<string, unknown> = {}): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-pagos-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  if (Object.keys(extra).length) await prisma.usuario.update({ where: { id: u.id }, data: extra });
  return { ...u, ...extra } as Usuario;
}

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));
afterEach(async () => {
  await prisma.configuracionSistema.deleteMany({});
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

describe("PagoManual", () => {
  it("da instrucciones con el monto y el código de la orden", async () => {
    const id = "abcdef12-3456-7890-abcd-ef1234567890";
    const r = await new PagoManual().iniciar({ id, montoArs: 3000, concepto: "premium" });
    expect(codigoOrden(id)).toBe("ABCDEF12");
    expect(r.urlPago).toBeNull();
    expect(r.instrucciones).toContain("ABCDEF12");
    expect(r.instrucciones).toMatch(/3\.000/);
  });
});

describe("órdenes de premium", () => {
  it("crea la orden con el precio del admin; una pendiente a la vez", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "precio.premium_ars", valor: 4500 } });
    const u = await usuario("compra");
    const r = await crearOrdenPremium(u);
    expect(r.orden).toMatchObject({ concepto: "premium", montoArs: 4500, estado: "pendiente", proveedor: "manual", detalle: { dias: 30 } });
    expect(r.instrucciones).toContain(r.orden.codigo);
    await expect(crearOrdenPremium(u)).rejects.toMatchObject({ code: "ORDEN_PENDIENTE_EXISTE" });
    expect(await listarMisOrdenes(u)).toHaveLength(1);
  });

  it("plata o premium manual no pueden comprar premium", async () => {
    await expect(crearOrdenPremium(await usuario("plata", { plan: "plata" }))).rejects.toMatchObject({ code: "PLAN_YA_SUPERIOR" });
    await expect(crearOrdenPremium(await usuario("manual", { plan: "premium" }))).rejects.toMatchObject({ code: "PLAN_SIN_VENCIMIENTO" });
  });

  it("el admin confirma: pasa a pagada y activa premium por los días de la orden; no se confirma dos veces", async () => {
    const admin = await usuario("admin", { esAdmin: true });
    const u = await usuario("paga");
    const { orden } = await crearOrdenPremium(u);
    const ahora = new Date("2026-10-23T12:00:00Z");
    const pagada = await confirmarOrdenManual(admin, orden.id, ahora);
    expect(pagada).toMatchObject({ estado: "pagada" });
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(fila.plan).toBe("premium");
    expect(fila.planVenceEn?.getTime()).toBe(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(await prisma.notificacion.count({ where: { usuarioId: u.id, tipo: "pago_confirmado" } })).toBe(1);
    await expect(confirmarOrdenManual(admin, orden.id)).rejects.toMatchObject({ code: "ORDEN_NO_PENDIENTE" });
    await expect(confirmarOrdenManual(u, orden.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancelar: solo la propia (o admin) y solo pendiente", async () => {
    const u = await usuario("cancela");
    const otro = await usuario("otro");
    const { orden } = await crearOrdenPremium(u);
    await expect(cancelarOrden(otro, orden.id)).rejects.toMatchObject({ code: "ORDEN_NO_ENCONTRADA" });
    expect(await cancelarOrden(u, orden.id)).toMatchObject({ estado: "cancelada" });
    await expect(cancelarOrden(u, orden.id)).rejects.toMatchObject({ code: "ORDEN_NO_PENDIENTE" });
  });

  it("listado del admin filtra por estado e incluye al usuario", async () => {
    const admin = await usuario("admin2", { esAdmin: true });
    const u = await usuario("listado");
    const { orden } = await crearOrdenPremium(u);
    const r = await listarOrdenesAdmin(admin, { estado: "pendiente", pageSize: 100 });
    expect(r.data.find((o) => o.id === orden.id)?.usuario).toMatchObject({ id: u.id, email: u.email });
    await expect(listarOrdenesAdmin(admin, { estado: "rara" as never })).rejects.toMatchObject({ code: "ESTADO_INVALIDO" });
  });
});
