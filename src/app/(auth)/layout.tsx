export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <h1 className="label-caps text-center text-2xl font-bold tracking-[0.08em]">
        WORK<span className="text-accent">OUT</span>
      </h1>
      {children}
    </main>
  );
}
