#!/bin/sh
set -e

echo "Aplicando migraciones de Prisma..."
node node_modules/prisma/build/cli.js migrate deploy

echo "Iniciando servidor..."
exec node server.js
