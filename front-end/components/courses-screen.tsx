"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorCopy, jsonBody, newIdempotencyKey } from "@/lib/api";
import { assessmentStateLabel, documentProgressLabel, materialKindLabel, questionCountLabel } from "@/lib/display-labels";
import { workspaceSupportsPersona, type AssessmentView, type ClassView, type CourseView, type DocumentView, type JobView, type MaterialView, type PageResult } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel, VisibilityTag } from "./ui";
import { ArrowRight, BookOpen, FileText, GraduationCap, LockKeyhole, MessageCircle, Plus, Sparkles, Upload } from "lucide-react";
import { JobTracker } from "./job-tracker";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";
import { ConfirmModal, Modal } from "./modal";

type PendingConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "default" | "danger";
  operation: () => Promise<void>;
};

function quantityLabel(count: number, singular: string, plural = `${singular}s`) { return `${count} ${count === 1 ? singular : plural}`; }

export function CoursesScreen() {
  const { activeWorkspace, persona } = useSession();
  const canCreateCourse = persona === "TEACHER" && workspaceSupportsPersona(activeWorkspace, "TEACHER");
  const coursePath = persona === "TEACHER"
    ? activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses` : null
    : "/me/courses";
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!coursePath) { setCourses([]); setNextCursor(null); setError(""); setLoading(false); return; }
    let live = true; setLoading(true); setError("");
    api<PageResult<CourseView>>(`${coursePath}?cursor=`)
      .then((result) => { if (live) { setCourses(result.items || []); setNextCursor(result.nextCursor); } })
      .catch((caught) => { if (live) setError(errorCopy(caught)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [coursePath, reloadKey]);

  const loadMoreCourses = async () => {
    if (!coursePath || !nextCursor || pageBusy) return;
    setPageBusy(true); setError("");
    try {
      const page = await api<PageResult<CourseView>>(`${coursePath}?cursor=${encodeURIComponent(nextCursor)}`);
      setCourses((current) => Array.from(new Map([...current, ...(page.items || [])].map((course) => [course.id, course])).values()));
      setNextCursor(page.nextCursor);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setPageBusy(false); }
  };

  const createCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!activeWorkspace) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      const course = await api<CourseView>(`/workspaces/${activeWorkspace.id}/courses`, {
        method: "POST",
        body: jsonBody({ title: form.get("title"), description: form.get("description") }),
      });
      setNotice("Disciplina criada no seu espaço."); setShowForm(false); setReloadKey((value) => value + 1);
      if (!course?.id) setError("A disciplina foi criada, mas a API não retornou o identificador para abri-la.");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <div className="page-stack">
    <PageTitle eyebrow="SEU ESPAÇO ACADÊMICO" title="Disciplinas" description={persona === "TEACHER" ? "Organize conteúdos, turmas e avaliações por matéria." : "Encontre seus materiais e continue aprendendo com contexto."} actions={canCreateCourse ? <Button onClick={() => { setError(""); setShowForm(true); }}><Plus size={16} />Nova disciplina</Button> : undefined} />
    {error && <Notice tone="error" title="Não foi possível concluir">{error}</Notice>}{notice && <Notice tone="success" title="Tudo certo">{notice}</Notice>}
    <Modal open={showForm} onClose={() => setShowForm(false)} title="Criar disciplina" description="Ela começa privada no espaço selecionado." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={createCourse}><label className="field"><span>Título da disciplina</span><input className="input" name="title" required placeholder="Ex.: Bioquímica metabólica" /></label><label className="field full-span"><span>Descrição <small>(opcional)</small></span><textarea className="input" name="description" rows={3} placeholder="O que você vai reunir nesta disciplina?" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar disciplina"}<ArrowRight size={15} /></Button></div></form>
    </Modal>
    <Panel title="Todas as disciplinas" detail={courses.length ? `${quantityLabel(courses.length, "disciplina", "disciplinas")} ${nextCursor ? courses.length === 1 ? "carregada" : "carregadas" : courses.length === 1 ? "disponível" : "disponíveis"} neste contexto` : undefined}>
      {loading ? <LoadingBlock label="Carregando disciplinas…" /> : courses.length ? <div className="course-grid">{courses.map((course) => <Link className="course-tile" href={`/app/disciplinas/${course.id}`} key={course.id}><span className="course-tile-top"><span className="course-icon"><BookOpen size={20} /></span><span className="tag tag-outline">{course.topics?.length || 0} tópicos</span></span><strong>{course.title}</strong><p>{course.description || "Abra para organizar materiais, turmas e próximos passos."}</p><span className="course-tile-link">Abrir disciplina<ArrowRight size={15} /></span></Link>)}</div> : <EmptyState title="Ainda sem disciplinas" detail={canCreateCourse ? "Crie uma disciplina para reunir materiais, turmas e avaliações." : persona === "TEACHER" ? "Peça acesso a um espaço docente para organizar suas disciplinas." : "Entre em uma turma com o código recebido; as disciplinas liberadas aparecerão aqui."} action={canCreateCourse ? "Criar disciplina" : persona === "STUDENT" ? "Perguntar ao tutor" : undefined} href={persona === "STUDENT" ? "/app/conversas" : undefined} onAction={canCreateCourse ? () => { setError(""); setShowForm(true); } : undefined} />}
      {nextCursor && <Button type="button" variant="secondary" disabled={pageBusy} onClick={() => void loadMoreCourses()}>{pageBusy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}
    </Panel>
  </div>;
}

export function CourseDetailScreen({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { persona, session } = useSession();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classCursor, setClassCursor] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [materialCursor, setMaterialCursor] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<AssessmentView[]>([]);
  const [assessmentCursor, setAssessmentCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [job, setJob] = useState<JobView | null>(null);
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
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    Promise.allSettled([
      api<CourseView>(`/courses/${courseId}`),
      api<PageResult<ClassView>>(`/courses/${courseId}/classes?cursor=`),
      api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=`),
      api<PageResult<AssessmentView>>(`/courses/${courseId}/assessments?cursor=`),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") setCourse(results[0].value); else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") { setClasses(results[1].value.items || []); setClassCursor(results[1].value.nextCursor); }
      if (results[2].status === "fulfilled") { setMaterials(results[2].value.items || []); setMaterialCursor(results[2].value.nextCursor); }
      if (results[3].status === "fulfilled") { setAssessments(results[3].value.items || []); setAssessmentCursor(results[3].value.nextCursor); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [courseId, reloadKey]);

  const loadMoreCourseList = async (kind: "classes" | "materials" | "assessments") => {
    const cursor = kind === "classes" ? classCursor : kind === "materials" ? materialCursor : assessmentCursor;
    if (!cursor || busy) return;
    setBusy(true); setError("");
    try {
      const page = kind === "classes"
        ? await api<PageResult<ClassView>>(`/courses/${courseId}/classes?cursor=${encodeURIComponent(cursor)}`)
        : kind === "materials"
          ? await api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=${encodeURIComponent(cursor)}`)
          : await api<PageResult<AssessmentView>>(`/courses/${courseId}/assessments?cursor=${encodeURIComponent(cursor)}`);
      if (kind === "classes") { const result = page as PageResult<ClassView>; setClasses((current) => Array.from(new Map([...current, ...result.items].map((item) => [item.id, item])).values())); setClassCursor(result.nextCursor); }
      if (kind === "materials") { const result = page as PageResult<MaterialView>; setMaterials((current) => Array.from(new Map([...current, ...result.items].map((item) => [item.id, item])).values())); setMaterialCursor(result.nextCursor); }
      if (kind === "assessments") { const result = page as PageResult<AssessmentView>; setAssessments((current) => Array.from(new Map([...current, ...result.items].map((item) => [item.id, item])).values())); setAssessmentCursor(result.nextCursor); }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const canManage = persona === "TEACHER" && Boolean(course?.ownerUserId && course.ownerUserId === session?.user.id);
  const visibleMaterials = useMemo(() => persona === "STUDENT" && !canManage
    ? materials.filter((material) => material.classification === "ACADEMIC" && (material.releases || []).some((release) => release.releasedAt && !release.revokedAt && classes.some((classItem) => classItem.id === release.classId)))
    : materials, [canManage, classes, materials, persona]);
  const documentIds = useMemo(() => visibleMaterials.flatMap((material) => material.documents || []).filter((document) => ["READY", "COMPLETED"].includes(document.status.toUpperCase())).map((document) => document.id), [visibleMaterials]);

  const saveCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!course) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    const topics = String(form.get("topics") || "").split("\n").map((title) => title.trim()).filter(Boolean);
    const objectives = String(form.get("objectives") || "").split("\n").map((item) => item.trim()).filter(Boolean);
    try {
      const updated = await api<CourseView>(`/courses/${course.id}`, { method: "PATCH", body: jsonBody({ title: form.get("title"), description: form.get("description"), topics, objectives, revision: course.revision }) });
      setCourse(updated); setNotice("Disciplina atualizada."); setEditing(false);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const createClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!course) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError("");
    try {
      const created = await api<ClassView>(`/courses/${course.id}/classes`, { method: "POST", body: jsonBody({ name: form.get("name"), period: form.get("period") }) });
      setNotice("Turma criada."); formElement.reset(); setShowClassForm(false);
      if (created?.id) setClasses((items) => [created, ...items]); else refresh();
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const createMaterialAndUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!course) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) { setError("Selecione um arquivo PDF ou PPTX para enviar."); return; }
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".pdf") && !fileName.endsWith(".pptx")) { setError("O formato aceito para este envio é PDF ou PPTX."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const kind = file.name.toLowerCase().endsWith(".pptx") ? "PPTX" : "PDF";
      const material = await api<MaterialView>(`/courses/${course.id}/materials`, { method: "POST", body: jsonBody({ title: form.get("title"), kind, classification: form.get("classification") || "ACADEMIC" }) });
      const upload = new FormData(); upload.set("file", file);
      const result = await api<{ document: DocumentView; job: JobView }>(`/materials/${material.id}/documents`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: upload });
      if (result.job) setJob(result.job);
      setNotice("Material criado como privado. A liberação pode ser feita depois que o processamento terminar."); formElement.reset(); setShowMaterialForm(false); refresh();
    } catch (caught) { setError(errorCopy(caught)); refresh(); }
    finally { setBusy(false); }
  };

  const releaseMaterial = async (event: React.FormEvent<HTMLFormElement>, materialId: string) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const classId = String(form.get("classId") || "");
    if (!classId) return;
    const className = classes.find((item) => item.id === classId)?.name || "esta turma";
    const material = materials.find((item) => item.id === materialId);
    if (!material) { setError("Este material não está disponível para liberação."); return; }
    askConfirmation({ title: "Liberar material", description: `Alunos de ${className} poderão acessar este material.`, confirmLabel: "Liberar material", operation: async () => { await api(`/materials/${materialId}/classes/${classId}`, { method: "PUT", body: jsonBody({ revision: material.revision }) }); setNotice(`Material liberado para ${className}.`); refresh(); } });
  };

  const revokeRelease = async (materialId: string, classId: string) => {
    const className = classes.find((item) => item.id === classId)?.name || "esta turma";
    askConfirmation({ title: "Revogar acesso ao material", description: `As pessoas de ${className} perderão o acesso a este conteúdo.`, confirmLabel: "Revogar acesso", variant: "danger", operation: async () => { await api(`/materials/${materialId}/classes/${classId}`, { method: "DELETE" }); setNotice(`Acesso de ${className} revogado.`); refresh(); } });
  };

  const archiveCourse = async () => {
    if (!course) return;
    const archived = Boolean(course.archivedAt);
    askConfirmation({ title: archived ? "Reativar disciplina" : "Arquivar disciplina", description: archived ? "A disciplina voltará a aparecer entre os espaços ativos." : "A disciplina deixará de aparecer entre os espaços ativos.", confirmLabel: archived ? "Reativar disciplina" : "Arquivar disciplina", variant: archived ? "default" : "danger", operation: async () => { const updated = await api<CourseView>(`/courses/${course.id}`, { method: "PATCH", body: jsonBody({ revision: course.revision, archived: !archived }) }); setCourse(updated); setNotice(archived ? "Disciplina reativada." : "Disciplina arquivada."); setEditing(false); } });
  };

  const createArtifact = async (kind: string) => {
    if (!documentIds.length) { setError("Adicione e processe um material para criar este recurso."); return; }
    setBusy(true); setError("");
    try {
      const response = await api<{ job: JobView }>("/study/artifacts", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: jsonBody({ kind, courseId, documentIds }) });
      setJob(response.job);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const createConversation = async () => {
    setBusy(true); setError("");
    try { const response = await api<{ conversation: { id: string } }>("/conversations", { method: "POST", body: jsonBody({ kind: persona === "TEACHER" ? "TEACHER_ASSISTANT" : "STUDENT_TUTOR", courseId, documentIds }) }); if (response.conversation?.id) router.push(`/app/conversas/${response.conversation.id}`); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const createAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!course) return;
    const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError("");
    try {
      const assessment = await api<AssessmentView | { assessment: AssessmentView }>(`/courses/${courseId}/assessments`, { method: "POST", body: jsonBody({ title: form.get("title"), kind: form.get("kind") }) });
      const created = "assessment" in assessment ? assessment.assessment : assessment;
      formElement.reset(); setShowAssessmentForm(false);
      if (created?.id) router.push(`/app/avaliacoes/${created.id}`); else setNotice("Avaliação criada. Atualize a lista para abrir o rascunho.");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingBlock label="Abrindo disciplina…" />;
  if (error && !course) return <div className="page-stack"><Notice tone="error" title="Disciplina indisponível">{error}</Notice><Link className="text-link" href="/app/disciplinas">Voltar às disciplinas<ArrowRight size={14} /></Link></div>;
  if (!course) return null;

  return <div className="page-stack">
    <div className="breadcrumbs"><Link href="/app/disciplinas">Disciplinas</Link><span>/</span><span>{course.title}</span></div>
    <PageTitle eyebrow="DISCIPLINA" title={course.title} description={course.description || "Organize tópicos, materiais e próximas atividades deste espaço."} actions={<>{canManage && <Button variant="secondary" onClick={() => { setError(""); setEditing(true); }}>Editar disciplina</Button>}<Button onClick={() => void createConversation()} disabled={busy}><MessageCircle size={16} />{busy ? "Abrindo…" : "Perguntar à IA"}</Button></>} />
    {course.archivedAt && <Notice tone="warning" title="Disciplina arquivada">Este espaço não aparece entre os conteúdos ativos.</Notice>}
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Atualização concluída">{notice}</Notice>}
    <Modal open={editing && canManage} onClose={() => setEditing(false)} title="Editar disciplina" description="As alterações usam a revisão atual do conteúdo." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={saveCourse}><label className="field"><span>Título</span><input className="input" name="title" defaultValue={course.title} required maxLength={120} /></label><label className="field"><span>Descrição</span><textarea className="input" name="description" defaultValue={course.description || ""} rows={3} /></label><label className="field"><span>Tópicos <small>um por linha</small></span><textarea className="input" name="topics" defaultValue={course.topics?.join("\n")} rows={5} /></label><label className="field"><span>Objetivos de aprendizagem <small>um por linha</small></span><textarea className="input" name="objectives" defaultValue={course.objectives?.join("\n")} rows={5} /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void archiveCourse()}>{course.archivedAt ? "Reativar disciplina" : "Arquivar disciplina"}</Button></div></form>
    </Modal>

    <div className="course-detail-grid">
      <Panel title="Tópicos e objetivos" detail="Conteúdo organizado para orientar seu percurso.">{course.topics?.length ? <div className="topic-list">{course.topics.map((topic, index) => <div className="topic-row" key={`${topic}-${index}`}><span className="topic-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{topic}</strong></div></div>)}</div> : <EmptyState title="Nenhum tópico cadastrado" detail="Adicione tópicos ao editar esta disciplina." />}</Panel>
      <Panel title="Materiais" detail={visibleMaterials.length ? quantityLabel(visibleMaterials.length, "material", "materiais") + " no curso" : "Novos materiais ficam privados por padrão."}>
        {visibleMaterials.length ? <div className="resource-list">{visibleMaterials.map((material) => {
          const activeReleases = (material.releases || []).filter((release) => release.releasedAt && !release.revokedAt);
          const released = activeReleases.length > 0;
          return <div className="resource-row resource-row-stacked" key={material.id}><span className="resource-icon"><FileText size={17} /></span><div className="resource-main"><strong>{material.title}</strong><small>{materialKindLabel(material.kind)} · revisão {material.revision}</small><div className="resource-subline">{material.documents?.length ? material.documents.map((document) => <Link key={document.id} href={`/app/materiais/${document.id}`} className="document-link">{document.name}<span>{documentProgressLabel(document.status, document.stage)}</span></Link>) : <span className="muted-copy">Nenhum arquivo enviado ainda.</span>}</div>{released && <div className="release-chips">{activeReleases.map((release) => <span className="release-chip" key={release.classId}><span className="tag tag-sage">Liberado · {classes.find((item) => item.id === release.classId)?.name || "turma"}</span>{canManage && <button className="button button-quiet release-revoke" type="button" disabled={busy} onClick={() => void revokeRelease(material.id, release.classId)} aria-label={`Revogar acesso de ${classes.find((item) => item.id === release.classId)?.name || "turma"} a ${material.title}`}>Revogar</button>}</span>)}</div>}</div><VisibilityTag released={released}>{material.classification === "TEACHER_SECRET" ? "Secreto" : released ? "Liberado" : "Privado"}</VisibilityTag>{persona === "TEACHER" && classes.length > 0 && material.classification !== "TEACHER_SECRET" && <form className="release-form" onSubmit={(event) => void releaseMaterial(event, material.id)}><label className="sr-only" htmlFor={`release-${material.id}`}>Liberar {material.title} para turma</label><select id={`release-${material.id}`} name="classId" defaultValue=""><option value="">Liberar para…</option>{classes.filter((classItem) => !activeReleases.some((release) => release.classId === classItem.id)).map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}</select><button className="button button-quiet" type="submit" disabled={busy}>Liberar</button></form>}</div>;
        })}</div> : <EmptyState title="Sem materiais por enquanto" detail="Envie um PDF ou uma apresentação. O arquivo começa como privado." />}
        {materialCursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadMoreCourseList("materials")}>{busy ? "Carregando…" : "Carregar mais materiais"}</Button>}
        {visibleMaterials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`documents-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos anteriores · ${material.title}`}</Button></div>)}
        {canManage && <Button type="button" variant="secondary" onClick={() => { setError(""); setShowMaterialForm(true); }}><Upload size={16} />Adicionar material</Button>}
      </Panel>
    </div>

    {job && <JobTracker job={job} onClose={() => setJob(null)} onUpdate={setJob} />}
    {persona === "TEACHER" && <div className="course-detail-grid">
      <Panel title="Turmas" detail="Cada turma tem acesso próprio aos materiais liberados.">{classes.length ? <div className="resource-list">{classes.map((classItem) => <Link className="resource-row" href={`/app/turmas/${classItem.id}`} key={classItem.id}><span className="resource-icon sage"><GraduationCap size={18} /></span><span className="resource-main"><strong>{classItem.name}</strong><small>{classItem.period || "Período não informado"}{classItem.studentCount == null ? "" : ` · ${classItem.studentCount} ${classItem.studentCount === 1 ? "estudante" : "estudantes"}`}</small></span><ArrowRight size={16} /></Link>)}</div> : <EmptyState title="Sem turmas nesta disciplina" detail="Crie uma turma para convidar alunos e publicar um roteiro de estudo." />}
        {classCursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadMoreCourseList("classes")}>{busy ? "Carregando…" : "Carregar mais turmas"}</Button>}
        <Button type="button" variant="secondary" onClick={() => { setError(""); setShowClassForm(true); }}><Plus size={15} />Criar turma</Button>
      </Panel>
      <Panel title="Avaliações privadas" detail="Avaliações e gabaritos ficam sempre visíveis apenas para você.">{assessments.length ? <div className="resource-list">{assessments.map((assessment) => <Link className="resource-row" href={`/app/avaliacoes/${assessment.id}`} key={assessment.id}><span className="resource-icon sand"><FileText size={18} /></span><span className="resource-main"><strong>{assessment.title}</strong><small>{assessmentStateLabel(assessment.state)} · {questionCountLabel(assessment.questionCount ?? assessment.questions?.length)}</small></span><VisibilityTag>Privada</VisibilityTag><ArrowRight size={16} /></Link>)}</div> : <EmptyState title="Nenhuma avaliação criada" detail="Prepare um rascunho e revise tudo antes de finalizar." />}
        {assessmentCursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadMoreCourseList("assessments")}>{busy ? "Carregando…" : "Carregar mais avaliações"}</Button>}
        <Button type="button" variant="secondary" onClick={() => { setError(""); setShowAssessmentForm(true); }}><Plus size={15} />Nova avaliação</Button>
      </Panel>
    </div>}

    <Panel title="Estudar a partir desta disciplina" detail={documentIds.length ? `${documentIds.length} arquivos prontos podem ser usados.` : "Envie e processe um material para habilitar a criação de conteúdos."}>
      {persona === "STUDENT" && <Notice tone="info" title="Use somente o que foi liberado">Materiais privados e avaliações docentes não entram no contexto de estudo.</Notice>}
      <div className="study-action-grid">{[{ kind: "SUMMARY", label: "Criar resumo", detail: "Uma leitura organizada do conteúdo." }, { kind: "FLASHCARDS", label: "Criar cartões", detail: "Perguntas para conferir sua compreensão." }, { kind: "STUDY_PLAN", label: "Montar plano", detail: "Uma sequência de estudo para você seguir." }, { kind: "PRACTICE_TEST", label: "Criar simulado", detail: "Respostas reveladas só após a entrega." }].map((action) => <button type="button" className="study-action" key={action.kind} onClick={() => void createArtifact(action.kind)} disabled={busy || !documentIds.length}><span><Sparkles size={17} /></span><strong>{action.label}</strong><small>{action.detail}</small></button>)}</div>
    </Panel>
    <Modal open={showMaterialForm} onClose={() => setShowMaterialForm(false)} title="Adicionar material" description="O conteúdo começa privado e pode ser liberado depois do processamento." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createMaterialAndUpload(event)}><label className="field"><span>Nome do material</span><input className="input" name="title" required placeholder="Ex.: Aula 1 — Introdução" /></label><label className="field"><span>Arquivo digital <small>(PDF ou PPTX)</small></span><input className="input file-input" name="file" type="file" required accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" /></label><label className="field"><span>Classificação</span><select className="input" name="classification"><option value="ACADEMIC">Acadêmico · pode ser liberado por turma</option><option value="TEACHER_SECRET">Secreto da docente · não pode ser compartilhado</option></select></label><p className="privacy-note"><LockKeyhole size={14} />Todo material começa privado até uma liberação por turma.</p><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowMaterialForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Enviando…" : "Criar e enviar"}<ArrowRight size={14} /></Button></div></form>
    </Modal>
    <Modal open={showClassForm} onClose={() => setShowClassForm(false)} title="Criar turma" description="A turma fica vinculada a esta disciplina." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createClass(event)}><label className="field"><span>Nome da turma</span><input className="input" name="name" required placeholder="Ex.: Bioquímica — Noturno" /></label><label className="field"><span>Período <small>(opcional)</small></span><input className="input" name="period" placeholder="Ex.: 2026.2" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowClassForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar turma"}</Button></div></form>
    </Modal>
    <Modal open={showAssessmentForm} onClose={() => setShowAssessmentForm(false)} title="Criar avaliação" description="Comece com um rascunho privado." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createAssessment(event)}><label className="field"><span>Título</span><input className="input" name="title" required placeholder="Ex.: Avaliação do módulo 1" /></label><label className="field"><span>Formato</span><select className="input" name="kind"><option value="QUIZ">Questionário</option><option value="EXAM">Prova</option><option value="ASSIGNMENT">Atividade</option></select></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowAssessmentForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar rascunho"}<ArrowRight size={14} /></Button></div></form>
    </Modal>
    <ConfirmModal open={Boolean(confirmation)} onClose={() => { setConfirmation(null); setConfirmationError(""); }} title={confirmation?.title || "Confirmar ação"} description={`${confirmation?.description || ""}${confirmationError ? `\n\n${confirmationError}` : ""}`} confirmLabel={confirmation?.confirmLabel} variant={confirmation?.variant} onConfirm={confirmPendingAction} busy={busy}>
      {confirmationError && <p className="inline-error" role="alert">{confirmationError}</p>}
    </ConfirmModal>
  </div>;
}
