import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/admin/tiendas/[id]/plan", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-plan-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
    vendedor = await registrarUsuario({
      email: `test-admin-plan-route-v-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
    vi.clearAllMocks();
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const req = new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ plan: "premium" }) });
    const res = await PATCH(req, params(tienda.id));
    expect(res.status).toBe(403);
  });

  it("200 cambia el plan", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const req = new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ plan: "premium" }) });
    const res = await PATCH(req, params(tienda.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.plan).toBe("premium");
  });
});
