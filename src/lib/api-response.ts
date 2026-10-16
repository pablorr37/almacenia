import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";

// Mapa de código de error -> status HTTP, ver specs/sdd/00-overview.md.
// 400 por default para códigos de validación no listados acá explícitamente.
const STATUS_POR_CODIGO: Record<string, number> = {
  EMAIL_YA_REGISTRADO: 409,
  CREDENCIALES_INVALIDAS: 401,
  NO_AUTENTICADO: 401,
  NO_ES_DUENO_DE_TIENDA: 403,
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
  SOLO_CURADORES: 403,
  FOTO_NO_ENCONTRADA: 404,
  FUENTE_EXTERNA_NO_DISPONIBLE: 502,
  ALMACENAMIENTO_NO_DISPONIBLE: 503,
  CUENTA_PAUSADA: 403,
  CUENTA_BANEADA: 403,
  TIENDA_NO_DISPONIBLE: 409,
  ACCION_SOBRE_SI_MISMO: 409,
  LIMITE_ALTAS_CATALOGO: 429,
  CATALOGO_EN_USO: 409,
  // 17-rubros-categorias.md
  RUBRO_NO_ENCONTRADO: 404,
  CATEGORIA_NO_ENCONTRADA: 404,
  NOMBRE_DUPLICADO: 409,
  RUBRO_EN_USO: 409,
  CATEGORIA_EN_USO: 409,
  // 06-catalogo.md
  CONTENIDO_INVALIDO: 400,
  TEXTO_INVALIDO: 400,
  ALMACENAMIENTO_NO_CONFIGURADO: 503,
  // 19-equipo-tienda.md
  SIN_PERMISO: 403,
  MIEMBRO_YA_EXISTE: 409,
  ES_PROPIETARIO: 409,
  MIEMBRO_NO_ENCONTRADO: 404,
};

// 00-overview.md, "Sin caché": datos vivos, nadie (navegador, Cloudflare, proxy)
// puede servir una copia vieja.
const SIN_CACHE = { "Cache-Control": "no-store" };

export function respuestaExitosa<T>(
  data: T,
  status = 200,
  meta?: { page: number; pageSize: number; total: number }
) {
  return NextResponse.json({ data, ...meta }, { status, headers: SIN_CACHE });
}

export function respuestaError(error: unknown) {
  if (error instanceof AppError) {
    const status = STATUS_POR_CODIGO[error.code] ?? 400;
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status, headers: SIN_CACHE }
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: "ERROR_INTERNO", message: "Ocurrió un error inesperado." } },
    { status: 500, headers: SIN_CACHE }
  );
}
