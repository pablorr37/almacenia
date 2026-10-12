import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verificarPassword, exigirCuentaActiva } from "@/lib/auth/auth";
import { AppError } from "@/lib/errors";

// Cuenta pausada o baneada (01-auth.md): el login falla con un código propio que
// /login traduce a un mensaje, distinto de "contraseña incorrecta".
class CuentaSuspendida extends CredentialsSignin {
  constructor(codigo: string) {
    super();
    this.code = codigo;
  }
}

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
        try {
          await exigirCuentaActiva(usuario.id);
        } catch (error) {
          if (error instanceof AppError) throw new CuentaSuspendida(error.code.toLowerCase());
          throw error;
        }
        // NextAuth solo persiste id/name/email/image en el token por default; el
        // resto (esComprador/esVendedor) se resuelve fresco desde la DB en cada
        // request (ver src/lib/auth/session.ts) para no arrastrar datos viejos.
        return { id: usuario.id, email: usuario.email, name: usuario.nombre };
      },
    }),
  ],
  callbacks: {
    // Sin esto, session.update({ name }) del cliente no toca el JWT — el nombre
    // mostrado quedaría pegado al de cuando se inició sesión. obtenerUsuarioActual
    // (src/lib/auth/session.ts) igual resuelve fresco desde la DB para las rutas
    // API; esto es solo para que el nombre en el JWT/sesión del cliente refleje
    // el cambio sin tener que cerrar y volver a iniciar sesión.
    async jwt({ token, trigger, session }) {
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      if (trigger === "update" && session?.image) {
        token.picture = session.image;
      }
      return token;
    },
  },
});
