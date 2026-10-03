import { PracticeTestScreen } from "@/components/study-screen";
export default async function PracticeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeTestScreen testId={id} />;
}
