"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/api-client";
import { CATEGORIAS, ETIQUETA_CATEGORIA, type Categoria } from "@/lib/notificaciones/catalogo";
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from "@/lib/notificaciones/push-cliente";

type Preferencia = { categoria: Categoria; enApp: boolean; push: boolean; email: boolean };
const CANALES = [
  ["enApp", "App"],
  ["push", "Push"],
  ["email", "Email"],
] as const;

const TEXTO_PUSH: Record<EstadoPush, string> = {
  no_soportado: "Este navegador no admite notificaciones push.",
  ios_instalar: "En iPhone, primero instalá Almacenia: tocá Compartir → «Agregar a inicio» y abrila desde el ícono.",
  deshabilitado: "Las notificaciones push todavía no están disponibles.",
  bloqueado: "Bloqueaste las notificaciones: habilitalas en la configuración del navegador.",
  inactivo: "Recibí avisos en este dispositivo aunque la app esté cerrada.",
  activo: "Este dispositivo recibe notificaciones push.",
};

// Preferencias por categoría y canal + activar push en este dispositivo (22-notificaciones.md).
export function PreferenciasNotificaciones({ plan }: { plan: string | null }) {
  const [prefs, setPrefs] = useState<Preferencia[] | null>(null);
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    apiGet<Preferencia[]>("/api/notificaciones/preferencias").then(setPrefs).catch(() => setPrefs([]));
    estadoPush().then(setPush).catch(() => setPush("no_soportado"));
  }, []);

  async function cambiar(p: Preferencia, canal: (typeof CANALES)[number][0], valor: boolean) {
    const nueva = { ...p, [canal]: valor };
    setPrefs((l) => l?.map((x) => (x.categoria === p.categoria ? nueva : x)) ?? null);
    await apiPut("/api/notificaciones/preferencias", nueva).catch(() => {
      setPrefs((l) => l?.map((x) => (x.categoria === p.categoria ? p : x)) ?? null);
    });
  }

  async function alternarPush() {
    setOcupado(true);
    try {
      setPush(push === "activo" ? await desactivarPush() : await activarPush());
    } catch {
      setPush("no_soportado");
    } finally {
      setOcupado(false);
    }
  }

  // Publicidad solo para free (premium y plata no reciben publicidad).
  const visibles = (prefs ?? []).filter((p) => p.categoria !== "publicidad" || plan === "free");

  return (
    <section aria-labelledby="titulo-notif" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 id="titulo-notif" className="text-[15px] font-semibold text-text">
        Notificaciones
      </h2>
      {push && (
        <div className="flex flex-col gap-2 rounded-control bg-bg p-3">
          <p className="text-[13px] text-text-2">{TEXTO_PUSH[push]}</p>
          {(push === "inactivo" || push === "activo") && (
            <button
              type="button"
              disabled={ocupado}
              onClick={alternarPush}
              className="press h-11 self-start rounded-control border border-border bg-surface px-4 text-[14px] font-semibold text-text disabled:opacity-50"
            >
              {push === "activo" ? "Desactivar en este dispositivo" : "Activar notificaciones push"}
            </button>
          )}
        </div>
      )}
      {prefs === null ? (
        <div className="h-32 animate-pulse rounded-control bg-placeholder" />
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-text-2">
              <th className="py-1.5 font-semibold">Qué</th>
              {CANALES.map(([, t]) => (
                <th key={t} className="w-14 py-1.5 text-center font-semibold">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIAS.filter((c) => visibles.some((p) => p.categoria === c)).map((c) => {
              const p = visibles.find((x) => x.categoria === c)!;
              return (
                <tr key={c} className="border-t border-border">
                  <td className="py-2 pr-2 text-text">{ETIQUETA_CATEGORIA[c]}</td>
                  {CANALES.map(([canal, t]) => (
                    <td key={canal} className="py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${ETIQUETA_CATEGORIA[c]}: ${t}`}
                        checked={p[canal]}
                        onChange={(e) => cambiar(p, canal, e.target.checked)}
                        className="h-5 w-5 accent-primary"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
