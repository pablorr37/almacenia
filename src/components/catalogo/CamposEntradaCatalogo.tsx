"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { componerNombreCatalogo, UNIDADES_CONTENIDO, type UnidadContenido } from "@/lib/catalogo/nombre";
import type { UnidadMedida } from "@/lib/productos/unidades";

// Campos de una entrada nueva del catálogo (06-catalogo.md): categoría de la lista
// del admin (17-rubros-categorias.md) + marca + variante + contenido + unidad de
// venta, con vista previa del nombre compuesto. Lo usan el alta de productos del
// vendedor y el "Agregar al catálogo" de las listas del comprador.

// `nueva`: la escribió un usuario premium o mayor y se crea al guardar
// (17-rubros-categorias.md); todavía no tiene id.
export type Categoria = { id: string; nombre: string; nueva?: boolean };

export interface EntradaCatalogoForm {
  categoria: Categoria | null;
  marca: string;
  variante: string;
  contenido: string;
  unidadContenido: UnidadContenido;
  unidad: UnidadMedida;
}

export const ENTRADA_VACIA: EntradaCatalogoForm = {
  categoria: null,
  marca: "",
  variante: "",
  contenido: "",
  unidadContenido: "g",
  unidad: "unidad",
};

function numeroContenido(texto: string): number | undefined {
  const n = Number(texto.replace(",", "."));
  return texto.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
}

// Cuerpo de la API (`nuevo` en POST /api/tiendas/:id/productos, o POST /api/catalogo).
export function aNuevaEntrada(e: EntradaCatalogoForm) {
  const contenido = e.unidad === "unidad" ? numeroContenido(e.contenido) : undefined;
  return {
    ...(e.categoria?.nueva ? { categoriaNueva: e.categoria.nombre } : { categoriaId: e.categoria?.id ?? "" }),
    marca: e.marca.trim() || undefined,
    variante: e.variante.trim() || undefined,
    contenido,
    unidadContenido: contenido ? e.unidadContenido : undefined,
    unidad: e.unidad,
  };
}

export function nombrePrevisto(e: EntradaCatalogoForm): string {
  if (!e.categoria) return "";
  const nueva = aNuevaEntrada(e);
  return componerNombreCatalogo({ categoria: e.categoria.nombre, ...nueva });
}

const ETIQUETA_UNIDAD_CONTENIDO: Record<UnidadContenido, string> = { g: "g", kg: "kg", ml: "ml", l: "l", u: "unidades" };

const claseInput =
  "h-11 min-w-0 rounded-control border border-border bg-surface px-3 text-[14px] focus:border-primary focus:outline-none";

export function CamposEntradaCatalogo({
  valor,
  onChange,
  sugerencia = "",
  puedeCrearCategoria = false,
}: {
  valor: EntradaCatalogoForm;
  onChange: (valor: EntradaCatalogoForm) => void;
  sugerencia?: string; // texto ya tipeado (ej. la búsqueda) para precargar el filtro de categorías
  // Premium o mayor: si la categoría no está, se crea al guardar (17-rubros-categorias.md).
  puedeCrearCategoria?: boolean;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [filtro, setFiltro] = useState(sugerencia);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    apiGet<Categoria[]>("/api/categorias").then(setCategorias).catch(() => setCategorias([]));
  }, []);

  const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const textoFiltro = normalizar(filtro);
  const coincidentes = categorias
    .filter((c) => !textoFiltro || normalizar(c.nombre).includes(textoFiltro) || textoFiltro.includes(normalizar(c.nombre)))
    .slice(0, 8);

  const cambiar = (parcial: Partial<EntradaCatalogoForm>) => onChange({ ...valor, ...parcial });
  const nombreNuevo = filtro.replace(/\s+/g, " ").trim();
  const existeExacta = categorias.some((c) => normalizar(c.nombre) === normalizar(nombreNuevo));
  const ofrecerCrear = puedeCrearCategoria && nombreNuevo.length >= 2 && nombreNuevo.length <= 40 && !existeExacta;
  const previsto = nombrePrevisto(valor);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-text">Categoría</span>
        {valor.categoria ? (
          <div className="flex items-center justify-between rounded-control border border-primary bg-surface px-3 py-2 text-[14px]">
            <span className="font-semibold" data-testid="categoria-elegida">
              {valor.categoria.nombre}
              {valor.categoria.nueva && (
                <span
                  className="ml-2 whitespace-nowrap rounded-pill bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-dark"
                  title="Se crea al guardar el producto"
                >
                  nueva
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                cambiar({ categoria: null });
                setAbierto(true);
              }}
              className="text-[12px] font-semibold text-accent-text"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              value={filtro}
              onChange={(e) => {
                setFiltro(e.target.value);
                setAbierto(true);
              }}
              onFocus={() => setAbierto(true)}
              placeholder="Buscar categoría (ej. Arroz, Gaseosa, Queso)"
              aria-label="Buscar categoría"
              className={claseInput}
            />
            {abierto && (
              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-bg p-1" role="listbox">
                {coincidentes.length === 0 && !ofrecerCrear ? (
                  <p className="px-2 py-1.5 text-[12px] text-text-2">
                    {puedeCrearCategoria
                      ? "Escribí el nombre de la categoría para crearla."
                      : categorias.length === 0
                        ? "Todavía no hay categorías. Las carga el administrador; con Premium podés crearlas vos."
                        : "No hay una categoría así. Con Premium podés crearla al guardar el producto; si no, pedísela al administrador."}
                  </p>
                ) : (
                  coincidentes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        cambiar({ categoria: c });
                        setAbierto(false);
                      }}
                      className="rounded-control px-2 py-1.5 text-left text-[13px] hover:bg-surface"
                    >
                      {c.nombre}
                    </button>
                  ))
                )}
                {ofrecerCrear && (
                  <button
                    type="button"
                    onClick={() => {
                      cambiar({ categoria: { id: "", nombre: nombreNuevo, nueva: true } });
                      setAbierto(false);
                    }}
                    className="rounded-control px-2 py-1.5 text-left text-[13px] font-semibold text-accent-text hover:bg-surface"
                  >
                    + Crear categoría «{nombreNuevo}»
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={valor.marca}
          onChange={(e) => cambiar({ marca: e.target.value })}
          maxLength={40}
          placeholder="Marca (opcional)"
          aria-label="Marca"
          className={`${claseInput} flex-1`}
        />
        <input
          value={valor.variante}
          onChange={(e) => cambiar({ variante: e.target.value })}
          maxLength={40}
          placeholder="Variante (ej. largo fino)"
          aria-label="Variante"
          className={`${claseInput} flex-1`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold text-text">Se vende por</span>
        {(["unidad", "kg"] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={valor.unidad === u}
            onClick={() => cambiar({ unidad: u })}
            className={`press rounded-pill px-3 py-1.5 font-semibold ${
              valor.unidad === u ? "bg-primary text-white" : "border border-border bg-surface text-text"
            }`}
          >
            {u === "kg" ? "kg (suelto, por peso)" : "unidad"}
          </button>
        ))}
      </div>

      {valor.unidad === "unidad" && (
        <div className="flex gap-2">
          <input
            value={valor.contenido}
            onChange={(e) => cambiar({ contenido: e.target.value })}
            inputMode="decimal"
            placeholder="Contenido / peso (ej. 500)"
            aria-label="Contenido"
            className={`${claseInput} flex-1`}
          />
          <select
            value={valor.unidadContenido}
            onChange={(e) => cambiar({ unidadContenido: e.target.value as UnidadContenido })}
            aria-label="Unidad del contenido"
            className={`${claseInput} w-28`}
          >
            {UNIDADES_CONTENIDO.map((u) => (
              <option key={u} value={u}>
                {ETIQUETA_UNIDAD_CONTENIDO[u]}
              </option>
            ))}
          </select>
        </div>
      )}

      {previsto && (
        <p className="text-[12px] text-text-2">
          Se va a llamar: <span className="font-semibold text-text" data-testid="nombre-previsto">{previsto}</span>
        </p>
      )}
    </div>
  );
}
