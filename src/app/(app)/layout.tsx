import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/BottomNav";
import { PullToRefresh } from "@/components/ui/PullToRefresh";
import { ToastProvider } from "@/components/ui/Toast";
import { SetLogQueueProvider } from "@/components/logging/SetLogQueueProvider";
import { SetLogQueueStatus } from "@/components/logging/SetLogQueueStatus";
import { WhatsNewGate } from "@/components/releases/WhatsNewGate";
import { getRequestAuth } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await getRequestAuth();
  if (!user) redirect("/sign-in");

  return (
    <ToastProvider>
      {/* N68: the set-logging queue outlives any one page — mounted here so a
          queued set keeps draining while the lifter navigates away, and
          survives a relaunch */}
      <SetLogQueueProvider>
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          {/* N6: the installed PWA has no native pull-to-refresh; the document is
              the scroll container, so one wrapper covers every (app) page */}
          <main className="flex-1 px-4 pb-24 pt-6">
            <PullToRefresh>{children}</PullToRefresh>
          </main>
          <SetLogQueueStatus />
          <BottomNav />
          {/* doc 23 §6.3 — resolved server-side, inside the queue provider so
              the sheet can see whether a set is still draining (§6.4) */}
          <WhatsNewGate supabase={supabase} userId={user.id} />
        </div>
      </SetLogQueueProvider>
    </ToastProvider>
  );
}
