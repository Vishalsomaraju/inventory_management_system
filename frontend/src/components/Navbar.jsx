import { NavLink } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';


const navItems = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Inventory', to: '/inventory' },
  { label: 'Vendors', to: '/vendors' },
  { label: 'Purchase Orders', to: '/purchase-orders' },
  { label: 'Alerts', to: '/alerts' },
];


export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <aside className="flex w-72 flex-col bg-slate-800 text-white">
      <div className="border-b border-slate-700 px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Smart Inventory
        </p>
        <h1 className="mt-2 text-2xl font-bold">Procurement Hub</h1>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700/70'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-700 px-6 py-5">
        <p className="text-sm font-semibold">{user?.name || 'Unknown User'}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{user?.role || 'user'}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
