"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { SessionView } from "./types";

let pending: Promise<SessionView | null> | null = null;

/** Shares one session lookup between components mounted together; a later mount checks again. */
function loadViewer() {
  if (!pending) {
    pending = api<SessionView>("/auth/session").catch(() => null);
    void pending.finally(() => setTimeout(() => { pending = null; }, 0));
  }
  return pending;
}

/** `undefined` while checking, `null` for visitors, the session when signed in. */
export function useViewer() {
  const [viewer, setViewer] = useState<SessionView | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void loadViewer().then((next) => { if (active) setViewer(next); });
    return () => { active = false; };
  }, []);
  return viewer;
}
