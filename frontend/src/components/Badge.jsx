const colorMap = {
  yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  red: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};


export default function Badge({ color = 'gray', children }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
        colorMap[color] || colorMap.gray
      }`}
    >
      {children}
    </span>
  );
}
