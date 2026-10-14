// Solo para tests: categorías y rubros de prueba (17-rubros-categorias.md). Idempotente
// por nombre normalizado, así los archivos de test pueden compartirlas sin chocar.
import { prisma } from "@/lib/prisma";
import { normalizarNombre } from "./rubros-categorias";

export async function categoriaDePrueba(nombre = "Prueba"): Promise<string> {
  const nombreNormalizado = normalizarNombre(nombre);
  const fila = await prisma.categoriaProducto.upsert({
    where: { nombreNormalizado },
    update: {},
    create: { nombre, nombreNormalizado },
  });
  return fila.id;
}

// Atajo para el alta de producto nuevo en tests: `nuevo: await nuevoDePrueba("Yerba")`
// crea la entrada "Prueba Yerba" (categoría de prueba + variante).
export async function nuevoDePrueba(variante: string, extra: Record<string, unknown> = {}) {
  return { categoriaId: await categoriaDePrueba(), variante, ...extra };
}
