"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";
import { EscanerCodigo } from "@/components/scanner/EscanerCodigo";
import {
  ETIQUETA_PERMISO,
  ETIQUETA_ROL,
  PERMISOS,
  permisosPorDefecto,
  puede,
  type Permiso,
  type RolMiembro,
} from "@/lib/equipo/permisos";

// Usuarios de la tienda (19-equipo-tienda.md): sumar a alguien de la app por email o
// con el QR de "Compartir mis datos", elegir rol y permisos, cambiarlos o quitarlo.

type Miembro = {
  usuario: { id: string; nombre: string; email: string; avatarUrl: string | null };
  rol: RolMiembro;
  permisos: Permiso[];
  creadoEn: string;
};
type TiendaEquipo = { id: string; nombre: string };

function SelectorPermisos({
  valor,
  disponibles,
  onChange,
  prefijo,
}: {
  valor: Permiso[];
  disponibles: Permiso[];
  onChange: (p: Permiso[]) => void;
  prefijo: string;
}) {
  return (
    <fieldset className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      <legend className="mb-1 text-[12px] font-semibold text-text-2">Permisos</legend>
      {PERMISOS.map((p) => {
        const habilitado = disponibles.includes(p);
        return (
          <label
            key={p}
            className={`flex items-center gap-2 rounded-control border border-border px-2.5 py-2 text-[13px] ${habilitado ? "bg-surface" : "bg-placeholder text-text-2"}`}
          >
            <input
              type="checkbox"
              aria-label={`${prefijo}: ${ETIQUETA_PERMISO[p]}`}
              checked={valor.includes(p)}
              disabled={!habilitado}
              onChange={(e) => onChange(e.target.checked ? [...valor, p] : valor.filter((x) => x !== p))}
              className="h-4 w-4 accent-[#0e6b5c]"
            />
            {ETIQUETA_PERMISO[p]}
          </label>
        );
      })}
    </fieldset>
  );
}

function FilaMiembro({
  miembro,
  tiendaId,
  disponibles,
  esUnoMismo,
  onCambio,
  onQuitado,
}: {
  miembro: Miembro;
  tiendaId: string;
  disponibles: Permiso[];
  esUnoMismo: boolean;
  onCambio: (m: Miembro) => void;
  onQuitado: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [rol, setRol] = useState<RolMiembro>(miembro.rol);
  const [permisos, setPermisos] = useState<Permiso[]>(miembro.permisos);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nombre = miembro.usuario.nombre;

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      onCambio(await apiPatch<Miembro>(`/api/tiendas/${tiendaId}/miembros/${miembro.usuario.id}`, { rol, permisos }));
      setAbierto(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  async function quitar() {
    if (!window.confirm(`¿Quitar a ${nombre} del equipo? Deja de poder vender en esta tienda.`)) return;
    setEnviando(true);
    try {
      await apiDelete(`/api/tiendas/${tiendaId}/miembros/${miembro.usuario.id}`);
      onQuitado(miembro.usuario.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo quitar.");
      setEnviando(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5" aria-label={nombre}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold">{nombre}</span>
          <span className="truncate text-[12px] text-text-2">{miembro.usuario.email}</span>
        </div>
        <span className="flex-shrink-0 rounded-pill bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-dark">
          {ETIQUETA_ROL[miembro.rol]}
        </span>
      </div>
      <p className="text-[12px] text-text-2">
        {miembro.permisos.length > 0 ? miembro.permisos.map((p) => ETIQUETA_PERMISO[p]).join(" · ") : "Sin permisos"}
      </p>
      {!esUnoMismo &&
        (abierto ? (
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
              Rol
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as RolMiembro)}
                className="h-10 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text"
              >
                <option value="encargado">Encargado</option>
                <option value="empleado">Empleado</option>
              </select>
            </label>
            <SelectorPermisos valor={permisos} disponibles={disponibles} onChange={setPermisos} prefijo={nombre} />
            {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="press h-10 flex-1 rounded-control border border-border text-[13px] font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={enviando}
                className="press h-10 flex-1 rounded-control bg-primary text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-label={`Cambiar permisos de ${nombre}`}
              className="press h-9 flex-1 rounded-control border border-border bg-surface text-[12px] font-semibold"
            >
              Cambiar permisos
            </button>
            <button
              type="button"
              onClick={quitar}
              disabled={enviando}
              aria-label={`Quitar a ${nombre}`}
              className="press h-9 flex-1 rounded-control border border-estado-rechazado-text/40 bg-surface text-[12px] font-semibold text-estado-rechazado-text disabled:opacity-50"
            >
              Quitar
            </button>
          </div>
        ))}
      {error && !abierto && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
    </li>
  );
}

function Equipo() {
  const { status, data: session } = useSession();
  const params = useSearchParams();
  const { lista, activa } = useMisTiendas<TiendaEquipo>(status === "authenticated", params.get("tienda"));
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [rol, setRol] = useState<RolMiembro>("empleado");
  const [permisos, setPermisos] = useState<Permiso[]>(permisosPorDefecto("empleado"));
  const [escaneando, setEscaneando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const tiendaId = activa?.tienda.id;
  const disponibles = activa ? activa.permisos : [];

  const cargar = useCallback(() => {
    if (!tiendaId) return;
    apiGet<Miembro[]>(`/api/tiendas/${tiendaId}/miembros`)
      .then((m) => {
        setMiembros(m);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el equipo."));
  }, [tiendaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiarRol(nuevo: RolMiembro) {
    setRol(nuevo);
    setPermisos(permisosPorDefecto(nuevo).filter((p) => disponibles.includes(p)));
  }

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!tiendaId) return;
    setEnviando(true);
    setErrorAlta(null);
    try {
      const nuevo = await apiPost<Miembro>(`/api/tiendas/${tiendaId}/miembros`, {
        ...(codigo ? { codigo } : { email }),
        rol,
        permisos,
      });
      setMiembros((m) => [...(m ?? []), nuevo]);
      setEmail("");
      setCodigo(null);
    } catch (err) {
      setErrorAlta(err instanceof ApiError ? err.message : "No se pudo sumar a esa persona.");
    } finally {
      setEnviando(false);
    }
  }

  if (status === "unauthenticated") {
    return (
      <p className="p-6 text-center text-text-2">
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciá sesión
        </Link>{" "}
        para gestionar tu equipo.
      </p>
    );
  }
  if (!lista) return <p className="p-6 text-text-2">Cargando...</p>;
  if (!activa) return <p className="p-6 text-text-2">Todavía no tenés una tienda.</p>;
  if (!puede(activa, "usuarios")) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          ← Inicio
        </Link>
        <p className="text-text-2">No tenés permiso para gestionar el equipo de {activa.tienda.nombre}.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-bg px-5 py-5">
      <Link href="/" className="text-[13px] font-semibold text-accent-text">
        ← Inicio
      </Link>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[22px] font-bold text-primary-dark">Usuarios</h1>
        <p className="text-[13px] text-text-2">
          Equipo de <strong>{activa.tienda.nombre}</strong>. Quien sumes tiene que tener cuenta en Almacenia.
        </p>
      </div>

      <form onSubmit={agregar} className="flex flex-col gap-3 rounded-card border border-dashed border-accent bg-surface p-3.5">
        <h2 className="text-[15px] font-bold">Sumar a alguien</h2>
        {codigo ? (
          <div className="flex items-center justify-between gap-2 rounded-control bg-primary-soft px-3 py-2 text-[13px] text-primary-dark">
            <span>Código leído: {codigo.slice(-6)}</span>
            <button type="button" onClick={() => setCodigo(null)} className="font-semibold underline">
              Usar email
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email de la persona"
              aria-label="Email de la persona"
              required
              className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 text-[14px]"
            />
            <button
              type="button"
              onClick={() => setEscaneando(true)}
              className="press h-11 flex-shrink-0 rounded-control border border-border bg-surface px-3 text-[13px] font-semibold"
            >
              Escanear QR
            </button>
          </div>
        )}
        <EscanerCodigo
          abierto={escaneando}
          titulo="Escaneá el QR de “Compartir mis datos”"
          onDetectado={(texto) => {
            setCodigo(texto);
            setEscaneando(false);
          }}
          onCerrar={() => setEscaneando(false)}
        />
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Rol
          <select
            value={rol}
            onChange={(e) => cambiarRol(e.target.value as RolMiembro)}
            aria-label="Rol"
            className="h-11 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text"
          >
            <option value="empleado">Empleado</option>
            <option value="encargado">Encargado</option>
          </select>
        </label>
        <SelectorPermisos valor={permisos} disponibles={disponibles} onChange={setPermisos} prefijo="Nuevo" />
        {errorAlta && (
          <p role="alert" className="text-[13px] text-estado-rechazado-text">
            {errorAlta}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="press h-12 rounded-control bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {enviando ? "Sumando..." : "Sumar al equipo"}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">Equipo ({miembros?.length ?? 0})</h2>
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {miembros && miembros.length === 0 && <p className="text-[13px] text-text-2">Todavía no sumaste a nadie.</p>}
        <ul className="flex flex-col gap-2">
          {miembros?.map((m) => (
            <FilaMiembro
              key={m.usuario.id}
              miembro={m}
              tiendaId={activa.tienda.id}
              disponibles={disponibles}
              esUnoMismo={m.usuario.email === session?.user?.email}
              onCambio={(nuevo) => setMiembros((lista) => lista?.map((x) => (x.usuario.id === nuevo.usuario.id ? nuevo : x)) ?? null)}
              onQuitado={(id) => setMiembros((lista) => lista?.filter((x) => x.usuario.id !== id) ?? null)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function EquipoPage() {
  return (
    <Suspense fallback={<p className="p-6 text-text-2">Cargando...</p>}>
      <Equipo />
    </Suspense>
  );
}
