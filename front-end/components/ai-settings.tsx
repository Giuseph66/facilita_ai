"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Reload initializes local status before requesting the remote configuration. */

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Check, LockKeyhole, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { api, errorCodeCopy, errorCopy, isTerminalJob, jsonBody } from "@/lib/api";
import { formatPercent, keyName, NEAR_LIMIT_USED, relativeTime, tightestWindow, windowLabel } from "@/lib/ai-keys";
import type { JobView, OllamaConnectionView } from "@/lib/types";
import { JobTracker } from "./job-tracker";
import { SettingsLayout } from "./settings-screen";
import { Button, LoadingBlock, Notice, Panel } from "./ui";

type Model = { id: string; name: string; provider: string; capabilities: string[] };

const statusCopy: Record<string, { pill: string; tone: "good" | "pending" | "bad" }> = {
  CONNECTED: { pill: "Verificada", tone: "good" },
  UNVERIFIED: { pill: "Não verificada", tone: "pending" },
  INVALID: { pill: "Recusada", tone: "bad" },
};

function KeyUsage({ keyView, busy, onRefresh }: { keyView: OllamaConnectionView; busy: boolean; onRefresh: () => void }) {
  const windows = keyView.usage?.windows ?? [];
  if (!windows.length) return <div className="ai-key-usage-empty">
    <span>{keyView.status === "INVALID" ? "Uso indisponível para uma chave recusada." : "Uso ainda não consultado."}</span>
    {keyView.status !== "INVALID" && <button type="button" className="ai-key-link" disabled={busy} onClick={onRefresh}>Consultar agora</button>}
  </div>;
  return <div className="ai-key-usage">
    {windows.map((window) => {
      const tone = window.usedPercent >= 100 ? "is-empty" : window.usedPercent >= NEAR_LIMIT_USED ? "is-low" : "";
      return <div className={`ai-key-window ${tone}`} key={window.name}>
        <div className="ai-key-window-head"><span>{windowLabel(window.name)}</span><strong>restam {formatPercent(window.remainingPercent)}</strong></div>
        <div className="ai-key-meter" role="progressbar" aria-label={`${windowLabel(window.name)}: restam ${formatPercent(window.remainingPercent)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(window.remainingPercent)}><i style={{ width: `${Math.max(0, Math.min(100, window.remainingPercent))}%` }} /></div>
      </div>;
    })}
    <small>Atualizado {relativeTime(keyView.usage!.checkedAt)}</small>
  </div>;
}

export function AiSettings() {
  const [keys, setKeys] = useState<OllamaConnectionView[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [jobKeyId, setJobKeyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  const reload = useCallback(async () => {
    setModelsError("");
    const [keysResult, modelsResult] = await Promise.allSettled([
      api<{ items: OllamaConnectionView[] }>("/ai/connections"),
      api<{ items: Model[] }>("/ai/models"),
    ]);
    let next: OllamaConnectionView[] = [];
    if (keysResult.status === "fulfilled") { next = keysResult.value.items; setKeys(next); }
    else setError(errorCopy(keysResult.reason));
    if (modelsResult.status === "fulfilled") {
      setModels(modelsResult.value.items || []);
      setSelectedModel((current) => current || modelsResult.value.items?.[0]?.id || "");
    } else { setModels([]); if (next.some((key) => key.status !== "INVALID")) setModelsError(errorCopy(modelsResult.reason)); }
    setLoading(false);
    return next;
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id); setError(""); setNotice("");
    try { await action(); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(null); }
  };

  const startCheck = async (id: string) => {
    const response = await api<{ job: JobView }>(`/ai/connections/${id}/checks`, { method: "POST", body: "{}" });
    setJobKeyId(id); setJob(response.job);
  };

  const addKey = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newKey.trim()) return;
    void run("add", async () => {
      const response = await api<{ connection: OllamaConnectionView }>("/ai/connections", { method: "POST", body: jsonBody({ apiKey: newKey.trim(), ...(newLabel.trim() ? { label: newLabel.trim() } : {}) }) });
      setNewKey(""); setNewLabel(""); setAdding(false);
      await reload();
      setNotice("Chave adicionada. Verificando se ela funciona…");
      await startCheck(response.connection.id);
    });
  };

  const refreshUsage = (id: string) => run(id, async () => {
    const response = await api<{ connection: OllamaConnectionView }>(`/ai/connections/${id}/usage`, { method: "POST", body: "{}" });
    setKeys((current) => current.map((key) => key.id === id ? response.connection : key));
  });

  const update = (id: string, body: { label?: string | null; position?: number }) => run(id, async () => {
    const response = await api<{ items: OllamaConnectionView[] }>(`/ai/connections/${id}`, { method: "PATCH", body: jsonBody(body) });
    setKeys(response.items); setEditing(null);
  });

  const remove = (key: OllamaConnectionView, index: number) => {
    if (!window.confirm(`Remover ${keyName(key, index)}? As outras chaves continuam sendo usadas na ordem da lista.`)) return;
    void run(key.id, async () => {
      await api(`/ai/connections/${key.id}`, { method: "DELETE" });
      await reload();
      setNotice("Chave removida.");
    });
  };

  // A finished check only means the test ran; the key status says whether it was accepted.
  const onJobUpdate = async (next: JobView) => {
    if (!isTerminalJob(next)) return;
    const updated = await reload();
    setJob(null);
    const index = updated.findIndex((key) => key.id === jobKeyId);
    const key = updated[index];
    if ((next.state || "").toUpperCase() === "FAILED") setError(errorCodeCopy(next.errorCode));
    else if (key?.status === "CONNECTED") { setError(""); setNotice(`${keyName(key, index)} está funcionando.`); }
    else if (key) { setNotice(""); setError(`${keyName(key, index)} foi recusada pela Ollama Cloud. Confira a chave na sua conta e adicione de novo.`); }
  };

  const savePreference = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("preference", async () => {
      await api("/ai/preferences", { method: "PUT", body: jsonBody({ mode: "BYOK", ...(selectedModel ? { preferredModel: selectedModel } : {}) }) });
      setNotice("Modelo salvo para as próximas gerações.");
    });
  };

  const activeIndex = keys.findIndex((key) => key.status !== "INVALID" && !key.exhausted);
  const nearLimit = keys.map((key, index) => ({ key, index, window: tightestWindow(key) })).filter(({ key, window }) => key.status !== "INVALID" && window && window.usedPercent >= NEAR_LIMIT_USED);
  const usable = keys.filter((key) => key.status !== "INVALID");
  const allExhausted = usable.length > 0 && usable.every((key) => key.exhausted);
  const showForm = adding || (!loading && keys.length === 0);

  return <SettingsLayout active="/app/configuracoes/ia" eyebrow="IA COM CONTROLE" title="Inteligência artificial" description="Conecte suas chaves da Ollama Cloud e escolha o modelo usado nas gerações.">
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}
    {notice && <Notice tone="success" title="Tudo certo">{notice}</Notice>}
    {allExhausted ? <Notice tone="error" title="Todas as chaves atingiram o limite">As gerações voltam a funcionar quando o limite de uso da Ollama Cloud reiniciar, ou se você adicionar outra chave.</Notice>
      : nearLimit.length > 0 && <Notice tone="warning" title={nearLimit.length === 1 ? "Uma chave está perto do limite" : "Chaves perto do limite"}>{nearLimit.map(({ key, index, window }) => `${keyName(key, index)}: ${formatPercent(window!.usedPercent)} usado (${windowLabel(window!.name).toLowerCase()})`).join(" · ")}. {usable.length > 1 ? "Ao chegar em 100%, a próxima chave da lista assume automaticamente." : "Adicione outra chave para continuar quando ela acabar."}</Notice>}
    {job && <JobTracker job={job} onUpdate={(next) => void onJobUpdate(next)} onClose={() => setJob(null)} />}

    {loading ? <Panel><LoadingBlock label="Consultando suas chaves…" /></Panel> : <>
      <Panel title="Chaves Ollama Cloud" detail={keys.length > 1 ? "Usadas na ordem abaixo. Se uma chave for recusada ou atingir o limite, a próxima assume automaticamente." : "Use sua própria chave para conectar a Ollama Cloud. Você pode adicionar mais de uma."}>
        {keys.length > 0 && <ol className="ai-keys">{keys.map((key, index) => {
          const status = key.exhausted ? { pill: "No limite", tone: "bad" as const } : statusCopy[key.status] || { pill: key.status, tone: "pending" as const };
          const isBusy = busy === key.id || (job !== null && jobKeyId === key.id);
          return <li className={`ai-key ${index === activeIndex ? "is-active" : ""}`} key={key.id}>
            <div className="ai-key-head">
              <span className="ai-key-order" aria-label={`Posição ${index + 1}`}>{index + 1}</span>
              <div className="ai-key-title">
                {editing?.id === key.id
                  ? <form className="ai-key-rename" onSubmit={(event) => { event.preventDefault(); void update(key.id, { label: editing.label.trim() || null }); }}>
                      <input className="input" value={editing.label} maxLength={60} autoFocus aria-label="Nome da chave" placeholder={keyName(key, index)} onChange={(event) => setEditing({ id: key.id, label: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} />
                      <button type="submit" className="icon-button small" aria-label="Salvar nome"><Check size={15} /></button>
                      <button type="button" className="icon-button small" aria-label="Cancelar" onClick={() => setEditing(null)}><X size={15} /></button>
                    </form>
                  : <strong>{keyName(key, index)}{index === activeIndex && <span className="ai-key-active">Em uso</span>}</strong>}
                <small><code>{key.maskedKey || "••••"}</code> · {key.lastUsedAt ? `usada ${relativeTime(key.lastUsedAt)}` : "ainda não usada"}</small>
              </div>
              <span className={`connection-state ${status.tone}`}>{status.pill}</span>
            </div>
            <KeyUsage keyView={key} busy={isBusy} onRefresh={() => void refreshUsage(key.id)} />
            <div className="ai-key-actions">
              {key.status !== "INVALID" && <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void refreshUsage(key.id)}><RefreshCw size={14} className={busy === key.id ? "spin" : ""} />Atualizar uso</Button>}
              <Button type="button" variant="ghost" disabled={isBusy || job !== null} onClick={() => void run(key.id, () => startCheck(key.id))}>{jobKeyId === key.id && job ? "Verificando…" : "Verificar"}</Button>
              {index > 0 && <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void update(key.id, { position: 0 })}><ArrowUp size={14} />Usar primeiro</Button>}
              <Button type="button" variant="ghost" disabled={isBusy} onClick={() => setEditing({ id: key.id, label: key.label || "" })}><Pencil size={14} />Renomear</Button>
              <Button type="button" variant="ghost" className="ai-key-remove" disabled={isBusy} onClick={() => remove(key, index)}><Trash2 size={14} />Remover</Button>
            </div>
          </li>;
        })}</ol>}

        {showForm ? <form className="ai-key-form" onSubmit={addKey}>
          <div className="ai-key-form-head"><strong>{keys.length ? "Adicionar nova chave" : "Conectar sua primeira chave"}</strong>{keys.length > 0 && <button type="button" className="icon-button small" aria-label="Cancelar" onClick={() => { setAdding(false); setNewKey(""); setNewLabel(""); }}><X size={15} /></button>}</div>
          <label className="field"><span>Nome <small>opcional</small></span><input className="input" value={newLabel} maxLength={60} onChange={(event) => setNewLabel(event.target.value)} placeholder="Ex.: Conta pessoal" /></label>
          <label className="field"><span>Chave da API</span><input className="input" type="password" autoComplete="off" value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="Cole a chave criada em ollama.com/settings/keys" aria-describedby="key-note" /></label>
          <p className="secret-note" id="key-note"><LockKeyhole size={14} />Guardamos a chave criptografada; ela não aparece de novo. Use apenas chaves da sua própria conta Ollama.</p>
          <div className="form-actions"><Button type="submit" disabled={busy === "add" || newKey.trim().length < 16}>{busy === "add" ? "Adicionando…" : "Adicionar chave"}</Button></div>
        </form> : <button type="button" className="ai-key-add" onClick={() => setAdding(true)}><Plus size={16} />Adicionar nova chave</button>}
      </Panel>

      <Panel title="Modelo" detail="Usado em todas as chaves para as próximas gerações.">
        {modelsError && <Notice tone="error" title="Modelos indisponíveis">{modelsError}</Notice>}
        <form className="form-grid" onSubmit={savePreference}>
          <label className="field full-span"><span>Modelo</span><select className="input" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!usable.length || models.length === 0}><option value="">{models.length ? "Escolha um modelo" : "Conecte uma chave para ver os modelos"}</option>{models.filter((model) => model.provider.toLowerCase() === "ollama").map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
          <div className="ai-safety-copy"><strong>Seu limite continua valendo</strong><p>As chaves não desativam as cotas do seu plano no Facilita Estudo. Se uma chave falhar, as próximas da sua lista são tentadas; nunca há troca para um serviço pago.</p></div>
          <div className="form-actions"><Button type="submit" disabled={busy === "preference" || !usable.length || !selectedModel}>Salvar modelo</Button></div>
        </form>
      </Panel>
    </>}
  </SettingsLayout>;
}
