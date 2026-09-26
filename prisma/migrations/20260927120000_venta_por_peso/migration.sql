-- 03-productos.md / 06-catalogo.md: venta por peso (unidad del producto de catálogo y
-- cantidades decimales). Los CHECK de cantidad > 0 y stock >= 0 se conservan.

-- CreateEnum
CREATE TYPE "unidad_medida" AS ENUM ('unidad', 'kg');

-- AlterTable
ALTER TABLE "items_lista_compras" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "items_pedido" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "items_venta" ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "productos" ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "productos_catalogo" ADD COLUMN     "unidad" "unidad_medida" NOT NULL DEFAULT 'unidad';


-- Datos existentes: los productos cuyo nombre ya indica venta por kilo pasan a
-- venderse por kg.
UPDATE "productos_catalogo" SET "unidad" = 'kg' WHERE "nombre" ILIKE '%(kg)%';
