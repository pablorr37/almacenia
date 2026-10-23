import { obtenerUsuarioActual } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";

// Usuario de la sesión o NO_AUTENTICADO (401), para las API routes.
export async function usuarioRequerido(): Promise<Usuario> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) throw new AppError("NO_AUTENTICADO", "Necesitás iniciar sesión.");
  return usuario;
}
