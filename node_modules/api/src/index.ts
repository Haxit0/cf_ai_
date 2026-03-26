import { IncidentDO } from "./incident_do";
import { PostmortemWorkflow } from "./workflow_close";

export interface Env {
  AI: any;
  INCIDENT_DO: DurableObjectNamespace;
  POSTMORTEM_WORKFLOW: any;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return json({ ok: true });

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "POST" && url.pathname === "/api/incidents") {
      const id = crypto.randomUUID();
      const stub = env.INCIDENT_DO.get(env.INCIDENT_DO.idFromName(id));
      await stub.fetch("https://do/init", { method: "POST" });
      return json({ incidentId: id });
    }

    if (
      req.method === "GET" &&
      parts[0] === "api" &&
      parts[1] === "incidents" &&
      parts[2]
    ) {
      const incidentId = parts[2];
      const stub = env.INCIDENT_DO.get(env.INCIDENT_DO.idFromName(incidentId));
      const res = await stub.fetch("https://do/state");
      return withCors(res);
    }

    if (
      req.method === "POST" &&
      parts[0] === "api" &&
      parts[1] === "incidents" &&
      parts[2] &&
      parts[3] === "chat"
    ) {
      const incidentId = parts[2];
      const body = (await req.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!body?.message?.trim()) {
        return json({ error: "Missing message" }, 400);
      }

      const stub = env.INCIDENT_DO.get(env.INCIDENT_DO.idFromName(incidentId));
      const res = await stub.fetch("https://do/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: body.message }),
      });
      return withCors(res);
    }

    if (
      req.method === "POST" &&
      parts[0] === "api" &&
      parts[1] === "incidents" &&
      parts[2] &&
      parts[3] === "close"
    ) {
      const incidentId = parts[2];
      const instance = await env.POSTMORTEM_WORKFLOW.create({
        params: { incidentId },
      });
      return json({ ok: true, workflowInstanceId: instance.id });
    }

    return json({ error: "Not found" }, 404);
  },
};

export { IncidentDO, PostmortemWorkflow };