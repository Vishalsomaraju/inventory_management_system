import { useEffect, useMemo, useRef, useState } from 'react';
import { MdTrendingDown, MdTrendingFlat, MdTrendingUp } from 'react-icons/md';


const accentClasses = {
  blue: 'border-sky-500 bg-sky-50/70 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  orange: 'border-amber-500 bg-amber-50/70 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  green: 'border-emerald-500 bg-emerald-50/70 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  red: 'border-rose-500 bg-rose-50/70 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  teal: 'border-teal-500 bg-teal-50/70 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
};

const trendConfig = {
  up: { Icon: MdTrendingUp, className: 'text-emerald-600 dark:text-emerald-400' },
  down: { Icon: MdTrendingDown, className: 'text-rose-600 dark:text-rose-400' },
  flat: { Icon: MdTrendingFlat, className: 'text-slate-500 dark:text-slate-400' },
};


function resolveValueMeta(value) {
  // Plain integer / float — round intermediate animation frames to whole numbers
  if (typeof value === 'number') {
    return {
      numericTarget: value,
      formatter: (v) => Math.round(v).toLocaleString(),
    };
  }

  // Object with custom formatter: { number: 12345, formatter: formatCurrency }
  if (
    value &&
    typeof value === 'object' &&
    typeof value.number === 'number' &&
    typeof value.formatter === 'function'
  ) {
    return {
      numericTarget: value.number,
      formatter: value.formatter,
    };
  }

  // Fallback — render as-is (string, null, etc.)
  return {
    numericTarget: null,
    formatter: () => value,
  };
}


function AnimatedValue({ value }) {
  // Memoize so the `formatter` reference is stable across parent re-renders.
  // Without this, every parent render creates a new function → useEffect fires
  // again mid-animation → raw float intermediate values appear in the DOM.
  const memoKey = typeof value === 'object' ? JSON.stringify(value) : value;
  const { numericTarget, formatter } = useMemo(
    () => resolveValueMeta(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memoKey],
  );

  const [displayValue, setDisplayValue] = useState(
    numericTarget === null ? value : formatter(numericTarget),
  );
  const previousTargetRef = useRef(0);

  useEffect(() => {
    if (numericTarget === null) {
      setDisplayValue(value);
      return undefined;
    }

    const startValue = previousTargetRef.current;
    const delta = numericTarget - startValue;
    const duration = 700;
    const steps = 24;
    const stepDuration = Math.max(16, Math.floor(duration / steps));
    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;
      const progress = step / steps;
      const easedProgress = 1 - (1 - progress) * (1 - progress);
      const nextValue = startValue + delta * easedProgress;

      if (step >= steps) {
        window.clearInterval(timer);
        previousTargetRef.current = numericTarget;
        setDisplayValue(formatter(numericTarget));
        return;
      }

      setDisplayValue(formatter(nextValue));
    }, stepDuration);

    return () => window.clearInterval(timer);
  }, [formatter, numericTarget, value]);

  return (
    <span className="block transform-gpu transition-all duration-500 ease-out">
      {displayValue}
    </span>
  );
}


export default function StatCard({ title, value, subtitle, color = 'blue', icon: Icon, trend }) {
  const accentClass = accentClasses[color] ?? accentClasses.blue;
  const trendMeta = trend ? trendConfig[trend] ?? trendConfig.flat : null;

  return (
    <article className={`rounded-2xl border-l-4 bg-white p-5 shadow-sm transition-transform duration-300 hover:-translate-y-0.5 dark:bg-slate-800 ${accentClass.split(' ')[0]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AnimatedValue value={value} />
            </p>
            {trendMeta ? (
              <trendMeta.Icon className={`text-xl ${trendMeta.className}`} />
            ) : null}
          </div>
          {subtitle ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accentClass}`}>
            <Icon className="text-xl" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
