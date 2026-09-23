// Formato de error compartido por todos los módulos, ver specs/sdd/00-overview.md
// ("Formato de respuesta de la API"). Las funciones de src/lib/<modulo>/ tiran
// AppError; las API routes lo mapean a { error: { code, message } } + status HTTP.
export class AppError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}
