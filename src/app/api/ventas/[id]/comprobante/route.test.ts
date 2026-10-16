import { NextRequest } from "next/server";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { emitirComprobante, obtenerComprobante } from "@/lib/facturacion/comprobantes";
import { POST, GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/facturacion/comprobantes", () => ({ emitirComprobante: vi.fn(), obtenerComprobante: vi.fn() }));

const u = { id: "u1" } as Usuario;
const ctx = { params: Promise.resolve({ id: "v1" }) };
afterEach(() => vi.clearAllMocks());

// 20-precios-facturacion.md
describe("/api/ventas/:id/comprobante", () => {
  it("401 sin sesión", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await GET(new NextRequest("http://l/x"), ctx)).status).toBe(401);
  });

  it("POST 201 con los datos del cliente", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(u);
    vi.mocked(emitirComprobante).mockResolvedValue({ id: "c1" } as never);
    const cliente = { docTipo: "DNI", doc: "30111222" };
    const res = await POST(new NextRequest("http://l/x", { method: "POST", body: JSON.stringify({ cliente }) }), ctx);
    expect(res.status).toBe(201);
    expect(emitirComprobante).toHaveBeenCalledWith(u, "v1", cliente);
  });

  it("GET 200", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(u);
    vi.mocked(obtenerComprobante).mockResolvedValue({ id: "c1" } as never);
    expect((await GET(new NextRequest("http://l/x"), ctx)).status).toBe(200);
  });
});
