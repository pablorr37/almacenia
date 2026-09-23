-- Constraints y el índice GIST documentados en specs/sdd/*.md que Prisma no puede
-- declarar de forma estable en prisma/schema.prisma (ver comentario al tope del
-- schema). Se escriben a mano acá; si el modelo cambia, actualizar primero la spec
-- correspondiente y después este archivo junto con una migración nueva.

-- 02-tiendas.md: búsqueda espacial por cercanía
CREATE INDEX "tiendas_ubicacion_gist_idx" ON "tiendas" USING GIST ("ubicacion");

-- 03-productos.md
ALTER TABLE "productos" ADD CONSTRAINT "precio_no_negativo" CHECK ("precio" >= 0);
ALTER TABLE "productos" ADD CONSTRAINT "stock_no_negativo" CHECK ("stock" >= 0);

-- 04-pedidos.md
ALTER TABLE "items_pedido" ADD CONSTRAINT "cantidad_positiva" CHECK ("cantidad" > 0);

-- 05-ventas.md
ALTER TABLE "ventas" ADD CONSTRAINT "total_no_negativo" CHECK ("total" >= 0);
ALTER TABLE "ventas" ADD CONSTRAINT "pedido_id_solo_si_origen_pedido"
  CHECK (("origen" = 'pedido') = ("pedido_id" IS NOT NULL));
ALTER TABLE "items_venta" ADD CONSTRAINT "cantidad_positiva" CHECK ("cantidad" > 0);
