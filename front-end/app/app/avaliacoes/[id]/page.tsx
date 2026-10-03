import { AssessmentScreen } from "@/components/assessments-screen";
export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentScreen assessmentId={id} />;
}
