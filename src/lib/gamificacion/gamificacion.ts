import { prisma } from "@/lib/prisma";
import type { EventoPuntos as EventoPuntosDb, Prisma } from "@/generated-prisma/client";

export interface EventoPuntos {
  id: string;
  usuarioId: string;
  tipo: string;
  puntos: number;
  metadata: Record<string, unknown> | null;
  creadoEn: string;
}

function aEventoPuntos(evento: EventoPuntosDb): EventoPuntos {
  return {
    id: evento.id,
    usuarioId: evento.usuarioId,
    tipo: evento.tipo,
    puntos: evento.puntos,
    metadata: (evento.metadata as Record<string, unknown> | null) ?? null,
    creadoEn: evento.creadoEn.toISOString(),
  };
}

export async function registrarEvento(
  usuarioId: string,
  tipo: string,
  puntos: number,
  metadata?: Record<string, unknown>
): Promise<EventoPuntos> {
  const evento = await prisma.eventoPuntos.create({
    data: {
      usuarioId,
      tipo,
      puntos,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return aEventoPuntos(evento);
}

export async function totalPuntos(usuarioId: string): Promise<number> {
  const resultado = await prisma.eventoPuntos.aggregate({
    where: { usuarioId },
    _sum: { puntos: true },
  });

  return resultado._sum.puntos ?? 0;
}
