"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { estadoApertura, type HorarioTienda } from "@/lib/tiendas/horarios";
import { useAhora } from "@/lib/hooks/useAhora";
import { EstadoAperturaPill } from "./EstadoAperturaPill";
import { IconoTienda, PATH_ICONO_TIENDA } from "./IconoTienda";

export type TiendaMapa = {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  distanciaKm: number;
  horarios: HorarioTienda[];
  imagenUrl: string | null;
  verificada: boolean;
};

// Pin propio con ícono de tienda (ver docs/auditoria-ui-ux.md §6.1): gota teal si
// está abierta u horario desconocido, gris si está cerrada. Área de toque 44×52.
function iconoPin(cerrada: boolean, indice: number): L.DivIcon {
  return L.divIcon({
    className: `pin-tienda${cerrada ? " pin-tienda--cerrada" : ""}`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
    html: `
      <span class="pin-tienda__cuerpo" style="animation-delay:${Math.min(indice, 10) * 30}ms">
        <svg viewBox="0 0 36 44" width="36" height="44" aria-hidden="true">
          <path class="pin-tienda__gota" d="M18 43c-1-.9-15-13.7-15-25.5C3 8.8 9.7 2 18 2s15 6.8 15 15.5C33 29.3 19 42.1 18 43z" />
          <g transform="translate(8.5 7.5) scale(0.79)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="${PATH_ICONO_TIENDA}" />
          </g>
        </svg>
      </span>`,
  });
}

// Encuadre inicial: el usuario + las tiendas más cercanas, dejando libre la franja
// que tapan la barra superior y el bottom sheet (si no, las tiendas quedan debajo
// del sheet y no se pueden tocar). Solo la primera vez que llegan tiendas.
function EncuadreInicial({
  origen,
  tiendas,
  paddingInferior,
}: {
  origen: { lat: number; lon: number };
  tiendas: TiendaMapa[];
  paddingInferior: number;
}) {
  const map = useMap();
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current || tiendas.length === 0) return;
    hecho.current = true;
    const cercanas = [...tiendas].sort((a, b) => a.distanciaKm - b.distanciaKm).slice(0, 8);
    const puntos: L.LatLngExpression[] = [[origen.lat, origen.lon], ...cercanas.map((t) => [t.lat, t.lon] as [number, number])];
    map.fitBounds(L.latLngBounds(puntos), {
      paddingTopLeft: [32, 140],
      paddingBottomRight: [32, paddingInferior + 24],
      maxZoom: 16,
      animate: false,
    });
  }, [map, origen, tiendas, paddingInferior]);
  return null;
}

export function TiendaMap({
  origen,
  tiendas,
  onSelect,
  paddingInferior = 0,
}: {
  origen: { lat: number; lon: number };
  tiendas: TiendaMapa[];
  onSelect?: (id: string) => void;
  // Alto (px) que tapa el bottom sheet, para encuadrar las tiendas por encima.
  paddingInferior?: number;
}) {
  const ahora = useAhora();
  const estados = useMemo(() => tiendas.map((t) => estadoApertura(t.horarios, ahora)), [tiendas, ahora]);
  // Los íconos dependen solo de abierta/cerrada: recrearlos en cada tick del reloj
  // re-dispararía la animación de entrada de los pines.
  const firmaCerradas = estados.map((e) => (e.estado === "cerrada" ? "1" : "0")).join("");
  const iconos = useMemo(
    () => firmaCerradas.split("").map((c, i) => iconoPin(c === "1", i)),
    [firmaCerradas],
  );
  const conEstado = tiendas.map((t, i) => ({ t, estado: estados[i], icono: iconos[i] }));

  return (
    <MapContainer
      center={[origen.lat, origen.lon]}
      zoom={14}
      scrollWheelZoom={false}
      zoomControl={false}
      style={{ width: "100%", height: "100%" }}
    >
      <EncuadreInicial origen={origen} tiendas={tiendas} paddingInferior={paddingInferior} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[origen.lat, origen.lon]}
        radius={8}
        pathOptions={{ color: "#fff", weight: 3, fillColor: "#E2723A", fillOpacity: 1 }}
      />
      {conEstado.map(({ t, estado, icono }) => (
        <Marker
          key={t.id}
          position={[t.lat, t.lon]}
          icon={icono}
          title={t.nombre}
          alt={`${t.nombre}, ${estado.estado === "abierta" ? "abierta" : estado.estado === "cerrada" ? "cerrada" : "horario no informado"}, a ${t.distanciaKm.toFixed(1)} km`}
          eventHandlers={{ click: () => onSelect?.(t.id) }}
        >
          <Popup className="popup-tienda" closeButton={false} minWidth={260} maxWidth={300}>
            <Link
              href={`/tiendas/${t.id}`}
              className="popup-tienda__card press-soft flex items-center gap-3 rounded-card border border-border bg-surface p-3 text-text no-underline"
              aria-label={`Entrar a ${t.nombre}`}
            >
              <div
                className={`flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-control bg-primary-soft text-primary-dark ${estado.estado === "cerrada" ? "grayscale-[.6]" : ""}`}
              >
                {t.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.imagenUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconoTienda className="h-7 w-7" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="truncate font-display text-[17px] font-bold leading-tight text-text">{t.nombre}</span>
                  {t.verificada && (
                    <svg viewBox="0 0 20 20" className="h-4 w-4 flex-shrink-0 text-primary" aria-label="Verificada" role="img">
                      <path fill="currentColor" d="M10 1.5 12.2 3l2.6-.2.9 2.5 2.3 1.3-.6 2.6.6 2.6-2.3 1.3-.9 2.5-2.6-.2L10 18.5 7.8 17l-2.6.2-.9-2.5L2 13.4l.6-2.6L2 8.2l2.3-1.3.9-2.5 2.6.2z" />
                      <path fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m6.8 10.2 2.2 2.1 4.2-4.4" />
                    </svg>
                  )}
                </div>
                <span className="truncate text-[12px] text-text-2 tabular-nums">
                  {t.direccion} · {t.distanciaKm.toFixed(1)} km
                </span>
                <EstadoAperturaPill estado={estado} className="self-start" />
              </div>
              <svg viewBox="0 0 20 20" className="h-5 w-5 flex-shrink-0 text-text-2" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m8 5 5 5-5 5" />
              </svg>
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
