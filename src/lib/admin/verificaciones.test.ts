import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, solicitarVerificacion, revisarSolicitudVerificacion, type Tienda } from "@/lib/tiendas/tiendas";
import { listarSolicitudesVerificacion } from "./verificaciones";

let contador = 0;
async function crearAdmin(): Promise<Usuario> {
  contador += 1;
  const usuario = await registrarUsuario({
    email: `test-verif-admin-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Admin",
  });
  await prisma.usuario.update({ where: { id: usuario.id }, data: { esAdmin: true } });
  return { ...usuario, esAdmin: true };
}

async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-verif-v-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda verif ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

async function limpiar(usuarioIds: string[]) {
  await prisma.solicitudVerificacion.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

describe("listarSolicitudesVerificacion", () => {
  it("lanza FORBIDDEN si no es admin", async () => {
    const { vendedor } = await crearVendedorConTienda();
    try {
      await expect(listarSolicitudesVerificacion(vendedor, {})).rejects.toMatchObject<Partial<AppError>>({
        code: "FORBIDDEN",
      });
    } finally {
      await limpiar([vendedor.id]);
    }
  });

  it("lista por default las pendientes", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const solicitud = await solicitarVerificacion(vendedor, tienda.id);

    try {
      const resultado = await listarSolicitudesVerificacion(admin, {});
      expect(resultado.data.some((s) => s.id === solicitud.id)).toBe(true);
      expect(resultado.data.every((s) => s.estado === "pendiente")).toBe(true);
    } finally {
      await limpiar([admin.id, vendedor.id]);
    }
  });

  it("filtra por estado explícito", async () => {
    const admin = await crearAdmin();
    const { vendedor, tienda } = await crearVendedorConTienda();
    const solicitud = await solicitarVerificacion(vendedor, tienda.id);
    await revisarSolicitudVerificacion(admin, solicitud.id, "aprobada");

    try {
      const aprobadas = await listarSolicitudesVerificacion(admin, { estado: "aprobada" });
      expect(aprobadas.data.some((s) => s.id === solicitud.id)).toBe(true);

      const pendientes = await listarSolicitudesVerificacion(admin, { estado: "pendiente" });
      expect(pendientes.data.some((s) => s.id === solicitud.id)).toBe(false);
    } finally {
      await limpiar([admin.id, vendedor.id]);
    }
  });
});
