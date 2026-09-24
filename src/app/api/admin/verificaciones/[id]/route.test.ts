import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, solicitarVerificacion, obtenerTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/admin/verificaciones/[id]", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;
  let solicitudId: string;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-verif-patch-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };

    vendedor = await registrarUsuario({
      email: `test-admin-verif-patch-v-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    const solicitud = await solicitarVerificacion(vendedor, tienda.id);
    solicitudId = solicitud.id;
  });

  afterEach(async () => {
    await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
    vi.clearAllMocks();
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ decision: "aprobada" }),
    });
    const res = await PATCH(req, params(solicitudId));
    expect(res.status).toBe(403);
  });

  it("200 aprueba y verifica la tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ decision: "aprobada" }),
    });
    const res = await PATCH(req, params(solicitudId));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.estado).toBe("aprobada");

    const tiendaActualizada = await obtenerTienda(tienda.id);
    expect(tiendaActualizada?.verificada).toBe(true);
  });
});
