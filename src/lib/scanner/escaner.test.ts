import {
  FORMATOS_NATIVOS,
  constraintsCamara,
  elegirMotor,
  ajustesEnfoque,
  mensajeErrorCamara,
} from "./escaner";

describe("elegirMotor", () => {
  it("usa el BarcodeDetector nativo si soporta EAN-13 o QR", () => {
    expect(elegirMotor({ hayDetectorNativo: true, formatosNativos: ["ean_13", "qr_code"] })).toBe("nativo");
    expect(elegirMotor({ hayDetectorNativo: true, formatosNativos: ["qr_code"] })).toBe("nativo");
  });
  it("cae a zxing si no hay detector o no soporta nuestros formatos", () => {
    expect(elegirMotor({ hayDetectorNativo: false, formatosNativos: [] })).toBe("zxing");
    expect(elegirMotor({ hayDetectorNativo: true, formatosNativos: ["aztec"] })).toBe("zxing");
  });
});

describe("FORMATOS_NATIVOS", () => {
  it("son los que usamos: EAN, UPC, Code 128 y QR", () => {
    expect(FORMATOS_NATIVOS).toEqual(["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"]);
  });
});

describe("constraintsCamara", () => {
  it("pide la cámara trasera en alta resolución y sin audio", () => {
    expect(constraintsCamara()).toEqual({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  });
});

describe("ajustesEnfoque", () => {
  it("enfoque continuo y linterna cuando la cámara los ofrece", () => {
    expect(ajustesEnfoque({ focusMode: ["manual", "continuous"], torch: true })).toEqual({
      advanced: [{ focusMode: "continuous" }],
      enfoqueAlTocar: false,
      linterna: true,
    });
  });
  it("si solo hay single-shot, se reenfoca al tocar", () => {
    expect(ajustesEnfoque({ focusMode: ["single-shot"] })).toEqual({
      advanced: [{ focusMode: "single-shot" }],
      enfoqueAlTocar: true,
      linterna: false,
    });
  });
  it("sin capacidades conocidas no pide nada", () => {
    expect(ajustesEnfoque(undefined)).toEqual({ advanced: [], enfoqueAlTocar: false, linterna: false });
  });
});

describe("mensajeErrorCamara", () => {
  it("explica cada caso", () => {
    expect(mensajeErrorCamara({ name: "NotAllowedError" }, true)).toMatch(/permiso/i);
    expect(mensajeErrorCamara({ name: "NotFoundError" }, true)).toMatch(/no encontramos ninguna cámara/i);
    expect(mensajeErrorCamara({ name: "NotReadableError" }, true)).toMatch(/otra app/i);
    expect(mensajeErrorCamara({ name: "TypeError" }, false)).toMatch(/https/i);
    expect(mensajeErrorCamara(new Error("x"), true)).toMatch(/no pudimos abrir la cámara/i);
  });
});
