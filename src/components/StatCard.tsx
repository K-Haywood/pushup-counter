import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: 'lime' | 'slate' | 'amber';
  helper?: string;
}

export function StatCard({ label, value, accent = 'slate', helper }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${accent}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
      {helper ? <p className="stat-card__helper">{helper}</p> : null}
    </article>
  );
}
