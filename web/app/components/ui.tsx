'use client';

import { ReactNode, createContext, useContext, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';

/* ---- Card ---- */

export function Card({ children, className = '', padding = 'p-4' }: { children: ReactNode; className?: string; padding?: string }) {
  return (
    <div className={`rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] ${padding} ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action, icon }: { title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}

/* ---- StatCard ---- */

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'primary' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
}) {
  const colorClass =
    accent === 'primary' ? 'text-[var(--bg-primary)]'
    : accent === 'success' ? 'text-[var(--bg-success)]'
    : accent === 'danger' ? 'text-[var(--bg-primary)]'
    : accent === 'warning' ? 'text-[#c4622d]'
    : '';
  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        {icon && <span className="text-[var(--text-faint)]">{icon}</span>}
      </div>
      <p className={`text-lg font-bold sm:text-xl ${colorClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ---- Button ---- */

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'outline' | 'ghost' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--bg-primary)] text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]',
  secondary: 'bg-[var(--bg-secondary)] text-[var(--text-on-primary)] hover:bg-[var(--bg-secondary-hover)]',
  success: 'bg-[var(--bg-success)] text-[var(--text-on-success)] hover:bg-[var(--bg-success-hover)]',
  outline: 'border border-[var(--border-input)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]',
  danger: 'bg-[var(--bg-primary)] text-[var(--text-on-primary)] hover:bg-[var(--bg-primary-hover)]',
};

export function Button({
  children,
  variant = 'outline',
  size = 'md',
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClass = size === 'sm' ? 'min-h-10 px-2.5 py-1 text-xs' : size === 'lg' ? 'min-h-12 px-5 py-2.5 text-sm' : 'min-h-11 px-3 py-2 text-sm';
  return (
    <button
      className={`rounded-lg font-medium transition-colors ${buttonStyles[variant]} ${sizeClass} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---- EmptyState ---- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-3 text-4xl opacity-40">{icon}</div>}
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {description && <p className="mt-1 text-xs text-[var(--text-faint)] max-w-xs">{description}</p>}
      {action && (
        action.href ? (
          <Link href={action.href} className="mt-4">
            <Button variant="primary" size="sm">{action.label}</Button>
          </Link>
        ) : (
          <Button variant="primary" size="sm" className="mt-4" onClick={action.onClick}>{action.label}</Button>
        )
      )}
    </div>
  );
}

/* ---- Skeleton ---- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--bg-card-hover)] ${className}`} />;
}

export function StatSkeleton() {
  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] px-3 py-2.5">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-6 w-28" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-card)] divide-y divide-[var(--border-light)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-48" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ---- Toast ---- */

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const ToastContext = createContext<{ show: (msg: string, type?: Toast['type']) => void }>({
  show: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-[min(20rem,90vw)] break-words rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 ${
              t.type === 'success' ? 'bg-[var(--bg-success)] text-white'
              : t.type === 'error' ? 'bg-[var(--bg-primary)] text-white'
              : 'bg-[var(--bg-secondary)] text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---- PageHeader ---- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-faint)] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ---- Badge ---- */

export function Badge({ children, color = 'neutral' }: { children: ReactNode; color?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const colorClass =
    color === 'success' ? 'bg-[var(--bg-success)] text-white'
    : color === 'warning' ? 'bg-[var(--bg-warning)] text-[var(--text-primary)]'
    : color === 'danger' ? 'bg-[var(--bg-primary)] text-white'
    : 'bg-[var(--bg-card-hover)] text-[var(--text-muted)]';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}>
      {children}
    </span>
  );
}
