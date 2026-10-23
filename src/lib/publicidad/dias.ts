import { prisma } from "@/lib/prisma";
import { diaLocal } from "@/lib/gamificacion/gamificacion";

// Días de campaña (21-publicidad.md). Módulo chico y sin dependencias de tiendas o
// equipo: lo usa también buscarTiendasCercanas.

// Las columnas DATE se leen y escriben como medianoche UTC.
export function fechaDb(dia: string): Date {
  return new Date(`${dia}T00:00:00Z`);
}

// Consumo de días (idempotente): finaliza las agotadas y consume hoy en las activas
// que ya empezaron. Las push no consumen días (se marcan al enviarse).
export async function actualizarDiasCampanias(ahora = new Date()): Promise<{ consumidas: number; finalizadas: number }> {
  const hoy = diaLocal(ahora);
  const finalizadas = await prisma.$executeRaw`
    UPDATE campanias_aviso SET estado = 'finalizada', finalizada_en = ${ahora}
    WHERE estado = 'activa' AND espacio <> 'push' AND dias_consumidos >= dias
      AND (ultimo_dia_consumido IS NULL OR ultimo_dia_consumido < ${hoy}::date)
  `;
  const consumidas = await prisma.$executeRaw`
    UPDATE campanias_aviso SET dias_consumidos = dias_consumidos + 1, ultimo_dia_consumido = ${hoy}::date
    WHERE estado = 'activa' AND espacio <> 'push' AND desde <= ${hoy}::date AND dias_consumidos < dias
      AND (ultimo_dia_consumido IS NULL OR ultimo_dia_consumido < ${hoy}::date)
  `;
  return { consumidas, finalizadas };
}

