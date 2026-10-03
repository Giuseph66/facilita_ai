"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, LoaderCircle, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { useViewer } from "@/lib/use-viewer";
import { compareSections, isPilot, planCopy, planHighlights, planPrice, type CellValue } from "@/lib/plan-catalog";
import type { PlanView } from "@/lib/types";

function Cell({ value }: { value: CellValue }) {
  if (value === true) return <Check size={16} className="lp-yes" aria-label="Incluído" />;
  if (value === false) return <Minus size={16} className="lp-no" aria-label="Não incluído" />;
  return <>{value}</>;
}

export function PublicPlans() {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [error, setError] = useState(false);
  const viewer = useViewer();
  useEffect(() => { api<{ items: PlanView[] }>("/plans").then((data) => setPlans(data.items || [])).catch(() => setError(true)); }, []);

  if (!plans) return <div className="lp-plans-status" role="status">{error ? "Não foi possível carregar os planos agora. Você pode criar sua conta no plano Livre e consultar os demais depois." : <><LoaderCircle className="spin" size={17} /> Carregando planos…</>}</div>;
  if (plans.length === 0) return <div className="lp-plans-status">Nenhum plano disponível no momento. Você pode criar sua conta e conhecer a plataforma.</div>;

  const pilot = plans.some(isPilot);

  return <div className="lp-plans">
    <div className="lp-plan-grid">{plans.map((plan) => {
      const { amount, detail } = planPrice(plan);
      const available = Boolean(plan.price);
      return <article className="lp-plan" key={plan.code}>
        <h3>{plan.name}</h3>
        {planCopy[plan.code] && <p className="lp-plan-copy">{planCopy[plan.code]}</p>}
        <p className="lp-plan-price"><strong>{amount}</strong><span>{detail}</span></p>
        {viewer ? <Link href="/app/configuracoes/plano" className="button button-secondary button-block">Ver meu plano e consumo</Link> : available ? <Link href="/cadastro" className="button button-primary button-block">Começar agora<ArrowRight size={15} /></Link> : <Link href="/cadastro" className="button button-secondary button-block">Começar pelo Livre</Link>}
        <ul>{planHighlights(plan).map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul>
      </article>;
    })}</div>

    {pilot && <p className="lp-plans-note">Estamos em fase piloto. Valores e limites podem mudar antes do lançamento comercial, sempre com aviso prévio.</p>}

    <details className="lp-compare">
      <summary>Comparar todos os recursos</summary>
      <div className="lp-compare-scroll">
        <table>
          <thead><tr><th scope="col"><span className="sr-only">Recurso</span></th>{plans.map((plan) => <th scope="col" key={plan.code}>{plan.name}</th>)}</tr></thead>
          <tbody>{compareSections.map((section) => <Fragment key={section.title}>
            <tr className="lp-compare-group"><th scope="colgroup" colSpan={plans.length + 1}>{section.title}</th></tr>
            {section.rows.filter((row) => plans.some((plan) => row.key in plan.capabilities)).map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{plans.map((plan) => <td key={plan.code}><Cell value={row.format(plan.capabilities[row.key])} /></td>)}</tr>)}
          </Fragment>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}
