import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET as GET_MIA } from "./mia/route";
import { GET as GET_MIAS } from "./mias/route";
import { GET as GET_MIEMBROS, POST as POST_MIEMBRO } from "./[tiendaId]/miembros/route";
import { PATCH as PATCH_MIEMBRO, DELETE as DELETE_MIEMBRO } from "./[tiendaId]/miembros/[usuarioId]/route";
import { GET as GET_BALANCE } from "./[tiendaId]/balance/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const sesion = vi.mocked(obtenerUsuarioActual);

// 19-equipo-tienda.md
describe("rutas de varias tiendas, equipo y balance", () => {
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;
  let sucursal: Tienda;
  const url = (path: string) => `http://localhost${path}`;
  const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-eq-api-d-${suf}@almacenia.test`, password: "password123", nombre: "Dueño" });
    emp = await registrarUsuario({ email: `test-eq-api-e-${suf}@almacenia.test`, password: "password123", nombre: "Emp" });
    tienda = await crearTienda(dueno, { nombre: "B Central", direccion: "D", lat: -31.5, lon: -68.5 });
    sucursal = await crearTienda(dueno, { nombre: "A Sucursal", direccion: "D", lat: -31.5, lon: -68.5 });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: dueno.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [dueno.id, emp.id] } } });
    vi.clearAllMocks();
  });

  it("GET /api/tiendas/mias: propias por nombre; 401 sin sesión", async () => {
    sesion.mockResolvedValue(null);
    expect((await GET_MIAS()).status).toBe(401);
    sesion.mockResolvedValue(dueno);
    const body = await (await GET_MIAS()).json();
    expect(body.data.map((m: { tienda: { nombre: string }; rol: string }) => [m.tienda.nombre, m.rol])).toEqual([
      ["A Sucursal", "propietario"],
      ["B Central", "propietario"],
    ]);
  });

  it("GET /api/tiendas/mia?tiendaId: la pedida si tiene acceso; 403 si no", async () => {
    sesion.mockResolvedValue(dueno);
    const res = await GET_MIA(new NextRequest(url(`/api/tiendas/mia?tiendaId=${tienda.id}`)));
    expect((await res.json()).data.id).toBe(tienda.id);
    const sinParam = await (await GET_MIA(new NextRequest(url("/api/tiendas/mia")))).json();
    expect(sinParam.data.id).toBe(sucursal.id);
    sesion.mockResolvedValue(emp);
    expect((await GET_MIA(new NextRequest(url(`/api/tiendas/mia?tiendaId=${tienda.id}`)))).status).toBe(403);
  });

  it("miembros: alta, lista, cambio, baja; el empleado ve la tienda en mias y no gestiona el equipo", async () => {
    const ctx = { params: Promise.resolve({ tiendaId: tienda.id }) };
    const ctxM = { params: Promise.resolve({ tiendaId: tienda.id, usuarioId: emp.id }) };
    sesion.mockResolvedValue(dueno);
    const alta = await POST_MIEMBRO(new NextRequest(url("/x"), json("POST", { email: emp.email, rol: "empleado" })), ctx);
    expect(alta.status).toBe(201);
    expect((await alta.json()).data).toMatchObject({ rol: "empleado", permisos: ["vender", "cobrar"] });
    const dup = await POST_MIEMBRO(new NextRequest(url("/x"), json("POST", { email: emp.email, rol: "empleado" })), ctx);
    expect(dup.status).toBe(409);

    const lista = await (await GET_MIEMBROS(new NextRequest(url("/x")), ctx)).json();
    expect(lista.data).toHaveLength(1);

    const cambio = await PATCH_MIEMBRO(new NextRequest(url("/x"), json("PATCH", { permisos: ["vender", "balance"] })), ctxM);
    expect((await cambio.json()).data.permisos).toEqual(["vender", "balance"]);

    sesion.mockResolvedValue(emp);
    const mias = await (await GET_MIAS()).json();
    expect(mias.data).toEqual([expect.objectContaining({ rol: "empleado", permisos: ["vender", "balance"] })]);
    expect((await GET_MIEMBROS(new NextRequest(url("/x")), ctx)).status).toBe(403);
    expect((await GET_BALANCE(new NextRequest(url("/x")), ctx)).status).toBe(200);

    // Dejar la tienda.
    const baja = await DELETE_MIEMBRO(new NextRequest(url("/x"), { method: "DELETE" }), ctxM);
    expect((await baja.json()).data).toEqual({ usuarioId: emp.id });
    expect((await GET_BALANCE(new NextRequest(url("/x")), ctx)).status).toBe(403);
  });

  it("GET balance: rango por query; 400 RANGO_INVALIDO", async () => {
    const ctx = { params: Promise.resolve({ tiendaId: tienda.id }) };
    sesion.mockResolvedValue(dueno);
    const ok = await (await GET_BALANCE(new NextRequest(url("/x?desde=2026-10-01&hasta=2026-10-03")), ctx)).json();
    expect(ok.data).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-03", cobradas: { cantidad: 0, total: 0 } });
    expect(ok.data.porDia).toHaveLength(3);
    const mal = await GET_BALANCE(new NextRequest(url("/x?desde=ayer")), ctx);
    expect(mal.status).toBe(400);
    expect((await mal.json()).error.code).toBe("RANGO_INVALIDO");
  });
});
