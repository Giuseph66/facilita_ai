"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Effects here synchronize request lifecycle state before API awaits. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorCopy, newIdempotencyKey } from "@/lib/api";
import type { DocumentView, JobView } from "@/lib/types";
import { useSession } from "./session-context";
import { Button, LoadingBlock, Notice, PageTitle, Panel } from "./ui";
import { JobTracker } from "./job-tracker";
import { ArrowLeft, ArrowRight, CircleAlert, Download, FileText, LockKeyhole, RotateCcw } from "lucide-react";

const stateNames: Record<string, string> = {
  UPLOADING: "Enviando arquivo", QUEUED: "Na fila", PENDING: "Aguardando processamento", PROCESSING: "Processando", READING: "Lendo conteúdo", READY: "Pronto para estudar", FAILED: "Falhou", ERROR: "Falhou",
};

export function DocumentScreen({ documentId }: { documentId: string }) {
  const { persona } = useSession();
  const [document, setDocument] = useState<DocumentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    api<DocumentView | { document: DocumentView }>(`/documents/${documentId}`).then((value) => { if (live) setDocument("document" in value ? value.document : value); }).catch((caught) => { if (live) setError(errorCopy(caught)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [documentId, reloadKey]);

  const retry = async () => {
    setBusy(true); setError(""); setNotice("");
    try { const response = await api<{ job: JobView }>(`/documents/${documentId}/reprocessing`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() } }); setJob(response.job); setNotice("Reprocessamento solicitado. O arquivo original foi mantido."); }
    catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const handleJobUpdate = (next: JobView) => {
    if (["COMPLETED", "SUCCEEDED", "FAILED", "ERROR"].includes(next.state.toUpperCase())) refresh();
  };

  if (loading) return <LoadingBlock label="Carregando material…" />;
  if (!document) return <div className="page-stack"><Notice tone="error" title="Material indisponível">{error}</Notice><Link className="text-link" href="/app/disciplinas"><ArrowLeft size={14} />Voltar às disciplinas</Link></div>;

  const state = document.status.toUpperCase();
  const ready = ["READY", "COMPLETED"].includes(state);
  const failed = ["FAILED", "ERROR"].includes(state);
  const pdf = (document.format || document.name.split(".").pop() || "").toUpperCase() === "PDF";
  const contentPath = `/api/v1/documents/${document.id}/content`;
  return <div className="page-stack"><div className="breadcrumbs"><Link href="/app/disciplinas">Disciplinas</Link><span>/</span><span>{document.name}</span></div><PageTitle eyebrow="MATERIAL ACADÊMICO" title={document.name} description={`${document.format || "Arquivo"}${document.sizeBytes ? ` · ${document.sizeBytes} bytes` : ""}`} actions={<><span className="tag tag-muted"><LockKeyhole size={12} />Conteúdo autorizado</span>{ready && <a className="button button-secondary" href={contentPath} download><Download size={15} />Baixar original</a>}</>} />
    {error && <Notice tone="error" title="Ação não concluída">{error}</Notice>}{notice && <Notice tone="success" title="Atualização do material">{notice}</Notice>}{job && <JobTracker job={job} onUpdate={handleJobUpdate} onClose={() => setJob(null)} />}
    <div className="document-view"><Panel title="Estado do arquivo" detail="Etapas exibidas pelo processamento real do serviço."><div className="document-status"><span className={`document-state-dot ${ready ? "ready" : failed ? "failed" : "working"}`}>{ready ? "✓" : failed ? <CircleAlert size={16} /> : <span className="spinner" />}</span><div><strong>{stateNames[state] || document.status}</strong><small>{document.stage || "Aguardando atualização do serviço."}</small></div></div>
      {failed && <Notice tone="error" title="O arquivo original continua disponível">{document.errorCode || "O processamento falhou."} Você pode pedir uma nova tentativa.</Notice>}
      {!ready && !failed && <Notice tone="info" title="O material ainda não está pronto">Você poderá estudar com este material quando o serviço concluir o processamento.</Notice>}
      {failed && persona === "TEACHER" && <Button type="button" variant="secondary" disabled={busy} onClick={() => void retry()}><RotateCcw size={14} />{busy ? "Solicitando…" : "Tentar novamente"}</Button>}
    </Panel>
      <section className="document-preview" aria-label="Prévia do documento">{ready && pdf ? <iframe title={`Prévia de ${document.name}`} src={contentPath} /> : <div className="document-preview-empty"><FileText size={31} /><strong>{ready ? "Prévia não disponível para este formato" : failed ? "Prévia indisponível" : "Estamos preparando seu material"}</strong><p>{ready ? "Você pode abrir ou baixar o original. A busca e as respostas vão citar as páginas indexadas." : "O conteúdo original fica sob seu controle enquanto o processamento acontece."}</p>{ready && <a className="button button-primary" href={contentPath} target="_blank" rel="noreferrer"><Download size={15} />Abrir arquivo original<ArrowRight size={14} /></a>}</div>}</section>
    </div>
  </div>;
}
