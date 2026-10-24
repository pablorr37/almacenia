import webpush from "web-push";
import nodemailer, { type Transporter } from "nodemailer";

// Canales de entrega de 22-notificaciones.md. Sin variables de entorno el canal queda
// deshabilitado: se avisa una vez en el log y no rompe nada.

export interface SuscripcionDestino {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Urgency de Web Push: con "normal", Android en reposo no despierta el teléfono y el
// aviso llega recién al abrir Chrome (22-notificaciones.md).
export interface OpcionesPush {
  urgencia: "very-low" | "low" | "normal" | "high";
  ttl: number; // segundos
}

export interface CanalPush {
  habilitado(): boolean;
  enviar(sub: SuscripcionDestino, payload: string, opciones?: OpcionesPush): Promise<"ok" | "expirada" | "error">;
}

export interface CanalEmail {
  habilitado(): boolean;
  enviar(para: string, asunto: string, texto: string, html: string): Promise<void>;
}

const avisados = new Set<string>();
function avisarUnaVez(canal: string, falta: string) {
  if (avisados.has(canal)) return;
  avisados.add(canal);
  console.warn(`[notificaciones] canal ${canal} deshabilitado: falta ${falta}.`);
}

class WebPush implements CanalPush {
  private configurado = false;

  habilitado(): boolean {
    const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privada = process.env.VAPID_PRIVATE_KEY;
    if (!publica || !privada) {
      avisarUnaVez("push", "NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");
      return false;
    }
    if (!this.configurado) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@almacenia.store", publica, privada);
      this.configurado = true;
    }
    return true;
  }

  async enviar(sub: SuscripcionDestino, payload: string, opciones?: OpcionesPush): Promise<"ok" | "expirada" | "error"> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: opciones?.ttl ?? 60 * 60 * 24,
        urgency: opciones?.urgencia ?? "normal",
      });
      return "ok";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "expirada";
      console.error("[notificaciones] push falló:", status ?? error);
      return "error";
    }
  }
}

class EmailSmtp implements CanalEmail {
  private transporte: Transporter | null = null;

  habilitado(): boolean {
    if (!process.env.SMTP_HOST) {
      avisarUnaVez("email", "SMTP_HOST");
      return false;
    }
    return true;
  }

  async enviar(para: string, asunto: string, texto: string, html: string): Promise<void> {
    if (!this.transporte) {
      const port = Number(process.env.SMTP_PORT || 587);
      this.transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      });
    }
    await this.transporte.sendMail({
      from: process.env.EMAIL_FROM || "Almacenia <no-responder@almacenia.store>",
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
  }
}

const reales = { push: new WebPush() as CanalPush, email: new EmailSmtp() as CanalEmail };
let actuales = { ...reales };

export function canales(): { push: CanalPush; email: CanalEmail } {
  return actuales;
}

// Solo tests: canales falsos (null restaura los reales).
export function reemplazarCanalesParaTests(c: Partial<{ push: CanalPush; email: CanalEmail }> | null): void {
  actuales = c ? { ...reales, ...c } : { ...reales };
}
