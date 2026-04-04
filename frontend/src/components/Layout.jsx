import Navbar from './Navbar';

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Navbar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
