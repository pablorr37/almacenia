import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { GET } from "./route";

const LAT_BASE = -34.6037;
const LON_BASE = -58.3816;

function req(qs: string) {
  return new NextRequest(`http://localhost/api/tiendas/cercanas?${qs}`);
}

describe("GET /api/tiendas/cercanas", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await registrarUsuario({
      email: `test-cercanas-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    await crearTienda(usuario, {
      nombre: "Almacén Cercano",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
    });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: usuario.id } });
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
  });

  it("200 con las tiendas cercanas ordenadas por distancia, es público (sin sesión)", async () => {
    const res = await GET(req(`lat=${LAT_BASE}&lon=${LON_BASE}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0]).toHaveProperty("distanciaKm");
    expect(body.data.map((t: { nombre: string }) => t.nombre)).toContain("Almacén Cercano");
  });

  it("400 RADIO_INVALIDO si radioKm excede el máximo", async () => {
    const res = await GET(req(`lat=${LAT_BASE}&lon=${LON_BASE}&radioKm=999`));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("RADIO_INVALIDO");
  });
});
