-- AlterTable
ALTER TABLE "tiendas" ADD COLUMN     "porcentaje_puntos_equipo" SMALLINT;


-- 12-gamificacion.md: 0 a 100 o NULL (default del sistema).
ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_porcentaje_puntos_equipo_check" CHECK ("porcentaje_puntos_equipo" BETWEEN 0 AND 100);
