import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { resolverCodigoCliente } from "@/lib/clientes/codigo-cliente";
import { obtenerTienda, type Tienda } from "@/lib/tiendas/tiendas";
import type { RolMiembro } from "@/generated-prisma/client";
import { PERMISOS, permisosPorDefecto, type Permiso, type RolEnTienda } from "./permisos";

// Varias tiendas por usuario, equipo y permisos (19-equipo-tienda.md).

export type { Permiso, RolEnTienda } from "./permisos";
export { PERMISOS, permisosPorDefecto } from "./permisos";
const ROLES: readonly RolMiembro[] = ["encargado", "empleado"];

export interface Acceso {
  rol: RolEnTienda;
  permisos: Permiso[];
}

export interface MiembroTienda {
  usuario: { id: string; nombre: string; email: string; avatarUrl: string | null };
  rol: RolMiembro;
  permisos: Permiso[];
  creadoEn: string;
}

// Los permisos se devuelven siempre en el orden de PERMISOS.
function ordenar(permisos: Permiso[]): Permiso[] {
  return PERMISOS.filter((p) => permisos.includes(p));
}

// Filtro de Prisma: tiendas propias del usuario o donde tiene el permiso 'fotos'
// (banco de fotos y foto del catálogo, que se resuelven por usuario).
export function condicionTiendasConFotos(usuarioId: string) {
  return {
    OR: [{ vendedorId: usuarioId }, { miembros: { some: { usuarioId, permisos: { has: "fotos" as const } } } }],
  };
}

export async function accesoATienda(usuarioId: string, tiendaId: string): Promise<Acceso | null> {
  const tienda = await prisma.tienda.findUnique({
    where: { id: tiendaId },
    select: { vendedorId: true, miembros: { where: { usuarioId }, select: { rol: true, permisos: true } } },
  });
  if (!tienda) return null;
  if (tienda.vendedorId === usuarioId) return { rol: "propietario", permisos: [...PERMISOS] };
  const miembro = tienda.miembros[0];
  return miembro ? { rol: miembro.rol, permisos: ordenar(miembro.permisos) } : null;
}

// Exige al menos uno de los permisos pedidos ('propietario' = ser el dueño).
export async function exigirPermiso(
  usuario: Usuario,
  tiendaId: string,
  permiso: Permiso | Permiso[] | "propietario"
): Promise<Acceso> {
  const existe = await prisma.tienda.findUnique({ where: { id: tiendaId }, select: { id: true } });
  if (!existe) throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  const acceso = await accesoATienda(usuario.id, tiendaId);
  if (!acceso) throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño ni parte del equipo de esta tienda.");
  const alcanza =
    permiso === "propietario"
      ? acceso.rol === "propietario"
      : (Array.isArray(permiso) ? permiso : [permiso]).some((p) => acceso.permisos.includes(p));
  if (!alcanza) throw new AppError("SIN_PERMISO", "No tenés permiso para hacer esto en esta tienda.");
  return acceso;
}

export async function misTiendas(usuario: Usuario): Promise<Array<{ tienda: Tienda } & Acceso>> {
  const [propias, membresias] = await Promise.all([
    prisma.tienda.findMany({ where: { vendedorId: usuario.id }, select: { id: true }, orderBy: { nombre: "asc" } }),
    prisma.miembroTienda.findMany({
      where: { usuarioId: usuario.id },
      select: { tiendaId: true, rol: true, permisos: true },
      orderBy: { tienda: { nombre: "asc" } },
    }),
  ]);
  const filas = [
    ...propias.map((t) => ({ tiendaId: t.id, rol: "propietario" as RolEnTienda, permisos: [...PERMISOS] })),
    ...membresias.map((m) => ({ tiendaId: m.tiendaId, rol: m.rol as RolEnTienda, permisos: ordenar(m.permisos) })),
  ];
  const resultado: Array<{ tienda: Tienda } & Acceso> = [];
  for (const f of filas) {
    const tienda = await obtenerTienda(f.tiendaId);
    if (tienda) resultado.push({ tienda, rol: f.rol, permisos: f.permisos });
  }
  return resultado;
}

const SELECT_MIEMBRO = {
  rol: true,
  permisos: true,
  creadoEn: true,
  usuario: { select: { id: true, nombre: true, email: true, avatarUrl: true } },
} as const;

function aMiembro(m: {
  rol: RolMiembro;
  permisos: Permiso[];
  creadoEn: Date;
  usuario: MiembroTienda["usuario"];
}): MiembroTienda {
  return { usuario: m.usuario, rol: m.rol, permisos: ordenar(m.permisos), creadoEn: m.creadoEn.toISOString() };
}

function validarRol(rol: unknown): asserts rol is RolMiembro {
  if (!ROLES.includes(rol as RolMiembro)) {
    throw new AppError("ROL_INVALIDO", "El rol tiene que ser encargado o empleado.");
  }
}

// Valida los permisos y que quien gestiona tenga cada uno de los que da.
function validarPermisos(permisos: unknown, gestor: Acceso): Permiso[] {
  if (!Array.isArray(permisos) || permisos.some((p) => !PERMISOS.includes(p as Permiso))) {
    throw new AppError("PERMISO_INVALIDO", "Algún permiso no existe.");
  }
  const lista = ordenar(permisos as Permiso[]);
  if (lista.some((p) => !gestor.permisos.includes(p))) {
    throw new AppError("SIN_PERMISO", "Solo podés dar permisos que vos tenés.");
  }
  return lista;
}

export async function listarMiembros(usuario: Usuario, tiendaId: string): Promise<MiembroTienda[]> {
  await exigirPermiso(usuario, tiendaId, "usuarios");
  const miembros = await prisma.miembroTienda.findMany({
    where: { tiendaId },
    select: SELECT_MIEMBRO,
    orderBy: { creadoEn: "asc" },
  });
  return miembros.map(aMiembro);
}

export interface AgregarMiembroInput {
  email?: string;
  codigo?: string;
  rol: RolMiembro;
  permisos?: Permiso[];
}

export async function agregarMiembro(usuario: Usuario, tiendaId: string, input: AgregarMiembroInput): Promise<MiembroTienda> {
  const gestor = await exigirPermiso(usuario, tiendaId, "usuarios");
  validarRol(input.rol);
  const permisos = validarPermisos(input.permisos ?? permisosPorDefecto(input.rol), gestor);

  let nuevoId: string;
  if (input.codigo) {
    nuevoId = (await resolverCodigoCliente(input.codigo)).id;
  } else {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const encontrado = email
      ? await prisma.usuario.findFirst({ where: { email, estadoCuenta: "activa" }, select: { id: true } })
      : null;
    if (!encontrado) throw new AppError("USUARIO_NO_ENCONTRADO", "No hay ningún usuario activo con ese email.");
    nuevoId = encontrado.id;
  }

  const tienda = await prisma.tienda.findUniqueOrThrow({ where: { id: tiendaId }, select: { vendedorId: true } });
  if (tienda.vendedorId === nuevoId) {
    throw new AppError("ES_PROPIETARIO", "Esa persona es la dueña de la tienda.");
  }
  const ya = await prisma.miembroTienda.findUnique({ where: { tiendaId_usuarioId: { tiendaId, usuarioId: nuevoId } } });
  if (ya) throw new AppError("MIEMBRO_YA_EXISTE", "Esa persona ya es parte del equipo de esta tienda.");

  const creado = await prisma.miembroTienda.create({
    data: { tiendaId, usuarioId: nuevoId, rol: input.rol, permisos },
    select: SELECT_MIEMBRO,
  });
  return aMiembro(creado);
}

export async function actualizarMiembro(
  usuario: Usuario,
  tiendaId: string,
  miembroId: string,
  input: { rol?: RolMiembro; permisos?: Permiso[] }
): Promise<MiembroTienda> {
  const gestor = await exigirPermiso(usuario, tiendaId, "usuarios");
  if (miembroId === usuario.id && gestor.rol !== "propietario") {
    throw new AppError("SIN_PERMISO", "No podés cambiar tus propios permisos.");
  }
  if (input.rol !== undefined) validarRol(input.rol);
  const permisos = input.permisos !== undefined ? validarPermisos(input.permisos, gestor) : undefined;

  const actual = await prisma.miembroTienda.findUnique({ where: { tiendaId_usuarioId: { tiendaId, usuarioId: miembroId } } });
  if (!actual) throw new AppError("MIEMBRO_NO_ENCONTRADO", "Esa persona no es parte del equipo de esta tienda.");

  const actualizado = await prisma.miembroTienda.update({
    where: { tiendaId_usuarioId: { tiendaId, usuarioId: miembroId } },
    data: { rol: input.rol, permisos },
    select: SELECT_MIEMBRO,
  });
  return aMiembro(actualizado);
}

export async function quitarMiembro(usuario: Usuario, tiendaId: string, miembroId: string): Promise<{ usuarioId: string }> {
  // Dejar la tienda (quitarse a uno mismo) no pide permiso.
  if (miembroId !== usuario.id) await exigirPermiso(usuario, tiendaId, "usuarios");
  const { count } = await prisma.miembroTienda.deleteMany({ where: { tiendaId, usuarioId: miembroId } });
  if (count === 0) throw new AppError("MIEMBRO_NO_ENCONTRADO", "Esa persona no es parte del equipo de esta tienda.");
  return { usuarioId: miembroId };
}
