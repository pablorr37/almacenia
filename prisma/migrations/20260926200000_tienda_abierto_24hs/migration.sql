-- 02-tiendas.md: locales 24 hs. (Se quitó a mano el DROP INDEX del GIST de
-- tiendas.ubicacion que genera el diff de Prisma; ver 20260926153055_valoraciones_clientes.)

-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "abierto_24hs" BOOLEAN NOT NULL DEFAULT false;
