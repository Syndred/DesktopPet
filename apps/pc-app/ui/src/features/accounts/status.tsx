import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

export function AccountStatus({ icon: Icon, label, detail, tone = "muted", iconOnly = false }: {
  icon: LucideIcon; label: string; detail: string; tone?: "muted" | "success" | "warning"; iconOnly?: boolean;
}) {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <span tabIndex={0} className={`ac-status-badge ac-status-${tone}`} aria-label={label}>
      <Icon size={15} aria-hidden="true" />{!iconOnly && <span>{label}</span>}
    </span>
  </TooltipTrigger><TooltipContent className="ac-tooltip" side="top" sideOffset={6}>{detail}</TooltipContent></Tooltip></TooltipProvider>;
}
