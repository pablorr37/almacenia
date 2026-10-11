-- DropIndex
DROP INDEX "horarios_tienda_tienda_id_dia_semana_key";

-- CreateIndex
CREATE INDEX "horarios_tienda_tienda_id_dia_semana_idx" ON "horarios_tienda"("tienda_id", "dia_semana");

