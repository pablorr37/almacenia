import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function req(body: unknown) {
  return new NextRequest("http://localhost/api/tiendas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

let usuario: Usuario;

async function crearUsuarioDePrueba(): Promise<Usuario> {
  return registrarUsuario({
    email: `test-tiendas-route-${Date.now()}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
}

describe("POST /api/tiendas", () => {
  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: usuario.id } });
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
    vi.clearAllMocks();
  });

  it("401 NO_AUTENTICADO sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);

    const res = await POST(req({ nombre: "X", direccion: "Y", lat: 0, lon: 0 }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("NO_AUTENTICADO");
  });

  it("201 crea la tienda con sesión válida", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(usuario);

    const res = await POST(
      req({
        nombre: "Almacén Don José",
        direccion: "Av. Siempre Viva 123",
        lat: -34.6037,
        lon: -58.3816,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.nombre).toBe("Almacén Don José");
    expect(body.data.vendedorId).toBe(usuario.id);
  });

  it("400 UBICACION_INVALIDA con lat fuera de rango", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(usuario);

    const res = await POST(req({ nombre: "X", direccion: "Y", lat: 999, lon: 0 }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("UBICACION_INVALIDA");
  });
});
