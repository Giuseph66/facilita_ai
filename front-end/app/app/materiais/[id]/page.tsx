import { DocumentScreen } from "@/components/materials-screen";
export default async function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { id } = await params;
  const page = Number((await searchParams).page);
  return <DocumentScreen documentId={id} page={Number.isSafeInteger(page) && page > 0 ? page : 1} />;
}
