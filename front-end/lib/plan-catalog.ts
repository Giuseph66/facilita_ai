import type { PlanView } from "./types";

/** Human copy and formatting for plan capabilities, shared by the public page and account settings. */

export type Capability = PlanView["capabilities"][string];
export type CellValue = string | boolean;

const numberFormat = new Intl.NumberFormat("pt-BR");

export const planCopy: Record<string, string> = {
  FREE: "Para conhecer a plataforma com seus primeiros materiais.",
  BYOK: "Para quem usa a própria conta de IA e precisa de mais espaço.",
  PREMIUM: "Para estudo frequente, com mais materiais e versões de prova.",
  TEACHER_PRO: "Para docentes com várias turmas e alto volume de avaliações.",
};

export function formatNumber(value: number) {
  return numberFormat.format(value);
}

export function formatBytes(value: number) {
  if (value >= 1e9) return `${numberFormat.format(Math.round(value / 1e8) / 10)} GB`;
  if (value >= 1e6) return `${numberFormat.format(Math.round(value / 1e5) / 10)} MB`;
  if (value >= 1e3) return `${numberFormat.format(Math.round(value / 1e3))} KB`;
  return value === 0 ? "0 MB" : `${numberFormat.format(value)} B`;
}

/** Reads `{ limit }` objects, raw numbers and numeric strings alike. */
export function readLimit(value: unknown): number | null {
  const raw = typeof value === "object" && value !== null && "limit" in value ? (value as { limit: unknown }).limit : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const limit = Number(raw);
  return Number.isFinite(limit) ? limit : null;
}

export function limitOf(capability: Capability | undefined): number | null {
  return capability?.type === "LIMIT" ? readLimit(capability.value) : null;
}

export function enabled(capability: Capability | undefined) {
  return capability?.type === "BOOLEAN" && capability.value === true;
}

type MetricInfo = { label: string; hint: string; scope: string; bytes?: boolean; unit?: [string, string] };

/** Metrics a person can actually consume, in the order they make sense to read. */
export const metricInfo: Record<string, MetricInfo> = {
  MAX_DOCUMENTS: { label: "Arquivos", hint: "Arquivos guardados na sua conta.", scope: "no total", unit: ["arquivo", "arquivos"] },
  MAX_STORAGE_BYTES: { label: "Armazenamento", hint: "Espaço ocupado por todos os seus arquivos.", scope: "no total", bytes: true },
  "documents.bytes.monthly": { label: "Envio de arquivos", hint: "Volume enviado neste mês. Reinicia no próximo mês.", scope: "neste mês", bytes: true },
  MAX_CLASSES: { label: "Turmas", hint: "Turmas criadas por você.", scope: "no total", unit: ["turma", "turmas"] },
  DAILY_STUDY_SESSIONS: { label: "Conversas de estudo", hint: "Novas conversas iniciadas hoje. Reinicia à meia-noite (UTC).", scope: "hoje", unit: ["conversa", "conversas"] },
  DAILY_GENERATIONS: { label: "Gerações com IA", hint: "Respostas, resumos, cartões, simulados e avaliações gerados hoje.", scope: "hoje", unit: ["geração", "gerações"] },
};

export const usageOrder = ["MAX_DOCUMENTS", "MAX_STORAGE_BYTES", "documents.bytes.monthly", "MAX_CLASSES", "DAILY_STUDY_SESSIONS", "DAILY_GENERATIONS"];

export function formatAmount(metric: string, value: number) {
  const info = metricInfo[metric];
  if (info?.bytes) return formatBytes(value);
  return formatNumber(value);
}

export function formatQuantity(metric: string, value: number) {
  const info = metricInfo[metric];
  if (info?.bytes) return formatBytes(value);
  if (!info?.unit) return formatNumber(value);
  return `${formatNumber(value)} ${value === 1 ? info.unit[0] : info.unit[1]}`;
}

export const featureLabels: Array<{ key: string; label: string }> = [
  { key: "RAG_ACCESS", label: "Perguntas com fonte" },
  { key: "AI_BYOK_ACCESS", label: "Conectar sua conta de IA" },
  { key: "AI_PLATFORM_ACCESS", label: "IA inclusa no plano" },
  { key: "ASSESSMENT_GENERATION", label: "Geração de avaliações" },
  { key: "ASSESSMENT_VARIANTS", label: "Versões da mesma prova" },
  { key: "PDF_EXPORT", label: "Exportação em PDF" },
  { key: "DOCX_EXPORT", label: "Exportação em Word" },
];

type Row = { key: string; label: string; format: (capability: Capability | undefined) => CellValue; technical?: boolean; short?: string };

function limitCell(key: string, zeroIsOff = false) {
  return (capability: Capability | undefined): CellValue => {
    const limit = limitOf(capability);
    if (limit == null) return "—";
    if (zeroIsOff && limit === 0) return false;
    return formatQuantity(key, limit);
  };
}

export const compareSections: Array<{ title: string; rows: Row[] }> = [
  {
    title: "Materiais",
    rows: [
      { key: "MAX_DOCUMENTS", label: "Arquivos", format: limitCell("MAX_DOCUMENTS") },
      { key: "MAX_STORAGE_BYTES", label: "Armazenamento total", short: "Armazenamento", format: limitCell("MAX_STORAGE_BYTES") },
      { key: "documents.bytes.monthly", label: "Envio por mês", short: "Envio/mês", format: limitCell("documents.bytes.monthly") },
      { key: "MAX_CLASSES", label: "Turmas", format: limitCell("MAX_CLASSES") },
    ],
  },
  {
    title: "Estudo e IA",
    rows: [
      { key: "RAG_ACCESS", label: "Perguntas com fonte", format: enabled },
      { key: "DAILY_STUDY_SESSIONS", label: "Conversas por dia", short: "Conversas/dia", format: limitCell("DAILY_STUDY_SESSIONS") },
      { key: "DAILY_GENERATIONS", label: "Gerações com IA por dia", short: "Gerações de IA/dia", format: limitCell("DAILY_GENERATIONS", true) },
      { key: "MAX_CONCURRENT_AI_JOBS", label: "Tarefas de IA ao mesmo tempo", technical: true, format: (c) => { const l = limitOf(c); return l == null ? "—" : formatNumber(l); } },
      { key: "AI_BYOK_ACCESS", label: "Conectar sua conta de IA", format: enabled },
      { key: "AI_PLATFORM_ACCESS", label: "IA inclusa no plano", format: enabled },
    ],
  },
  {
    title: "Avaliações e exportação",
    rows: [
      { key: "ASSESSMENT_GENERATION", label: "Geração de avaliações", format: enabled },
      { key: "ASSESSMENT_VARIANTS", label: "Versões da mesma prova", short: "Versões de prova", format: enabled },
      { key: "PDF_EXPORT", label: "Exportação em PDF", format: enabled },
      { key: "DOCX_EXPORT", label: "Exportação em Word", format: enabled },
    ],
  },
];

export function planHighlights(plan: PlanView) {
  const c = plan.capabilities;
  const items: string[] = [];
  const docs = limitOf(c.MAX_DOCUMENTS);
  const storage = limitOf(c.MAX_STORAGE_BYTES);
  if (docs != null) items.push(`${formatNumber(docs)} arquivos${storage != null ? ` · ${formatBytes(storage)}` : ""}`);
  const classes = limitOf(c.MAX_CLASSES);
  if (classes != null) items.push(classes === 1 ? "1 turma" : `Até ${formatNumber(classes)} turmas`);
  const generations = limitOf(c.DAILY_GENERATIONS);
  if (generations) items.push(`${formatNumber(generations)} gerações com IA por dia`);
  if (enabled(c.RAG_ACCESS)) items.push("Perguntas com fonte");
  if (enabled(c.ASSESSMENT_VARIANTS)) items.push("Avaliações com versões");
  else if (enabled(c.ASSESSMENT_GENERATION)) items.push("Geração de avaliações");
  if (enabled(c.PDF_EXPORT)) items.push("Exportação em PDF");
  return items;
}

export function planPrice(plan: PlanView) {
  if (!plan.price) return { amount: "Em breve", detail: "Valor em definição" };
  const amount = Number(plan.price.amount);
  if (amount === 0) return { amount: "Grátis", detail: "Sem cartão de crédito" };
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.price.currency }).format(amount)
    : `${plan.price.amount} ${plan.price.currency}`;
  return { amount: formatted, detail: plan.price.interval === "year" ? "por ano" : "por mês" };
}

export function isPilot(plan: PlanView) {
  const value = plan.capabilities.PILOT_LIMITS?.value;
  return typeof value === "object" && value !== null && (value as { commerciallyAvailable?: unknown }).commerciallyAvailable === false;
}

export type PlanChange = { key: string; label: string; kind: "added" | "more" | "less" | "removed"; value: string; previous: string };

function cellText(value: CellValue) {
  return typeof value === "boolean" ? (value ? "incluído" : "não incluído") : value;
}

/** What someone gains or loses moving from one plan to another, in reading order. */
export function planChanges(from: PlanView, to: PlanView): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const row of compareSections.flatMap((section) => section.rows)) {
    if (row.technical) continue;
    const before = from.capabilities[row.key];
    const after = to.capabilities[row.key];
    if (before?.type === "BOOLEAN" || after?.type === "BOOLEAN") {
      const had = enabled(before), has = enabled(after);
      if (had !== has) changes.push({ key: row.key, label: row.short || row.label, kind: has ? "added" : "removed", value: cellText(has), previous: cellText(had) });
      continue;
    }
    const a = limitOf(before), b = limitOf(after);
    if (a === null || b === null || a === b) continue;
    changes.push({ key: row.key, label: row.short || row.label, kind: b > a ? "more" : "less", value: formatAmount(row.key, b), previous: a === 0 ? "—" : formatAmount(row.key, a) });
  }
  return changes.sort((x, y) => Number(x.kind === "added") - Number(y.kind === "added"));
}

/** Rows whose value is the same in every plan add nothing to a comparison. */
export function rowDiffers(plans: PlanView[], row: { key: string; format: (capability: Capability | undefined) => CellValue }) {
  const values = plans.map((plan) => String(row.format(plan.capabilities[row.key])));
  return new Set(values).size > 1;
}

/** Features every plan has, to state once instead of repeating per plan. */
export function sharedFeatures(plans: PlanView[]) {
  return featureLabels.filter((feature) => plans.length > 0 && plans.every((plan) => enabled(plan.capabilities[feature.key]))).map((feature) => feature.label);
}
