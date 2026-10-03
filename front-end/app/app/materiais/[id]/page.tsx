import { DocumentScreen } from "@/components/materials-screen";
export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentScreen documentId={id} />;
}
