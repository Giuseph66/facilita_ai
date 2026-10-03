"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Initial session loading and workspace-role reconciliation are intentional. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, errorCopy, setCsrfToken } from "@/lib/api";
import { workspaceSupportsPersona, type Persona, type SessionView, type WorkspaceView } from "@/lib/types";

type SessionContextValue = {
  session: SessionView | null;
  activeWorkspace: WorkspaceView | null;
  persona: Persona;
  loading: boolean;
  sessionError: string;
  setWorkspaceId: (id: string) => void;
  switchPersona: (next: Persona) => Promise<void>;
  refreshSession: () => Promise<SessionView | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState("");
  const [persona, setPersona] = useState<Persona>("STUDENT");
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const sessionRef = useRef<SessionView | null>(null);
  const workspaceIdRef = useRef("");

  const setWorkspaceId = useCallback((id: string) => {
    workspaceIdRef.current = id;
    setWorkspaceIdState(id);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<SessionView>("/auth/session");
      sessionRef.current = next;
      setSession(next);
      setCsrfToken(next.csrfToken);
      setSessionError("");
      const defaultPersona = next.user.defaultPersona || "STUDENT";
      const currentWorkspace = next.workspaces.find((space) => space.id === workspaceIdRef.current);
      const preferredWorkspace = next.workspaces.find((space) => workspaceSupportsPersona(space, defaultPersona));
      const selectedWorkspace = currentWorkspace && workspaceSupportsPersona(currentWorkspace, defaultPersona)
        ? currentWorkspace
        : preferredWorkspace || next.workspaces[0];
      const selectedPersona = selectedWorkspace && workspaceSupportsPersona(selectedWorkspace, defaultPersona)
        ? defaultPersona
        : selectedWorkspace && workspaceSupportsPersona(selectedWorkspace, "TEACHER") ? "TEACHER" : "STUDENT";
      setWorkspaceId(selectedWorkspace?.id || "");
      setPersona(selectedPersona);
      return next;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        sessionRef.current = null;
        setSession(null);
        setSessionError("");
        setCsrfToken(null);
        return null;
      }
      setSessionError(errorCopy(caught));
      return sessionRef.current;
    } finally {
      setLoading(false);
    }
  }, [setWorkspaceId]);

  useEffect(() => {
    void refreshSession();
    const refresh = () => void refreshSession();
    window.addEventListener("session:refresh", refresh);
    return () => window.removeEventListener("session:refresh", refresh);
  }, [refreshSession]);

  useEffect(() => {
    const currentWorkspace = session?.workspaces.find((space) => space.id === workspaceId);
    if (!currentWorkspace || workspaceSupportsPersona(currentWorkspace, persona)) return;
    const fallback = workspaceSupportsPersona(currentWorkspace, "TEACHER") ? "TEACHER" : "STUDENT";
    setPersona(fallback);
  }, [persona, session, workspaceId]);

  const switchPersona = useCallback(async (next: Persona) => {
    if (next === persona) return;
    await api("/me/personas", { method: "POST", body: JSON.stringify({ persona: next }) });
    await api("/me/profile", { method: "PATCH", body: JSON.stringify({ defaultPersona: next }) });
    const refreshed = await api<SessionView>("/auth/session");
    sessionRef.current = refreshed;
    setSession(refreshed);
    setCsrfToken(refreshed.csrfToken);
    setSessionError("");
    const selectedWorkspace = refreshed.workspaces.find((space) => space.id === workspaceIdRef.current && workspaceSupportsPersona(space, next))
      || refreshed.workspaces.find((space) => workspaceSupportsPersona(space, next))
      || refreshed.workspaces.find((space) => space.type === "PERSONAL");
    if (!selectedWorkspace || !workspaceSupportsPersona(selectedWorkspace, next)) {
      throw new Error("Seu espaço ainda não tem acesso a esta experiência. Atualize o perfil e tente novamente.");
    }
    setWorkspaceId(selectedWorkspace.id);
    setPersona(next);
  }, [persona, setWorkspaceId]);

  const activeWorkspace = session?.workspaces.find((workspace) => workspace.id === workspaceId) || null;
  const value = useMemo(() => ({ session, activeWorkspace, persona, loading, sessionError, setWorkspaceId, switchPersona, refreshSession }),
    [session, activeWorkspace, persona, loading, sessionError, setWorkspaceId, switchPersona, refreshSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession precisa estar dentro de SessionProvider");
  return context;
}
