import { Header } from "@/components/layout/Header";
import { RouteTopNav } from "@/components/layout/RouteTopNav";
import { BottomTabs } from "@/components/layout/BottomTabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      suppressHydrationWarning
    >
      <div className="hidden min-[1025px]:block">
        <Header />
      </div>
      <div className="sticky top-0 z-40 block min-[1025px]:hidden">
        <RouteTopNav />
      </div>
      <main
        className="flex min-h-0 flex-1 flex-col md:flex-row min-[1025px]:max-h-[calc(100dvh-72px)]"
        suppressHydrationWarning
      >
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}
