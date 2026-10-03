import type { KeyUsageWindow, OllamaConnectionView } from "./types";

/** Usage windows reported by Ollama Cloud, named for people. */
const windowNames: Record<string, string> = {
  session: "Sessão (5 h)",
  hourly: "Hora",
  daily: "Dia",
  weekly: "Semana",
  monthly: "Mês",
};

export function windowLabel(name: string) {
  return windowNames[name] || name.charAt(0).toUpperCase() + name.slice(1).replaceAll("_", " ");
}

/** Unnamed keys are named by their last characters, which stay the same when the order changes. */
export function keyName(key: OllamaConnectionView, index: number) {
  if (key.label) return key.label;
  const suffix = (key.maskedKey || "").replace(/[^A-Za-z0-9]/g, "");
  return suffix ? `Chave …${suffix}` : `Chave ${index + 1}`;
}

/** The tightest window decides how much of a key is really left. */
export function tightestWindow(key: OllamaConnectionView): KeyUsageWindow | null {
  const windows = key.usage?.windows ?? [];
  return windows.reduce<KeyUsageWindow | null>((lowest, window) => !lowest || window.remainingPercent < lowest.remainingPercent ? window : lowest, null);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(Math.max(0, value))}%`;
}

export const NEAR_LIMIT_USED = 90;

export function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Summary sentence after a generation: which key served it and what is left. */
export function usageSummary(key: OllamaConnectionView, index: number) {
  const windows = key.usage?.windows ?? [];
  if (!windows.length) return `${keyName(key, index)} foi usada.`;
  return `${keyName(key, index)}: restam ${windows.map((window) => `${formatPercent(window.remainingPercent)} (${windowLabel(window.name).toLowerCase()})`).join(" · ")}.`;
}
