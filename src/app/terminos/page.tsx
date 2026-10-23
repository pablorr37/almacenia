import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata: Metadata = { title: "Términos de uso · Almacenia" };

// Borrador: revisarlo con un profesional.
export default function TerminosPage() {
  return (
    <PaginaLegal titulo="Términos de uso" actualizada="23 de octubre de 2026">
      <p>Al usar Almacenia aceptás estos términos. Si no estás de acuerdo, no uses la app.</p>
      <h2>El servicio</h2>
      <p>
        Almacenia conecta compradores con comercios de cercanía. Las ventas y los pedidos son entre el comprador y la tienda: la tienda es
        responsable de sus precios, stock, productos y comprobantes.
      </p>
      <h2>Cuentas</h2>
      <ul>
        <li>Sos responsable de lo que se haga con tu cuenta y de mantener tu contraseña segura.</li>
        <li>Podemos pausar o dar de baja cuentas que incumplan estos términos o la ley.</li>
      </ul>
      <h2>Puntos</h2>
      <ul>
        <li>Los puntos no son dinero, no se compran ni se canjean por efectivo.</li>
        <li>Se pueden canjear por plan premium o por publicidad en la app, a los precios vigentes que define Almacenia.</li>
        <li>Solo se pueden transferir entre personas del equipo de una misma tienda, con los topes vigentes.</li>
        <li>Si detectamos puntos obtenidos con fraude, podemos anularlos.</li>
      </ul>
      <h2>Planes y pagos</h2>
      <ul>
        <li>El plan premium pagado con puntos o en pesos dura el período indicado y vence si no se renueva.</li>
        <li>La renovación automática es opcional y se puede desactivar en cualquier momento desde Mis puntos.</li>
      </ul>
      <h2>Publicidad</h2>
      <ul>
        <li>Las campañas de las tiendas pasan por una revisión antes de publicarse. Podemos rechazar avisos engañosos, ilegales u ofensivos.</li>
        <li>
          Si una campaña pagada con puntos se rechaza, se devuelven los puntos. Si se finaliza antes de tiempo, se devuelve la parte que
          indique la configuración vigente.
        </li>
        <li>La publicidad push respeta un tope semanal y no se envía de noche.</li>
      </ul>
      <h2>Privacidad</h2>
      <p>
        Ver la{" "}
        <Link href="/privacidad" className="font-semibold text-primary-dark underline">
          política de privacidad
        </Link>
        .
      </p>
    </PaginaLegal>
  );
}
