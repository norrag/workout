import Link from "next/link";
import { NewMacroForm } from "./NewMacroForm";

export default function NewMacroPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="border-b-[1.5px] border-ink pb-3">
        <Link
          href="/cycles"
          className="label-caps text-[10px] font-semibold text-ink/45"
        >
          ← CYCLES
        </Link>
        <h1 className="title-display mt-1 text-4xl">new macrocycle</h1>
      </header>
      <NewMacroForm />
    </div>
  );
}
