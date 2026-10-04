"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorCopy, jsonBody } from "@/lib/api";
import { documentStatusLabel, enrollmentStatusLabel, materialKindLabel } from "@/lib/display-labels";
import type { ClassView, CourseView, MaterialView, PageResult } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { ArrowRight, BookOpen, Clipboard, GraduationCap, Link2, Plus, UsersRound } from "lucide-react";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";
import { ConfirmModal, Modal } from "./modal";

type EnrollmentView = { userId: string; name?: string; email?: string; role?: string; status?: string };
type BlueprintTopic = { courseTopicId: string; title?: string; position?: number; competencyCode: string };
type BlueprintView = { id: string; classId: string; revision: number; state: "DRAFT" | "PUBLISHED"; title?: string; objectives?: string[]; topics: BlueprintTopic[]; difficulty: "EASY" | "MEDIUM" | "HARD" | "MIXED"; publishedAt?: string | null };
type PendingConfirmation = { title: string; description: string; confirmLabel: string; variant?: "default" | "danger"; operation: () => Promise<void> };

function studentLabel(count: number) { return `${count} ${count === 1 ? "estudante" : "estudantes"}`; }
function enrollmentLabel(count: number) { return `${count} ${count === 1 ? "matrícula" : "matrículas"}`; }

export function ClassesScreen() {
  const { persona, activeWorkspace } = useSession();
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [classesCursor, setClassesCursor] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [coursesCursor, setCoursesCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showJoin, setShowJoin] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);

  useEffect(() => {
    let live = true; setLoading(true); setError("");
    Promise.allSettled([
      api<PageResult<ClassView>>("/classes?cursor="),
      activeWorkspace ? api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=`) : Promise.resolve({ items: [], nextCursor: null }),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") { setClasses(results[0].value.items || []); setClassesCursor(results[0].value.nextCursor); } else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") { setCourses(results[1].value.items || []); setCoursesCursor(results[1].value.nextCursor); }
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, reloadKey]);

  const loadMore = async (kind: "classes" | "courses") => {
    const cursor = kind === "classes" ? classesCursor : coursesCursor;
    if (!cursor || busy) return;
    setBusy(true); setError("");
    try {
      if (kind === "classes") {
        const page = await api<PageResult<ClassView>>(`/classes?cursor=${encodeURIComponent(cursor)}`);
        setClasses((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setClassesCursor(page.nextCursor);
      } else if (activeWorkspace) {
        const page = await api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=${encodeURIComponent(cursor)}`);
        setCourses((current) => Array.from(new Map([...current, ...page.items].map((item) => [item.id, item])).values())); setCoursesCursor(page.nextCursor);
      }
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const join = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await api("/enrollments", { method: "POST", body: jsonBody({ code: form.get("code") }) }); setNotice("Convite aceito. A turma já está disponível no seu espaço."); setShowJoin(false); setReloadKey((value) => value + 1); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const createClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError(""); setNotice("");
    try {
      const courseId = String(form.get("courseId"));
      const created = await api<ClassView>(`/courses/${courseId}/classes`, { method: "POST", body: jsonBody({ name: form.get("name"), period: form.get("period") }) });
      if (created?.id) setClasses((items) => [created, ...items]); else setReloadKey((value) => value + 1);
      setNotice("Turma criada."); formElement.reset(); setShowCreateClass(false);
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <div className="page-stack"><PageTitle eyebrow="AULAS E CONTEXTOS" title="Turmas" description={persona === "TEACHER" ? "Convide sua turma e acompanhe os materiais liberados." : "Acompanhe seus grupos e entre usando um convite de quem conduz a turma."} actions={persona === "STUDENT" ? <Button variant="secondary" onClick={() => setShowJoin((value) => !value)}><Link2 size={16} />Entrar com convite</Button> : undefined} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Tudo certo">{notice}</Notice>}
    <div className="class-grid">{loading ? <Panel><LoadingBlock label="Carregando turmas…" /></Panel> : classes.length ? classes.map((classItem) => <Link className="class-tile" href={`/app/turmas/${classItem.id}`} key={classItem.id}><div className="class-tile-top"><span className="class-icon"><UsersRound size={19} /></span><span className="tag tag-neutral">{classItem.period || "Turma"}</span></div><strong>{classItem.name}</strong><p>{courses.find((course) => course.id === classItem.courseId)?.title || "Disciplina"}</p><span className="class-meta"><span>{classItem.studentCount != null && <><GraduationCap size={14} />{studentLabel(classItem.studentCount)}</>}</span><span>Abrir turma<ArrowRight size={14} /></span></span></Link>) : <Panel className="class-empty"><EmptyState title={persona === "TEACHER" ? "Nenhuma turma criada" : "Você ainda não entrou em uma turma"} detail={persona === "TEACHER" ? "Abra uma disciplina para criar uma turma e gerar convites." : "Entre com o código recebido ou continue estudando no seu espaço pessoal."} action="Ver disciplinas" href="/app/disciplinas" /></Panel>}</div>
    {classesCursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadMore("classes")}>{busy ? "Carregando…" : "Carregar mais turmas"}</Button>}
    {persona === "TEACHER" && courses.length > 0 && <Panel title="Turmas" detail="Cada turma fica vinculada a uma disciplina."><Button type="button" variant="secondary" onClick={() => { setError(""); setShowCreateClass(true); }}><Plus size={15} />Criar turma</Button>{coursesCursor && <Button type="button" variant="ghost" disabled={busy} onClick={() => void loadMore("courses")}>{busy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}</Panel>}
    <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Entrar em uma turma" description="Use o código de convite enviado por quem conduz a turma." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={join}><label className="field"><span>Código do convite</span><input className="input" name="code" required autoCapitalize="characters" placeholder="Cole ou digite o código" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowJoin(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar na turma"}<ArrowRight size={15} /></Button></div></form>
    </Modal>
    <Modal open={showCreateClass} onClose={() => setShowCreateClass(false)} title="Criar turma" description="A turma fica vinculada a uma disciplina." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createClass(event)}><label className="field"><span>Disciplina</span><select className="input" name="courseId" required defaultValue=""><option value="" disabled>Escolha uma disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label className="field"><span>Nome da turma</span><input className="input" name="name" required placeholder="Ex.: Bioquímica — Noite" /></label><label className="field"><span>Período <small>(opcional)</small></span><input className="input" name="period" placeholder="Ex.: 2026.2" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowCreateClass(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}><Plus size={15} />{busy ? "Criando…" : "Criar turma"}</Button></div></form>
    </Modal>
  </div>;
}

export function ClassDetailScreen({ classId }: { classId: string }) {
  const router = useRouter();
  const { persona, session } = useSession();
  const [classItem, setClassItem] = useState<ClassView | null>(null);
  const [course, setCourse] = useState<CourseView | null>(null);
  const [members, setMembers] = useState<EnrollmentView[]>([]);
  const [blueprint, setBlueprint] = useState<BlueprintView | null>(null);
  const [materials, setMaterials] = useState<MaterialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState<{ code: string; expiresAt?: string } | null>(null);
  const [editingBlueprint, setEditingBlueprint] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);

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
    api<ClassView & { members?: EnrollmentView[] }>(`/classes/${classId}`).then(async (value) => {
      if (!live) return;
      setClassItem(value); setMembers(value.members || []);
      const results = await Promise.allSettled([
        api<{ blueprint: BlueprintView }>(`/classes/${classId}/study-blueprint`),
        api<PageResult<MaterialView>>(`/courses/${value.courseId}/materials?cursor=`),
        api<CourseView>(`/courses/${value.courseId}`),
      ]);
      if (!live) return;
      if (results[0].status === "fulfilled") setBlueprint(results[0].value.blueprint); else setBlueprint(null);
      if (results[1].status === "fulfilled") setMaterials(results[1].value.items || []);
      if (results[2].status === "fulfilled") setCourse(results[2].value);
    }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [classId]);

  const createInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError(""); setNotice(""); setInvite(null);
    const rawUses = String(form.get("maxUses") || ""); const rawHours = String(form.get("expiresInHours") || "");
    try { const response = await api<{ inviteCode: string; expiresAt?: string }>(`/classes/${classId}/invitations`, { method: "POST", body: jsonBody({ ...(rawHours ? { expiresInHours: Number(rawHours) } : {}), ...(rawUses ? { maxUses: Number(rawUses) } : {}) }) }); setInvite({ code: response.inviteCode, expiresAt: response.expiresAt }); setNotice("Convite criado. Copie o código agora; ele só aparece nesta tela uma vez."); formElement.reset(); setShowInviteForm(false); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const copyInvite = async () => { if (!invite) return; try { await navigator.clipboard.writeText(invite.code); setNotice("Código copiado."); } catch { setNotice("Selecione e copie o código exibido."); } };

  const saveBlueprint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const selectedIds = form.getAll("courseTopicId").map(String);
    if (!selectedIds.length) { setError("Selecione ao menos um tópico para montar o roteiro."); window.requestAnimationFrame(() => formElement.querySelector<HTMLInputElement>('input[name="courseTopicId"]')?.focus()); return; }
    setBusy(true); setError(""); setNotice("");
    const topics = selectedIds.map((courseTopicId) => ({ courseTopicId, competencyCode: String(form.get(`competency-${courseTopicId}`) || "").trim() }));
    try { const response = await api<{ blueprint: BlueprintView }>(`/classes/${classId}/study-blueprint`, { method: "PUT", body: jsonBody({ ...(blueprint ? { revision: blueprint.revision } : {}), topics, difficulty: form.get("difficulty") || "MIXED" }) }); setBlueprint(response.blueprint); setNotice("Roteiro salvo como rascunho."); formElement.reset(); setEditingBlueprint(false); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const publishBlueprint = async () => {
    if (!blueprint) return;
    const objectives = blueprint.objectives?.length ? blueprint.objectives.map((objective) => `• ${objective}`).join("\n") : "Nenhum objetivo informado.";
    const topics = [...blueprint.topics].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((topic) => `• ${topic.title || course?.topicItems?.find((item) => item.id === topic.courseTopicId)?.title || "Tópico"}${topic.competencyCode ? ` · ${topic.competencyCode}` : ""}`).join("\n") || "Nenhum tópico selecionado.";
    const review = `Título: ${blueprint.title || course?.title || "Disciplina"}\n\nObjetivos revisados:\n${objectives}\n\nTópicos e competências:\n${topics}`;
    askConfirmation({ title: "Publicar roteiro de estudo?", description: `Os alunos elegíveis poderão consultar estes tópicos e objetivos. Provas e gabaritos continuam privados.\n\n${review}`, confirmLabel: "Publicar roteiro", operation: async () => { const response = await api<{ blueprint: BlueprintView }>(`/classes/${classId}/study-blueprint/publications`, { method: "POST", body: jsonBody({ revision: blueprint.revision }) }); setBlueprint(response.blueprint); setNotice("Roteiro publicado para esta turma."); } });
  };

  const removeEnrollment = async (userId: string) => {
    const member = members.find((item) => item.userId === userId);
    const memberName = member?.name || member?.email || "esta pessoa";
    askConfirmation({ title: "Remover matrícula", description: `${memberName} perderá o acesso aos materiais e ao roteiro liberados por esta turma.`, confirmLabel: "Remover matrícula", variant: "danger", operation: async () => { await api(`/classes/${classId}/enrollments/${userId}`, { method: "DELETE" }); setMembers((items) => items.filter((item) => item.userId !== userId)); setNotice("Matrícula removida."); } });
  };

  const leaveClass = async () => {
    if (!session?.user.id) return;
    askConfirmation({ title: "Sair desta turma?", description: "Você perderá acesso aos materiais liberados por ela.", confirmLabel: "Sair da turma", variant: "danger", operation: async () => { await api(`/classes/${classId}/enrollments/${session.user.id}`, { method: "DELETE" }); router.replace("/app/turmas"); } });
  };

  if (loading) return <LoadingBlock label="Abrindo turma…" />;
  if (!classItem) return <div className="page-stack"><Notice tone="error" title="Turma indisponível">{error}</Notice><Link className="text-link" href="/app/turmas">Voltar às turmas<ArrowRight size={14} /></Link></div>;
  const teacher = persona === "TEACHER";
  const courseTitle = course?.title;
  const publishedBlueprint = blueprint?.state === "PUBLISHED";
  const classMaterials = materials.filter((material) => material.classification === "ACADEMIC" && (material.releases || []).some((release) => release.classId === classId && release.releasedAt && !release.revokedAt));

  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/turmas">Turmas</Link><span>/</span><span>{classItem.name}</span></div><PageTitle eyebrow={courseTitle || "TURMA"} title={classItem.name} description={`${classItem.period || "Período não informado"}${classItem.studentCount == null ? "" : ` · ${studentLabel(classItem.studentCount)}`}`} actions={<>{!teacher && <Button variant="danger" disabled={busy} onClick={() => void leaveClass()}>Sair da turma</Button>}<Button variant="secondary" onClick={() => router.push("/app/disciplinas")}><BookOpen size={15} />Ver disciplinas</Button></>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Atualização concluída">{notice}</Notice>}
    <div className="course-detail-grid"><Panel title="Materiais liberados" detail="Só aparecem aqui os conteúdos liberados para esta turma.">{classMaterials.length ? <div className="resource-list">{classMaterials.map((material) => <div className="resource-row" key={material.id}><span className="resource-icon"><BookOpen size={17} /></span><span className="resource-main"><strong>{material.title}</strong><small>{materialKindLabel(material.kind)}</small>{material.documents?.map((document) => <Link key={document.id} className="document-link" href={`/app/materiais/${document.id}`}>{document.name}<span>{documentStatusLabel(document.status)}</span></Link>)}</span></div>)}</div> : <EmptyState title="Sem materiais visíveis nesta turma" detail="Quando conteúdos forem liberados, eles aparecerão aqui." />}{classMaterials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`documents-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos anteriores · ${material.title}`}</Button></div>)}</Panel>
      <Panel title="Roteiro de estudo" detail="Somente tópicos e competências são compartilhados com a turma.">
        {publishedBlueprint ? <><span className="tag tag-sage">Publicado para esta turma</span>{blueprint.objectives?.length ? <><h3>Objetivos revisados</h3><ul className="blueprint-list">{blueprint.objectives.map((objective, index) => <li key={`objective-${index}`}>{objective}</li>)}</ul></> : null}<h3>Tópicos e competências</h3><ul className="blueprint-list">{blueprint.topics.map((topic, index) => { const title = topic.title || course?.topicItems?.find((item) => item.id === topic.courseTopicId)?.title || "Tópico"; return <li key={`${topic.courseTopicId}-${index}`}>{title}{topic.competencyCode && <span className="blueprint-code"> · {topic.competencyCode}</span>}</li>; })}</ul>{teacher && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setError(""); setEditingBlueprint(true); }}>Preparar nova revisão</Button>}</>
          : !teacher ? <EmptyState title="Roteiro ainda não publicado" detail="Quem conduz a turma pode compartilhar uma lista de tópicos e competências para orientar os estudos." />
            : <div className="page-stack">{blueprint?.state === "DRAFT" ? <><span className="tag tag-neutral">Rascunho privado</span><p>{blueprint.topics.length} {blueprint.topics.length === 1 ? "tópico selecionado" : "tópicos selecionados"} para esta turma.</p><ul className="blueprint-list">{blueprint.topics.map((topic) => <li key={topic.courseTopicId}>{topic.title || course?.topicItems?.find((item) => item.id === topic.courseTopicId)?.title || "Tópico"}{topic.competencyCode && <span className="blueprint-code"> · {topic.competencyCode}</span>}</li>)}</ul><div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => { setError(""); setEditingBlueprint(true); }}>Editar roteiro</Button><Button type="button" disabled={busy} onClick={() => void publishBlueprint()}>Publicar roteiro</Button></div></> : <><EmptyState title="Roteiro ainda não configurado" detail="Escolha tópicos para orientar os estudos da turma. Será possível revisar antes de publicar." />{!course?.topicItems?.length && <p className="inline-help">Cadastre tópicos na disciplina antes de preparar o roteiro.</p>}<Button type="button" variant="secondary" disabled={busy || !course?.topicItems?.length} onClick={() => { setError(""); setEditingBlueprint(true); }}>Preparar roteiro</Button></>}</div>}
      </Panel></div>
    {teacher && <div className="course-detail-grid"><Panel title="Convites" detail="O código aparece apenas ao ser criado. Compartilhe com seus alunos."><Button type="button" variant="secondary" onClick={() => { setError(""); setShowInviteForm(true); }}><Plus size={15} />Criar convite</Button>{invite && <div className="invite-result"><span className="invite-code">{invite.code}</span><Button type="button" variant="secondary" onClick={() => void copyInvite()}><Clipboard size={15} />Copiar código</Button>{invite.expiresAt && <small>Expira em {new Date(invite.expiresAt).toLocaleString("pt-BR")}</small>}</div>}</Panel>
      <Panel title="Pessoas na turma" detail={members.length ? enrollmentLabel(members.length) : "A lista segue as permissões do seu contexto."}>{members.length ? <div className="resource-list">{members.map((member) => <div className="resource-row" key={member.userId}><span className="avatar small-avatar">{(member.name || member.email || "?").charAt(0).toUpperCase()}</span><span className="resource-main"><strong>{member.name || "Estudante"}</strong><small>{member.email || enrollmentStatusLabel(member.status)}</small></span>{teacher && <Button type="button" variant="ghost" disabled={busy} onClick={() => void removeEnrollment(member.userId)}>Remover</Button>}</div>)}</div> : <EmptyState title="Nenhuma matrícula para mostrar" detail="Os participantes aparecem conforme as permissões da turma." />}</Panel></div>}
    <Modal open={editingBlueprint} onClose={() => setEditingBlueprint(false)} title="Editar roteiro de estudo" description="O roteiro é salvo como rascunho privado até ser publicado." busy={busy}>
      {error && <p id={error.startsWith("Selecione ao menos um tópico") ? "blueprint-topic-error" : undefined} className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void saveBlueprint(event)}>
        <div className="field full-span" aria-describedby={error.startsWith("Selecione ao menos um tópico") ? "blueprint-topic-error" : undefined}><span>Tópicos que podem ser compartilhados</span>{course?.topicItems?.length ? <div className="blueprint-options">{course.topicItems.map((item, index) => { const existing = blueprint?.topics.find((topic) => topic.courseTopicId === item.id); return <div className="blueprint-option" key={item.id}><label><input type="checkbox" name="courseTopicId" value={item.id} defaultChecked={Boolean(existing)} aria-invalid={index === 0 && error.startsWith("Selecione ao menos um tópico") || undefined} /><span>{item.title}</span></label><input className="input" name={`competency-${item.id}`} defaultValue={existing?.competencyCode || ""} aria-label={`Código de competência para ${item.title}`} placeholder="Código de competência (opcional)" /></div>; })}</div> : <div className="inline-help">Cadastre tópicos na disciplina antes de preparar o roteiro.</div>}</div>
        <label className="field"><span>Nível geral</span><select className="input" name="difficulty" defaultValue={blueprint?.difficulty || "MIXED"}><option value="MIXED">Variado</option><option value="EASY">Introdutório</option><option value="MEDIUM">Intermediário</option><option value="HARD">Avançado</option></select></label>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={() => setEditingBlueprint(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || !course?.topicItems?.length}>Salvar rascunho</Button></div>
      </form>
    </Modal>
    <Modal open={showInviteForm} onClose={() => setShowInviteForm(false)} title="Criar convite" description="O código aparece uma única vez nesta tela. Copie-o antes de sair." busy={busy}>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <form className="form-grid" onSubmit={(event) => void createInvite(event)}><label className="field"><span>Validade <small>(horas, opcional)</small></span><input className="input" name="expiresInHours" type="number" min="1" placeholder="Sem expiração definida" /></label><label className="field"><span>Número máximo de usos <small>(opcional)</small></span><input className="input" name="maxUses" type="number" min="1" placeholder="Sem limite definido" /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowInviteForm(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}><Plus size={15} />{busy ? "Criando…" : "Criar convite"}</Button></div></form>
    </Modal>
    <ConfirmModal open={Boolean(confirmation)} onClose={() => { setConfirmation(null); setConfirmationError(""); }} title={confirmation?.title || "Confirmar ação"} description={`${confirmation?.description || ""}${confirmationError ? `\n\n${confirmationError}` : ""}`} confirmLabel={confirmation?.confirmLabel} variant={confirmation?.variant} onConfirm={confirmPendingAction} busy={busy}>
      {confirmationError && <p className="inline-error" role="alert">{confirmationError}</p>}
    </ConfirmModal>
  </div>;
}
