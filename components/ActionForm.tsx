"use client";

import { useFormState } from "react-dom";
import type { ActionResult } from "@/lib/action-result";
import { errorText, type Dict } from "@/lib/i18n";

/**
 * A <form> for a server action that returns { ok, code } (lib/action-result).
 * Shows the translated error next to the form when the action fails, so a
 * failure is never silent.
 */
export function ActionForm({
  action,
  m,
  className,
  id,
  errorClassName = "mt-1 block text-xs text-accent",
  children,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  m: Dict;
  className?: string;
  id?: string;
  errorClassName?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, null);
  return (
    <>
      <form id={id} action={formAction} className={className}>
        {children}
      </form>
      {state && !state.ok && (
        <span role="alert" className={errorClassName}>
          {errorText(m, state.code)}
        </span>
      )}
    </>
  );
}
