"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { HomeInvitado } from "@/components/ui/HomeInvitado";
import { EstadoAperturaPill } from "@/components/ui/EstadoAperturaPill";
import { IconoTienda } from "@/components/ui/IconoTienda";
import { PuntosChip } from "@/components/ui/PuntosChip";
import type { TiendaMapa } from "@/components/ui/TiendaMap";
import { estadoApertura } from "@/lib/tiendas/horarios";
import { useAhora } from "@/lib/hooks/useAhora";

const TiendaMap = dynamic(
  () => import("@/components/ui/TiendaMap").then((m) => m.TiendaMap),
  { ssr: false },
);

type Tienda = TiendaMapa;

export default function MapaPage() {
  const { status } = useSession();

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-text-2">Cargando...</div>;
  }

  if (status !== "authenticated") {
    return <HomeInvitado />;
  }

  return <MapaAutenticado />;
}

function MapaAutenticado() {
  const [origen, setOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [snap, setSnap] = useState<"colapsado" | "medio" | "expandido">("medio");
  const ahora = useAhora();

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      setCargando(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigen({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setError("No pudimos acceder a tu ubicación. Permitila para ver tiendas cercanas.");
        setCargando(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!origen) return;
    apiGet<Tienda[]>(`/api/tiendas/cercanas?lat=${origen.lat}&lon=${origen.lon}`)
      .then(setTiendas)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al buscar tiendas."))
      .finally(() => setCargando(false));
  }, [origen]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {/* z-0 explícito (no "auto"): abre un contexto de apilamiento propio para
          que los z-index internos de Leaflet (tiles, controles — hasta 700+ en
          su CSS) no se comparen contra los de afuera (barra/sheet) y terminen
          tapándolos. Sin esto el mapa "gana" siempre y captura los gestos de
          drag/tap que deberían ir al bottom sheet. */}
      <div className="absolute inset-0 z-0">
        {origen ? (
          <TiendaMap origen={origen} tiendas={tiendas} onSelect={() => setSnap("colapsado")} />
        ) : (
          <div className="flex h-full items-center justify-center bg-primary-soft text-sm text-text-2">
            {cargando ? "Buscando tu ubicación..." : "Ubicación no disponible"}
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex max-w-md items-center justify-between px-5 pt-5">
        <span className="pointer-events-auto animate-fade-in-down rounded-pill bg-surface/95 px-3.5 py-1.5 font-display text-[18px] font-bold text-primary-dark shadow-card">
          Almacenia
        </span>
        <div className="pointer-events-auto flex items-center gap-2">
          <PuntosChip />
          <Link
            href="/mi-tienda"
            className="press flex h-11 items-center rounded-pill border border-border bg-surface/95 px-3.5 text-[13px] font-semibold text-text shadow-card"
          >
            Mi tienda
          </Link>
          <Link
            href="/perfil"
            className="press flex h-11 w-11 items-center justify-center rounded-pill border border-border bg-surface/95 text-text shadow-card"
            aria-label="Ir a mi cuenta"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Acceso a listas de compras sin entrar a una tienda (14-listas-compras.md) */}
      <Link
        href="/listas"
        className="press absolute left-5 top-[76px] z-20 flex h-11 animate-fade-in-down items-center gap-2 rounded-pill bg-primary px-4 text-[14px] font-semibold text-white shadow-cta"
        style={{ animationDelay: "80ms" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </svg>
        Lista de compras
      </Link>

      <BottomSheet
        snap={snap}
        onSnapChange={setSnap}
        header={
          <span className="text-[13px] font-semibold text-text-2">
            {cargando
              ? "Buscando tiendas..."
              : `${tiendas.length} ${tiendas.length === 1 ? "tienda" : "tiendas"} cerca tuyo`}
          </span>
        }
      >
        <div className="flex flex-col gap-2.5">
          {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
          {!error && !cargando && tiendas.length === 0 && (
            <p className="text-[13px] text-text-2">
              No encontramos tiendas cerca. Si tenés un comercio,{" "}
              <Link href="/mi-tienda" className="font-semibold text-accent-text">
                publicá tu tienda
              </Link>
              .
            </p>
          )}
          {tiendas.map((t, i) => (
            <Link
              key={t.id}
              href={`/tiendas/${t.id}`}
              style={{ "--i": i } as React.CSSProperties}
              className="press-soft stagger flex animate-fade-up items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-control bg-primary-soft text-primary-dark">
                {t.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imagenUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconoTienda />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="truncate text-[15px] font-semibold text-text">{t.nombre}</div>
                <div className="truncate text-xs text-text-2 tabular-nums">
                  {t.direccion} · {t.distanciaKm.toFixed(1)} km
                </div>
                <EstadoAperturaPill estado={estadoApertura(t.horarios, ahora)} className="self-start" />
              </div>
            </Link>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
