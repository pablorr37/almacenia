// Promueve (o crea) un usuario admin. No hay endpoint para esto a propósito
// (ver 01-auth.md: "es_admin nace en false y no tiene endpoint propio para
// activarse — se asigna a mano"). Este script es la forma soportada de hacerlo,
// tanto en local como contra la base de producción.
//
// Uso:
//   npx tsx scripts/crear-admin.ts <email> <password> [nombre]
//   npm run admin:crear -- <email> <password> [nombre]
//
// Si el email ya existe, solo lo promueve a esAdmin=true (no toca su password ni
// otros datos). Si no existe, lo crea con ese email/password/nombre y lo promueve.

import "dotenv/config";
import { registrarUsuario, buscarUsuarioPorEmail } from "../src/lib/auth/auth";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [email, password, nombre] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/crear-admin.ts <email> <password> [nombre]");
    process.exit(1);
  }

  const existente = await buscarUsuarioPorEmail(email);
  let usuarioId: string;

  if (existente) {
    usuarioId = existente.id;
    console.log(`Usuario ya existía: ${existente.email} (${existente.id})`);
  } else {
    const creado = await registrarUsuario({ email, password, nombre: nombre ?? "Admin" });
    usuarioId = creado.id;
    console.log(`Usuario creado: ${creado.email} (${creado.id})`);
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { esAdmin: true } });
  console.log(`esAdmin=true aplicado a ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
