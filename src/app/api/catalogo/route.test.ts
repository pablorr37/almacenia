import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { sumarAlCatalogo } from "@/lib/catalogo/catalogo";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/catalogo/catalogo", () => ({ sumarAlCatalogo: vi.fn() }));

const u: Usuario = {
  id: "u", email: "u@u.com", nombre: "U", esComprador: true, esVendedor: false,
  esAdmin: false, esTester: false, avatarUrl: null,
};
const req = (body: unknown) => new NextRequest("http://l/api/catalogo", { method: "POST", body: JSON.stringify(body) });

afterEach(() => vi.clearAllMocks());

describe("POST /api/catalogo", () => {
  it("401 sin sesión; 201 si lo crea; 200 si ya existía; 400 con groserías", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await POST(req({ nombre: "Fernet" }))).status).toBe(401);

    vi.mocked(obtenerUsuarioActual).mockResolvedValue(u);
    vi.mocked(sumarAlCatalogo).mockResolvedValue({ producto: { id: "c1" } as never, creado: true });
    const res = await POST(req({ categoriaId: "cat", marca: "Branca", contenido: 750, unidadContenido: "ml", unidad: "unidad" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: "c1" }, creado: true });
    expect(sumarAlCatalogo).toHaveBeenCalledWith(u, {
      categoriaId: "cat",
      categoriaNueva: undefined,
      marca: "Branca",
      variante: undefined,
      contenido: 750,
      unidadContenido: "ml",
      unidad: "unidad",
    });

    // 17-rubros-categorias.md: categoría nueva (premium o mayor).
    await POST(req({ categoriaNueva: "Hongos", variante: "secos" }));
    expect(sumarAlCatalogo).toHaveBeenLastCalledWith(u, expect.objectContaining({ categoriaNueva: "Hongos", variante: "secos" }));

    vi.mocked(sumarAlCatalogo).mockResolvedValue({ producto: { id: "c1" } as never, creado: false });
    expect((await POST(req({ nombre: "Fernet" }))).status).toBe(200);

    vi.mocked(sumarAlCatalogo).mockRejectedValue(new AppError("TEXTO_NO_PERMITIDO", "x"));
    expect((await POST(req({ nombre: "boludo" }))).status).toBe(400);
  });
});
