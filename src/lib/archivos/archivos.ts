import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { AppError } from "@/lib/errors";

const TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
type ContentTypeValido = (typeof TIPOS_VALIDOS)[number];

const TAMANIO_MAXIMO_BYTES = 5 * 1024 * 1024;

const EXTENSION_POR_TIPO: Record<ContentTypeValido, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type TipoArchivo = "tienda" | "producto" | "catalogo" | "avatar";

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
};

function construirKey(input: SubirArchivoInput, extension: string): string {
  const carpeta = CARPETA_POR_TIPO[input.tipo];
  const nombre = input.tipo === "avatar" ? `avatar-${crypto.randomUUID()}` : crypto.randomUUID();
  return `${carpeta}/${input.entidadId}/${nombre}.${extension}`;
}

export async function subirArchivo(input: SubirArchivoInput): Promise<{ url: string }> {
  validarImagen(input.contentType, input.buffer.byteLength);

  const extension = EXTENSION_POR_TIPO[input.contentType as ContentTypeValido];
  const key = construirKey(input, extension);
  const bucket = process.env.S3_BUCKET ?? "";
  const cliente = obtenerClienteS3();
  const comando = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: input.buffer,
    ContentType: input.contentType,
  });

  try {
    await cliente.send(comando);
  } catch (error) {
    // Primer upload contra un bucket que todavía no existe (deploy nuevo, o el
    // servidor S3-compatible local no soporta crear el bucket al arrancar): se
    // crea una única vez y se reintenta, en vez de exigir un paso manual previo.
    if (error instanceof Error && error.name === "NoSuchBucket") {
      await cliente.send(new CreateBucketCommand({ Bucket: bucket }));
      await cliente.send(comando);
    } else {
      throw error;
    }
  }

  const urlPublica = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "";
  return { url: `${urlPublica.replace(/\/$/, "")}/${bucket}/${key}` };
}
