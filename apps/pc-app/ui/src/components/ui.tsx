import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button as ShadcnButton } from './ui/button';
import { Card as ShadcnCard } from './ui/card';
import { Badge as ShadcnBadge } from './ui/badge';
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <ShadcnButton variant={variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant} className={`button button-${variant} shadow-none ${className}`} {...props}/>;
}
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) { return <ShadcnCard className={`card shadow-none ${className}`} {...props}/>; }
export function PageHeader({ eyebrow, title, description, action, back }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; back?: { label: string; onClick(): void } }) {
  return <header className="page-header"><div>{(eyebrow || back) && <p className="eyebrow page-breadcrumb">{back && <><Button variant="ghost" className="page-back" onClick={back.onClick}><ArrowLeft size={14}/>{back.label}</Button><span aria-hidden="true">/</span></>}{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action}</header>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Card className="empty-state"><div className="empty-star">✧</div><h2>{title}</h2><p className="muted">{description}</p>{action}</Card>;
}
export function ErrorNotice({ message }: { message: string }) { return message ? <div className="error-notice" role="alert">{message}</div> : null; }
export function Badge({ children }: { children: ReactNode }) { return <ShadcnBadge className="badge">{children}</ShadcnBadge>; }
