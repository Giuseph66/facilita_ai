"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Reload initializes local status before requesting the remote configuration. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorCopy, jsonBody, isTerminalJob } from "@/lib/api";
import { workspaceSupportsPersona, type EntitlementsView, type JobView, type OllamaConnectionView, type PageResult, type Persona, type PlanView, type PrivacyRequestView, type UsageView, type WorkspaceView } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, EmptyState, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { JobTracker } from "./job-tracker";
import { ArrowRight, Check, KeyRound, LockKeyhole, ShieldCheck, Sparkles, UserRound, WalletCards } from "lucide-react";

const settingsLinks = [
  ["/app/configuracoes/perfil", "Perfil", UserRound],
  ["/app/configuracoes/ia", "Inteligência artificial", Sparkles],
  ["/app/configuracoes/plano", "Plano e consumo", WalletCards],
  ["/app/configuracoes/privacidade", "Privacidade", ShieldCheck],
] as const;

function SettingsNav({ active }: { active: string }) {
  return <nav className="settings-nav" aria-label="Configurações">{settingsLinks.map(([href, label, Icon]) => <Link className={active === href ? "active" : ""} href={href} key={href}><Icon size={15} />{label}</Link>)}</nav>;
}

function SettingsLayout({ active, eyebrow, title, description, children }: { active: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
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
      const defaultPersona = String(form.get("defaultPersona")) as Persona;
      let cursor: string | null = null;
      let personalWorkspace: WorkspaceView | undefined;
      do {
        const workspacePage: PageResult<WorkspaceView> = await api<PageResult<WorkspaceView>>(`/workspaces?cursor=${encodeURIComponent(cursor || "")}`);
        personalWorkspace = workspacePage.items.find((workspace: WorkspaceView) => workspace.type === "PERSONAL");
        cursor = workspacePage.nextCursor;
      } while (!personalWorkspace && cursor);
      if (!personalWorkspace) throw new Error("Não foi possível localizar seu espaço pessoal para atualizar a experiência inicial.");
      if (!workspaceSupportsPersona(personalWorkspace, defaultPersona)) {
        await api("/me/personas", { method: "POST", body: jsonBody({ persona: defaultPersona }) });
      }
      await api("/me/profile", { method: "PATCH", body: jsonBody({ name: form.get("name"), defaultPersona }) });
      await refreshSession(); setNotice("Seu perfil foi atualizado. O Facilita Estudo abriu o espaço compatível com seu perfil inicial.");
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  return <SettingsLayout active="/app/configuracoes/perfil" eyebrow="CONTA E IDENTIDADE" title="Perfil e conta" description="Atualize seus dados e escolha qual contexto abre primeiro.">
    {error && <Notice tone="error" title="Não foi possível salvar">{error}</Notice>}{notice && <Notice tone="success" title="Perfil atualizado">{notice}</Notice>}
    <div className="settings-grid"><Panel title="Seus dados" detail="Essas informações identificam sua conta."><form className="form-grid" onSubmit={save}><label className="field full-span"><span>Nome</span><input className="input" name="name" required defaultValue={session?.user.name || ""} /></label><label className="field full-span"><span>E-mail</span><input className="input" type="email" value={session?.user.email || ""} readOnly aria-readonly="true" /><small className="field-help">O e-mail de acesso não pode ser alterado aqui.</small></label><label className="field full-span"><span>Experiência inicial</span><select className="input" name="defaultPersona" defaultValue={session?.user.defaultPersona || "STUDENT"}><option value="STUDENT">Estudante</option><option value="TEACHER">Docente</option></select><small className="field-help">Se necessário, a experiência será habilitada no seu espaço pessoal. O acesso a outras turmas continua definido pelas permissões de cada workspace.</small></label><div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar perfil"}<ArrowRight size={14} /></Button></div></form></Panel>
      <Panel title="Espaços disponíveis" detail="Seu acesso depende das permissões atribuídas pela escola ou pela pessoa responsável.">{session?.workspaces.length ? <div className="resource-list">{session.workspaces.map((workspace) => <div className="resource-row" key={workspace.id}><span className="resource-icon"><UserRound size={17} /></span><span className="resource-main"><strong>{workspace.name}</strong><small>{workspace.roles.join(" · ") || "Participante"}</small></span><Check size={16} aria-label="Acesso disponível" /></div>)}</div> : <EmptyState title="Nenhum espaço conectado" detail="Seu workspace pessoal aparecerá aqui assim que sua conta estiver pronta." />}</Panel></div>
  </SettingsLayout>;
}

export function AiSettings() {
  const [connection, setConnection] = useState<OllamaConnectionView | null>(null);
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string; capabilities: string[] }>>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobView | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(""); setModelsError("");
    const [connectionResult, modelsResult] = await Promise.allSettled([
      api<{ connection: OllamaConnectionView | null }>("/ai/connections/ollama"),
      api<{ items: Array<{ id: string; name: string; provider: string; capabilities: string[] }> }>("/ai/models"),
    ]);
    if (connectionResult.status === "fulfilled") setConnection(connectionResult.value.connection);
    else setError(errorCopy(connectionResult.reason));
    if (modelsResult.status === "fulfilled") {
      setModels(modelsResult.value.items || []);
      setSelectedModel((current) => current || modelsResult.value.items?.[0]?.id || "");
    } else { setModels([]); setModelsError(errorCopy(modelsResult.reason)); }
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const saveKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!keyValue) return;
    setBusy(true); setError(""); setNotice("");
    try { const response = await api<{ connection: OllamaConnectionView }>("/ai/connections/ollama", { method: "PUT", body: jsonBody({ apiKey: keyValue }) }); setConnection(response.connection); setKeyValue(""); setNotice("Conexão salva. A chave integral não será mostrada novamente."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError(""); setNotice("");
    try { const response = await api<{ job: JobView }>("/ai/connections/ollama/checks", { method: "POST", body: "{}" }); setJob(response.job); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const removeKey = async () => {
    if (!window.confirm("Remover a conexão com Ollama Cloud? O Facilita Estudo não passará automaticamente para outro fornecedor.")) return;
    setBusy(true); setError(""); setNotice("");
    try { await api("/ai/connections/ollama", { method: "DELETE" }); setConnection(null); setNotice("Conexão removida."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const savePreference = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { await api("/ai/preferences", { method: "PUT", body: jsonBody({ mode: "BYOK", ...(selectedModel ? { preferredModel: selectedModel } : {}) }) }); setNotice("Preferência de IA atualizada."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const onJobUpdate = (next: JobView) => { if (isTerminalJob(next)) void reload(); };

  return <SettingsLayout active="/app/configuracoes/ia" eyebrow="IA COM CONTROLE" title="Inteligência artificial" description="Conecte seu fornecedor e escolha um modelo. A chave é write-only e fica fora das respostas da API.">
    {error && <Notice tone="error" title="Ação não concluída">{error}{error.includes("limite") && <Link className="inline-link" href="/app/configuracoes/plano">Ver consumo<ArrowRight size={14} /></Link>}</Notice>}{notice && <Notice tone="success" title="Tudo certo">{notice}</Notice>}
    {job && <JobTracker job={job} onUpdate={onJobUpdate} onClose={() => setJob(null)} />}
    {loading ? <Panel><LoadingBlock label="Consultando configuração de IA…" /></Panel> : <div className="settings-grid">
      <Panel title="Ollama Cloud" detail="Use sua própria chave para conectar uma conta Ollama Cloud.">
        {connection ? <div className="connection-summary"><span className="connection-icon"><KeyRound size={19} /></span><div><strong>{connection.status === "CONNECTED" ? "Conexão verificada" : connection.status === "INVALID" ? "Verificação necessária" : "Chave salva"}</strong><code>{connection.maskedKey || "Chave mascarada pela API"}</code>{connection.checkedAt && <small>Verificada em {new Date(connection.checkedAt).toLocaleString("pt-BR")}</small>}</div><span className={`connection-state ${connection.status === "CONNECTED" ? "good" : "pending"}`}>{connection.status === "CONNECTED" ? "Conectada" : connection.status}</span></div> : <div className="connection-empty"><span className="connection-icon"><KeyRound size={19} /></span><div><strong>Sem chave conectada</strong><small>A geração com IA própria precisa de uma chave válida.</small></div></div>}
        <form className="form-grid key-form" onSubmit={(event) => void saveKey(event)}><label className="field full-span"><span>Chave da API</span><input className="input" name="apiKey" type="password" autoComplete="new-password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} placeholder={connection ? "Digite para substituir a chave" : "Cole sua chave Ollama Cloud"} required /></label><div className="secret-note"><LockKeyhole size={14} />A chave não volta a aparecer depois de salvar e nunca fica neste navegador.</div><div className="form-actions"><Button type="submit" disabled={busy || !keyValue}>{busy ? "Salvando…" : connection ? "Substituir chave" : "Salvar chave"}</Button></div></form>
        {connection && <div className="connection-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => void verify()}>Verificar conexão</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void removeKey()}>Remover conexão</Button></div>}
      </Panel>
      <Panel title="Preferências" detail="Escolha uma IA conectada para novas gerações.">
        {modelsError && <Notice tone="error" title="Modelos indisponíveis">{modelsError}<Button type="button" variant="secondary" onClick={() => void reload()}>Tentar novamente</Button></Notice>}
        <form className="form-grid" onSubmit={(event) => void savePreference(event)}><label className="field full-span"><span>Modelo</span><select className="input" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!connection || models.length === 0}><option value="">{models.length ? "Escolha um modelo" : "Nenhum modelo disponível"}</option>{models.filter((model) => model.provider.toLowerCase() === "ollama").map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><div className="ai-safety-copy"><strong>Seu limite continua valendo</strong><p>Conectar uma IA própria não desativa as cotas da sua conta. Se ela ficar indisponível, o pedido será mantido para tentar de novo; não há troca automática para um serviço pago.</p></div><div className="form-actions"><Button type="submit" disabled={busy || !connection || !selectedModel}>Salvar preferência</Button></div></form>
        <div className="platform-status"><span className="status-dot" />IA da plataforma indisponível até que um fornecedor seja habilitado para este produto.</div>
      </Panel>
    </div>}
  </SettingsLayout>;
}

export function PlanSettings() {
  const { session } = useSession();
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [entitlementsError, setEntitlementsError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.allSettled([api<PageResult<PlanView>>("/plans"), api<UsageView>("/me/usage"), api<EntitlementsView>("/me/entitlements")]).then((results) => {
      if (!live) return;
      if (results[0].status === "fulfilled") setPlans(results[0].value.items || []); else setError(errorCopy(results[0].reason));
      if (results[1].status === "fulfilled") setUsage(results[1].value); else setUsageError(errorCopy(results[1].reason));
      if (results[2].status === "fulfilled") setEntitlements(results[2].value); else setEntitlementsError(errorCopy(results[2].reason));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const currentPlan = plans.find((plan) => plan.code === entitlements?.plan?.code);
  return <SettingsLayout active="/app/configuracoes/plano" eyebrow="PLANO E CONSUMO" title="Seu plano" description="Veja os limites ativos e o uso registrado pela sua conta.">
    {error && <Notice tone="error" title="Não foi possível consultar o plano">{error}</Notice>}
    {usageError && <Notice tone="warning" title="Consumo indisponível">{usageError}</Notice>}
    {entitlementsError && <Notice tone="warning" title="Benefícios indisponíveis">{entitlementsError}</Notice>}
    {loading ? <Panel><LoadingBlock label="Consultando plano e consumo…" /></Panel> : <>
      <div className="settings-grid">
        <Panel title="Plano ativo" detail="Os recursos e limites vêm da configuração do serviço.">
          <div className="current-plan"><span className="plan-seal"><WalletCards size={21} /></span><div><strong>{currentPlan?.name || entitlements?.plan?.name || "Plano não informado"}</strong><small>{currentPlan ? `Plano ativo · ${currentPlan.code}` : "O serviço não retornou um plano ativo."}</small></div>{currentPlan && <span className="tag tag-sage">Ativo</span>}</div>
          {entitlements?.plan?.periodEnd && <p className="field-help">Período atual até {new Date(entitlements.plan.periodEnd).toLocaleDateString("pt-BR")}</p>}
          {entitlements?.limits && <div className="plan-limit-list">{Object.entries(entitlements.limits).map(([name, value]) => <div key={name}><span>{name.replaceAll("_", " ")}{value.period ? ` · ${value.period}` : ""}</span><strong>{value.limit === null ? "Sem limite" : value.limit}</strong></div>)}</div>}
          {entitlements && <p className="field-help">IA da plataforma: {entitlements.platformAiEnabled ? "disponível conforme suas permissões" : "indisponível neste contexto"}.</p>}
        </Panel>
        <Panel title="Uso deste período" detail="Valores e períodos fornecidos pelo serviço.">
          {usage?.items?.length ? usage.items.map((metric) => {
            const used = Number(metric.used);
            const limit = metric.limit === null ? null : Number(metric.limit);
            const percent = Number.isFinite(used) && limit !== null && Number.isFinite(limit) && limit > 0 ? Math.min(100, used / limit * 100) : null;
            return <div className="usage-metric" key={`${metric.metric}-${metric.periodStart}`}><strong>{metric.metric.replaceAll("_", " ")}</strong><span>{metric.used}{metric.limit === null ? " usados" : ` de ${metric.limit}`}{Number(metric.reserved) > 0 ? ` · ${metric.reserved} reservados` : ""}</span><small>{metric.period.replaceAll("_", " ")} · desde {new Date(metric.periodStart).toLocaleDateString("pt-BR")}</small>{percent !== null && <div className="usage-meter" role="progressbar" aria-label={`Uso de ${metric.metric}`} aria-valuemin={0} aria-valuemax={limit || undefined} aria-valuenow={used || 0}><span style={{ width: `${percent}%` }} /></div>}</div>;
          }) : <EmptyState title="Sem consumo registrado" detail="Quando houver uso no período, ele aparecerá aqui." />}
        </Panel>
      </div>
      <Panel title="Opções disponíveis" detail="O catálogo real não altera seu plano nem inicia cobrança nesta tela.">
        {plans.length ? <div className="plan-grid">{plans.map((plan) => <article className={`plan-card ${plan.code === currentPlan?.code ? "plan-featured" : ""}`} key={plan.code}>
          <p className="plan-kicker">{plan.name}</p>
          <h3>{plan.price ? <>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.price.currency }).format(Number(plan.price.amount))}<small> / {plan.price.interval === "year" ? "ano" : "mês"}</small></> : "Preço não informado"}</h3>
          {Object.keys(plan.capabilities).length > 0 && <ul>{Object.entries(plan.capabilities).map(([key, capability]) => {
            const value = capability.type === "BOOLEAN" ? (capability.value ? "incluído" : "não incluído") : capability.value == null ? "não informado" : typeof capability.value === "object" ? JSON.stringify(capability.value) : String(capability.value);
            return <li key={key}><Check size={14} />{key.replaceAll("_", " ")}: {value}</li>;
          })}</ul>}
          <span className={plan.code === currentPlan?.code ? "tag tag-sage" : "tag tag-neutral"}>{plan.code === currentPlan?.code ? "Seu plano" : "Catálogo"}</span>
        </article>)}</div> : <EmptyState title="Catálogo indisponível" detail="Não recebemos opções de plano do serviço neste momento." />}
      </Panel>
      <p className="settings-disclaimer">{session?.user.name}, nenhuma cobrança ou mudança de plano acontece nesta tela.</p>
    </>}
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
