-- 17-rubros-categorias.md: rubros de negocio y categorías de producto pasan de un enum
-- fijo (`categoria`) a tablas que mantiene el admin. Por decisión del dueño del
-- producto, esta migración BORRA todos los productos (y lo que depende de ellos:
-- ventas, pedidos, reseñas de producto, ítems de listas, catálogo) y las tiendas y
-- usuarios demo del seed (@seed.almacenia.test). Usuarios reales, sus tiendas,
-- horarios y el banco de fotos se conservan; las tiendas reales mantienen su rubro.

-- CreateEnum
CREATE TYPE "unidad_contenido" AS ENUM ('g', 'kg', 'ml', 'l', 'u');

-- CreateTable
CREATE TABLE "rubros" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubros_nombre_normalizado_key" ON "rubros"("nombre_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_producto_nombre_normalizado_key" ON "categorias_producto"("nombre_normalizado");

-- Rubros iniciales: los valores del enum viejo (para que las tiendas existentes
-- conserven el suyo) más Vivero. `clave` es el valor del enum, solo para el mapeo.
CREATE TEMP TABLE rubros_iniciales (clave TEXT, nombre TEXT, normalizado TEXT, orden INT);
INSERT INTO rubros_iniciales VALUES
  ('almacen',    'Almacén',    'almacen',    10),
  ('kiosco',     'Kiosco',     'kiosco',     20),
  ('verduleria', 'Verdulería', 'verduleria', 30),
  ('panaderia',  'Panadería',  'panaderia',  40),
  ('fiambreria', 'Fiambrería', 'fiambreria', 50),
  ('bebidas',    'Bebidas',    'bebidas',    60),
  ('lacteos',    'Lácteos',    'lacteos',    70),
  ('limpieza',   'Limpieza',   'limpieza',   80),
  (NULL,         'Vivero',     'vivero',     90),
  ('otros',      'Otros',      'otros',      1000);

INSERT INTO "rubros" ("id", "nombre", "nombre_normalizado", "orden")
SELECT gen_random_uuid()::text, nombre, normalizado, orden FROM rubros_iniciales;

-- AlterTable: rubro_id junto al enum viejo, para copiar el valor antes de borrarlo.
ALTER TABLE "tiendas" ADD COLUMN "rubro_id" TEXT;

UPDATE "tiendas" t
SET "rubro_id" = r."id"
FROM rubros_iniciales ri
JOIN "rubros" r ON r."nombre_normalizado" = ri.normalizado
WHERE t."rubro"::text = ri.clave;

DROP TABLE rubros_iniciales;

-- Borrado de todo lo que depende de productos (orden por claves foráneas).
DELETE FROM "items_venta";
DELETE FROM "ventas";
DELETE FROM "items_pedido";
DELETE FROM "pedidos";
DELETE FROM "resenas" WHERE "producto_id" IS NOT NULL;
DELETE FROM "items_lista_compras";
DELETE FROM "productos";
DELETE FROM "productos_catalogo";

-- Borrado de tiendas y usuarios demo del seed y de lo que cuelga de ellos. Lo que
-- tiene ON DELETE CASCADE/SET NULL (check-ins, visitas, puntos, listas, códigos,
-- fotos del banco) se resuelve solo al borrar tiendas y usuarios.
CREATE TEMP TABLE usuarios_demo AS
  SELECT "id" FROM "usuarios" WHERE "email" LIKE '%@seed.almacenia.test';
CREATE TEMP TABLE tiendas_demo AS
  SELECT "id" FROM "tiendas" WHERE "vendedor_id" IN (SELECT "id" FROM usuarios_demo);

DELETE FROM "resenas"
WHERE "tienda_id" IN (SELECT "id" FROM tiendas_demo)
   OR "comprador_id" IN (SELECT "id" FROM usuarios_demo);
DELETE FROM "valoraciones_clientes"
WHERE "tienda_id" IN (SELECT "id" FROM tiendas_demo)
   OR "comprador_id" IN (SELECT "id" FROM usuarios_demo);
DELETE FROM "solicitudes_verificacion" WHERE "tienda_id" IN (SELECT "id" FROM tiendas_demo);
DELETE FROM "horarios_tienda" WHERE "tienda_id" IN (SELECT "id" FROM tiendas_demo);
DELETE FROM "tiendas" WHERE "id" IN (SELECT "id" FROM tiendas_demo);
DELETE FROM "usuarios" WHERE "id" IN (SELECT "id" FROM usuarios_demo);

DROP TABLE tiendas_demo;
DROP TABLE usuarios_demo;

-- DropIndex
DROP INDEX "productos_categoria_idx";

-- AlterTable
ALTER TABLE "productos" DROP COLUMN "categoria",
ADD COLUMN     "categoria_id" TEXT,
ADD COLUMN     "favorito" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (la tabla quedó vacía arriba, por eso categoria_id puede ser NOT NULL)
ALTER TABLE "productos_catalogo" DROP COLUMN "categoria",
ADD COLUMN     "categoria_id" TEXT NOT NULL,
ADD COLUMN     "contenido" DECIMAL(10,3),
ADD COLUMN     "unidad_contenido" "unidad_contenido",
ADD COLUMN     "variante" TEXT;

-- 06-catalogo.md: contenido positivo y con unidad (CHECK a mano, Prisma no los declara).
ALTER TABLE "productos_catalogo" ADD CONSTRAINT "contenido_valido"
  CHECK ("contenido" IS NULL OR ("contenido" > 0 AND "unidad_contenido" IS NOT NULL));

-- AlterTable
ALTER TABLE "tiendas" DROP COLUMN "rubro";

-- DropEnum
DROP TYPE "categoria";

-- CreateIndex
CREATE INDEX "productos_categoria_id_idx" ON "productos"("categoria_id");

-- CreateIndex
CREATE INDEX "productos_catalogo_categoria_id_idx" ON "productos_catalogo"("categoria_id");

-- AddForeignKey
ALTER TABLE "tiendas" ADD CONSTRAINT "tiendas_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_catalogo" ADD CONSTRAINT "productos_catalogo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
