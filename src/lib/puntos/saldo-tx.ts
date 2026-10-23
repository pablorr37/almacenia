import { AppError } from "@/lib/errors";
import type { Prisma } from "@/generated-prisma/client";

// Canje atómico (23-puntos-pagos.md): dentro de una transacción, bloquea la fila del
// usuario para que dos gastos simultáneos no usen el mismo saldo, verifica e inserta
// el evento negativo. El beneficio se aplica en la misma transacción.

export interface OpcionesGasto {
  tiendaId?: string | null;
  contraparteUsuarioId?: string | null;
  metadata?: Record<string, unknown>;
}

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function bloquearUsuario(tx: Prisma.TransactionClient, usuarioId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId} FOR UPDATE`;
}

export async function saldoEnTx(tx: Prisma.TransactionClient, usuarioId: string): Promise<number> {
  const r = await tx.eventoPuntos.aggregate({ where: { usuarioId }, _sum: { puntos: true } });
  return Number(r._sum.puntos ?? 0);
}

export async function gastarPuntos(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  tipo: string,
  puntos: number,
  opciones: OpcionesGasto = {}
): Promise<{ saldo: number }> {
  await bloquearUsuario(tx, usuarioId);
  const saldo = await saldoEnTx(tx, usuarioId);
  if (saldo + 1e-9 < puntos) {
    throw new AppError("PUNTOS_INSUFICIENTES", `No te alcanzan los puntos: tenés ${saldo} y hacen falta ${puntos}.`);
  }
  await tx.eventoPuntos.create({
    data: {
      usuarioId,
      tipo,
      puntos: -puntos,
      tiendaId: opciones.tiendaId ?? null,
      contraparteUsuarioId: opciones.contraparteUsuarioId ?? null,
      metadata: (opciones.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  return { saldo: redondear1(saldo - puntos) };
}
