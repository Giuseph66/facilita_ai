"use client";
/* eslint-disable react-hooks/set-state-in-effect -- The portal node is created after hydration so the server and client start with the same markup. */

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./ui";
import styles from "./modal.module.css";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
  busy?: boolean;
};

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
type ModalEntry = { dialog: HTMLElement; portal: HTMLElement; previousFocus: HTMLElement | null };
type BodyElementSnapshot = { element: HTMLElement; inert: boolean; ariaHidden: string | null; position: string; zIndex: string };
const modalStack: ModalEntry[] = [];
let bodySnapshot: { overflow: string; focus: HTMLElement | null; elements: BodyElementSnapshot[] } | null = null;

function getVisibleFocusableItems(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((item) => item.getClientRects().length > 0 && !item.closest("[inert]"));
}

function restoreAriaHidden(element: HTMLElement, value: string | null) {
  if (value === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", value);
}

function syncModalEnvironment() {
  const top = modalStack[modalStack.length - 1];
  if (!top) {
    if (!bodySnapshot) return;
    document.body.style.overflow = bodySnapshot.overflow;
    const saved = new Map(bodySnapshot.elements.map((entry) => [entry.element, entry]));
    Array.from(document.body.children).forEach((child) => {
      const element = child as HTMLElement;
      const previous = saved.get(element);
      if (previous) {
        element.inert = previous.inert;
        restoreAriaHidden(element, previous.ariaHidden);
        element.style.position = previous.position;
        element.style.zIndex = previous.zIndex;
      } else if (element.hasAttribute("data-modal-root")) {
        element.inert = false;
        element.removeAttribute("aria-hidden");
        element.style.position = "";
        element.style.zIndex = "";
      }
    });
    bodySnapshot = null;
    return;
  }

  if (!bodySnapshot) {
    bodySnapshot = {
      overflow: document.body.style.overflow,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      elements: Array.from(document.body.children).map((child) => {
        const element = child as HTMLElement;
        return { element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden"), position: element.style.position, zIndex: element.style.zIndex };
      }),
    };
  }
  document.body.style.overflow = "hidden";
  const saved = new Map(bodySnapshot.elements.map((entry) => [entry.element, entry]));
  Array.from(document.body.children).forEach((child) => {
    const element = child as HTMLElement;
    if (!saved.has(element)) {
      const original = { element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden"), position: element.style.position, zIndex: element.style.zIndex };
      bodySnapshot?.elements.push(original);
      saved.set(element, original);
    }
    if (element === top.portal) {
      const previous = saved.get(element);
      element.inert = previous?.inert ?? false;
      restoreAriaHidden(element, previous?.ariaHidden ?? null);
      element.style.position = "relative";
      element.style.zIndex = String(1000 + modalStack.length);
    } else {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
  });
}

export function Modal({ open, onClose, title, children, description, busy = false }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.modalRoot = "";
    document.body.appendChild(element);
    setPortal(element);
    return () => element.remove();
  }, []);

  useEffect(() => {
    if (!open || !portal) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const entry = { dialog, portal, previousFocus };
    modalStack.push(entry);
    syncModalEnvironment();
    const focusable = getVisibleFocusableItems(dialog)[0];
    (focusable || dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1]?.dialog !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) {
          closeRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = getVisibleFocusableItems(dialogRef.current);
      if (!items.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const stackIndex = modalStack.indexOf(entry);
      if (stackIndex < 0) return;
      const wasTop = stackIndex === modalStack.length - 1;
      if (!wasTop) {
        const fallbackFocus = entry.previousFocus?.isConnected ? entry.previousFocus : bodySnapshot?.focus || null;
        for (const childEntry of modalStack.slice(stackIndex + 1)) {
          if (childEntry.previousFocus && entry.portal.contains(childEntry.previousFocus)) childEntry.previousFocus = fallbackFocus;
        }
      }
      const fallbackFocus = bodySnapshot?.focus || null;
      modalStack.splice(stackIndex, 1);
      syncModalEnvironment();
      if (wasTop) {
        const nextTop = modalStack[modalStack.length - 1];
        const restoreTarget = nextTop ? (entry.previousFocus && nextTop.dialog.contains(entry.previousFocus) ? entry.previousFocus : nextTop.dialog) : entry.previousFocus?.isConnected ? entry.previousFocus : fallbackFocus;
        if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
      }
    };
  }, [open, portal]);

  if (!open || !portal) return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className={styles.close} type="button" onClick={onClose} disabled={busy} aria-label="Fechar janela">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>,
    portal,
  );
}

export type ConfirmModalProps = Omit<ModalProps, "children"> & {
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "default" | "danger";
};

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  children,
  busy = false,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  variant = "default",
}: ConfirmModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const isBusy = busy || confirming;
  const submit = async () => {
    if (isBusy) return;
    setConfirming(true); setSubmitError("");
    try { await onConfirm(); }
    catch { setSubmitError("Não foi possível concluir. Tente novamente."); }
    finally { setConfirming(false); }
  };

  return <Modal open={open} onClose={onClose} title={title} description={description} busy={isBusy}>
    {children}
    {submitError && <p role="alert">{submitError}</p>}
    <div className={styles.actions}>
      <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>{cancelLabel}</Button>
      <Button type="button" variant={variant === "danger" ? "danger" : "primary"} onClick={() => void submit()} disabled={isBusy}>
        {isBusy ? "Aguarde…" : confirmLabel}
      </Button>
    </div>
  </Modal>;
}
