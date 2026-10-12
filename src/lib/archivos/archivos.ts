import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { AppError } from "@/lib/errors";

const TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
type ContentTypeValido = (typeof TIPOS_VALIDOS)[number];

const TAMANIO_MAXIMO_BYTES = 5 * 1024 * 1024;

const EXTENSION_POR_TIPO: Record<ContentTypeValido, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type TipoArchivo = "tienda" | "producto" | "catalogo" | "avatar" | "bancofotos";

export function validarImagen(contentType: string, tamanioBytes: number): void {
  if (!(TIPOS_VALIDOS as readonly string[]).includes(contentType)) {
    throw new AppError("TIPO_ARCHIVO_INVALIDO", "Solo se aceptan imágenes JPEG, PNG o WEBP.");
  }
  if (tamanioBytes > TAMANIO_MAXIMO_BYTES) {
    throw new AppError("ARCHIVO_DEMASIADO_GRANDE", "El archivo no puede superar los 5 MB.");
  }
}

// El cliente se crea perezosamente (no al importar el módulo) para que los tests
// que solo ejercitan validarImagen no necesiten las variables de entorno de S3.
let clienteS3: S3Client | null = null;
function obtenerClienteS3(): S3Client {
  if (!clienteS3) {
    clienteS3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
  }
  return clienteS3;
}

export interface SubirArchivoInput {
  tipo: TipoArchivo;
  entidadId: string;
  contentType: string;
  buffer: Buffer;
}

const CARPETA_POR_TIPO: Record<TipoArchivo, string> = {
  tienda: "tiendas",
  producto: "productos",
  catalogo: "catalogo",
  avatar: "usuarios",
  bancofotos: "bancofotos",
};

function construirKey(input: SubirArchivoInput, extension: string): string {
  const carpeta = CARPETA_POR_TIPO[input.tipo];
  const nombre = input.tipo === "avatar" ? `avatar-${crypto.randomUUID()}` : crypto.randomUUID();
  return `${carpeta}/${input.entidadId}/${nombre}.${extension}`;
}

// Config mínima del almacenamiento; sin ella no tiene sentido intentar (08-archivos.md).
function configAlmacenamiento(): { bucket: string; endpoint: string } {
  const bucket = process.env.S3_BUCKET ?? "";
  const endpoint = process.env.S3_ENDPOINT ?? "";
  const faltan = [!bucket && "S3_BUCKET", !endpoint && "S3_ENDPOINT"].filter(Boolean);
  if (faltan.length > 0) {
    console.error("[almacenamiento]", "Configuración incompleta:", faltan.join(", "));
    throw new AppError(
      "ALMACENAMIENTO_NO_CONFIGURADO",
      `El almacenamiento de fotos no está configurado (falta ${faltan.join(" y ")}). Avisale al administrador.`
    );
  }
  return { bucket, endpoint };
}

// AppError con el detalle técnico aparte: el usuario ve el mensaje, el admin (en el
// diagnóstico) y el log ven el detalle.
class ErrorAlmacenamiento extends AppError {
  detalle: string;
  constructor(detalle: string) {
    super("ALMACENAMIENTO_NO_DISPONIBLE", "No se pudo guardar la foto en el almacenamiento. Avisale al administrador.");
    this.detalle = detalle;
  }
}

function noDisponible(error: unknown): ErrorAlmacenamiento {
  const e = error as { name?: string; message?: string };
  const nombre = e?.name ?? "Error";
  const mensaje = e?.message ?? String(error);
  console.error("[almacenamiento]", nombre, mensaje);
  return new ErrorAlmacenamiento(`${nombre}: ${mensaje}`);
}

// Lectura pública anónima, solo GetObject (nunca escritura ni listado): las fotos
// se muestran con <img src> directo al bucket (08-archivos.md).
async function asegurarLecturaPublica(cliente: S3Client, bucket: string): Promise<void> {
  const politica = {
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucket}/*`] }],
  };
  await cliente.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(politica) }));
}

async function enviarConBucket(cliente: S3Client, bucket: string, comando: PutObjectCommand): Promise<void> {
  try {
    await cliente.send(comando);
  } catch (error) {
    // Primer upload contra un bucket que todavía no existe (deploy nuevo, o el
    // servidor S3-compatible local no soporta crear el bucket al arrancar): se
    // crea una única vez y se reintenta, en vez de exigir un paso manual previo.
    if (error instanceof Error && error.name === "NoSuchBucket") {
      try {
        await cliente.send(new CreateBucketCommand({ Bucket: bucket }));
        await asegurarLecturaPublica(cliente, bucket);
        await cliente.send(comando);
        return;
      } catch (reintento) {
        throw noDisponible(reintento);
      }
    }
    throw noDisponible(error);
  }
}

export async function subirArchivo(input: SubirArchivoInput): Promise<{ url: string }> {
  validarImagen(input.contentType, input.buffer.byteLength);
  const { bucket } = configAlmacenamiento();

  const extension = EXTENSION_POR_TIPO[input.contentType as ContentTypeValido];
  const key = construirKey(input, extension);
  const cliente = obtenerClienteS3();
  const comando = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.buffer,
    ContentType: input.contentType,
  });

  await enviarConBucket(cliente, bucket, comando);

  const urlPublica = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "";
  return { url: `${urlPublica.replace(/\/$/, "")}/${bucket}/${key}` };
}

export interface ResultadoAlmacenamiento {
  ok: boolean;
  bucket: string;
  endpoint: string;
  error?: string;
  lecturaPublica: boolean;
  errorLectura?: string;
}

// Diagnóstico del admin (11-admin.md): escribe un archivo de prueba, asegura la
// lectura pública del bucket, lo lee de forma anónima por S3_PUBLIC_URL (como lo
// haría el navegador) y lo borra. Nunca lanza ni devuelve credenciales.
export async function probarAlmacenamiento(opciones: { fetch?: typeof fetch } = {}): Promise<ResultadoAlmacenamiento> {
  const bucket = process.env.S3_BUCKET ?? "";
  const endpoint = process.env.S3_ENDPOINT ?? "";
  let config: { bucket: string; endpoint: string };
  try {
    config = configAlmacenamiento();
  } catch (error) {
    return { ok: false, bucket, endpoint, error: (error as Error).message, lecturaPublica: false };
  }

  const key = `diagnostico/${crypto.randomUUID()}.txt`;
  const cliente = obtenerClienteS3();
  try {
    await enviarConBucket(
      cliente,
      config.bucket,
      new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: "ok", ContentType: "text/plain" })
    );
  } catch (error) {
    const detalle = error instanceof ErrorAlmacenamiento ? error.detalle : noDisponible(error).detalle;
    return { ok: false, ...config, error: detalle, lecturaPublica: false };
  }

  const lectura = await probarLecturaPublica(cliente, config.bucket, key, opciones.fetch ?? fetch);
  await cliente.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })).catch(() => {});
  return { ok: true, ...config, ...lectura };
}

async function probarLecturaPublica(
  cliente: S3Client,
  bucket: string,
  key: string,
  hacerFetch: typeof fetch
): Promise<{ lecturaPublica: boolean; errorLectura?: string }> {
  try {
    await asegurarLecturaPublica(cliente, bucket);
  } catch (error) {
    const e = error as { name?: string; message?: string };
    console.error("[almacenamiento]", "No se pudo aplicar la política de lectura:", e?.name, e?.message);
  }
  const urlPublica = (process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
  const url = `${urlPublica}/${bucket}/${key}`;
  try {
    const respuesta = await hacerFetch(url, { signal: AbortSignal.timeout(10_000) });
    if (respuesta.ok) return { lecturaPublica: true };
    return {
      lecturaPublica: false,
      errorLectura: `La URL pública respondió ${respuesta.status}: el navegador no va a poder mostrar las fotos. Revisá la política del bucket.`,
    };
  } catch {
    return {
      lecturaPublica: false,
      errorLectura: `No se pudo abrir ${urlPublica}: S3_PUBLIC_URL tiene que ser una URL pública del almacenamiento (por ejemplo el dominio del recurso MinIO).`,
    };
  }
}
