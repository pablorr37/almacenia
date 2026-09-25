FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El cliente Prisma (src/generated-prisma/) está en .gitignore — hay que
# generarlo acá antes del build, next build falla sin esto.
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# El build "standalone" de Next solo empaqueta lo que el server importa en
# runtime — la CLI de Prisma (usada por docker-entrypoint.sh para aplicar
# migraciones al arrancar) no se importa desde código, así que se copia
# aparte junto con el schema/migraciones que necesita para saber qué aplicar.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts
# prisma/seed.ts reutiliza funciones de src/lib (no las reimplementa) — se copia
# la carpeta para poder seedear en runtime via RUN_SEED=true (ver docker-entrypoint.sh).
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# La CLI de Prisma tiene su propio árbol de dependencias (no solo @prisma/*)
# que el tracing de "standalone" no incluye por no importarse desde código —
# se copia el node_modules completo encima (superset seguro de lo que ya
# trajo standalone) en vez de perseguir cada paquete transitivo a mano.
COPY --from=builder /app/node_modules ./node_modules

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
