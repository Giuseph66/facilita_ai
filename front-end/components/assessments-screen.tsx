"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorCopy, jsonBody, newIdempotencyKey } from "@/lib/api";
import { assessmentQuestionTypeLabel, assessmentStateLabel, questionCountLabel } from "@/lib/display-labels";
import type { AssessmentQuestionView, AssessmentView, CourseView, JobView, MaterialView, PageResult } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel, VisibilityTag } from "./ui";
import { JobTracker } from "./job-tracker";
import { ArrowDown, ArrowRight, ArrowUp, Copy, Download, FileText, LockKeyhole, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";
import { ConfirmModal, Modal } from "./modal";

type Option = { id: string; text: string };
type EditableQuestion = AssessmentQuestionView & { options: Option[] };
type AssessmentExportView = {
  id: string;
  assessmentId: string;
  revision: number;
  format: "PDF" | "PRINT" | string;
  variant: "QUESTIONS" | "ANSWER_KEY" | string;
  status: string;
  expiresAt?: string | null;
  downloadUrl?: string | null;
};
type PendingConfirmation = { title: string; description: string; confirmLabel: string; variant?: "default" | "danger"; operation: () => Promise<void> };

function optionId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newIdempotencyKey(); }
function blankQuestion(): EditableQuestion {
  const first = optionId();
  return { type: "MULTIPLE_CHOICE", statement: "", options: [{ id: first, text: "" }, { id: optionId(), text: "" }], difficulty: "EASY", points: 1, answer: {} };
}
function assessmentOf(value: AssessmentView | { assessment: AssessmentView }): AssessmentView {
  return "assessment" in value ? value.assessment : value;
}
export function AssessmentsScreen() {
  const router = useRouter();
  const { activeWorkspace, persona } = useSession();
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [coursesCursor, setCoursesCursor] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Array<AssessmentView & { courseTitle?: string }>>([]);
  const [assessmentCursors, setAssessmentCursors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!activeWorkspace || persona !== "TEACHER") { setLoading(false); return; }
    let live = true; setLoading(true); setError("");
    api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=`).then(async (result) => {
      if (!live) return;
      const nextCourses = result.items || []; setCourses(nextCourses); setCoursesCursor(result.nextCursor);
      const courseResults = await Promise.allSettled(nextCourses.map((course) => api<PageResult<AssessmentView>>(`/courses/${course.id}/assessments?cursor=`)));
      if (!live) return;
      const next = courseResults.flatMap((item, index) => item.status === "fulfilled" ? item.value.items.map((assessment) => ({ ...assessment, courseTitle: nextCourses[index].title })) : []);
      setAssessmentCursors(Object.fromEntries(courseResults.map((item, index) => [nextCourses[index].id, item.status === "fulfilled" ? item.value.nextCursor : null])));
      setAssessments(next);
      if (next.length === 0 && courseResults.some((item) => item.status === "rejected")) setError("Não foi possível carregar uma ou mais listas de avaliação.");
    }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, persona, reloadKey]);

  const loadMoreCourses = async () => {
    if (!activeWorkspace || !coursesCursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      const page = await api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=${encodeURIComponent(coursesCursor)}`);
      const nextCourses = page.items || [];
      setCourses((current) => Array.from(new Map([...current, ...nextCourses].map((course) => [course.id, course])).values()));
      setCoursesCursor(page.nextCursor);
      const courseResults = await Promise.allSettled(nextCourses.map((course) => api<PageResult<AssessmentView>>(`/courses/${course.id}/assessments?cursor=`)));
      const additions = courseResults.flatMap((item, index) => item.status === "fulfilled" ? item.value.items.map((assessment) => ({ ...assessment, courseTitle: nextCourses[index].title })) : []);
      setAssessments((current) => Array.from(new Map([...current, ...additions].map((assessment) => [assessment.id, assessment])).values()));
      setAssessmentCursors((current) => ({ ...current, ...Object.fromEntries(courseResults.map((item, index) => [nextCourses[index].id, item.status === "fulfilled" ? item.value.nextCursor : null])) }));
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };

  const loadMoreAssessments = async (course: CourseView) => {
    const cursor = assessmentCursors[course.id];
    if (!cursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      const page = await api<PageResult<AssessmentView>>(`/courses/${course.id}/assessments?cursor=${encodeURIComponent(cursor)}`);
      const additions = page.items.map((assessment) => ({ ...assessment, courseTitle: course.title }));
      setAssessments((current) => Array.from(new Map([...current, ...additions].map((assessment) => [assessment.id, assessment])).values()));
      setAssessmentCursors((current) => ({ ...current, [course.id]: page.nextCursor }));
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };

  const createAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const courseId = String(form.get("courseId")); setBusy(true); setError("");
    try { const created = assessmentOf(await api<AssessmentView | { assessment: AssessmentView }>(`/courses/${courseId}/assessments`, { method: "POST", body: jsonBody({ title: form.get("title"), kind: form.get("kind") }) })); formElement.reset(); setShowCreate(false); if (created?.id) router.push(`/app/avaliacoes/${created.id}`); else setReloadKey((value) => value + 1); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  if (persona !== "TEACHER") return <div className="page-stack"><PageTitle eyebrow="ESPAÇO DOCENTE" title="Avaliações" description="Avaliações e gabaritos ficam privados para quem os criou." /><Notice tone="info" title="Esta área é privada">Use o seletor de contexto para abrir sua experiência docente, se ela estiver habilitada.</Notice></div>;
  return <div className="page-stack"><PageTitle eyebrow="CONTEÚDO DOCENTE PRIVADO" title="Avaliações" description="Rascunhos, questões e gabaritos ficam privados para você em todas as etapas." actions={<Button onClick={() => { setError(""); setShowCreate(true); }}><Plus size={15} />Nova avaliação</Button>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}
    <Panel title="Suas avaliações" detail={assessments.length ? `${assessments.length} ${assessments.length === 1 ? "avaliação carregada" : "avaliações carregadas"}` : undefined}>{loading ? <LoadingBlock label="Carregando avaliações…" /> : assessments.length ? <div className="resource-list">{assessments.map((assessment) => <Link className="resource-row" href={`/app/avaliacoes/${assessment.id}`} key={assessment.id}><span className="resource-icon sand"><FileText size={18} /></span><span className="resource-main"><strong>{assessment.title}</strong><small>{assessment.courseTitle || "Disciplina"} · {assessmentStateLabel(assessment.state)} · {questionCountLabel(assessment.questionCount ?? assessment.questions?.length)}</small></span><VisibilityTag>Somente você</VisibilityTag><ArrowRight size={15} /></Link>)}</div> : <EmptyState title="Nenhum rascunho ainda" detail="Crie um rascunho manual para adicionar questões ou comece com uma geração dos seus materiais." action="Criar avaliação" onAction={() => { setError(""); setShowCreate(true); }} />}{courses.filter((course) => assessmentCursors[course.id]).map((course) => <Button key={course.id} type="button" variant="secondary" disabled={pageBusy} onClick={() => void loadMoreAssessments(course)}>{pageBusy ? "Carregando…" : `Carregar mais avaliações · ${course.title}`}</Button>)}</Panel>
    <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Criar avaliação" description="Comece com um rascunho privado, sem qualquer publicação para alunos." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createAssessment(event)}><label className="field"><span>Disciplina</span><select className="input" name="courseId" required defaultValue=""><option value="" disabled>Escolha uma disciplina</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label>{coursesCursor && <Button type="button" variant="ghost" disabled={pageBusy} onClick={() => void loadMoreCourses()}>{pageBusy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}<label className="field"><span>Título</span><input className="input" name="title" required placeholder="Ex.: Avaliação do módulo 1" /></label><label className="field"><span>Formato</span><select className="input" name="kind"><option value="QUIZ">Questionário</option><option value="EXAM">Prova</option><option value="ASSIGNMENT">Atividade</option></select></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowCreate(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar rascunho"}<ArrowRight size={14} /></Button></div></form>
    </Modal>
  </div>;
}

export function AssessmentScreen({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentView | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [materialsCursor, setMaterialsCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState<EditableQuestion | null>(null);
  const [newQuestionDraft, setNewQuestionDraft] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [questionErrorField, setQuestionErrorField] = useState<"statement" | "options" | null>(null);
  const [showCopyForm, setShowCopyForm] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  const askConfirmation = (pending: PendingConfirmation) => { setConfirmationError(""); setConfirmation(pending); };
  const confirmPendingAction = async () => {
    if (!confirmation) return;
    setBusy(true); setError(""); setConfirmationError("");
    try { await confirmation.operation(); setConfirmation(null); }
    catch (caught) { const copy = errorCopy(caught); setError(copy); setConfirmationError(copy); }
    finally { setBusy(false); }
  };
  const openQuestionEditor = (index?: number) => {
    setError("");
    const isNew = index === undefined;
    const currentIndex = index ?? questions.length;
    setEditingQuestionIndex(currentIndex);
    setNewQuestionDraft(isNew);
    setQuestionDraft(isNew ? blankQuestion() : { ...questions[currentIndex], options: [...questions[currentIndex].options], answer: { ...questions[currentIndex].answer } });
    setQuestionError(""); setQuestionErrorField(null);
  };
  const updateQuestionDraft = (updated: EditableQuestion) => { setQuestionDraft(updated); setQuestionError(""); setQuestionErrorField(null); };
  const commitQuestionDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!questionDraft || editingQuestionIndex === null) return;
    if (!questionDraft.statement.trim()) {
      setQuestionError("Informe o enunciado da questão."); setQuestionErrorField("statement");
      window.requestAnimationFrame(() => document.getElementById(`question-statement-${editingQuestionIndex}`)?.focus()); return;
    }
    if (questionDraft.type === "MULTIPLE_CHOICE" && (questionDraft.options.length < 2 || questionDraft.options.some((option) => !option.text.trim()))) {
      setQuestionError("Preencha pelo menos duas alternativas."); setQuestionErrorField("options");
      const emptyIndex = questionDraft.options.findIndex((option) => !option.text.trim());
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#question-option-${editingQuestionIndex}-${Math.max(emptyIndex, 0)}`)?.focus()); return;
    }
    if (questionDraft.type === "MULTIPLE_CHOICE" && !questionDraft.answer?.correctOptionId) {
      setQuestionError("Marque uma alternativa como gabarito."); setQuestionErrorField("options");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[name="correct-${editingQuestionIndex}"]`)?.focus()); return;
    }
    setQuestions((current) => newQuestionDraft ? [...current, questionDraft] : current.map((item, index) => index === editingQuestionIndex ? questionDraft : item));
    setEditingQuestionIndex(null); setQuestionDraft(null); setQuestionError(""); setQuestionErrorField(null); setError("");
  };
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    api<AssessmentView | { assessment: AssessmentView }>(`/assessments/${assessmentId}`).then(async (value) => {
      if (!live) return;
      const next = assessmentOf(value); setAssessment(next);
      setQuestions((next.questions || []).map((question) => ({ ...question, options: question.options || [], answer: question.answer || {} })));
      if (next.courseId) {
        const materialPage = await api<PageResult<MaterialView>>(`/courses/${next.courseId}/materials?cursor=`).catch(() => ({ items: [], nextCursor: null }));
        if (live) { setMaterials(materialPage.items || []); setMaterialsCursor(materialPage.nextCursor); }
      }
    }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [assessmentId, reloadKey]);

  const editable = assessment?.state === "DRAFT";
  const readyDocuments = useMemo(() => materials.flatMap((material) => (material.documents || []).filter((document) => ["READY", "COMPLETED"].includes(document.status.toUpperCase())).map((document) => ({ material, document }))), [materials]);

  const loadMoreMaterials = async () => {
    if (!assessment?.courseId || !materialsCursor || busy) return;
    setBusy(true); setError("");
    try {
      const page = await api<PageResult<MaterialView>>(`/courses/${assessment.courseId}/materials?cursor=${encodeURIComponent(materialsCursor)}`);
      setMaterials((current) => Array.from(new Map([...current, ...page.items].map((material) => [material.id, material])).values()));
      setMaterialsCursor(page.nextCursor);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const saveQuestions = async () => {
    if (!assessment || !editable) return;
    if (!questions.length) { setError("Adicione pelo menos uma questão antes de salvar."); return; }
    const invalidIndex = questions.findIndex((question) => !question.statement.trim()
      || (question.type === "MULTIPLE_CHOICE" && (question.options.length < 2 || question.options.some((option) => !option.text.trim()) || !question.answer?.correctOptionId)));
    if (invalidIndex >= 0) {
      const question = questions[invalidIndex];
      const field = !question.statement.trim() ? "statement" : "options";
      openQuestionEditor(invalidIndex);
      setQuestionError(field === "statement" ? "Informe o enunciado da questão." : "Revise as alternativas e marque uma como gabarito.");
      setQuestionErrorField(field);
      setError(`Revise a questão ${invalidIndex + 1} antes de salvar.`);
      window.setTimeout(() => document.getElementById(field === "statement" ? `question-statement-${invalidIndex}` : `question-option-${invalidIndex}-0`)?.focus(), 0);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await api<{ assessment: AssessmentView }>(`/assessments/${assessment.id}/questions`, { method: "PUT", body: jsonBody({ revision: assessment.revision, questions: questions.map(({ type, statement, options, difficulty, points, answer }) => ({ type, statement: statement || "", options: type === "MULTIPLE_CHOICE" ? options.map((option) => ({ id: option.id, text: option.text })) : [], difficulty: difficulty || "EASY", points: points ?? 1, answer: type === "MULTIPLE_CHOICE" ? { correctOptionId: answer?.correctOptionId } : { expectedAnswer: answer?.expectedAnswer, rubric: answer?.rubric } })) }) });
      const saved = response.assessment; setAssessment(saved); setQuestions((saved.questions || []).map((question) => ({ ...question, options: question.options || [], answer: question.answer || {} }))); setNotice("Questões salvas na revisão atual.");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const transition = async (state: "READY" | "PUBLISHED" | "ARCHIVED") => {
    if (!assessment) return;
    const title = state === "PUBLISHED" ? "Finalizar avaliação?" : state === "READY" ? "Marcar avaliação como pronta?" : "Arquivar avaliação?";
    const description = state === "PUBLISHED" ? "A edição será bloqueada. A avaliação e o gabarito continuarão privados, sem acesso para alunos." : state === "READY" ? "O rascunho ficará pronto para a etapa final e continuará privado." : "A avaliação será arquivada e não poderá mais ser editada.";
    askConfirmation({ title, description, confirmLabel: state === "PUBLISHED" ? "Finalizar e manter privada" : state === "READY" ? "Marcar como pronta" : "Arquivar avaliação", variant: state === "ARCHIVED" ? "danger" : "default", operation: async () => { const response = await api<AssessmentView | { assessment: AssessmentView }>(`/assessments/${assessment.id}`, { method: "PATCH", body: jsonBody({ revision: assessment.revision, state }) }); const updated = assessmentOf(response); setAssessment(updated); setQuestions((updated.questions || []).map((question) => ({ ...question, options: question.options || [], answer: question.answer || {} }))); setNotice(state === "PUBLISHED" ? "Avaliação finalizada e mantida privada." : `Estado atualizado: ${assessmentStateLabel(state)}.`); } });
  };

  const generate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!assessment) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const documentIds = form.getAll("documentId").map(String); const totalQuestions = Number(form.get("totalQuestions"));
    const distribution = { MULTIPLE_CHOICE: Number(form.get("multipleChoice")), SHORT_ANSWER: Number(form.get("shortAnswer")), ESSAY: Number(form.get("essay")) };
    if (!documentIds.length) { const copy = "Selecione ao menos um arquivo pronto para gerar questões."; setGenerationError(copy); formElement.querySelector<HTMLInputElement>('input[name="documentId"]')?.focus(); return; }
    if (Object.values(distribution).reduce((sum, value) => sum + value, 0) !== totalQuestions) { const copy = "A distribuição precisa somar o total escolhido."; setGenerationError(copy); formElement.querySelector<HTMLInputElement>('[name="totalQuestions"]')?.focus(); return; }
    setBusy(true); setError(""); setNotice("");
    setGenerationError("");
    try { const response = await api<{ job: JobView }>(`/assessments/${assessment.id}/generations`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: jsonBody({ revision: assessment.revision, totalQuestions, difficulty: form.get("difficulty"), documentIds, distribution, instructions: form.get("instructions") || undefined }) }); setJob(response.job); setShowGenerator(false); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const copyAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!assessment) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const variantLabel = String(form.get("variantLabel") || "").trim(); setBusy(true); setError("");
    try { const response = await api<AssessmentView | { assessment: AssessmentView }>(`/assessments/${assessment.id}/copies`, { method: "POST", body: jsonBody({ revision: assessment.revision, title: variantLabel ? `${assessment.title} · ${variantLabel}` : `${assessment.title} — cópia`, ...(variantLabel ? { variantLabel } : {}) }) }); const copy = assessmentOf(response); formElement.reset(); setShowCopyForm(false); if (copy?.id) router.push(`/app/avaliacoes/${copy.id}`); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const exportAssessment = async (variant: "QUESTIONS" | "ANSWER_KEY", format: "PDF" | "PRINT") => {
    if (!assessment || !["READY", "PUBLISHED"].includes(assessment.state)) return; setBusy(true); setError(""); setNotice("");
    try { const response = await api<{ job: JobView }>(`/assessments/${assessment.id}/exports`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: jsonBody({ revision: assessment.revision, format, variant }) }); setJob(response.job); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const reorderQuestion = (index: number, direction: -1 | 1) => setQuestions((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });

  if (loading) return <LoadingBlock label="Abrindo avaliação privada…" />;
  if (!assessment) return <div className="page-stack"><Notice tone="error" title="Avaliação indisponível">{error}</Notice><Link className="text-link" href="/app/avaliacoes"><ArrowRight size={14} />Voltar às avaliações</Link></div>;
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/avaliacoes">Avaliações</Link><span>/</span><span>{assessment.title}</span></div><PageTitle eyebrow={`AVALIAÇÃO · REVISÃO ${assessment.revision}`} title={assessment.title} description={`${assessmentStateLabel(assessment.state)} · edição concorrente protegida pela revisão ${assessment.revision}.`} actions={<VisibilityTag>Privada em todas as etapas</VisibilityTag>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Alteração concluída">{notice}</Notice>}{job && <JobTracker job={job} onClose={() => setJob(null)} onUpdate={(next) => { setJob(next); if (["COMPLETED", "SUCCEEDED"].includes(next.state.toUpperCase())) refresh(); }} />}
    {assessment.state === "PUBLISHED" && <Notice tone="success" title="Avaliação finalizada e privada">Os alunos não acessam esta avaliação nem o gabarito. Para mudar o conteúdo, crie uma cópia privada.</Notice>}
    {assessment.state === "ARCHIVED" && <Notice tone="warning" title="Avaliação arquivada">Este conteúdo não pode mais ser editado.</Notice>}
    {editable && <Panel title="Questões" detail={`${questionCountLabel(questions.length)} na revisão. Edite cada questão em uma janela e salve a lista quando terminar.`}>
      <div className="question-list">{questions.map((question, index) => <article className="question-editor" key={question.id || `draft-${index}`}><div className="question-editor-head"><strong>Questão {String(index + 1).padStart(2, "0")}</strong><span className="tag tag-neutral">{assessmentQuestionTypeLabel(question.type)}</span><Button type="button" variant="ghost" disabled={busy || questions.length <= 1 || index === 0} onClick={() => reorderQuestion(index, -1)} aria-label={`Mover questão ${index + 1} para cima`}><ArrowUp size={14} />Subir</Button><Button type="button" variant="ghost" disabled={busy || questions.length <= 1 || index === questions.length - 1} onClick={() => reorderQuestion(index, 1)} aria-label={`Mover questão ${index + 1} para baixo`}><ArrowDown size={14} />Descer</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => openQuestionEditor(index)}>Editar</Button><Button type="button" variant="danger" disabled={busy} onClick={() => askConfirmation({ title: "Excluir questão?", description: `A questão ${index + 1} será removida da revisão atual.`, confirmLabel: "Excluir questão", variant: "danger", operation: async () => { setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index)); setNotice("Questão removida da revisão atual."); } })}><Trash2 size={14} />Excluir</Button></div><p>{question.statement || "Enunciado não preenchido."}</p></article>)}</div>
      <div className="editor-toolbar"><Button type="button" variant="secondary" disabled={busy} onClick={() => openQuestionEditor()}><Plus size={15} />Adicionar questão</Button><Button type="button" disabled={busy} onClick={() => void saveQuestions()}><Save size={15} />Salvar questões</Button></div>
    </Panel>}
    {!editable && <Panel title="Questões da revisão" detail={`${questionCountLabel(assessment.questionCount ?? assessment.questions?.length ?? questions.length)} · gabarito privado`}><ReadOnlyQuestions questions={questions} /></Panel>}
    {editable && <Panel title="Geração assistida" detail="Use arquivos prontos do curso. O resultado chega como rascunho para sua revisão."><Button type="button" variant="secondary" onClick={() => { setError(""); setGenerationError(""); setShowGenerator(true); }}><Sparkles size={15} />Configurar geração</Button></Panel>}
    <div className="assessment-actions"><Panel title="Revisão e estado" detail="Finalizar bloqueia a edição e mantém a avaliação privada."><div className="assessment-state"><span className="tag tag-neutral">{assessmentStateLabel(assessment.state)}</span><small>Versão {assessment.revision}</small></div>{assessment.state === "DRAFT" && <Button type="button" variant="secondary" disabled={busy || !questions.length} onClick={() => void transition("READY")}>Marcar pronta para finalizar<ArrowRight size={14} /></Button>}{assessment.state === "READY" && <Button type="button" disabled={busy} onClick={() => void transition("PUBLISHED")}>Finalizar avaliação · manter privada<LockKeyhole size={14} /></Button>}</Panel>
      <Panel title="Exportar ou copiar" detail="A prova e o gabarito são arquivos separados.">{["READY", "PUBLISHED"].includes(assessment.state) ? <div className="export-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => void exportAssessment("QUESTIONS", "PDF")}><Download size={15} />Prova · PDF</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void exportAssessment("QUESTIONS", "PRINT")}><Download size={15} />Prova · formato para impressão</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void exportAssessment("ANSWER_KEY", "PDF")}><Download size={15} />Gabarito separado · PDF</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void exportAssessment("ANSWER_KEY", "PRINT")}><Download size={15} />Gabarito separado · formato para impressão</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setError(""); setShowCopyForm(true); }}><Copy size={14} />Criar cópia para editar</Button></div> : <p className="inline-help">Os arquivos ficam disponíveis quando a avaliação estiver pronta ou finalizada. Ela continuará privada.</p>}</Panel></div>
    {editable && <Modal open={editingQuestionIndex !== null} onClose={() => { setEditingQuestionIndex(null); setQuestionDraft(null); setQuestionError(""); setQuestionErrorField(null); }} title={newQuestionDraft ? "Adicionar questão" : `Editar questão ${editingQuestionIndex === null ? "" : editingQuestionIndex + 1}`} description="Edite o enunciado, o formato e as respostas antes de salvar a revisão." busy={busy}>
      {questionDraft && editingQuestionIndex !== null && <form className="form-grid" noValidate onSubmit={commitQuestionDraft}><QuestionEditor question={questionDraft} index={editingQuestionIndex} disabled={busy} errorField={questionErrorField} errorMessage={questionError} onChange={updateQuestionDraft} /><div className="form-actions"><Button type="button" variant="secondary" onClick={() => { setEditingQuestionIndex(null); setQuestionDraft(null); setQuestionError(""); setQuestionErrorField(null); }} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{newQuestionDraft ? "Adicionar questão" : "Concluir edição"}</Button></div></form>}
    </Modal>}
    {editable && <Modal open={showGenerator} onClose={() => setShowGenerator(false)} title="Gerar questões a partir de materiais" description="O resultado chega como rascunho para sua revisão e continua privado." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="generation-form form-grid" onSubmit={(event) => void generate(event)}>{materialsCursor && <Button type="button" variant="ghost" disabled={busy} onClick={() => void loadMoreMaterials()}>{busy ? "Carregando…" : "Carregar mais materiais"}</Button>}<fieldset className="document-choices full-span" aria-describedby={generationError ? "generation-error" : undefined}><legend>Arquivos prontos <small>selecione um ou mais</small></legend>{readyDocuments.length ? readyDocuments.map(({ material, document }) => <label className="document-choice" key={document.id}><input type="checkbox" name="documentId" value={document.id} aria-invalid={Boolean(generationError)} /><FileText size={15} /><span>{material.title} · {document.name}</span></label>) : <p>Não há arquivos prontos nesta disciplina.</p>}{generationError && <p id="generation-error" className="inline-error" role="alert">{generationError}</p>}</fieldset>{materials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging full-span" key={`more-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos de ${material.title}`}</Button></div>)}<label className="field"><span>Total de questões</span><input className="input" name="totalQuestions" type="number" min="1" required defaultValue="10" aria-invalid={generationError.includes("distribuição") || undefined} aria-describedby={generationError.includes("distribuição") ? "distribution-error" : undefined} /></label><label className="field"><span>Dificuldade</span><select className="input" name="difficulty" defaultValue="MEDIUM"><option value="MIXED">Variada</option><option value="EASY">Introdutória</option><option value="MEDIUM">Intermediária</option><option value="HARD">Avançada</option></select></label><label className="field"><span>Múltipla escolha</span><input className="input" name="multipleChoice" type="number" min="0" defaultValue="10" aria-invalid={generationError.includes("distribuição") || undefined} aria-describedby={generationError.includes("distribuição") ? "distribution-error" : undefined} /></label><label className="field"><span>Resposta curta</span><input className="input" name="shortAnswer" type="number" min="0" defaultValue="0" aria-invalid={generationError.includes("distribuição") || undefined} aria-describedby={generationError.includes("distribuição") ? "distribution-error" : undefined} /></label><label className="field"><span>Discursiva</span><input className="input" name="essay" type="number" min="0" defaultValue="0" aria-invalid={generationError.includes("distribuição") || undefined} aria-describedby={generationError.includes("distribuição") ? "distribution-error" : undefined} /></label>{generationError.includes("distribuição") && <p id="distribution-error" className="inline-error full-span" role="alert">{generationError}</p>}<label className="field full-span"><span>Instruções <small>(opcional)</small></span><textarea className="input" name="instructions" rows={3} placeholder="Oriente a abordagem da geração." /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowGenerator(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !readyDocuments.length}>{busy ? "Solicitando…" : "Gerar rascunho"}<Sparkles size={14} /></Button></div></form>
    </Modal>}
    {showCopyForm && <Modal open={showCopyForm} onClose={() => setShowCopyForm(false)} title="Criar cópia da avaliação" description="Uma nova versão privada será aberta para edição." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void copyAssessment(event)}><label className="field"><span>Nome da nova versão <small>(opcional)</small></span><input className="input" name="variantLabel" placeholder="Ex.: Versão B" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowCopyForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}><Copy size={14} />Criar cópia para editar</Button></div></form>
    </Modal>}
    <ConfirmModal open={Boolean(confirmation)} onClose={() => { setConfirmation(null); setConfirmationError(""); }} title={confirmation?.title || "Confirmar ação"} description={`${confirmation?.description || ""}${confirmationError ? `\n\n${confirmationError}` : ""}`} confirmLabel={confirmation?.confirmLabel} variant={confirmation?.variant} onConfirm={confirmPendingAction} busy={busy}>
      {confirmationError && <p className="inline-error" role="alert">{confirmationError}</p>}
    </ConfirmModal>
  </div>;
}

export function AssessmentExportScreen({ exportId }: { exportId: string }) {
  const [exportView, setExportView] = useState<AssessmentExportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const status = exportView?.status.toUpperCase() || "";
  const terminal = ["READY", "FAILED", "EXPIRED"].includes(status);

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await api<{ export: AssessmentExportView }>(`/exports/${exportId}`);
        if (!live) return;
        setExportView(response.export); setError(""); setLoading(false);
        const nextStatus = response.export.status.toUpperCase();
        if (!["READY", "FAILED", "EXPIRED"].includes(nextStatus)) timer = window.setTimeout(() => void load(), 2500);
      } catch (caught) {
        if (!live) return;
        setError(errorCopy(caught)); setLoading(false);
        timer = window.setTimeout(() => void load(), 5000);
      }
    };
    setLoading(true); void load();
    return () => { live = false; if (timer) window.clearTimeout(timer); };
  }, [exportId, reloadKey]);

  if (loading) return <LoadingBlock label="Consultando exportação privada…" />;
  if (!exportView) return <div className="page-stack"><Notice tone="error" title="Arquivo indisponível">{error}</Notice><Button type="button" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>Tentar novamente</Button><Link className="text-link" href="/app/avaliacoes">Voltar às avaliações<ArrowRight size={14} /></Link></div>;

  const ready = status === "READY";
  const failed = status === "FAILED";
  const expired = status === "EXPIRED";
  const variantLabel = exportView.variant === "ANSWER_KEY" ? "Gabarito separado" : exportView.variant === "QUESTIONS" ? "Prova" : "Arquivo de avaliação";
  const formatLabel = exportView.format === "PRINT" ? "Formato para impressão" : exportView.format === "PDF" ? "PDF" : "Formato indisponível";
  const processingLabel = status === "QUEUED" ? "Na fila de processamento…" : status === "PROCESSING" || status === "PENDING" ? "Preparando o arquivo…" : "Aguardando atualização do processamento…";
  const contentPath = `/api/v1/exports/${encodeURIComponent(exportView.id)}/content`;
  return <div className="page-stack"><div className="breadcrumbs"><Link href={`/app/avaliacoes/${exportView.assessmentId}`}>Avaliação privada</Link><span>/</span><span>Arquivo</span></div><PageTitle eyebrow="EXPORTAÇÃO PRIVADA" title={`${variantLabel} · ${formatLabel}`} description={`Revisão ${exportView.revision} · arquivo restrito a quem criou a avaliação.`} actions={<VisibilityTag>Privado</VisibilityTag>} />
    {error && <Notice tone="warning" title="Não foi possível atualizar o status">{error}</Notice>}
    {ready ? <Panel title="Arquivo pronto" detail="A prova e o gabarito são downloads separados."><p className="export-status-copy">Este arquivo contém apenas {variantLabel.toLocaleLowerCase("pt-BR")}.</p><a className="button button-primary" href={contentPath} download><Download size={15} />Baixar {variantLabel.toLocaleLowerCase("pt-BR")}</a>{exportView.expiresAt && <p className="field-help">Disponível até {new Date(exportView.expiresAt).toLocaleString("pt-BR")}</p>}</Panel> : failed || expired ? <Notice tone="error" title={expired ? "Link expirado" : "Exportação não concluída"}>{expired ? "Solicite uma nova exportação pela avaliação privada." : "O serviço não conseguiu preparar este arquivo. Nenhuma prova foi publicada."}</Notice> : <Panel title="Preparando arquivo" detail="O processamento real será consultado automaticamente."><LoadingBlock label={processingLabel} /></Panel>}
    {!terminal && <Button type="button" variant="ghost" onClick={() => setReloadKey((value) => value + 1)}>Atualizar status</Button>}
    <Link className="text-link" href={`/app/avaliacoes/${exportView.assessmentId}`}><ArrowRight size={14} />Voltar à avaliação</Link>
  </div>;
}

function QuestionEditor({ question, index, disabled, onChange, errorField, errorMessage }: { question: EditableQuestion; index: number; disabled: boolean; onChange: (question: EditableQuestion) => void; errorField: "statement" | "options" | null; errorMessage: string }) {
  const update = (patch: Partial<EditableQuestion>) => onChange({ ...question, ...patch });
  const updateAnswer = (patch: NonNullable<EditableQuestion["answer"]>) => update({ answer: { ...question.answer, ...patch } });
  return <fieldset className="question-editor"><legend className="sr-only">Questão {index + 1}</legend>
    <label className="field"><span>Enunciado</span><textarea id={`question-statement-${index}`} className="input" value={question.statement} onChange={(event) => update({ statement: event.target.value })} disabled={disabled} rows={3} required aria-invalid={errorField === "statement" || undefined} aria-describedby={errorField === "statement" ? `question-statement-error-${index}` : undefined} />{errorField === "statement" && <span id={`question-statement-error-${index}`} className="field-error" role="alert">{errorMessage}</span>}</label>
    <div className="form-grid"><label className="field"><span>Tipo</span><select className="input" value={question.type} onChange={(event) => { const type = event.target.value; update({ type, options: type === "MULTIPLE_CHOICE" ? (question.options.length ? question.options : [{ id: optionId(), text: "" }, { id: optionId(), text: "" }]) : [], answer: {} }); }} disabled={disabled}><option value="MULTIPLE_CHOICE">Múltipla escolha</option><option value="SHORT_ANSWER">Resposta curta</option><option value="ESSAY">Discursiva</option></select></label><label className="field"><span>Dificuldade</span><select className="input" value={question.difficulty || "EASY"} onChange={(event) => update({ difficulty: event.target.value })} disabled={disabled}><option value="EASY">Introdutória</option><option value="MEDIUM">Intermediária</option><option value="HARD">Avançada</option></select></label><label className="field"><span>Pontos</span><input className="input" type="number" min="0" step="0.5" value={question.points ?? 1} onChange={(event) => update({ points: Number(event.target.value) })} disabled={disabled} /></label></div>
    {question.type === "MULTIPLE_CHOICE" ? <div className="option-editor" role="group" aria-label="Alternativas e gabarito" aria-describedby={errorField === "options" ? `question-options-error-${index}` : undefined}><div className="option-editor-heading"><strong>Alternativas</strong><Button type="button" variant="ghost" disabled={disabled} onClick={() => update({ options: [...question.options, { id: optionId(), text: "" }] })}><Plus size={13} />Adicionar opção</Button></div>{question.options.map((option, optionIndex) => <div className="option-edit-row" key={option.id}><span className="option-dot">{String.fromCharCode(65 + optionIndex)}</span><input id={`question-option-${index}-${optionIndex}`} className="input" aria-label={`Alternativa ${optionIndex + 1}`} value={option.text} onChange={(event) => update({ options: question.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} disabled={disabled} required aria-invalid={errorField === "options" || undefined} /><label className="correct-choice"><input type="radio" name={`correct-${index}`} checked={question.answer?.correctOptionId === option.id} onChange={() => updateAnswer({ correctOptionId: option.id })} disabled={disabled} />Gabarito</label><button type="button" className="remove-option" aria-label={`Remover alternativa ${optionIndex + 1}`} disabled={disabled || question.options.length <= 2} onClick={() => { const next = question.options.filter((item) => item.id !== option.id); const correctOptionId = question.answer?.correctOptionId === option.id ? undefined : question.answer?.correctOptionId; update({ options: next, answer: { ...question.answer, correctOptionId } }); }}><Trash2 size={14} /></button></div>)}{errorField === "options" && <p id={`question-options-error-${index}`} className="field-error" role="alert">{errorMessage}</p>}</div> : <div className="form-grid"><label className="field"><span>Resposta esperada</span><textarea className="input" rows={3} value={question.answer?.expectedAnswer || ""} onChange={(event) => updateAnswer({ expectedAnswer: event.target.value })} disabled={disabled} /></label><label className="field"><span>Critérios de correção</span><textarea className="input" rows={3} value={question.answer?.rubric || ""} onChange={(event) => updateAnswer({ rubric: event.target.value })} disabled={disabled} /></label></div>}
  </fieldset>;
}

function ReadOnlyQuestions({ questions }: { questions: EditableQuestion[] }) {
  return questions.length ? <div className="question-list">{questions.map((question, index) => <article className="question-editor readonly-question" key={question.id || index}><div className="question-editor-head"><strong>Questão {index + 1}</strong><span className="tag tag-neutral">{assessmentQuestionTypeLabel(question.type)}</span></div><p>{question.statement}</p>{question.options?.length ? <ul className="question-options">{question.options.map((option, optionIndex) => <li className={option.id === question.answer?.correctOptionId ? "correct" : ""} key={option.id}><span className="option-dot">{String.fromCharCode(65 + optionIndex)}</span>{option.text}{option.id === question.answer?.correctOptionId ? " · gabarito" : ""}</li>)}</ul> : <div className="answer-key"><strong>Resposta esperada</strong><p>{question.answer?.expectedAnswer || "Não informada"}</p><strong>Critérios</strong><p>{question.answer?.rubric || "Não informados"}</p></div>}</article>)}</div> : <EmptyState title="Nenhuma questão nesta revisão" detail="Esta avaliação ainda não tem questões salvas." />;
}
