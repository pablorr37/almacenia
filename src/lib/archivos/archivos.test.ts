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
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { validarImagen, subirArchivo, probarAlmacenamiento } from "./archivos";

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

describe("errores de almacenamiento", () => {
  const input = { tipo: "producto" as const, entidadId: "p", contentType: "image/jpeg", buffer: Buffer.from("x") };

  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({});
    process.env.S3_BUCKET = "almacenia-test";
    process.env.S3_ENDPOINT = "http://minio:9000";
    process.env.S3_PUBLIC_URL = "http://localhost:9000";
  });

  it("un error del SDK (credenciales, red, disco) se convierte en ALMACENAMIENTO_NO_DISPONIBLE", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(Object.assign(new Error("Access Denied."), { name: "AccessDenied" }));
    await expect(subirArchivo(input)).rejects.toMatchObject<Partial<AppError>>({ code: "ALMACENAMIENTO_NO_DISPONIBLE" });
    expect(errorSpy).toHaveBeenCalledWith("[almacenamiento]", "AccessDenied", "Access Denied.");
    errorSpy.mockRestore();
  });

  it("si falla la creación del bucket también es ALMACENAMIENTO_NO_DISPONIBLE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock
      .mockRejectedValueOnce(Object.assign(new Error("no existe"), { name: "NoSuchBucket" }))
      .mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED"), { name: "Error" }));
    await expect(subirArchivo(input)).rejects.toMatchObject({ code: "ALMACENAMIENTO_NO_DISPONIBLE" });
  });

  it("sin S3_BUCKET o S3_ENDPOINT: ALMACENAMIENTO_NO_CONFIGURADO, sin llamar a S3", async () => {
    delete process.env.S3_BUCKET;
    await expect(subirArchivo(input)).rejects.toMatchObject({ code: "ALMACENAMIENTO_NO_CONFIGURADO" });
    process.env.S3_BUCKET = "almacenia-test";
    delete process.env.S3_ENDPOINT;
    await expect(subirArchivo(input)).rejects.toMatchObject({ code: "ALMACENAMIENTO_NO_CONFIGURADO" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("probarAlmacenamiento", () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({});
    process.env.S3_BUCKET = "almacenia-test";
    process.env.S3_ENDPOINT = "http://minio:9000";
    process.env.S3_ACCESS_KEY = "clave-secreta";
  });

  it("escribe y borra un archivo de prueba", async () => {
    const r = await probarAlmacenamiento();
    expect(r).toEqual({ ok: true, bucket: "almacenia-test", endpoint: "http://minio:9000" });
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(r)).not.toContain("clave-secreta");
  });

  it("informa el error exacto sin lanzar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(Object.assign(new Error("Storage backend has reached its minimum free drive threshold."), { name: "XMinioStorageFull" }));
    const r = await probarAlmacenamiento();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("XMinioStorageFull: Storage backend has reached its minimum free drive threshold.");
  });

  it("sin configuración informa qué variable falta", async () => {
    delete process.env.S3_ENDPOINT;
    const r = await probarAlmacenamiento();
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("S3_ENDPOINT") });
  });
});
