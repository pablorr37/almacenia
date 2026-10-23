"use client";

import { apiDelete, apiGet, apiPost } from "@/lib/api-client";

// Suscripción Web Push desde el navegador (22-notificaciones.md), siguiendo la guía
// de PWA de Next. El permiso se pide solo después de que la persona toca un botón.

export type EstadoPush = "no_soportado" | "ios_instalar" | "deshabilitado" | "bloqueado" | "inactivo" | "activo";

function base64UrlAUint8(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const salida = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) salida[i] = crudo.charCodeAt(i);
  return salida;
}

export function esIosSinInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !instalada;
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export async function estadoPush(): Promise<EstadoPush> {
  if (esIosSinInstalar()) return "ios_instalar";
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "no_soportado";
  }
  const { clavePublica } = await apiGet<{ clavePublica: string | null }>("/api/push/clave");
  if (!clavePublica) return "deshabilitado";
  if (Notification.permission === "denied") return "bloqueado";
  const registro = await navigator.serviceWorker.getRegistration("/");
  const sub = await registro?.pushManager.getSubscription();
  return sub ? "activo" : "inactivo";
}

export async function activarPush(): Promise<EstadoPush> {
  const { clavePublica } = await apiGet<{ clavePublica: string | null }>("/api/push/clave");
  if (!clavePublica) return "deshabilitado";
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return permiso === "denied" ? "bloqueado" : "inactivo";
  const registro = (await registrarServiceWorker())!;
  await navigator.serviceWorker.ready;
  const sub =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlAUint8(clavePublica) }));
  await apiPost("/api/push/suscripcion", sub.toJSON());
  return "activo";
}

export async function desactivarPush(): Promise<EstadoPush> {
  const registro = await navigator.serviceWorker.getRegistration("/");
  const sub = await registro?.pushManager.getSubscription();
  if (sub) {
    await apiDelete("/api/push/suscripcion", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return "inactivo";
}
