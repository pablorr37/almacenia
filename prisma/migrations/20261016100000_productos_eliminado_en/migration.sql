-- 03-productos.md: eliminar un producto es una baja real (eliminado_en), sin borrar la fila
-- para conservar el historial de ventas y pedidos.

-- DropIndex
DROP INDEX "productos_tienda_id_idx";

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "eliminado_en" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "productos_tienda_id_eliminado_en_idx" ON "productos"("tienda_id", "eliminado_en");

