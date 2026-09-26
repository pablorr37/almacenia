import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET as GET_PUNTOS } from "./puntos/route";
import { GET as GET_HISTORIAL } from "./historial/route";
import { POST as POST_CHECKIN } from "@/app/api/tiendas/[tiendaId]/checkin/route";
import { POST as POST_VISITA } from "@/app/api/tiendas/[tiendaId]/visita/route";
import { GET as GET_CONFIG, PATCH as PATCH_CONFIG } from "@/app/api/admin/config/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

const LAT = -31.5375;
const LON = -68.5364;

describe("rutas de gamificación, check-in, visita y config", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  const ctx = () => ({ params: Promise.resolve({ tiendaId: tienda.id }) });
  const post = (body: unknown) => new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

  beforeEach(async () => {
    vendedor = await registrarUsuario({ email: `test-gam-api-v-${Date.now()}@almacenia.test`, password: "password123", nombre: "V" });
    comprador = await registrarUsuario({ email: `test-gam-api-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    tienda = await crearTienda(vendedor, { nombre: "Tienda API", direccion: "D", lat: LAT, lon: LON });
  });

  afterEach(async () => {
    await prisma.configuracionSistema.deleteMany({});
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id] } } });
    vi.clearAllMocks();
  });

  it("401 sin sesión en todas", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    expect((await GET_PUNTOS()).status).toBe(401);
    expect((await GET_HISTORIAL(new NextRequest("http://localhost/x"))).status).toBe(401);
    expect((await POST_CHECKIN(post({ lat: LAT, lon: LON }), ctx())).status).toBe(401);
    expect((await POST_VISITA(post({}), ctx())).status).toBe(401);
    expect((await GET_CONFIG()).status).toBe(401);
  });

  it("check-in + visita suman puntos; puntos e historial los reflejan", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const checkin = await POST_CHECKIN(post({ lat: LAT, lon: LON }), ctx());
    expect(checkin.status).toBe(201);
    expect((await checkin.json()).data.puntosOtorgados).toBe(1);

    const visita = await (await POST_VISITA(post({}), ctx())).json();
    expect(visita.data.puntosOtorgados).toBe(5);

    expect((await (await GET_PUNTOS()).json()).data.total).toBe(6);

    const historial = await (await GET_HISTORIAL(new NextRequest("http://localhost/x?pageSize=1"))).json();
    expect(historial.total).toBe(2);
    expect(historial.pageSize).toBe(1);
    expect(historial.data[0].tienda.nombre).toBe("Tienda API");
  });

  it("409 CHECKIN_FUERA_DE_RANGO lejos de la tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await POST_CHECKIN(post({ lat: LAT + 0.01, lon: LON }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CHECKIN_FUERA_DE_RANGO");
  });

  it("config: 403 para no admin; admin lista y actualiza", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    expect((await GET_CONFIG()).status).toBe(403);

    const admin = { ...vendedor, esAdmin: true };
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const lista = await (await GET_CONFIG()).json();
    expect(lista.data).toHaveLength(2);

    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ clave: "itinerario.costo_km", valor: 120 }),
    });
    const res = await PATCH_CONFIG(req);
    expect(res.status).toBe(200);
    expect((await res.json()).data.valor).toBe(120);
  });
});
