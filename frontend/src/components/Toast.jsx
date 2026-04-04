export default function Toast({ show, type = 'success', message, onClose }) {
  if (!show || !message) {
    return null;
  }

  const tone =
    type === 'error'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400';

  return (
    <div className="fixed right-6 top-6 z-50">
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${tone}`}>
        <span className="text-sm font-medium">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}
