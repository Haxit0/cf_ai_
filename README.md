# Incident AI 🚨

An AI-powered incident response assistant built on Cloudflare.

This application helps engineers triage production incidents, maintain structured state, and automatically generate postmortems using an LLM.

---

## ✨ Features

- 💬 **AI Incident Triage**
  - Ask questions and guide debugging
  - Maintains structured incident state (causes, timeline, actions)

- 🧠 **Stateful Memory**
  - Uses Durable Objects to persist incident data
  - Tracks messages, summary, and investigation progress

- ⚙️ **Automated Postmortems**
  - Cloudflare Workflows generate postmortems on incident close
  - Extracts root cause, summary, and action items

- 🧾 **Structured Incident View**
  - Real-time incident card with:
    - Impact
    - Suspected causes
    - Questions
    - Next actions

---

## 🏗️ Architecture

This project uses the Cloudflare developer platform:

- **Workers** → API layer
- **Durable Objects** → stateful incident memory
- **Workflows** → postmortem generation pipeline
- **Workers AI (Llama 3.3)** → LLM reasoning
- **Pages + React + Tailwind** → frontend UI

---

## 🧠 How it works

1. User creates an incident and starts chatting
2. The LLM:
   - asks clarifying questions
   - updates structured incident state
3. State is stored in a Durable Object
4. On "Close & postmortem":
   - a Workflow generates a structured postmortem
   - result is stored and displayed in the UI

---

## 📸 Screenshots

### Incident Triage
![Triage Screenshot](./screenshots/triage.png)

### Incident State
![State Screenshot](./screenshots/state.png)

### Postmortem
![Postmortem Screenshot](./screenshots/postmortem.png)

---

## 🛠️ Setup

### 1. Install dependencies

```bash
npm install