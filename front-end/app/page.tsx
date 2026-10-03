import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen, Check, MessageCircle, Sparkles } from "lucide-react";
import { PublicPlans } from "@/components/public-plans";

const pillars = [
  { icon: BookOpen, number: "01", title: "Reúna seus materiais", text: "Disciplinas, turmas e arquivos no mesmo lugar, com acesso sempre claro." },
  { icon: MessageCircle, number: "02", title: "Estude com contexto", text: "Pergunte sobre seus próprios materiais e confira de onde veio cada resposta." },
  { icon: Sparkles, number: "03", title: "Pratique com intenção", text: "Transforme o conteúdo em resumos, cartões e exercícios para continuar avançando." },
];

export default function LandingPage() {
  return <main className="landing">
    <header className="landing-nav">
      <Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link>
      <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a></nav>
      <div className="landing-account"><Link href="/entrar" className="button button-quiet">Entrar</Link><Link href="/cadastro" className="button button-primary">Começar agora<ArrowRight size={16} /></Link></div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-dot" /> Um espaço que acompanha seu jeito de aprender</p>
        <h1>Estudar pode<br /><em>fluir melhor.</em></h1>
        <p className="hero-lede">Organize seus materiais, tire dúvidas com contexto e siga em frente com um plano que faz sentido para você.</p>
        <div className="hero-actions"><Link href="/cadastro" className="button button-primary button-large">Criar meu espaço<ArrowRight size={17} /></Link><a href="#como-funciona" className="text-link">Conhecer a plataforma<ArrowDown size={14} /></a></div>
        <div className="hero-proof"><span className="proof-avatars" aria-hidden="true"><i>M</i><i>L</i><i>+</i></span><span>Feito para quem ensina e para quem aprende</span></div>
      </div>
      <div className="hero-art" aria-label="Materiais de estudo organizados em um espaço acolhedor">
        <div className="art-sun" />
        <div className="art-book art-book-back"><span>ANOTAÇÕES</span><i /><i /><i /><i /></div>
        <div className="art-book art-book-front"><span className="art-kicker">SEU PRÓXIMO PASSO</span><strong>Uma ideia<br />de cada vez.</strong><span className="art-rule" /><small>Respire. Releia. Continue.</small><div className="art-leaf" aria-hidden="true">✳</div></div>
        <div className="art-pill"><span><Sparkles size={14} /></span><div><strong>Com contexto</strong><small>Fontes sempre por perto</small></div></div>
        <div className="art-note"><span className="note-check"><Check size={12} /></span><span>Seu ritmo também conta.</span></div>
      </div>
      <div className="hero-bottom"><span>Aprender com clareza muda o caminho.</span><span>DESLIZE PARA DESCOBRIR <ArrowDown size={12} /></span></div>
    </section>

    <section className="section-intro" id="como-funciona">
      <div className="section-intro-heading"><p className="eyebrow">Menos dispersão, mais compreensão</p><h2>Um lugar para<br /><em>fazer conexões.</em></h2></div>
      <p>O Facilita Estudo aproxima o que você precisa para aprender: o material, a pergunta e o próximo passo. Tudo com espaço para pensar, sem perder o fio.</p>
    </section>

    <section className="pillar-list" aria-label="Como funciona">
      {pillars.map(({ icon: Icon, number, title, text }) => <article className="pillar-row" key={number}><span className="pillar-number">{number}</span><span className="pillar-icon"><Icon size={20} strokeWidth={1.8} /></span><div><h3>{title}</h3><p>{text}</p></div><ArrowRight className="pillar-arrow" size={18} /></article>)}
    </section>

    <section className="quote-band"><span className="quote-mark">“</span><blockquote>Não precisa resolver tudo agora.<br /><em>Só o próximo passo.</em></blockquote><span className="quote-caption">UM ESPAÇO ACADÊMICO COM RESPIRO</span></section>

    <section className="plans-section" id="planos"><div className="plans-heading"><p className="eyebrow">Escolha quando fizer sentido</p><h2>Seu estudo, seu <em>ritmo.</em></h2><p>Conheça as opções disponíveis e encontre o espaço que acompanha sua rotina.</p></div><PublicPlans /></section>

    <section className="closing-cta"><div><p className="eyebrow">Por onde começar?</p><h2>Uma página de cada vez.</h2><p>Crie seu espaço e organize o que importa para aprender.</p></div><Link href="/cadastro" className="button button-primary button-large">Começar a estudar<ArrowRight size={17} /></Link><div className="closing-stamp" aria-hidden="true">✳</div></section>

    <footer className="landing-footer"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><span>Um passo de cada vez.</span><div><Link href="/entrar">Entrar</Link><Link href="/cadastro">Criar conta</Link></div></footer>
  </main>;
}
