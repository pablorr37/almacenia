-- 12-gamificacion.md (puntos decimales, idempotencia, tienda/contraparte, visitas
-- a la página), 02-tiendas.md (check-in GPS), 11-admin.md (configuración del
-- sistema) y 14-listas-compras.md (listas de compras).
--
-- Se quitó a mano el `DROP INDEX "tiendas_ubicacion_gist_idx"` que genera el diff
-- de Prisma (no puede representar ese índice GIST en el schema; ver la migración
-- 20260926153055_valoraciones_clientes).

-- DropForeignKey
ALTER TABLE "eventos_puntos" DROP CONSTRAINT "eventos_puntos_usuario_id_fkey";

-- AlterTable
ALTER TABLE "eventos_puntos" ADD COLUMN     "clave_unica" TEXT,
ADD COLUMN     "contraparte_usuario_id" TEXT,
ADD COLUMN     "tienda_id" TEXT,
ALTER COLUMN "puntos" SET DATA TYPE DECIMAL(6,1);

-- CreateTable
CREATE TABLE "visitas_pagina_tienda" (
    "comprador_id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "ultimo_mes" TEXT NOT NULL,
    "ultimo_valor" DECIMAL(3,1) NOT NULL,

    CONSTRAINT "visitas_pagina_tienda_pkey" PRIMARY KEY ("comprador_id","tienda_id")
);

-- CreateTable
CREATE TABLE "checkins_tienda" (
    "id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "distancia_m" DECIMAL(8,1) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_tienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_sistema" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "listas_compras" (
    "id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_lista_compras" (
    "id" TEXT NOT NULL,
    "lista_id" TEXT NOT NULL,
    "catalogo_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "items_lista_compras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkins_tienda_comprador_id_tienda_id_creado_en_idx" ON "checkins_tienda"("comprador_id", "tienda_id", "creado_en");

-- CreateIndex
CREATE INDEX "listas_compras_comprador_id_idx" ON "listas_compras"("comprador_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_lista_compras_lista_id_catalogo_id_key" ON "items_lista_compras"("lista_id", "catalogo_id");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_puntos_clave_unica_key" ON "eventos_puntos"("clave_unica");

-- CreateIndex
CREATE INDEX "productos_catalogo_id_disponible_idx" ON "productos"("catalogo_id", "disponible");

-- AddForeignKey
ALTER TABLE "eventos_puntos" ADD CONSTRAINT "eventos_puntos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_puntos" ADD CONSTRAINT "eventos_puntos_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_puntos" ADD CONSTRAINT "eventos_puntos_contraparte_usuario_id_fkey" FOREIGN KEY ("contraparte_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas_pagina_tienda" ADD CONSTRAINT "visitas_pagina_tienda_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas_pagina_tienda" ADD CONSTRAINT "visitas_pagina_tienda_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins_tienda" ADD CONSTRAINT "checkins_tienda_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins_tienda" ADD CONSTRAINT "checkins_tienda_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_compras" ADD CONSTRAINT "listas_compras_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_lista_compras" ADD CONSTRAINT "items_lista_compras_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas_compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_lista_compras" ADD CONSTRAINT "items_lista_compras_catalogo_id_fkey" FOREIGN KEY ("catalogo_id") REFERENCES "productos_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Agregado a mano (14-listas-compras.md): Prisma no declara CHECK constraints.
ALTER TABLE "items_lista_compras"
  ADD CONSTRAINT "item_lista_cantidad_positiva" CHECK ("cantidad" > 0);
