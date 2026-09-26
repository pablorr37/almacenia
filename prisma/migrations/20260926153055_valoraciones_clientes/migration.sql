-- CreateTable
CREATE TABLE "valoraciones_clientes" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "comprador_id" TEXT NOT NULL,
    "puntuacion" SMALLINT NOT NULL,
    "comentario" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valoraciones_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "valoraciones_clientes_comprador_id_idx" ON "valoraciones_clientes"("comprador_id");

-- CreateIndex
CREATE UNIQUE INDEX "valoraciones_clientes_tienda_id_comprador_id_key" ON "valoraciones_clientes"("tienda_id", "comprador_id");

-- AddForeignKey
ALTER TABLE "valoraciones_clientes" ADD CONSTRAINT "valoraciones_clientes_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "tiendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoraciones_clientes" ADD CONSTRAINT "valoraciones_clientes_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano (13-valoraciones-clientes.md): Prisma no declara CHECK constraints.
ALTER TABLE "valoraciones_clientes"
  ADD CONSTRAINT "valoracion_cliente_puntuacion_valida" CHECK ("puntuacion" BETWEEN 1 AND 5);

-- Restaura el índice GIST de tiendas.ubicacion (02-tiendas.md), que la migración
-- 20260924173838_producto_destacado borró (Prisma no puede representarlo en el
-- schema y genera un DROP INDEX al diffear). Si una migración futura generada con
-- `prisma migrate dev` vuelve a traer `DROP INDEX "tiendas_ubicacion_gist_idx"`,
-- hay que borrar esa línea a mano antes de aplicarla.
CREATE INDEX IF NOT EXISTS "tiendas_ubicacion_gist_idx" ON "tiendas" USING GIST ("ubicacion");
