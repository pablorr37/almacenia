"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { BotonVolver } from "@/components/ui/BotonVolver";
import { Toast } from "@/components/ui/Toast";

type ProductoCatalogo = { id: string; nombre: string; marca: string | null; imagenUrl: string | null };
type Item = { catalogoId: string; cantidad: number; producto: { nombre: string; marca: string | null; imagenUrl: string | null } };
type Lista = { id: string; nombre: string; items: Item[] };

function nombrePorDefecto(): string {
  return `Mi lista ${new Date().toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;
}

// Arma una lista de compras desde el catálogo compartido, sin entrar a una tienda
// (14-listas-compras.md). "Guardar" guarda; "Buscar y comparar" guarda y compara
// precios entre tiendas cercanas (15-itinerario.md).
export function EditorLista({ listaId }: { listaId?: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombrePorDefecto);
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoCatalogo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState<"guardar" | "comparar" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listaId) return;
    apiGet<Lista>(`/api/listas/${listaId}`)
      .then((l) => {
        setNombre(l.nombre);
        setItems(l.items);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar la lista."));
  }, [listaId]);

  // Autocompletar del catálogo con debounce (auditoría UI/UX, T6).
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) return;
    const id = setTimeout(() => {
      setBuscando(true);
      apiGet<ProductoCatalogo[]>(`/api/catalogo/buscar?q=${encodeURIComponent(texto)}`)
        .then(setResultados)
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function agregar(p: ProductoCatalogo) {
    setItems((prev) =>
      prev.some((i) => i.catalogoId === p.id)
        ? prev.map((i) => (i.catalogoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i))
        : [...prev, { catalogoId: p.id, cantidad: 1, producto: { nombre: p.nombre, marca: p.marca, imagenUrl: p.imagenUrl } }]
    );
    setQ("");
    setResultados([]);
  }

  function cambiarCantidad(catalogoId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.catalogoId === catalogoId ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  }

  async function guardar(accion: "guardar" | "comparar") {
    setError(null);
    setGuardando(accion);
    try {
      const body = { nombre, items: items.map((i) => ({ catalogoId: i.catalogoId, cantidad: i.cantidad })) };
      const lista = listaId ? await apiPatch<Lista>(`/api/listas/${listaId}`, body) : await apiPost<Lista>("/api/listas", body);
      if (accion === "comparar") {
        router.push(`/listas/${lista.id}/comparar`);
        return;
      }
      setAviso("Lista guardada");
      if (!listaId) router.replace(`/listas/${lista.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la lista.");
    } finally {
      setGuardando(null);
    }
  }

  const unidades = items.reduce((s, i) => s + i.cantidad, 0);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
      <div className="flex items-center gap-2 px-4 pt-5">
        <BotonVolver href="/listas" etiqueta="Volver a mis listas" />
        <label htmlFor="lista-nombre" className="sr-only">
          Nombre de la lista
        </label>
        <input
          id="lista-nombre"
          value={nombre}
          maxLength={80}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-0 flex-1 rounded-control bg-transparent px-2 py-2 font-display text-[22px] font-bold text-primary-dark focus:bg-surface focus:outline-none"
        />
      </div>

      <div className="relative px-5 pt-3">
        <label htmlFor="lista-buscar" className="sr-only">
          Buscar productos
        </label>
        <input
          id="lista-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Agregá productos: yerba, leche, pan..."
          autoComplete="off"
          className="h-12 w-full rounded-control border border-border bg-surface px-4 text-[15px] shadow-card placeholder:text-text-2 focus:border-primary focus:outline-none"
        />
        {q.trim().length >= 2 && (
          <ul className="absolute inset-x-5 top-full z-20 mt-1 max-h-72 animate-fade-in overflow-y-auto rounded-card border border-border bg-surface shadow-float">
            {buscando && resultados.length === 0 && <li className="px-4 py-3 text-[13px] text-text-2">Buscando...</li>}
            {!buscando && resultados.length === 0 && (
              <li className="px-4 py-3 text-[13px] text-text-2">No encontramos &quot;{q.trim()}&quot; en el catálogo.</li>
            )}
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-semibold text-text">{p.nombre}</span>
                    {p.marca && <span className="text-[12px] text-text-2">{p.marca}</span>}
                  </span>
                  <span className="flex-shrink-0 text-[13px] font-semibold text-primary">+ Agregar</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-5 py-4">
        {items.length === 0 && (
          <div className="flex animate-fade-up flex-col items-center gap-2 rounded-card border border-dashed border-border px-6 py-10 text-center">
            <span className="text-[15px] font-semibold text-text">Tu lista está vacía</span>
            <span className="text-[13px] text-text-2">
              Buscá productos arriba. Después compará en qué tiendas cercanas te conviene comprarlos.
            </span>
          </div>
        )}
        {items.map((i, idx) => (
          <div
            key={i.catalogoId}
            style={{ "--i": idx } as React.CSSProperties}
            className="stagger flex animate-fade-up items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card"
          >
            {i.producto.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.producto.imagenUrl} alt="" className="h-11 w-11 flex-shrink-0 rounded-control object-cover" />
            ) : (
              <div className="h-11 w-11 flex-shrink-0 rounded-control bg-placeholder" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-semibold text-text">{i.producto.nombre}</span>
              {i.producto.marca && <span className="text-[12px] text-text-2">{i.producto.marca}</span>}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => cambiarCantidad(i.catalogoId, -1)}
                aria-label={i.cantidad === 1 ? `Quitar ${i.producto.nombre}` : `Uno menos de ${i.producto.nombre}`}
                className="press flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface text-lg leading-none"
              >
                {i.cantidad === 1 ? "×" : "–"}
              </button>
              <span className="min-w-6 text-center text-[15px] font-semibold tabular-nums">{i.cantidad}</span>
              <button
                type="button"
                onClick={() => cambiarCantidad(i.catalogoId, 1)}
                aria-label={`Uno más de ${i.producto.nombre}`}
                className="press flex h-10 w-10 items-center justify-center rounded-control bg-primary text-lg leading-none text-white"
              >
                +
              </button>
            </div>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-[13px] text-estado-rechazado-text">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-surface px-5 pb-6 pt-3">
        <span className="text-center text-[12px] text-text-2 tabular-nums">
          {items.length} {items.length === 1 ? "producto" : "productos"} · {unidades} {unidades === 1 ? "unidad" : "unidades"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={guardando !== null}
            onClick={() => guardar("guardar")}
            className="press h-12 flex-1 rounded-control border border-border bg-surface text-[15px] font-semibold text-text disabled:opacity-50"
          >
            {guardando === "guardar" ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            disabled={guardando !== null || items.length === 0}
            onClick={() => guardar("comparar")}
            className="press h-12 flex-[1.4] rounded-control bg-primary text-[15px] font-semibold text-white shadow-cta disabled:opacity-50"
          >
            {guardando === "comparar" ? "Buscando..." : "Buscar y comparar"}
          </button>
        </div>
      </div>
      <Toast mensaje={aviso} onCerrar={() => setAviso(null)} />
    </div>
  );
}
