import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  registrarUsuario,
  buscarUsuarioPorEmail,
  verificarPassword,
  activarVendedor,
} from "./auth";

async function limpiarUsuario(email: string) {
  await prisma.usuario.deleteMany({ where: { email: email.toLowerCase() } });
}

describe("registrarUsuario", () => {
  const email = "test-registro@almacenia.test";

  beforeEach(() => limpiarUsuario(email));
  afterEach(() => limpiarUsuario(email));

  it("crea un usuario con esComprador=true y esVendedor=false por defecto", async () => {
    const usuario = await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    expect(usuario.email).toBe(email);
    expect(usuario.nombre).toBe("Ana");
    expect(usuario.esComprador).toBe(true);
    expect(usuario.esVendedor).toBe(false);
    expect(usuario.id).toBeTruthy();
  });

  it("normaliza el email a minúsculas", async () => {
    const usuario = await registrarUsuario({
      email: "Test-Registro@Almacenia.TEST",
      password: "password123",
      nombre: "Ana",
    });

    expect(usuario.email).toBe(email);
  });

  it("nunca devuelve el hash de la contraseña", async () => {
    const usuario = await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    expect(usuario).not.toHaveProperty("passwordHash");
  });

  it("lanza EMAIL_YA_REGISTRADO si el email ya existe (case-insensitive)", async () => {
    await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    await expect(
      registrarUsuario({ email: email.toUpperCase(), password: "otraPassword", nombre: "Otro" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "EMAIL_YA_REGISTRADO" });
  });

  it("lanza EMAIL_INVALIDO si el email no tiene formato válido", async () => {
    await expect(
      registrarUsuario({ email: "no-es-un-email", password: "password123", nombre: "Ana" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "EMAIL_INVALIDO" });
  });

  it("lanza PASSWORD_DEBIL si la contraseña tiene menos de 8 caracteres", async () => {
    await expect(
      registrarUsuario({ email, password: "1234567", nombre: "Ana" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PASSWORD_DEBIL" });
  });
});

describe("buscarUsuarioPorEmail", () => {
  const email = "test-busqueda@almacenia.test";

  beforeEach(() => limpiarUsuario(email));
  afterEach(() => limpiarUsuario(email));

  it("devuelve el usuario si existe", async () => {
    await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    const encontrado = await buscarUsuarioPorEmail(email);

    expect(encontrado?.email).toBe(email);
  });

  it("devuelve null si no existe", async () => {
    const encontrado = await buscarUsuarioPorEmail("no-existe@almacenia.test");

    expect(encontrado).toBeNull();
  });
});

describe("verificarPassword", () => {
  const email = "test-login@almacenia.test";

  beforeEach(() => limpiarUsuario(email));
  afterEach(() => limpiarUsuario(email));

  it("devuelve el usuario si la contraseña es correcta", async () => {
    await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    const usuario = await verificarPassword(email, "password123");

    expect(usuario?.email).toBe(email);
  });

  it("devuelve null si la contraseña es incorrecta", async () => {
    await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    const usuario = await verificarPassword(email, "incorrecta");

    expect(usuario).toBeNull();
  });

  it("devuelve null si el email no existe (mismo resultado que password incorrecta)", async () => {
    const usuario = await verificarPassword("no-existe@almacenia.test", "cualquiera");

    expect(usuario).toBeNull();
  });
});

describe("activarVendedor", () => {
  const email = "test-vendedor@almacenia.test";

  beforeEach(() => limpiarUsuario(email));
  afterEach(() => limpiarUsuario(email));

  it("pone esVendedor en true sin tocar esComprador", async () => {
    const usuario = await registrarUsuario({ email, password: "password123", nombre: "Ana" });

    const actualizado = await activarVendedor(usuario.id);

    expect(actualizado.esVendedor).toBe(true);
    expect(actualizado.esComprador).toBe(true);
  });
});
