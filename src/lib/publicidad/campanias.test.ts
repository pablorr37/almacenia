import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, buscarTiendasCercanas, type Tienda } from "@/lib/tiendas/tiendas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { saldoPuntos } from "@/lib/gamificacion/gamificacion";
import { reemplazarCanalesParaTests } from "@/lib/notificaciones/canales";
import { guardarPreferencia } from "@/lib/notificaciones/notificaciones";
import { confirmarOrdenManual } from "@/lib/pagos/ordenes";

vi.mock("@/lib/archivos/archivos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/archivos/archivos")>();
  return {
    ...real,
    subirArchivo: vi.fn(async (input: { tipo: string; entidadId: string; contentType: string; buffer: Buffer }) => {
      real.validarImagen(input.contentType, input.buffer.byteLength);
      return { url: `http://bucket.test/${input.tipo}/${input.entidadId}/x.webp` };
    }),
  };
});

import {
  crearCampania,
  listarCampaniasTienda,
  pausarCampania,
  reanudarCampania,
  finalizarCampania,
  moderarCampania,
  listarCampaniasAdmin,
  actualizarDiasCampanias,
  tiendasDestacadas,
} from "./campanias";
import { elegirAviso, registrarImpresion, registrarClic } from "./rotador";
import { procesarPublicidadPush } from "./push";
import { verificarToken } from "./token";

// 21-publicidad.md
const HOY = "2026-10-23";
const ahora = new Date(`${HOY}T15:00:00Z`); // 12:00 en San Juan
const DIA = 24 * 60 * 60 * 1000;
const enDias = (d: number) => new Date(ahora.getTime() + d * DIA);
const UA = "Mozilla/5.0 (Linux; Android 14) Chrome/130";

const creados: string[] = [];
let n = 0;
async function usuario(nombre: string, extra: Record<string, unknown> = {}): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-publi-${nombre}-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  if (Object.keys(extra).length) await prisma.usuario.update({ where: { id: u.id }, data: extra });
  return { ...u, ...extra } as Usuario;
}
const darPuntos = (u: Usuario, puntos: number) => prisma.eventoPuntos.create({ data: { usuarioId: u.id, tipo: "prueba", puntos } });

let dueno: Usuario;
let admin: Usuario;
let tienda: Tienda;
const texto = (extra: Record<string, unknown> = {}) => ({
  espacio: "inicio" as const,
  titulo: "Promo verano",
  desde: HOY,
  dias: 3,
  pago: "puntos" as const,
  texto: "Yerba 2x1 todo el fin de semana",
  ...extra,
});

beforeAll(() =>
  reemplazarCanalesParaTests({
    push: { habilitado: () => false, enviar: async () => "ok" as const },
    email: { habilitado: () => false, enviar: async () => {} },
  })
);
afterAll(() => reemplazarCanalesParaTests(null));

beforeEach(async () => {
  dueno = await usuario("dueno");
  admin = await usuario("admin", { esAdmin: true });
  tienda = await crearTienda(dueno, { nombre: "Almacén Publi", direccion: "D", lat: -31.53, lon: -68.52 });
  await darPuntos(dueno, 1000);
});

afterEach(async () => {
  await prisma.configuracionSistema.deleteMany({});
  await prisma.campaniaAviso.deleteMany({ where: { tienda: { vendedorId: { in: creados } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

async function activa(extra: Record<string, unknown> = {}) {
  const { campania } = await crearCampania(dueno, tienda.id, texto(extra), ahora);
  return moderarCampania(admin, campania.id, { aprobar: true }, ahora);
}

describe("alta y pago", () => {
  it("con puntos: cobra días × precio, queda en moderación con su pieza", async () => {
    const { campania, orden } = await crearCampania(dueno, tienda.id, texto(), ahora);
    expect(orden).toBeUndefined();
    expect(campania).toMatchObject({ estado: "en_moderacion", dias: 3, pago: "puntos", puntosPagados: 300, desde: HOY });
    expect(campania.pieza).toMatchObject({ tipo: "texto", texto: "Yerba 2x1 todo el fin de semana", destino: null });
    expect(await saldoPuntos(dueno.id)).toBe(700);
  });

  it("con pesos: crea la orden y queda pendiente de pago; al confirmarse pasa a moderación", async () => {
    const { campania, orden } = await crearCampania(dueno, tienda.id, texto({ pago: "pesos", espacio: "pin_mapa", texto: undefined }), ahora);
    expect(campania.estado).toBe("pendiente_pago");
    expect(orden?.orden).toMatchObject({ concepto: "publicidad", montoArs: 1500, referenciaId: campania.id });
    await confirmarOrdenManual(admin, orden!.orden.id);
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: campania.id } })).estado).toBe("en_moderacion");
  });

  it("con imagen: se procesa y se guarda la URL con sus medidas", async () => {
    const png = await sharp({ create: { width: 640, height: 200, channels: 3, background: "#0a7" } }).png().toBuffer();
    const { campania } = await crearCampania(dueno, tienda.id, texto({ texto: undefined, imagen: { buffer: png, contentType: "image/png" } }), ahora);
    expect(campania.pieza).toMatchObject({ tipo: "imagen", ancho: 640, alto: 200 });
    expect(campania.pieza?.imagenUrl).toMatch(/^http:\/\/bucket\.test\/aviso\//);
  });

  it("validaciones", async () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ espacio: "techo" }, "ESPACIO_INVALIDO"],
      [{ desde: "2026-10-22" }, "FECHA_INVALIDA"],
      [{ desde: "23/10/2026" }, "FECHA_INVALIDA"],
      [{ dias: 0 }, "DIAS_INVALIDOS"],
      [{ dias: 91 }, "DIAS_INVALIDOS"],
      [{ pago: "tarjeta" }, "PAGO_INVALIDO"],
      [{ texto: undefined }, "PIEZA_REQUERIDA"],
      [{ texto: "x".repeat(141) }, "TEXTO_INVALIDO"],
      [{ destino: "//evil.com" }, "DESTINO_INVALIDO"],
      [{ titulo: " " }, "TITULO_INVALIDO"],
      [{ dias: 20 }, "PUNTOS_INSUFICIENTES"],
    ];
    for (const [extra, code] of casos) {
      await expect(crearCampania(dueno, tienda.id, texto(extra), ahora)).rejects.toMatchObject({ code });
    }
    expect(await saldoPuntos(dueno.id)).toBe(1000);
  });

  it("permiso publicidad: un empleado sin el permiso no puede; con el permiso paga con sus puntos", async () => {
    const emp = await usuario("emp");
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });
    await expect(crearCampania(emp, tienda.id, texto(), ahora)).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await prisma.miembroTienda.update({
      where: { tiendaId_usuarioId: { tiendaId: tienda.id, usuarioId: emp.id } },
      data: { permisos: ["vender", "publicidad"] },
    });
    await darPuntos(emp, 300);
    await crearCampania(emp, tienda.id, texto(), ahora);
    expect(await saldoPuntos(emp.id)).toBe(0);
    expect(await saldoPuntos(dueno.id)).toBe(1000);
    expect(await listarCampaniasTienda(emp, tienda.id)).toHaveLength(1);
  });
});

describe("moderación, pausa, finalización y días", () => {
  it("rechazar exige motivo, reintegra todo y notifica", async () => {
    const { campania } = await crearCampania(dueno, tienda.id, texto(), ahora);
    await expect(moderarCampania(admin, campania.id, { aprobar: false }, ahora)).rejects.toMatchObject({ code: "MOTIVO_REQUERIDO" });
    await expect(moderarCampania(dueno, campania.id, { aprobar: true }, ahora)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const r = await moderarCampania(admin, campania.id, { aprobar: false, motivo: "Imagen engañosa" }, ahora);
    expect(r).toMatchObject({ estado: "rechazada", motivoRechazo: "Imagen engañosa" });
    expect(await saldoPuntos(dueno.id)).toBe(1000);
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "campania_rechazada" } })).toBe(1);
    await expect(moderarCampania(admin, campania.id, { aprobar: true }, ahora)).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
  });

  it("aprobar → activa y consume hoy; los días pausados no se consumen; al agotarse finaliza", async () => {
    const c = await activa({ dias: 2 });
    expect(c.estado).toBe("activa");
    expect(await prisma.notificacion.count({ where: { usuarioId: dueno.id, tipo: "campania_aprobada" } })).toBe(1);
    await actualizarDiasCampanias(ahora);
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: c.id } })).diasConsumidos).toBe(1);
    await pausarCampania(dueno, c.id);
    await actualizarDiasCampanias(enDias(1));
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: c.id } })).diasConsumidos).toBe(1);
    await expect(pausarCampania(dueno, c.id)).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
    await reanudarCampania(dueno, c.id, enDias(2));
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: c.id } })).diasConsumidos).toBe(2);
    await actualizarDiasCampanias(enDias(3));
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe("finalizada");
  });

  it("una campaña que empieza más adelante no consume antes de su fecha", async () => {
    const { campania } = await crearCampania(dueno, tienda.id, texto({ desde: "2026-10-25" }), ahora);
    await moderarCampania(admin, campania.id, { aprobar: true }, ahora);
    await actualizarDiasCampanias(ahora);
    expect((await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: campania.id } })).diasConsumidos).toBe(0);
  });

  it("finalizar antes: reintegra los días no usados según canje.reintegro_pct", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "canje.reintegro_pct", valor: 50 } });
    const c = await activa({ dias: 3 }); // 300 puntos, consume 1 día hoy
    expect(await saldoPuntos(dueno.id)).toBe(700);
    const fin = await finalizarCampania(dueno, c.id, ahora);
    expect(fin.estado).toBe("finalizada");
    expect(await saldoPuntos(dueno.id)).toBe(800); // 2 días × 100 × 50 %
    await expect(finalizarCampania(dueno, c.id, ahora)).rejects.toMatchObject({ code: "TRANSICION_INVALIDA" });
  });

  it("finalizar en moderación reintegra todo; finalizar pendiente de pago cancela la orden", async () => {
    const { campania } = await crearCampania(dueno, tienda.id, texto(), ahora);
    await finalizarCampania(dueno, campania.id, ahora);
    expect(await saldoPuntos(dueno.id)).toBe(1000);
    const { campania: enPesos, orden } = await crearCampania(dueno, tienda.id, texto({ pago: "pesos" }), ahora);
    await finalizarCampania(dueno, enPesos.id, ahora);
    expect((await prisma.ordenPago.findUniqueOrThrow({ where: { id: orden!.orden.id } })).estado).toBe("cancelada");
  });

  it("listado del admin por estado", async () => {
    const { campania } = await crearCampania(dueno, tienda.id, texto(), ahora);
    const r = await listarCampaniasAdmin(admin, { estado: "en_moderacion", pageSize: 100 });
    expect(r.data.find((c) => c.id === campania.id)?.tienda).toMatchObject({ id: tienda.id, nombre: "Almacén Publi" });
  });
});

describe("rotador y medición", () => {
  it("solo free e invitados; el equipo de la tienda no ve sus avisos", async () => {
    const c = await activa();
    const comprador = await usuario("comprador");
    const premium = await usuario("premium", { plan: "premium" });
    const aviso = await elegirAviso({ espacio: "inicio", usuarioId: comprador.id }, ahora);
    expect(aviso).toMatchObject({ campaniaId: c.id, tipo: "texto", texto: "Yerba 2x1 todo el fin de semana", tienda: { id: tienda.id } });
    expect(verificarToken(aviso!.token, ahora)).toMatchObject({ c: c.id, u: comprador.id, e: "inicio" });
    expect(await elegirAviso({ espacio: "inicio", usuarioId: null }, ahora)).not.toBeNull();
    expect(await elegirAviso({ espacio: "inicio", usuarioId: premium.id }, ahora)).toBeNull();
    expect(await elegirAviso({ espacio: "inicio", usuarioId: dueno.id }, ahora)).toBeNull();
    expect(await elegirAviso({ espacio: "lista", usuarioId: comprador.id }, ahora)).toBeNull();
    await expect(elegirAviso({ espacio: "push", usuarioId: comprador.id }, ahora)).rejects.toMatchObject({ code: "ESPACIO_INVALIDO" });
  });

  it("pausada o fuera del segmento por radio no se muestra", async () => {
    const c = await activa({ radioKm: 2 });
    const comprador = await usuario("seg");
    expect(await elegirAviso({ espacio: "inicio", usuarioId: comprador.id, lat: -31.53, lon: -68.52 }, ahora)).not.toBeNull();
    expect(await elegirAviso({ espacio: "inicio", usuarioId: comprador.id, lat: -31.7, lon: -68.52 }, ahora)).toBeNull();
    await pausarCampania(dueno, c.id);
    expect(await elegirAviso({ espacio: "inicio", usuarioId: comprador.id }, ahora)).toBeNull();
  });

  it("impresión una vez por token; tope de frecuencia diario por usuario", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "publicidad.frecuencia_dia", valor: 2 } });
    const c = await activa();
    const comprador = await usuario("freq");
    for (let i = 0; i < 2; i++) {
      const aviso = await elegirAviso({ espacio: "inicio", usuarioId: comprador.id }, ahora);
      expect(await registrarImpresion(aviso!.token, UA, ahora)).toBe(true);
      expect(await registrarImpresion(aviso!.token, UA, ahora)).toBe(false);
    }
    expect(await prisma.eventoAviso.count({ where: { campaniaId: c.id, tipo: "impresion" } })).toBe(2);
    expect(await elegirAviso({ espacio: "inicio", usuarioId: comprador.id }, ahora)).toBeNull();
  });

  it("bots y tokens inválidos no cuentan", async () => {
    await activa();
    const aviso = await elegirAviso({ espacio: "inicio", usuarioId: null }, ahora);
    expect(await registrarImpresion(aviso!.token, "Googlebot/2.1", ahora)).toBe(false);
    expect(await registrarImpresion("x.y", UA, ahora)).toBe(false);
  });

  it("clic: registra una vez y devuelve el destino guardado (por defecto, la tienda)", async () => {
    const c = await activa();
    const aviso = await elegirAviso({ espacio: "inicio", usuarioId: null }, ahora);
    expect(await registrarClic(aviso!.token, UA, ahora)).toBe(`/tiendas/${tienda.id}`);
    expect(await registrarClic(aviso!.token, UA, ahora)).toBe(`/tiendas/${tienda.id}`);
    expect(await prisma.eventoAviso.count({ where: { campaniaId: c.id, tipo: "clic" } })).toBe(1);
    expect(await registrarClic("invalido", UA, ahora)).toBe("/");
    const conDestino = await activa({ espacio: "lista", destino: "https://almacenia.store/promo" });
    const otro = await elegirAviso({ espacio: "lista", usuarioId: null }, ahora);
    expect(otro?.campaniaId).toBe(conDestino.id);
    expect(await registrarClic(otro!.token, UA, ahora)).toBe("https://almacenia.store/promo");
    const [m] = await listarCampaniasTienda(dueno, tienda.id).then((l) => l.filter((x) => x.id === c.id));
    expect(m.metricas).toEqual({ impresiones: 0, clics: 1 });
  });
});

describe("tienda destacada (pin_mapa)", () => {
  it("cercanas marca destacada y la ordena primero", async () => {
    const otroDueno = await usuario("otro", { plan: "premium" });
    const otra = await crearTienda(otroDueno, { nombre: "Otra premium", direccion: "D", lat: -31.5301, lon: -68.5201 });
    await prisma.tienda.update({ where: { id: otra.id }, data: { plan: "premium" } });
    const { campania } = await crearCampania(dueno, tienda.id, texto({ espacio: "pin_mapa", texto: undefined }), ahora);
    await moderarCampania(admin, campania.id, { aprobar: true }, ahora);
    expect([...(await tiendasDestacadas([tienda.id, otra.id], ahora))]).toEqual([tienda.id]);
    const cercanas = await buscarTiendasCercanas({ lat: -31.53, lon: -68.52, radioKm: 1 });
    const nuestras = cercanas.filter((t) => [tienda.id, otra.id].includes(t.id));
    expect(nuestras.map((t) => [t.id, t.destacada])).toEqual([
      [tienda.id, true],
      [otra.id, false],
    ]);
  });
});

describe("publicidad push", () => {
  it("solo free que no la desactivaron, fuera del equipo, en la franja y con tope semanal", async () => {
    const { campania } = await crearCampania(dueno, tienda.id, texto({ espacio: "push", dias: 5 }), ahora);
    expect(campania.dias).toBe(1);
    expect(await saldoPuntos(dueno.id)).toBe(700);
    await moderarCampania(admin, campania.id, { aprobar: true }, ahora);

    const si = await usuario("si");
    const sinOptIn = await usuario("no");
    const premium = await usuario("prem", { plan: "premium" });
    const lleno = await usuario("lleno");
    await guardarPreferencia(sinOptIn, { categoria: "publicidad", enApp: false, push: false, email: false });
    for (const i of [1, 2]) {
      await prisma.notificacion.create({ data: { usuarioId: lleno.id, tipo: "publicidad", titulo: "t", cuerpo: `c${i}` } });
    }

    // 03:00 en San Juan: fuera de la franja, no sale.
    expect(await procesarPublicidadPush(new Date(`${HOY}T06:00:00Z`))).toEqual({ campanias: 0, enviados: 0 });
    const r = await procesarPublicidadPush(ahora);
    expect(r.campanias).toBeGreaterThanOrEqual(1);
    const nuestros = [si, sinOptIn, premium, lleno, dueno].map((u) => u.id);
    const recibieron = await prisma.notificacion.findMany({
      where: { tipo: "publicidad", titulo: "Almacén Publi", usuarioId: { in: nuestros } },
      select: { usuarioId: true },
    });
    expect(recibieron.map((x) => x.usuarioId)).toEqual([si.id]);
    expect(await prisma.campaniaAviso.findUniqueOrThrow({ where: { id: campania.id } })).toMatchObject({ estado: "finalizada", diasConsumidos: 1 });
    await procesarPublicidadPush(ahora);
    expect(await prisma.notificacion.count({ where: { tipo: "publicidad", titulo: "Almacén Publi", usuarioId: { in: nuestros } } })).toBe(1);
  });
});
