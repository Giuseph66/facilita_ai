import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

export default function DeletionAcceptedPage() {
  return <main className="deletion-page"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><section><span className="deletion-check"><Check size={23} /></span><p className="eyebrow">EXCLUSÃO DA CONTA</p><h1>Sobre seu pedido de exclusão.</h1><p>Se você confirmou a exclusão nas configurações, seu pedido seguirá o fluxo de privacidade do Facilita Estudo. Abrir esta página não envia uma solicitação.</p><div className="deletion-note"><ShieldCheck size={17} /><span>Após a confirmação da exclusão, o acesso à conta é encerrado.</span></div><Link className="button button-secondary" href="/">Voltar ao início</Link></section></main>;
}
