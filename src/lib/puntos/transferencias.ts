import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { accesoATienda } from "@/lib/equipo/equipo";
import { obtenerConfig } from "@/lib/config/config";
import { mesLocal, sinRomper } from "@/lib/gamificacion/gamificacion";
import { notificar } from "@/lib/notificaciones/notificar";
import { gastarPuntos } from "./saldo-tx";

// Transferencias de puntos dentro del equipo de una tienda (23-puntos-pagos.md).

async function exigirEquipo(usuarioId: string, tiendaId: string): Promise<void> {
  if (!(await accesoATienda(usuarioId, tiendaId))) {
    throw new AppError("NO_ES_DEL_EQUIPO", "Solo se pueden transferir puntos entre personas de la misma tienda.");
  }
}

export async function equipoParaTransferir(usuario: Usuario, tiendaId: string): Promise<Array<{ id: string; nombre: string }>> {
  await exigirEquipo(usuario.id, tiendaId);
  const tienda = await prisma.tienda.findUniqueOrThrow({
    where: { id: tiendaId },
    select: {
      vendedor: { select: { id: true, nombre: true } },
      miembros: { select: { usuario: { select: { id: true, nombre: true } } }, orderBy: { creadoEn: "asc" } },
    },
  });
  return [tienda.vendedor, ...tienda.miembros.map((m) => m.usuario)].filter((p) => p.id !== usuario.id);
}

export async function transferirPuntos(
  usuario: Usuario,
  input: { tiendaId: string; aUsuarioId: string; puntos: number },
  ahora = new Date()
): Promise<{ saldo: number }> {
  const puntos = input.puntos;
  if (typeof puntos !== "number" || !Number.isFinite(puntos) || puntos <= 0 || Math.round(puntos * 10) !== puntos * 10) {
    throw new AppError("PUNTOS_INVALIDOS", "Los puntos tienen que ser mayores a 0, con un decimal como máximo.");
  }
  if (input.aUsuarioId === usuario.id) {
    throw new AppError("ACCION_SOBRE_SI_MISMO", "No podés transferirte puntos a vos.");
  }
  await exigirEquipo(usuario.id, input.tiendaId);
  await exigirEquipo(input.aUsuarioId, input.tiendaId);

  const [max, maxMes] = await Promise.all([obtenerConfig("puntos.transferencia_max"), obtenerConfig("puntos.transferencia_mes_max")]);
  if (puntos > max) throw new AppError("TOPE_TRANSFERENCIA", `Podés transferir hasta ${max} puntos por vez.`);

  const inicioMes = new Date(`${mesLocal(ahora)}-01T00:00:00-03:00`);
  const enviados = await prisma.eventoPuntos.aggregate({
    where: { usuarioId: usuario.id, tipo: "transferencia_enviada", creadoEn: { gte: inicioMes } },
    _sum: { puntos: true },
  });
  const enviadosMes = -Number(enviados._sum.puntos ?? 0);
  if (enviadosMes + puntos > maxMes + 1e-9) {
    throw new AppError("TOPE_TRANSFERENCIA_MES", `Este mes ya transferiste ${enviadosMes} de ${maxMes} puntos.`);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const r = await gastarPuntos(tx, usuario.id, "transferencia_enviada", puntos, {
      tiendaId: input.tiendaId,
      contraparteUsuarioId: input.aUsuarioId,
    });
    await tx.eventoPuntos.create({
      data: {
        usuarioId: input.aUsuarioId,
        tipo: "transferencia_recibida",
        puntos,
        tiendaId: input.tiendaId,
        contraparteUsuarioId: usuario.id,
      },
    });
    return r;
  });

  await sinRomper(() =>
    notificar([input.aUsuarioId], {
      tipo: "transferencia_recibida",
      titulo: `${usuario.nombre} te transfirió ${puntos} puntos`,
      cuerpo: "Ya están en tu saldo para canjear.",
      url: "/perfil/puntos",
      tiendaId: input.tiendaId,
    })
  );
  return resultado;
}
