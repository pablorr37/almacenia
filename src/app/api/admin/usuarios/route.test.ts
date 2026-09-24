import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/admin/usuarios", () => {
  let admin: Usuario;
  let noAdmin: Usuario;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-usuarios-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
    noAdmin = await registrarUsuario({
      email: `test-admin-usuarios-route-no-${Date.now()}@almacenia.test`,
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
    const res = await GET(new NextRequest("http://localhost/api/admin/usuarios"));
    expect(res.status).toBe(401);
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(noAdmin);
    const res = await GET(new NextRequest("http://localhost/api/admin/usuarios"));
    expect(res.status).toBe(403);
  });

  it("200 lista usuarios paginados", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const res = await GET(new NextRequest("http://localhost/api/admin/usuarios"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((u: { id: string }) => u.id === admin.id)).toBe(true);
  });
});
