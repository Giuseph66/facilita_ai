"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorCopy, jsonBody } from "@/lib/api";
import { type PrivacyRequestView } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { ArrowRight, Check, LockKeyhole, ShieldCheck, Sparkles, UserRound, WalletCards } from "lucide-react";

const settingsLinks = [
  ["/app/configuracoes/perfil", "Perfil", UserRound],
  ["/app/configuracoes/ia", "Inteligência artificial", Sparkles],
  ["/app/configuracoes/plano", "Plano e consumo", WalletCards],
  ["/app/configuracoes/privacidade", "Privacidade", ShieldCheck],
] as const;

function SettingsNav({ active }: { active: string }) {
  const navRef = useRef<HTMLElement>(null);
  // On narrow screens the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>("a.active");
    if (nav && current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [active]);
  return <nav ref={navRef} className="settings-nav" aria-label="Configurações">{settingsLinks.map(([href, label, Icon]) => <Link className={active === href ? "active" : ""} aria-current={active === href ? "page" : undefined} href={href} key={href}><Icon size={15} />{label}</Link>)}</nav>;
}

export function SettingsLayout({ active, eyebrow, title, description, children }: { active: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="page-stack"><PageTitle eyebrow={eyebrow} title={title} description={description} /><SettingsNav active={active} />{children}</div>;
}

export function ProfileSettings() {
  const { session, refreshSession } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      await api("/me/profile", { method: "PATCH", body: jsonBody({ name: form.get("name") }) });
      await refreshSession(); setNotice("Seu perfil foi atualizado.");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <SettingsLayout active="/app/configuracoes/perfil" eyebrow="CONTA E IDENTIDADE" title="Perfil e conta" description="Atualize seus dados de identificação.">
    {error && <Notice tone="error" title="Não foi possível salvar">{error}</Notice>}{notice && <Notice tone="success" title="Perfil atualizado">{notice}</Notice>}
    <div className="settings-grid"><Panel title="Seus dados" detail="Essas informações identificam sua conta."><form className="form-grid" onSubmit={save}><label className="field full-span"><span>Nome</span><input className="input" name="name" required defaultValue={session?.user.name || ""} /></label><label className="field full-span"><span>E-mail</span><input className="input" type="email" value={session?.user.email || ""} readOnly aria-readonly="true" /><small className="field-help">O e-mail de acesso não pode ser alterado aqui.</small></label><div className="field full-span"><span>Tipo de conta</span><strong>{session?.user.defaultPersona === "TEACHER" ? "Docente" : "Acadêmico"}</strong></div><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar perfil"}<ArrowRight size={14} /></Button></div></form></Panel>
      <Panel title="Espaços disponíveis" detail="Seu acesso depende das permissões atribuídas pela escola ou pela pessoa responsável.">{session?.workspaces.length ? <div className="resource-list">{session.workspaces.map((workspace) => <div className="resource-row" key={workspace.id}><span className="resource-icon"><UserRound size={17} /></span><span className="resource-main"><strong>{workspace.name}</strong><small>{workspace.roles.join(" · ") || "Participante"}</small></span><Check size={16} aria-label="Acesso disponível" /></div>)}</div> : <EmptyState title="Nenhum espaço conectado" detail="Seu workspace pessoal aparecerá aqui assim que sua conta estiver pronta." />}</Panel></div>
  </SettingsLayout>;
}

export function PrivacySettings() {
  const router = useRouter();
  const [items, setItems] = useState<PrivacyRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ items: PrivacyRequestView[] }>("/me/privacy-requests").then((result) => { if (live) setItems(result.items || []); }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reloadKey]);

  const request = async (kind: "EXPORT" | "DELETE", event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setNotice("");
    try {
      const type = kind === "DELETE" ? "DELETE_ACCOUNT" : "EXPORT";
      const response = await api<PrivacyRequestView>("/me/privacy-requests", { method: "POST", body: jsonBody({ type, password: form.get("password"), ...(kind === "DELETE" ? { confirmation: form.get("confirmation") } : {}) }) });
      if (response?.id) setItems((current) => [response, ...current]); else setReloadKey((value) => value + 1);
      setNotice(kind === "EXPORT" ? "Pedido de exportação registrado. O serviço informará quando a cópia segura estiver pronta." : "Pedido aceito. O acesso à conta será encerrado enquanto os dados são apagados conforme a política de privacidade.");
      if (kind === "DELETE") setShowDelete(false);
      (event.currentTarget as HTMLFormElement).reset();
      if (kind === "DELETE") router.replace("/pedido-de-exclusao-recebido");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const stateLabel = (state: string) => ({ PENDING: "Aguardando processamento", PROCESSING: "Em processamento", COMPLETED: "Concluído", FAILED: "Falhou" }[state.toUpperCase()] || state);

  return <SettingsLayout active="/app/configuracoes/privacidade" eyebrow="SEUS DADOS" title="Privacidade e dados" description="Solicite uma cópia dos seus dados ou inicie a exclusão da conta.">
    {error && <Notice tone="error" title="Pedido não enviado">{error}</Notice>}{notice && <Notice tone="success" title="Pedido registrado">{notice}</Notice>}
    <div className="settings-grid"><Panel title="Exportar dados" detail="A cópia é preparada em arquivo protegido."><div className="privacy-copy"><LockKeyhole size={18} /><p>O serviço mostrará o andamento do pedido e disponibilizará a cópia protegida quando estiver pronta.</p></div><form className="form-grid" onSubmit={(event) => void request("EXPORT", event)}><label className="field full-span"><span>Confirme sua senha</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Enviando pedido…" : "Solicitar exportação"}</Button></div></form></Panel>
      <Panel title="Excluir conta" detail="O pedido bloqueia seu acesso imediatamente e inicia o apagamento dos dados da conta."><ol className="privacy-steps"><li>A confirmação solicita a exclusão dos dados associados à sua conta.</li><li>Seu acesso ao Facilita Estudo é encerrado assim que o pedido é aceito.</li><li>O apagamento dos dados ocorre conforme a política de privacidade do serviço.</li></ol>{!showDelete ? <Button className="button-danger" variant="danger" type="button" onClick={() => setShowDelete(true)}>Continuar com a exclusão</Button> : <form className="form-grid delete-form" onSubmit={(event) => void request("DELETE", event)}><label className="field full-span"><span>Digite EXCLUIR para confirmar a perda de acesso e a exclusão dos dados</span><input className="input confirm-word" name="confirmation" required pattern="EXCLUIR" /></label><label className="field full-span"><span>Confirme sua senha</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setShowDelete(false)}>Cancelar</Button><Button type="submit" variant="danger" disabled={busy}>{busy ? "Enviando pedido…" : "Solicitar exclusão"}</Button></div></form>}</Panel></div>
    <Panel title="Solicitações recentes" detail="Pedidos e estados retornados pelo serviço.">{loading ? <LoadingBlock label="Consultando pedidos…" /> : items.length ? <div className="resource-list">{items.map((item) => <div className="resource-row" key={item.id}><span className="resource-icon"><ShieldCheck size={17} /></span><span className="resource-main"><strong>{item.type === "EXPORT" ? "Exportação de dados" : "Exclusão da conta"}</strong><small>{stateLabel(item.state)} · {new Date(item.requestedAt).toLocaleDateString("pt-BR")}</small></span>{item.expiresAt && <span className="tag tag-neutral">Disponível até {new Date(item.expiresAt).toLocaleDateString("pt-BR")}</span>}{item.type === "EXPORT" && item.downloadUrl && <a className="button button-secondary" href={item.downloadUrl} download>Baixar cópia<ArrowRight size={14} /></a>}</div>)}</div> : <EmptyState title="Sem solicitações recentes" detail="Seus pedidos de exportação e exclusão aparecerão aqui." />}</Panel>
  </SettingsLayout>;
}
