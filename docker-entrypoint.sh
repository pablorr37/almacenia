#!/bin/sh
set -e

echo "Aplicando migraciones de Prisma..."
node node_modules/prisma/build/cli.js migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Corriendo seed (RUN_SEED=true)..."
  node_modules/.bin/tsx prisma/seed.ts
fi

echo "Iniciando servidor..."
exec node server.js
