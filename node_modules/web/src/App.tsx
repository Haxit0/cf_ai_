import { useEffect, useMemo, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type Incident = {
  title: string;
  status: string;
  impact: string;
  suspected_causes: string[];
  timeline: { time: string; event: string }[];
  next_actions: { owner?: string; task: string; priority: string }[];
  questions: string[];
  postmortem?: any;
  messages?: { role: "user" | "assistant"; content: string }[];
};

export default function App() {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<{ role: string; content: string }[]>([]);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function createIncident() {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/incidents`, { method: "POST" });
      const data = await res.json();
      setIncidentId(data.incidentId);
      setChat([
        {
          role: "assistant",
          content: "New incident started. Paste logs, errors, or describe the issue.",
        },
      ]);
      setIncident(null);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!incidentId || !input.trim()) return;
    const message = input.trim();
    setInput("");
    setChat((c) => [...c, { role: "user", content: message }]);
    setBusy(true);

    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();

      if (data.incident?.messages) {
        setChat(data.incident.messages);
    } else {
      setChat((c) => [...c, { role: "assistant", content: data.assistant_message }]);
    }

    setIncident(data.incident);
  } finally {
    setBusy(false);
  }
}

  async function closeIncident() {
    if (!incidentId || busy) return;

    setBusy(true);
    setChat((c) => [
      ...c,
      { role: "assistant", content: "Closing incident... generating postmortem." },
    ]);

    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/close`, {
        method: "POST",
      });

      if (!res.ok) {
        setChat((c) => [
          ...c,
          {
            role: "assistant",
            content: "I couldn't start the postmortem workflow. Please try again.",
          },
        ]);
        return;
      }

      let finished = false;

      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const stateRes = await fetch(`${API_BASE}/api/incidents/${incidentId}`);
        const data = await stateRes.json();

        setIncident(data);

        if (data.messages) {
          setChat(data.messages);
        }

        if (data.postmortem || data.status === "closed") {
          finished = true;
          break;
        }
      }

      if (!finished) {
        setChat((c) => [
          ...c,
          {
            role: "assistant",
            content:
              "The postmortem is still being generated. Please wait a few seconds and try refreshing the incident.",
          },
        ]);
      }
    } catch {
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          content: "Something went wrong while closing the incident. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function clearChat() {
    setChat([]);
  }

  useEffect(() => {
    createIncident();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy]);

  const statusPill = useMemo(() => incident?.status ?? "intake", [incident]);

  return (
    <div className="min-h-screen text-zinc-100">
      <div className="bg-ambient" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Incident AI</h1>
            <p className="text-sm text-zinc-300">
              Workers AI + Durable Objects + Workflows + Pages
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
              Status: {statusPill}
            </span>
            <button
              disabled={busy}
              onClick={createIncident}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              New incident
            </button>
            <button
              disabled={busy || chat.length === 0}
              onClick={clearChat}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              Clear chat
            </button>
            <button
              disabled={busy || !incidentId}
              onClick={closeIncident}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              Close & postmortem
            </button>
          </div>
        </header>

        <main className="mt-6 grid gap-4 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-2xl bg-white/10 backdrop-blur p-4 shadow">
            <div className="h-[60vh] overflow-auto space-y-3 pr-2">
              {chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                  <div
                    className={[
                      "inline-block max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user" ? "bg-white/15" : "bg-black/20",
                    ].join(" ")}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {busy&&(
                <div className="text-left">
                  <div className="inline-block bg-black/20 px-4 py-3 rounded-2xl text-sm animate-pulse">
                    Analyzing logs...
                  </div>
                </div>
              )}

              {chat.length === 0 && (
                <div className="text-sm text-zinc-300 space-y-2">
                  <p>Paste logs, errors, or describe the issue.</p>
                  <p className="text-xs text-zinc-500">
                    Example: "Users get 500 errors on /api/login after deployment"
                  </p>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
                placeholder="Type a message…"
                className="flex-1 rounded-xl bg-black/20 px-4 py-3 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              />
              <button
                disabled={busy || !incidentId}
                onClick={send}
                className="rounded-xl bg-white/10 px-4 py-3 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </section>

          <aside className="rounded-2xl bg-white/10 backdrop-blur p-4 shadow">
            <h2 className="text-sm font-semibold text-zinc-200">Incident Card</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="text-xs text-zinc-400">Title</div>
                <div>{incident?.title ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Impact</div>
                <div>{incident?.impact ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Suspected causes</div>
                <ul className="list-disc pl-5">
                  {(incident?.suspected_causes ?? []).slice(0, 6).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <div>

                <div className="text-xs text-zinc-400">Questions</div>
                  <ul className="list-disc pl-5">
                    {(incident?.questions ?? []).slice(0, 4).map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400">Next actions</div>
                <ul className="space-y-2">
                  {(incident?.next_actions ?? []).slice(0, 6).map((a, i) => (
                    <li key={i} className="rounded-xl bg-black/20 p-2 ring-1 ring-white/10">
                      <div className="text-xs text-zinc-400">{a.priority} {a.owner ? `• ${a.owner}` : ""}</div>
                      <div>{a.task}</div>
                    </li>
                  ))}
                </ul>
              </div>
              {incident?.postmortem && (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-zinc-400">Postmortem summary</div>
                  <div>{incident.postmortem.summary ?? "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-zinc-400">Root cause</div>
                  <div>{incident.postmortem.root_cause ?? "—"}</div>
                </div>

                <div>
                  <div className="text-xs text-zinc-400">Postmortem actions</div>
                  <ul className="space-y-2">
                    {(incident.postmortem.action_items ?? []).map((item: any, i: number) => (
                      <li
                        key={i}
                        className="rounded-xl bg-black/20 p-2 ring-1 ring-white/10"
                      >
                        <div className="text-xs text-zinc-400">{item.priority}</div>
                        <div>{item.task}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            </div>
          </aside>
        </main>

        <footer className="mt-6 text-xs text-zinc-400">
          Incident ID: {incidentId ?? "—"}
        </footer>
      </div>
    </div>
  );
}