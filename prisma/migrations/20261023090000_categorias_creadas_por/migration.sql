-- AlterTable
ALTER TABLE "categorias_producto" ADD COLUMN     "creada_por_id" TEXT;

-- AddForeignKey
ALTER TABLE "categorias_producto" ADD CONSTRAINT "categorias_producto_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

