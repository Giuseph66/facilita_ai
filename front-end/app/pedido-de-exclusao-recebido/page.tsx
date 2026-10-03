import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

export default function DeletionAcceptedPage() {
  return <main className="deletion-page"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><section><span className="deletion-check"><Check size={23} /></span><p className="eyebrow">PEDIDO RECEBIDO</p><h1>A solicitação foi aceita.</h1><p>Seu acesso foi encerrado. A exclusão dos dados seguirá o fluxo de privacidade do Facilita Estudo.</p><div className="deletion-note"><ShieldCheck size={17} /><span>Esta sessão foi finalizada para proteger sua conta.</span></div><Link className="button button-secondary" href="/">Voltar ao início</Link></section></main>;
}
