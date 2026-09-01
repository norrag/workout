"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AuthFormState = { error: null };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

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
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state.error && <p className="text-sm text-accent">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating account" : "Create account"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Have an account?{" "}
        <Link href="/sign-in" className="text-ink underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
