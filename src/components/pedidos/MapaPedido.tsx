"use client";

import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

type Punto = { lat: number; lon: number };

function Encuadre({ a, b }: { a: Punto; b: Punto }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [a.lat, a.lon],
        [b.lat, b.lon],
      ],
      { padding: [40, 40], maxZoom: 16 }
    );
  }, [map, a, b]);
  return null;
}

// Dónde estaba el comprador al pedir y la tienda (04-pedidos.md, ronda 6).
export function MapaPedido({ tienda, comprador, nombreComprador }: { tienda: Punto; comprador: Punto; nombreComprador: string }) {
  return (
    <MapContainer center={[comprador.lat, comprador.lon]} zoom={14} scrollWheelZoom={false} style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Encuadre a={tienda} b={comprador} />
      <Polyline
        positions={[
          [tienda.lat, tienda.lon],
          [comprador.lat, comprador.lon],
        ]}
        pathOptions={{ color: "#0E6B5C", weight: 3, dashArray: "6 6", opacity: 0.7 }}
      />
      <CircleMarker center={[tienda.lat, tienda.lon]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#0E6B5C", fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          Tu tienda
        </Tooltip>
      </CircleMarker>
      <CircleMarker center={[comprador.lat, comprador.lon]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#E2723A", fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -8]}>
          {nombreComprador}
        </Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
