"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const resultado = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (resultado?.error) {
        setError("Email o contraseña incorrectos.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-9 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-bold text-primary-dark">
          Hola de nuevo
        </h1>
        <p className="text-[15px] text-text-2">
          Iniciá sesión para seguir comprando cerca tuyo
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          id="lg-email"
          label="Email"
          type="email"
          placeholder="vos@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          id="lg-password"
          label="Contraseña"
          type="password"
          placeholder="Tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-[13px] font-medium text-estado-rechazado-text">{error}</p>}

        <Button type="submit" disabled={cargando} className="mt-2 w-full">
          {cargando ? "Ingresando..." : "Iniciar sesión"}
        </Button>
      </form>

      <p className="text-center text-sm text-text-2">
        ¿No tenés cuenta?{" "}
        <Link href="/registro" className="font-semibold text-accent-text">
          Creá una
        </Link>
      </p>
    </div>
  );
}
