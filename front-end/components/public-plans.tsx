"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, Minus } from "lucide-react";
import { api } from "@/lib/api";
import type { PlanView } from "@/lib/types";

type Capability = PlanView["capabilities"][string];
type Row = { key: string; label: string; format: (capability: Capability | undefined) => string | boolean };

const planCopy: Record<string, string> = {
  FREE: "Para conhecer a plataforma com seus primeiros materiais.",
  BYOK: "Para quem usa a própria conta de IA e precisa de mais espaço.",
  PREMIUM: "Para estudo frequente, com mais materiais e versões de prova.",
  TEACHER_PRO: "Para docentes com várias turmas e alto volume de avaliações.",
};

const numberFormat = new Intl.NumberFormat("pt-BR");

function limitOf(capability: Capability | undefined): number | null {
  if (!capability || capability.type !== "LIMIT") return null;
  const value = capability.value;
  const raw = typeof value === "object" && value !== null && "limit" in value ? (value as { limit: unknown }).limit : value;
  const limit = Number(raw);
  return Number.isFinite(limit) ? limit : null;
}

function enabled(capability: Capability | undefined) {
  return capability?.type === "BOOLEAN" && capability.value === true;
}

function bytes(value: number) {
  if (value >= 1e9) return `${numberFormat.format(Math.round(value / 1e8) / 10)} GB`;
  return `${numberFormat.format(Math.round(value / 1e6))} MB`;
}

function count(capability: Capability | undefined, singular: string, plural: string) {
  const limit = limitOf(capability);
  if (limit == null) return "—";
  return `${numberFormat.format(limit)} ${limit === 1 ? singular : plural}`;
}

const sections: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Materiais",
    rows: [
      { key: "MAX_DOCUMENTS", label: "Arquivos enviados", format: (c) => count(c, "arquivo", "arquivos") },
      { key: "MAX_STORAGE_BYTES", label: "Armazenamento total", format: (c) => { const l = limitOf(c); return l == null ? "—" : bytes(l); } },
      { key: "documents.bytes.monthly", label: "Envio por mês", format: (c) => { const l = limitOf(c); return l == null ? "—" : bytes(l); } },
      { key: "MAX_CLASSES", label: "Turmas", format: (c) => count(c, "turma", "turmas") },
    ],
  },
  {
    title: "Estudo e IA",
    rows: [
      { key: "RAG_ACCESS", label: "Perguntas com fonte", format: enabled },
      { key: "DAILY_STUDY_SESSIONS", label: "Sessões de estudo por dia", format: (c) => count(c, "sessão", "sessões") },
      { key: "DAILY_GENERATIONS", label: "Gerações por dia", format: (c) => { const l = limitOf(c); return l == null ? "—" : l === 0 ? false : numberFormat.format(l); } },
      { key: "MAX_CONCURRENT_AI_JOBS", label: "Tarefas simultâneas", format: (c) => { const l = limitOf(c); return l == null ? "—" : numberFormat.format(l); } },
      { key: "AI_BYOK_ACCESS", label: "Conectar sua conta de IA", format: enabled },
      { key: "AI_PLATFORM_ACCESS", label: "IA inclusa no plano", format: enabled },
    ],
  },
  {
    title: "Avaliações e exportação",
    rows: [
      { key: "ASSESSMENT_GENERATION", label: "Geração de avaliações", format: enabled },
      { key: "ASSESSMENT_VARIANTS", label: "Versões da mesma prova", format: enabled },
      { key: "PDF_EXPORT", label: "Exportação em PDF", format: enabled },
      { key: "DOCX_EXPORT", label: "Exportação em Word", format: enabled },
    ],
  },
];

function highlights(plan: PlanView) {
  const c = plan.capabilities;
  const items: string[] = [];
  const docs = limitOf(c.MAX_DOCUMENTS);
  const storage = limitOf(c.MAX_STORAGE_BYTES);
  if (docs != null) items.push(`${numberFormat.format(docs)} arquivos${storage != null ? ` · ${bytes(storage)}` : ""}`);
  const classes = limitOf(c.MAX_CLASSES);
  if (classes != null) items.push(classes === 1 ? "1 turma" : `Até ${numberFormat.format(classes)} turmas`);
  const generations = limitOf(c.DAILY_GENERATIONS);
  if (generations) items.push(`${numberFormat.format(generations)} gerações por dia`);
  if (enabled(c.RAG_ACCESS)) items.push("Perguntas com fonte");
  if (enabled(c.ASSESSMENT_VARIANTS)) items.push("Avaliações com versões");
  else if (enabled(c.ASSESSMENT_GENERATION)) items.push("Geração de avaliações");
  if (enabled(c.PDF_EXPORT)) items.push("Exportação em PDF");
  return items;
}

function price(plan: PlanView) {
  if (!plan.price) return { amount: "Em breve", detail: "Valor em definição" };
  const amount = Number(plan.price.amount);
  if (amount === 0) return { amount: "Grátis", detail: "Sem cartão de crédito" };
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.price.currency }).format(amount)
    : `${plan.price.amount} ${plan.price.currency}`;
  return { amount: formatted, detail: plan.price.interval === "year" ? "por ano" : "por mês" };
}

function isPilot(plan: PlanView) {
  const value = plan.capabilities.PILOT_LIMITS?.value;
  return typeof value === "object" && value !== null && (value as { commerciallyAvailable?: unknown }).commerciallyAvailable === false;
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check size={16} className="lp-yes" aria-label="Incluído" />;
  if (value === false) return <Minus size={16} className="lp-no" aria-label="Não incluído" />;
  return <>{value}</>;
}

export function PublicPlans() {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api<{ items: PlanView[] }>("/plans").then((data) => setPlans(data.items || [])).catch(() => setError(true)); }, []);

  if (!plans) return <div className="lp-plans-status" role="status">{error ? "Não foi possível carregar os planos agora. Você pode criar sua conta no plano Livre e consultar os demais depois." : <><LoaderCircle className="spin" size={17} /> Carregando planos…</>}</div>;
  if (plans.length === 0) return <div className="lp-plans-status">Nenhum plano disponível no momento. Você pode criar sua conta e conhecer a plataforma.</div>;

  const pilot = plans.some(isPilot);

  return <div className="lp-plans">
    <div className="lp-plan-grid">{plans.map((plan) => {
      const { amount, detail } = price(plan);
      const available = Boolean(plan.price);
      return <article className="lp-plan" key={plan.code}>
        <h3>{plan.name}</h3>
        {planCopy[plan.code] && <p className="lp-plan-copy">{planCopy[plan.code]}</p>}
        <p className="lp-plan-price"><strong>{amount}</strong><span>{detail}</span></p>
        {available ? <Link href="/cadastro" className="button button-primary button-block">Começar agora<ArrowRight size={15} /></Link> : <span className="lp-plan-soon">Disponível em breve</span>}
        <ul>{highlights(plan).map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>;
    })}</div>

    {pilot && <p className="lp-plans-note">Estamos em fase piloto. Valores e limites podem mudar antes do lançamento comercial, sempre com aviso prévio.</p>}

    <details className="lp-compare">
      <summary>Comparar todos os recursos</summary>
      <div className="lp-compare-scroll">
        <table>
          <thead><tr><th scope="col"><span className="sr-only">Recurso</span></th>{plans.map((plan) => <th scope="col" key={plan.code}>{plan.name}</th>)}</tr></thead>
          <tbody>{sections.map((section) => <Fragment key={section.title}>
            <tr className="lp-compare-group"><th scope="colgroup" colSpan={plans.length + 1}>{section.title}</th></tr>
            {section.rows.filter((row) => plans.some((plan) => row.key in plan.capabilities)).map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{plans.map((plan) => <td key={plan.code}><Cell value={row.format(plan.capabilities[row.key])} /></td>)}</tr>)}
          </Fragment>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}
