import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { EstadoCuenta, Plan } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export type RolUsuario = "comprador" | "vendedor" | "admin";

export interface UsuarioAdmin extends Usuario {
  plan: Plan; // plan del usuario (18-alcance.md); el de la tienda va en `tienda.plan`
  estadoCuenta: EstadoCuenta;
  motivoSuspension: string | null;
  // Tiendas propias (19-equipo-tienda.md: puede tener varias).
  tiendas: Array<{ id: string; nombre: string; plan: Plan; verificada: boolean }>;
  cantidadVentas: number;
}

export interface ListarUsuariosInput {
  q?: string;
  estadoCuenta?: EstadoCuenta;
  rol?: RolUsuario;
  plan?: Plan;
  page?: number;
  pageSize?: number;
}

const CAMPO_POR_ROL: Record<RolUsuario, "esComprador" | "esVendedor" | "esAdmin"> = {
  comprador: "esComprador",
  vendedor: "esVendedor",
  admin: "esAdmin",
};

type UsuarioConTienda = Awaited<ReturnType<typeof buscarConTienda>>;

function buscarConTienda(id: string) {
  return prisma.usuario.findUniqueOrThrow({
    where: { id },
    include: { tiendas: { select: SELECT_TIENDA_ADMIN, orderBy: { creadaEn: "asc" } } },
  });
}

const SELECT_TIENDA_ADMIN = { id: true, nombre: true, plan: true, verificada: true } as const;

async function aUsuarioAdmin(u: UsuarioConTienda): Promise<UsuarioAdmin> {
  const cantidadVentas = u.tiendas.length > 0
    ? await prisma.venta.count({ where: { tiendaId: { in: u.tiendas.map((t) => t.id) }, estado: "cobrada" } })
    : await prisma.venta.count({ where: { compradorId: u.id, estado: "cobrada" } });
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    esComprador: u.esComprador,
    esVendedor: u.esVendedor,
    esAdmin: u.esAdmin,
    esTester: u.esTester,
    avatarUrl: u.avatarUrl,
    plan: u.plan,
    estadoCuenta: u.estadoCuenta,
    motivoSuspension: u.motivoSuspension,
    tiendas: u.tiendas,
    cantidadVentas,
  };
}

// Marca o desmarca al usuario como tester (11-admin.md).
export async function marcarTester(admin: Usuario, usuarioId: string, esTester: boolean): Promise<UsuarioAdmin> {
  requireAdmin(admin);
  if (typeof esTester !== "boolean") {
    throw new AppError("ES_TESTER_INVALIDO", "esTester tiene que ser true o false.");
  }
  const existe = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
  if (!existe) throw new AppError("USUARIO_NO_ENCONTRADO", "El usuario no existe.");
  await prisma.usuario.update({ where: { id: usuarioId }, data: { esTester } });
  return aUsuarioAdmin(await buscarConTienda(usuarioId));
}

const PLANES: Plan[] = ["free", "premium", "plata"];

// Plan del usuario: free / premium / plata (18-alcance.md). Sin cobro integrado,
// solo lo cambia un admin.
export async function cambiarPlanUsuario(admin: Usuario, usuarioId: string, plan: Plan): Promise<UsuarioAdmin> {
  requireAdmin(admin);
  if (!PLANES.includes(plan)) {
    throw new AppError("PLAN_INVALIDO", "El plan tiene que ser free, premium o plata.");
  }
  const existe = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true } });
  if (!existe) throw new AppError("USUARIO_NO_ENCONTRADO", "El usuario no existe.");
  // El plan de sus tiendas es el suyo (20-precios-facturacion.md).
  await prisma.$transaction([
    // Asignado a mano: no vence (23-puntos-pagos.md).
    prisma.usuario.update({ where: { id: usuarioId }, data: { plan, planVenceEn: null } }),
    prisma.tienda.updateMany({ where: { vendedorId: usuarioId }, data: { plan } }),
  ]);
  return aUsuarioAdmin(await buscarConTienda(usuarioId));
}

const ESTADOS_CUENTA: EstadoCuenta[] = ["activa", "pausada", "baneada"];

// Un admin no actúa sobre sí mismo ni sobre otro admin (11-admin.md).
async function exigirObjetivoGestionable(admin: Usuario, usuarioId: string) {
  requireAdmin(admin);
  if (usuarioId === admin.id) {
    throw new AppError("ACCION_SOBRE_SI_MISMO", "No podés hacer esto con tu propia cuenta.");
  }
  const objetivo = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!objetivo) throw new AppError("USUARIO_NO_ENCONTRADO", "El usuario no existe.");
  if (objetivo.esAdmin) throw new AppError("FORBIDDEN", "No se puede hacer esto con otra cuenta de administrador.");
  return objetivo;
}

// Pausar (temporal), banear (sanción) o reactivar una cuenta (01-auth.md).
export async function cambiarEstadoCuenta(
  admin: Usuario,
  usuarioId: string,
  estadoCuenta: EstadoCuenta,
  motivo?: string
): Promise<UsuarioAdmin> {
  requireAdmin(admin);
  if (!ESTADOS_CUENTA.includes(estadoCuenta)) {
    throw new AppError("ESTADO_CUENTA_INVALIDO", "El estado tiene que ser activa, pausada o baneada.");
  }
  await exigirObjetivoGestionable(admin, usuarioId);
  const motivoLimpio = estadoCuenta === "activa" ? null : motivo?.trim().slice(0, 300) || null;
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      estadoCuenta,
      motivoSuspension: motivoLimpio,
      suspendidaEn: estadoCuenta === "activa" ? null : new Date(),
    },
  });
  return aUsuarioAdmin(await buscarConTienda(usuarioId));
}

// Borrado físico (11-admin.md). Lo propio del usuario se borra; en ventas de otras
// tiendas donde figuraba como comprador, la venta queda anónima.
export async function eliminarUsuario(
  admin: Usuario,
  usuarioId: string,
  confirmacionEmail: string
): Promise<{ id: string }> {
  const objetivo = await exigirObjetivoGestionable(admin, usuarioId);
  if (typeof confirmacionEmail !== "string" || confirmacionEmail.trim().toLowerCase() !== objetivo.email) {
    throw new AppError("CONFIRMACION_INVALIDA", "Para eliminar la cuenta, escribí exactamente el email del usuario.");
  }

  const tiendas = await prisma.tienda.findMany({ where: { vendedorId: usuarioId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    for (const tienda of tiendas) {
      const t = tienda.id;
      await tx.itemVenta.deleteMany({ where: { OR: [{ venta: { tiendaId: t } }, { producto: { tiendaId: t } }] } });
      await tx.venta.deleteMany({ where: { tiendaId: t } });
      await tx.itemPedido.deleteMany({ where: { OR: [{ pedido: { tiendaId: t } }, { producto: { tiendaId: t } }] } });
      await tx.pedido.deleteMany({ where: { tiendaId: t } });
      await tx.resena.deleteMany({ where: { tiendaId: t } });
      await tx.valoracionCliente.deleteMany({ where: { tiendaId: t } });
      await tx.solicitudVerificacion.deleteMany({ where: { tiendaId: t } });
      await tx.horarioTienda.deleteMany({ where: { tiendaId: t } });
      await tx.producto.deleteMany({ where: { tiendaId: t } });
      await tx.tienda.delete({ where: { id: t } });
    }
    // Como comprador.
    await tx.venta.updateMany({ where: { compradorId: usuarioId }, data: { compradorId: null } });
    await tx.itemPedido.deleteMany({ where: { pedido: { compradorId: usuarioId } } });
    await tx.pedido.deleteMany({ where: { compradorId: usuarioId } });
    await tx.resena.deleteMany({ where: { compradorId: usuarioId } });
    await tx.valoracionCliente.deleteMany({ where: { compradorId: usuarioId } });
    // Listas, puntos, check-ins, visitas: en cascada. Fotos del banco: quedan sin autor.
    await tx.usuario.delete({ where: { id: usuarioId } });
  });
  return { id: usuarioId };
}

export async function listarUsuarios(
  admin: Usuario,
  input: ListarUsuariosInput
): Promise<{ data: UsuarioAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const q = input.q?.trim();
  const where = {
    AND: [
      input.rol ? { [CAMPO_POR_ROL[input.rol]]: true } : {},
      input.estadoCuenta ? { estadoCuenta: input.estadoCuenta } : {},
      // Filtrar por plan implica ser vendedor con tienda de ese plan.
      input.plan ? { esVendedor: true, tiendas: { some: { plan: input.plan } } } : {},
      // Búsqueda libre por nombre, email o nombre de la tienda (11-admin.md).
      q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { tiendas: { some: { nombre: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {},
    ],
  };

  const [usuarios, total] = await Promise.all([
    prisma.usuario.findMany({
      where,
      include: { tiendas: { select: SELECT_TIENDA_ADMIN, orderBy: { creadaEn: "asc" } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadoEn: "desc" },
    }),
    prisma.usuario.count({ where }),
  ]);

  const conVentas = await Promise.all(usuarios.map(aUsuarioAdmin));

  return { data: conVentas, page, pageSize, total };
}
