"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize API request and selected-context state. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, errorCodeCopy, errorCopy, isTerminalJob, jsonBody, newIdempotencyKey } from "@/lib/api";
import type { ConversationMessage, ConversationView, CourseView, JobView, MaterialView, PageResult } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { JobTracker } from "./job-tracker";
import { ArrowRight, BookOpen, FileText, MessageCircle, Send, Sparkles } from "lucide-react";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";

export function ConversationsScreen() {
  const router = useRouter();
  const { activeWorkspace, persona } = useSession();
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [courseCursor, setCourseCursor] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [materialCursor, setMaterialCursor] = useState<string | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeWorkspace) { setLoading(false); return; }
    let live = true; setLoading(true); setError("");
    Promise.allSettled([
      api<PageResult<ConversationView>>("/conversations?cursor="),
      api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=`),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") { setConversations(results[0].value.items || []); setConversationCursor(results[0].value.nextCursor); } else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") { setCourses(results[1].value.items || []); setCourseCursor(results[1].value.nextCursor); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, reloadKey]);

  const loadMore = async (kind: "conversations" | "courses" | "materials") => {
    const cursor = kind === "conversations" ? conversationCursor : kind === "courses" ? courseCursor : materialCursor;
    if (!cursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      if (kind === "conversations") {
        const page = await api<PageResult<ConversationView>>(`/conversations?cursor=${encodeURIComponent(cursor)}`);
        setConversations((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setConversationCursor(page.nextCursor);
      } else if (kind === "courses" && activeWorkspace) {
        const page = await api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=${encodeURIComponent(cursor)}`);
        setCourses((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setCourseCursor(page.nextCursor);
      } else if (kind === "materials" && courseId) {
        const page = await api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=${encodeURIComponent(cursor)}`);
        setMaterials((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setMaterialCursor(page.nextCursor);
      }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };

  useEffect(() => {
    if (!courseId) { setMaterials([]); setDocumentIds([]); return; }
    let live = true;
    api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=`).then((result) => { if (live) { setMaterials(result.items || []); setMaterialCursor(result.nextCursor); } }).catch((caught) => { if (live) setError(errorCopy(caught)); });
    return () => { live = false; };
  }, [courseId]);

  const readyDocuments = useMemo(() => materials.flatMap((material) => material.documents || []).filter((doc) => ["READY", "COMPLETED"].includes(doc.status.toUpperCase())), [materials]);
  const toggleDoc = (id: string) => setDocumentIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = await api<{ conversation: ConversationView }>("/conversations", { method: "POST", body: jsonBody({ kind: persona === "TEACHER" ? "TEACHER_ASSISTANT" : "STUDENT_TUTOR", ...(courseId ? { courseId } : {}), ...(documentIds.length ? { documentIds } : {}), title: form.get("title") || undefined }) });
      if (response.conversation?.id) router.push(`/app/conversas/${response.conversation.id}`);
      else setReloadKey((value) => value + 1);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <div className="page-stack"><PageTitle eyebrow="ESTUDO COM CONTEXTO" title="Conversas" description="Pergunte sobre os materiais disponíveis. As respostas mostram as fontes usadas." />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}
    <Panel title="Começar uma conversa" detail="Escolha um contexto se quiser limitar a conversa a materiais específicos.">
      <form className="conversation-create" onSubmit={(event) => void create(event)}><label className="field"><span>Título <small>(opcional)</small></span><input className="input" name="title" placeholder="Ex.: Revisão para a próxima prova" /></label><label className="field"><span>Disciplina <small>(opcional)</small></span><select className="input" value={courseId} onChange={(event) => { setCourseId(event.target.value); setDocumentIds([]); }}><option value="">Sem contexto de disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{courseCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("courses")}>{pageBusy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}</label>{courseId && materialCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("materials")}>{pageBusy ? "Carregando…" : "Carregar mais materiais"}</Button>}{courseId && <fieldset className="document-choices"><legend>Materiais prontos para usar <small>selecione um ou mais</small></legend>{readyDocuments.length ? readyDocuments.map((document) => <label className="document-choice" key={document.id}><input type="checkbox" checked={documentIds.includes(document.id)} onChange={() => toggleDoc(document.id)} /><FileText size={15} /><span>{document.name}</span></label>) : <p>Nenhum material processado disponível neste contexto.</p>}</fieldset>}{courseId && materials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`more-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos de ${material.title}`}</Button></div>)}<Button type="submit" disabled={busy}>{busy ? "Criando…" : "Abrir conversa"}<ArrowRight size={15} /></Button></form>
    </Panel>
    <Panel title="Conversas recentes" detail={conversations.length ? `${conversations.length} neste contexto` : undefined}>
      {loading ? <LoadingBlock label="Carregando conversas…" /> : conversations.length ? <div className="conversation-list">{conversations.map((conversation) => <Link className="conversation-row" href={`/app/conversas/${conversation.id}`} key={conversation.id}><span><MessageCircle size={18} /></span><div><strong>{conversation.title || (conversation.kind === "TEACHER_ASSISTANT" ? "Assistente docente" : "Tutor de estudo")}</strong><small>{courses.find((course) => course.id === conversation.courseId)?.title || "Conversa sem disciplina"}{conversation.updatedAt ? ` · ${new Date(conversation.updatedAt).toLocaleDateString("pt-BR")}` : ""}</small></div><ArrowRight size={16} /></Link>)}</div> : <EmptyState title="Sua próxima pergunta começa aqui" detail="Crie uma conversa para estudar um assunto ou organizar uma ideia." />}{conversationCursor && <Button type="button" variant="secondary" disabled={pageBusy} onClick={() => void loadMore("conversations")}>{pageBusy ? "Carregando…" : "Carregar conversas anteriores"}</Button>}
    </Panel>
  </div>;
}

export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const { persona } = useSession();
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [retryMessage, setRetryMessage] = useState<{ content: string; clientMessageId: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    Promise.allSettled([
      api<PageResult<ConversationView>>("/conversations?cursor="),
      api<PageResult<ConversationMessage>>(`/conversations/${conversationId}/messages?cursor=`),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") setConversation(results[0].value.items.find((item) => item.id === conversationId) || null);
      if (results[1].status === "fulfilled") { const page = results[1].value; setMessages((current) => mergeMessages(current, page.items || [])); setMessageCursor(page.nextCursor); } else setError(errorCopy(results[1].reason));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [conversationId, reloadKey]);

  const loadOlderMessages = async () => {
    if (!messageCursor || olderBusy) return;
    setOlderBusy(true); setError("");
    try {
      const page = await api<PageResult<ConversationMessage>>(`/conversations/${conversationId}/messages?cursor=${encodeURIComponent(messageCursor)}`);
      setMessages((current) => mergeMessages(page.items || [], current));
      setMessageCursor(page.nextCursor);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setOlderBusy(false); }
  };

  const send = async (content: string, clientMessageId = newIdempotencyKey()) => {
    if (!content.trim()) return false;
    setBusy(true); setError(""); setRetryMessage(null);
    try {
      const response = await api<{ job: JobView }>(`/conversations/${conversationId}/messages`, { method: "POST", headers: { "Idempotency-Key": clientMessageId }, body: jsonBody({ content: content.trim(), clientMessageId }) });
      setMessages((items) => mergeMessages(items, [{ id: clientMessageId, clientMessageId, role: "user", content: content.trim() }]));
      setRetryMessage({ content: content.trim(), clientMessageId }); setJob(response.job);
      return true;
    } catch (caught) { setError(errorCopy(caught)); setRetryMessage({ content: content.trim(), clientMessageId }); return false; }
    finally { setBusy(false); }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const content = String(form.get("content") || "");
    const formElement = event.currentTarget as HTMLFormElement;
    if (await send(content)) formElement.reset();
  };

  const onJobUpdate = useCallback((next: JobView) => {
    if (isTerminalJob(next)) {
      if (["FAILED", "ERROR"].includes(next.state.toUpperCase())) setError(errorCodeCopy(next.errorCode));
      else { setRetryMessage(null); refresh(); }
    }
  }, [refresh]);

  const heading = conversation?.title || (persona === "TEACHER" ? "Assistente docente" : "Tutor de estudo");
  if (loading) return <LoadingBlock label="Abrindo conversa…" />;
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/conversas">Conversas</Link><span>/</span><span>{heading}</span></div><PageTitle eyebrow="CONVERSA PRIVADA" title={heading} description="As fontes aparecem junto da resposta; material revogado pode deixar de estar disponível." />
    {error && <Notice tone="error" title="A IA não concluiu a resposta">{error}{retryMessage && <Button type="button" variant="secondary" disabled={busy} onClick={() => void send(retryMessage.content, retryMessage.clientMessageId)}>Tentar novamente<ArrowRight size={14} /></Button>}</Notice>}
    {job && <JobTracker job={job} onUpdate={onJobUpdate} onClose={() => setJob(null)} />}
    <div className="chat-layout"><div className="chat-messages" aria-live="polite" aria-relevant="additions text">{messageCursor && <Button type="button" variant="ghost" disabled={olderBusy} onClick={() => void loadOlderMessages()}>{olderBusy ? "Carregando…" : "Carregar mensagens anteriores"}</Button>}
      {messages.length === 0 ? <div className="chat-empty"><span><Sparkles size={23} /></span><h3>Que assunto você quer entender?</h3><p>Escreva sua dúvida. O tutor consulta somente o contexto autorizado para esta conversa.</p></div> : messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      {busy && <div className="message assistant"><div className="message-meta"><strong>Facilita Estudo</strong><span>Preparando resposta</span></div><LoadingBlock label="Lendo o contexto…" /></div>}
    </div><form className="chat-compose" onSubmit={(event) => void submit(event)}><label className="sr-only" htmlFor="chat-content">Sua pergunta</label><textarea className="input" id="chat-content" name="content" required rows={1} disabled={busy} placeholder="Escreva sua pergunta…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><Button type="submit" disabled={busy}><Send size={17} />Enviar</Button></form><p className="chat-hint">Enter envia · Shift + Enter quebra a linha · Respostas podem levar alguns instantes</p></div>
  </div>;
}

function mergeMessages(first: ConversationMessage[], second: ConversationMessage[]) {
  const merged = new Map<string, ConversationMessage>();
  for (const message of [...first, ...second]) {
    const key = message.clientMessageId ? `client:${message.clientMessageId}` : `id:${message.id}`;
    merged.set(key, message);
  }
  return Array.from(merged.values()).sort((left, right) => {
    if (!left.createdAt || !right.createdAt) return 0;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const userMessage = ["user", "USER"].includes(message.role);
  return <article className={`message ${userMessage ? "user" : "assistant"}`}><div className="message-meta"><strong>{userMessage ? "Você" : "Facilita Estudo"}</strong>{message.createdAt && <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>}</div><div className="message-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>{!userMessage && message.citations?.length ? <div className="message-sources" aria-label="Fontes da resposta">{message.citations.map((source, index) => <div className="source-chip-wrap" key={`${source.documentId || source.materialId || source.title}-${index}`}>{source.documentId ? <Link className="source-chip" href={`/app/materiais/${source.documentId}`}><FileText size={12} />{source.title || `Material ${index + 1}`}{source.page ? ` · p. ${source.page}` : source.slide ? ` · slide ${source.slide}` : ""}</Link> : <span className="source-chip"><BookOpen size={12} />{source.title || `Material ${index + 1}`}{source.page ? ` · p. ${source.page}` : ""}</span>}{source.excerpt && <p className="source-excerpt">“{source.excerpt}”</p>}</div>)}</div> : null}</article>;
}
