import { NextRequest } from "next/server";
import type { Usuario } from "@/lib/auth/auth";
import { AppError } from "@/lib/errors";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { libroVentasCsv, rentabilidadSucursales } from "@/lib/ventas/balance";
import { GET as GET_LIBRO } from "@/app/api/tiendas/[tiendaId]/balance/libro.csv/route";
import { GET as GET_SUCURSALES } from "./sucursales/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/ventas/balance", () => ({ libroVentasCsv: vi.fn(), rentabilidadSucursales: vi.fn() }));
const u = { id: "u1" } as Usuario;
afterEach(() => vi.clearAllMocks());

// 20-precios-facturacion.md
describe("libro de ventas CSV y rentabilidad por sucursal", () => {
  it("libro.csv: text/csv como adjunto con el rango; 403 PLAN_INSUFICIENTE en JSON", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(u);
    vi.mocked(libroVentasCsv).mockResolvedValue("﻿Fecha;Venta\r\n");
    const res = await GET_LIBRO(new NextRequest("http://l/x?desde=2026-10-01&hasta=2026-10-07"), { params: Promise.resolve({ tiendaId: "t1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("libro-ventas-2026-10-01-a-2026-10-07.csv");
    expect(libroVentasCsv).toHaveBeenCalledWith(u, "t1", { desde: "2026-10-01", hasta: "2026-10-07" });

    vi.mocked(libroVentasCsv).mockRejectedValue(new AppError("PLAN_INSUFICIENTE", "x"));
    const no = await GET_LIBRO(new NextRequest("http://l/x"), { params: Promise.resolve({ tiendaId: "t1" }) });
    expect(no.status).toBe(403);
  });

  it("sucursales: 401 sin sesión; 200 con datos", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await GET_SUCURSALES(new NextRequest("http://l/x"))).status).toBe(401);
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(u);
    vi.mocked(rentabilidadSucursales).mockResolvedValue([]);
    expect((await GET_SUCURSALES(new NextRequest("http://l/x"))).status).toBe(200);
  });
});
