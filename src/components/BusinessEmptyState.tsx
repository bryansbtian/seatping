import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BusinessEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
  testId?: string;
  children?: ReactNode;
};

const BusinessEmptyState = ({
  icon: Icon,
  title,
  body,
  className,
  testId,
  children,
}: BusinessEmptyStateProps) => {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
      data-testid={testId}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
};

export default BusinessEmptyState;
