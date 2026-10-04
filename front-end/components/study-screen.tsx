"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle and selected-context state. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, errorCopy, jsonBody, newIdempotencyKey } from "@/lib/api";
import { questionCountLabel } from "@/lib/display-labels";
import type { CourseView, JobView, MaterialView, PageResult, StudyArtifactView } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { JobTracker } from "./job-tracker";
import { Modal } from "./modal";
import { ArrowLeft, ArrowRight, BookMarked, Check, FileText, GraduationCap, LockKeyhole, RotateCcw, Sparkles } from "lucide-react";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";

const artifactLabels: Record<string, string> = { SUMMARY: "Resumo", EXPLANATION: "Explicação", FLASHCARDS: "Cartões de estudo", STUDY_PLAN: "Plano de estudo", REVIEW: "Revisão", SIMILAR_EXERCISES: "Exercícios", PRACTICE_TEST: "Simulado" };
function artifactLabel(kind: string) { return artifactLabels[kind.toUpperCase()] || "Material de estudo"; }
function SourceList({ sources }: { sources: StudyArtifactView["sources"] }) {
  return <div className="artifact-sources"><p className="eyebrow">FONTES DO MATERIAL</p>{sources.map((source, index) => <Link className="source-chip" href={`/app/materiais/${source.documentId}`} key={`${source.documentId}-${source.pageNumber}-${index}`}><FileText size={13} />{source.documentName}{source.pageNumber ? ` · p. ${source.pageNumber}` : ""}</Link>)}</div>;
}

export function StudyLibraryScreen() {
  const [artifacts, setArtifacts] = useState<StudyArtifactView[]>([]);
  const [artifactCursor, setArtifactCursor] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [courseCursor, setCourseCursor] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [artifactKind, setArtifactKind] = useState("SUMMARY");
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [materialCursor, setMaterialCursor] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);
  const { activeWorkspace, persona } = useSession();

  useEffect(() => {
    let live = true;
    const coursePath = persona === "TEACHER" && activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses?cursor=` : "/me/courses?cursor=";
    Promise.allSettled([
      api<PageResult<StudyArtifactView>>("/study/artifacts?cursor="),
      api<PageResult<CourseView>>(coursePath),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") { setArtifacts(results[0].value.items || []); setArtifactCursor(results[0].value.nextCursor); } else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") { setCourses(results[1].value.items || []); setCourseCursor(results[1].value.nextCursor); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, persona]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialCourseId = params.get("courseId");
    const initialDocumentId = params.get("documentId");
    const initialKind = params.get("kind")?.toUpperCase();
    if (initialCourseId) setCourseId(initialCourseId);
    if (initialDocumentId) setSelectedDocs([initialDocumentId]);
    if (initialKind && artifactLabels[initialKind]) setArtifactKind(initialKind);
    if (initialCourseId || initialDocumentId) setCreateOpen(true);
  }, []);

  const loadMore = async (kind: "artifacts" | "courses" | "materials") => {
    const cursor = kind === "artifacts" ? artifactCursor : kind === "courses" ? courseCursor : materialCursor;
    if (!cursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      if (kind === "artifacts") {
        const page = await api<PageResult<StudyArtifactView>>(`/study/artifacts?cursor=${encodeURIComponent(cursor)}`);
        setArtifacts((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setArtifactCursor(page.nextCursor);
      } else if (kind === "courses") {
        const path = persona === "TEACHER" && activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses?cursor=${encodeURIComponent(cursor)}` : `/me/courses?cursor=${encodeURIComponent(cursor)}`;
        const page = await api<PageResult<CourseView>>(path);
        setCourses((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setCourseCursor(page.nextCursor);
      } else if (kind === "materials" && courseId) {
        const page = await api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=${encodeURIComponent(cursor)}`);
        setMaterials((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setMaterialCursor(page.nextCursor);
      }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };

  useEffect(() => {
    if (!courseId) { setMaterials([]); setMaterialCursor(null); return; }
    let live = true;
    setMaterialsLoading(true);
    api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=`).then((result) => { if (live) { setMaterials(result.items || []); setMaterialCursor(result.nextCursor); } }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setMaterialsLoading(false); });
    return () => { live = false; };
  }, [courseId]);

  const readyDocuments = useMemo(() => materials.flatMap((material) => material.documents || []).filter((document) => ["READY", "COMPLETED"].includes(document.status.toUpperCase())), [materials]);
  const toggle = (id: string) => setSelectedDocs((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!courseId) return;
    setBusy(true); setError("");
    try { const response = await api<{ job: JobView }>("/study/artifacts", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: jsonBody({ kind: artifactKind, courseId, documentIds: selectedDocs.length ? selectedDocs : readyDocuments.map((doc) => doc.id) }) }); setJob(response.job); setCreateOpen(false); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <div className="page-stack"><PageTitle eyebrow="MATERIAIS DE ESTUDO" title="Meus estudos" description="Resumos, cartões e planos criados a partir de conteúdos que você pode acessar." actions={<Button type="button" onClick={() => setCreateOpen(true)}><Sparkles size={15} />Novo material</Button>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{job && <JobTracker job={job} onClose={() => setJob(null)} />}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Criar material de estudo" description="Escolha uma disciplina e use arquivos prontos para criar um resumo, cartões ou um plano." busy={busy}>
      <form className="conversation-create" onSubmit={(event) => void create(event)}><label className="field"><span>Disciplina</span><select className="input" value={courseId} onChange={(event) => { setCourseId(event.target.value); setSelectedDocs([]); }} required><option value="">Escolha uma disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{courseCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("courses")}>{pageBusy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}</label><label className="field"><span>O que vamos criar?</span><select className="input" value={artifactKind} onChange={(event) => setArtifactKind(event.target.value)}><option value="SUMMARY">Resumo</option><option value="FLASHCARDS">Cartões de estudo</option><option value="STUDY_PLAN">Plano de estudo</option><option value="REVIEW">Revisão</option><option value="SIMILAR_EXERCISES">Exercícios semelhantes</option></select></label>{courseId && materialCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("materials")}>{pageBusy ? "Carregando…" : "Carregar mais materiais"}</Button>}{courseId && (materialsLoading ? <LoadingBlock label="Buscando arquivos desta disciplina…" /> : <fieldset className="document-choices"><legend>Materiais prontos <small>sem seleção, usamos todos os disponíveis</small></legend>{readyDocuments.length ? readyDocuments.map((doc) => <label className="document-choice" key={doc.id}><input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggle(doc.id)} /><FileText size={15} /><span>{doc.name}</span></label>) : <p>Nenhum arquivo pronto nesta disciplina. Envie e processe um material antes de continuar.</p>}</fieldset>)}{courseId && materials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`more-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos de ${material.title}`}</Button></div>)}<Button type="submit" disabled={busy || !courseId || !readyDocuments.length}>{busy ? "Preparando…" : "Criar material"}<Sparkles size={15} /></Button></form>
    </Modal>
    <Panel title="Criados recentemente" detail={artifacts.length ? `${artifacts.length} materiais disponíveis` : undefined}>{loading ? <LoadingBlock label="Buscando seus materiais…" /> : artifacts.length ? <div className="artifact-list">{artifacts.map((artifact) => <Link className="artifact-row" href={`/app/estudo/${artifact.id}`} key={artifact.id}><span className="artifact-icon"><BookMarked size={18} /></span><span className="artifact-copy"><strong>{artifactLabel(artifact.kind)}</strong><small>{artifact.sources?.map((source) => source.documentName).join(" · ") || "Sem fontes associadas"}</small></span><span className="artifact-date">{artifact.createdAt ? new Date(artifact.createdAt).toLocaleDateString("pt-BR") : ""}</span><ArrowRight size={15} /></Link>)}</div> : <EmptyState title="Ainda não há materiais de estudo" detail="Envie um arquivo pronto para uma disciplina e crie seu primeiro resumo, plano ou conjunto de cartões." />}{artifactCursor && <Button type="button" variant="secondary" disabled={pageBusy} onClick={() => void loadMore("artifacts")}>{pageBusy ? "Carregando…" : "Carregar materiais anteriores"}</Button>}</Panel>
  </div>;
}

export function ArtifactScreen({ artifactId }: { artifactId: string }) {
  const [artifact, setArtifact] = useState<StudyArtifactView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { let live = true; api<{ artifact: StudyArtifactView }>(`/study/artifacts/${artifactId}`).then((result) => { if (live) setArtifact(result.artifact); }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [artifactId]);
  if (loading) return <LoadingBlock label="Abrindo seu material de estudo…" />;
  if (!artifact) return <div className="page-stack"><Notice tone="error" title="Material de estudo indisponível">{error}</Notice><Link className="text-link" href="/app/estudo"><ArrowLeft size={14} />Voltar aos estudos</Link></div>;

  const payload = artifact.payload || {};
  const kind = artifact.kind.toUpperCase();
  const title = String(payload.title || artifactLabel(kind));
  const cards = Array.isArray(payload.cards) ? payload.cards as Array<{ id?: string; question: string; answer: string }> : [];
  const goCard = (next: number) => { setCardIndex(next); setFlipped(false); };
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/estudo">Meus estudos</Link><span>/</span><span>{title}</span></div><PageTitle eyebrow={artifactLabel(kind).toUpperCase()} title={title} description="Conteúdo produzido com as fontes mostradas ao final." />
    {kind === "FLASHCARDS" ? cards.length ? <Panel title={`Cartão ${cardIndex + 1} de ${cards.length}`} detail="Vire o cartão para conferir a resposta; avance quando estiver pronto."><div className="flashcard" aria-live="polite"><span className="eyebrow">{flipped ? "RESPOSTA" : "PERGUNTA"}</span><p>{flipped ? cards[cardIndex]?.answer : cards[cardIndex]?.question}</p></div><div className="flashcard-controls"><Button type="button" variant="secondary" disabled={cardIndex === 0} onClick={() => goCard(Math.max(0, cardIndex - 1))}><ArrowLeft size={15} />Anterior</Button><Button type="button" variant="secondary" onClick={() => setFlipped((value) => !value)}><RotateCcw size={15} />{flipped ? "Ver pergunta" : "Mostrar resposta"}</Button><Button type="button" disabled={cardIndex === cards.length - 1} onClick={() => goCard(Math.min(cards.length - 1, cardIndex + 1))}>Próximo<ArrowRight size={15} /></Button></div></Panel> : <EmptyState title="Nenhum cartão neste conjunto" detail="O serviço não retornou cartões neste material." />
      : kind === "STUDY_PLAN" ? <Panel title="Seu plano de estudo" detail="Siga cada sessão no seu ritmo.">{Array.isArray(payload.weeks) ? <div className="study-weeks">{(payload.weeks as Array<{ label: string; sessions: Array<{ topic: string; task: string; durationMinutes?: number }> }>).map((week, index) => <section className="study-week" key={`${week.label}-${index}`}><div className="week-heading"><span>SEMANA {index + 1}</span><h3>{week.label}</h3></div><div className="study-session-list">{week.sessions?.map((session, i) => <div className="study-session" key={`${session.topic}-${i}`}><span className="session-dot" /><div><strong>{session.topic}</strong><p>{session.task}</p></div>{session.durationMinutes && <span className="duration-tag">{session.durationMinutes} min</span>}</div>)}</div></section>)}</div> : <EmptyState title="Plano sem sessões" detail="O serviço não retornou sessões para este plano." />}</Panel>
      : kind === "REVIEW" ? <Panel title={title} detail="Pontos para retomar a partir dos seus materiais.">{Array.isArray(payload.items) ? <div className="review-list">{(payload.items as Array<{ topic: string; summary: string }>).map((item, index) => <article key={`${item.topic}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.topic}</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.summary}</ReactMarkdown></div></article>)}</div> : <MarkdownPanel text={String(payload.summary || "")} />}</Panel>
      : kind === "SIMILAR_EXERCISES" ? <Panel title="Exercícios de prática" detail="Responda antes de revelar a orientação do exercício.">{Array.isArray(payload.items) ? <div className="similar-list">{(payload.items as Array<{ id: string; statement: string; options?: Array<{ id: string; text: string }>; explanation?: string; correctOptionId?: string }>).map((item, index) => <ExerciseDisclosure item={item} index={index} key={item.id} />)}</div> : <EmptyState title="Nenhum exercício retornado" detail="O serviço não gerou exercícios para este pedido." />}</Panel>
      : <Panel title={title} detail="Leia no seu ritmo e abra as referências quando precisar."><MarkdownPanel text={String(payload.summary || payload.explanation || payload.content || "")} /></Panel>}
    {artifact.sources?.length ? <Panel title="Fontes" detail="Cada referência aponta para o material original autorizado."><SourceList sources={artifact.sources} /></Panel> : <Notice tone="warning" title="Sem fontes associadas">Este material não retornou referências; confira o conteúdo original antes de confiar em uma afirmação.</Notice>}
  </div>;
}

function MarkdownPanel({ text }: { text: string }) {
  return text ? <div className="reader-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div> : <EmptyState title="Conteúdo indisponível" detail="O serviço não retornou texto para este material." />;
}

function ExerciseDisclosure({ item, index }: { item: { statement: string; options?: Array<{ id: string; text: string }>; explanation?: string; correctOptionId?: string }; index: number }) {
  const [show, setShow] = useState(false);
  return <article className="exercise-disclosure"><div className="question-editor-head"><strong>Exercício {index + 1}</strong><span className="tag tag-neutral">Prática</span></div><p>{item.statement}</p>{item.options?.length ? <ul className="question-options">{item.options.map((option, optionIndex) => <li className={show && option.id === item.correctOptionId ? "correct" : ""} key={option.id}><span className="option-dot">{String.fromCharCode(65 + optionIndex)}</span>{option.text}{show && option.id === item.correctOptionId && <Check size={14} />}</li>)}</ul> : null}{show && item.explanation && <p className="exercise-explanation">{item.explanation}</p>}<Button type="button" variant="secondary" onClick={() => setShow((value) => !value)}>{show ? "Ocultar orientação" : "Ver orientação"}</Button></article>;
}

type PracticeQuestion = { id: string; position: number; statement: string; options: Array<{ id: string; text: string }>; topicIds: string[] };
type PracticeTest = { id: string; title?: string; state?: string; questions?: PracticeQuestion[]; questionCount?: number; createdAt?: string };
type AttemptResult = { id: string; state: string; score?: number; feedback?: Array<{ topicId: string | null; topicTitle: string; correctCount: number; total: number; score: number }> };
const practiceStateLabels: Record<string, string> = { READY: "Pronto para fazer", DRAFT: "Rascunho", QUEUED: "Na fila de geração", RUNNING: "Preparando", FAILED: "Geração não concluída", COMPLETED: "Concluído" };
function practiceStateLabel(state?: string) { return state ? practiceStateLabels[state.toUpperCase()] || "Status atualizado" : "Pronto para fazer"; }

export function PracticeTestsScreen() {
  const { activeWorkspace, persona } = useSession();
  const [tests, setTests] = useState<PracticeTest[]>([]);
  const [testsCursor, setTestsCursor] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [coursesCursor, setCoursesCursor] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [materialsCursor, setMaterialsCursor] = useState<string | null>(null);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialCourseId = params.get("courseId");
    const initialDocumentId = params.get("documentId");
    if (initialCourseId) setCourseId(initialCourseId);
    if (initialDocumentId) setDocumentIds([initialDocumentId]);
    if (initialCourseId || initialDocumentId) setCreateOpen(true);
  }, []);
  useEffect(() => {
    let live = true;
    const coursePath = persona === "TEACHER" && activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses?cursor=` : "/me/courses?cursor=";
    Promise.allSettled([
      api<PageResult<PracticeTest>>("/practice-tests?cursor="),
      api<PageResult<CourseView>>(coursePath),
    ]).then((results) => { if (!live) return; if (results[0].status === "fulfilled") { setTests(results[0].value.items || []); setTestsCursor(results[0].value.nextCursor); } else setError(errorCopy(results[0].reason)); if (results[1].status === "fulfilled") { setCourses(results[1].value.items || []); setCoursesCursor(results[1].value.nextCursor); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, persona]);
  useEffect(() => { if (!courseId) { setMaterials([]); setMaterialsCursor(null); return; } let live = true; setMaterialsLoading(true); api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=`).then((result) => { if (live) { setMaterials(result.items || []); setMaterialsCursor(result.nextCursor); } }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setMaterialsLoading(false); }); return () => { live = false; }; }, [courseId]);
  const loadMore = async (kind: "tests" | "courses" | "materials") => {
    const cursor = kind === "tests" ? testsCursor : kind === "courses" ? coursesCursor : materialsCursor;
    if (!cursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      if (kind === "tests") { const page = await api<PageResult<PracticeTest>>(`/practice-tests?cursor=${encodeURIComponent(cursor)}`); setTests((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setTestsCursor(page.nextCursor); }
      else if (kind === "courses") { const path = persona === "TEACHER" && activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses?cursor=${encodeURIComponent(cursor)}` : `/me/courses?cursor=${encodeURIComponent(cursor)}`; const page = await api<PageResult<CourseView>>(path); setCourses((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setCoursesCursor(page.nextCursor); }
      else if (kind === "materials" && courseId) { const page = await api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=${encodeURIComponent(cursor)}`); setMaterials((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setMaterialsCursor(page.nextCursor); }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };
  const docs = useMemo(() => materials.flatMap((material) => material.documents || []).filter((doc) => ["READY", "COMPLETED"].includes(doc.status.toUpperCase())), [materials]);
  const toggle = (id: string) => setDocumentIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const generate = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!courseId || !docs.length) return; const selected = documentIds.length ? documentIds : docs.map((doc) => doc.id); setBusy(true); setError(""); try { const response = await api<{ job: JobView }>("/study/artifacts", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: jsonBody({ kind: "PRACTICE_TEST", courseId, documentIds: selected }) }); setJob(response.job); setCreateOpen(false); } catch (caught) { setError(errorCopy(caught)); } finally { setBusy(false); } };
  return <div className="page-stack"><PageTitle eyebrow="PRÁTICA SEM PRESSÃO" title="Simulados" description="Treine com questões geradas a partir dos materiais disponíveis. Respostas e explicações aparecem depois da entrega." actions={<Button type="button" onClick={() => setCreateOpen(true)}><Sparkles size={15} />Novo simulado</Button>} />{error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{job && <JobTracker job={job} onClose={() => setJob(null)} />}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Criar simulado" description="Escolha a disciplina e os arquivos prontos que vão servir de base às questões." busy={busy}>
      <form className="conversation-create" onSubmit={(event) => void generate(event)}><label className="field"><span>Disciplina</span><select className="input" value={courseId} onChange={(event) => { setCourseId(event.target.value); setDocumentIds([]); }} required><option value="">Escolha uma disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>{coursesCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("courses")}>{pageBusy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}</label>{courseId && materialsCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMore("materials")}>{pageBusy ? "Carregando…" : "Carregar mais materiais"}</Button>}{courseId && (materialsLoading ? <LoadingBlock label="Buscando arquivos desta disciplina…" /> : <fieldset className="document-choices"><legend>Materiais prontos <small>sem seleção, usamos todos os disponíveis</small></legend>{docs.length ? docs.map((doc) => <label className="document-choice" key={doc.id}><input type="checkbox" checked={documentIds.includes(doc.id)} onChange={() => toggle(doc.id)} /><FileText size={15} /><span>{doc.name}</span></label>) : <p>Nenhum arquivo pronto nesta disciplina. Envie e processe um material antes de continuar.</p>}</fieldset>)}{courseId && materials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`more-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos de ${material.title}`}</Button></div>)}<Button type="submit" disabled={busy || !courseId || docs.length === 0}>{busy ? "Preparando simulado…" : "Gerar simulado"}<Sparkles size={15} /></Button></form>
    </Modal>
    <Panel title="Seus simulados" detail={tests.length ? `${tests.length} simulados ${testsCursor ? "carregados" : "disponíveis"}` : undefined}>{loading ? <LoadingBlock label="Carregando simulados…" /> : tests.length ? <div className="artifact-list">{tests.map((test) => <Link className="artifact-row" href={`/app/simulados/${test.id}`} key={test.id}><span className="artifact-icon sage"><GraduationCap size={18} /></span><span className="artifact-copy"><strong>{test.title || "Simulado"}</strong><small>{questionCountLabel(test.questionCount ?? test.questions?.length)} · {practiceStateLabel(test.state)}</small></span><span className="tag tag-neutral">Privado</span><ArrowRight size={15} /></Link>)}</div> : <EmptyState title="Ainda sem simulados" detail="Envie um material para uma disciplina e gere um simulado com base no conteúdo." />}{testsCursor && <Button type="button" variant="secondary" disabled={pageBusy} onClick={() => void loadMore("tests")}>{pageBusy ? "Carregando…" : "Carregar mais simulados"}</Button>}</Panel>
  </div>;
}

export function PracticeTestScreen({ testId }: { testId: string }) {
  const [test, setTest] = useState<PracticeTest | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<string[]>([]);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; api<{ practiceTest: PracticeTest }>(`/practice-tests/${testId}`).then((response) => { if (live) setTest(response.practiceTest); }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [testId]);

  const start = async () => { setBusy(true); setError(""); try { const response = await api<{ attempt: { id: string; questions?: PracticeQuestion[] } }>(`/practice-tests/${testId}/attempts`, { method: "POST", body: "{}" }); setAttemptId(response.attempt.id); if (response.attempt.questions?.length) setTest((current) => current ? { ...current, questions: response.attempt.questions } : current); } catch (caught) { setError(errorCopy(caught)); } finally { setBusy(false); } };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!attemptId) return; const missing = test?.questions?.find((question) => !answers[question.id]); if (missing) { setError("Responda todas as questões antes de entregar."); window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(missing.id)}"]`)?.focus()); return; } setBusy(true); setError(""); const payload = { answers: Object.entries(answers).filter(([, optionId]) => optionId).map(([questionId, optionId]) => ({ questionId, optionId })) }; try { const response = await api<{ attempt: AttemptResult }>(`/practice-attempts/${attemptId}/submission`, { method: "POST", body: jsonBody(payload) }); setResult(response.attempt); } catch (caught) { setError(errorCopy(caught)); } finally { setBusy(false); } };
  const toggleMarked = (id: string) => setMarked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  if (loading) return <LoadingBlock label="Abrindo simulado…" />;
  if (!test) return <div className="page-stack"><Notice tone="error" title="Simulado indisponível">{error}</Notice><Link className="text-link" href="/app/simulados"><ArrowLeft size={14} />Voltar aos simulados</Link></div>;
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/simulados">Simulados</Link><span>/</span><span>{test.title || "Simulado"}</span></div><PageTitle eyebrow="SIMULADO PRIVADO" title={test.title || "Simulado"} description="Durante a prova, as respostas permanecem ocultas. Você verá os resultados depois de entregar." />{error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}
    {!attemptId ? <Panel title="Antes de começar" detail={`${test.questionCount ?? test.questions?.length ?? 0} questões · sem limite de tempo configurado`}><p className="practice-promise"><LockKeyhole size={16} />Responda todas as questões para entregar. Depois, você verá sua pontuação e os comentários por tópico.</p><Button type="button" onClick={() => void start()} disabled={busy}>{busy ? "Preparando…" : "Começar simulado"}<ArrowRight size={15} /></Button></Panel> : result ? <Panel title="Resultado" detail="Revise os tópicos indicados para planejar seu próximo passo."><div className="result-score"><span>{result.score ?? "—"}</span><strong>Pontuação da tentativa</strong></div>{result.feedback?.length ? <div className="topic-feedback">{result.feedback.map((item, index) => <article key={`${item.topicId || "general"}-${index}`}><h3>{item.topicTitle}</h3><span className="tag tag-neutral">{item.correctCount} de {item.total} questões</span><p>Pontuação: {item.score}</p></article>)}</div> : <Notice tone="info" title="Entrega registrada">O serviço não retornou comentários por tópico para esta tentativa.</Notice>}<Link className="button button-secondary" href="/app/estudo">Criar material para revisar<ArrowRight size={14} /></Link></Panel> : <form className="practice-form" onSubmit={(event) => void submit(event)}><div className="practice-toolbar"><span>{Object.keys(answers).length} respondidas de {test.questions?.length || 0}</span><span>{marked.length} para revisar</span><span>Respostas ocultas</span></div>{[...(test.questions || [])].sort((a, b) => a.position - b.position).map((question, index) => <section className="practice-question" key={question.id}><div className="practice-question-title"><span className="question-number">{String(index + 1).padStart(2, "0")}</span><p>{question.statement}</p><label className="mark-review"><input type="checkbox" checked={marked.includes(question.id)} onChange={() => toggleMarked(question.id)} />Marcar</label></div><fieldset className="practice-options"><legend className="sr-only">Escolha uma resposta</legend>{question.options.map((option, optionIndex) => <label className={answers[question.id] === option.id ? "practice-option selected" : "practice-option"} key={option.id}><input type="radio" name={question.id} checked={answers[question.id] === option.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} /><span className="option-dot">{String.fromCharCode(65 + optionIndex)}</span>{option.text}</label>)}</fieldset></section>)}<div className="practice-submit"><span>Você poderá revisar seus resultados após entregar.</span><Button type="submit" disabled={busy}>{busy ? "Entregando…" : "Entregar simulado"}<Check size={15} /></Button></div></form>}
  </div>;
}
