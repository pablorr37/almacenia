"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";

const TiendaMap = dynamic(
  () => import("@/components/ui/TiendaMap").then((m) => m.TiendaMap),
  { ssr: false },
);

type Tienda = {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  distanciaKm: number;
};

export default function MapaPage() {
  const { data: session, status } = useSession();
  const [origen, setOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

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
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <span className="font-display text-[22px] font-bold text-primary-dark">
          Almacenia
        </span>
        {status === "authenticated" ? (
          <button
            onClick={() => signOut()}
            className="flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-surface text-[13px] font-semibold"
            aria-label="Cerrar sesión"
          >
            {session.user?.name?.[0]?.toUpperCase() ?? "?"}
          </button>
        ) : (
          <Link
            href="/login"
            className="flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-surface"
            aria-label="Ir a mi cuenta"
          >
            👤
          </Link>
        )}
      </div>

      <div className="mx-5 mb-3.5 h-48 overflow-hidden rounded-card border border-border">
        {origen ? (
          <TiendaMap origen={origen} tiendas={tiendas} onSelect={() => {}} />
        ) : (
          <div className="flex h-full items-center justify-center bg-primary-soft text-sm text-text-2">
            {cargando ? "Buscando tu ubicación..." : "Ubicación no disponible"}
          </div>
        )}
      </div>

      <div className="px-5 pb-2 text-[13px] font-semibold text-text-2">Cerca tuyo</div>

      <div className="flex flex-grow flex-col gap-2.5 overflow-y-auto px-5 pb-6">
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {!error && !cargando && tiendas.length === 0 && (
          <p className="text-[13px] text-text-2">
            No encontramos tiendas cerca. Si tenés un comercio,{" "}
            <Link href="/mi-tienda" className="font-semibold text-accent">
              publicá tu tienda
            </Link>
            .
          </p>
        )}
        {tiendas.map((t, i) => (
          <Link
            key={t.id}
            href={`/tiendas/${t.id}`}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[0_1px_3px_rgba(32,26,21,0.05)]"
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-pill bg-primary-soft font-bold text-primary-dark">
              {i + 1}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[15px] font-semibold text-text">{t.nombre}</div>
              <div className="text-xs text-text-2">
                {t.direccion} · {t.distanciaKm.toFixed(1)} km
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex justify-around border-t border-border bg-surface px-5 py-3">
        <div className="flex flex-col items-center gap-1 text-[11px] font-semibold text-primary">
          Mapa
        </div>
        <Link href="/mi-tienda" className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-2">
          Mi tienda
        </Link>
        <Link
          href={status === "authenticated" ? "#" : "/login"}
          onClick={status === "authenticated" ? () => signOut() : undefined}
          className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-2"
        >
          Cuenta
        </Link>
      </div>
    </div>
  );
}
