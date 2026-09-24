/*
  Warnings:

  - Added the required column `catalogo_id` to the `productos` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "categoria" AS ENUM ('almacen', 'bebidas', 'lacteos', 'panaderia', 'limpieza', 'kiosco', 'verduleria', 'fiambreria', 'otros');

-- CreateEnum
CREATE TYPE "plan" AS ENUM ('free', 'premium');

-- CreateEnum
CREATE TYPE "estado_verificacion" AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "catalogo_id" TEXT NOT NULL,
ADD COLUMN     "categoria" "categoria",
ADD COLUMN     "imagen_url" TEXT,
ADD COLUMN     "precio_oferta" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "desactivada_en" TIMESTAMP(3),
ADD COLUMN     "imagen_url" TEXT,
ADD COLUMN     "plan" "plan" NOT NULL DEFAULT 'free',
ADD COLUMN     "rubro" "categoria",
ADD COLUMN     "verificada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "es_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "solicitudes_verificacion" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "estado" "estado_verificacion" NOT NULL DEFAULT 'pendiente',
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisada_en" TIMESTAMP(3),
    "revisada_por" TEXT,
    "nota_admin" TEXT,

    CONSTRAINT "solicitudes_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_catalogo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "marca" TEXT,
    "categoria" "categoria",
    "codigo_barras" TEXT,
    "imagen_url" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resenas" (
    "id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "producto_id" TEXT,
    "puntuacion" INTEGER NOT NULL,
    "comentario" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resenas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_verificacion_tienda_id_idx" ON "solicitudes_verificacion"("tienda_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_catalogo_codigo_barras_key" ON "productos_catalogo"("codigo_barras");

-- CreateIndex
CREATE INDEX "productos_catalogo_nombre_idx" ON "productos_catalogo"("nombre");

-- CreateIndex
CREATE INDEX "resenas_tienda_id_idx" ON "resenas"("tienda_id");

-- CreateIndex
CREATE INDEX "resenas_producto_id_idx" ON "resenas"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "resenas_comprador_id_producto_id_key" ON "resenas"("comprador_id", "producto_id");

-- CreateIndex
CREATE INDEX "productos_catalogo_id_idx" ON "productos"("catalogo_id");

-- CreateIndex
CREATE INDEX "productos_categoria_idx" ON "productos"("categoria");

-- AddForeignKey
ALTER TABLE "solicitudes_verificacion" ADD CONSTRAINT "solicitudes_verificacion_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "productos_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resenas" ADD CONSTRAINT "resenas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraints documentados en specs/sdd/03-productos.md y 07-resenas.md, no
-- representables en el DSL de Prisma (ver comentario en schema.prisma).
ALTER TABLE "productos" ADD CONSTRAINT "precio_oferta_no_negativo" CHECK ("precio_oferta" IS NULL OR "precio_oferta" >= 0);
ALTER TABLE "productos" ADD CONSTRAINT "precio_oferta_menor" CHECK ("precio_oferta" IS NULL OR "precio_oferta" < "precio");
ALTER TABLE "resenas" ADD CONSTRAINT "puntuacion_valida" CHECK ("puntuacion" BETWEEN 1 AND 5);
