import { Header } from '@/components/layout/Header';
import { TopNav } from '@/components/layout/TopNav';
import { BottomTabs } from '@/components/layout/BottomTabs';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="hidden md:block">
        <Header />
      </div>
      <div className="block md:hidden">
        <TopNav />
      </div>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row md:max-h-[calc(100vh-88px)]">
        {children}
      </main>
      <div className="block md:hidden">
        <BottomTabs />
      </div>
    </div>
  );
}
