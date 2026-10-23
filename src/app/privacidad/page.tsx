import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata: Metadata = { title: "Política de privacidad · Almacenia" };

// Borrador: revisarlo con un profesional antes de pedir la revisión de AdSense.
export default function PrivacidadPage() {
  return (
    <PaginaLegal titulo="Política de privacidad" actualizada="23 de octubre de 2026">
      <p>
        Almacenia es una plataforma para comprar y vender en comercios de cercanía de San Juan, Argentina. Esta política explica qué datos
        personales usamos, para qué y cuáles son tus derechos según la Ley 25.326 de Protección de Datos Personales.
      </p>
      <h2>Qué datos usamos</h2>
      <ul>
        <li>Datos de tu cuenta: nombre, email, foto de perfil y contraseña (guardada cifrada).</li>
        <li>Tu actividad en la app: pedidos, compras, puntos, listas de compras, reseñas y notificaciones.</li>
        <li>
          Tu ubicación, solo cuando la permitís en el navegador, para mostrarte tiendas cercanas y registrar check-ins. No guardamos tu
          recorrido.
        </li>
        <li>Si tenés una tienda: sus datos comerciales y fiscales, productos, precios, ventas y equipo.</li>
        <li>Datos técnicos: el tipo de navegador y, si activás notificaciones push, la suscripción de tu dispositivo.</li>
      </ul>
      <h2>Para qué los usamos</h2>
      <ul>
        <li>Dar el servicio: mostrarte tiendas, procesar pedidos y ventas, calcular puntos y alcance.</li>
        <li>Enviarte las notificaciones que elegiste (en la app, push o email). Las de ofertas y publicidad son opcionales.</li>
        <li>Mostrar publicidad a los usuarios del plan free. Nunca te pagamos ni te damos puntos por ver o tocar anuncios.</li>
        <li>Seguridad, prevención de fraude y estadísticas internas.</li>
      </ul>
      <h2>Cookies y publicidad de terceros</h2>
      <p>
        Usamos cookies propias para mantener tu sesión. En el futuro podremos mostrar anuncios de proveedores como Google, que usan cookies
        para elegir los anuncios. Esos proveedores solo se cargan si aceptás las cookies publicitarias en el aviso de cookies; si las
        rechazás, solo ves avisos propios de comercios de Almacenia. Podés conocer cómo usa Google los datos en{" "}
        <a href="https://policies.google.com/technologies/partner-sites" className="font-semibold text-primary-dark underline">
          policies.google.com/technologies/partner-sites
        </a>
        .
      </p>
      <h2>Con quién los compartimos</h2>
      <ul>
        <li>Con la tienda a la que le comprás o pedís: tu nombre y lo que pediste (nunca tu email).</li>
        <li>Con proveedores que nos dan infraestructura (servidores, almacenamiento de fotos, envío de emails y push).</li>
        <li>Con autoridades, solo cuando la ley lo exige.</li>
      </ul>
      <h2>Tus derechos</h2>
      <p>
        Podés acceder, corregir y pedir la eliminación de tus datos en cualquier momento, y elegir qué notificaciones recibís desde{" "}
        <Link href="/perfil" className="font-semibold text-primary-dark underline">
          tu perfil
        </Link>
        . La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias y reclamos de quienes
        resulten afectados en sus derechos.
      </p>
    </PaginaLegal>
  );
}
