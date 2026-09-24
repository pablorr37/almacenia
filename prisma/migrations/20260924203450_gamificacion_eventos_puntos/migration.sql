-- CreateTable
CREATE TABLE "eventos_puntos" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "metadata" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_puntos_usuario_id_idx" ON "eventos_puntos"("usuario_id");

-- AddForeignKey
ALTER TABLE "eventos_puntos" ADD CONSTRAINT "eventos_puntos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
