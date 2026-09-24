-- La migración anterior (horarios_y_medios_de_pago) alteró la tabla "tiendas" y
-- Prisma, al no poder representar un índice GIST sobre una columna Unsupported en
-- su DSL, lo interpretó como drift y lo eliminó. Se restaura acá, mismo patrón que
-- prisma/migrations/20260923172317_manual_constraints/migration.sql.

CREATE INDEX "tiendas_ubicacion_gist_idx" ON "tiendas" USING GIST ("ubicacion");
