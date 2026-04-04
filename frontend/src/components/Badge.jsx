const colorMap = {
  yellow: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-rose-100 text-rose-800',
  gray: 'bg-slate-100 text-slate-700',
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
