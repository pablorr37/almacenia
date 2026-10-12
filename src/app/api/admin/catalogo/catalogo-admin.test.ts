import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { listarCatalogoDeCompradores, eliminarEntradaCatalogo } from "@/lib/admin/productos";
import { GET } from "../catalogo-compradores/route";
import { DELETE } from "./[id]/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/admin/productos", () => ({ listarCatalogoDeCompradores: vi.fn(), eliminarEntradaCatalogo: vi.fn() }));

const admin: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};

describe("catálogo de compradores (rutas admin)", () => {
  it("GET lista paginada; DELETE borra; 409 si está en uso", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(listarCatalogoDeCompradores).mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    expect((await GET(new NextRequest("http://l/api/admin/catalogo-compradores"))).status).toBe(200);

    vi.mocked(eliminarEntradaCatalogo).mockResolvedValue({ id: "c1" });
    const params = { params: Promise.resolve({ id: "c1" }) };
    expect((await DELETE(new NextRequest("http://l", { method: "DELETE" }), params)).status).toBe(200);
    vi.mocked(eliminarEntradaCatalogo).mockRejectedValue(new AppError("CATALOGO_EN_USO", "x"));
    expect((await DELETE(new NextRequest("http://l", { method: "DELETE" }), params)).status).toBe(409);
  });
});
