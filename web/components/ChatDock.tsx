"use client";

// "Pregúntale a Cuby" — asistente IA flotante, abajo al centro.
// Barra tipo píldora oscura (estilo del diseño) que despliega un panel de
// conversación. Al abrir un reporte, autogenera un resumen; luego responde
// preguntas con todo el contexto del análisis.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "@/lib/types";
import { askCuby, buildContext, SUMMARY_PROMPT, type ChatMessage } from "@/lib/chat";

type Turn = ChatMessage & { hidden?: boolean };

export default function ChatDock({ report }: { report: Report }) {
  const context = useMemo(() => buildContext(report), [report]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const startedFor = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = turns.filter((t) => !t.hidden);

  async function send(content: string, hidden = false) {
    const text = content.trim();
    if (!text || loading) return;
    const next: Turn[] = [...turns, { role: "user", content: text, hidden }];
    setTurns(next);
    setLoading(true);
    if (!hidden) setInput("");
    const reply = await askCuby(
      context,
      next.map(({ role, content }) => ({ role, content }))
    );
    setTurns([...next, { role: "assistant", content: reply }]);
    setLoading(false);
  }

  // Resumen automático al abrir un reporte nuevo.
  useEffect(() => {
    const key = report.parcela + (report.meta?.start ?? "");
    if (startedFor.current === key) return;
    startedFor.current = key;
    setTurns([]);
    setOpen(true);
    send(SUMMARY_PROMPT, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  // Auto-scroll al último mensaje.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visible.length, loading]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
      <div className="w-full max-w-[680px]">
        {open && (visible.length > 0 || loading) && (
          <div className="mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#171a21] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                <Avatar sm />
                Cuby · IA
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 transition hover:text-white/80"
                aria-label="Minimizar"
              >
                ▾
              </button>
            </div>
            <div
              ref={scrollRef}
              className="max-h-[46vh] space-y-3 overflow-y-auto px-4 py-3"
            >
              {visible.map((t, i) => (
                <Bubble key={i} role={t.role} content={t.content} />
              ))}
              {loading && <Typing />}
            </div>
          </div>
        )}

        {/* Barra de entrada */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-full border border-white/10 bg-[#23262e] px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
        >
          <Avatar />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Pregúntale a Cuby…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6d40e6] text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

function Avatar({ sm }: { sm?: boolean }) {
  const size = sm ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-sm";
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#e26fb0] text-white`}
    >
      ✦
    </span>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Avatar sm />}
      <div
        className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-[#8b5cf6] text-white"
            : "bg-white/[0.06] text-white/90"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-2">
      <Avatar sm />
      <div className="flex gap-1 rounded-2xl bg-white/[0.06] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 12L20 4L14 20L11 13L4 12Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
