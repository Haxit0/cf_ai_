import { systemPrompt } from "./prompts";

type IncidentStatus =
  | "intake"
  | "investigating"
  | "mitigating"
  | "monitoring"
  | "closed";

type IncidentState = {
  status: IncidentStatus;
  title: string;
  impact: string;
  rollingSummary: string;
  messages: { role: "user" | "assistant"; content: string }[];
  suspected_causes: string[];
  timeline: { time: string; event: string }[];
  next_actions: { owner?: string; task: string; priority: "P0" | "P1" | "P2" }[];
  questions: string[];
  postmortem?: any;
  messageCount: number;
};

const DEFAULT_STATE: IncidentState = {
  status: "intake",
  title: "Untitled incident",
  impact: "unknown",
  rollingSummary: "",
  messages: [],
  suspected_causes: [],
  timeline: [],
  next_actions: [],
  questions: [],
  messageCount: 0,
};

const MAX_MESSAGES = 12;
const SUMMARIZE_EVERY = 8;

export class IncidentDO implements DurableObject {
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  private async getState(): Promise<IncidentState> {
    const saved = await this.state.storage.get<IncidentState>("incident");
    return saved ?? structuredClone(DEFAULT_STATE);
  }

  private async putState(s: IncidentState) {
    await this.state.storage.put("incident", s);
  }

  private applyPatch(s: IncidentState, patch: any): IncidentState {
    const next = structuredClone(s);

    for (const [k, v] of Object.entries(patch ?? {})) {
      if (v === undefined) continue;

      if (k === "timeline" && Array.isArray(v)) {
        next.timeline = [...next.timeline, ...v];
      } else if (k === "suspected_causes" && Array.isArray(v)) {
        next.suspected_causes = Array.from(
          new Set([...next.suspected_causes, ...v]),
        );
      } else if (k === "next_actions" && Array.isArray(v)) {
        next.next_actions = [...next.next_actions, ...v];
      } else if (k === "questions" && Array.isArray(v)) {
        next.questions = v;
      } else {
        (next as any)[k] = v;
      }
    }

    return next;
  }

  private async maybeSummarize(s: IncidentState): Promise<IncidentState> {
    if (s.messageCount === 0 || s.messageCount % SUMMARIZE_EVERY !== 0) {
      return s;
    }

    const toSummarize = s.messages.slice(-MAX_MESSAGES);
    const prompt = [
      {
        role: "system",
        content: `Summarize this incident into structured memory:

        - System involved
        - Current status
        - Customer impact
        - Key signals from logs/errors
        - Suspected causes
        - Open questions

        Keep it concise and factual.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          existing_summary: s.rollingSummary,
          recent_messages: toSummarize,
        }),
      },
    ];

    let res;
    try {
      res = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: prompt,
      });
    } catch {
      return s;
    }

    const summary =
      typeof res?.response === "string"
        ? res.response.trim()
        : JSON.stringify(res?.response ?? "");

    s.rollingSummary = summary || s.rollingSummary;
    s.messages = s.messages.slice(-MAX_MESSAGES);
    return s;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/init") {
      const s = await this.getState();
      await this.putState(s);
      return new Response("ok");
    }

    if (req.method === "GET" && url.pathname === "/state") {
      const s = await this.getState();
      return new Response(JSON.stringify(s), {
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "POST" && url.pathname === "/chat") {
      const body = (await req.json().catch(() => null)) as
        | { message?: string }
        | null;
      const userMsg = body?.message?.trim();

      if (!userMsg) {
        return new Response(JSON.stringify({ error: "Missing message" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      let s = await this.getState();

      s.messages.push({ role: "user", content: userMsg });
      s.messageCount += 1;

      const contextMessages = s.messages.slice(-MAX_MESSAGES);

      const llmMessages = [
        { role: "system", content: systemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            incident_state: {
              status: s.status,
              title: s.title,
              impact: s.impact,
              suspected_causes: s.suspected_causes,
              timeline: s.timeline.slice(-20),
              next_actions: s.next_actions.slice(-20),
              questions: s.questions,
            },
            rolling_summary: s.rollingSummary,
            recent_messages: contextMessages,
            new_user_message: userMsg,
          }),
        },
      ];

      let res;
      try {
        res = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: llmMessages,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "AI request failed", details: String(err) }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }

      const raw =
        typeof res?.response === "string"
          ? res.response.trim()
          : JSON.stringify(res?.response ?? "");

      const cleanedRaw = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .replace(/^json\s*/i, "")
        .trim();

      let parsed: any = null;
      try {
        parsed = JSON.parse(cleanedRaw);
      } catch {
        const assistantMessageMatch = cleanedRaw.match(
          /"assistant_message"\s*:\s*"((?:\\.|[^"\\])*)"/
        );

        const extractedAssistantMessage = assistantMessageMatch
          ? assistantMessageMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "\n")
              .replace(/\\\\/g, "\\")
          : null;

        parsed = {
          assistant_message:
            extractedAssistantMessage ||
            "Sorry - I couldn't fully parse the model response. Can you provide a bit more detail?",
          incident_patch: {
            questions: ["Can you paste the error/log snippet again?"],
          },
        };
      }

      const assistantMessage =
        typeof parsed.assistant_message === "string"
          ? parsed.assistant_message
          : parsed.assistant_message?.message
            ? String(parsed.assistant_message.message)
            : JSON.stringify(parsed.assistant_message ?? "No response", null, 2);

      s.messages.push({ role: "assistant", content: assistantMessage });

      s = this.applyPatch(s, parsed.incident_patch);
      s = await this.maybeSummarize(s);

      await this.putState(s);

      return new Response(
        JSON.stringify({
          assistant_message: assistantMessage,
          incident: s,
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (req.method === "POST" && url.pathname === "/postmortem") {
      const body = (await req.json().catch(() => null)) as
        | { postmortem?: any; assistant_message?: string }
        | null;

      let s = await this.getState();

      s.status = "closed";
      (s as any).postmortem = body?.postmortem ?? null;

      if (body?.assistant_message) {
        s.messages.push({ role: "assistant", content: body.assistant_message });
      }

      await this.putState(s);

      return new Response(JSON.stringify({ ok: true, incident: s }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}