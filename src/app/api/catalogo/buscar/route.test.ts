import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearProductoNuevoEnCatalogo } from "@/lib/catalogo/catalogo";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/catalogo/buscar", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  const catalogoIds: string[] = [];

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-catalogo-api-v-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    vendedor = { ...vendedor, esVendedor: true };
    await prisma.usuario.update({ where: { id: vendedor.id }, data: { esVendedor: true } });
    comprador = await registrarUsuario({
      email: `test-catalogo-api-c-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Comprador",
    });
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Fideos Test API" });
    catalogoIds.push(p.id);
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id] } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds.splice(0) } } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/catalogo/buscar?q=fideos"));
    expect(res.status).toBe(401);
  });

  it("200 también para compradores (arman listas de compras, 14-listas-compras.md)", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await GET(new NextRequest("http://localhost/api/catalogo/buscar?q=fideos test api"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.map((p: { nombre: string }) => p.nombre)).toContain("Fideos Test API");
  });

  it("200 devuelve coincidencias por nombre", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(new NextRequest("http://localhost/api/catalogo/buscar?q=Fideos Test API"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
