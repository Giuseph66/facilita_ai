"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The tracker resets local polling state when a new job arrives. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorCodeCopy, errorCopy, isTerminalJob } from "@/lib/api";
import { formatPercent, keyName, NEAR_LIMIT_USED, tightestWindow, usageSummary } from "@/lib/ai-keys";
import type { JobView, OllamaConnectionView } from "@/lib/types";
import { Notice } from "./ui";
import { ArrowRight, LoaderCircle, X } from "lucide-react";

type JobResult = { artifactId?: string; assessmentId?: string; messageId?: string; exportId?: string; documentId?: string; practiceTestId?: string };

const featureLabels: Record<string, { label: string; done: string }> = {
  AI_CONNECTION_CHECK: { label: "Verificação da conexão de IA", done: "Verificação concluída" },
  ASSESSMENT_EXPORT: { label: "Exportação da avaliação", done: "Arquivo pronto" },
  ASSESSMENT_GENERATION: { label: "Geração da avaliação", done: "Avaliação gerada" },
  CHAT_REPLY: { label: "Resposta da IA", done: "Resposta pronta" },
  DOCUMENT_PROCESS: { label: "Processamento do material", done: "Material processado" },
  DOCUMENT_PURGE: { label: "Remoção do material", done: "Material removido" },
  STUDY_ARTIFACT: { label: "Criação do material de estudo", done: "Material de estudo pronto" },
};

const aiFeatures = new Set(["CHAT_REPLY", "STUDY_ARTIFACT", "ASSESSMENT_GENERATION"]);

/** After an AI job, says which key served it and how much of it is left. */
function KeyUsageNote() {
  const [note, setNote] = useState<{ text: string; low: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ items: OllamaConnectionView[] }>("/ai/connections").then(({ items }) => {
      if (!active) return;
      const used = items.map((key, index) => ({ key, index })).filter(({ key }) => key.lastUsedAt)
        .sort((a, b) => b.key.lastUsedAt!.localeCompare(a.key.lastUsedAt!))[0];
      if (!used) return;
      const window = tightestWindow(used.key);
      const low = Boolean(window && window.usedPercent >= NEAR_LIMIT_USED);
      setNote({ text: usageSummary(used.key, used.index) + (low ? ` ${keyName(used.key, used.index)} está quase no limite (${formatPercent(window!.usedPercent)} usado).` : ""), low });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (!note) return null;
  return <p className={`job-key-usage ${note.low ? "is-low" : ""}`}><Link href="/app/configuracoes/ia">{note.text}</Link></p>;
}

function resultPath(result?: unknown) {
  if (!result || typeof result !== "object") return null;
  const data = result as JobResult;
  if (data.practiceTestId) return { href: `/app/simulados/${data.practiceTestId}`, label: "Abrir simulado" };
  if (data.artifactId) return { href: `/app/estudo/${data.artifactId}`, label: "Abrir material de estudo" };
  if (data.assessmentId) return { href: `/app/avaliacoes/${data.assessmentId}`, label: "Abrir avaliação" };
  if (data.exportId) return { href: `/app/exports/${data.exportId}`, label: "Abrir arquivo exportado" };
  if (data.documentId) return { href: `/app/materiais/${data.documentId}`, label: "Abrir material" };
  return null;
}

export function JobTracker({ job, onClose, onUpdate }: { job: JobView; onClose?: () => void; onUpdate?: (job: JobView) => void }) {
  const [current, setCurrent] = useState(job);
  const [pollCount, setPollCount] = useState(0);
  const [pollError, setPollError] = useState("");
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const resultLink = useMemo(() => resultPath(current.result), [current.result]);
  const terminal = isTerminalJob(current);

  useEffect(() => { setCurrent(job); setPollCount(0); setPollError(""); setObservedAt(Date.now()); setNow(Date.now()); }, [job]);
  useEffect(() => {
    if (current.state.toUpperCase() !== "QUEUED" || terminal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [current.state, terminal]);
  useEffect(() => {
    if (terminal) return;
    let active = true;
    const delay = Math.min(1400 * (2 ** Math.min(pollCount, 3)), 8000);
    const timer = window.setTimeout(() => {
      api<{ job: JobView }>(`/jobs/${job.id}`).then(({ job: next }) => {
        if (!active || !next) return;
        setCurrent(next); setPollCount((count) => count + 1); setPollError(""); if (isTerminalJob(next)) onUpdate?.(next);
      }).catch((error) => { if (active) { setPollError(errorCopy(error)); setPollCount((count) => count + 1); } });
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job.id, current.state, pollCount, terminal, onUpdate]);

  const state = (current.state || "").toUpperCase();
  const feature = featureLabels[current.feature] || { label: "Processamento", done: "Processamento concluído" };
  const failed = ["FAILED", "ERROR"].includes(state);
  const queuedAt = current.createdAt ? Date.parse(current.createdAt) : observedAt;
  const queueIsSlow = state === "QUEUED" && Number.isFinite(queuedAt) && now - queuedAt >= 60_000;
  return <div className="job-card">
    <div className="job-card-head"><span className={`job-symbol ${failed ? "failed" : terminal ? "done" : "working"}`}>{terminal ? "✓" : <LoaderCircle size={18} className="spin" />}</span><div className="job-heading"><strong>{failed ? "Não foi possível concluir" : terminal ? feature.done : "Trabalhando no seu pedido"}</strong><span>{feature.label}</span></div>{onClose && <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar status do processamento"><X size={16} /></button>}</div>
    <p className="job-stage">{failed ? errorCodeCopy(current.errorCode) : terminal ? "Tudo pronto." : "Isso pode levar alguns instantes. Você pode continuar usando o app."}</p>
    {queueIsSlow && <Notice tone="warning" title="A fila está demorando">Esta solicitação permanece na fila há mais de um minuto. O status continua sendo consultado automaticamente.</Notice>}
    {typeof current.progress === "number" && !terminal && <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current.progress}><span style={{ width: `${Math.max(0, Math.min(100, current.progress))}%` }} /></div>}
    {pollError && <p className="job-poll-error" role="status">O status será consultado novamente. {pollError}</p>}
    {failed && <Notice tone="error" title="A solicitação continua salva">Tente novamente quando o serviço estiver disponível. Nenhuma troca de fornecedor foi feita automaticamente.</Notice>}
    {terminal && !failed && aiFeatures.has(current.feature) && <KeyUsageNote />}
    {resultLink && terminal && <Link className="button button-secondary" href={resultLink.href}>{resultLink.label}<ArrowRight size={14} /></Link>}
  </div>;
}
