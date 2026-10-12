// Estado del sistema para el admin (11-admin.md, GET /api/admin/diagnostico).
import { prisma } from "@/lib/prisma";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { probarAlmacenamiento, type ResultadoAlmacenamiento } from "@/lib/archivos/archivos";

export interface Diagnostico {
  db: "ok" | "error";
  almacenamiento: ResultadoAlmacenamiento;
}

export async function diagnosticar(admin: Usuario): Promise<Diagnostico> {
  requireAdmin(admin);
  const db = await prisma.$queryRaw`SELECT 1`.then(
    () => "ok" as const,
    () => "error" as const
  );
  return { db, almacenamiento: await probarAlmacenamiento() };
}
