import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { transicionarVenta } from "@/lib/ventas/ventas";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/ventas/ventas", () => ({ transicionarVenta: vi.fn() }));

const vendedor: Usuario = {
  id: "v", email: "v@v.com", nombre: "V", esComprador: true, esVendedor: true,
  esAdmin: false, esTester: false, avatarUrl: null,
};
const req = (body: unknown) => new NextRequest("http://l/api/ventas/v1/transicion", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "v1" }) };

afterEach(() => vi.clearAllMocks());

describe("POST /api/ventas/:id/transicion", () => {
  it("401 sin sesión", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await POST(req({ accion: "cobrar" }), params)).status).toBe(401);
  });

  it("200 cobra la venta", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(vendedor);
    vi.mocked(transicionarVenta).mockResolvedValue({ id: "v1", estado: "cobrada" } as never);
    const res = await POST(req({ accion: "cobrar" }), params);
    expect(res.status).toBe(200);
    expect(transicionarVenta).toHaveBeenCalledWith(vendedor, "v1", "cobrar");
  });

  it("409 TRANSICION_INVALIDA", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(vendedor);
    vi.mocked(transicionarVenta).mockRejectedValue(new AppError("TRANSICION_INVALIDA", "x"));
    expect((await POST(req({ accion: "anular" }), params)).status).toBe(409);
  });
});
