"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api, errorCopy } from "@/lib/api";
import { workspaceSupportsPersona } from "@/lib/types";
import { SessionProvider, useSession } from "./session-context";
import { BookOpen, BookMarked, ChevronDown, CircleUserRound, GraduationCap, Home, Layers3, LogOut, Menu, MessageCircle, Settings2, Sparkles, UsersRound, X } from "lucide-react";
import { Button, LoadingBlock, Notice } from "./ui";

const navItems = [
  { href: "/app", label: "Início", icon: Home },
  { href: "/app/disciplinas", label: "Disciplinas", icon: BookOpen },
  { href: "/app/turmas", label: "Turmas", icon: UsersRound },
  { href: "/app/conversas", label: "Estudar com IA", icon: MessageCircle },
  { href: "/app/estudo", label: "Meus estudos", icon: BookMarked },
  { href: "/app/avaliacoes", label: "Avaliações", icon: Layers3, teacher: true },
  { href: "/app/simulados", label: "Simulados", icon: GraduationCap },
];

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { session, activeWorkspace, persona, loading, sessionError, setWorkspaceId, switchPersona, refreshSession } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    if (!loading && !session) router.replace("/entrar?next=%2Fapp");
  }, [loading, session, sessionError, router]);

  const allowed = useMemo(() => ({
    teacher: workspaceSupportsPersona(activeWorkspace, "TEACHER"),
    student: workspaceSupportsPersona(activeWorkspace, "STUDENT"),
  }), [activeWorkspace]);

  const doSwitchPersona = async (next: string) => {
    setSwitching(true); setSwitchError("");
    try { await switchPersona(next); }
    catch (caught) { setSwitchError(errorCopy(caught)); }
    finally { setSwitching(false); }
  };

  const logout = async () => {
    setLogoutBusy(true); setLogoutError("");
    try { await api("/auth/session", { method: "DELETE" }); router.replace("/"); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) router.replace("/");
      else setLogoutError(errorCopy(caught));
    } finally { setLogoutBusy(false); }
  };

  if (loading) return <main className="auth-loading"><LoadingBlock label="Abrindo seu espaço…" /></main>;
  if (!session && sessionError) return <main className="auth-loading"><div className="session-retry"><Notice tone="error" title="Não foi possível consultar sua sessão">{sessionError}</Notice><Button type="button" onClick={() => void refreshSession()}>Tentar novamente</Button></div></main>;
  if (!session) return <main className="auth-loading"><LoadingBlock label="Redirecionando para entrar…" /></main>;

  const visibleItems = navItems.filter((item) => !item.teacher || (persona === "TEACHER" && allowed.teacher));
  const current = navItems.find((item) => item.href === path || (item.href !== "/app" && path.startsWith(`${item.href}/`)))?.label;

  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação principal">
      <Link href="/app" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link>
      <div className="workspace-picker">
        <span className="eyebrow">Seu espaço</span>
        <label className="sr-only" htmlFor="workspace-select">Selecionar contexto</label>
        <div className="select-wrap"><select id="workspace-select" value={activeWorkspace?.id || ""} onChange={(event) => setWorkspaceId(event.target.value)}>{session.workspaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>
      </div>
      <div className="persona-switch" role="group" aria-label="Experiência">
        {allowed.teacher && <button type="button" aria-pressed={persona === "TEACHER"} disabled={switching} onClick={() => void doSwitchPersona("TEACHER")}><GraduationCap size={16} />Professora</button>}
        {allowed.student && <button type="button" aria-pressed={persona === "STUDENT"} disabled={switching} onClick={() => void doSwitchPersona("STUDENT")}><BookOpen size={16} />Aluna</button>}
      </div>
      {switchError && <p className="inline-error" role="alert">{switchError}</p>}
      <nav className="sidebar-nav">{visibleItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href || (href !== "/app" && path.startsWith(`${href}/`)) ? "active" : ""}><Icon size={18} strokeWidth={2.4} aria-hidden="true" /><span>{label}</span>{label === "Estudar com IA" && <span className="nav-sparkle"><Sparkles size={12} /></span>}</Link>)}</nav>
      <div className="sidebar-spacer" />
      <Link href="/app/configuracoes/perfil" className="profile-link"><span className="avatar">{session.user.name.trim().charAt(0).toUpperCase()}</span><span className="profile-copy"><strong>{session.user.name}</strong><small>{current || "Seu espaço de estudo"}</small></span><Settings2 size={16} aria-label="Configurações" /></Link>
      {logoutError && <p className="inline-error" role="alert">{logoutError}</p>}<button className="logout-link" type="button" disabled={logoutBusy} onClick={() => void logout()}><LogOut size={16} />{logoutBusy ? "Saindo…" : "Sair da conta"}</button>
      <p className="sidebar-note">Um passo de cada vez.<br /><span>Seu estudo, no seu ritmo.</span></p>
    </aside>
    <div className="content-column">
      <header className="mobile-topbar"><button className="icon-button" type="button" aria-label={menuOpen ? "Fechar navegação" : "Abrir navegação"} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X /> : <Menu />}</button><Link href="/app" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><Link className="icon-button" href="/app/configuracoes/perfil" aria-label="Configurações"><CircleUserRound /></Link></header>
      {menuOpen && <nav className="mobile-menu" aria-label="Navegação móvel">{visibleItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)}><Icon size={18} />{label}</Link>)}</nav>}
      <main id="main-content" className="main-content">{sessionError && <Notice tone="warning" title="Conexão de sessão instável">{sessionError}<Button type="button" variant="secondary" onClick={() => void refreshSession()}>Tentar novamente</Button></Notice>}{children}</main>
      <footer className="mobile-tabbar" aria-label="Atalhos">{[
        { href: "/app", label: "Início", icon: Home }, { href: "/app/disciplinas", label: "Disciplinas", icon: BookOpen }, { href: "/app/conversas", label: "Tutor", icon: MessageCircle }, { href: "/app/configuracoes/perfil", label: "Conta", icon: CircleUserRound },
      ].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href || (href !== "/app" && path.startsWith(`${href}/`)) ? "active" : ""}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>)}</footer>
    </div>
  </div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ShellFrame>{children}</ShellFrame></SessionProvider>;
}
