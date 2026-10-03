"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useViewer } from "@/lib/use-viewer";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function NavAccount() {
  const viewer = useViewer();
  if (viewer) return <div className="lp-nav-actions"><span className="lp-nav-greeting">Olá, {firstName(viewer.user.name)}</span><Link href="/app" className="button button-primary">Ir para meu espaço</Link></div>;
  return <div className="lp-nav-actions"><Link href="/entrar" className="lp-nav-login">Entrar</Link><Link href="/cadastro" className="button button-primary">Criar conta</Link></div>;
}

export function HeroActions() {
  const viewer = useViewer();
  if (viewer) return <>
    <div className="lp-hero-actions"><Link href="/app" className="button button-primary button-large">Continuar de onde parei<ArrowRight size={17} /></Link><a href="#planos" className="button button-secondary button-large">Ver planos</a></div>
    <p className="lp-hero-note">Você está conectado como {viewer.user.email}.</p>
  </>;
  return <>
    <div className="lp-hero-actions"><Link href="/cadastro" className="button button-primary button-large">Criar conta grátis<ArrowRight size={17} /></Link><a href="#planos" className="button button-secondary button-large">Ver planos</a></div>
    <p className="lp-hero-note">Já tem conta? <Link href="/entrar">Entrar</Link> · Plano Livre sem custo</p>
  </>;
}

export function ClosingCta() {
  const viewer = useViewer();
  if (viewer) return <div className="lp-container lp-cta-inner">
    <div><h2>Seu espaço está pronto.</h2><p>Volte às suas disciplinas, turmas e materiais.</p></div>
    <div className="lp-cta-actions"><Link href="/app" className="button button-large lp-cta-primary">Ir para meu espaço<ArrowRight size={17} /></Link></div>
  </div>;
  return <div className="lp-container lp-cta-inner">
    <div><h2>Crie sua conta e envie o primeiro material.</h2><p>Plano Livre sem custo e sem cartão de crédito.</p></div>
    <div className="lp-cta-actions"><Link href="/cadastro" className="button button-large lp-cta-primary">Criar conta grátis<ArrowRight size={17} /></Link><Link href="/entrar" className="lp-cta-link">Já tenho conta</Link></div>
  </div>;
}

export function FooterAccountLinks() {
  const viewer = useViewer();
  if (viewer) return <div><strong>Conta</strong><Link href="/app">Meu espaço</Link><Link href="/app/configuracoes/perfil">Perfil</Link><Link href="/app/configuracoes/plano">Plano e consumo</Link></div>;
  return <div><strong>Conta</strong><Link href="/entrar">Entrar</Link><Link href="/cadastro">Criar conta</Link><Link href="/recuperar-senha">Recuperar senha</Link></div>;
}
