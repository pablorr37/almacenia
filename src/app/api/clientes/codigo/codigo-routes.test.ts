import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { generarCodigoCliente, resolverCodigoCliente } from "@/lib/clientes/codigo-cliente";
import { POST } from "../../auth/perfil/codigo/route";
import { GET } from "./[codigo]/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/clientes/codigo-cliente", () => ({ generarCodigoCliente: vi.fn(), resolverCodigoCliente: vi.fn() }));

const base: Usuario = {
  id: "u", email: "u@u.com", nombre: "U", esComprador: true, esVendedor: false,
  esAdmin: false, esTester: false, avatarUrl: null,
};
const params = (codigo: string) => ({ params: Promise.resolve({ codigo }) });

afterEach(() => vi.clearAllMocks());

describe("códigos de cliente (rutas)", () => {
  it("POST /api/auth/perfil/codigo: 401 sin sesión, 201 con el código", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(base);
    vi.mocked(generarCodigoCliente).mockResolvedValue({ codigo: "123456", expiraEn: "x" });
    const res = await POST();
    expect(res.status).toBe(201);
    expect((await res.json()).data.codigo).toBe("123456");
  });

  it("GET /api/clientes/codigo/:codigo: solo vendedores; devuelve solo el nombre; 400 si venció", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(base);
    expect((await GET(new NextRequest("http://l"), params("123456"))).status).toBe(403);

    vi.mocked(obtenerUsuarioActual).mockResolvedValue({ ...base, esVendedor: true });
    vi.mocked(resolverCodigoCliente).mockResolvedValue({ id: "c", nombre: "María" });
    const res = await GET(new NextRequest("http://l"), params("123456"));
    expect(await res.json()).toEqual({ data: { nombre: "María" } });

    vi.mocked(resolverCodigoCliente).mockRejectedValue(new AppError("CODIGO_CLIENTE_INVALIDO", "x"));
    expect((await GET(new NextRequest("http://l"), params("999999"))).status).toBe(400);
  });
});
