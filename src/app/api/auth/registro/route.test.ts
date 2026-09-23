import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/registro", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/registro", () => {
  const email = `test-registro-${Date.now()}@almacenia.test`;

  afterEach(() => prisma.usuario.deleteMany({ where: { email } }));

  it("201 y el usuario creado con esComprador=true, esVendedor=false", async () => {
    const res = await POST(req({ email, password: "password123", nombre: "Test" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({
      email,
      nombre: "Test",
      esComprador: true,
      esVendedor: false,
    });
    expect(body.data.id).toEqual(expect.any(String));
  });

  it("409 EMAIL_YA_REGISTRADO si el email ya existe", async () => {
    await POST(req({ email, password: "password123", nombre: "Test" }));
    const res = await POST(req({ email, password: "otraPassword", nombre: "Otro" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("EMAIL_YA_REGISTRADO");
  });
});
