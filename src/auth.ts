import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verificarPassword } from "@/lib/auth/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Necesario detrás de un proxy (Coolify) o en cualquier host no estándar; sin
  // esto Auth.js rechaza el request con UntrustedHost.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string") {
          return null;
        }
        const usuario = await verificarPassword(credentials.email, credentials.password);
        if (!usuario) return null;
        // NextAuth solo persiste id/name/email/image en el token por default; el
        // resto (esComprador/esVendedor) se resuelve fresco desde la DB en cada
        // request (ver src/lib/auth/session.ts) para no arrastrar datos viejos.
        return { id: usuario.id, email: usuario.email, name: usuario.nombre };
      },
    }),
  ],
});
