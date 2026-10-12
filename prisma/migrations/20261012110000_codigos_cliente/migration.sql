-- CreateTable
CREATE TABLE "codigos_cliente" (
    "id" TEXT NOT NULL,
    "codigo" CHAR(6) NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "codigos_cliente_codigo_key" ON "codigos_cliente"("codigo");

-- CreateIndex
CREATE INDEX "codigos_cliente_usuario_id_idx" ON "codigos_cliente"("usuario_id");

-- AddForeignKey
ALTER TABLE "codigos_cliente" ADD CONSTRAINT "codigos_cliente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

