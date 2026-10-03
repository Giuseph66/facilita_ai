"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The reset token is read from the browser URL after hydration. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Eye, EyeOff, GraduationCap, Leaf, Loader2, Lock, Mail, User } from "lucide-react";
import { ApiError, api, errorCopy, setCsrfToken } from "@/lib/api";
import type { SessionView } from "@/lib/types";

type Mode = "login" | "register" | "recovery";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [persona, setPersona] = useState("TEACHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => { setResetToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (needsLength && !passwordValid) { setInvalid(true); setError("A senha precisa ter 12 ou mais caracteres, com letra e número."); return; }
    setBusy(true); setError(""); setNotice(""); setInvalid(false);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    try {
      if (mode === "recovery") {
        if (resetToken) {
          await api("/auth/password-reset", { method: "POST", body: JSON.stringify({ token: resetToken, password: values.password }) });
          setNotice("Senha atualizada. Você já pode entrar com a nova senha.");
          return;
        }
        await api("/auth/password-recovery", { method: "POST", body: JSON.stringify({ email: values.email }) });
        setNotice("Se houver uma conta com este e-mail, você receberá instruções para continuar.");
        return;
      }
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const payload = mode === "register"
        ? { name: values.name, email: values.email, password: values.password, persona }
        : { email: values.email, password: values.password };
      const session = await api<SessionView>(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setCsrfToken(session.csrfToken);
      router.replace("/app");
    } catch (caught) { setInvalid(caught instanceof ApiError && caught.code === "VALIDATION_FAILED"); setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const title = mode === "login" ? "Que bom ter você de volta." : mode === "register" ? "Seu espaço começa aqui." : resetToken ? "Escolha uma nova senha." : "Vamos recuperar seu acesso.";
  const isReset = mode === "recovery" && Boolean(resetToken);
  const needsLength = mode === "register" || isReset;
  const lengthOk = password.length >= 12;
  const hasLetter = /\p{L}/u.test(password);
  const hasNumber = /\d/.test(password);
  const passwordValid = lengthOk && hasLetter && hasNumber;
  const passwordInvalid = invalid && needsLength && !passwordValid;
  const rules = [
    { ok: lengthOk, label: "12 ou mais caracteres" },
    { ok: hasLetter, label: "Pelo menos uma letra" },
    { ok: hasNumber, label: "Pelo menos um número" },
  ];

  return <main className="auth-page">
    <div className="auth-left"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><div className="auth-art"><span className="auth-leaf">✳</span><p className="eyebrow">Um espaço para respirar</p><h1>O próximo passo<br /><em>já está ao seu alcance.</em></h1><p>Materiais, boas perguntas e um caminho possível para seguir aprendendo.</p><div className="auth-art-line" /></div><p className="auth-footnote"><Leaf size={14} /> Feito para aprender com mais clareza.</p></div>
    <div className="auth-right"><div className="auth-mobile-brand"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link></div><Link href="/" className="auth-back"><ArrowLeft size={16} />Voltar ao início</Link><div className="auth-card"><span className="auth-overline">{mode === "register" ? "CRIAR CONTA" : mode === "login" ? "ENTRAR" : "ACESSO À CONTA"}</span><h2>{title}</h2><p className="auth-intro">{mode === "login" ? "Entre para continuar de onde parou." : mode === "register" ? "Um espaço pessoal para organizar suas aulas ou seus estudos." : "As instruções de recuperação serão enviadas de forma segura."}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <div className="field"><label htmlFor="name">Como podemos chamar você?</label><div className="input-wrap"><User size={16} aria-hidden /><input className="input" id="name" name="name" autoComplete="name" required placeholder="Seu nome" aria-invalid={invalid || undefined} /></div></div>}
        {mode !== "recovery" || !isReset ? <div className="field"><label htmlFor="email">E-mail</label><div className="input-wrap"><Mail size={16} aria-hidden /><input className="input" id="email" type="email" name="email" autoComplete="email" required placeholder="voce@email.com" aria-invalid={invalid || undefined} /></div></div> : null}
        {(mode === "login" || mode === "register" || isReset) && <div className="field"><div className="field-row"><label htmlFor="password">{isReset ? "Nova senha" : "Senha"}</label>{mode === "login" && <Link href="/recuperar-senha" className="field-link">Esqueci minha senha</Link>}</div><div className="input-wrap"><Lock size={16} aria-hidden /><input className="input has-action" id="password" type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required placeholder={needsLength ? "Mínimo de 12 caracteres" : "Informe sua senha"} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={passwordInvalid || undefined} aria-describedby={needsLength ? "password-help" : undefined} /><button type="button" className="input-action" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>{needsLength && <div className="password-meter" id="password-help"><span className="password-meter-bar"><i style={{ width: `${(rules.filter((rule) => rule.ok).length / rules.length) * 100}%` }} data-done={passwordValid || undefined} /></span><ul className="password-rules">{rules.map((rule) => <li key={rule.label} className={rule.ok ? "ok" : undefined}>{rule.ok ? <Check size={12} aria-hidden /> : <span className="rule-dot" aria-hidden />}{rule.label}<span className="sr-only">{rule.ok ? " (atendido)" : " (pendente)"}</span></li>)}</ul></div>}</div>}
        {mode === "register" && <fieldset className="persona-choice"><legend>Como você vai usar o Facilita Estudo?</legend><label className={persona === "TEACHER" ? "persona-option selected" : "persona-option"}><input type="radio" name="persona-choice" value="TEACHER" checked={persona === "TEACHER"} onChange={() => setPersona("TEACHER")} /><span className="persona-icon"><GraduationCap size={18} /></span><span className="persona-text"><strong>Como docente</strong><small>Organizar aulas e materiais</small></span><span className="persona-check" aria-hidden><Check size={12} /></span></label><label className={persona === "STUDENT" ? "persona-option selected" : "persona-option"}><input type="radio" name="persona-choice" value="STUDENT" checked={persona === "STUDENT"} onChange={() => setPersona("STUDENT")} /><span className="persona-icon"><BookOpen size={18} /></span><span className="persona-text"><strong>Como estudante</strong><small>Estudar e acompanhar conteúdos</small></span><span className="persona-check" aria-hidden><Check size={12} /></span></label></fieldset>}
        {error && <div className="form-alert" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}{notice && <div className="form-success" role="status"><CheckCircle2 size={16} /><span>{notice}</span></div>}
        <button type="submit" className="button button-primary button-block button-large" disabled={busy}>{busy ? <><Loader2 size={16} className="spin" />Aguarde…</> : <>{mode === "login" ? "Entrar na minha conta" : mode === "register" ? "Criar meu espaço" : isReset ? "Atualizar senha" : "Enviar instruções"}<ArrowRight size={16} /></>}</button>
      </form>
      {mode === "recovery" && isReset && notice && <Link href="/entrar" className="auth-subtle-link">Voltar para entrar</Link>}
      <p className="auth-switch">{mode === "login" ? <>Ainda não tem uma conta? <Link href="/cadastro">Criar conta</Link></> : mode === "register" ? <>Já tem uma conta? <Link href="/entrar">Entrar</Link></> : <>Lembrou sua senha? <Link href="/entrar">Entrar</Link></>}</p>
    </div></div>
  </main>;
}
