import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function req(body: unknown) {
  return new NextRequest("http://localhost/api/catalogo/x/foto", { method: "PATCH", body: JSON.stringify(body) });
}

describe("PATCH /api/catalogo/:id/foto", () => {
  let vendedor: Usuario;
  let catalogoId: string;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-catalogo-foto-api-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    const tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
    vendedor = { ...vendedor, esVendedor: true };
    catalogoId = (await prisma.productoCatalogo.create({ data: { nombre: "Sin foto" } })).id;
  });

  afterEach(async () => {
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: vendedor.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: vendedor.id } });
    await prisma.productoCatalogo.deleteMany({ where: { id: catalogoId } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await PATCH(req({ imagenUrl: "http://s3/x.jpg" }), { params: Promise.resolve({ id: catalogoId }) });
    expect(res.status).toBe(401);
  });

  it("400 sin imagenUrl", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await PATCH(req({}), { params: Promise.resolve({ id: catalogoId }) });
    expect(res.status).toBe(400);
  });

  it("200 asigna la foto al catálogo", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await PATCH(req({ imagenUrl: "http://s3/x.jpg" }), { params: Promise.resolve({ id: catalogoId }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.imagenUrl).toBe("http://s3/x.jpg");
  });
});
