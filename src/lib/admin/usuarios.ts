import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import type { Plan } from "@/generated-prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;

export type RolUsuario = "comprador" | "vendedor" | "admin";

export interface UsuarioAdmin extends Usuario {
  tienda: { id: string; nombre: string; plan: Plan; verificada: boolean } | null;
  cantidadVentas: number;
}

export interface ListarUsuariosInput {
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
    include: { tienda: { select: { id: true, nombre: true, plan: true, verificada: true } } },
  });
}

async function aUsuarioAdmin(u: UsuarioConTienda): Promise<UsuarioAdmin> {
  const cantidadVentas = u.tienda
    ? await prisma.venta.count({ where: { tiendaId: u.tienda.id } })
    : await prisma.venta.count({ where: { compradorId: u.id } });
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    esComprador: u.esComprador,
    esVendedor: u.esVendedor,
    esAdmin: u.esAdmin,
    esTester: u.esTester,
    avatarUrl: u.avatarUrl,
    tienda: u.tienda,
    cantidadVentas,
  };
}

// Única escritura sobre usuarios desde el admin (11-admin.md): el flag esTester.
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

export async function listarUsuarios(
  admin: Usuario,
  input: ListarUsuariosInput
): Promise<{ data: UsuarioAdmin[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);

  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0
    ? Math.min(input.pageSize, PAGE_SIZE_MAXIMO)
    : PAGE_SIZE_DEFAULT;

  const where = {
    ...(input.rol ? { [CAMPO_POR_ROL[input.rol]]: true } : {}),
    // Filtrar por plan implica ser vendedor con tienda de ese plan.
    ...(input.plan ? { esVendedor: true, tienda: { plan: input.plan } } : {}),
  };

  const [usuarios, total] = await Promise.all([
    prisma.usuario.findMany({
      where,
      include: { tienda: { select: { id: true, nombre: true, plan: true, verificada: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { creadoEn: "desc" },
    }),
    prisma.usuario.count({ where }),
  ]);

  const conVentas = await Promise.all(usuarios.map(aUsuarioAdmin));

  return { data: conVentas, page, pageSize, total };
}
