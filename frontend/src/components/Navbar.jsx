import { NavLink } from 'react-router-dom';
import {
  MdDashboard,
  MdInventory,
  MdStorefront,
  MdShoppingCart,
  MdNotifications,
  MdLightMode,
  MdDarkMode,
  MdLogout,
} from 'react-icons/md';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: MdDashboard },
  { label: 'Inventory', to: '/inventory', icon: MdInventory },
  { label: 'Vendors', to: '/vendors', icon: MdStorefront },
  { label: 'Purchase Orders', to: '/purchase-orders', icon: MdShoppingCart },
  { label: 'Alerts', to: '/alerts', icon: MdNotifications },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <aside className="flex w-72 flex-col bg-slate-800 text-white dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-700 px-6 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Smart Inventory
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-50">Procurement Hub</h1>
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
        >
          {isDarkMode ? <MdLightMode size={20} /> : <MdDarkMode size={20} />}
        </button>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                isActive ? 'bg-slate-700 text-white dark:bg-slate-800' : 'text-slate-300 hover:bg-slate-700/70 dark:hover:bg-slate-800/70'
              }`
            }
          >
            <item.icon size={20} />
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
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:border-slate-800 dark:hover:bg-slate-800"
        >
          <MdLogout size={18} />
          Logout
        </button>
      </div>
    </aside>
  );
}
