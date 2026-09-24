import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, buscarUsuarioPorEmail, type Usuario } from "@/lib/auth/auth";
import {
  crearTienda,
  buscarTiendasCercanas,
  obtenerTienda,
  obtenerTiendaPorVendedor,
  actualizarTienda,
  horarioValido,
  type HorarioTienda,
} from "./tiendas";

let contador = 0;
async function crearUsuarioDePrueba(): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-tiendas-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
}

async function limpiar(usuarioIds: string[]) {
  await prisma.horarioTienda.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

function semanaCompleta(overrides: Partial<Record<number, Partial<HorarioTienda>>> = {}): HorarioTienda[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    abre: "09:00",
    cierra: "21:00",
    ...overrides[diaSemana],
  }));
}

// Buenos Aires, Argentina (Obelisco) como referencia para las coordenadas de prueba.
const LAT_BASE = -34.6037;
const LON_BASE = -58.3816;

describe("crearTienda", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });

  afterEach(() => limpiar([usuario.id]));

  it("crea la tienda con los datos dados y activa=true por defecto", async () => {
    const tienda = await crearTienda(usuario, {
      nombre: "Almacén Don José",
      descripcion: "Almacén de barrio",
      direccion: "Av. Siempre Viva 123",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    expect(tienda.vendedorId).toBe(usuario.id);
    expect(tienda.nombre).toBe("Almacén Don José");
    expect(tienda.descripcion).toBe("Almacén de barrio");
    expect(tienda.direccion).toBe("Av. Siempre Viva 123");
    expect(tienda.lat).toBeCloseTo(LAT_BASE, 5);
    expect(tienda.lon).toBeCloseTo(LON_BASE, 5);
    expect(tienda.activa).toBe(true);
  });

  it("activa esVendedor=true en el usuario al crear la tienda", async () => {
    expect(usuario.esVendedor).toBe(false);

    await crearTienda(usuario, {
      nombre: "Almacén Don José",
      direccion: "Av. Siempre Viva 123",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    const actualizado = await buscarUsuarioPorEmail(usuario.email);
    expect(actualizado?.esVendedor).toBe(true);
  });

  it("lanza USUARIO_YA_TIENE_TIENDA si el usuario ya tiene una tienda", async () => {
    await crearTienda(usuario, {
      nombre: "Primera tienda",
      direccion: "Dirección 1",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    await expect(
      crearTienda(usuario, {
        nombre: "Segunda tienda",
        direccion: "Dirección 2",
        lat: LAT_BASE,
        lon: LON_BASE,
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "USUARIO_YA_TIENE_TIENDA" });
  });

  it.each([
    ["lat fuera de rango (91)", { lat: 91, lon: LON_BASE }],
    ["lat fuera de rango (-91)", { lat: -91, lon: LON_BASE }],
    ["lon fuera de rango (181)", { lat: LAT_BASE, lon: 181 }],
    ["lon fuera de rango (-181)", { lat: LAT_BASE, lon: -181 }],
    ["lat no numérica", { lat: NaN, lon: LON_BASE }],
  ])("lanza UBICACION_INVALIDA: %s", async (_desc, coords) => {
    await expect(
      crearTienda(usuario, {
        nombre: "Tienda inválida",
        direccion: "Dirección",
        ...coords,
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "UBICACION_INVALIDA" });
  });

  it("crea la tienda con mediosDePago y horarios cuando se mandan", async () => {
    const tienda = await crearTienda(usuario, {
      nombre: "Almacén Don José",
      direccion: "Av. Siempre Viva 123",
      lat: LAT_BASE,
      lon: LON_BASE,
      mediosDePago: ["efectivo", "transferencia"],
      horarios: semanaCompleta({ 0: { abre: null, cierra: null } }),
    });

    expect(tienda.mediosDePago.sort()).toEqual(["efectivo", "transferencia"].sort());
    expect(tienda.horarios).toHaveLength(7);
    const domingo = tienda.horarios.find((h) => h.diaSemana === 0);
    expect(domingo).toMatchObject({ abre: null, cierra: null });
    const lunes = tienda.horarios.find((h) => h.diaSemana === 1);
    expect(lunes).toMatchObject({ abre: "09:00", cierra: "21:00" });
  });

  it("crea la tienda con mediosDePago=[] y horarios=[] por defecto si no se mandan", async () => {
    const tienda = await crearTienda(usuario, {
      nombre: "Almacén sin extras",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    expect(tienda.mediosDePago).toEqual([]);
    expect(tienda.horarios).toEqual([]);
  });

  it("lanza HORARIO_INVALIDO si horarios no trae las 7 entradas", async () => {
    await expect(
      crearTienda(usuario, {
        nombre: "Tienda inválida",
        direccion: "Dirección",
        lat: LAT_BASE,
        lon: LON_BASE,
        horarios: semanaCompleta().slice(0, 3),
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "HORARIO_INVALIDO" });
  });
});

describe("horarioValido", () => {
  it("acepta una semana completa con todos los días abiertos", () => {
    expect(horarioValido(semanaCompleta())).toBe(true);
  });

  it("acepta días cerrados (abre y cierra ambos null)", () => {
    expect(horarioValido(semanaCompleta({ 0: { abre: null, cierra: null } }))).toBe(true);
  });

  it("rechaza si no vienen las 7 entradas", () => {
    expect(horarioValido(semanaCompleta().slice(0, 6))).toBe(false);
  });

  it("rechaza diaSemana repetido", () => {
    const horarios = semanaCompleta();
    horarios[6] = { ...horarios[6], diaSemana: 0 };
    expect(horarioValido(horarios)).toBe(false);
  });

  it("rechaza diaSemana fuera de 0-6", () => {
    const horarios = semanaCompleta();
    horarios[0] = { ...horarios[0], diaSemana: 7 };
    expect(horarioValido(horarios)).toBe(false);
  });

  it("rechaza abre sin cierra (o viceversa)", () => {
    expect(horarioValido(semanaCompleta({ 0: { cierra: null } }))).toBe(false);
  });

  it("rechaza formato de hora inválido", () => {
    expect(horarioValido(semanaCompleta({ 0: { abre: "9:00" } }))).toBe(false);
    expect(horarioValido(semanaCompleta({ 0: { abre: "25:00" } }))).toBe(false);
  });

  it("rechaza abre >= cierra en un día abierto", () => {
    expect(horarioValido(semanaCompleta({ 0: { abre: "21:00", cierra: "09:00" } }))).toBe(false);
    expect(horarioValido(semanaCompleta({ 0: { abre: "09:00", cierra: "09:00" } }))).toBe(false);
  });
});

describe("buscarTiendasCercanas", () => {
  let cercana: Usuario;
  let lejana: Usuario;
  let inactiva: Usuario;

  beforeEach(async () => {
    cercana = await crearUsuarioDePrueba();
    lejana = await crearUsuarioDePrueba();
    inactiva = await crearUsuarioDePrueba();

    // ~1km al norte del punto base.
    await crearTienda(cercana, {
      nombre: "Tienda cercana",
      direccion: "Dirección cercana",
      lat: LAT_BASE + 0.009,
      lon: LON_BASE,
    });

    // A gran distancia (Córdoba, Argentina), fuera del radio de búsqueda.
    await crearTienda(lejana, {
      nombre: "Tienda lejana",
      direccion: "Dirección lejana",
      lat: -31.4201,
      lon: -64.1888,
    });

    const tiendaInactiva = await crearTienda(inactiva, {
      nombre: "Tienda inactiva",
      direccion: "Dirección inactiva",
      lat: LAT_BASE + 0.001,
      lon: LON_BASE,
    });
    await actualizarTienda(inactiva, tiendaInactiva.id, { activa: false });
  });

  afterEach(() => limpiar([cercana.id, lejana.id, inactiva.id]));

  it("devuelve solo las tiendas activas dentro del radio, ordenadas por distancia ascendente", async () => {
    const resultado = await buscarTiendasCercanas({ lat: LAT_BASE, lon: LON_BASE, radioKm: 5 });

    const nombres = resultado.map((t) => t.nombre);
    expect(nombres).toContain("Tienda cercana");
    expect(nombres).not.toContain("Tienda lejana");
    expect(nombres).not.toContain("Tienda inactiva");

    for (let i = 1; i < resultado.length; i++) {
      expect(resultado[i].distanciaKm).toBeGreaterThanOrEqual(resultado[i - 1].distanciaKm);
    }
  });

  it("incluye horarios y mediosDePago en cada resultado", async () => {
    const resultado = await buscarTiendasCercanas({ lat: LAT_BASE, lon: LON_BASE, radioKm: 5 });

    const tiendaCercana = resultado.find((t) => t.nombre === "Tienda cercana");
    expect(tiendaCercana?.mediosDePago).toEqual([]);
    expect(tiendaCercana?.horarios).toEqual([]);
  });

  it("usa radioKm=5 por defecto", async () => {
    const resultado = await buscarTiendasCercanas({ lat: LAT_BASE, lon: LON_BASE });

    expect(resultado.map((t) => t.nombre)).toContain("Tienda cercana");
  });

  it.each([
    ["radioKm=0", 0],
    ["radioKm negativo", -1],
    ["radioKm > 50", 51],
  ])("lanza RADIO_INVALIDO: %s", async (_desc, radioKm) => {
    await expect(
      buscarTiendasCercanas({ lat: LAT_BASE, lon: LON_BASE, radioKm })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "RADIO_INVALIDO" });
  });
});

describe("obtenerTienda", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });

  afterEach(() => limpiar([usuario.id]));

  it("devuelve la tienda por id", async () => {
    const creada = await crearTienda(usuario, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    const encontrada = await obtenerTienda(creada.id);

    expect(encontrada?.id).toBe(creada.id);
    expect(encontrada?.nombre).toBe("Mi tienda");
  });

  it("devuelve null si no existe", async () => {
    const encontrada = await obtenerTienda("00000000-0000-0000-0000-000000000000");

    expect(encontrada).toBeNull();
  });

  it("incluye horarios y mediosDePago de la tienda", async () => {
    const creada = await crearTienda(usuario, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
      mediosDePago: ["debito"],
      horarios: semanaCompleta(),
    });

    const encontrada = await obtenerTienda(creada.id);

    expect(encontrada?.mediosDePago).toEqual(["debito"]);
    expect(encontrada?.horarios).toHaveLength(7);
  });
});

describe("obtenerTiendaPorVendedor", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });

  afterEach(() => limpiar([usuario.id]));

  it("devuelve la tienda del vendedor dado", async () => {
    const creada = await crearTienda(usuario, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    const encontrada = await obtenerTiendaPorVendedor(usuario.id);

    expect(encontrada?.id).toBe(creada.id);
    expect(encontrada?.vendedorId).toBe(usuario.id);
  });

  it("devuelve null si el usuario no tiene tienda", async () => {
    const encontrada = await obtenerTiendaPorVendedor(usuario.id);

    expect(encontrada).toBeNull();
  });
});

describe("actualizarTienda", () => {
  let dueno: Usuario;
  let otro: Usuario;

  beforeEach(async () => {
    dueno = await crearUsuarioDePrueba();
    otro = await crearUsuarioDePrueba();
  });

  afterEach(() => limpiar([dueno.id, otro.id]));

  it("permite al dueño actualizar sus datos", async () => {
    const tienda = await crearTienda(dueno, {
      nombre: "Nombre original",
      direccion: "Dirección original",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    const actualizada = await actualizarTienda(dueno, tienda.id, {
      nombre: "Nombre nuevo",
      activa: false,
    });

    expect(actualizada.nombre).toBe("Nombre nuevo");
    expect(actualizada.activa).toBe(false);
    expect(actualizada.direccion).toBe("Dirección original");
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si el usuario no es el dueño", async () => {
    const tienda = await crearTienda(dueno, {
      nombre: "Nombre original",
      direccion: "Dirección original",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    await expect(
      actualizarTienda(otro, tienda.id, { nombre: "Intento ajeno" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_ES_DUENO_DE_TIENDA" });
  });

  it("lanza TIENDA_NO_ENCONTRADA si el id no existe", async () => {
    await expect(
      actualizarTienda(dueno, "00000000-0000-0000-0000-000000000000", { nombre: "X" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });

  it("reemplaza los horarios y medios de pago existentes", async () => {
    const tienda = await crearTienda(dueno, {
      nombre: "Tienda con horario",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
      mediosDePago: ["efectivo"],
      horarios: semanaCompleta(),
    });

    const actualizada = await actualizarTienda(dueno, tienda.id, {
      mediosDePago: ["qr", "mercado_pago"],
      horarios: semanaCompleta({ 0: { abre: null, cierra: null }, 6: { abre: null, cierra: null } }),
    });

    expect(actualizada.mediosDePago.sort()).toEqual(["mercado_pago", "qr"].sort());
    expect(actualizada.horarios).toHaveLength(7);
    expect(actualizada.horarios.find((h) => h.diaSemana === 0)).toMatchObject({
      abre: null,
      cierra: null,
    });
    expect(actualizada.horarios.find((h) => h.diaSemana === 6)).toMatchObject({
      abre: null,
      cierra: null,
    });
  });

  it("lanza HORARIO_INVALIDO al actualizar con horarios incompletos", async () => {
    const tienda = await crearTienda(dueno, {
      nombre: "Tienda",
      direccion: "Dirección",
      lat: LAT_BASE,
      lon: LON_BASE,
    });

    await expect(
      actualizarTienda(dueno, tienda.id, { horarios: semanaCompleta().slice(0, 2) })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "HORARIO_INVALIDO" });
  });
});
