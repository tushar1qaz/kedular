import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/shared/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden md:ml-64">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 h-14 flex items-center px-6 shrink-0">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 text-sm font-medium">
              {session.user.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
