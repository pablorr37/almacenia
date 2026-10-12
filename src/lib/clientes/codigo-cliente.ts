// Código temporal para que el cliente comparta su identidad en la venta de
// mostrador (01-auth.md, 05-ventas.md): 6 dígitos, 10 minutos, también como QR.
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { leerCodigoQr } from "./leer-codigo";

export const VIGENCIA_MINUTOS = 10;
export { PREFIJO_QR, leerCodigoQr } from "./leer-codigo";

function invalido(): AppError {
  return new AppError("CODIGO_CLIENTE_INVALIDO", "El código no existe o ya venció. Pedile al cliente que genere uno nuevo.");
}

export async function generarCodigoCliente(
  usuario: Usuario,
  ahora = new Date()
): Promise<{ codigo: string; expiraEn: string }> {
  const expiraEn = new Date(ahora.getTime() + VIGENCIA_MINUTOS * 60_000);
  // Limpieza de vencidos y del código anterior del usuario (uno vigente por usuario).
  await prisma.codigoCliente.deleteMany({ where: { OR: [{ usuarioId: usuario.id }, { expiraEn: { lt: ahora } }] } });
  for (let intento = 0; intento < 10; intento++) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await prisma.codigoCliente.create({ data: { codigo, usuarioId: usuario.id, expiraEn } });
      return { codigo, expiraEn: expiraEn.toISOString() };
    } catch {
      // Colisión con un código vigente de otro usuario: se prueba otro número.
    }
  }
  throw new AppError("CODIGO_CLIENTE_NO_GENERADO", "No se pudo generar el código, probá de nuevo.");
}

export async function resolverCodigoCliente(texto: string, ahora = new Date()): Promise<{ id: string; nombre: string }> {
  const codigo = leerCodigoQr(texto);
  if (!codigo) throw invalido();
  const fila = await prisma.codigoCliente.findUnique({
    where: { codigo },
    include: { usuario: { select: { id: true, nombre: true, estadoCuenta: true } } },
  });
  if (!fila || fila.expiraEn <= ahora || fila.usuario.estadoCuenta !== "activa") throw invalido();
  return { id: fila.usuario.id, nombre: fila.usuario.nombre };
}
