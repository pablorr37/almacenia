-- CreateEnum
CREATE TYPE "renovacion_auto" AS ENUM ('ninguna', 'puntos', 'pesos');

-- CreateEnum
CREATE TYPE "concepto_pago" AS ENUM ('premium', 'publicidad');

-- CreateEnum
CREATE TYPE "estado_orden_pago" AS ENUM ('pendiente', 'pagada', 'cancelada', 'vencida');

-- CreateEnum
CREATE TYPE "espacio_aviso" AS ENUM ('inicio', 'lista', 'comparar', 'tienda_pie', 'pin_mapa', 'push');

-- CreateEnum
CREATE TYPE "estado_campania" AS ENUM ('pendiente_pago', 'en_moderacion', 'activa', 'pausada', 'rechazada', 'finalizada');

-- CreateEnum
CREATE TYPE "pago_campania" AS ENUM ('puntos', 'pesos');

-- CreateEnum
CREATE TYPE "tipo_pieza" AS ENUM ('imagen', 'texto');

-- CreateEnum
CREATE TYPE "tipo_evento_aviso" AS ENUM ('impresion', 'clic');

-- CreateEnum
CREATE TYPE "estado_envio" AS ENUM ('enviando', 'enviado', 'cancelado');

-- AlterEnum
ALTER TYPE "permiso_tienda" ADD VALUE 'publicidad';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "plan_vence_en" TIMESTAMP(3),
ADD COLUMN     "renovacion_auto" "renovacion_auto" NOT NULL DEFAULT 'ninguna';

-- CreateTable
CREATE TABLE "ordenes_pago" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "concepto" "concepto_pago" NOT NULL,
    "referencia_id" TEXT,
    "monto_ars" DECIMAL(12,2) NOT NULL,
    "estado" "estado_orden_pago" NOT NULL DEFAULT 'pendiente',
    "proveedor" TEXT NOT NULL DEFAULT 'manual',
    "external_id" TEXT,
    "detalle" JSONB,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagada_en" TIMESTAMP(3),
    "confirmada_por" TEXT,

    CONSTRAINT "ordenes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campanias_aviso" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "creada_por_id" TEXT,
    "espacio" "espacio_aviso" NOT NULL,
    "titulo" TEXT NOT NULL,
    "estado" "estado_campania" NOT NULL,
    "desde" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "dias_consumidos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_dia_consumido" DATE,
    "pago" "pago_campania" NOT NULL,
    "puntos_pagados" DECIMAL(8,1),
    "orden_pago_id" TEXT,
    "segmento" JSONB,
    "peso" INTEGER NOT NULL DEFAULT 1,
    "motivo_rechazo" TEXT,
    "enviada_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aprobada_en" TIMESTAMP(3),
    "finalizada_en" TIMESTAMP(3),

    CONSTRAINT "campanias_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piezas_aviso" (
    "id" TEXT NOT NULL,
    "campania_id" TEXT NOT NULL,
    "tipo" "tipo_pieza" NOT NULL,
    "imagen_url" TEXT,
    "ancho" INTEGER,
    "alto" INTEGER,
    "texto" TEXT,
    "destino" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piezas_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_aviso" (
    "id" TEXT NOT NULL,
    "campania_id" TEXT NOT NULL,
    "pieza_id" TEXT,
    "tipo" "tipo_evento_aviso" NOT NULL,
    "usuario_id" TEXT,
    "nonce" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "url" TEXT,
    "tienda_id" TEXT,
    "clave_unica" TEXT,
    "en_app" BOOLEAN NOT NULL DEFAULT true,
    "leida_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_notificacion" (
    "usuario_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "en_app" BOOLEAN NOT NULL,
    "push" BOOLEAN NOT NULL,
    "email" BOOLEAN NOT NULL,

    CONSTRAINT "preferencias_notificacion_pkey" PRIMARY KEY ("usuario_id","categoria")
);

-- CreateTable
CREATE TABLE "envios_notificacion" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "url" TEXT,
    "segmento" JSONB NOT NULL,
    "estado" "estado_envio" NOT NULL DEFAULT 'enviando',
    "total" INTEGER NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "ultimo_usuario_id" TEXT,
    "creado_por_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMP(3),

    CONSTRAINT "envios_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordenes_pago_estado_creada_en_idx" ON "ordenes_pago"("estado", "creada_en" DESC);

-- CreateIndex
CREATE INDEX "ordenes_pago_usuario_id_idx" ON "ordenes_pago"("usuario_id");

-- CreateIndex
CREATE INDEX "campanias_aviso_espacio_estado_idx" ON "campanias_aviso"("espacio", "estado");

-- CreateIndex
CREATE INDEX "campanias_aviso_tienda_id_idx" ON "campanias_aviso"("tienda_id");

-- CreateIndex
CREATE INDEX "eventos_aviso_campania_id_tipo_creado_en_idx" ON "eventos_aviso"("campania_id", "tipo", "creado_en");

-- CreateIndex
CREATE INDEX "eventos_aviso_usuario_id_creado_en_idx" ON "eventos_aviso"("usuario_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_aviso_tipo_nonce_key" ON "eventos_aviso"("tipo", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_clave_unica_key" ON "notificaciones"("clave_unica");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_creada_en_idx" ON "notificaciones"("usuario_id", "creada_en" DESC);

-- CreateIndex
CREATE INDEX "notificaciones_usuario_id_tipo_creada_en_idx" ON "notificaciones"("usuario_id", "tipo", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripciones_push_usuario_id_idx" ON "suscripciones_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_confirmada_por_fkey" FOREIGN KEY ("confirmada_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanias_aviso" ADD CONSTRAINT "campanias_aviso_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanias_aviso" ADD CONSTRAINT "campanias_aviso_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanias_aviso" ADD CONSTRAINT "campanias_aviso_orden_pago_id_fkey" FOREIGN KEY ("orden_pago_id") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piezas_aviso" ADD CONSTRAINT "piezas_aviso_campania_id_fkey" FOREIGN KEY ("campania_id") REFERENCES "campanias_aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_aviso" ADD CONSTRAINT "eventos_aviso_campania_id_fkey" FOREIGN KEY ("campania_id") REFERENCES "campanias_aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_aviso" ADD CONSTRAINT "eventos_aviso_pieza_id_fkey" FOREIGN KEY ("pieza_id") REFERENCES "piezas_aviso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_aviso" ADD CONSTRAINT "eventos_aviso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_notificacion" ADD CONSTRAINT "preferencias_notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_notificacion" ADD CONSTRAINT "envios_notificacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Checks de 21-publicidad.md y 23-puntos-pagos.md (Prisma no los modela).
ALTER TABLE "campanias_aviso" ADD CONSTRAINT "campanias_aviso_dias_check" CHECK ("dias" BETWEEN 1 AND 90);
ALTER TABLE "campanias_aviso" ADD CONSTRAINT "campanias_aviso_peso_check" CHECK ("peso" BETWEEN 1 AND 10);
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_monto_check" CHECK ("monto_ars" >= 0);
