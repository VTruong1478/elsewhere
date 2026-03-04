import { TopNav } from '@/components/layout/TopNav';
import { BottomTabs } from '@/components/layout/BottomTabs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        {children}
      </main>
      <div className="block md:hidden">
        <BottomTabs />
      </div>
    </div>
  );
}
