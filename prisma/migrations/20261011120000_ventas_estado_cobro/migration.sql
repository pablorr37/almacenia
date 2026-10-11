-- CreateEnum
CREATE TYPE "estado_venta" AS ENUM ('por_cobrar', 'cobrada', 'anulada');

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "anulada_en" TIMESTAMP(3),
ADD COLUMN     "cobrada_en" TIMESTAMP(3),
ADD COLUMN     "estado" "estado_venta" NOT NULL DEFAULT 'cobrada',
ADD COLUMN     "medio_pago" "medio_pago",
ADD COLUMN     "nota" TEXT;

-- CreateIndex
CREATE INDEX "ventas_tienda_id_estado_idx" ON "ventas"("tienda_id", "estado");


-- Las ventas existentes ya estaban cobradas en el acto.
UPDATE "ventas" SET "cobrada_en" = "creada_en" WHERE "cobrada_en" IS NULL;
