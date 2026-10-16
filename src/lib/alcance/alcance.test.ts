import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { SAN_JUAN, obtenerAlcance, proximoUmbral, radioAlcanceKm } from "./alcance";

// 18-alcance.md
describe("radioAlcanceKm", () => {
  it("free con menos de 100 puntos: 3 km", () => {
    expect(radioAlcanceKm("free", 0)).toBe(3);
    expect(radioAlcanceKm("free", 99.9)).toBe(3);
    expect(radioAlcanceKm("free", -20)).toBe(3);
  });

  it("free 100–500: de 3 a 7 km, cóncavo", () => {
    expect(radioAlcanceKm("free", 100)).toBeCloseTo(3);
    expect(radioAlcanceKm("free", 300)).toBeCloseTo(6);
    expect(radioAlcanceKm("free", 500)).toBeCloseTo(7);
    // Crece cada vez menos: los primeros 200 puntos dan más que los segundos.
    expect(radioAlcanceKm("free", 300)! - radioAlcanceKm("free", 100)!).toBeGreaterThan(
      radioAlcanceKm("free", 500)! - radioAlcanceKm("free", 300)!
    );
  });

  it("free 500–1500: de 7 a 10 km, muy rápido entre 500 y 700", () => {
    expect(radioAlcanceKm("free", 700)).toBeCloseTo(7 + 3 * (1 - 0.8 ** 4));
    expect(radioAlcanceKm("free", 700)!).toBeGreaterThan(8.7);
    expect(radioAlcanceKm("free", 1200)).toBeCloseTo(9.9757, 3);
    expect(radioAlcanceKm("free", 1500)).toBeCloseTo(10);
  });

  it("free 1500–2000: lineal, 1 km cada 100 puntos; 2000 o más: 15 km", () => {
    expect(radioAlcanceKm("free", 1600)).toBeCloseTo(11);
    expect(radioAlcanceKm("free", 1850)).toBeCloseTo(13.5);
    expect(radioAlcanceKm("free", 2000)).toBe(15);
    expect(radioAlcanceKm("free", 50000)).toBe(15);
  });

  it("es continua y no decreciente", () => {
    let anterior = radioAlcanceKm("free", 0)!;
    for (let p = 0; p <= 2100; p += 5) {
      const r = radioAlcanceKm("free", p)!;
      expect(r).toBeGreaterThanOrEqual(anterior - 1e-9);
      expect(r - anterior).toBeLessThan(0.2);
      anterior = r;
    }
  });

  it("premium: 15 km; plata: toda la provincia (null)", () => {
    expect(radioAlcanceKm("premium", 0)).toBe(15);
    expect(radioAlcanceKm("plata", 0)).toBeNull();
  });

  it("el rectángulo de San Juan contiene a la capital", () => {
    expect(SAN_JUAN.latMin).toBeLessThan(-31.5375);
    expect(SAN_JUAN.latMax).toBeGreaterThan(-31.5375);
    expect(SAN_JUAN.lonMin).toBeLessThan(-68.5364);
    expect(SAN_JUAN.lonMax).toBeGreaterThan(-68.5364);
  });
});

describe("proximoUmbral", () => {
  it("devuelve el próximo km entero y los puntos mínimos para llegar", () => {
    expect(proximoUmbral("free", 0)).toEqual({ radioKm: 4, puntos: 154 });
    expect(proximoUmbral("free", 300)).toEqual({ radioKm: 7, puntos: 500 });
    expect(proximoUmbral("free", 500)).toEqual({ radioKm: 8, puntos: 597 });
    expect(proximoUmbral("free", 1600)).toEqual({ radioKm: 12, puntos: 1700 });
    expect(proximoUmbral("free", 1950)).toEqual({ radioKm: 15, puntos: 2000 });
  });

  it("con esos puntos se llega al radio prometido, con uno menos no", () => {
    for (const p of [0, 120, 300, 480, 500, 650, 900, 1400, 1550, 1999]) {
      const u = proximoUmbral("free", p)!;
      expect(radioAlcanceKm("free", u.puntos)!).toBeGreaterThanOrEqual(u.radioKm - 1e-9);
      expect(radioAlcanceKm("free", u.puntos - 1)!).toBeLessThan(u.radioKm);
    }
  });

  it("null con 15 km, premium o plata", () => {
    expect(proximoUmbral("free", 2000)).toBeNull();
    expect(proximoUmbral("premium", 0)).toBeNull();
    expect(proximoUmbral("plata", 0)).toBeNull();
  });
});

describe("obtenerAlcance", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await registrarUsuario({
      email: `test-alcance-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Alcance",
    });
  });

  afterEach(async () => {
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: usuario.id } });
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
  });

  it("un usuario nuevo es free con 0 puntos y 3 km", async () => {
    expect(await obtenerAlcance(usuario.id)).toEqual({
      invitado: false,
      plan: "free",
      puntos: 0,
      radioKm: 3,
      provincia: false,
      proximoUmbral: { radioKm: 4, puntos: 154 },
    });
  });

  it("usa los puntos acumulados y el plan del usuario", async () => {
    await prisma.eventoPuntos.create({ data: { usuarioId: usuario.id, tipo: "prueba", puntos: 300 } });
    const conPuntos = await obtenerAlcance(usuario.id);
    expect(conPuntos.puntos).toBe(300);
    expect(conPuntos.radioKm).toBeCloseTo(6);

    await prisma.usuario.update({ where: { id: usuario.id }, data: { plan: "plata" } });
    const plata = await obtenerAlcance(usuario.id);
    expect(plata).toMatchObject({ plan: "plata", radioKm: null, provincia: true, proximoUmbral: null });
  });

  it("invitado: alcance de un free con 0 puntos", async () => {
    expect(await obtenerAlcance(null)).toMatchObject({ invitado: true, plan: "free", puntos: 0, radioKm: 3 });
  });
});
