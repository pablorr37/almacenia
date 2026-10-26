-- CreateEnum
CREATE TYPE "estado_ajuste" AS ENUM ('ninguno', 'propuesto', 'rechazado', 'ratificado', 'aceptado', 'quitado');

-- AlterTable
ALTER TABLE "items_pedido" ADD COLUMN     "ajuste_estado" "estado_ajuste" NOT NULL DEFAULT 'ninguno',
ADD COLUMN     "cantidad_original" DECIMAL(10,3),
ADD COLUMN     "cantidad_propuesta" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "comprador_lat" DOUBLE PRECISION,
ADD COLUMN     "comprador_lon" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "chat_notif_fuera_horario" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "notificaciones_pausadas_hasta" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "conversaciones" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "ultimo_mensaje_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" TEXT NOT NULL,
    "conversacion_id" TEXT NOT NULL,
    "autor_id" TEXT,
    "de_tienda" BOOLEAN NOT NULL,
    "texto" TEXT NOT NULL,
    "plantilla" TEXT,
    "pedido_id" TEXT,
    "leido_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversaciones_comprador_id_idx" ON "conversaciones"("comprador_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_tienda_id_comprador_id_key" ON "conversaciones"("tienda_id", "comprador_id");

-- CreateIndex
CREATE INDEX "mensajes_conversacion_id_creado_en_idx" ON "mensajes"("conversacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 22-notificaciones.md (ronda 6): todo activo por defecto. Las preferencias guardadas
-- iguales a los defaults viejos de ofertas y publicidad (todo apagado) se borran para
-- que tomen los nuevos defaults; las elegidas a mano se respetan.
DELETE FROM "preferencias_notificacion"
WHERE "categoria" IN ('ofertas', 'publicidad') AND NOT "en_app" AND NOT "push" AND NOT "email";
