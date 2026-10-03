"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { PlanView } from "@/lib/types";

function planPrice(plan: PlanView) {
  if (!plan.price) return "Preço não informado";
  const amount = Number(plan.price.amount);
  const formatted = Number.isFinite(amount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.price.currency }).format(amount)
    : `${plan.price.amount} ${plan.price.currency}`;
  return `${formatted} / ${plan.price.interval === "year" ? "ano" : "mês"}`;
}

function capabilityLabel(type: string, value: unknown) {
  if (type === "BOOLEAN") return value ? "incluído" : "não incluído";
  if (value == null) return "não informado";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function PublicPlans() {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api<{ items: PlanView[] }>("/plans").then((data) => setPlans(data.items || [])).catch(() => setError(true)); }, []);

  if (!plans) return <div className="plans-status" role="status">{error ? "As opções de plano não estão disponíveis agora. Você pode criar sua conta e consultar os recursos depois." : <><LoaderCircle className="spin" size={17} /> Carregando opções disponíveis…</>}</div>;
  if (plans.length === 0) return <div className="plans-status">O catálogo não retornou opções neste momento. Você pode criar sua conta e conhecer a plataforma.</div>;

  return <div className="plan-grid">{plans.map((plan) => <article className="plan-card" key={plan.code}>
    <p className="plan-kicker">{plan.name}</p>
    <h3>{planPrice(plan)}</h3>
    {Object.keys(plan.capabilities).length > 0 && <ul>{Object.entries(plan.capabilities).map(([key, capability]) => <li key={key}><Check size={14} />{key.replaceAll("_", " ")}: {capabilityLabel(capability.type, capability.value)}</li>)}</ul>}
    <Link href="/cadastro" className="button button-secondary">Criar conta<ArrowRight size={15} /></Link>
  </article>)}</div>;
}
