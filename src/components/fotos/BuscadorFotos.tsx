"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiGet, apiGetPaginado, apiPost, apiPostForm, ApiError } from "@/lib/api-client";
import { palabrasClave, type ResultadoWeb } from "@/lib/fotos/buscador-web";
import type { FotoBanco, Fuente } from "@/lib/fotos/banco";

// Buscador de fotos (16-banco-fotos.md): la misma UI para todos. El banco lo ve
// cualquiera; la pestaña "Web libre" (Openverse, CC0/dominio público) solo los
// curadores (admin/tester); "Subir foto" los premium y curadores.
export type DestinoFoto = { catalogoId: string } | { productoId: string };

interface Permisos {
  fuentes: Fuente[];
  curador: boolean;
  puedeSubir: boolean;
}

type Pestania = "banco" | "web";

const ETIQUETA_ESTADO: Record<FotoBanco["estado"], string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

export function BuscadorFotos({
  abierto,
  textoInicial,
  destino,
  titulo = "Buscar foto",
  onUsada,
  onCerrar,
}: {
  abierto: boolean;
  textoInicial: string;
  // null: solo curar (aprobar fotos al banco sin asignarlas a nada).
  destino: DestinoFoto | null;
  titulo?: string;
  onUsada?: (imagenUrl: string) => void;
  onCerrar: () => void;
}) {
  const [permisos, setPermisos] = useState<Permisos | null>(null);
  const [pestania, setPestania] = useState<Pestania>("banco");
  const [texto, setTexto] = useState(textoInicial);
  const [etiquetas, setEtiquetas] = useState("");
  const [banco, setBanco] = useState<FotoBanco[] | null>(null);
  const [web, setWeb] = useState<ResultadoWeb[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null); // id/origenUrl en proceso
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const buscarBanco = useCallback(async (q: string) => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiGetPaginado<FotoBanco>(`/api/fotos/banco?q=${encodeURIComponent(q)}&pageSize=30`);
      setBanco(r.data);
    } catch (err) {
      setError(mensajeDe(err, "No se pudo buscar en el banco."));
    } finally {
      setCargando(false);
    }
  }, []);

  const buscarWeb = useCallback(async (q: string) => {
    setCargando(true);
    setError(null);
    try {
      setWeb(await apiGet<ResultadoWeb[]>(`/api/fotos/web?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setWeb([]);
      setError(mensajeDe(err, "No se pudo buscar en la web."));
    } finally {
      setCargando(false);
    }
  }, []);

  // Al abrir: reinicia con el texto del producto y busca en el banco.
  useEffect(() => {
    if (!abierto) return;
    /* eslint-disable react-hooks/set-state-in-effect -- se re-inicializa al abrir */
    setTexto(textoInicial);
    setEtiquetas(palabrasClave(textoInicial).join(", "));
    setPestania("banco");
    setWeb(null);
    setAviso(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    apiGet<Permisos>("/api/fotos/permisos").then(setPermisos).catch(() => setPermisos(null));
    buscarBanco(textoInicial);
  }, [abierto, textoInicial, buscarBanco]);

  if (!abierto) return null;

  // Sin etiquetas escritas, se usan las palabras de la búsqueda actual.
  function listaEtiquetas(): string[] {
    const escritas = etiquetas
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    return escritas.length > 0 ? escritas : palabrasClave(texto);
  }

  function enviarBusqueda(e: FormEvent) {
    e.preventDefault();
    setEtiquetas(palabrasClave(texto).join(", "));
    if (pestania === "banco") buscarBanco(texto);
    else buscarWeb(texto);
  }

  function cambiarPestania(p: Pestania) {
    setPestania(p);
    if (!etiquetas.trim()) setEtiquetas(palabrasClave(texto).join(", "));
    setError(null);
    if (p === "web" && web === null) buscarWeb(texto);
    if (p === "banco") buscarBanco(texto);
  }

  async function usar(foto: FotoBanco) {
    if (!destino) return;
    setOcupado(foto.id);
    setError(null);
    try {
      const { imagenUrl } = await apiPost<{ imagenUrl: string }>(`/api/fotos/banco/${foto.id}/usar`, destino);
      onUsada?.(imagenUrl);
      onCerrar();
    } catch (err) {
      setError(mensajeDe(err, "No se pudo usar la foto."));
    } finally {
      setOcupado(null);
    }
  }

  async function aprobar(resultado: ResultadoWeb) {
    setOcupado(resultado.origenUrl);
    setError(null);
    try {
      const foto = await apiPost<FotoBanco>("/api/fotos/banco", { resultado, etiquetas: listaEtiquetas() });
      if (destino) {
        await usar(foto);
      } else {
        setAviso("Foto aprobada: ya está en el banco.");
        setWeb((prev) => prev?.filter((r) => r.origenUrl !== resultado.origenUrl) ?? null);
      }
    } catch (err) {
      setError(mensajeDe(err, "No se pudo aprobar la foto."));
    } finally {
      setOcupado(null);
    }
  }

  async function subir(file: File) {
    setOcupado("subida");
    setError(null);
    try {
      const form = new FormData();
      form.set("archivo", file);
      form.set("etiquetas", listaEtiquetas().join(","));
      const foto = await apiPostForm<FotoBanco>("/api/fotos/banco", form);
      if (destino) {
        await usar(foto);
      } else {
        setAviso(foto.estado === "aprobada" ? "Foto subida al banco." : "Foto subida: la ves vos hasta que la aprueben.");
        setPestania("banco");
        buscarBanco(texto);
      }
    } catch (err) {
      setError(mensajeDe(err, "No se pudo subir la foto."));
    } finally {
      setOcupado(null);
      if (archivo.current) archivo.current.value = "";
    }
  }

  const puedeWeb = permisos?.fuentes.includes("web") ?? false;
  const mostrarEtiquetas = puedeWeb || permisos?.puedeSubir;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 sm:items-center sm:p-4"
      role="presentation"
      onClick={onCerrar}
      onKeyDown={(e) => e.key === "Escape" && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="buscador-fotos-titulo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-lg animate-slide-up flex-col gap-3 rounded-t-card bg-surface p-4 shadow-float sm:rounded-card sm:p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="buscador-fotos-titulo" className="font-display text-[20px] font-bold text-primary-dark">
            {titulo}
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="press h-9 w-9 rounded-pill text-[20px] text-text-2">
            ×
          </button>
        </div>

        {puedeWeb && (
          <div role="tablist" className="flex gap-1 rounded-pill bg-placeholder p-1">
            {(["banco", "web"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={pestania === p}
                onClick={() => cambiarPestania(p)}
                className={`press h-9 flex-1 rounded-pill text-[13px] font-semibold ${
                  pestania === p ? "bg-surface text-primary-dark shadow-sm" : "text-text-2"
                }`}
              >
                {p === "banco" ? "Banco" : "Web libre"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={enviarBusqueda} className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Buscar fotos"
            placeholder="Ej. tomate"
            className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3.5 text-[15px] focus:border-primary focus:outline-none"
          />
          <button type="submit" className="press h-11 rounded-control bg-primary px-4 text-[14px] font-semibold text-white">
            Buscar
          </button>
        </form>

        {mostrarEtiquetas && (
          <label className="flex flex-col gap-1 text-[12px] text-text-2">
            Etiquetas al aprobar o subir (separadas por coma)
            <input
              value={etiquetas}
              onChange={(e) => setEtiquetas(e.target.value)}
              className="h-10 rounded-control border border-border bg-surface px-3 text-[14px] text-text focus:border-primary focus:outline-none"
            />
          </label>
        )}

        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {aviso && <p className="text-[13px] text-estado-entregado-text">{aviso}</p>}

        <div className="min-h-[160px] flex-1 overflow-y-auto">
          {cargando ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-control bg-placeholder" />
              ))}
            </div>
          ) : pestania === "banco" ? (
            banco && banco.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2">
                {banco.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.etiquetas.join(", ")}
                        title={[f.titulo, f.autor && `por ${f.autor}`, f.licencia?.toUpperCase()].filter(Boolean).join(" · ")}
                        className="aspect-square w-full rounded-control object-cover"
                      />
                      {f.estado !== "aprobada" && (
                        <span className="absolute left-1 top-1 rounded-pill bg-estado-pendiente-bg px-1.5 py-0.5 text-[10px] font-bold text-estado-pendiente-text">
                          {ETIQUETA_ESTADO[f.estado]}
                        </span>
                      )}
                    </div>
                    {destino && (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => usar(f)}
                        className="press h-8 rounded-control bg-primary text-[12px] font-semibold text-white disabled:opacity-50"
                      >
                        {ocupado === f.id ? "Usando..." : "Usar"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              banco && (
                <p className="py-6 text-center text-[13px] text-text-2">
                  No hay fotos para “{texto}” en el banco.
                  {puedeWeb ? " Probá en “Web libre”." : ""}
                </p>
              )
            )
          ) : web && web.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {web.map((r) => (
                <li key={r.origenUrl} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.miniaturaUrl}
                    alt={r.titulo ?? ""}
                    title={[r.titulo, r.autor && `por ${r.autor}`, r.licencia.toUpperCase()].filter(Boolean).join(" · ")}
                    className="aspect-square w-full rounded-control object-cover"
                    loading="lazy"
                  />
                  <span className="truncate text-[10px] text-text-2">
                    {r.licencia === "cc0" ? "CC0" : "Dominio público"}
                    {r.autor ? ` · ${r.autor}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={ocupado !== null}
                    onClick={() => aprobar(r)}
                    className="press h-8 rounded-control bg-primary text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {ocupado === r.origenUrl ? "Guardando..." : destino ? "Aprobar y usar" : "Aprobar"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            web && <p className="py-6 text-center text-[13px] text-text-2">Sin resultados libres de derechos.</p>
          )}
        </div>

        {permisos?.puedeSubir && (
          <label className="press flex h-11 cursor-pointer items-center justify-center rounded-control border border-border bg-surface text-[14px] font-semibold text-text">
            {ocupado === "subida" ? "Subiendo..." : "Subir foto propia"}
            <input
              ref={archivo}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={ocupado !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) subir(f);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
