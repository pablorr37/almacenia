import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";

vi.mock("@/lib/archivos/archivos", () => ({
  probarAlmacenamiento: vi.fn(async () => ({ ok: false, bucket: "b", endpoint: "http://minio:9000", error: "AccessDenied: x" })),
}));

import { diagnosticar } from "./diagnostico";

const base: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};

describe("diagnosticar", () => {
  it("informa base de datos y almacenamiento", async () => {
    expect(await diagnosticar(base)).toEqual({
      db: "ok",
      almacenamiento: { ok: false, bucket: "b", endpoint: "http://minio:9000", error: "AccessDenied: x" },
    });
  });

  it("FORBIDDEN si no es admin", async () => {
    await expect(diagnosticar({ ...base, esAdmin: false })).rejects.toMatchObject<Partial<AppError>>({ code: "FORBIDDEN" });
  });
});
