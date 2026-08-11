"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { StatusMessage } from "@/components/StatusMessage";
import {
  EMPTY_AUTH_STATE,
  type AuthFormState,
} from "@/lib/auth/form-state";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/validation";

type AuthAction = (
  prev: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10"
    >
      {pending ? "Gönderiliyor…" : label}
    </button>
  );
}

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base outline-none focus:border-black/60 dark:border-white/25 dark:focus:border-white/70";

export function AuthForm({
  action,
  submitLabel,
  mode,
  nextPath,
}: {
  action: AuthAction;
  submitLabel: string;
  /** Hangi alanların gösterileceğini belirler. */
  mode: "signIn" | "signUp" | "requestReset" | "updatePassword";
  nextPath?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_AUTH_STATE);

  const showEmail = mode !== "updatePassword";
  const showPassword = mode !== "requestReset";
  const showDisplayName = mode === "signUp";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      {state.error ? (
        <StatusMessage tone="error" title="İşlem tamamlanamadı">
          {state.error}
        </StatusMessage>
      ) : null}

      {state.notice ? <StatusMessage>{state.notice}</StatusMessage> : null}

      {showDisplayName ? (
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">
            Görünen ad <span className="text-black/50 dark:text-white/50">(isteğe bağlı)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            maxLength={60}
            autoComplete="nickname"
            className={inputClass}
          />
        </div>
      ) : null}

      {showEmail ? (
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            E-posta
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>
      ) : null}

      {showPassword ? (
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {mode === "updatePassword" ? "Yeni şifre" : "Şifre"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete={
              mode === "signIn" ? "current-password" : "new-password"
            }
            className={inputClass}
          />
          {mode !== "signIn" ? (
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              En az {PASSWORD_MIN_LENGTH} karakter.
            </p>
          ) : null}
        </div>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
