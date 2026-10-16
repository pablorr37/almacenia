import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { crearTienda, actualizarTienda, datosFiscalesCompletos, type Tienda } from "./tiendas";

// 20-precios-facturacion.md, "Datos fiscales de la tienda"
describe("datos fiscales de la tienda", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-fiscal-d-${suf}@almacenia.test`, password: "password123", nombre: "D" });
    emp = await registrarUsuario({ email: `test-fiscal-e-${suf}@almacenia.test`, password: "password123", nombre: "E" });
    creados.push(dueno.id, emp.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Fiscal", direccion: "D", lat: -31.5, lon: -68.5 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "encargado" });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  it("una tienda nueva es monotributo y sin datos fiscales", () => {
    expect(tienda).toMatchObject({ condicionIva: "monotributo", razonSocial: null, cuit: null, puntoVenta: null, inicioActividades: null });
    expect(datosFiscalesCompletos(tienda)).toBe(false);
  });

  it("el propietario carga los datos (el CUIT se guarda solo con dígitos)", async () => {
    const t = await actualizarTienda(dueno, tienda.id, {
      condicionIva: "responsable_inscripto",
      razonSocial: "Almacén Fiscal SRL",
      cuit: "20-12345678-6",
      ingresosBrutos: "901-123456-7",
      domicilioFiscal: "Mitre 100, San Juan",
      puntoVenta: 3,
      inicioActividades: "2020-01-15",
    });
    expect(t).toMatchObject({
      condicionIva: "responsable_inscripto",
      razonSocial: "Almacén Fiscal SRL",
      cuit: "20123456786",
      ingresosBrutos: "901-123456-7",
      domicilioFiscal: "Mitre 100, San Juan",
      puntoVenta: 3,
      inicioActividades: "2020-01-15",
    });
    expect(datosFiscalesCompletos(t)).toBe(true);
    // Se pueden borrar con null.
    expect((await actualizarTienda(dueno, tienda.id, { cuit: null })).cuit).toBeNull();
  });

  it("errores: CUIT, punto de venta, condición y fecha; solo el propietario", async () => {
    await expect(actualizarTienda(dueno, tienda.id, { cuit: "20-12345678-9" })).rejects.toMatchObject({ code: "CUIT_INVALIDO" });
    await expect(actualizarTienda(dueno, tienda.id, { puntoVenta: 0 })).rejects.toMatchObject({ code: "PUNTO_VENTA_INVALIDO" });
    await expect(actualizarTienda(dueno, tienda.id, { puntoVenta: 100000 })).rejects.toMatchObject({ code: "PUNTO_VENTA_INVALIDO" });
    await expect(actualizarTienda(dueno, tienda.id, { condicionIva: "otra" as never })).rejects.toMatchObject({ code: "CONDICION_IVA_INVALIDA" });
    await expect(actualizarTienda(dueno, tienda.id, { inicioActividades: "15/01/2020" })).rejects.toMatchObject({ code: "FECHA_INVALIDA" });
    await expect(actualizarTienda(emp, tienda.id, { razonSocial: "X" })).rejects.toMatchObject({ code: "NO_ES_DUENO_DE_TIENDA" });
  });
});
