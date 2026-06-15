'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, BrainCircuit } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { postCopilot, type CopilotResponse } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: unknown[];
  query?: string;
}

const SUGGESTIONS = [
  'Show all delayed requests',
  'Which department causes the most delays?',
  "What is today's SLA compliance?",
  'Show critical unacknowledged alerts',
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: '#4DA6FF', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

function DataGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0] ?? {}).slice(0, 6);
  return (
    <div className="mt-3 overflow-x-auto rounded border" style={{ borderColor: '#0f2444' }}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k} className="border-b px-3 py-2 text-left font-semibold uppercase tracking-wider"
                style={{ background: '#0a1628', borderColor: '#0f2444', color: '#4d7ab5' }}>
                {k.replace(/([A-Z])/g, ' $1').trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, i) => (
            <tr key={i} className="border-b last:border-0" style={{ borderColor: '#0f2444' }}>
              {keys.map((k) => (
                <td key={k} className="px-3 py-2" style={{ color: '#ddeeff' }}>
                  {String(row[k] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssistantBubble({ msg, typing }: { msg?: Message; typing?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-bold"
        style={{ background: 'rgba(0,102,204,0.15)', borderColor: 'rgba(0,102,204,0.4)', color: '#4DA6FF' }}>
        AI
      </div>
      <div className="max-w-[80%] rounded border px-4 py-3 text-[0.85rem] leading-relaxed"
        style={{ background: '#0a1628', borderColor: '#1a3560', color: '#ddeeff' }}>
        {typing ? <TypingDots /> : (
          <>
            <p>{msg?.content}</p>
            {msg?.data && Array.isArray(msg.data) && msg.data.length > 0 && (
              <DataGrid rows={msg.data as Record<string, unknown>[]} />
            )}
            {msg?.query && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[0.7rem]" style={{ color: '#4d7ab5' }}>
                  View source query
                </summary>
                <pre className="mt-1 overflow-x-auto rounded p-2 font-mono text-[0.7rem]"
                  style={{ background: '#050d1a', color: '#4DA6FF' }}>
                  {msg.query}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex flex-row-reverse gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-bold"
        style={{ background: '#0a1628', borderColor: '#1a3560', color: '#7aaad4' }}>
        You
      </div>
      <div className="max-w-[80%] rounded border px-4 py-3 text-[0.85rem]"
        style={{ background: 'rgba(0,102,204,0.12)', borderColor: 'rgba(0,102,204,0.3)', color: '#ddeeff' }}>
        {content}
      </div>
    </div>
  );
}

export default function AiPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  const user = useAuthStore((s) => s.user);
  const allowed = user?.role === 'Administrator' || user?.role === 'Regional Manager';

  useEffect(() => { setPageMeta('AI Copilot', 'Conversational operational intelligence'); }, [setPageMeta]);

  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: "Hello! I'm your Operational Copilot. Ask me about service requests, SLA compliance, department performance, or delays.",
  }]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (query: string) => postCopilot(query).then((r) => r.data),
    onSuccess: (data: CopilotResponse) => {
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== '…typing…'),
        { role: 'assistant', content: data.answer, data: data.data as unknown[], query: data.sourceQuery },
      ]);
    },
    onError: (e: Error) => {
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== '…typing…'),
        { role: 'assistant', content: `Error: ${e.message}` },
      ]);
    },
  });

  function send(query: string) {
    if (!query.trim() || mutation.isPending) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: query },
      { role: 'assistant', content: '…typing…' },
    ]);
    setInput('');
    mutation.mutate(query);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!allowed) {
    return (
      <EmptyState
        icon={<BrainCircuit size={48} />}
        title="Access restricted"
        description="AI Copilot is available to Administrators and Regional Managers"
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border"
      style={{ background: '#0d1f38', borderColor: '#0f2444', height: 'calc(100vh - 120px)' }}>

      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b px-5 py-4"
        style={{ background: '#0a1628', borderColor: '#0f2444' }}>
        {/* D&S water drop icon */}
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border"
          style={{ background: 'rgba(0,102,204,0.15)', borderColor: 'rgba(0,102,204,0.4)', boxShadow: '0 0 16px rgba(0,102,204,0.15)' }}>
          <BrainCircuit size={22} style={{ color: '#4DA6FF' }} />
        </div>
        <div>
          <div className="text-[0.95rem] font-bold" style={{ color: '#ffffff' }}>
            D&amp;S Operational Copilot
          </div>
          <div className="text-xs" style={{ color: '#4d7ab5' }}>
            Ask anything about your operations in plain language
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <UserBubble key={i} content={msg.content} />
          ) : msg.content === '…typing…' ? (
            <AssistantBubble key={i} typing />
          ) : (
            <AssistantBubble key={i} msg={msg} />
          ),
        )}

        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                className="rounded-full border px-3 py-1.5 text-xs transition"
                style={{ background: '#0a1628', borderColor: '#1a3560', color: '#4DA6FF' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.background = 'rgba(0,102,204,0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1a3560'; e.currentTarget.style.background = '#0a1628'; }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex flex-shrink-0 gap-2 border-t p-4"
        style={{ borderColor: '#0f2444' }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about operations, delays, SLA compliance…"
          disabled={mutation.isPending}
          className="flex-1 rounded border px-4 py-2.5 text-sm focus:outline-none transition"
          style={{ background: '#0a1628', borderColor: '#1a3560', color: '#ddeeff' }}
          onFocus={(e) => { e.target.style.borderColor = '#0066CC'; e.target.style.boxShadow = '0 0 0 2px rgba(0,102,204,0.12)'; }}
          onBlur={(e) => { e.target.style.borderColor = '#1a3560'; e.target.style.boxShadow = 'none'; }}
        />
        <button type="submit" disabled={!input.trim() || mutation.isPending}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #0066CC, #0055aa)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF, #0066CC)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC, #0055aa)')}
          aria-label="Send">
          {mutation.isPending ? <Spinner className="h-4 w-4" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
