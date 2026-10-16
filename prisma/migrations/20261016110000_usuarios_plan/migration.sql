-- AlterEnum
ALTER TYPE "plan" ADD VALUE 'plata';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "plan" "plan" NOT NULL DEFAULT 'free';

