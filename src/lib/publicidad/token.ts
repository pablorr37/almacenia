import { createHmac, timingSafeEqual } from "node:crypto";
import type { EspacioAviso } from "./reglas";

// Token firmado de una entrega de aviso (21-publicidad.md): HMAC-SHA256 con
// AUTH_SECRET, vence en 1 hora. El nonce hace única cada impresión y cada clic.

export interface PayloadAviso {
  c: string; // campaña
  p: string; // pieza
  e: EspacioAviso;
  u: string | null; // usuario (null = invitado)
  n: string; // nonce
}

const VIGENCIA_MS = 60 * 60 * 1000;

function secreto(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET para firmar avisos.");
  return s;
}

function firmar(cuerpo: string): string {
  return createHmac("sha256", secreto()).update(`aviso:${cuerpo}`).digest("base64url");
}

export function firmarToken(payload: PayloadAviso, ahora = new Date()): string {
  const cuerpo = Buffer.from(JSON.stringify({ ...payload, x: ahora.getTime() + VIGENCIA_MS })).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function verificarToken(token: string, ahora = new Date()): PayloadAviso | null {
  if (typeof token !== "string") return null;
  const [cuerpo, firma, sobra] = token.split(".");
  if (!cuerpo || !firma || sobra !== undefined) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as PayloadAviso & { x: number };
    if (typeof datos.x !== "number" || datos.x < ahora.getTime()) return null;
    return { c: datos.c, p: datos.p, e: datos.e, u: datos.u ?? null, n: datos.n };
  } catch {
    return null;
  }
}
