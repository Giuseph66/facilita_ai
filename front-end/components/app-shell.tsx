"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const { session, activeWorkspace, persona, loading, sessionError, refreshSession } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === path;
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuToggleRef = useRef<HTMLButtonElement>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/entrar?next=%2Fapp");
  }, [loading, session, sessionError, router]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 800px)");
    const closeOnDesktop = () => { if (!mobile.matches) setMenuPath(null); };
    const closeOnHistory = () => setMenuPath(null);
    mobile.addEventListener("change", closeOnDesktop);
    window.addEventListener("popstate", closeOnHistory);
    return () => {
      mobile.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("popstate", closeOnHistory);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const opener = menuButtonRef.current;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    Object.assign(body.style, { overflow: "hidden", position: "fixed", top: `-${scrollY}px`, width: "100%" });
    sidebar.scrollTop = 0;
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuPath(null); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      const outside = !sidebar.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      Object.assign(body.style, previous);
      window.scrollTo({ top: scrollY, behavior: "instant" });
      if (opener?.getClientRects().length) opener.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        accountMenuToggleRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [accountMenuOpen]);

  const allowed = useMemo(() => ({
    teacher: workspaceSupportsPersona(activeWorkspace, "TEACHER"),
    student: workspaceSupportsPersona(activeWorkspace, "STUDENT"),
  }), [activeWorkspace]);

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
  return <div className="app-frame">
    <a className="skip-link" href="#main-content" inert={menuOpen}>Pular para o conteúdo</a>
    {menuOpen && <button className="drawer-backdrop" type="button" aria-label="Fechar navegação" aria-hidden="true" tabIndex={-1} onClick={() => setMenuPath(null)} />}
    <aside ref={sidebarRef} id="app-navigation" className={`sidebar${menuOpen ? " is-open" : ""}`} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} aria-label="Navegação principal" onClick={(event) => { if (event.target instanceof Element && event.target.closest("a[href]")) setMenuPath(null); }}>
      <div className="sidebar-header"><div className="sidebar-brand-copy"><Link href="/app" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><small className="sidebar-tagline">{persona === "TEACHER" ? <GraduationCap size={14} strokeWidth={1.6} role="img" aria-label="Docente" /> : <BookOpen size={14} strokeWidth={1.6} role="img" aria-label="Acadêmico" />}<span>Um passo de cada vez, no seu ritmo.</span></small></div><button ref={closeButtonRef} className="icon-button drawer-close" type="button" aria-label="Fechar navegação" onClick={() => setMenuPath(null)}><X aria-hidden="true" /></button></div>
      <nav className="sidebar-nav">{visibleItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href || (href !== "/app" && path.startsWith(`${href}/`)) ? "active" : ""}><Icon size={18} strokeWidth={2.4} aria-hidden="true" /><span>{label}</span>{label === "Estudar com IA" && <span className="nav-sparkle"><Sparkles size={12} /></span>}</Link>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-account">
        <button ref={accountMenuToggleRef} className="profile-link" type="button" aria-label="Configurações da conta" aria-expanded={accountMenuOpen} aria-controls="sidebar-account-menu" onClick={() => setAccountMenuOpen((open) => !open)}><span className="avatar">{session.user.name.trim().charAt(0).toUpperCase()}</span><span className="profile-copy"><strong>{session.user.name}</strong><small>{persona === "TEACHER" ? "Docente" : "Acadêmico"}</small></span><span className="account-menu-toggle" aria-hidden="true">{accountMenuOpen ? <ChevronDown size={18} /> : <Settings2 size={17} />}</span></button>
        {accountMenuOpen && <div id="sidebar-account-menu" className="sidebar-account-menu"><Link href="/app/configuracoes/perfil" onClick={() => setAccountMenuOpen(false)}><CircleUserRound size={17} aria-hidden="true" />Meu perfil</Link>{logoutError && <p className="inline-error" role="alert">{logoutError}</p>}<button className="logout-link" type="button" disabled={logoutBusy} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />{logoutBusy ? "Saindo…" : "Sair da conta"}</button></div>}
      </div>
    </aside>
    <div className="content-column" inert={menuOpen}>
      <header className="mobile-topbar"><button ref={menuButtonRef} className="icon-button" type="button" aria-label="Abrir navegação" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={() => setMenuPath(path)}><Menu aria-hidden="true" /></button><Link href="/app" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><Link className="icon-button" href="/app/configuracoes/perfil" aria-label="Configurações"><CircleUserRound /></Link></header>
      <main id="main-content" className="main-content">{sessionError && <Notice tone="warning" title="Conexão de sessão instável">{sessionError}<Button type="button" variant="secondary" onClick={() => void refreshSession()}>Tentar novamente</Button></Notice>}{children}</main>
      <footer className="mobile-tabbar" aria-label="Atalhos">{[
        { href: "/app", label: "Início", icon: Home }, { href: "/app/disciplinas", label: "Disciplinas", icon: BookOpen }, { href: "/app/conversas", label: "Estudar com IA", icon: MessageCircle }, { href: "/app/configuracoes/perfil", label: "Conta", icon: CircleUserRound },
      ].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href || (href !== "/app" && path.startsWith(`${href}/`)) ? "active" : ""}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>)}</footer>
    </div>
  </div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <SessionProvider><ShellFrame>{children}</ShellFrame></SessionProvider>;
}
