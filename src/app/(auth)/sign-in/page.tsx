"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthFormState } from "../actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: AuthFormState = { error: null };

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
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-text-secondary">
        No account?{" "}
        <Link href="/sign-up" className="text-text-primary underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
