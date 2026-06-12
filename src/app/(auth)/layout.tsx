export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <h1 className="logotype border-b-[1.5px] border-ink pb-4 text-xl">
        workout
      </h1>
      {children}
    </main>
  );
}
