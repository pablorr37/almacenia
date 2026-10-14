import { AppError } from "@/lib/errors";
import { respuestaExitosa, respuestaError } from "./api-response";

// 00-overview.md, "Sin caché": ninguna respuesta de la API se puede cachear.
describe("api-response: Cache-Control no-store", () => {
  it("en éxitos (con y sin paginado)", () => {
    expect(respuestaExitosa({ ok: true }).headers.get("cache-control")).toBe("no-store");
    expect(respuestaExitosa([], 200, { page: 1, pageSize: 20, total: 0 }).headers.get("cache-control")).toBe("no-store");
  });

  it("en errores conocidos y desconocidos", () => {
    expect(respuestaError(new AppError("TIENDA_NO_ENCONTRADA", "x")).headers.get("cache-control")).toBe("no-store");
    const desconocido = respuestaError(new Error("boom"));
    expect(desconocido.status).toBe(500);
    expect(desconocido.headers.get("cache-control")).toBe("no-store");
  });
});
