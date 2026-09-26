import { EditorLista } from "@/components/listas/EditorLista";

export default async function ListaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorLista listaId={id} />;
}
