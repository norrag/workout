"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AuthFormState = { error: null };

/** Carries an optional `?redirect=` (e.g. the OAuth consent return path). */
function RedirectField() {
  const redirectTo = useSearchParams().get("redirect") ?? "";
  return redirectTo ? (
    <input type="hidden" name="redirect" value={redirectTo} />
  ) : null;
}

export default function SignInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {/* Deliberately NOT the form's first child: React injects its own hidden
          action field there during SSR, and a Suspense boundary in that slot
          hydrates as a different node — a mismatch that made React discard and
          re-render the whole form (and report a client error) on every visit. */}
      <Suspense fallback={null}>
        <RedirectField />
      </Suspense>
      {state.error && <p className="text-sm text-accent">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        No account?{" "}
        <Link href="/sign-up" className="text-ink underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
