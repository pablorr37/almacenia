// Escáner de códigos (alta de productos por código de barras y QR del cliente).
// Funciones puras: qué motor de lectura usar, qué pedirle a la cámara, cómo enfocar y
// qué decirle al usuario si falla. El hook y el componente las usan.

// Formatos que usamos, con los nombres del BarcodeDetector nativo.
export const FORMATOS_NATIVOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] as const;

export type Motor = "nativo" | "zxing";

// El BarcodeDetector nativo (Chrome Android, Edge, Safari 17+) lee mucho mejor que
// zxing en JS; se usa si existe y soporta al menos EAN-13 o QR.
export function elegirMotor(entorno: { hayDetectorNativo: boolean; formatosNativos: string[] }): Motor {
  if (!entorno.hayDetectorNativo) return "zxing";
  return entorno.formatosNativos.some((f) => f === "ean_13" || f === "qr_code") ? "nativo" : "zxing";
}

// Cámara trasera y alta resolución: los códigos de barras finos necesitan píxeles.
export function constraintsCamara(): MediaStreamConstraints {
  return {
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  };
}

type Capacidades = { focusMode?: string[]; torch?: boolean } | undefined;

// Enfoque: continuo si la cámara lo ofrece; si solo hay "single-shot", se reenfoca
// cada vez que el usuario toca la imagen. Linterna si la cámara tiene torch.
export function ajustesEnfoque(capacidades: Capacidades): {
  advanced: Array<Record<string, unknown>>;
  enfoqueAlTocar: boolean;
  linterna: boolean;
} {
  const modos = capacidades?.focusMode ?? [];
  const linterna = capacidades?.torch === true;
  if (modos.includes("continuous")) return { advanced: [{ focusMode: "continuous" }], enfoqueAlTocar: false, linterna };
  if (modos.includes("single-shot")) return { advanced: [{ focusMode: "single-shot" }], enfoqueAlTocar: true, linterna };
  return { advanced: [], enfoqueAlTocar: false, linterna };
}

export function mensajeErrorCamara(error: unknown, contextoSeguro: boolean): string {
  if (!contextoSeguro) return "La cámara solo funciona con https. Abrí la app desde su dirección segura.";
  const nombre = (error as { name?: string })?.name;
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "No tenemos permiso para usar la cámara. Habilitalo en la configuración del navegador y volvé a intentar.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "No encontramos ninguna cámara en este dispositivo.";
  if (nombre === "NotReadableError") return "La cámara está ocupada por otra app. Cerrala y volvé a intentar.";
  return "No pudimos abrir la cámara. Volvé a intentar.";
}
