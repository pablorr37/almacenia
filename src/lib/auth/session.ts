import { auth } from "@/auth";
import { buscarUsuarioActivoPorEmail, type Usuario } from "./auth";

// Resuelve el usuario autenticado completo (esComprador/esVendedor frescos desde la
// DB, no lo que haya quedado cacheado en el JWT de sesión). Devuelve null si no hay
// sesión válida.
export async function obtenerUsuarioActual(): Promise<Usuario | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  // Una cuenta pausada o baneada deja de valer aunque el JWT siga vigente.
  return buscarUsuarioActivoPorEmail(session.user.email);
}
