import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";

// Mapa de código de error -> status HTTP, ver specs/sdd/00-overview.md.
// 400 por default para códigos de validación no listados acá explícitamente.
const STATUS_POR_CODIGO: Record<string, number> = {
  EMAIL_YA_REGISTRADO: 409,
  CREDENCIALES_INVALIDAS: 401,
  NO_AUTENTICADO: 401,
  NO_ES_DUENO_DE_TIENDA: 403,
  USUARIO_YA_TIENE_TIENDA: 409,
  TIENDA_NO_ENCONTRADA: 404,
};

export function respuestaExitosa<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function respuestaError(error: unknown) {
  if (error instanceof AppError) {
    const status = STATUS_POR_CODIGO[error.code] ?? 400;
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status }
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: "ERROR_INTERNO", message: "Ocurrió un error inesperado." } },
    { status: 500 }
  );
}
