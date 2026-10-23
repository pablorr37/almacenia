import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { puntosGanados, saldoPuntos, totalPuntos, TIPOS_NO_GANADOS } from "./gamificacion";

// 23-puntos-pagos.md: saldo (para gastar) vs. ganados (para el radio de alcance).
describe("saldo y puntos ganados", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await registrarUsuario({
      email: `test-saldo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@almacenia.test`,
      password: "password123",
      nombre: "Saldo",
    });
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
  });

  it("sin eventos, todo en 0", async () => {
    expect(await saldoPuntos(usuario.id)).toBe(0);
    expect(await puntosGanados(usuario.id)).toBe(0);
  });

  it("saldo = suma total; ganados = positivos sin transferencias recibidas ni reintegros", async () => {
    await prisma.eventoPuntos.createMany({
      data: [
        { usuarioId: usuario.id, tipo: "venta_realizada", puntos: 10.5 },
        { usuarioId: usuario.id, tipo: "checkin_gps", puntos: 1 },
        { usuarioId: usuario.id, tipo: "canje_publicidad", puntos: -5 },
        { usuarioId: usuario.id, tipo: "transferencia_enviada", puntos: -2 },
        { usuarioId: usuario.id, tipo: "transferencia_recibida", puntos: 3 },
        { usuarioId: usuario.id, tipo: "reintegro_publicidad", puntos: 1.5 },
      ],
    });
    expect(await saldoPuntos(usuario.id)).toBe(9);
    expect(await totalPuntos(usuario.id)).toBe(9);
    expect(await puntosGanados(usuario.id)).toBe(11.5);
    expect(TIPOS_NO_GANADOS).toEqual(expect.arrayContaining(["transferencia_recibida", "reintegro_publicidad"]));
  });
});
