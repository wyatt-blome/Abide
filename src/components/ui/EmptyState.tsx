import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  title: string;
  /** Plain instruction text (UI copy only). */
  children?: ReactNode;
  icon?: IconName;
  /** Usually a <Button>. */
  action?: ReactNode;
}

export function EmptyState({ title, children, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {icon ? <Icon name={icon} size={40} className="text-muted" /> : null}
      <p className="text-[19px] font-bold">{title}</p>
      {children ? <div className="max-w-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
