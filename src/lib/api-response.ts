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
  PRODUCTO_NO_ENCONTRADO: 404,
  PEDIDO_NO_ENCONTRADO: 404,
  NO_AUTORIZADO_PEDIDO: 403,
  TRANSICION_INVALIDA: 409,
  STOCK_INSUFICIENTE: 409,
  VENTA_NO_ENCONTRADA: 404,
  NO_AUTORIZADO_VENTA: 403,
  FORBIDDEN: 403,
  SOLICITUD_YA_PENDIENTE: 409,
  TIENDA_YA_VERIFICADA: 409,
  SOLICITUD_NO_ENCONTRADA: 404,
  CATALOGO_NO_ENCONTRADO: 404,
  CODIGO_BARRAS_DUPLICADO: 409,
  RESENA_SIN_COMPRA_PREVIA: 403,
  RESENA_DUPLICADA: 409,
  FOTOS_SOLO_PREMIUM: 403,
  CATALOGO_YA_TIENE_FOTO: 409,
  VALORACION_SIN_VENTA_PREVIA: 409,
  VALORACION_PROPIA: 409,
  USUARIO_NO_ENCONTRADO: 404,
  CHECKIN_FUERA_DE_RANGO: 409,
  CHECKIN_TIENDA_PROPIA: 409,
  LISTA_NO_ENCONTRADA: 404,
};

export function respuestaExitosa<T>(
  data: T,
  status = 200,
  meta?: { page: number; pageSize: number; total: number }
) {
  return NextResponse.json({ data, ...meta }, { status });
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
