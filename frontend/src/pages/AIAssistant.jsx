import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Low stock report',
    prompt: 'Which products are below their reorder level? Give me a full report.',
  },
  {
    label: 'Draft POs',
    prompt: 'Show me all draft purchase orders and their totals.',
  },
  {
    label: 'Vendor overview',
    prompt: 'Summarise all vendors — who supplies what and what are their payment terms?',
  },
  {
    label: 'Inventory health',
    prompt:
      'Give me an overall inventory health check — stock levels, alerts, and any anomalies.',
  },
  {
    label: 'Top stock movers',
    prompt:
      'Show me the most recent stock transactions. What are the highest-volume movements?',
  },
  {
    label: 'Suggest reorders',
    prompt:
      'Which products need restocking? Suggest reorder quantities based on their reorder_quantity settings.',
  },
];

const INSIGHT_STYLES = {
  critical: {
    bg: 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-900/50',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/50',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
  info: {
    bg: 'bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-900/50',
    text: 'text-sky-700 dark:text-sky-400',
    dot: 'bg-sky-400',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400',
  },
};

function formatResponse(text) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={j} className="font-semibold text-slate-900 dark:text-white">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          ),
        )}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InsightBanner({ insight, onPrompt }) {
  const s = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.info;
  return (
    <button
      onClick={() => onPrompt(insight.prompt)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left w-full transition-all hover:shadow-sm active:scale-[0.99] ${s.bg}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className={`text-sm font-medium flex-1 ${s.text}`}>{insight.title}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${s.badge}`}>
        Ask →
      </span>
    </button>
  );
}

function ChatBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold mt-0.5
        ${isUser
          ? 'bg-sky-600 text-white'
          : 'bg-slate-800 text-white dark:bg-slate-600'
        }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-sky-600 text-white rounded-tr-sm'
            : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
          }`}
        >
          {isUser ? message.content : formatResponse(message.content)}
        </div>

        {/* Actions taken badges */}
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.actions.map((a, i) => (
              <span
                key={i}
                className="text-[11px] text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-500"
              >
                ⚡ {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-600 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white">
        AI
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm dark:bg-slate-800 dark:border-slate-700">
        <div className="flex gap-1 items-center h-5">
          <span
            className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hi! I'm your inventory assistant. I have live access to your stock levels, vendors, and purchase orders.\n\nAsk me anything — or pick a quick action below to get started.",
      actions: [],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Load proactive insights on mount
  useEffect(() => {
    axios
      .get('/api/ai/insights')
      .then((res) => setInsights(res.data.data || []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const history = newMessages
      .slice(1)
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await axios.post('/api/ai/chat', { message: trimmed, history });
      const { response, actions_taken } = res.data.data;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response, actions: actions_taken || [] },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't reach the backend. Please check that the API is running.",
          actions: [],
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">AI</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Inventory Assistant
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Powered by Claude · Live database access
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Connected</span>
        </div>
      </div>

      {/* ── Body: sidebar + chat ── */}
      <div className="flex flex-1 min-h-0 gap-6 overflow-hidden">
        {/* ── Left panel ── */}
        <aside className="w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Live Alerts */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Live Alerts
            </p>
            {insightsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : insights.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">
                ✓ No active alerts — inventory looks healthy.
              </p>
            ) : (
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <InsightBanner key={i} insight={ins} onPrompt={sendMessage} />
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-4 flex-1">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Quick Actions
            </p>
            <div className="space-y-1">
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(qa.prompt)}
                  disabled={loading}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm p-4">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              This assistant queries your live PostgreSQL database. It can read stock levels,
              create draft POs, and analyse patterns in real time.
            </p>
          </div>
        </aside>

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 rounded-2xl bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-slate-200 dark:border-slate-700 p-4">
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about stock levels, vendors, purchase orders…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all min-h-[44px] max-h-32 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ lineHeight: '1.5' }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-11 h-11 bg-sky-700 hover:bg-sky-800 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
              >
                {loading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 text-center">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
