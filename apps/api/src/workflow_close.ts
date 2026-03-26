import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

type Params = { incidentId: string };

export class PostmortemWorkflow extends WorkflowEntrypoint<any, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { incidentId } = event.payload;

    const incident = await step.do("fetch incident state", async () => {
      const stub = this.env.INCIDENT_DO.get(
        this.env.INCIDENT_DO.idFromName(incidentId),
      );
      const stateRes = await stub.fetch("https://do/state");
      return await stateRes.json();
    });

    const minimalIncident = {
      title: incident.title,
      impact: incident.impact,
      suspected_causes: incident.suspected_causes?.slice(0, 3) ?? [],
      timeline: incident.timeline?.slice(-3) ?? [],
    };

    const postmortem = await step.do("generate postmortem", async () => {
      const prompt = [
        {
          role: "system",
          content: `You write incident postmortems.
    Return valid raw JSON only.
    Do not use markdown.
    Keep it concise.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            incident: minimalIncident,
            schema: {
              summary: "string",
              root_cause: "string",
              actions: "array of {task, priority(P0|P1|P2)}"
            },
          }),
        },
      ];

      let res;
      try {
        res = await this.env.AI.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          { messages: prompt },
        );
      } catch (err) {
        return { error: "AI request failed", details: String(err) };
      }

      const raw =
        typeof res?.response === "string"
          ? res.response.trim()
          : JSON.stringify(res?.response ?? "");

      try {
        const cleanedRaw = raw
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .replace(/^json\s*/i, "")
          .trim();

        return JSON.parse(cleanedRaw);
      } catch {
        return {
          title: "Postmortem generation failed",
          summary: "The model returned incomplete JSON.",
          root_cause: "Unknown",
          impact: incident?.impact ?? "Unknown",
          action_items: [
            {
              task: "Regenerate postmortem with a smaller schema",
              priority: "P1",
            },
          ],
          raw,
        };
      }
    });

    await step.do("persist postmortem note", async () => {
      const stub = this.env.INCIDENT_DO.get(
        this.env.INCIDENT_DO.idFromName(incidentId),
      );

      const normalizedPostmortem =
        postmortem?.incident && typeof postmortem.incident === "object"
          ? postmortem.incident
          : postmortem;

      await stub.fetch("https://do/postmortem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assistant_message: "Incident closed. Postmortem generated successfully.",
          postmortem: normalizedPostmortem,
        }),
      });

      return { ok: true };
    });

    return { ok: true, incidentId };
  }
}