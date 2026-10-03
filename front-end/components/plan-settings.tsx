"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, Info, Minus, Plus } from "lucide-react";
import { api, errorCopy } from "@/lib/api";
import { compareSections, enabled, planChanges, rowDiffers, sharedFeatures, featureLabels, formatAmount, formatQuantity, isPilot, metricInfo, planCopy, planPrice, readLimit, usageOrder, type CellValue } from "@/lib/plan-catalog";
import type { EntitlementsView, OllamaConnectionView, PageResult, PlanView, UsageView } from "@/lib/types";
import { SettingsLayout } from "./settings-screen";
import { LoadingBlock, Notice, Panel } from "./ui";

type UsageRow = { metric: string; used: number; reserved: number; limit: number | null };

/** Counters are stored per period; only the current day/month counts toward today's numbers. */
function currentUsage(usage: UsageView | null, limits: EntitlementsView["limits"]): UsageRow[] {
  const today = new Date().toISOString();
  const latest = new Map<string, NonNullable<UsageView["items"]>[number]>();
  for (const item of usage?.items || []) {
    const previous = latest.get(item.metric);
    if (!previous || item.periodStart > previous.periodStart) latest.set(item.metric, item);
  }
  return usageOrder.filter((metric) => limits?.[metric] || latest.has(metric)).map((metric) => {
    const item = latest.get(metric);
    const period = limits?.[metric]?.period || item?.period;
    const stale = item && ((period === "day" && item.periodStart.slice(0, 10) !== today.slice(0, 10)) || (period === "month" && item.periodStart.slice(0, 7) !== today.slice(0, 7)));
    return {
      metric,
      used: item && !stale ? Number(item.used) || 0 : 0,
      reserved: item && !stale ? Number(item.reserved) || 0 : 0,
      limit: readLimit(limits?.[metric]?.limit ?? item?.limit ?? null),
    };
  });
}

function UsageMeter({ row }: { row: UsageRow }) {
  const info = metricInfo[row.metric];
  if (row.limit === 0) return <div className="ps-usage-row is-off">
    <div className="ps-usage-text"><strong>{info.label}</strong><small>{info.hint}</small></div>
    <div className="ps-usage-value"><span className="ps-off">Não incluído no seu plano</span></div>
  </div>;
  const percent = row.limit ? Math.min(100, (row.used / row.limit) * 100) : 0;
  const state = percent >= 100 ? "is-full" : percent >= 80 ? "is-high" : "";
  return <div className={`ps-usage-row ${state}`}>
    <div className="ps-usage-text"><strong>{info.label}</strong><small>{info.hint}</small></div>
    <div className="ps-usage-value">
      <span><b>{formatAmount(row.metric, row.used)}</b>{row.limit === null ? " · sem limite" : ` de ${formatQuantity(row.metric, row.limit)}`} <em>{info.scope}</em></span>
      {row.limit !== null && <div className="ps-meter" role="progressbar" aria-label={`${info.label}: ${Math.round(percent)}% usado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></div>}
      {row.reserved > 0 && <small>+{formatQuantity(row.metric, row.reserved)} em processamento</small>}
      {state === "is-full" && <small className="ps-full-note">Limite atingido</small>}
    </div>
  </div>;
}

function Cell({ value }: { value: CellValue }) {
  if (value === true) return <Check size={16} className="ps-yes" aria-label="Incluído" />;
  if (value === false) return <Minus size={16} className="ps-no" aria-label="Não incluído" />;
  return <>{value}</>;
}

export function PlanSettings() {
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [usage, setUsage] = useState<UsageView | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsView | null>(null);
  const [connection, setConnection] = useState<OllamaConnectionView | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      api<PageResult<PlanView>>("/plans"),
      api<UsageView>("/me/usage"),
      api<EntitlementsView>("/me/entitlements"),
      api<{ connection: OllamaConnectionView | null }>("/ai/connections/ollama"),
    ]).then(([plansResult, usageResult, entitlementsResult, connectionResult]) => {
      if (!live) return;
      if (plansResult.status === "fulfilled") setPlans(plansResult.value.items || []);
      if (entitlementsResult.status === "fulfilled") setEntitlements(entitlementsResult.value); else setError(errorCopy(entitlementsResult.reason));
      if (usageResult.status === "fulfilled") setUsage(usageResult.value); else setUsageError(errorCopy(usageResult.reason));
      setConnection(connectionResult.status === "fulfilled" ? connectionResult.value.connection : undefined);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const layout = (children: React.ReactNode) => <SettingsLayout active="/app/configuracoes/plano" eyebrow="PLANO E CONSUMO" title="Seu plano" description="O que está incluído na sua conta e quanto você já usou.">{children}</SettingsLayout>;

  if (loading) return layout(<Panel><LoadingBlock label="Consultando seu plano…" /></Panel>);
  if (error || !entitlements?.plan) return layout(<Notice tone="error" title="Não foi possível carregar seu plano">{error || "O serviço não informou um plano ativo para sua conta. Tente novamente em instantes."}</Notice>);

  const current = plans.find((plan) => plan.code === entitlements.plan?.code);
  const capabilities = current?.capabilities;
  const rows = currentUsage(usage, entitlements.limits);
  const fullRows = rows.filter((row) => row.limit && row.used >= row.limit);
  const generationsOff = rows.some((row) => row.metric === "DAILY_GENERATIONS" && row.limit === 0);
  const usesOwnAi = Boolean(entitlements.capabilities?.AI_BYOK_ACCESS) && !entitlements.platformAiEnabled;
  const aiConnected = connection?.status === "CONNECTED";
  const price = current ? planPrice(current) : null;
  const pilot = plans.some(isPilot);
  const others = plans.filter((plan) => plan.code !== current?.code);
  const shared = sharedFeatures(plans);
  const upgradeTargets = plans.filter((plan) => plan.code !== current?.code && (readLimit(plan.capabilities.DAILY_GENERATIONS?.value) || 0) > 0).map((plan) => plan.name);

  return layout(<>
    <section className="ps-summary">
      <div className="ps-summary-main">
        <span className="ps-summary-label">Plano atual</span>
        <h2>{entitlements.plan.name}</h2>
        {current && planCopy[current.code] && <p>{planCopy[current.code]}</p>}
      </div>
      <dl className="ps-summary-facts">
        {price && <div><dt>Valor</dt><dd>{price.amount}{price.amount !== "Grátis" && <small> {price.detail}</small>}</dd></div>}
        {entitlements.plan.periodEnd && <div><dt>Ciclo atual até</dt><dd>{new Date(entitlements.plan.periodEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</dd></div>}
        <div><dt>IA usada</dt><dd>{entitlements.platformAiEnabled ? "IA da plataforma" : usesOwnAi ? <>Sua conta Ollama Cloud <span className={aiConnected ? "ps-pill ps-pill-ok" : "ps-pill"}>{connection === undefined ? "status indisponível" : aiConnected ? "conectada" : "não conectada"}</span></> : "Não incluída"}</dd></div>
      </dl>
    </section>

    {fullRows.length > 0 && <Notice tone="warning" title="Você atingiu um limite do plano">{fullRows.map((row) => metricInfo[row.metric].label.toLowerCase()).join(", ")}. O que já existe continua acessível; só não é possível adicionar mais até o limite reiniciar.</Notice>}
    {generationsOff && <Notice tone="info" title="Seu plano não inclui gerações com IA">Você pode organizar disciplinas, turmas e materiais normalmente. Resumos, cartões, simulados, avaliações e respostas da IA fazem parte {upgradeTargets.length ? `dos planos ${upgradeTargets.join(", ")}` : "de outros planos"}.</Notice>}
    {!generationsOff && usesOwnAi && connection === null && <Notice tone="info" title="Conecte sua IA para usar os recursos de geração" href="/app/configuracoes/ia" action="Conectar agora">Seu plano usa a sua própria conta da Ollama Cloud. Sem ela, conversas e gerações não ficam disponíveis.</Notice>}

    <Panel title="Seu uso" detail={usageError ? "Não foi possível consultar o consumo agora; os limites abaixo continuam valendo." : "Limites diários reiniciam à meia-noite (UTC); o envio mensal, no início de cada mês."}>
      <div className="ps-usage">{rows.map((row) => <UsageMeter row={row} key={row.metric} />)}</div>
    </Panel>

    {capabilities && <Panel title="Recursos do seu plano">
      <ul className="ps-features">{featureLabels.filter((feature) => feature.key in capabilities).sort((a, b) => Number(enabled(capabilities[b.key])) - Number(enabled(capabilities[a.key]))).map((feature) => {
        const on = enabled(capabilities[feature.key]);
        return <li key={feature.key} className={on ? "" : "is-off"}>{on ? <Check size={16} /> : <Minus size={16} />}<span>{feature.label}</span>{feature.key === "AI_BYOK_ACCESS" && on && !aiConnected && !generationsOff && <Link href="/app/configuracoes/ia">Conectar<ArrowRight size={13} /></Link>}</li>;
      })}</ul>
    </Panel>}

    {current && others.length > 0 && <Panel title="Outros planos" detail={`O que muda em relação ao plano ${current.name}.`}>
      <div className="ps-plans">{others.map((plan) => {
        const changes = planChanges(current, plan);
        const { amount, detail } = planPrice(plan);
        return <article className="ps-plan" key={plan.code}>
          <h3>{plan.name}</h3>
          <p className="ps-plan-price"><strong>{amount}</strong><span>{detail}</span></p>
          {planCopy[plan.code] && <p className="ps-plan-copy">{planCopy[plan.code]}</p>}
          {changes.length ? <ul className="ps-changes">{changes.map((change) => <li key={change.key} className={`is-${change.kind}`}>
            <span className="ps-change-icon" aria-hidden="true">{change.kind === "added" ? <Plus size={13} /> : change.kind === "more" ? <ArrowUp size={13} /> : change.kind === "less" ? <ArrowDown size={13} /> : <Minus size={13} />}</span>
            <span className="ps-change-label">{change.label}</span>
            {change.kind === "added" ? <b className="ps-change-value">Incluído</b>
              : change.kind === "removed" ? <span className="ps-change-value">Não incluído</span>
              : <span className="ps-change-value"><span className="sr-only">de </span><s>{change.previous}</s><span aria-hidden="true"> → </span><span className="sr-only"> para </span><b>{change.value}</b></span>}
          </li>)}</ul> : <p className="ps-plan-copy">Mesmos recursos e limites do seu plano.</p>}
        </article>;
      })}</div>

      {shared.length > 0 && <p className="ps-shared"><Check size={15} /><span><b>Em todos os planos:</b> {shared.join(" · ")}</span></p>}

      <details className="ps-details">
        <summary>Ver tabela completa</summary>
        <div className="ps-compare">
          <table>
            <thead>
              <tr><th scope="col"><span className="sr-only">Recurso</span></th>{plans.map((plan) => <th scope="col" key={plan.code} className={plan.code === current.code ? "is-current" : ""}>{plan.code === current.code && <span className="ps-current-tag">Seu plano</span>}<strong>{plan.name}</strong></th>)}</tr>
            </thead>
            <tbody>{compareSections.map((section) => {
              const rows = section.rows.filter((row) => rowDiffers(plans, row));
              if (!rows.length) return null;
              return <Fragment key={section.title}>
                <tr className="ps-compare-group"><th scope="colgroup" colSpan={plans.length + 1}><span>{section.title}</span></th></tr>
                {rows.map((row) => <tr key={row.key}><th scope="row">{row.label}</th>{plans.map((plan) => <td key={plan.code} className={plan.code === current.code ? "is-current" : ""}><Cell value={row.format(plan.capabilities[row.key])} /></td>)}</tr>)}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
      </details>

      <p className="ps-compare-note"><Info size={14} />{pilot ? "Fase piloto: a troca de plano ainda não está disponível e nenhuma cobrança é feita. Valores e limites podem mudar, sempre com aviso prévio." : "Nenhuma cobrança ou mudança de plano acontece nesta tela."}</p>
    </Panel>}
  </>);
}
