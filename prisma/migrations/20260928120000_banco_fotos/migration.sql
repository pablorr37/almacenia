-- CreateEnum
CREATE TYPE "fuente_foto" AS ENUM ('web', 'subida');

-- CreateEnum
CREATE TYPE "estado_foto" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "es_tester" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fotos_banco" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fuente" "fuente_foto" NOT NULL,
    "estado" "estado_foto" NOT NULL DEFAULT 'pendiente',
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "titulo" TEXT,
    "autor" TEXT,
    "licencia" TEXT,
    "origen_url" TEXT,
    "subida_por_id" TEXT,
    "revisada_por_id" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisada_en" TIMESTAMP(3),

    CONSTRAINT "fotos_banco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fotos_banco_origen_url_key" ON "fotos_banco"("origen_url");

-- CreateIndex
CREATE INDEX "fotos_banco_estado_fuente_idx" ON "fotos_banco"("estado", "fuente");

-- CreateIndex
CREATE INDEX "fotos_banco_etiquetas_idx" ON "fotos_banco" USING GIN ("etiquetas");

-- AddForeignKey
ALTER TABLE "fotos_banco" ADD CONSTRAINT "fotos_banco_subida_por_id_fkey" FOREIGN KEY ("subida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_banco" ADD CONSTRAINT "fotos_banco_revisada_por_id_fkey" FOREIGN KEY ("revisada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

