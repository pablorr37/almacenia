-- CreateEnum
CREATE TYPE "estado_cuenta" AS ENUM ('activa', 'pausada', 'baneada');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "estado_cuenta" "estado_cuenta" NOT NULL DEFAULT 'activa',
ADD COLUMN     "motivo_suspension" TEXT,
ADD COLUMN     "suspendida_en" TIMESTAMP(3);

