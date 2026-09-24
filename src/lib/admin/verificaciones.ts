import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { EstadoVerificacion, SolicitudVerificacion as SolicitudVerificacionDb } from "@/generated-prisma/client";
import type { SolicitudVerificacion } from "@/lib/tiendas/tiendas";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

function aSolicitudVerificacion(s: SolicitudVerificacionDb): SolicitudVerificacion {
  return {
    id: s.id,
    tiendaId: s.tiendaId,
    estado: s.estado,
    creadaEn: s.creadaEn.toISOString(),
    revisadaEn: s.revisadaEn ? s.revisadaEn.toISOString() : null,
    revisadaPor: s.revisadaPor,
    notaAdmin: s.notaAdmin,
  };
}

export interface ListarSolicitudesVerificacionInput {
  estado?: EstadoVerificacion;
  page?: number;
  pageSize?: number;
}

export async function listarSolicitudesVerificacion(
  admin: Usuario,
  input: ListarSolicitudesVerificacionInput
): Promise<{ data: SolicitudVerificacion[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;
  const where = { estado: input.estado ?? "pendiente" } as const;

  const [solicitudes, total] = await Promise.all([
    prisma.solicitudVerificacion.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "asc" },
    }),
    prisma.solicitudVerificacion.count({ where }),
  ]);

  return { data: solicitudes.map(aSolicitudVerificacion), page, pageSize, total };
}
