"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The home screen initializes request state before loading remote data. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorCopy } from "@/lib/api";
import type { ClassView, CourseView, PageResult, UsageView } from "@/lib/types";
import { useSession } from "./session-context";
import { EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { ArrowRight, BookOpen, CircleHelp, FileText, GraduationCap, MessageCircle, Plus, Sparkles, UsersRound } from "lucide-react";

export function WorkspaceHome() {
  const { session, activeWorkspace, persona } = useSession();
  const [courses, setCourses] = useState<CourseView[]>([]);
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeWorkspace) { setLoading(false); return; }
    let live = true;
    setLoading(true); setError("");
    Promise.allSettled([
      api<PageResult<CourseView>>(`/workspaces/${activeWorkspace.id}/courses?cursor=`),
      api<PageResult<ClassView>>(`/classes?cursor=`),
      api<UsageView>("/me/usage"),
    ]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") setCourses(results[0].value.items || []);
      else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") {
        const belonging = results[1].value.items.filter((item) => item.workspaceId === activeWorkspace.id);
        setClasses(belonging);
      }
      if (results[2].status === "fulfilled") setUsage(results[2].value);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [activeWorkspace]);

  const firstName = session?.user.name.trim().split(/\s+/)[0] || "por aqui";
  const isTeacher = persona === "TEACHER";
  const usageSummary = usage?.items?.find((metric) => /generation|ia|ai/i.test(metric.metric));

  return <div className="page-stack">
    <div className="welcome-band"><div><p className="eyebrow">{activeWorkspace?.name || "Seu espaço"}</p><PageTitle title={`Olá, ${firstName}.`} description={isTeacher ? "O que vamos organizar para a próxima aula?" : "Vamos dar sequência ao que você está aprendendo?"} /></div><div className="welcome-decoration" aria-hidden="true">✳</div></div>
    {!activeWorkspace && <Notice tone="warning" title="Seu espaço ainda não está disponível">Entre novamente ou peça acesso a um workspace para continuar.</Notice>}
    {error && <Notice tone="error" title="Não foi possível carregar suas disciplinas">{error}<span className="notice-code">Os outros recursos podem continuar disponíveis.</span></Notice>}

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
      <Panel title={isTeacher ? "Suas disciplinas" : "Continue aprendendo"} detail={courses.length ? `${courses.length} ${courses.length === 1 ? "disciplina" : "disciplinas"} neste espaço` : undefined}>
        {loading ? <LoadingBlock label="Buscando suas disciplinas…" /> : courses.length === 0 ? <EmptyState title="Seu espaço está pronto" detail={isTeacher ? "Crie uma disciplina para reunir conteúdos, aulas e avaliações." : "Quando uma disciplina estiver disponível para você, ela aparecerá aqui."} action={isTeacher ? "Criar disciplina" : "Ver opções de estudo"} href={isTeacher ? "/app/disciplinas" : "/app/conversas"} /> : <div className="resource-list">{courses.slice(0, 5).map((course) => <Link className="resource-row" href={`/app/disciplinas/${course.id}`} key={course.id}><span className="resource-icon"><BookOpen size={18} /></span><span className="resource-main"><strong>{course.title}</strong><small>{course.description || (course.topics?.length ? `${course.topics.length} tópicos` : "Abra para ver conteúdos e próximos passos")}</small></span><ArrowRight size={16} /></Link>)}</div>}
        {courses.length > 5 && <Link className="panel-footer-link" href="/app/disciplinas">Ver todas as disciplinas<ArrowRight size={14} /></Link>}
      </Panel>
      <Panel title={isTeacher ? "Turmas" : "Suas turmas"} detail={classes.length ? `${classes.length} no contexto atual` : undefined}>
        {loading ? <LoadingBlock label="Buscando suas turmas…" /> : classes.length === 0 ? <EmptyState title={isTeacher ? "Suas aulas começam aqui" : "Ainda sem turmas"} detail={isTeacher ? "Crie uma turma em uma disciplina e convide seus alunos." : "Peça um convite à sua professora ou continue seus estudos individuais."} action={isTeacher ? "Ver disciplinas" : "Estudar por conta própria"} href={isTeacher ? "/app/disciplinas" : "/app/simulados"} /> : <div className="resource-list">{classes.slice(0, 4).map((classItem) => <Link className="resource-row" href={`/app/turmas/${classItem.id}`} key={classItem.id}><span className="resource-icon sage"><UsersRound size={18} /></span><span className="resource-main"><strong>{classItem.name}</strong><small>{classItem.period || "Turma"}{classItem.studentCount === undefined ? "" : ` · ${classItem.studentCount} estudantes`}</small></span><ArrowRight size={16} /></Link>)}</div>}
      </Panel>
    </div>

    <div className="gentle-prompt"><span className="prompt-sparkle"><Sparkles size={18} /></span><div><strong>{isTeacher ? "Prepare uma aula com o que já tem." : "Uma dúvida pode abrir outra ideia."}</strong><p>{isTeacher ? "Adicione materiais à disciplina e mantenha a liberação sob seu controle." : "Pergunte ao tutor sobre materiais liberados para você; cada resposta mostra suas fontes."}</p></div><Link href={isTeacher ? "/app/disciplinas" : "/app/conversas"} aria-label={isTeacher ? "Organizar materiais" : "Abrir tutor"}><ArrowRight size={18} /></Link></div>
    <div className="home-footnote"><CircleHelp size={15} />O que aparece em cada contexto depende dos acessos concedidos pela sua escola ou professora.</div>
  </div>;
}
