import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props}/>;
}
export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) { return <section className={`card ${className}`} {...props}/>; }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action}</header>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Card className="empty-state"><div className="empty-star">✧</div><h2>{title}</h2><p className="muted">{description}</p>{action}</Card>;
}
export function ErrorNotice({ message }: { message: string }) { return message ? <div className="error-notice" role="alert">{message}</div> : null; }
export function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
