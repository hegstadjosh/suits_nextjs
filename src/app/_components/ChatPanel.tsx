"use client";

import { useMemo, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type ToolCall = { name: string; arguments: unknown };

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [input, setInput] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);

    const res = await fetch("/api/ev-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [...messages, { role: "user", content: text }] }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const assistantMsgs = (data.messages as Message[]) ?? [];
    const toolCalls = (data.toolCalls as ToolCall[]) ?? [];
    setMessages((m) => [...m, ...assistantMsgs]);
    setTools(toolCalls);
  }

  const toolTranscript = useMemo(() => {
    if (tools.length === 0) return null;
    return (
      <div className="rounded-md border border-neutral-700 bg-neutral-900/30 p-3 text-xs text-neutral-300">
        <div className="mb-1 text-neutral-400">Function calls</div>
        <ul className="space-y-1">
          {tools.map((t, i) => (
            <li key={i} className="font-mono">
              {t.name}({shortJson(t.arguments)})
            </li>
          ))}
        </ul>
      </div>
    );
  }, [tools]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="text-xl font-semibold">Chat</div>
      <div className="flex-1 overflow-auto rounded-md border border-neutral-700 bg-neutral-950/60 p-3">
        {messages.length === 0 ? (
          <div className="text-sm text-neutral-400">Try: "Status check"</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {messages.map((m, i) => (
              <li key={i} className={m.role === "user" ? "text-sky-300" : "text-neutral-100"}>
                <span className="mr-2 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                  {m.role}
                </span>
                {m.content}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toolTranscript}

      <form ref={formRef} onSubmit={onSubmit} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-2 outline-none focus:ring-2 focus:ring-sky-600"
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function shortJson(v: unknown) {
  try {
    const s = JSON.stringify(v);
    return s.length > 120 ? s.slice(0, 117) + "…" : s;
  } catch {
    return String(v);
  }
}
