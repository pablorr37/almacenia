-- AlterTable
ALTER TABLE "productos_catalogo" ADD COLUMN     "creado_por_id" TEXT;

-- CreateIndex
CREATE INDEX "productos_catalogo_creado_por_id_creado_en_idx" ON "productos_catalogo"("creado_por_id", "creado_en");

-- AddForeignKey
ALTER TABLE "productos_catalogo" ADD CONSTRAINT "productos_catalogo_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

