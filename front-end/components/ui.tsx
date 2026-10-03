import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Eye, LockKeyhole, Sparkles } from "lucide-react";

export function Button({ children, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-title-row"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function Panel({ title, detail, children, className = "" }: { title?: string; detail?: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{(title || detail) && <div className="panel-heading">{title && <h2>{title}</h2>}{detail && <p>{detail}</p>}</div>}{children}</section>;
}

export function EmptyState({ title, detail, action, href }: { title: string; detail: string; action?: string; href?: string }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">✳</span><h3>{title}</h3><p>{detail}</p>{action && href && <Link className="button button-secondary" href={href}>{action}<ArrowRight size={16} aria-hidden="true" /></Link>}</div>;
}

export function VisibilityTag({ released = false, children }: { released?: boolean; children?: ReactNode }) {
  return <span className={`tag ${released ? "tag-sage" : "tag-muted"}`}>{released ? <Eye size={12} aria-hidden="true" /> : <LockKeyhole size={12} aria-hidden="true" />}{children || (released ? "Liberado" : "Privado")}</span>;
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return <div className="loading-block" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function Notice({ tone = "info", title, children, href, action }: { tone?: "info" | "success" | "warning" | "error"; title: string; children: ReactNode; href?: string; action?: string }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}><span className="notice-icon" aria-hidden="true"><Sparkles size={17} /></span><div><strong>{title}</strong><div>{children}</div>{href && action && <Link className="inline-link" href={href}>{action}<ArrowRight size={14} aria-hidden="true" /></Link>}</div></div>;
}

export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{help && <span className="field-help">{help}</span>}{error && <span className="field-error" role="alert">{error}</span>}</div>;
}
