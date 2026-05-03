import Sidebar from '@/components/layout/Sidebar';
import Header  from '@/components/layout/Header';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-mim-bg">
      <Sidebar />
      <Header />
      <main className="ml-56 mt-14 p-6 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  );
}
