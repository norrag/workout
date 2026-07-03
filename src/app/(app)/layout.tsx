import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/BottomNav";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { ToastProvider } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        {/* N6: the installed PWA has no native pull-to-refresh; the document is
            the scroll container, so one wrapper covers every (app) page */}
        <main className="flex-1 px-4 pb-24 pt-6">
          <PullToRefresh>{children}</PullToRefresh>
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
