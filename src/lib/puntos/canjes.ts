import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerConfig } from "@/lib/config/config";
import { sinRomper } from "@/lib/gamificacion/gamificacion";
import { notificar } from "@/lib/notificaciones/notificar";
import { crearOrdenPago } from "@/lib/pagos/ordenes";
import type { Plan, Prisma, RenovacionAuto } from "@/generated-prisma/client";
import { gastarPuntos } from "./saldo-tx";

// Premium con puntos, renovación y vencimiento del plan (23-puntos-pagos.md).

export { gastarPuntos } from "./saldo-tx";

const DIA_MS = 24 * 60 * 60 * 1000;
const MODOS: RenovacionAuto[] = ["ninguna", "puntos", "pesos"];

function fechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString("es-AR", { timeZone: "America/Argentina/San_Juan", day: "numeric", month: "long" });
}

// Extiende (o activa) el premium por `dias`, también en sus tiendas. Un premium que
// ya tiene vencimiento se extiende desde ese vencimiento.
export async function extenderPremium(tx: Prisma.TransactionClient, usuarioId: string, dias: number, ahora: Date): Promise<Date> {
  const u = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { plan: true, planVenceEn: true } });
  if (u.plan === "plata") throw new AppError("PLAN_YA_SUPERIOR", "Ya tenés el plan plata, que incluye todo lo de premium.");
  if (u.plan === "premium" && !u.planVenceEn) {
    throw new AppError("PLAN_SIN_VENCIMIENTO", "Tu plan premium no vence: no hace falta renovarlo.");
  }
  const desde = u.plan === "premium" && u.planVenceEn ? u.planVenceEn : ahora;
  const venceEn = new Date(desde.getTime() + dias * DIA_MS);
  await tx.usuario.update({ where: { id: usuarioId }, data: { plan: "premium", planVenceEn: venceEn } });
  await tx.tienda.updateMany({ where: { vendedorId: usuarioId }, data: { plan: "premium" } });
  return venceEn;
}

export async function canjearPremium(
  usuario: Usuario,
  ahora = new Date()
): Promise<{ plan: Plan; planVenceEn: string; saldo: number }> {
  const [precio, dias] = await Promise.all([obtenerConfig("canje.premium_puntos"), obtenerConfig("canje.premium_dias")]);
  return prisma.$transaction(async (tx) => {
    const { saldo } = await gastarPuntos(tx, usuario.id, "canje_premium", precio, { metadata: { dias } });
    const venceEn = await extenderPremium(tx, usuario.id, dias, ahora);
    return { plan: "premium" as Plan, planVenceEn: venceEn.toISOString(), saldo };
  });
}

export async function configurarRenovacion(usuario: Usuario, modo: RenovacionAuto): Promise<{ renovacionAuto: RenovacionAuto }> {
  if (!MODOS.includes(modo)) {
    throw new AppError("RENOVACION_INVALIDA", "La renovación tiene que ser ninguna, puntos o pesos.");
  }
  await prisma.usuario.update({ where: { id: usuario.id }, data: { renovacionAuto: modo } });
  return { renovacionAuto: modo };
}

async function bajarAFree(usuarioId: string): Promise<void> {
  await prisma.$transaction([
    prisma.usuario.update({ where: { id: usuarioId }, data: { plan: "free", planVenceEn: null } }),
    prisma.tienda.updateMany({ where: { vendedorId: usuarioId }, data: { plan: "free" } }),
  ]);
  await sinRomper(() =>
    notificar([usuarioId], {
      tipo: "plan_vencido",
      titulo: "Tu plan premium venció",
      cuerpo: "Volviste al plan free. Podés renovarlo con puntos o en pesos desde Mis puntos.",
      url: "/perfil/puntos",
    })
  );
}

export async function vencerPlanes(
  ahora = new Date()
): Promise<{ renovados: number; vencidos: number; enGracia: number; avisados: number }> {
  const resultado = { renovados: 0, vencidos: 0, enGracia: 0, avisados: 0 };
  const [precio, dias, gracia] = await Promise.all([
    obtenerConfig("canje.premium_puntos"),
    obtenerConfig("canje.premium_dias"),
    obtenerConfig("pagos.gracia_dias"),
  ]);

  // Aviso previo, uno por vencimiento.
  const porVencer = await prisma.usuario.findMany({
    where: { plan: "premium", planVenceEn: { gt: ahora, lte: new Date(ahora.getTime() + 3 * DIA_MS) } },
    select: { id: true, planVenceEn: true, renovacionAuto: true },
  });
  for (const u of porVencer) {
    const cuerpo =
      u.renovacionAuto === "puntos"
        ? `Se renueva solo con ${precio} puntos si te alcanzan.`
        : u.renovacionAuto === "pesos"
          ? "Se renueva en pesos: vas a recibir la orden de pago."
          : "Renovalo desde Mis puntos para no perder los beneficios.";
    await sinRomper(async () => {
      const r = await notificar([u.id], {
        tipo: "plan_por_vencer",
        titulo: `Tu premium vence el ${fechaCorta(u.planVenceEn!)}`,
        cuerpo,
        url: "/perfil/puntos",
        claveUnica: `plan_por_vencer:${u.planVenceEn!.toISOString()}`,
      });
      resultado.avisados += r.guardadas;
    });
  }

  const vencidos = await prisma.usuario.findMany({
    where: { planVenceEn: { lte: ahora } },
    select: { id: true, plan: true, planVenceEn: true, renovacionAuto: true },
  });
  for (const u of vencidos) {
    if (u.plan !== "premium") {
      await prisma.usuario.update({ where: { id: u.id }, data: { planVenceEn: null } });
      continue;
    }
    if (u.renovacionAuto === "puntos") {
      try {
        const venceEn = await prisma.$transaction(async (tx) => {
          await gastarPuntos(tx, u.id, "canje_premium", precio, { metadata: { dias, renovacion: true } });
          return extenderPremium(tx, u.id, dias, ahora);
        });
        resultado.renovados += 1;
        await sinRomper(() =>
          notificar([u.id], {
            tipo: "plan_renovado",
            titulo: "Renovamos tu premium",
            cuerpo: `Usamos ${precio} puntos. Ahora vence el ${fechaCorta(venceEn)}.`,
            url: "/perfil/puntos",
          })
        );
        continue;
      } catch (error) {
        if (!(error instanceof AppError && error.code === "PUNTOS_INSUFICIENTES")) throw error;
      }
    }
    if (u.renovacionAuto === "pesos") {
      const pendiente = await prisma.ordenPago.findFirst({ where: { usuarioId: u.id, concepto: "premium", estado: "pendiente" } });
      const finGracia = new Date(u.planVenceEn!.getTime() + gracia * DIA_MS);
      if (ahora < finGracia) {
        if (!pendiente) {
          await crearOrdenPago(u.id, {
            concepto: "premium",
            montoArs: await obtenerConfig("precio.premium_ars"),
            detalle: { dias, renovacion: true },
          });
          await sinRomper(() =>
            notificar([u.id], {
              tipo: "plan_por_vencer",
              titulo: "Pagá la renovación de tu premium",
              cuerpo: `Tenés hasta el ${fechaCorta(finGracia)} para pagar la orden y mantener el premium.`,
              url: "/perfil/puntos",
            })
          );
        }
        resultado.enGracia += 1;
        continue;
      }
      if (pendiente) await prisma.ordenPago.update({ where: { id: pendiente.id }, data: { estado: "vencida" } });
    }
    await bajarAFree(u.id);
    resultado.vencidos += 1;
  }
  return resultado;
}
