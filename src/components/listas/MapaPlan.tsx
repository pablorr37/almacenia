"use client";

import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Parada = { orden: number; tienda: { id: string; nombre: string; lat: number; lon: number } };

function numero(orden: number): L.DivIcon {
  return L.divIcon({
    className: "pin-parada",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<span class="pin-parada__num">${orden}</span>`,
  });
}

function Encuadre({ puntos }: { puntos: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length > 1) map.fitBounds(puntos, { padding: [36, 36] });
  }, [map, puntos]);
  return null;
}

// Recorrido del plan: origen → paradas numeradas en orden (15-itinerario.md).
export function MapaPlan({ origen, paradas }: { origen: { lat: number; lon: number }; paradas: Parada[] }) {
  const puntos: Array<[number, number]> = [[origen.lat, origen.lon], ...paradas.map((p) => [p.tienda.lat, p.tienda.lon] as [number, number])];
  return (
    <MapContainer center={[origen.lat, origen.lon]} zoom={14} scrollWheelZoom={false} style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Encuadre puntos={puntos} />
      <Polyline positions={puntos} pathOptions={{ color: "#0E6B5C", weight: 4, dashArray: "8 8", opacity: 0.8 }} />
      <CircleMarker center={[origen.lat, origen.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#E2723A", fillOpacity: 1 }} />
      {paradas.map((p) => (
        <Marker key={p.tienda.id} position={[p.tienda.lat, p.tienda.lon]} icon={numero(p.orden)} title={`${p.orden}. ${p.tienda.nombre}`} />
      ))}
    </MapContainer>
  );
}
