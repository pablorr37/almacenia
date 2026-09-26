"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EstadoPedidoBadge } from "@/components/ui/EstadoPedidoBadge";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { ValoracionCliente } from "@/components/ui/ValoracionCliente";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api-client";
import { useCodigoBarras } from "@/lib/scanner/useCodigoBarras";

type ProductoCatalogo = {
  id: string;
  nombre: string;
  marca: string | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
};

type MedioPago = "efectivo" | "transferencia" | "mercado_pago" | "debito" | "qr";

type HorarioTienda = {
  diaSemana: number;
  abre: string | null;
  cierra: string | null;
};

type Tienda = {
  id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
  imagenUrl: string | null;
  verificada: boolean;
  plan: "free" | "premium";
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[];
};

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const MEDIOS_DE_PAGO: Array<{ valor: MedioPago; etiqueta: string }> = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "mercado_pago", etiqueta: "Mercado Pago" },
  { valor: "debito", etiqueta: "Débito" },
  { valor: "qr", etiqueta: "QR" },
];

function horarioPorDefecto(): HorarioTienda[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    abre: diaSemana === 0 ? null : "09:00",
    cierra: diaSemana === 0 ? null : "21:00",
  }));
}

type Producto = {
  id: string;
  catalogoId: string;
  nombre: string;
  imagenUrl: string | null;
  imagenCatalogoUrl: string | null;
  imagenEfectiva: string | null;
  precio: number;
  stock: number;
  disponible: boolean;
};

type EstadoPedido =
  | "pendiente"
  | "confirmado"
  | "listo_para_retirar"
  | "entregado"
  | "rechazado"
  | "cancelado";

type Pedido = {
  id: string;
  compradorId: string;
  estado: EstadoPedido;
  items: Array<{ productoId: string; cantidad: number; precioUnitario: number }>;
};

type AccionPedido = "confirmar" | "rechazar" | "marcarListo" | "entregar";

const ACCION_POR_ESTADO: Record<string, AccionPedido[]> = {
  pendiente: ["confirmar", "rechazar"],
  confirmado: ["marcarListo"],
  listo_para_retirar: ["entregar"],
};

const ETIQUETA_ACCION: Record<AccionPedido, string> = {
  confirmar: "Confirmar",
  rechazar: "Rechazar",
  marcarListo: "Marcar listo para retirar",
  entregar: "Entregar",
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MiTiendaPage() {
  const { status } = useSession();
  const [tab, setTab] = useState<"tienda" | "productos" | "pedidos">("pedidos");
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [cargandoTienda, setCargandoTienda] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [nombreForm, setNombreForm] = useState("");
  const [descripcionForm, setDescripcionForm] = useState("");
  const [mediosForm, setMediosForm] = useState<MedioPago[]>([]);
  const [horariosForm, setHorariosForm] = useState<HorarioTienda[]>(horarioPorDefecto());
  const [guardandoTienda, setGuardandoTienda] = useState(false);
  const [tiendaGuardada, setTiendaGuardada] = useState(false);
  const [solicitandoVerificacion, setSolicitandoVerificacion] = useState(false);
  const [verificacionSolicitada, setVerificacionSolicitada] = useState(false);

  // Alta de producto vía catálogo compartido (06-catalogo.md): se busca primero
  // por nombre/código de barras; si hay coincidencia se "adopta" (catalogoId), si
  // no se da de alta un producto nuevo en el catálogo (nuevo.nombre).
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("");
  const [resultadosCatalogo, setResultadosCatalogo] = useState<ProductoCatalogo[]>([]);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState<ProductoCatalogo | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const { videoRef, activo: scannerActivo, error: scannerError, iniciar: iniciarScanner, detener: detenerScanner } =
    useCodigoBarras(async (texto) => {
      setEscaneando(false);
      detenerScanner();
      try {
        const resultados = await apiGet<ProductoCatalogo[]>(
          `/api/catalogo/buscar?codigoBarras=${encodeURIComponent(texto)}`,
        );
        if (resultados[0]) {
          setCatalogoSeleccionado(resultados[0]);
          setBusquedaCatalogo(resultados[0].nombre);
        } else {
          setBusquedaCatalogo(texto);
        }
      } catch {
        setBusquedaCatalogo(texto);
      }
    });

  useEffect(() => {
    if (escaneando) iniciarScanner();
    // Solo se dispara al abrir/cerrar el scanner, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escaneando]);

  useEffect(() => {
    if (catalogoSeleccionado || busquedaCatalogo.trim().length < 2) {
      setResultadosCatalogo([]);
      return;
    }
    const timeout = setTimeout(() => {
      apiGet<ProductoCatalogo[]>(`/api/catalogo/buscar?q=${encodeURIComponent(busquedaCatalogo)}`)
        .then(setResultadosCatalogo)
        .catch(() => setResultadosCatalogo([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [busquedaCatalogo, catalogoSeleccionado]);

  useEffect(() => {
    if (status !== "authenticated") {
      setCargandoTienda(false);
      return;
    }
    apiGet<Tienda>("/api/tiendas/mia")
      .then(setTienda)
      .catch((err) => {
        if (!(err instanceof ApiError) || err.code !== "TIENDA_NO_ENCONTRADA") {
          setError(err instanceof ApiError ? err.message : "Error al cargar tu tienda.");
        }
      })
      .finally(() => setCargandoTienda(false));
  }, [status]);

  useEffect(() => {
    if (!tienda) return;
    apiGet<Producto[]>(`/api/tiendas/${tienda.id}/productos`).then(setProductos).catch(() => {});
    apiGet<Pedido[]>(`/api/pedidos?tiendaId=${tienda.id}`).then(setPedidos).catch(() => {});
    setNombreForm(tienda.nombre);
    setDescripcionForm(tienda.descripcion ?? "");
    setMediosForm(tienda.mediosDePago);
    setHorariosForm(tienda.horarios.length === 7 ? tienda.horarios : horarioPorDefecto());
  }, [tienda]);

  function toggleMedioPago(medio: MedioPago) {
    setMediosForm((actual) =>
      actual.includes(medio) ? actual.filter((m) => m !== medio) : [...actual, medio],
    );
  }

  function toggleDiaCerrado(diaSemana: number) {
    setHorariosForm((actual) =>
      actual.map((h) =>
        h.diaSemana === diaSemana
          ? h.abre === null
            ? { ...h, abre: "09:00", cierra: "21:00" }
            : { ...h, abre: null, cierra: null }
          : h,
      ),
    );
  }

  function actualizarHora(diaSemana: number, campo: "abre" | "cierra", valor: string) {
    setHorariosForm((actual) =>
      actual.map((h) => (h.diaSemana === diaSemana ? { ...h, [campo]: valor } : h)),
    );
  }

  async function guardarTienda(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tienda) return;
    setError(null);
    setTiendaGuardada(false);
    setGuardandoTienda(true);
    try {
      const actualizada = await apiPatch<Tienda>(`/api/tiendas/${tienda.id}`, {
        nombre: nombreForm,
        descripcion: descripcionForm || undefined,
        mediosDePago: mediosForm,
        horarios: horariosForm,
      });
      setTienda(actualizada);
      setTiendaGuardada(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron guardar los cambios.");
    } finally {
      setGuardandoTienda(false);
    }
  }

  async function crearTienda(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const posicion = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject),
      );
      const nueva = await apiPost<Tienda>("/api/tiendas", {
        nombre: form.get("nombre"),
        descripcion: form.get("descripcion") || undefined,
        direccion: form.get("direccion"),
        lat: posicion.coords.latitude,
        lon: posicion.coords.longitude,
      });
      setTienda(nueva);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No pudimos obtener tu ubicación. Permitila para publicar tu tienda.",
      );
    }
  }

  async function crearProducto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tienda) return;
    const form = new FormData(e.currentTarget);
    const nuevo = await apiPost<Producto>(`/api/tiendas/${tienda.id}/productos`, {
      ...(catalogoSeleccionado
        ? { catalogoId: catalogoSeleccionado.id }
        : { nuevo: { nombre: busquedaCatalogo } }),
      precio: Number(form.get("precio")),
      stock: Number(form.get("stock")),
    });
    setProductos([...productos, nuevo]);
    e.currentTarget.reset();
    setBusquedaCatalogo("");
    setCatalogoSeleccionado(null);
    setResultadosCatalogo([]);
  }

  async function transicionar(pedidoId: string, accion: AccionPedido) {
    const actualizado = await apiPost<Pedido>(`/api/pedidos/${pedidoId}/transicion`, { accion });
    setPedidos(pedidos.map((p) => (p.id === pedidoId ? actualizado : p)));
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión para gestionar tu tienda.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (cargandoTienda) {
    return <div className="mx-auto max-w-md px-6 py-10 text-text-2">Cargando...</div>;
  }

  if (!tienda) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-bold text-primary-dark">
            Publicá tu tienda
          </h1>
          <p className="text-[14px] text-text-2">
            Necesitamos tu ubicación para mostrarte en el mapa a los compradores cercanos.
          </p>
        </div>
        <form onSubmit={crearTienda} className="flex flex-col gap-4">
          <Input id="nombre" name="nombre" label="Nombre de la tienda" required />
          <Input id="direccion" name="direccion" label="Dirección" required />
          <Input id="descripcion" name="descripcion" label="Descripción (opcional)" />
          {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
          <Button type="submit">Crear tienda</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <div className="flex items-center justify-between px-5 pb-1 pt-5">
        <span className="font-display text-[20px] font-bold text-primary-dark">Mi tienda</span>
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          Ver como comprador
        </Link>
      </div>

      <div className="flex gap-1.5 px-5 pb-3 pt-3.5">
        {(["tienda", "productos", "pedidos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-control px-2 py-2.5 text-[13px] font-semibold ${
              tab === t ? "bg-primary text-white" : "border border-border bg-surface text-text"
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-grow overflow-y-auto px-5 pb-6">
        {tab === "tienda" && (
          <form onSubmit={guardarTienda} className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Input
                id="tienda-nombre"
                label="Nombre de la tienda"
                value={nombreForm}
                onChange={(e) => setNombreForm(e.target.value)}
                required
              />
              <Input
                id="tienda-descripcion"
                label="Descripción"
                value={descripcionForm}
                onChange={(e) => setDescripcionForm(e.target.value)}
                placeholder="Contale a tus clientes qué vendés"
              />
              <div className="text-[13px] text-text-2">{tienda.direccion}</div>
              <ImageUploadField
                tipo="tienda"
                entidadId={tienda.id}
                valorActual={tienda.imagenUrl}
                label="Foto de portada"
                onSubido={async (url) => {
                  const actualizada = await apiPatch<Tienda>(`/api/tiendas/${tienda.id}`, { imagenUrl: url });
                  setTienda(actualizada);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-text">Medios de pago</div>
              <div className="flex flex-wrap gap-2">
                {MEDIOS_DE_PAGO.map(({ valor, etiqueta }) => {
                  const activo = mediosForm.includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => toggleMedioPago(valor)}
                      className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold ${
                        activo ? "bg-primary text-white" : "border border-border bg-surface text-text"
                      }`}
                    >
                      {etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-text">Horario de atención</div>
              <div className="flex flex-col gap-2">
                {horariosForm
                  .slice()
                  .sort((a, b) => a.diaSemana - b.diaSemana)
                  .map((h) => {
                    const cerrado = h.abre === null;
                    return (
                      <div
                        key={h.diaSemana}
                        className="flex flex-col gap-2 rounded-control border border-border bg-surface p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-text">
                            {DIAS_SEMANA[h.diaSemana]}
                          </span>
                          <label className="flex flex-shrink-0 items-center gap-1.5 text-[12px] text-text-2">
                            <input
                              type="checkbox"
                              checked={cerrado}
                              onChange={() => toggleDiaCerrado(h.diaSemana)}
                            />
                            Cerrado
                          </label>
                        </div>
                        {!cerrado && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={h.abre ?? ""}
                              onChange={(e) => actualizarHora(h.diaSemana, "abre", e.target.value)}
                              className="w-full min-w-0 rounded-control border border-border bg-bg px-2 py-1.5 text-[13px]"
                            />
                            <span className="flex-shrink-0 text-text-2">–</span>
                            <input
                              type="time"
                              value={h.cierra ?? ""}
                              onChange={(e) => actualizarHora(h.diaSemana, "cierra", e.target.value)}
                              className="w-full min-w-0 rounded-control border border-border bg-bg px-2 py-1.5 text-[13px]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
            {tiendaGuardada && (
              <p className="text-[13px] font-semibold text-estado-entregado-text">
                Cambios guardados.
              </p>
            )}

            <Button type="submit" disabled={guardandoTienda}>
              {guardandoTienda ? "Guardando..." : "Guardar cambios"}
            </Button>

            <div className="rounded-control bg-estado-entregado-bg p-3 text-[13px] font-semibold text-estado-entregado-text">
              {tienda.activa ? "Tienda activa y visible en el mapa" : "Tienda pausada"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const actualizada = await apiPatch<Tienda>(`/api/tiendas/${tienda.id}`, {
                  activa: !tienda.activa,
                });
                setTienda(actualizada);
              }}
            >
              {tienda.activa ? "Pausar tienda" : "Reactivar tienda"}
            </Button>
          </form>
        )}

        {tab === "tienda" && (
          <div className="flex items-center justify-between rounded-card border border-border bg-surface p-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-text">
                Plan {tienda.plan === "premium" ? "Premium" : "Free"}
              </span>
              {tienda.plan === "free" && (
                <span className="text-[12px] text-text-2">
                  Fotos hasta en 3 productos. Premium: fotos ilimitadas y prioridad en el mapa.
                </span>
              )}
            </div>
            {tienda.plan === "premium" && (
              <span className="rounded-pill bg-accent px-2.5 py-1 text-[11px] font-bold text-white">PREMIUM</span>
            )}
          </div>
        )}

        {tab === "tienda" && (
          <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
            {tienda.verificada ? (
              <div className="flex items-center gap-2 text-[13px] font-semibold text-estado-entregado-text">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Tienda verificada
              </div>
            ) : (
              <>
                <p className="text-[13px] text-text-2">
                  Un asesor técnico te visitará para verificar tu tienda. Las tiendas verificadas
                  tienen un 64% más de clientes que una tienda no verificada.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={solicitandoVerificacion || verificacionSolicitada}
                  onClick={async () => {
                    setSolicitandoVerificacion(true);
                    setError(null);
                    try {
                      await apiPost(`/api/tiendas/${tienda.id}/verificacion`, {});
                      setVerificacionSolicitada(true);
                    } catch (err) {
                      setError(
                        err instanceof ApiError && err.code === "SOLICITUD_YA_PENDIENTE"
                          ? "Ya hay una solicitud de verificación en curso."
                          : err instanceof ApiError
                            ? err.message
                            : "No se pudo enviar la solicitud.",
                      );
                    } finally {
                      setSolicitandoVerificacion(false);
                    }
                  }}
                >
                  {verificacionSolicitada
                    ? "Solicitud enviada"
                    : solicitandoVerificacion
                      ? "Enviando..."
                      : "Solicitar verificación"}
                </Button>
              </>
            )}
          </div>
        )}

        {tab === "productos" && (
          <div className="flex flex-col gap-3">
            <form onSubmit={crearProducto} className="flex flex-col gap-2 rounded-card border border-dashed border-accent p-3">
              <div className="flex gap-2">
                <Input
                  id="p-nombre"
                  value={busquedaCatalogo}
                  onChange={(e) => {
                    setBusquedaCatalogo(e.target.value);
                    setCatalogoSeleccionado(null);
                  }}
                  placeholder="Nombre o código de barras del producto"
                  required
                  className="flex-grow"
                />
                <button
                  type="button"
                  onClick={() => setEscaneando((v) => !v)}
                  aria-label="Escanear código de barras"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control border border-border bg-surface"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M6 8v8M9 8v8M12 8v8M16 8v8M19 8v8" />
                  </svg>
                </button>
              </div>

              {escaneando && (
                <div className="flex flex-col gap-1.5 rounded-control border border-border bg-bg p-2">
                  <video ref={videoRef} className="w-full rounded-control" muted playsInline />
                  {scannerError && <p className="text-[12px] text-estado-rechazado-text">{scannerError}</p>}
                  {!scannerActivo && !scannerError && (
                    <p className="text-[12px] text-text-2">Iniciando cámara...</p>
                  )}
                </div>
              )}

              {catalogoSeleccionado && (
                <div className="flex items-center justify-between rounded-control bg-estado-entregado-bg px-2.5 py-1.5 text-[12px] font-semibold text-estado-entregado-text">
                  <span>Producto del catálogo: {catalogoSeleccionado.nombre}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogoSeleccionado(null);
                      setBusquedaCatalogo("");
                    }}
                  >
                    Cambiar
                  </button>
                </div>
              )}

              {!catalogoSeleccionado && resultadosCatalogo.length > 0 && (
                <div className="flex flex-col gap-1 rounded-control border border-border bg-bg p-1.5">
                  {resultadosCatalogo.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setCatalogoSeleccionado(r);
                        setBusquedaCatalogo(r.nombre);
                      }}
                      className="rounded-control px-2 py-1.5 text-left text-[13px] hover:bg-surface"
                    >
                      {r.nombre}
                      {r.marca ? ` · ${r.marca}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {!catalogoSeleccionado && busquedaCatalogo.trim().length >= 2 && resultadosCatalogo.length === 0 && (
                <p className="text-[12px] text-text-2">
                  No está en el catálogo compartido — se va a crear como producto nuevo.
                </p>
              )}

              <div className="flex gap-2">
                <Input id="p-precio" name="precio" type="number" step="0.01" min="0" placeholder="Precio" required />
                <Input id="p-stock" name="stock" type="number" min="0" placeholder="Stock" required />
              </div>
              <Button type="submit" variant="accent">
                + Agregar producto
              </Button>
            </form>
            {productos.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5"
              >
                {p.imagenEfectiva ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagenEfectiva}
                    alt=""
                    style={{ width: 44, height: 44 }}
                    className="flex-shrink-0 rounded-control object-cover"
                  />
                ) : (
                  <div style={{ width: 44, height: 44 }} className="flex-shrink-0 rounded-control bg-placeholder" />
                )}
                <div className="flex min-w-0 flex-grow flex-col gap-1">
                  <div className="text-[14px] font-semibold">{p.nombre}</div>
                  <div className="text-xs text-text-2">
                    {formatoARS(p.precio)} · stock {p.stock}
                  </div>
                  {tienda?.plan === "premium" ? (
                    <div className="flex flex-wrap gap-2">
                      {/* Foto compartida del catálogo: premium puede cargarla si falta (06-catalogo.md). */}
                      {!p.imagenCatalogoUrl && (
                        <ImageUploadField
                          tipo="catalogo"
                          entidadId={p.catalogoId}
                          valorActual={null}
                          textoSubir="Foto del catálogo"
                          onSubido={async (url) => {
                            await apiPatch(`/api/catalogo/${p.catalogoId}/foto`, { imagenUrl: url });
                            setProductos((prev) =>
                              prev.map((x) =>
                                x.catalogoId === p.catalogoId
                                  ? { ...x, imagenCatalogoUrl: url, imagenEfectiva: x.imagenUrl ?? url }
                                  : x,
                              ),
                            );
                          }}
                        />
                      )}
                      {/* Foto personalizada, visible solo en esta tienda (10-planes.md). */}
                      <ImageUploadField
                        tipo="producto"
                        entidadId={p.id}
                        valorActual={p.imagenUrl}
                        textoSubir="Foto propia"
                        onSubido={async (url) => {
                          const actualizado = await apiPatch<Producto>(`/api/productos/${p.id}`, { imagenUrl: url });
                          setProductos((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
                        }}
                      />
                    </div>
                  ) : (
                    <span className="text-[11px] text-text-2">
                      {p.imagenCatalogoUrl ? "Foto del catálogo compartido" : "Sin foto en el catálogo"} · Fotos
                      propias con <span className="font-semibold text-primary-dark">Premium</span>
                    </span>
                  )}
                </div>
                <span
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                    p.disponible && p.stock > 0
                      ? "bg-estado-entregado-bg text-estado-entregado-text"
                      : "bg-estado-cancelado-bg text-estado-cancelado-text"
                  }`}
                >
                  {p.disponible && p.stock > 0 ? "Disponible" : "Sin stock"}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "pedidos" && (
          <div className="flex flex-col gap-3">
            {pedidos.length === 0 && <p className="text-[13px] text-text-2">Todavía no tenés pedidos.</p>}
            {pedidos.map((p) => {
              const total = p.items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);
              const acciones = ACCION_POR_ESTADO[p.estado] ?? [];
              return (
                <div key={p.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">
                      Pedido #{p.id.slice(0, 4).toUpperCase()}
                    </span>
                    <EstadoPedidoBadge estado={p.estado} />
                  </div>
                  <div className="text-[13px] text-text-2">
                    {p.items.length} producto(s) · {formatoARS(total)}
                  </div>
                  <ValoracionCliente compradorId={p.compradorId} puedeValorar={p.estado === "entregado"} />
                  {acciones.length > 0 && (
                    <div className="mt-1 flex gap-2">
                      {acciones.map((accion) => (
                        <button
                          key={accion}
                          onClick={() => transicionar(p.id, accion)}
                          className={`flex-1 rounded-control px-2.5 py-2.5 text-[13px] font-semibold ${
                            accion === "rechazar"
                              ? "border border-border bg-surface text-text"
                              : "bg-primary text-white"
                          }`}
                        >
                          {ETIQUETA_ACCION[accion]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
