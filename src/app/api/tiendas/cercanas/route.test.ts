import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn().mockResolvedValue(null) }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

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

  it("no se cachea y no muestra tiendas de cuentas pausadas (00-overview.md, 01-auth.md)", async () => {
    const primera = await GET(req(`lat=${LAT_BASE}&lon=${LON_BASE}`));
    expect(primera.headers.get("cache-control")).toBe("no-store");

    await prisma.usuario.update({ where: { id: usuario.id }, data: { estadoCuenta: "pausada" } });
    const body = await (await GET(req(`lat=${LAT_BASE}&lon=${LON_BASE}`))).json();
    expect(body.data.map((t: { nombre: string }) => t.nombre)).not.toContain("Almacén Cercano");
  });

  it("400 RADIO_INVALIDO si radioKm excede el máximo", async () => {
    const res = await GET(req(`lat=${LAT_BASE}&lon=${LON_BASE}&radioKm=999`));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("RADIO_INVALIDO");
  });
});

// 18-alcance.md: con sesión, la búsqueda se limita al radio de alcance del usuario.
describe("GET /api/tiendas/cercanas con sesión (radio de alcance)", () => {
  const LAT_SJ = -31.5375;
  const LON_SJ = -68.5364;
  const KM_LAT = 1 / 111.2; // grados de latitud por km
  let vendedor: Usuario;
  let comprador: Usuario;
  const nombres = (body: { data: Array<{ nombre: string }> }) => body.data.map((t) => t.nombre);

  beforeEach(async () => {
    const suf = Date.now();
    vendedor = await registrarUsuario({ email: `test-alc-v-${suf}@almacenia.test`, password: "password123", nombre: "V" });
    comprador = await registrarUsuario({ email: `test-alc-c-${suf}@almacenia.test`, password: "password123", nombre: "C" });
    const tiendas: Array<[string, number, number]> = [
      [`A 2 km ${suf}`, LAT_SJ + 2 * KM_LAT, LON_SJ],
      [`A 5 km ${suf}`, LAT_SJ + 5 * KM_LAT, LON_SJ],
      [`A 12 km ${suf}`, LAT_SJ + 12 * KM_LAT, LON_SJ],
      [`Jáchal ${suf}`, -30.2417, -68.7464], // ~145 km, dentro de San Juan
      [`Mendoza ${suf}`, -32.8895, -68.8458], // fuera de San Juan
    ];
    // Una tienda por vendedor (02-tiendas.md): cada una con su propio usuario.
    for (const [nombre, lat, lon] of tiendas) {
      const dueno = nombre.startsWith("A 2") ? vendedor : await registrarUsuario({ email: `test-alc-${nombre.replace(/\W/g, "")}-${suf}@almacenia.test`, password: "password123", nombre });
      await crearTienda(dueno, { nombre, direccion: "D", lat, lon });
    }
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
  });

  afterEach(async () => {
    const duenos = await prisma.usuario.findMany({ where: { email: { startsWith: "test-alc-" } }, select: { id: true } });
    const ids = duenos.map((d) => d.id);
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    obtenerUsuarioActualMock.mockResolvedValue(null);
  });

  it("free con 0 puntos: solo hasta 3 km, aunque pida más", async () => {
    const sinRadio = await (await GET(req(`lat=${LAT_SJ}&lon=${LON_SJ}`))).json();
    expect(nombres(sinRadio).some((n) => n.startsWith("A 2 km"))).toBe(true);
    expect(nombres(sinRadio).some((n) => n.startsWith("A 5 km"))).toBe(false);

    const pidiendoMas = await (await GET(req(`lat=${LAT_SJ}&lon=${LON_SJ}&radioKm=20`))).json();
    expect(nombres(pidiendoMas).some((n) => n.startsWith("A 5 km"))).toBe(false);
  });

  it("free con 300 puntos (6 km) y premium (15 km)", async () => {
    await prisma.eventoPuntos.create({ data: { usuarioId: comprador.id, tipo: "prueba", puntos: 300 } });
    const seis = await (await GET(req(`lat=${LAT_SJ}&lon=${LON_SJ}`))).json();
    expect(nombres(seis).some((n) => n.startsWith("A 5 km"))).toBe(true);
    expect(nombres(seis).some((n) => n.startsWith("A 12 km"))).toBe(false);

    await prisma.usuario.update({ where: { id: comprador.id }, data: { plan: "premium" } });
    const quince = await (await GET(req(`lat=${LAT_SJ}&lon=${LON_SJ}`))).json();
    expect(nombres(quince).some((n) => n.startsWith("A 12 km"))).toBe(true);
    expect(nombres(quince).some((n) => n.startsWith("Jáchal"))).toBe(false);
  });

  it("plata: toda la provincia de San Juan, más allá de 50 km, y nada de afuera", async () => {
    await prisma.usuario.update({ where: { id: comprador.id }, data: { plan: "plata" } });
    const res = await GET(req(`lat=${LAT_SJ}&lon=${LON_SJ}&radioKm=1`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(nombres(body).some((n) => n.startsWith("Jáchal"))).toBe(true);
    expect(nombres(body).some((n) => n.startsWith("A 12 km"))).toBe(true);
    expect(nombres(body).some((n) => n.startsWith("Mendoza"))).toBe(false);
    const jachal = body.data.find((t: { nombre: string }) => t.nombre.startsWith("Jáchal"));
    expect(jachal.distanciaKm).toBeGreaterThan(100);
  });
});
