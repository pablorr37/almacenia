import "dotenv/config";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    // src/generated/ es el output del pipeline local pausado (ver CLAUDE.md),
    // no parte de la app activa — se excluye para que `npm test` no dependa de él.
    exclude: ["node_modules/**", "src/generated/**"],
    // Todavía no hay módulos reales implementados (ver CLAUDE.md, TDD en curso) —
    // sin esto, `npm test` fallaría solo por no encontrar tests, no por un error real.
    passWithNoTests: true,
    // Los tests son de integración contra una única Postgres real (sin transacción
    // por test ni DB por worker) y algunos ejercitan agregaciones globales sin
    // scope propio (ej. admin/metricas.ts, que cuenta filas de toda la tabla por
    // rango de fecha, por spec). Correr archivos en paralelo hace que un archivo
    // vea de a ratos filas que otro archivo creó/borró a mitad de su propia
    // aserción. La suite corre en unos pocos segundos igual, así que se prioriza
    // la corrección del resultado sobre la velocidad.
    fileParallelism: false,
  },
});
