import { ClassDetailScreen } from "@/components/classes-screen";
export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClassDetailScreen classId={id} />;
}
