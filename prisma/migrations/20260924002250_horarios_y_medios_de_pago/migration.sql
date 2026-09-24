-- CreateEnum
CREATE TYPE "medio_pago" AS ENUM ('efectivo', 'transferencia', 'mercado_pago', 'debito', 'qr');

-- DropIndex
DROP INDEX "tiendas_ubicacion_gist_idx";

-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "medios_de_pago" "medio_pago"[] DEFAULT ARRAY[]::"medio_pago"[];

-- CreateTable
CREATE TABLE "horarios_tienda" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "abre" TEXT,
    "cierra" TEXT,

    CONSTRAINT "horarios_tienda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horarios_tienda_tienda_id_dia_semana_key" ON "horarios_tienda"("tienda_id", "dia_semana");

-- AddForeignKey
ALTER TABLE "horarios_tienda" ADD CONSTRAINT "horarios_tienda_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
