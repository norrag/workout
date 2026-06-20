"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

/**
 * Type-to-confirm gate for irreversible account deletion. The button stays
 * disabled until the user types DELETE, then runs the server action.
 */
export function DeleteAccountForm() {
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const armed = confirm.trim().toUpperCase() === "DELETE";

  return (
    <form
      action={() => startTransition(() => deleteAccount())}
      className="mt-6"
    >
      <label
        htmlFor="confirm"
        className="block text-[10px] font-bold tracking-[0.14em] text-ink/55"
      >
        TYPE DELETE TO CONFIRM
      </label>
      <input
        id="confirm"
        name="confirm"
        autoComplete="off"
        autoCapitalize="characters"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="mt-2 w-full border-[1.5px] border-ink bg-transparent px-3 py-3 text-sm font-semibold tracking-[0.08em] outline-none"
      />
      <button
        type="submit"
        disabled={!armed || pending}
        className="mt-4 w-full border-[1.5px] border-accent py-3 text-center text-xs font-bold tracking-[0.12em] text-accent disabled:border-ink/25 disabled:text-ink/30"
      >
        {pending ? "DELETING…" : "DELETE MY ACCOUNT"}
      </button>
    </form>
  );
}
