"use client";

import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Tienda = {
  id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
  distanciaKm: number;
};

export function TiendaMap({
  origen,
  tiendas,
  onSelect,
}: {
  origen: { lat: number; lon: number };
  tiendas: Tienda[];
  onSelect: (id: string) => void;
}) {
  return (
    <MapContainer
      center={[origen.lat, origen.lon]}
      zoom={14}
      scrollWheelZoom={false}
      style={{ width: "100%", height: "100%", borderRadius: "20px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[origen.lat, origen.lon]}
        radius={8}
        pathOptions={{ color: "#B85423", fillColor: "#E2723A", fillOpacity: 1 }}
      />
      {tiendas.map((t) => (
        <Marker
          key={t.id}
          position={[t.lat, t.lon]}
          eventHandlers={{ click: () => onSelect(t.id) }}
        >
          <Popup>
            <strong>{t.nombre}</strong>
            <br />
            {t.direccion} · {t.distanciaKm.toFixed(1)} km
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
