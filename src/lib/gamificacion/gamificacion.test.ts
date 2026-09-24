import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { registrarEvento, totalPuntos } from "./gamificacion";

let contador = 0;
async function crearUsuarioDePrueba(): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-gamificacion-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Usuario de prueba",
  });
}

async function limpiar(usuarioId: string) {
  await prisma.eventoPuntos.deleteMany({ where: { usuarioId } });
  await prisma.usuario.deleteMany({ where: { id: usuarioId } });
}

describe("registrarEvento", () => {
  let usuario: Usuario;
  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });
  afterEach(() => limpiar(usuario.id));

  it("crea el evento con el tipo, puntos y metadata dados", async () => {
    const evento = await registrarEvento(usuario.id, "compra_completada", 10, { pedidoId: "abc" });

    expect(evento.usuarioId).toBe(usuario.id);
    expect(evento.tipo).toBe("compra_completada");
    expect(evento.puntos).toBe(10);
    expect(evento.metadata).toEqual({ pedidoId: "abc" });
  });

  it("permite puntos negativos", async () => {
    const evento = await registrarEvento(usuario.id, "penalizacion", -5);
    expect(evento.puntos).toBe(-5);
  });

  it("metadata es null si no se pasa", async () => {
    const evento = await registrarEvento(usuario.id, "primera_venta", 20);
    expect(evento.metadata).toBeNull();
  });
});

describe("totalPuntos", () => {
  let usuario: Usuario;
  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });
  afterEach(() => limpiar(usuario.id));

  it("devuelve 0 sin eventos", async () => {
    expect(await totalPuntos(usuario.id)).toBe(0);
  });

  it("suma los puntos de todos los eventos del usuario", async () => {
    await registrarEvento(usuario.id, "compra_completada", 10);
    await registrarEvento(usuario.id, "resena_dejada", 5);
    await registrarEvento(usuario.id, "penalizacion", -3);

    expect(await totalPuntos(usuario.id)).toBe(12);
  });
});
