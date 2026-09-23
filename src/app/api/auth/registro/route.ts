import { NextRequest } from "next/server";
import { registrarUsuario } from "@/lib/auth/auth";
import { respuestaExitosa, respuestaError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const usuario = await registrarUsuario({
      email: body.email,
      password: body.password,
      nombre: body.nombre,
    });
    return respuestaExitosa(usuario, 201);
  } catch (error) {
    return respuestaError(error);
  }
}
