import { ArtifactScreen } from "@/components/study-screen";
export default async function ArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArtifactScreen artifactId={id} />;
}
