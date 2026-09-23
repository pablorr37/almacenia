import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // src/generated/ es el output del pipeline local pausado (ver CLAUDE.md),
    // no parte de la app activa — se excluye para que `npm test` no dependa de él.
    exclude: ["node_modules/**", "src/generated/**"],
    // Todavía no hay módulos reales implementados (ver CLAUDE.md, TDD en curso) —
    // sin esto, `npm test` fallaría solo por no encontrar tests, no por un error real.
    passWithNoTests: true,
  },
});
