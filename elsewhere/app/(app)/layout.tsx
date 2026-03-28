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
      <div className="block min-[1025px]:hidden">
        <RouteTopNav />
      </div>
      <main
        className="flex min-h-0 flex-1 flex-col md:flex-row md:max-h-[calc(100dvh-88px)]"
        suppressHydrationWarning
      >
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}
