import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, solicitarVerificacion, type Tienda } from "@/lib/tiendas/tiendas";
import { verificarTiendaAdmin } from "./tiendas";

let contador = 0;
async function usuario(esAdmin = false): Promise<Usuario> {
  contador += 1;
  const u = await registrarUsuario({
    email: `test-admin-tiendas-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "U",
  });
  if (esAdmin) await prisma.usuario.update({ where: { id: u.id }, data: { esAdmin: true } });
  return { ...u, esAdmin };
}

describe("verificarTiendaAdmin", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    admin = await usuario(true);
    vendedor = await usuario();
    tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
  });

  afterEach(async () => {
    await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
  });

  const verificada = async () => (await prisma.tienda.findUniqueOrThrow({ where: { id: tienda.id } })).verificada;

  it("verifica una tienda sin solicitud previa y le quita la verificación", async () => {
    expect(await verificarTiendaAdmin(admin, tienda.id, true)).toEqual({ id: tienda.id, verificada: true });
    expect(await verificada()).toBe(true);
    expect(await verificarTiendaAdmin(admin, tienda.id, false)).toEqual({ id: tienda.id, verificada: false });
    expect(await verificada()).toBe(false);
  });

  it("al verificar resuelve la solicitud pendiente como aprobada, con el admin como revisor", async () => {
    const solicitud = await solicitarVerificacion(vendedor, tienda.id);
    await verificarTiendaAdmin(admin, tienda.id, true);
    const s = await prisma.solicitudVerificacion.findUniqueOrThrow({ where: { id: solicitud.id } });
    expect(s.estado).toBe("aprobada");
    expect(s.revisadaPor).toBe(admin.id);
  });

  it("al quitar la verificación con una solicitud pendiente, la rechaza", async () => {
    const solicitud = await solicitarVerificacion(vendedor, tienda.id);
    await verificarTiendaAdmin(admin, tienda.id, false);
    const s = await prisma.solicitudVerificacion.findUniqueOrThrow({ where: { id: solicitud.id } });
    expect(s.estado).toBe("rechazada");
  });

  it("FORBIDDEN, VERIFICADA_INVALIDA y TIENDA_NO_ENCONTRADA", async () => {
    await expect(verificarTiendaAdmin(vendedor, tienda.id, true)).rejects.toMatchObject<Partial<AppError>>({ code: "FORBIDDEN" });
    await expect(verificarTiendaAdmin(admin, tienda.id, "si" as unknown as boolean)).rejects.toMatchObject({
      code: "VERIFICADA_INVALIDA",
    });
    await expect(verificarTiendaAdmin(admin, crypto.randomUUID(), true)).rejects.toMatchObject({ code: "TIENDA_NO_ENCONTRADA" });
  });
});
