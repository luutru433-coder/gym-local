import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
};

export function Button({ className, variant = "primary", size = "md", full, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx("button", `button--${variant}`, `button--${size}`, full && "button--full", className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...props} />;
}

export function Chip({ active, className, "aria-pressed": ariaPressed, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" className={cx("chip", active && "chip--active", className)} aria-pressed={ariaPressed ?? (active === undefined ? undefined : active)} {...props} />;
}

export function ToggleGroup({ className, label, "aria-label": ariaLabel, ...props }: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return <div role="group" className={cx("toggle-group", className)} aria-label={ariaLabel ?? label} {...props} />;
}

export function ToggleGroupItem({ pressed, className, "aria-pressed": ariaPressed, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return <button type="button" className={cx("toggle-group__item", pressed && "toggle-group__item--active", className)} aria-pressed={ariaPressed ?? pressed} data-state={pressed ? "on" : "off"} {...props} />;
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, label, valueText }: { value: number; label?: string; valueText?: string }) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const percentText = `${Math.round(safe)}%`;
  return (
    <div className="progress-track" role="progressbar" aria-label={label ?? percentText} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe} aria-valuetext={valueText ?? percentText}>
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}

export function MetricRing({ value, max, label, unit, tone = "lime" }: { value: number; max: number; label: string; unit: string; tone?: "lime" | "coral" | "sky" | "gold" }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx("metric-ring", `metric-ring--${tone}`)} style={{ "--ring-progress": `${percent * 3.6}deg` } as React.CSSProperties}>
      <div className="metric-ring__inner">
        <strong>{Math.round(value)}</strong>
        <span>{unit}</span>
      </div>
      <small>{label}</small>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" | "success" }) {
  return <div className={cx("notice", `notice--${tone}`)}>{children}</div>;
}

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function Modal({ open, title, onClose, children, className, closeLabel, initialFocusRef }: ModalProps) {
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusRefRef.current = initialFocusRef;
  }, [initialFocusRef, onClose]);

  useEffect(() => {
    if (!open) return;

    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const backgroundState = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert")
      }));

    document.body.style.overflow = "hidden";
    for (const { element } of backgroundState) {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    }

    const initialTarget = initialFocusRefRef.current?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialTarget.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements(dialog);
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      for (const { element, ariaHidden, inert } of backgroundState) {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        if (!inert) element.removeAttribute("inert");
      }
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const resolvedCloseLabel = closeLabel ?? (document.documentElement.lang.toLowerCase().startsWith("vi") ? "Đóng" : "Close");
  return createPortal(
    <div ref={backdropRef} className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={cx("modal", className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={resolvedCloseLabel}><X size={20} /></button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>,
    document.body
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
