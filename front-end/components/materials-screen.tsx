"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorCodeCopy, errorCopy, newIdempotencyKey } from "@/lib/api";
import { documentStageLabel, documentStatusLabel } from "@/lib/display-labels";
import type { DocumentView, JobView } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { JobTracker } from "./job-tracker";
import { ArrowLeft, ArrowRight, BookOpen, CircleAlert, Download, FileText, GraduationCap, LockKeyhole, RotateCcw } from "lucide-react";

function formatFileSize(size?: string) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function DocumentScreen({ documentId, page = 1 }: { documentId: string; page?: number }) {
  const { persona } = useSession();
  const [document, setDocument] = useState<DocumentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const documentIsProcessing = document?.id === documentId && ["QUEUED", "PROCESSING"].includes(document.status.toUpperCase());

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    api<DocumentView | { document: DocumentView }>(`/documents/${documentId}`).then((value) => { if (live) setDocument("document" in value ? value.document : value); }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [documentId, reloadKey]);

  useEffect(() => {
    if (!documentIsProcessing) return;
    let live = true;
    let timer: number;
    const poll = async () => {
      let keepPolling = true;
      try {
        const value = await api<DocumentView | { document: DocumentView }>(`/documents/${documentId}`);
        if (!live) return;
        const next = "document" in value ? value.document : value;
        setDocument(next); setError("");
        keepPolling = ["QUEUED", "PROCESSING"].includes(next.status.toUpperCase());
      } catch (caught) {
        if (live) setError(errorCopy(caught));
      }
      if (live && keepPolling) timer = window.setTimeout(() => void poll(), 3000);
    };
    timer = window.setTimeout(() => void poll(), 3000);
    return () => { live = false; window.clearTimeout(timer); };
  }, [documentId, documentIsProcessing]);

  const retry = async () => {
    setBusy(true); setError(""); setNotice("");
    try { const response = await api<{ job: JobView }>(`/documents/${documentId}/reprocessing`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() } }); setJob(response.job); setNotice("Reprocessamento solicitado. O arquivo original foi mantido."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const handleJobUpdate = (next: JobView) => {
    setJob(next);
    if (["COMPLETED", "SUCCEEDED", "FAILED", "ERROR"].includes(next.state.toUpperCase())) refresh();
  };

  if (loading) return <LoadingBlock label="Carregando material…" />;
  if (!document) return <div className="page-stack"><Notice tone="error" title="Material indisponível">{error}</Notice><Link className="text-link" href="/app/disciplinas"><ArrowLeft size={14} />Voltar às disciplinas</Link></div>;

  const state = document.status.toUpperCase();
  const ready = ["READY", "COMPLETED"].includes(state);
  const failed = ["FAILED", "ERROR"].includes(state);
  const fileFormat = (document.format || document.name.split(".").pop() || "").toUpperCase();
  const pdf = fileFormat === "PDF";
  const formatLabel = fileFormat === "PPTX" ? "Apresentação PowerPoint" : fileFormat === "PDF" ? "PDF" : "Arquivo";
  const contentPath = `/api/v1/documents/${document.id}/content`;
  const materialActions = document.courseId ? <div className="form-actions"><Link className="button button-secondary" href={`/app/estudo?courseId=${encodeURIComponent(document.courseId)}&documentId=${encodeURIComponent(document.id)}&kind=SUMMARY`}><BookOpen size={15} />Gerar resumo deste arquivo</Link><Link className="button button-secondary" href={`/app/simulados?courseId=${encodeURIComponent(document.courseId)}&documentId=${encodeURIComponent(document.id)}`}><GraduationCap size={15} />Criar simulado com este arquivo</Link></div> : null;
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/disciplinas">Disciplinas</Link><span>/</span><span>{document.name}</span></div><PageTitle eyebrow="MATERIAL ACADÊMICO" title={document.name} description={`${formatLabel}${formatFileSize(document.sizeBytes) ? ` · ${formatFileSize(document.sizeBytes)}` : ""}`} actions={<><span className="tag tag-muted"><LockKeyhole size={12} />Conteúdo autorizado</span>{ready && <a className="button button-secondary" href={contentPath} download><Download size={15} />Baixar original</a>}</>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Atualização do material">{notice}</Notice>}{job && <JobTracker job={job} onUpdate={handleJobUpdate} onClose={() => setJob(null)} />}
    <div className="document-view"><Panel title="Estado do arquivo" detail="Etapas exibidas pelo processamento real do serviço."><div className="document-status"><span className={`document-state-dot ${ready ? "ready" : failed ? "failed" : "working"}`}>{ready ? "✓" : failed ? <CircleAlert size={16} /> : <span className="spinner" />}</span><div><strong>{documentStatusLabel(document.status)}</strong><small>{documentStageLabel(document.stage) || "Atualização do processamento."}</small></div></div>
      {failed && <Notice tone="error" title="O arquivo original continua disponível">{errorCodeCopy(document.errorCode || undefined)} Você pode pedir uma nova tentativa.</Notice>}
      {!ready && !failed && <Notice tone="info" title="O material ainda não está pronto">Você poderá estudar com este material quando o serviço concluir o processamento.</Notice>}
      {failed && persona === "TEACHER" && <Button type="button" variant="secondary" disabled={busy} onClick={() => void retry()}><RotateCcw size={14} />{busy ? "Solicitando…" : "Tentar novamente"}</Button>}
      {ready && materialActions}
    </Panel>
      <section className="document-preview" aria-label="Prévia do documento">{ready && pdf ? <iframe title={`Prévia de ${document.name}`} src={`${contentPath}#page=${page}`} /> : <div className="document-preview-empty"><FileText size={31} /><strong>{ready ? "Prévia não disponível para este formato" : failed ? "Prévia indisponível" : "Estamos preparando seu material"}</strong><p>{ready ? "Você pode abrir ou baixar o original. A busca e as respostas vão citar as páginas indexadas." : "O conteúdo original fica sob seu controle enquanto o processamento acontece."}</p>{ready && <a className="button button-primary" href={contentPath} target="_blank" rel="noreferrer"><Download size={15} />Abrir arquivo original<ArrowRight size={14} /></a>}</div>}</section>
    </div>
  </div>;
}
