import { CourseDetailScreen } from "@/components/courses-screen";
export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseDetailScreen courseId={id} />;
}
