"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPost, ApiError } from "@/lib/api-client";

export default function RegistroPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await apiPost("/api/auth/registro", { nombre, email, password });
      const resultado = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (resultado?.error) {
        throw new ApiError("CREDENCIALES_INVALIDAS", "No se pudo iniciar sesión.");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] font-bold text-primary-dark">
          Creá tu cuenta
        </h1>
        <p className="text-[15px] text-text-2">
          Comprá en comercios cercanos o publicá tu propia tienda
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          id="reg-nombre"
          label="Nombre"
          type="text"
          placeholder="Tu nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <Input
          id="reg-email"
          label="Email"
          type="email"
          placeholder="vos@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          id="reg-password"
          label="Contraseña"
          type="password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <div className="rounded-control border border-[#c3e6db] bg-primary-soft p-3.5 text-[13px] leading-relaxed text-text-2">
          Toda cuenta nace lista para comprar. Si más adelante cargás tu tienda, se
          activa también el modo vendedor — no hace falta elegir ahora.
        </div>

        {error && <p className="text-[13px] font-medium text-estado-rechazado-text">{error}</p>}

        <Button type="submit" disabled={cargando} className="mt-1 w-full">
          {cargando ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </form>

      <p className="text-center text-sm text-text-2">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciá sesión
        </Link>
      </p>
    </div>
  );
}
