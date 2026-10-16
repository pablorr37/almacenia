-- CreateEnum
CREATE TYPE "rol_miembro" AS ENUM ('encargado', 'empleado');

-- CreateEnum
CREATE TYPE "permiso_tienda" AS ENUM ('vender', 'cobrar', 'anular', 'precios', 'stock', 'productos', 'fotos', 'pedidos', 'balance', 'usuarios');

-- DropIndex
DROP INDEX "tiendas_vendedor_id_key";

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "vendida_por_id" TEXT;

-- CreateTable
CREATE TABLE "miembros_tienda" (
    "tienda_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "rol" "rol_miembro" NOT NULL,
    "permisos" "permiso_tienda"[] DEFAULT ARRAY[]::"permiso_tienda"[],
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miembros_tienda_pkey" PRIMARY KEY ("tienda_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "miembros_tienda_usuario_id_idx" ON "miembros_tienda"("usuario_id");

-- CreateIndex
CREATE INDEX "tiendas_vendedor_id_idx" ON "tiendas"("vendedor_id");

-- AddForeignKey
ALTER TABLE "miembros_tienda" ADD CONSTRAINT "miembros_tienda_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembros_tienda" ADD CONSTRAINT "miembros_tienda_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendida_por_id_fkey" FOREIGN KEY ("vendida_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

