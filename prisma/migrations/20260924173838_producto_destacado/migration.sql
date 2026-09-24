-- DropIndex
DROP INDEX "tiendas_ubicacion_gist_idx";

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "destacado" BOOLEAN NOT NULL DEFAULT false;
