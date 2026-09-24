import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, solicitarVerificacion, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/admin/verificaciones", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-verif-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };

    vendedor = await registrarUsuario({
      email: `test-admin-verif-v-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    await solicitarVerificacion(vendedor, tienda.id);
  });

  afterEach(async () => {
    await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
    vi.clearAllMocks();
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(new NextRequest("http://localhost/api/admin/verificaciones"));
    expect(res.status).toBe(403);
  });

  it("200 lista las pendientes por default", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const res = await GET(new NextRequest("http://localhost/api/admin/verificaciones"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.some((s: { tiendaId: string }) => s.tiendaId === tienda.id)).toBe(true);
  });
});
