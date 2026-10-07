"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { StatusMessage } from "@/components/StatusMessage";
import {
  EMPTY_AUTH_STATE,
  type AuthFormState,
} from "@/lib/auth/form-state";

type AccountSaveAction = (
  previousState: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 w-full rounded-lg border border-line-20 px-4 py-2 text-sm font-medium hover:bg-fill-hover disabled:opacity-60"
    >
      {pending ? "Bağlantı gönderiliyor…" : "Doğrulama bağlantısı gönder"}
    </button>
  );
}

/**
 * Yeni kullanıcı oluşturmadan anonim kimliğe e-posta bağlayan form.
 * Şifre, e-posta doğrulanana kadar sorulmaz; bu Supabase'in güvenli yükseltme
 * sırasına uyar.
 */
export function AccountSaveForm({
  action,
  nextPath,
}: {
  action: AccountSaveAction;
  nextPath: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_AUTH_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />

      {state.error ? (
        <StatusMessage tone="error" title="İşlem tamamlanamadı">
          {state.error}
        </StatusMessage>
      ) : null}
      {state.notice ? <StatusMessage>{state.notice}</StatusMessage> : null}

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
          className="mt-1 min-h-11 w-full rounded-lg border border-line-20 bg-transparent px-3 py-2 text-base outline-none focus:border-line-focus"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
