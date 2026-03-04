# Clara - Call Transcript Extractor & Voice Configuration Pipeline

Clara is a Node.js-based data pipeline designed to analyze customer transcripts, extract operational rules using the Cerebras LLM API (Llama 3.1 8B), and compile those rules into deploy-ready AI voice agent configurations (Retell AI Spec). 

## Architecture & Data Flow

This project explicitly separates the **"Account Memo Database Layer"** from the **"Retell Spec API Layer"**. 
* **State Management (The Database Layer)**: Call facts (like business hours and emergency policies) live securely inside `outputs/accounts/sample_memo.json`. This JSON acts as our source of truth.
* **The Voice Agent (The API Layer)**: Voice configuration platforms require explicit text prompts. `generate_retell_spec.js` maps our database attributes into a conversation-enforcing text prompt payload (`outputs/accounts/retell_spec_v*.json`). 

### Pipeline Phases
1. **Extraction** (`scripts/extract_memo.js`): Ingests a raw transcript from `inputs/` and asks the LLM to write a database object (`sample_memo.json`). Any missing knowledge is flagged in a `questions_or_unknowns` array to prevent AI hallucinations.
2. **Onboarding Patching** (`scripts/apply_onboarding_updates.js`): Ingests deep follow-up transcripts, queries the LLM for updates, and deeply merges those changes safely onto our database state, removing specific flagged unknowns if the criteria are finally met (`memo_v2.json`). It also logs what changed directly to `changes.md`.
3. **Draft Exporting**: Both scripts finally trigger a prompt template builder to convert the JSON configurations into Retell AI Draft Specs ready for API ingestion. 

---

## Local Setup

### 1. Requirements
* Node.js (v18+)
* Docker (for optional n8n automation)
* A Cerebras API key (Free Tier Llama API)

### 2. Environment Variables
In the root directory of this project (`/clara`), create a `.env` file and insert your API key:
```env
API_KEY=your_cerebras_secret_key_here
```

### 3. Automated Orchestration via n8n (Docker)
To batch process files automatically without hitting the terminal, you can run n8n on Docker free-tier locally.
1. Create a `docker-compose.yml` file in the root:
```yaml
version: '3.8'

services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    ports:
      - "5678:5678"
    volumes:
      - .\inputs:/home/node/inputs
      - .\outputs:/home/node/outputs
      - .\scripts:/home/node/scripts
      - .\.env:/home/node/.env
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
```
2. Run `docker-compose up -d`.
3. Open `http://localhost:5678` in your browser. 
4. In n8n, create a workflow utilizing an **"Execute Command"** node. If dealing with raw demos run: `node /home/node/scripts/extract_memo.js /home/node/inputs/X`
5. *Note: n8n workflows can be exported from the dashboard as `.json` files and backed up into the `/workflows` directory manually.*

---

## How to use the Pipeline manually
If choosing to bypass n8n and orchestrate locally via standard Node execution:

1. **Plug in your data**: Drop any transcript into the `inputs/` directory (e.g. `inputs/sample_transcript.txt`). 
2. **Run extraction**:
   ```bash
   node scripts/extract_memo.js
   ```
3. **View the initial state**: Check `outputs/accounts/sample_memo.json` to see what facts the LLM extracted and which facts are missing. Also review the `outputs/accounts/retell_spec_v1.json` for the raw voice API output.
4. **Update the state**: Add an onboarding script to the input file and execute the patch module:
   ```bash
   node scripts/apply_onboarding_updates.js
   ```
5. **View Changes**: Read `outputs/accounts/changes.md` to see exactly why the node pipeline mutated the state.

## Known Limitations & Production Improvements
* **Rate Limits**: The free-tier Cerebras model handles logic fast, but can timeout or 401 on enormous batch processing loops. A production deployment should utilize an API gateway or internal retry blocks.
* **JSON Hallucination**: While we enforce `response_format: { type: "json_object" }` at the API edge natively, sometimes models hallucinate control characters. We have a regex fallback implemented, but production systems should utilize strict Pydantic/Zod typings mapped against the edge execution to validate shapes formally before database execution.
* **Scalability**: The database currently relies on flat `.json` files. A production system must transition these memory maps to a document database (like MongoDB/Redis) allowing isolated tenant access controls simultaneously.
