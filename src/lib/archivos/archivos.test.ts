import { AppError } from "@/lib/errors";

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  CreateBucketCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { validarImagen, subirArchivo } from "./archivos";

describe("validarImagen", () => {
  it("no lanza con un content-type e tamaño válidos", () => {
    expect(() => validarImagen("image/jpeg", 1024)).not.toThrow();
  });

  it("lanza TIPO_ARCHIVO_INVALIDO con un content-type no soportado", () => {
    expect(() => validarImagen("application/pdf", 1024)).toThrow(AppError);
    try {
      validarImagen("application/pdf", 1024);
    } catch (e) {
      expect((e as AppError).code).toBe("TIPO_ARCHIVO_INVALIDO");
    }
  });

  it("lanza ARCHIVO_DEMASIADO_GRANDE si supera 5MB", () => {
    try {
      validarImagen("image/png", 6 * 1024 * 1024);
      throw new Error("no lanzó");
    } catch (e) {
      expect((e as AppError).code).toBe("ARCHIVO_DEMASIADO_GRANDE");
    }
  });
});

describe("subirArchivo", () => {
  beforeEach(() => {
    sendMock.mockClear();
    process.env.S3_BUCKET = "almacenia-test";
    process.env.S3_PUBLIC_URL = "http://localhost:9000";
  });

  it("sube el archivo y devuelve la url pública", async () => {
    const resultado = await subirArchivo({
      tipo: "producto",
      entidadId: "prod-1",
      contentType: "image/jpeg",
      buffer: Buffer.from("contenido"),
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(resultado.url).toMatch(/^http:\/\/localhost:9000\/almacenia-test\/productos\/prod-1\/.+\.jpg$/);
  });

  it("crea el bucket y reintenta si el primer intento falla con NoSuchBucket", async () => {
    const noSuchBucket = Object.assign(new Error("no existe"), { name: "NoSuchBucket" });
    sendMock.mockRejectedValueOnce(noSuchBucket).mockResolvedValue({});

    const resultado = await subirArchivo({
      tipo: "producto",
      entidadId: "prod-1",
      contentType: "image/jpeg",
      buffer: Buffer.from("contenido"),
    });

    expect(sendMock).toHaveBeenCalledTimes(3); // put falla, create bucket, put reintento
    expect(resultado.url).toBeTruthy();
  });

  it("lanza TIPO_ARCHIVO_INVALIDO antes de llamar a S3", async () => {
    await expect(
      subirArchivo({ tipo: "avatar", entidadId: "u-1", contentType: "text/plain", buffer: Buffer.from("x") })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIPO_ARCHIVO_INVALIDO" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
