import Link from "next/link";
import { BookOpenCheck, CalendarCheck, ClipboardList, FileDown, FileText, FolderOpen, Layers, Lock, MessageSquareText, Quote, Send, Users } from "lucide-react";
import { ClosingCta, FooterAccountLinks, HeroActions, NavAccount } from "@/components/landing-account";
import { PublicPlans } from "@/components/public-plans";
import "./landing.css";

const teacherFeatures = [
  { icon: Users, title: "Turmas e convites", text: "Crie turmas, convide estudantes com um código de acesso e acompanhe quem já entrou." },
  { icon: Lock, title: "Liberação controlada", text: "Cada material começa privado. Você decide o que a turma vê e quando." },
  { icon: ClipboardList, title: "Avaliações com revisão", text: "Gere questões a partir do seu conteúdo, edite tudo antes de aplicar e crie versões diferentes da mesma prova." },
  { icon: FileDown, title: "Exportação pronta", text: "Baixe a prova e o gabarito em PDF, prontos para imprimir." },
];

const studentFeatures = [
  { icon: MessageSquareText, title: "Perguntas com fonte", text: "Pergunte sobre o material e veja o trecho e a página que embasam a resposta." },
  { icon: Layers, title: "Resumos e cartões", text: "Transforme um capítulo em resumo, cartões de memorização ou lista de revisão." },
  { icon: CalendarCheck, title: "Plano de estudo", text: "Organize as próximas semanas em sessões curtas, com tema e tarefa definidos." },
  { icon: BookOpenCheck, title: "Simulados", text: "Responda sem ver o gabarito e confira correção e explicação só depois de entregar." },
];

const steps = [
  { title: "Envie seus arquivos", text: "PDFs e apresentações (PPTX), organizados por disciplina." },
  { title: "Aguarde o processamento", text: "O conteúdo é lido e indexado para que cada resposta possa citar a origem." },
  { title: "Estude ou ensine", text: "Use o material para conversar, revisar, praticar ou montar avaliações." },
];

const faq = [
  { q: "Preciso pagar para começar?", a: "Não. O plano Livre não tem custo e não pede cartão. Você pode criar disciplinas e turmas e enviar seus primeiros materiais dentro dos limites do plano." },
  { q: "Preciso ter uma conta de IA?", a: "Sim, para conversar com os materiais e gerar conteúdo. Você conecta sua conta da Ollama Cloud em Configurações; a chave é guardada criptografada e usada apenas na sua conta." },
  { q: "Quem consegue ver meus materiais?", a: "Só você. Materiais, conversas e avaliações nascem privados. Estudantes de uma turma veem apenas o que a pessoa docente liberou explicitamente." },
  { q: "O que acontece se eu mudar de plano?", a: "Nada é apagado. Se o novo plano tiver limites menores, você mantém o que já existe e só deixa de adicionar acima do limite." },
  { q: "Posso exportar ou excluir meus dados?", a: "Sim. Em Configurações › Privacidade você solicita a exportação completa dos seus dados ou a exclusão da conta." },
];

function Brand() {
  return <Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link>;
}

export default function LandingPage() {
  return <main className="lp">
    <header className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <Brand />
        <nav aria-label="Navegação principal"><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a><a href="#perguntas">Perguntas</a></nav>
        <NavAccount />
      </div>
    </header>

    <section className="lp-hero">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-label">Plataforma de estudo para docentes e estudantes</p>
          <h1>Seus materiais de aula, prontos para estudar.</h1>
          <p className="lp-lede">Envie PDFs e apresentações, organize por disciplina e turma, e crie resumos, cartões, simulados e avaliações. Toda resposta indica a página de onde veio.</p>
          <HeroActions />
        </div>

        <div className="lp-preview" aria-hidden="true">
          <div className="lp-window">
            <div className="lp-window-bar"><span /><span /><span /><em>Biologia Celular · Conversa</em></div>
            <div className="lp-window-body">
              <aside className="lp-window-side">
                <small>MATERIAIS</small>
                <p className="active"><FileText size={13} /><span>Cap. 4 — Divisão celular.pdf</span></p>
                <p><FileText size={13} /><span>Aula 07 — Meiose.pptx</span></p>
                <p><FileText size={13} /><span>Lista de exercícios 2.pdf</span></p>
                <small>TURMA</small>
                <p><Users size={13} /><span>2º ano B · 31 estudantes</span></p>
              </aside>
              <div className="lp-chat">
                <div className="lp-msg lp-msg-user">Qual a principal diferença entre mitose e meiose?</div>
                <div className="lp-msg lp-msg-reply">
                  <p>A mitose gera duas células idênticas à célula-mãe, com o mesmo número de cromossomos. A meiose gera quatro células com metade dos cromossomos, e é a base da formação de gametas.</p>
                  <div className="lp-sources"><span><Quote size={11} />Cap. 4 · p. 87</span><span><Quote size={11} />Aula 07 · slide 12</span></div>
                </div>
                <div className="lp-compose"><span>Pergunte sobre este material…</span><i><Send size={13} /></i></div>
              </div>
            </div>
          </div>
          <div className="lp-preview-card">
            <span className="lp-preview-icon"><Layers size={15} /></span>
            <div><strong>Cartões de estudo</strong><small>24 cartões · Cap. 4</small></div>
          </div>
        </div>
      </div>
    </section>

    <section className="lp-facts" aria-label="Destaques">
      <div className="lp-container lp-facts-grid">
        <div><FolderOpen size={18} /><span><strong>PDF e PPTX</strong>Organizados por disciplina</span></div>
        <div><Quote size={18} /><span><strong>Respostas com fonte</strong>Página ou slide de origem</span></div>
        <div><Lock size={18} /><span><strong>Privado por padrão</strong>Você decide o que liberar</span></div>
        <div><FileDown size={18} /><span><strong>Exportação em PDF</strong>Prova e gabarito</span></div>
      </div>
    </section>

    <section className="lp-section" id="recursos">
      <div className="lp-container">
        <div className="lp-section-head"><p className="lp-label">Recursos</p><h2>Um só lugar para quem ensina e para quem aprende.</h2><p>Escolha entre uma conta de docente ou de acadêmico no cadastro. Cada tipo de conta tem as ferramentas para suas atividades.</p></div>
        <div className="lp-audiences">
          <article className="lp-audience">
            <header><span className="lp-tag">Para docentes</span><h3>Prepare aulas e avaliações a partir do que você já tem.</h3></header>
            <ul>{teacherFeatures.map(({ icon: Icon, title, text }) => <li key={title}><span className="lp-feature-icon"><Icon size={17} /></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ul>
          </article>
          <article className="lp-audience">
            <header><span className="lp-tag lp-tag-sage">Para estudantes</span><h3>Estude o conteúdo da disciplina, não um resumo genérico.</h3></header>
            <ul>{studentFeatures.map(({ icon: Icon, title, text }) => <li key={title}><span className="lp-feature-icon lp-feature-icon-sage"><Icon size={17} /></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ul>
          </article>
        </div>
      </div>
    </section>

    <section className="lp-section lp-section-alt" id="como-funciona">
      <div className="lp-container">
        <div className="lp-section-head"><p className="lp-label">Como funciona</p><h2>Do arquivo ao estudo em três passos.</h2></div>
        <ol className="lp-steps">{steps.map((step, index) => <li key={step.title}><span className="lp-step-number">{index + 1}</span><strong>{step.title}</strong><p>{step.text}</p></li>)}</ol>
      </div>
    </section>

    <section className="lp-section" id="planos">
      <div className="lp-container">
        <div className="lp-section-head"><p className="lp-label">Planos</p><h2>Comece grátis. Aumente os limites quando precisar.</h2><p>Todos os planos incluem perguntas com fonte, exportação em PDF e controle total sobre o que é compartilhado.</p></div>
        <PublicPlans />
      </div>
    </section>

    <section className="lp-section lp-section-alt" id="perguntas">
      <div className="lp-container lp-faq">
        <div className="lp-section-head lp-section-head-left"><p className="lp-label">Perguntas frequentes</p><h2>Antes de começar.</h2><p>Não encontrou o que procurava? Crie uma conta gratuita e explore com calma.</p></div>
        <div className="lp-faq-list">{faq.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </div>
    </section>

    <section className="lp-cta"><ClosingCta /></section>

    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-footer-brand"><Brand /><p>Organização de materiais, estudo e avaliações para docentes e estudantes.</p></div>
        <nav aria-label="Rodapé"><div><strong>Produto</strong><a href="#recursos">Recursos</a><a href="#planos">Planos</a><a href="#perguntas">Perguntas</a></div><FooterAccountLinks /></nav>
      </div>
      <div className="lp-container lp-footer-bottom"><span>© {new Date().getFullYear()} Facilita Estudo</span></div>
    </footer>
  </main>;
}
