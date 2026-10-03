import { ConversationScreen } from "@/components/conversations-screen";
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationScreen conversationId={id} />;
}
