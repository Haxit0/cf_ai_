# PROMPTS.md

This project was developed with AI assistance. Below are representative prompts used during development.

## Project planning
- Propose a backend-heavy project idea using Cloudflare Workers, Durable Objects, Workflows, and Pages.

## Architecture and implementation
- Generate a TypeScript skeleton for:
  - Worker API routes
  - Durable Object incident state
  - Workflow-based postmortem generation
- Help debug Wrangler, Durable Object, and Workflow configuration issues.

## Frontend
- Improve UX for long-running workflow completion.

## Prompt engineering
- Improve the system prompt for incident triage so the model:
  - returns valid JSON only
  - avoids repetition
  - keeps assistant responses concise
- Improve the workflow prompt for postmortem generation with a smaller schema to reduce invalid JSON/truncation.

## Debugging and reliability
- Help handle invalid or incomplete JSON returned by the model.
- Add fallback parsing and graceful degradation for broken model outputs.
- Reduce workflow prompt size and normalize postmortem output shape.
