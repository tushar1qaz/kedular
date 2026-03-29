'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

type LlmProvider = 'claude' | 'gemini' | 'openai';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cached?: boolean;
  dataType?: string;
  data?: unknown;
}

interface ChatPageClientProps {
  projectId: string;
  projectName: string;
  activeVersionId: string | null;
}

const SUGGESTED_PROMPTS = [
  "What's my critical path?",
  "How healthy is my schedule?",
  "Show me the next 2 weeks look-ahead",
  "What are my SPI and CPI?",
  "What happens if the concrete pour slips 2 weeks?",
  "Compare this version to the baseline",
];

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
};

const STORAGE_KEY = 'kedular_chat_provider';

function HealthCard({ data }: { data: unknown }) {
  const report = data as {
    overallScore: number;
    grade: string;
    metrics: { name: string; score: number; value: string | number; target: string }[];
  };
  if (!report) return null;
  const gradeColor =
    report.grade === 'A'
      ? 'text-green-600'
      : report.grade === 'B'
        ? 'text-blue-600'
        : report.grade === 'C'
          ? 'text-yellow-600'
          : 'text-red-600';

  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-2xl font-bold ${gradeColor}`}>{report.grade}</span>
        <span className="text-slate-600 text-sm">{report.overallScore}/100</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {report.metrics?.slice(0, 4).map((m) => (
          <div key={m.name} className="text-xs">
            <span className="text-slate-500">{m.name}: </span>
            <span className="font-medium text-slate-700">{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvMetricsCard({ data }: { data: unknown }) {
  const ev = data as {
    spi: number;
    cpi: number;
    bcws: number;
    bcwp: number;
    acwp: number;
    eac: number;
    etc: number;
  };
  if (!ev) return null;

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  const spiColor = ev.spi >= 1 ? 'text-green-600' : 'text-red-600';
  const cpiColor = ev.cpi >= 1 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex gap-4 mb-2">
        <div>
          <div className="text-xs text-slate-500">SPI</div>
          <div className={`text-lg font-bold ${spiColor}`}>{ev.spi?.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">CPI</div>
          <div className={`text-lg font-bold ${cpiColor}`}>{ev.cpi?.toFixed(2)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div>
          <span className="text-slate-500">BCWS: </span>
          <span className="font-medium">{fmt(ev.bcws ?? 0)}</span>
        </div>
        <div>
          <span className="text-slate-500">BCWP: </span>
          <span className="font-medium">{fmt(ev.bcwp ?? 0)}</span>
        </div>
        <div>
          <span className="text-slate-500">ACWP: </span>
          <span className="font-medium">{fmt(ev.acwp ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

function FloatHistogram({ data }: { data: unknown }) {
  const d = data as { buckets: { label: string; count: number }[]; total: number };
  if (!d?.buckets) return null;

  const max = Math.max(...d.buckets.map((b) => b.count), 1);

  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="text-xs text-slate-500 mb-2">Float Distribution ({d.total} activities)</div>
      <div className="space-y-1">
        {d.buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2">
            <div className="text-xs text-slate-500 w-20 shrink-0">{b.label}</div>
            <div className="flex-1 h-4 bg-slate-200 rounded overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 w-8 text-right">{b.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactTable({ data, dataType }: { data: unknown; dataType: string }) {
  if (dataType === 'critical_path_table') {
    const d = data as {
      count: number;
      projectFinish: string;
      activities: { code: string; name: string; earlyFinish: string; totalFloat: number }[];
    };
    if (!d?.activities) return null;
    return (
      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto">
        <div className="text-xs text-slate-500 mb-2">
          {d.count} critical activities | Finish: {d.projectFinish ? new Date(d.projectFinish).toLocaleDateString() : 'N/A'}
        </div>
        <table className="text-xs w-full">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left pr-3">Code</th>
              <th className="text-left pr-3">Name</th>
              <th className="text-left pr-3">Early Finish</th>
              <th className="text-left">Float</th>
            </tr>
          </thead>
          <tbody>
            {d.activities.slice(0, 8).map((a) => (
              <tr key={a.code} className="border-t border-slate-100">
                <td className="pr-3 font-mono py-0.5">{a.code}</td>
                <td className="pr-3 py-0.5 max-w-xs truncate">{a.name}</td>
                <td className="pr-3 py-0.5">{a.earlyFinish ? new Date(a.earlyFinish).toLocaleDateString() : 'N/A'}</td>
                <td className="py-0.5">{a.totalFloat}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (dataType === 'look_ahead_table') {
    const d = data as {
      weeks: number;
      activities: { code: string; name: string; plannedStart: string | null; plannedFinish: string | null; windowStatus: string; totalFloat: number }[];
    };
    if (!d?.activities) return null;
    return (
      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto">
        <div className="text-xs text-slate-500 mb-2">{d.weeks}-week look-ahead ({d.activities.length} activities)</div>
        <table className="text-xs w-full">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left pr-3">Code</th>
              <th className="text-left pr-3">Name</th>
              <th className="text-left pr-3">Start</th>
              <th className="text-left pr-3">Finish</th>
              <th className="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {d.activities.slice(0, 10).map((a) => (
              <tr key={a.code} className="border-t border-slate-100">
                <td className="pr-3 font-mono py-0.5">{a.code}</td>
                <td className="pr-3 py-0.5 max-w-xs truncate">{a.name}</td>
                <td className="pr-3 py-0.5">{a.plannedStart ? new Date(a.plannedStart).toLocaleDateString() : 'N/A'}</td>
                <td className="pr-3 py-0.5">{a.plannedFinish ? new Date(a.plannedFinish).toLocaleDateString() : 'N/A'}</td>
                <td className="py-0.5">{a.windowStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

function InlineData({ dataType, data }: { dataType: string; data: unknown }) {
  if (dataType === 'health_report') return <HealthCard data={data} />;
  if (dataType === 'ev_metrics') return <EvMetricsCard data={data} />;
  if (dataType === 'float_histogram') return <FloatHistogram data={data} />;
  if (dataType === 'critical_path_table' || dataType === 'look_ahead_table')
    return <CompactTable data={data} dataType={dataType} />;
  return null;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-slate-800 text-white'
            : 'bg-white border border-slate-200 text-slate-800'
        }`}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.dataType && message.data !== undefined && (
          <InlineData dataType={message.dataType} data={message.data} />
        )}

        {!isUser && message.cached && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
              Cached
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPageClient({
  projectId,
  projectName,
  activeVersionId,
}: ChatPageClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<LlmProvider>('claude');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load persisted provider
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LlmProvider | null;
      if (stored && ['claude', 'gemini', 'openai'].includes(stored)) {
        setProvider(stored);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // localStorage unavailable
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
      };

      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput('');
      setIsLoading(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '' },
      ]);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            versionId: activeVersionId,
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            provider,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let isCached = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                delta?: string;
                dataType?: string;
                data?: unknown;
                key?: string;
                message?: string;
              };

              if (event.type === 'cache_hit') {
                isCached = true;
              } else if (event.type === 'text' && event.delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.delta, cached: isCached }
                      : m
                  )
                );
              } else if (event.type === 'data' && event.dataType) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, dataType: event.dataType, data: event.data }
                      : m
                  )
                );
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content || `Error: ${event.message ?? 'Unknown error'}`,
                        }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}`,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, projectId, activeVersionId, provider]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!activeVersionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center">
        <div className="text-4xl mb-4">📂</div>
        <h2 className="text-xl font-semibold text-slate-700 mb-2">No schedule uploaded yet</h2>
        <p className="text-slate-400 text-sm max-w-sm">
          Upload a schedule file first to start chatting with the AI agent.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">AI Schedule Agent</h1>
          <p className="text-xs text-slate-400">{projectName}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Provider:</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div className="text-4xl mb-3">🤖</div>
              <h2 className="text-lg font-semibold text-slate-700 mb-1">
                Ask anything about your schedule
              </h2>
              <p className="text-slate-400 text-sm">
                Powered by {PROVIDER_LABELS[provider]} · Direct queries are instant
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="text-left text-sm px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-amber-400 hover:bg-amber-50/30 transition-all text-slate-600"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="pb-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start mb-4">
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 border-t border-slate-200 pt-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your schedule…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 min-h-[44px] max-h-32"
            style={{ overflow: 'auto' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2.5 bg-amber-400 text-white rounded-xl font-medium text-sm hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 shrink-0"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Send
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-1.5">
          Enter to send · Shift+Enter for new line · Direct queries (critical path, health, etc.) are instant
        </p>
      </div>
    </div>
  );
}
