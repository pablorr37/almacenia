-- CreateEnum
CREATE TYPE "condicion_iva" AS ENUM ('monotributo', 'responsable_inscripto', 'exento');

-- CreateEnum
CREATE TYPE "alicuota_iva" AS ENUM ('iva_21', 'iva_10_5', 'iva_27', 'iva_0', 'exento');

-- CreateEnum
CREATE TYPE "tipo_comprobante" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "estado_comprobante" AS ENUM ('interno', 'autorizado', 'rechazado');

-- AlterTable
ALTER TABLE "items_venta" ADD COLUMN     "alicuota_iva" "alicuota_iva",
ADD COLUMN     "costo_unitario" DECIMAL(12,2),
ADD COLUMN     "internos_unitario" DECIMAL(12,4),
ADD COLUMN     "iva_unitario" DECIMAL(12,4),
ADD COLUMN     "neto_unitario" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "alicuota_iva" "alicuota_iva" NOT NULL DEFAULT 'iva_21',
ADD COLUMN     "costo" DECIMAL(12,2),
ADD COLUMN     "impuestos_internos" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "margen" DECIMAL(7,2);

-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "condicion_iva" "condicion_iva" NOT NULL DEFAULT 'monotributo',
ADD COLUMN     "cuit" CHAR(11),
ADD COLUMN     "domicilio_fiscal" TEXT,
ADD COLUMN     "ingresos_brutos" TEXT,
ADD COLUMN     "inicio_actividades" DATE,
ADD COLUMN     "punto_venta" INTEGER,
ADD COLUMN     "razon_social" TEXT;

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "tipo" "tipo_comprobante" NOT NULL,
    "punto_venta" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "cliente_doc_tipo" TEXT NOT NULL,
    "cliente_doc" TEXT,
    "cliente_nombre" TEXT,
    "cliente_condicion" "condicion_iva",
    "neto" DECIMAL(12,2) NOT NULL,
    "iva_por_alicuota" JSONB NOT NULL,
    "internos" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" "estado_comprobante" NOT NULL DEFAULT 'interno',
    "cae" TEXT,
    "cae_vencimiento" DATE,
    "emitido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numeracion_comprobantes" (
    "tienda_id" TEXT NOT NULL,
    "punto_venta" INTEGER NOT NULL,
    "tipo" "tipo_comprobante" NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "numeracion_comprobantes_pkey" PRIMARY KEY ("tienda_id","punto_venta","tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_venta_id_key" ON "comprobantes"("venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_tienda_id_punto_venta_tipo_numero_key" ON "comprobantes"("tienda_id", "punto_venta", "tipo", "numero");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numeracion_comprobantes" ADD CONSTRAINT "numeracion_comprobantes_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 20-precios-facturacion.md: punto de venta 1-99999.
ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_punto_venta_check" CHECK ("punto_venta" BETWEEN 1 AND 99999);

-- Plan de la tienda = plan del dueño. Primero el usuario toma el mayor entre el suyo y
-- el de sus tiendas (free < premium < plata); después cada tienda copia el del dueño.
UPDATE "usuarios" u SET "plan" = sub.plan
FROM (
  SELECT t."vendedor_id" AS id, MAX(t."plan") AS plan
  FROM "tiendas" t GROUP BY t."vendedor_id"
) sub
WHERE u."id" = sub.id AND sub.plan > u."plan";

UPDATE "tiendas" t SET "plan" = u."plan" FROM "usuarios" u WHERE u."id" = t."vendedor_id" AND t."plan" <> u."plan";
