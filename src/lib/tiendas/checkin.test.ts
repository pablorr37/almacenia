import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { totalPuntos } from "@/lib/gamificacion/gamificacion";
import { hacerCheckIn, RADIO_CHECKIN_METROS } from "./checkin";

// Plaza 25 de Mayo, San Juan.
const LAT = -31.5375;
const LON = -68.5364;

describe("hacerCheckIn (02-tiendas.md)", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    vendedor = await registrarUsuario({ email: `test-checkin-v-${Date.now()}@almacenia.test`, password: "password123", nombre: "V" });
    comprador = await registrarUsuario({ email: `test-checkin-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: LAT, lon: LON });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id] } } });
  });

  it("el radio es de 100 m", () => {
    expect(RADIO_CHECKIN_METROS).toBe(100);
  });

  it("registra el check-in estando a menos de 100 m y otorga 1 punto", async () => {
    // ~30 m al norte
    const r = await hacerCheckIn(comprador, tienda.id, { lat: LAT + 0.00027, lon: LON });
    expect(r.puntosOtorgados).toBe(1);
    expect(r.checkIn.distanciaM).toBeGreaterThan(20);
    expect(r.checkIn.distanciaM).toBeLessThan(40);
    expect(await totalPuntos(comprador.id)).toBe(1);
  });

  it("segundo check-in el mismo día: se guarda pero no suma", async () => {
    await hacerCheckIn(comprador, tienda.id, { lat: LAT, lon: LON });
    const r = await hacerCheckIn(comprador, tienda.id, { lat: LAT, lon: LON });
    expect(r.puntosOtorgados).toBe(0);
    expect(await prisma.checkInTienda.count({ where: { compradorId: comprador.id } })).toBe(2);
  });

  it("CHECKIN_FUERA_DE_RANGO a más de 100 m (~500 m)", async () => {
    await expect(hacerCheckIn(comprador, tienda.id, { lat: LAT + 0.0045, lon: LON })).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "CHECKIN_FUERA_DE_RANGO" });
  });

  it("CHECKIN_TIENDA_PROPIA para el dueño", async () => {
    await expect(hacerCheckIn(vendedor, tienda.id, { lat: LAT, lon: LON })).rejects.toMatchObject<Partial<AppError>>({
      code: "CHECKIN_TIENDA_PROPIA",
    });
  });

  it("UBICACION_INVALIDA y TIENDA_NO_ENCONTRADA", async () => {
    await expect(hacerCheckIn(comprador, tienda.id, { lat: 200, lon: LON })).rejects.toMatchObject<Partial<AppError>>({
      code: "UBICACION_INVALIDA",
    });
    await expect(
      hacerCheckIn(comprador, "00000000-0000-0000-0000-000000000000", { lat: LAT, lon: LON })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });
});
