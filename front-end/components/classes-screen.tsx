"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorCopy, jsonBody } from "@/lib/api";
import type { ClassView, CourseView, MaterialView, PageResult } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { ArrowRight, BookOpen, Clipboard, GraduationCap, Link2, Plus, UsersRound } from "lucide-react";
import { useMaterialDocumentPages } from "@/lib/use-material-document-pages";

type EnrollmentView = { userId: string; name?: string; email?: string; role?: string; status?: string };
type BlueprintTopic = { courseTopicId: string; title?: string; position?: number; competencyCode: string | null };
type BlueprintView = { id: string; classId: string; revision: number; state: "DRAFT" | "PUBLISHED"; title?: string; objectives?: string[]; topics: BlueprintTopic[]; difficulty: "EASY" | "MEDIUM" | "HARD" | "MIXED"; publishedAt?: string | null };

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

  return <div className="page-stack"><PageTitle eyebrow="AULAS E CONTEXTOS" title="Turmas" description={persona === "TEACHER" ? "Convide sua turma e acompanhe os materiais liberados." : "Acompanhe seus grupos e entre usando um convite de quem conduz a turma."} actions={persona === "STUDENT" ? <Button variant="secondary" onClick={() => setShowJoin((value) => !value)}><Link2 size={16} />Entrar com convite</Button> : undefined} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Tudo certo">{notice}</Notice>}
    {showJoin && <Panel title="Entrar em uma turma" detail="Use o código de convite enviado por quem conduz a turma."><form className="inline-form" onSubmit={join}><label className="field"><span>Código do convite</span><input className="input" name="code" required autoCapitalize="characters" placeholder="Cole ou digite o código" /></label><Button type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar na turma"}<ArrowRight size={15} /></Button></form></Panel>}
    <div className="class-grid">{loading ? <Panel><LoadingBlock label="Carregando turmas…" /></Panel> : classes.length ? classes.map((classItem) => <Link className="class-tile" href={`/app/turmas/${classItem.id}`} key={classItem.id}><div className="class-tile-top"><span className="class-icon"><UsersRound size={19} /></span><span className="tag tag-neutral">{classItem.period || "Turma"}</span></div><strong>{classItem.name}</strong><p>{courses.find((course) => course.id === classItem.courseId)?.title || "Disciplina"}</p><span className="class-meta"><span>{classItem.studentCount != null && <><GraduationCap size={14} />{classItem.studentCount} estudantes</>}</span><span>Abrir turma<ArrowRight size={14} /></span></span></Link>) : <Panel className="class-empty"><EmptyState title={persona === "TEACHER" ? "Nenhuma turma criada" : "Você ainda não entrou em uma turma"} detail={persona === "TEACHER" ? "Abra uma disciplina para criar uma turma e gerar convites." : "Entre com o código recebido ou continue estudando no seu espaço pessoal."} action={persona === "TEACHER" ? "Ver disciplinas" : "Ver disciplinas"} href="/app/disciplinas" /></Panel>}</div>
    {classesCursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void loadMore("classes")}>{busy ? "Carregando…" : "Carregar mais turmas"}</Button>}
    {persona === "TEACHER" && courses.length > 0 && <Panel title="Criar uma turma" detail="A turma fica vinculada a uma disciplina."><form className="inline-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); try { const courseId = String(form.get("courseId")); const created = await api<ClassView>(`/courses/${courseId}/classes`, { method: "POST", body: jsonBody({ name: form.get("name"), period: form.get("period") }) }); if (created?.id) setClasses((items) => [created, ...items]); else setReloadKey((value) => value + 1); setNotice("Turma criada."); (event.currentTarget as HTMLFormElement).reset(); } catch (caught) { setError(errorCopy(caught)); } finally { setBusy(false); } }}><label className="field"><span>Disciplina</span><select className="input" name="courseId" required defaultValue=""><option value="" disabled>Escolha uma disciplina</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label className="field"><span>Nome da turma</span><input className="input" name="name" required placeholder="Ex.: Bioquímica — Noite" /></label><label className="field"><span>Período</span><input className="input" name="period" placeholder="Ex.: 2026.2" /></label><Button type="submit" disabled={busy}><Plus size={15} />{busy ? "Criando…" : "Criar turma"}</Button></form>{coursesCursor && <Button type="button" variant="ghost" disabled={busy} onClick={() => void loadMore("courses")}>{busy ? "Carregando…" : "Carregar mais disciplinas"}</Button>}</Panel>}
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
  const { loadMore: loadMoreDocuments, loadingIds: documentLoading, errors: documentErrors } = useMaterialDocumentPages(materials, setMaterials);

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
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setInvite(null);
    const rawUses = String(form.get("maxUses") || ""); const rawHours = String(form.get("expiresInHours") || "");
    try { const response = await api<{ inviteCode: string; expiresAt?: string }>(`/classes/${classId}/invitations`, { method: "POST", body: jsonBody({ ...(rawHours ? { expiresInHours: Number(rawHours) } : {}), ...(rawUses ? { maxUses: Number(rawUses) } : {}) }) }); setInvite({ code: response.inviteCode, expiresAt: response.expiresAt }); setNotice("Convite criado. Copie o código agora; ele só aparece nesta tela uma vez."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const copyInvite = async () => { if (!invite) return; try { await navigator.clipboard.writeText(invite.code); setNotice("Código copiado."); } catch { setNotice("Selecione e copie o código exibido."); } };

  const saveBlueprint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    const selectedIds = form.getAll("courseTopicId").map(String);
    const topics = selectedIds.map((courseTopicId) => ({ courseTopicId, competencyCode: String(form.get(`competency-${courseTopicId}`) || "").trim() || null }));
    try { const response = await api<{ blueprint: BlueprintView }>(`/classes/${classId}/study-blueprint`, { method: "PUT", body: jsonBody({ ...(blueprint ? { revision: blueprint.revision } : {}), topics, difficulty: form.get("difficulty") || "MIXED" }) }); setBlueprint(response.blueprint); setNotice("Roteiro salvo como rascunho."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const publishBlueprint = async () => {
    if (!blueprint) return;
    const objectives = blueprint.objectives?.length ? blueprint.objectives.map((objective) => `• ${objective}`).join("\n") : "Nenhum objetivo informado.";
    const topics = [...blueprint.topics].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((topic) => `• ${topic.title || course?.topicItems?.find((item) => item.id === topic.courseTopicId)?.title || "Tópico"}${topic.competencyCode ? ` · ${topic.competencyCode}` : ""}`).join("\n") || "Nenhum tópico selecionado.";
    const review = `Título: ${blueprint.title || course?.title || "Disciplina"}\n\nObjetivos revisados:\n${objectives}\n\nTópicos e competências:\n${topics}`;
    if (!window.confirm(`Revise os assuntos e objetivos que serão compartilhados com todos os alunos elegíveis. A publicação só inclui tópicos e competências; provas e gabaritos privados não são compartilhados.\n\n${review}\n\nPublicar este roteiro?`)) return;
    setBusy(true); setError("");
    try { const response = await api<{ blueprint: BlueprintView }>(`/classes/${classId}/study-blueprint/publications`, { method: "POST", body: jsonBody({ revision: blueprint.revision }) }); setBlueprint(response.blueprint); setNotice("Roteiro publicado para esta turma."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const removeEnrollment = async (userId: string) => {
    if (!window.confirm("Remover esta matrícula da turma?")) return;
    setBusy(true); setError("");
    try { await api(`/classes/${classId}/enrollments/${userId}`, { method: "DELETE" }); setMembers((items) => items.filter((item) => item.userId !== userId)); setNotice("Matrícula removida."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const leaveClass = async () => {
    if (!session?.user.id || !window.confirm("Sair desta turma? Você perderá acesso aos materiais que foram liberados por ela.")) return;
    setBusy(true); setError("");
    try { await api(`/classes/${classId}/enrollments/${session.user.id}`, { method: "DELETE" }); router.replace("/app/turmas"); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingBlock label="Abrindo turma…" />;
  if (!classItem) return <div className="page-stack"><Notice tone="error" title="Turma indisponível">{error}</Notice><Link className="text-link" href="/app/turmas">Voltar às turmas<ArrowRight size={14} /></Link></div>;
  const teacher = persona === "TEACHER";
  const courseTitle = course?.title;
  const publishedBlueprint = blueprint?.state === "PUBLISHED" && !editingBlueprint;
  const classMaterials = materials.filter((material) => material.classification === "ACADEMIC" && (material.releases || []).some((release) => release.classId === classId && release.releasedAt && !release.revokedAt));

  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/turmas">Turmas</Link><span>/</span><span>{classItem.name}</span></div><PageTitle eyebrow={courseTitle || "TURMA"} title={classItem.name} description={`${classItem.period || "Período não informado"}${classItem.studentCount == null ? "" : ` · ${classItem.studentCount} estudantes`}`} actions={<>{!teacher && <Button variant="danger" disabled={busy} onClick={() => void leaveClass()}>Sair da turma</Button>}<Button variant="secondary" onClick={() => router.push("/app/disciplinas")}><BookOpen size={15} />Ver disciplinas</Button></>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Atualização concluída">{notice}</Notice>}
    <div className="course-detail-grid"><Panel title="Materiais liberados" detail="Só aparecem aqui os conteúdos liberados para esta turma.">{classMaterials.length ? <div className="resource-list">{classMaterials.map((material) => <div className="resource-row" key={material.id}><span className="resource-icon"><BookOpen size={17} /></span><span className="resource-main"><strong>{material.title}</strong><small>{material.kind}</small>{material.documents?.map((document) => <Link key={document.id} className="document-link" href={`/app/materiais/${document.id}`}>{document.name}<span>{document.status}</span></Link>)}</span></div>)}</div> : <EmptyState title="Sem materiais visíveis nesta turma" detail="Quando conteúdos forem liberados, eles aparecerão aqui." />}{classMaterials.filter((material) => material.documentsNextCursor).map((material) => <div className="document-paging" key={`documents-${material.id}`}>{documentErrors[material.id] && <p className="inline-error" role="alert">{documentErrors[material.id]}</p>}<Button type="button" variant="ghost" disabled={Boolean(documentLoading[material.id])} onClick={() => void loadMoreDocuments(material.id)}>{documentLoading[material.id] ? "Carregando arquivos…" : `Carregar arquivos anteriores · ${material.title}`}</Button></div>)}</Panel>
      <Panel title="Roteiro de estudo" detail="Somente tópicos e competências são compartilhados com a turma.">
        {publishedBlueprint ? <><span className="tag tag-sage">Publicado para esta turma</span>{blueprint.objectives?.length ? <><h3>Objetivos revisados</h3><ul className="blueprint-list">{blueprint.objectives.map((objective, index) => <li key={`objective-${index}`}>{objective}</li>)}</ul></> : null}<h3>Tópicos e competências</h3><ul className="blueprint-list">{blueprint.topics.map((topic, index) => { const title = topic.title || course?.topicItems?.find((item) => item.id === topic.courseTopicId)?.title || "Tópico"; return <li key={`${topic.courseTopicId}-${index}`}>{title}{topic.competencyCode && <span className="blueprint-code"> · {topic.competencyCode}</span>}</li>; })}</ul>{teacher && <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditingBlueprint(true)}>Preparar nova revisão</Button>}</>
          : !teacher ? <EmptyState title="Roteiro ainda não publicado" detail="Quem conduz a turma pode compartilhar uma lista de tópicos e competências para orientar os estudos." />
            : <form className="form-grid" onSubmit={(event) => void saveBlueprint(event)}>
              <div className="field full-span"><span>Tópicos que podem ser compartilhados</span>{course?.topicItems?.length ? <div className="blueprint-options">{course.topicItems.map((item) => { const existing = blueprint?.topics.find((topic) => topic.courseTopicId === item.id); return <div className="blueprint-option" key={item.id}><label><input type="checkbox" name="courseTopicId" value={item.id} defaultChecked={Boolean(existing)} /><span>{item.title}</span></label><input className="input" name={`competency-${item.id}`} defaultValue={existing?.competencyCode || ""} aria-label={`Código de competência para ${item.title}`} placeholder="Código de competência (opcional)" /></div>; })}</div> : <div className="inline-help">Cadastre tópicos na disciplina antes de preparar o roteiro público.</div>}</div>
              <label className="field"><span>Nível geral</span><select className="input" name="difficulty" defaultValue={blueprint?.difficulty || "MIXED"}><option value="MIXED">Variado</option><option value="EASY">Introdutório</option><option value="MEDIUM">Intermediário</option><option value="HARD">Avançado</option></select></label>
              <div className="form-actions"><Button type="submit" disabled={busy || !course?.topicItems?.length}>Salvar rascunho</Button>{blueprint?.state === "DRAFT" && <Button type="button" variant="secondary" disabled={busy} onClick={() => void publishBlueprint()}>Publicar roteiro</Button>}</div>
            </form>}
      </Panel></div>
    {teacher && <div className="course-detail-grid"><Panel title="Convites" detail="O código aparece apenas ao ser criado. Compartilhe com seus alunos."><form className="form-grid" onSubmit={(event) => void createInvite(event)}><label className="field"><span>Validade <small>(horas, opcional)</small></span><input className="input" name="expiresInHours" type="number" min="1" placeholder="Sem expiração definida" /></label><label className="field"><span>Número máximo de usos <small>(opcional)</small></span><input className="input" name="maxUses" type="number" min="1" placeholder="Sem limite definido" /></label><div className="form-actions"><Button type="submit" disabled={busy}><Plus size={15} />Criar convite</Button></div></form>{invite && <div className="invite-result"><span className="invite-code">{invite.code}</span><Button type="button" variant="secondary" onClick={() => void copyInvite()}><Clipboard size={15} />Copiar código</Button>{invite.expiresAt && <small>Expira em {new Date(invite.expiresAt).toLocaleString("pt-BR")}</small>}</div>}</Panel>
      <Panel title="Pessoas na turma" detail={members.length ? `${members.length} matrículas` : "A lista segue as permissões do seu contexto."}>{members.length ? <div className="resource-list">{members.map((member) => <div className="resource-row" key={member.userId}><span className="avatar small-avatar">{(member.name || member.email || "?").charAt(0).toUpperCase()}</span><span className="resource-main"><strong>{member.name || "Estudante"}</strong><small>{member.email || member.status || "Matrícula ativa"}</small></span>{teacher && <Button type="button" variant="ghost" disabled={busy} onClick={() => void removeEnrollment(member.userId)}>Remover</Button>}</div>)}</div> : <EmptyState title="Nenhuma matrícula para mostrar" detail="Os participantes aparecem conforme as permissões da turma." />}</Panel></div>}
  </div>;
}
