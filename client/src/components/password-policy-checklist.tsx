import { Check, Circle } from "lucide-react";
import { getPasswordPolicyChecks } from "@shared/schema";
import { cn } from "@/lib/utils";

type PasswordPolicyChecklistProps = {
  password: string;
  className?: string;
};

export function PasswordPolicyChecklist({ password, className }: PasswordPolicyChecklistProps) {
  const checks = getPasswordPolicyChecks(password);
  const hasInput = password.length > 0;

  return (
    <ul className={cn("space-y-1 text-xs", className)} aria-live="polite">
      {checks.map((check) => (
        <li
          key={check.id}
          className={cn(
            "flex items-center gap-1.5",
            !hasInput && "text-muted-foreground",
            hasInput && check.passed && "text-emerald-600 dark:text-emerald-500",
            hasInput && !check.passed && "text-muted-foreground",
          )}
        >
          {hasInput && check.passed ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <Circle
              className={cn("h-3 w-3 shrink-0", !hasInput && "opacity-50")}
              aria-hidden
            />
          )}
          <span>{check.label}</span>
        </li>
      ))}
    </ul>
  );
}
