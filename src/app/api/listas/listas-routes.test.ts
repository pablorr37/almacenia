import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET as LISTAR, POST as CREAR } from "./route";
import { GET as OBTENER, PATCH as ACTUALIZAR, DELETE as ELIMINAR } from "./[id]/route";
import { POST as COMPARAR_LISTA } from "./[id]/comparar/route";
import { POST as COMPARAR } from "@/app/api/itinerario/comparar/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

const req = (method: string, body?: unknown, url = "http://localhost/x") =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

describe("rutas de listas de compras e itinerario", () => {
  let comprador: Usuario;
  let otro: Usuario;
  let catalogoId: string;

  beforeEach(async () => {
    comprador = await registrarUsuario({ email: `test-listas-api-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    otro = await registrarUsuario({ email: `test-listas-api-o-${Date.now()}@almacenia.test`, password: "password123", nombre: "O" });
    catalogoId = (await prisma.productoCatalogo.create({ data: { nombre: "Leche listas api" } })).id;
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: [comprador.id, otro.id] } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: catalogoId } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    expect((await LISTAR(req("GET"))).status).toBe(401);
    expect((await CREAR(req("POST", {}))).status).toBe(401);
    expect((await COMPARAR(req("POST", {}))).status).toBe(401);
  });

  it("CRUD completo y aislamiento entre usuarios", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const creada = await CREAR(req("POST", { nombre: "Súper", items: [{ catalogoId, cantidad: 2 }] }));
    expect(creada.status).toBe(201);
    const { data: lista } = await creada.json();
    const ctx = { params: Promise.resolve({ id: lista.id }) };

    const listado = await (await LISTAR(req("GET"))).json();
    expect(listado).toMatchObject({ total: 1, page: 1, data: [{ nombre: "Súper", cantidadItems: 1 }] });

    const act = await ACTUALIZAR(req("PATCH", { nombre: "Súper semana" }), ctx);
    expect((await act.json()).data.nombre).toBe("Súper semana");

    obtenerUsuarioActualMock.mockResolvedValue(otro);
    expect((await OBTENER(req("GET"), ctx)).status).toBe(404);

    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const comparar = await COMPARAR_LISTA(req("POST", { lat: -40.9, lon: -20.9 }), ctx);
    expect(comparar.status).toBe(200);
    expect((await comparar.json()).data).toMatchObject({ planes: [], sinOfertas: [catalogoId] });

    expect((await ELIMINAR(req("DELETE"), ctx)).status).toBe(200);
    expect((await OBTENER(req("GET"), ctx)).status).toBe(404);
  });

  it("400 al crear con ítems inválidos; comparar sin guardar valida la ubicación", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await CREAR(req("POST", { nombre: "X", items: [{ catalogoId, cantidad: 0 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("ITEMS_LISTA_INVALIDOS");

    const sinUbicacion = await COMPARAR(req("POST", { items: [{ catalogoId, cantidad: 1 }] }));
    expect(sinUbicacion.status).toBe(400);
    expect((await sinUbicacion.json()).error.code).toBe("UBICACION_INVALIDA");
  });
});
