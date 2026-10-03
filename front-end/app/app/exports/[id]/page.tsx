import { AssessmentExportScreen } from "@/components/assessments-screen";

export default async function AssessmentExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentExportScreen exportId={id} />;
}
