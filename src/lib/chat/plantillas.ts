// Plantillas del chat (24-chat.md). Sin dependencias de servidor: las usa también la UI.

export type Plantilla = "abierta" | "si_abierta" | "no_abierta" | "ajuste";
export type LadoChat = "comprador" | "tienda" | "sistema";

export const PLANTILLAS: Record<Plantilla, { de: LadoChat; texto: string }> = {
  abierta: { de: "comprador", texto: "¡Hola! Buen día. ¿La tienda está abierta?" },
  si_abierta: { de: "tienda", texto: "¡Hola! Sí, estamos abiertos. ¡Te esperamos!" },
  no_abierta: { de: "tienda", texto: "¡Hola! Por ahora estamos cerrados. ¡Gracias por escribir!" },
  ajuste: { de: "sistema", texto: "" },
};

export const TEXTO_MAXIMO_CHAT = 1000;

export function plantillasDe(lado: "comprador" | "tienda"): Array<{ clave: Plantilla; texto: string }> {
  return (Object.keys(PLANTILLAS) as Plantilla[]).filter((k) => PLANTILLAS[k].de === lado).map((clave) => ({ clave, texto: PLANTILLAS[clave].texto }));
}
