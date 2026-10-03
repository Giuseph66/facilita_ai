"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The tracker resets local polling state when a new job arrives. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, errorCopy, isTerminalJob } from "@/lib/api";
import type { JobView } from "@/lib/types";
import { Notice } from "./ui";
import { ArrowRight, LoaderCircle, X } from "lucide-react";

type JobResult = { artifactId?: string; assessmentId?: string; messageId?: string; exportId?: string; documentId?: string; practiceTestId?: string };

function resultPath(result?: unknown) {
  if (!result || typeof result !== "object") return null;
  const data = result as JobResult;
  if (data.artifactId) return { href: `/app/estudo/${data.artifactId}`, label: "Abrir material de estudo" };
  if (data.assessmentId) return { href: `/app/avaliacoes/${data.assessmentId}`, label: "Abrir avaliação" };
  if (data.exportId) return { href: `/app/exports/${data.exportId}`, label: "Abrir arquivo exportado" };
  if (data.practiceTestId) return { href: `/app/simulados/${data.practiceTestId}`, label: "Abrir simulado" };
  if (data.documentId) return { href: `/app/materiais/${data.documentId}`, label: "Abrir material" };
  return null;
}

export function JobTracker({ job, onClose, onUpdate }: { job: JobView; onClose?: () => void; onUpdate?: (job: JobView) => void }) {
  const [current, setCurrent] = useState(job);
  const [pollCount, setPollCount] = useState(0);
  const [pollError, setPollError] = useState("");
  const resultLink = useMemo(() => resultPath(current.result), [current.result]);
  const terminal = isTerminalJob(current);

  useEffect(() => { setCurrent(job); setPollCount(0); setPollError(""); }, [job]);
  useEffect(() => {
    if (terminal) return;
    let active = true;
    const delay = Math.min(1400 * (2 ** Math.min(pollCount, 3)), 8000);
    const timer = window.setTimeout(() => {
      api<JobView>(`/jobs/${job.id}`).then((next) => {
        if (!active) return;
        setCurrent(next); setPollCount((count) => count + 1); setPollError(""); if (isTerminalJob(next)) onUpdate?.(next);
      }).catch((error) => { if (active) { setPollError(errorCopy(error)); setPollCount((count) => count + 1); } });
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job.id, current.state, pollCount, terminal, onUpdate]);

  const state = current.state.toUpperCase();
  const failed = ["FAILED", "ERROR"].includes(state);
  return <div className="job-card">
    <div className="job-card-head"><span className={`job-symbol ${failed ? "failed" : terminal ? "done" : "working"}`}>{terminal ? "✓" : <LoaderCircle size={18} className="spin" />}</span><div className="job-heading"><strong>{failed ? "Não foi possível concluir" : terminal ? "Processamento concluído" : "Trabalhando no seu pedido"}</strong><span>{current.feature.replaceAll("_", " ")}</span></div>{onClose && <button type="button" className="icon-button small" onClick={onClose} aria-label="Fechar status do processamento"><X size={16} /></button>}</div>
    <p className="job-stage">{failed ? current.errorCode || "O serviço não concluiu esta etapa." : current.stage || (terminal ? "Conteúdo pronto para abrir." : "Preparando conteúdo…")}</p>
    {typeof current.progress === "number" && !terminal && <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current.progress}><span style={{ width: `${Math.max(0, Math.min(100, current.progress))}%` }} /></div>}
    {pollError && <p className="job-poll-error" role="status">O status será consultado novamente. {pollError}</p>}
    {failed && <Notice tone="error" title="A solicitação continua salva">Veja o código acima e tente novamente quando o serviço estiver disponível. Nenhuma troca de fornecedor foi feita automaticamente.</Notice>}
    {resultLink && terminal && <Link className="button button-secondary" href={resultLink.href}>{resultLink.label}<ArrowRight size={14} /></Link>}
  </div>;
}
