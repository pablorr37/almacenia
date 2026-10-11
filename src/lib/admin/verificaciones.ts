import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { Categoria, EstadoVerificacion, SolicitudVerificacion as SolicitudVerificacionDb } from "@/generated-prisma/client";
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

// Lo que el admin necesita para decidir sin ir a buscar la tienda (11-admin.md).
export interface SolicitudVerificacionAdmin extends SolicitudVerificacion {
  tienda: {
    id: string;
    nombre: string;
    direccion: string;
    rubro: Categoria | null;
    vendedor: { nombre: string; email: string };
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
): Promise<{ data: SolicitudVerificacionAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;
  const where = { estado: input.estado ?? "pendiente" } as const;

  const [solicitudes, total] = await Promise.all([
    prisma.solicitudVerificacion.findMany({
      where,
      include: {
        tienda: {
          select: {
            id: true,
            nombre: true,
            direccion: true,
            rubro: true,
            vendedor: { select: { nombre: true, email: true } },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadaEn: "asc" },
    }),
    prisma.solicitudVerificacion.count({ where }),
  ]);

  return {
    data: solicitudes.map((s) => ({ ...aSolicitudVerificacion(s), tienda: s.tienda })),
    page,
    pageSize,
    total,
  };
}
