import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/admin/metricas", () => {
  let admin: Usuario;
  let noAdmin: Usuario;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-metricas-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
    noAdmin = await registrarUsuario({
      email: `test-admin-metricas-route-no-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "No admin",
    });
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, noAdmin.id] } } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/admin/metricas"));
    expect(res.status).toBe(401);
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(noAdmin);
    const res = await GET(new NextRequest("http://localhost/api/admin/metricas"));
    expect(res.status).toBe(403);
  });

  it("200 devuelve las métricas", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const res = await GET(new NextRequest("http://localhost/api/admin/metricas"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("ventas");
    expect(body.data).toHaveProperty("tiendasNuevas");
  });
});
