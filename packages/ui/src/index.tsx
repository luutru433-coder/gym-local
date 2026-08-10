import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
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

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type="button" className={cx("chip", active && "chip--active", className)} {...props} />;
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

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
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

export function Modal({ open, title, onClose, children, className }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cx("modal", className)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
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
