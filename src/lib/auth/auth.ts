import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario as UsuarioDb } from "@/generated-prisma/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  esComprador: boolean;
  esVendedor: boolean;
}

export interface RegistrarUsuarioInput {
  email: string;
  password: string;
  nombre: string;
}

function aUsuario(usuario: UsuarioDb): Usuario {
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    esComprador: usuario.esComprador,
    esVendedor: usuario.esVendedor,
  };
}

export async function registrarUsuario(input: RegistrarUsuarioInput): Promise<Usuario> {
  const email = input.email.trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    throw new AppError("EMAIL_INVALIDO", "El email no tiene un formato válido.");
  }
  if (input.password.length < 8) {
    throw new AppError("PASSWORD_DEBIL", "La contraseña debe tener al menos 8 caracteres.");
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw new AppError("EMAIL_YA_REGISTRADO", "Ya existe un usuario registrado con ese email.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const usuario = await prisma.usuario.create({
    data: { email, passwordHash, nombre: input.nombre },
  });

  return aUsuario(usuario);
}

export async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  return usuario ? aUsuario(usuario) : null;
}

export async function verificarPassword(email: string, password: string): Promise<Usuario | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!usuario) return null;

  const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
  return passwordValida ? aUsuario(usuario) : null;
}

// Usada internamente por crearTienda (02-tiendas.md) al completar el alta de tienda.
// No se expone como endpoint propio.
export async function activarVendedor(usuarioId: string): Promise<Usuario> {
  const usuario = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { esVendedor: true },
  });
  return aUsuario(usuario);
}
