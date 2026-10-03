"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The reset token is read from the browser URL after hydration. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, GraduationCap, Leaf } from "lucide-react";
import { api, errorCopy, setCsrfToken } from "@/lib/api";
import type { SessionView } from "@/lib/types";

type Mode = "login" | "register" | "recovery";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [persona, setPersona] = useState("TEACHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => { setResetToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
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
    } catch (caught) { setError(errorCopy(caught)); }
    finally { setBusy(false); }
  };

  const title = mode === "login" ? "Que bom ter você de volta." : mode === "register" ? "Seu espaço começa aqui." : resetToken ? "Escolha uma nova senha." : "Vamos recuperar seu acesso.";
  const isReset = mode === "recovery" && Boolean(resetToken);

  return <main className="auth-page">
    <div className="auth-left"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link><div className="auth-art"><span className="auth-leaf">✳</span><p className="eyebrow">Um espaço para respirar</p><h1>O próximo passo<br /><em>já está ao seu alcance.</em></h1><p>Materiais, boas perguntas e um caminho possível para seguir aprendendo.</p><div className="auth-art-line" /></div><p className="auth-footnote"><Leaf size={14} /> Feito para aprender com mais clareza.</p></div>
    <div className="auth-right"><Link href="/" className="auth-back"><ArrowLeft size={16} />Voltar ao início</Link><div className="auth-card"><span className="auth-overline">{mode === "register" ? "CRIAR CONTA" : mode === "login" ? "ENTRAR" : "ACESSO À CONTA"}</span><h2>{title}</h2><p className="auth-intro">{mode === "login" ? "Entre para continuar de onde parou." : mode === "register" ? "Um espaço pessoal para organizar suas aulas ou seus estudos." : "As instruções de recuperação serão enviadas de forma segura."}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <div className="field"><label htmlFor="name">Como podemos chamar você?</label><input className="input" id="name" name="name" autoComplete="name" required placeholder="Seu nome" /></div>}
        {mode !== "recovery" || !isReset ? <div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" type="email" name="email" autoComplete="email" required placeholder="voce@email.com" /></div> : null}
        {(mode === "login" || mode === "register" || isReset) && <div className="field"><label htmlFor="password">{isReset ? "Nova senha" : "Senha"}</label><input className="input" id="password" type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 12} placeholder="Informe sua senha" />{(mode === "register" || isReset) && <span className="field-help">Use pelo menos 12 caracteres.</span>}</div>}
        {mode === "register" && <fieldset className="persona-choice"><legend>Como você vai usar o Facilita Estudo?</legend><label className={persona === "TEACHER" ? "persona-option selected" : "persona-option"}><input type="radio" name="persona-choice" value="TEACHER" checked={persona === "TEACHER"} onChange={() => setPersona("TEACHER")} /><GraduationCap size={18} /><span><strong>Como professora</strong><small>Organizar aulas e materiais</small></span></label><label className={persona === "STUDENT" ? "persona-option selected" : "persona-option"}><input type="radio" name="persona-choice" value="STUDENT" checked={persona === "STUDENT"} onChange={() => setPersona("STUDENT")} /><BookOpen size={18} /><span><strong>Como aluna</strong><small>Estudar e acompanhar conteúdos</small></span></label></fieldset>}
        {error && <div className="form-alert" role="alert">{error}</div>}{notice && <div className="form-success" role="status">{notice}</div>}
        <button type="submit" className="button button-primary button-block button-large" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar na minha conta" : mode === "register" ? "Criar meu espaço" : isReset ? "Atualizar senha" : "Enviar instruções"}<ArrowRight size={16} /></button>
      </form>
      {mode === "login" && <Link href="/recuperar-senha" className="auth-subtle-link">Esqueci minha senha</Link>}
      {mode === "recovery" && isReset && notice && <Link href="/entrar" className="auth-subtle-link">Voltar para entrar</Link>}
      <p className="auth-switch">{mode === "login" ? <>Ainda não tem uma conta? <Link href="/cadastro">Criar conta</Link></> : mode === "register" ? <>Já tem uma conta? <Link href="/entrar">Entrar</Link></> : <>Lembrou sua senha? <Link href="/entrar">Entrar</Link></>}</p>
    </div><div className="auth-mobile-brand"><Link href="/" className="brand-lockup"><span className="brand-symbol">f</span><span>facilita<span className="brand-light"> estudo</span></span></Link></div></div>
  </main>;
}
