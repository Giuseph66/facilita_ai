"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The home screen initializes request state before loading remote data. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorCopy } from "@/lib/api";
import type { ClassView, ConversationMessage, ConversationView, CourseView, MaterialView, OllamaConnectionView, PageResult, UsageView } from "@/lib/types";
import { useSession } from "./session-context";
import { EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { ArrowRight, BookOpen, Check, CircleHelp, FileText, GraduationCap, MessageCircle, Plus, Sparkles, UsersRound } from "lucide-react";

type OnboardingChecks = { ai: boolean | null; course: boolean | null; material: boolean | null; question: boolean | null };

async function checkUploadedMaterial(courseIds: string[]) {
  if (!courseIds.length) return false;
  const results = await Promise.allSettled(courseIds.slice(0, 10).map((courseId) => api<PageResult<MaterialView>>(`/courses/${courseId}/materials?cursor=`)));
  if (results.some((result) => result.status === "fulfilled" && (result.value.items || []).some((material) => Boolean(material.documents?.length)))) return true;
  return results.every((result) => result.status === "fulfilled") ? false : null;
}

async function checkAskedQuestion(conversations: ConversationView[]) {
  if (!conversations.length) return false;
  const results = await Promise.allSettled(conversations.slice(0, 5).map((conversation) => api<PageResult<ConversationMessage>>(`/conversations/${conversation.id}/messages?cursor=`)));
  if (results.some((result) => result.status === "fulfilled" && (result.value.items || []).some((message) => ["USER", "user"].includes(message.role)))) return true;
  return results.every((result) => result.status === "fulfilled") ? false : null;
}

export function WorkspaceHome() {
  const { session, activeWorkspace, persona } = useSession();
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [coursesHaveMore, setCoursesHaveMore] = useState(false);
  const [classesHaveMore, setClassesHaveMore] = useState(false);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [onboardingChecks, setOnboardingChecks] = useState<OnboardingChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setError(""); setOnboardingChecks(null); setCoursesHaveMore(false); setClassesHaveMore(false);
    const coursePath = persona === "TEACHER" && activeWorkspace ? `/workspaces/${activeWorkspace.id}/courses?cursor=` : "/me/courses?cursor=";
    Promise.allSettled([
      api<PageResult<CourseView>>(coursePath),
      api<PageResult<ClassView>>(`/classes?cursor=`),
      api<UsageView>("/me/usage"),
      api<{ items: OllamaConnectionView[] }>("/ai/connections"),
      api<PageResult<ConversationView>>("/conversations?cursor="),
      api<{ preferredModel: string | null }>("/ai/preferences"),
    ]).then(async (results) => {
      if (!live) return;
      const courseItems = results[0].status === "fulfilled" ? results[0].value.items || [] : [];
      const classItems = results[1].status === "fulfilled" ? results[1].value.items || [] : [];
      const visibleClasses = persona === "TEACHER" && activeWorkspace
        ? classItems.filter((item) => item.workspaceId === activeWorkspace.id)
        : classItems;
      if (results[0].status === "fulfilled") setCourses(courseItems);
      else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") {
        setClasses(visibleClasses);
      }
      if (results[0].status === "fulfilled") setCoursesHaveMore(Boolean(results[0].value.nextCursor));
      if (results[1].status === "fulfilled") setClassesHaveMore(Boolean(results[1].value.nextCursor));
      if (results[2].status === "fulfilled") setUsage(results[2].value);
      setLoading(false);
      const aiComplete = results[3].status === "fulfilled" && results[5].status === "fulfilled"
        ? results[3].value.items.some((key) => key.status === "CONNECTED") && Boolean(results[5].value.preferredModel)
        : null;
      const courseIds = Array.from(new Set([...courseItems.map((course) => course.id), ...visibleClasses.map((classItem) => classItem.courseId)]));
      const courseComplete = results[0].status === "fulfilled" ? courseItems.length > 0 || visibleClasses.length > 0 : results[1].status === "fulfilled" ? visibleClasses.length > 0 : null;
      const materialComplete = courseIds.length ? await checkUploadedMaterial(courseIds) : courseComplete === false ? false : null;
      const questionComplete = results[4].status === "fulfilled" ? await checkAskedQuestion(results[4].value.items || []) : null;
      if (live) setOnboardingChecks({ ai: aiComplete, course: courseComplete, material: materialComplete, question: questionComplete });
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace, persona]);

  const firstName = session?.user.name.trim().split(/\s+/)[0] || "por aqui";
  const isTeacher = persona === "TEACHER";
  const usageSummary = usage?.items?.find((metric) => /generation|ia|ai/i.test(metric.metric));
  const courseCountDetail = courses.length
    ? `${courses.length} ${courses.length === 1 ? "disciplina" : "disciplinas"} ${coursesHaveMore ? courses.length === 1 ? "carregada" : "carregadas" : courses.length === 1 ? "disponível" : "disponíveis"} neste espaço`
    : undefined;
  const classCountDetail = classes.length
    ? `${classes.length} ${classes.length === 1 ? "turma" : "turmas"} ${classesHaveMore ? classes.length === 1 ? "carregada" : "carregadas" : "no contexto atual"}`
    : undefined;
  const onboardingSteps = isTeacher ? [
    { key: "ai" as const, title: "Configurar sua IA", detail: "Verifique a chave e salve um modelo para gerar conteúdo.", href: "/app/configuracoes/ia" },
    { key: "course" as const, title: "Criar uma disciplina", detail: "Reúna aulas e materiais em uma disciplina.", href: "/app/disciplinas" },
    { key: "material" as const, title: "Enviar um material", detail: "Adicione um PDF ou PPTX pronto para usar.", href: "/app/disciplinas" },
    { key: "question" as const, title: "Fazer a primeira pergunta", detail: "Pergunte sobre o material da disciplina.", href: "/app/conversas" },
  ] : [
    { key: "ai" as const, title: "Configurar sua IA", detail: "Verifique a chave e salve um modelo para gerar conteúdo.", href: "/app/configuracoes/ia" },
    { key: "course" as const, title: "Abrir uma disciplina disponível", detail: "Entre em uma disciplina compartilhada com você.", href: "/app/disciplinas" },
    { key: "material" as const, title: "Abrir um material pronto", detail: "Use um arquivo liberado pela pessoa docente.", href: "/app/disciplinas" },
    { key: "question" as const, title: "Fazer a primeira pergunta", detail: "Pergunte ao tutor sobre o conteúdo compartilhado.", href: "/app/conversas" },
  ];
  const showOnboarding = onboardingChecks && onboardingSteps.some((step) => onboardingChecks[step.key] !== true);

  return <div className="page-stack">
    <div className="welcome-band"><div><p className="eyebrow">{activeWorkspace?.name || "Seu espaço"}</p><PageTitle title={`Olá, ${firstName}.`} description={isTeacher ? "O que vamos organizar para a próxima aula?" : "Vamos dar sequência ao que você está aprendendo?"} /></div><div className="welcome-decoration" aria-hidden="true">✳</div></div>
    {!activeWorkspace && <Notice tone="warning" title="Seu espaço ainda não está disponível">Entre novamente ou peça acesso a um workspace para continuar.</Notice>}
    {error && <Notice tone="error" title="Não foi possível carregar suas disciplinas">{error}<span className="notice-code">Os outros recursos podem continuar disponíveis.</span></Notice>}

    {showOnboarding && <Panel title="Primeiros passos" detail="Cada etapa é marcada quando o serviço confirma que ela foi concluída."><div className="resource-list">{onboardingSteps.map((step) => { const complete = onboardingChecks?.[step.key] ?? null; return <Link className="resource-row" href={step.href} key={step.key}><span className={`resource-icon ${complete === true ? "sage" : "terracotta"}`}>{complete === true ? <Check size={17} /> : <ArrowRight size={16} />}</span><span className="resource-main"><strong>{step.title}</strong><small>{complete === true ? "Concluído" : complete === false ? step.detail : "Não foi possível conferir agora. Abra para continuar."}</small></span>{complete === true ? <Check size={15} /> : <ArrowRight size={15} />}</Link>; })}</div></Panel>}

    <div className="quick-actions" aria-label="Ações rápidas">
      {isTeacher ? <>
        <Link href="/app/disciplinas" className="quick-action"><span className="quick-icon terracotta"><Plus size={18} /></span><span><strong>Nova disciplina</strong><small>Organize uma matéria</small></span><ArrowRight size={16} /></Link>
        <Link href="/app/turmas" className="quick-action"><span className="quick-icon sage"><UsersRound size={18} /></span><span><strong>Ver turmas</strong><small>Acompanhe suas aulas</small></span><ArrowRight size={16} /></Link>
        <Link href="/app/avaliacoes" className="quick-action"><span className="quick-icon sand"><FileText size={18} /></span><span><strong>Preparar avaliação</strong><small>Rascunhos sempre privados</small></span><ArrowRight size={16} /></Link>
      </> : <>
        <Link href="/app/conversas" className="quick-action"><span className="quick-icon terracotta"><MessageCircle size={18} /></span><span><strong>Perguntar ao tutor</strong><small>Com fontes do seu material</small></span><ArrowRight size={16} /></Link>
        <Link href="/app/simulados" className="quick-action"><span className="quick-icon sage"><GraduationCap size={18} /></span><span><strong>Fazer um simulado</strong><small>Respostas só ao entregar</small></span><ArrowRight size={16} /></Link>
        <Link href="/app/estudo" className="quick-action"><span className="quick-icon sand"><BookOpen size={18} /></span><span><strong>Meus materiais de estudo</strong><small>Resumos, cartões e planos</small></span><ArrowRight size={16} /></Link>
      </>}
    </div>

    {usageSummary && <div className="usage-strip"><span><Sparkles size={16} />Uso de IA neste período</span><strong>{usageSummary.used}{usageSummary.limit === null ? "" : ` de ${usageSummary.limit}`}</strong><Link href="/app/configuracoes/plano">Ver consumo<ArrowRight size={14} /></Link></div>}

    <div className="home-columns">
      <Panel title={isTeacher ? "Suas disciplinas" : "Continue aprendendo"} detail={courseCountDetail}>
        {loading ? <LoadingBlock label="Buscando suas disciplinas…" /> : courses.length === 0 ? <EmptyState title="Seu espaço está pronto" detail={isTeacher ? "Crie uma disciplina para reunir conteúdos, aulas e avaliações." : "Quando uma disciplina estiver disponível para você, ela aparecerá aqui."} action={isTeacher ? "Criar disciplina" : "Ver opções de estudo"} href={isTeacher ? "/app/disciplinas" : "/app/conversas"} /> : <div className="resource-list">{courses.slice(0, 5).map((course) => <Link className="resource-row" href={`/app/disciplinas/${course.id}`} key={course.id}><span className="resource-icon"><BookOpen size={18} /></span><span className="resource-main"><strong>{course.title}</strong><small>{course.description || (course.topics?.length ? `${course.topics.length} tópicos` : "Abra para ver conteúdos e próximos passos")}</small></span><ArrowRight size={16} /></Link>)}</div>}
        {courses.length > 5 && <Link className="panel-footer-link" href="/app/disciplinas">Ver todas as disciplinas<ArrowRight size={14} /></Link>}
      </Panel>
      <Panel title={isTeacher ? "Turmas" : "Suas turmas"} detail={classCountDetail}>
        {loading ? <LoadingBlock label="Buscando suas turmas…" /> : classes.length === 0 ? <EmptyState title={isTeacher ? "Suas aulas começam aqui" : "Ainda sem turmas"} detail={isTeacher ? "Crie uma turma em uma disciplina e convide estudantes." : "Peça um convite a quem conduz a turma ou continue seus estudos individuais."} action={isTeacher ? "Ver disciplinas" : "Estudar por conta própria"} href={isTeacher ? "/app/disciplinas" : "/app/simulados"} /> : <div className="resource-list">{classes.slice(0, 4).map((classItem) => <Link className="resource-row" href={`/app/turmas/${classItem.id}`} key={classItem.id}><span className="resource-icon sage"><UsersRound size={18} /></span><span className="resource-main"><strong>{classItem.name}</strong><small>{classItem.period || "Turma"}{classItem.studentCount == null ? "" : ` · ${classItem.studentCount} ${classItem.studentCount === 1 ? "estudante" : "estudantes"}`}</small></span><ArrowRight size={16} /></Link>)}</div>}
      </Panel>
    </div>

    <div className="gentle-prompt"><span className="prompt-sparkle"><Sparkles size={18} /></span><div><strong>{isTeacher ? "Prepare uma aula com o que já tem." : "Uma dúvida pode abrir outra ideia."}</strong><p>{isTeacher ? "Adicione materiais à disciplina e mantenha a liberação sob seu controle." : "Pergunte ao tutor sobre materiais liberados para você; cada resposta mostra suas fontes."}</p></div><Link href={isTeacher ? "/app/disciplinas" : "/app/conversas"} aria-label={isTeacher ? "Organizar materiais" : "Abrir tutor"}><ArrowRight size={18} /></Link></div>
    <div className="home-footnote"><CircleHelp size={15} />O que aparece em cada contexto depende dos acessos concedidos pela sua escola ou por quem conduz a turma.</div>
  </div>;
}
