"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMisTiendas, guardarTiendaActiva } from "@/lib/hooks/useMisTiendas";
import { ETIQUETA_ROL, puede, type Permiso } from "@/lib/equipo/permisos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EstadoPedidoBadge } from "@/components/ui/EstadoPedidoBadge";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { BuscadorFotos, type DestinoFoto } from "@/components/fotos/BuscadorFotos";
import { PuntoDeVenta } from "@/components/ventas/PuntoDeVenta";
import { DetallePedido, haceCuanto, type ItemPedidoVista } from "@/components/pedidos/DetallePedido";
import { EditorHorarios } from "@/components/tiendas/EditorHorarios";
import { ValoracionCliente } from "@/components/ui/ValoracionCliente";
import { formatearCantidad, type UnidadMedida } from "@/lib/productos/unidades";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api-client";
import { EscanerCodigo } from "@/components/scanner/EscanerCodigo";
import { DialogoEditarProducto } from "@/components/productos/DialogoEditarProducto";
import { ETIQUETA_PLAN } from "@/lib/planes/limites";
import { CamposPrecio, PRECIO_VACIO, aPayloadPrecio, type ValorPrecio } from "@/components/productos/CamposPrecio";
import { CONDICIONES_IVA, ETIQUETA_CONDICION, type AlicuotaIva, type CondicionIva } from "@/lib/precios/precios";
import {
  CamposEntradaCatalogo,
  ENTRADA_VACIA,
  aNuevaEntrada,
  type EntradaCatalogoForm,
} from "@/components/catalogo/CamposEntradaCatalogo";

type Rubro = { id: string; nombre: string };

type ProductoCatalogo = {
  id: string;
  nombre: string;
  marca: string | null;
  codigoBarras: string | null;
  imagenUrl: string | null;
  unidad: UnidadMedida;
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
  rubro: Rubro | null;
  verificada: boolean;
  plan: "free" | "premium" | "plata";
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[];
  abierto24hs: boolean;
  porcentajePuntosEquipo: number | null;
  // Datos fiscales (20-precios-facturacion.md).
  condicionIva: CondicionIva;
  razonSocial: string | null;
  cuit: string | null;
  ingresosBrutos: string | null;
  domicilioFiscal: string | null;
  puntoVenta: number | null;
  inicioActividades: string | null;
};


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
  descripcion?: string | null;
  imagenUrl: string | null;
  imagenCatalogoUrl: string | null;
  imagenEfectiva: string | null;
  precio: number;
  precioOferta: number | null;
  stock: number;
  unidad: UnidadMedida;
  disponible: boolean;
  costo: number | null;
  margen: number | null;
  alicuotaIva: AlicuotaIva;
  impuestosInternos: number;
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
  nota: string | null;
  total: number;
  creadoEn: string;
  comprador: { nombre: string };
  items: ItemPedidoVista[];
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

type Seccion = "vender" | "pedidos" | "productos" | "tienda";

// Qué permiso habilita cada sección (19-equipo-tienda.md).
const PERMISO_SECCION: Record<Seccion, Permiso | Permiso[] | "propietario"> = {
  vender: "vender",
  pedidos: "pedidos",
  productos: ["productos", "stock", "precios"],
  tienda: "propietario",
};
const ETIQUETA_SECCION: Record<Seccion, string> = { vender: "Vender", pedidos: "Pedidos", productos: "Stock", tienda: "Tienda" };
const SECCIONES = Object.keys(PERMISO_SECCION) as Seccion[];

export default function MiTiendaPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-10 text-text-2">Cargando...</div>}>
      <MiTienda />
    </Suspense>
  );
}

function MiTienda() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const tiendaParam = params.get("tienda");
  const seccionParam = params.get("seccion") as Seccion | null;
  const nueva = params.get("nueva") === "1";
  const { lista, activa, recargar } = useMisTiendas<Tienda>(status === "authenticated", tiendaParam);
  const cargandoTienda = status === "loading" || (status === "authenticated" && lista === null);
  const secciones = activa ? SECCIONES.filter((sec) => puede(activa, PERMISO_SECCION[sec])) : [];
  // La tienda es la activa (19-equipo-tienda.md: ?tienda=, la última elegida o la
  // primera), con los cambios que se guardan acá encima.
  const [tiendaEditada, setTienda] = useState<Tienda | null>(null);
  const tienda = activa ? (tiendaEditada?.id === activa.tienda.id ? tiendaEditada : activa.tienda) : null;
  // Sección: la elegida, la de ?seccion= o la primera que habilitan los permisos.
  const [tabElegida, setTab] = useState<Seccion | null>(null);
  const tab: Seccion =
    tabElegida && secciones.includes(tabElegida)
      ? tabElegida
      : seccionParam && secciones.includes(seccionParam)
        ? seccionParam
        : secciones[0] ?? "vender";
  const puedeVerPedidos = !!activa && puede(activa, "pedidos");
  const conPermiso = (permiso: Permiso | Permiso[] | "propietario") => !!activa && puede(activa, permiso);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Datos de un producto NUEVO en el catálogo (06-catalogo.md: categoría + marca +
  // variante + contenido); si se adopta uno existente, mandan los del catálogo.
  const [entradaNueva, setEntradaNueva] = useState<EntradaCatalogoForm>(ENTRADA_VACIA);
  // Precio del producto nuevo: costo + ganancia + impuestos (20-precios-facturacion.md).
  const [precioNuevo, setPrecioNuevo] = useState<ValorPrecio>(PRECIO_VACIO);
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [rubroForm, setRubroForm] = useState("");
  const [errorProducto, setErrorProducto] = useState<string | null>(null);

  const [nombreForm, setNombreForm] = useState("");
  const [descripcionForm, setDescripcionForm] = useState("");
  const [mediosForm, setMediosForm] = useState<MedioPago[]>([]);
  const [horariosForm, setHorariosForm] = useState<HorarioTienda[]>(horarioPorDefecto());
  const [abierto24hsForm, setAbierto24hsForm] = useState(false);
  // 12-gamificacion.md: % de los puntos de una venta para quien del equipo la hizo.
  // null = el valor por defecto de Almacenia.
  const [porcentajeEquipoForm, setPorcentajeEquipoForm] = useState<number | null>(null);
  // Datos fiscales (20-precios-facturacion.md); los edita solo el propietario.
  const [fiscalForm, setFiscalForm] = useState({
    condicionIva: "monotributo" as CondicionIva,
    razonSocial: "",
    cuit: "",
    ingresosBrutos: "",
    domicilioFiscal: "",
    puntoVenta: "",
    inicioActividades: "",
  });
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
  // Buscador de fotos (16-banco-fotos.md): para qué producto y destino está abierto.
  const [fotoPara, setFotoPara] = useState<{ producto: Producto; destino: DestinoFoto } | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  // Código leído con el escáner: si está en el catálogo se adopta; si no, queda en el
  // buscador y se guarda como código de la entrada nueva.
  async function codigoEscaneado(texto: string) {
    try {
      const resultados = await apiGet<ProductoCatalogo[]>(`/api/catalogo/buscar?codigoBarras=${encodeURIComponent(texto)}`);
      if (resultados[0]) {
        setCatalogoSeleccionado(resultados[0]);
        setBusquedaCatalogo(resultados[0].nombre);
      } else {
        setBusquedaCatalogo(texto);
      }
    } catch {
      setBusquedaCatalogo(texto);
    }
  }

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
    apiGet<Rubro[]>("/api/rubros").then(setRubros).catch(() => {});
  }, []);

  const activaId = activa?.tienda.id;
  useEffect(() => {
    if (activaId) guardarTiendaActiva(activaId);
  }, [activaId]);

  useEffect(() => {
    if (!tienda) return;
    recargarProductos(tienda.id);
    if (puedeVerPedidos) apiGet<Pedido[]>(`/api/pedidos?tiendaId=${tienda.id}`).then(setPedidos).catch(() => {});
    setNombreForm(tienda.nombre);
    setDescripcionForm(tienda.descripcion ?? "");
    setMediosForm(tienda.mediosDePago);
    setHorariosForm(tienda.horarios.length > 0 ? tienda.horarios : horarioPorDefecto());
    setAbierto24hsForm(tienda.abierto24hs);
    setPorcentajeEquipoForm(tienda.porcentajePuntosEquipo);
    setFiscalForm({
      condicionIva: tienda.condicionIva,
      razonSocial: tienda.razonSocial ?? "",
      cuit: tienda.cuit ?? "",
      ingresosBrutos: tienda.ingresosBrutos ?? "",
      domicilioFiscal: tienda.domicilioFiscal ?? "",
      puntoVenta: tienda.puntoVenta ? String(tienda.puntoVenta) : "",
      inicioActividades: tienda.inicioActividades ?? "",
    });
    setRubroForm(tienda.rubro?.id ?? "");
  }, [tienda, puedeVerPedidos]);

  // Sin horarios ni 24 hs la tienda no aparece en "Solo abiertas ahora" y los
  // compradores ven "Horario no informado" (02-tiendas.md): aviso persistente.
  function irAHorarios() {
    setTab("tienda");
    setTimeout(() => document.getElementById("horarios")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function toggleMedioPago(medio: MedioPago) {
    setMediosForm((actual) =>
      actual.includes(medio) ? actual.filter((m) => m !== medio) : [...actual, medio],
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
        abierto24hs: abierto24hsForm,
        porcentajePuntosEquipo: porcentajeEquipoForm,
        condicionIva: fiscalForm.condicionIva,
        razonSocial: fiscalForm.razonSocial || null,
        cuit: fiscalForm.cuit || null,
        ingresosBrutos: fiscalForm.ingresosBrutos || null,
        domicilioFiscal: fiscalForm.domicilioFiscal || null,
        puntoVenta: fiscalForm.puntoVenta ? Number(fiscalForm.puntoVenta) : null,
        inicioActividades: fiscalForm.inicioActividades || null,
        rubroId: rubroForm || undefined,
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
      const creada = await apiPost<Tienda>("/api/tiendas", {
        nombre: form.get("nombre"),
        descripcion: form.get("descripcion") || undefined,
        direccion: form.get("direccion"),
        lat: posicion.coords.latitude,
        lon: posicion.coords.longitude,
        rubroId: form.get("rubroId") || undefined,
      });
      guardarTiendaActiva(creada.id);
      await recargar();
      router.replace(`/mi-tienda?tienda=${creada.id}&seccion=tienda`);
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
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setErrorProducto(null);
    try {
      // Un código escaneado que no estaba en el catálogo queda guardado en la entrada nueva.
      const codigoBarras = /^\d{8,14}$/.test(busquedaCatalogo.trim()) ? busquedaCatalogo.trim() : undefined;
      const nuevo = await apiPost<Producto>(`/api/tiendas/${tienda.id}/productos`, {
        ...(catalogoSeleccionado
          ? { catalogoId: catalogoSeleccionado.id }
          : { nuevo: { ...aNuevaEntrada(entradaNueva), codigoBarras } }),
        ...aPayloadPrecio(precioNuevo),
        stock: Number(form.get("stock")),
      });
      setProductos([...productos, nuevo]);
      formEl.reset();
      setBusquedaCatalogo("");
      setCatalogoSeleccionado(null);
      setResultadosCatalogo([]);
      setEntradaNueva(ENTRADA_VACIA);
      setPrecioNuevo(PRECIO_VACIO);
    } catch (err) {
      setErrorProducto(err instanceof ApiError ? err.message : "No se pudo agregar el producto.");
    }
  }

  function recargarProductos(tiendaId: string) {
    apiGet<Producto[]>(`/api/tiendas/${tiendaId}/productos?pageSize=100`).then(setProductos).catch(() => {});
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

  if (!tienda || nueva) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-8">
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          ← Inicio
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[22px] font-bold text-primary-dark">
            {lista && lista.length > 0 ? "Nueva sucursal" : "Publicá tu tienda"}
          </h1>
          <p className="text-[14px] text-text-2">
            Necesitamos tu ubicación para mostrarte en el mapa a los compradores cercanos.
          </p>
        </div>
        <form onSubmit={crearTienda} className="flex flex-col gap-4">
          <Input id="nombre" name="nombre" label="Nombre de la tienda" required />
          <Input id="direccion" name="direccion" label="Dirección" required />
          <Input id="descripcion" name="descripcion" label="Descripción (opcional)" />
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-text">
            Rubro
            <select
              name="rubroId"
              required
              defaultValue=""
              className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal"
            >
              <option value="" disabled>
                Elegí el rubro de tu negocio
              </option>
              {rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
          <Button type="submit">Crear tienda</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-5">
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          ← Inicio
        </Link>
        {activa && (
          <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-dark">
            {ETIQUETA_ROL[activa.rol]}
          </span>
        )}
      </div>
      <div className="px-5 pt-1">
        {lista && lista.length > 1 ? (
          <select
            value={tienda.id}
            onChange={(e) => router.replace(`/mi-tienda?tienda=${e.target.value}&seccion=${tab}`)}
            aria-label="Tienda activa"
            className="max-w-full truncate rounded-control border border-border bg-surface px-2 py-1.5 font-display text-[19px] font-bold text-primary-dark"
          >
            {lista.map((m) => (
              <option key={m.tienda.id} value={m.tienda.id}>
                {m.tienda.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-display text-[20px] font-bold text-primary-dark">{tienda.nombre}</span>
        )}
      </div>

      <div className="flex gap-1.5 px-5 pb-3 pt-3.5" role="tablist" aria-label="Secciones de la tienda">
        {secciones.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-control px-2 py-2.5 text-[13px] font-semibold ${
              tab === t ? "bg-primary text-white" : "border border-border bg-surface text-text"
            }`}
          >
            {ETIQUETA_SECCION[t]}
          </button>
        ))}
      </div>
      {secciones.length === 0 && (
        <p className="px-5 text-[13px] text-text-2">Todavía no tenés permisos en esta tienda. Pedíselos a quien la administra.</p>
      )}

      {conPermiso("propietario") && tienda.horarios.length === 0 && !tienda.abierto24hs && (
        <div
          role="status"
          className="mx-5 mb-3 flex animate-fade-up flex-col gap-2 rounded-card border border-estado-pendiente-text/30 bg-estado-pendiente-bg p-3.5 text-estado-pendiente-text"
        >
          <p className="text-[13px] leading-snug">
            <strong>Tu tienda no tiene horarios cargados:</strong> no aparece en &quot;Solo abiertas ahora&quot; y los
            compradores ven &quot;Horario no informado&quot;.
          </p>
          <button
            type="button"
            onClick={irAHorarios}
            className="press self-start rounded-pill bg-estado-pendiente-text px-3.5 py-2 text-[13px] font-semibold text-white"
          >
            Configurar horarios
          </button>
        </div>
      )}

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
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-text">
                Rubro
                <select
                  value={rubroForm}
                  onChange={(e) => setRubroForm(e.target.value)}
                  className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal"
                >
                  <option value="">Sin rubro</option>
                  {rubros.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
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

            <div id="horarios" className="flex scroll-mt-4 flex-col gap-2">
              <div className="text-[13px] font-semibold text-text">Horario de atención</div>
              <label className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface p-3">
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold text-text">Abierto las 24 hs</span>
                  <span className="text-[12px] text-text-2">Todos los días, sin horario de cierre</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={abierto24hsForm}
                  onChange={(e) => setAbierto24hsForm(e.target.checked)}
                  className="h-5 w-5 accent-[#0e6b5c]"
                />
              </label>
              <div className={abierto24hsForm ? "hidden" : ""}>
                <EditorHorarios horarios={horariosForm} onChange={setHorariosForm} />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5" aria-label="Datos fiscales">
              <legend className="px-1 text-[14px] font-semibold text-text">Datos fiscales</legend>
              <p className="text-[12px] text-text-2">
                Definen cómo se arma el precio (con o sin IVA discriminado) y hacen falta para emitir comprobantes.
              </p>
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
                Condición frente al IVA
                <select
                  value={fiscalForm.condicionIva}
                  onChange={(e) => setFiscalForm({ ...fiscalForm, condicionIva: e.target.value as CondicionIva })}
                  aria-label="Condición frente al IVA"
                  className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text"
                >
                  {CONDICIONES_IVA.map((c) => (
                    <option key={c} value={c}>
                      {ETIQUETA_CONDICION[c]}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["razonSocial", "Razón social", "text"],
                  ["cuit", "CUIT", "text"],
                  ["domicilioFiscal", "Domicilio fiscal", "text"],
                  ["ingresosBrutos", "Ingresos brutos (opcional)", "text"],
                  ["puntoVenta", "Punto de venta", "number"],
                  ["inicioActividades", "Inicio de actividades (opcional)", "date"],
                ] as const
              ).map(([campo, etiqueta, tipo]) => (
                <label key={campo} className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
                  {etiqueta}
                  <input
                    type={tipo}
                    value={fiscalForm[campo]}
                    onChange={(e) => setFiscalForm({ ...fiscalForm, [campo]: e.target.value })}
                    aria-label={etiqueta}
                    inputMode={campo === "cuit" ? "numeric" : undefined}
                    placeholder={campo === "cuit" ? "20-12345678-6" : undefined}
                    className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text"
                  />
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
              <legend className="px-1 text-[14px] font-semibold text-text">Puntos por ventas del equipo</legend>
              <p className="text-[12px] text-text-2">
                Cuando vende alguien de tu equipo, los puntos de la venta se reparten entre esa persona y vos.
              </p>
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input
                  type="checkbox"
                  checked={porcentajeEquipoForm === null}
                  onChange={(e) => setPorcentajeEquipoForm(e.target.checked ? null : 50)}
                  className="h-4 w-4 accent-[#0e6b5c]"
                />
                Usar el valor por defecto de Almacenia
              </label>
              {porcentajeEquipoForm !== null && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={porcentajeEquipoForm}
                    onChange={(e) => setPorcentajeEquipoForm(Number(e.target.value))}
                    aria-label="Porcentaje de los puntos para quien vende"
                    className="w-full accent-[#0e6b5c]"
                  />
                  <p className="text-[13px] font-semibold text-text" data-testid="reparto-puntos">
                    Quien vende se lleva {porcentajeEquipoForm} %, vos {100 - porcentajeEquipoForm} %
                  </p>
                </>
              )}
            </fieldset>

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
                Plan {ETIQUETA_PLAN[tienda.plan]}
              </span>
              {tienda.plan === "free" ? (
                <span className="text-[12px] text-text-2">
                  Fotos del banco de Almacenia. Premium: fotos propias, prioridad en el mapa y crear categorías.
                </span>
              ) : (
                <span className="text-[12px] text-text-2">
                  Podés subir fotos propias de tus productos: en Productos, tocá «Foto propia» → «Subir foto propia».
                </span>
              )}
            </div>
            {tienda.plan !== "free" && (
              <span className="rounded-pill bg-accent px-2.5 py-1 text-[11px] font-bold text-white">{tienda.plan.toUpperCase()}</span>
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

        {tab === "vender" && (
          <PuntoDeVenta
            tiendaId={tienda.id}
            mediosDePago={tienda.mediosDePago}
            onStockCambiado={() => recargarProductos(tienda.id)}
            puedeCobrar={conPermiso("cobrar")}
            puedeAnular={conPermiso("anular")}
          />
        )}

        {tab === "productos" && (
          <div className="flex flex-col gap-3">
            {conPermiso("productos") && (
            <form onSubmit={crearProducto} className="flex flex-col gap-2 rounded-card border border-dashed border-accent p-3">
              <div className="flex gap-2">
                <Input
                  id="p-nombre"
                  value={busquedaCatalogo}
                  onChange={(e) => {
                    setBusquedaCatalogo(e.target.value);
                    setCatalogoSeleccionado(null);
                  }}
                  placeholder="Buscar en el catálogo (nombre o código de barras)"
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

              <EscanerCodigo
                abierto={escaneando}
                titulo="Apuntá al código de barras del producto"
                onDetectado={codigoEscaneado}
                onCerrar={() => setEscaneando(false)}
              />

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
              {!catalogoSeleccionado && (
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <p className="text-[12px] text-text-2">
                    {busquedaCatalogo.trim().length >= 2 && resultadosCatalogo.length === 0
                      ? "No está en el catálogo compartido: cargalo como producto nuevo."
                      : "¿No está en el catálogo? Cargalo como producto nuevo:"}
                  </p>
                  <CamposEntradaCatalogo
                    valor={entradaNueva}
                    onChange={setEntradaNueva}
                    // 17-rubros-categorias.md: el plan de la tienda es el del dueño.
                    puedeCrearCategoria={tienda.plan !== "free"}
                  />
                </div>
              )}

              {(() => {
                const unidad = catalogoSeleccionado?.unidad ?? entradaNueva.unidad;
                return (
                  <>
                    <CamposPrecio
                      valor={precioNuevo}
                      onChange={setPrecioNuevo}
                      condicion={tienda.condicionIva}
                      porKg={unidad === "kg"}
                      idPrefijo="p"
                    />
                    <div className="grid">
                      <Input
                        id="p-stock"
                        name="stock"
                        type="number"
                        min="0"
                        step={unidad === "kg" ? "0.001" : "1"}
                        placeholder={unidad === "kg" ? "Stock (kg)" : "Stock"}
                        className="w-full min-w-0"
                        required
                      />
                    </div>
                  </>
                );
              })()}
              {errorProducto && (
                <p role="alert" className="text-[13px] text-estado-rechazado-text">
                  {errorProducto}
                </p>
              )}
              <Button type="submit" variant="accent">
                + Agregar producto
              </Button>
            </form>
            )}
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
                    {formatoARS(p.precio)}
                    {p.unidad === "kg" ? " / kg" : ""} · stock {formatearCantidad(p.unidad, p.stock)}
                  </div>
                  {conPermiso("fotos") && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Foto compartida del catálogo: cualquier vendedor la elige del banco si falta (06-catalogo.md). */}
                    {!p.imagenCatalogoUrl && (
                      <button
                        type="button"
                        onClick={() => setFotoPara({ producto: p, destino: { catalogoId: p.catalogoId } })}
                        className="press rounded-control border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-text"
                      >
                        Buscar foto
                      </button>
                    )}
                    {/* Foto personalizada, visible solo en esta tienda (10-planes.md). */}
                    {tienda && tienda.plan !== "free" ? (
                      <button
                        type="button"
                        onClick={() => setFotoPara({ producto: p, destino: { productoId: p.id } })}
                        className="press rounded-control border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-text"
                      >
                        {p.imagenUrl ? "Cambiar foto propia" : "Foto propia"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-text-2">
                        {p.imagenCatalogoUrl ? "Foto del catálogo compartido · " : ""}Fotos propias con{" "}
                        <span className="font-semibold text-primary-dark">Premium</span>
                      </span>
                    )}
                  </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                      p.disponible && p.stock > 0
                        ? "bg-estado-entregado-bg text-estado-entregado-text"
                        : "bg-estado-cancelado-bg text-estado-cancelado-text"
                    }`}
                  >
                    {p.disponible && p.stock > 0 ? "Disponible" : p.disponible ? "Sin stock" : "Pausado"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditando(p)}
                    aria-label={`Editar o eliminar ${p.nombre}`}
                    className="press rounded-control border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-text"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
            {editando && (
              <DialogoEditarProducto
                producto={editando}
                permisos={activa?.permisos ?? []}
                condicion={tienda.condicionIva}
                onCerrar={() => setEditando(null)}
                onGuardado={(actualizado) => {
                  setProductos((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
                  setEditando(null);
                }}
                onEliminado={(id) => {
                  setProductos((prev) => prev.filter((x) => x.id !== id));
                  setEditando(null);
                }}
              />
            )}
          </div>
        )}

        {tab === "pedidos" && (
          <div className="flex flex-col gap-3">
            {pedidos.length === 0 && <p className="text-[13px] text-text-2">Todavía no tenés pedidos.</p>}
            {pedidos.map((p) => {
              const acciones = ACCION_POR_ESTADO[p.estado] ?? [];
              const cantidadProductos = p.items.length;
              return (
                <div key={p.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">
                      Pedido #{p.id.slice(0, 4).toUpperCase()}
                    </span>
                    <EstadoPedidoBadge estado={p.estado} />
                  </div>
                  <div className="text-[13px] text-text">
                    de <span className="font-semibold">{p.comprador.nombre}</span>
                    <span className="text-text-2"> · {haceCuanto(p.creadoEn)}</span>
                  </div>
                  <div className="text-[13px] text-text-2">
                    {cantidadProductos} producto{cantidadProductos !== 1 ? "s" : ""} · {formatoARS(p.total)}
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-[13px] font-semibold text-accent-text">Ver detalle</summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <DetallePedido items={p.items} nota={p.nota} total={p.total} />
                      <Link href={`/pedidos/${p.id}`} className="text-[12px] font-semibold text-text-2">
                        Abrir pedido →
                      </Link>
                    </div>
                  </details>
                  <ValoracionCliente
                    compradorId={p.compradorId}
                    tiendaId={tienda.id}
                    puedeValorar={p.estado === "entregado" && conPermiso("propietario")}
                  />
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

      <BuscadorFotos
        abierto={fotoPara !== null}
        textoInicial={fotoPara?.producto.nombre ?? ""}
        destino={fotoPara?.destino ?? null}
        titulo={fotoPara && "productoId" in fotoPara.destino ? "Foto propia del producto" : "Foto del catálogo"}
        onUsada={(url) => {
          if (!fotoPara) return;
          const { producto, destino } = fotoPara;
          setProductos((prev) =>
            prev.map((x) =>
              "productoId" in destino
                ? x.id === producto.id
                  ? { ...x, imagenUrl: url, imagenEfectiva: url }
                  : x
                : x.catalogoId === producto.catalogoId
                  ? { ...x, imagenCatalogoUrl: url, imagenEfectiva: x.imagenUrl ?? url }
                  : x,
            ),
          );
        }}
        onCerrar={() => setFotoPara(null)}
      />
    </div>
  );
}
