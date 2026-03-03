const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.API_KEY;
const API_URL = `https://api.cerebras.ai/v1/chat/completions`;

// --- SYSTEM PROMPT ---
const ONBOARDING_SYSTEM_PROMPT = `You are an operational data transition agent.
Analyze the provided onboarding call transcript against the required 14 operational fields.
Extract ONLY the updates, new constraints, clarifications, or previously missing information (such as office_address or integration_constraints).

You must return a JSON object where the keys correspond to the operational fields being updated (e.g., 'business_hours', 'office_address', 'call_transfer_rules', 'integration_constraints').
For each field that needs updating, provide a nested object with:
- "value": The new extracted value. MUST BE A STRING OR ARRAY OF STRINGS. If the rules are complex (like transfer timeouts and fallbacks), summarize them into a single comprehensive string. Do not nest objects inside "value".
- "reason": A brief explanation of why this change is being made based on the transcript.

DO NOT include fields that are not mentioned or that remain unchanged.
Return ONLY valid JSON.
Example output format:
{
  "business_hours": {
    "value": "Monday-Friday 9AM-5PM CST",
    "reason": "Client confirmed specific time zone."
  },
  "office_address": {
    "value": "123 Main Street, Suite 400, Chicago, Illinois",
    "reason": "Client provided primary office address."
  },
  "call_transfer_rules": {
    "value": "30-second timeout. Fallback: 'I am paging our backup emergency team right now, and someone will call you back within 10 minutes.'",
    "reason": "Client specified timeout and fallback message for emergency call transfers."
  }
}
`;

/**
 * Extracts updates from the onboarding transcript using the LLM API.
 */
async function extractUpdates(transcriptText) {
    const payload = {
        model: "llama3.1-8b",
        messages: [
            { role: "system", content: ONBOARDING_SYSTEM_PROMPT },
            { role: "user", content: `Onboarding Transcript:\n${transcriptText}` }
        ],
        response_format: { type: "json_object" }
    };

    console.log("Sending onboarding transcript to Cerebras API...");
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let rawOutput = data.choices[0].message.content;

    // Safety check for unescaped line breaks or malformed JSON from the LLM
    try {
        const updates = JSON.parse(rawOutput);
        console.log("Extraction successful!");
        return updates;
    } catch (e) {
        console.warn("Failed to parse LLM JSON directly. Attempting cleanup...");
        rawOutput = rawOutput.replace(/[\u0000-\u001F]+/g, " "); // Strip control characters
        return JSON.parse(rawOutput);
    }
}

/**
 * Deep merge function to apply updates to the memo.
 * Returns the new memo and the diff.
 */
function applyUpdates(v1Memo, updates) {
    const v2Memo = JSON.parse(JSON.stringify(v1Memo)); // Deep copy
    const diff = [];

    // Fields that we track based on the required 14 schema keys.
    const validFields = [
        'company_name', 'business_hours', 'office_address', 'services_supported',
        'emergency_definition', 'emergency_routing_rules', 'non_emergency_routing_rules',
        'call_transfer_rules', 'integration_constraints', 'after_hours_flow_summary',
        'office_hours_flow_summary', 'notes'
    ];

    for (const [key, fieldUpdate] of Object.entries(updates)) {
        if (!validFields.includes(key)) continue;

        const oldValue = v1Memo[key];
        const newValue = fieldUpdate.value;
        const reason = fieldUpdate.reason;

        // Apply update
        v2Memo[key] = newValue;

        // Log the diff, converting objects to strings if they accidentally slipped through
        diff.push({
            field: key,
            oldValue: typeof oldValue === 'object' && oldValue !== null ? JSON.stringify(oldValue) : oldValue,
            newValue: typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue) ? JSON.stringify(newValue) : newValue,
            reason: reason
        });

        // Handle questions_or_unknowns flag reduction
        if (v2Memo.questions_or_unknowns && Array.isArray(v2Memo.questions_or_unknowns)) {
            if (oldValue === null && newValue !== null) {
                v2Memo.questions_or_unknowns = v2Memo.questions_or_unknowns.filter(flag => {
                    const normalizedFlag = flag.toLowerCase().replace(/_/g, ' ');
                    const targetField = key.replace(/_/g, ' ');
                    return !normalizedFlag.includes(targetField.split(' ')[0]);
                });
            }
        }
    }

    if (updates.questions_or_unknowns && Array.isArray(updates.questions_or_unknowns.value)) {
        v2Memo.questions_or_unknowns = updates.questions_or_unknowns.value;
    }

    return { v2Memo, diff };
}

/**
 * Generates the changes.md file content.
 */
function generateDiffMarkdown(diffObject) {
    let md = `# Onboarding Updates Log\n\n`;
    if (diffObject.length === 0) {
        md += "No operational changes were extracted from the onboarding transcript.\n";
        return md;
    }

    diffObject.forEach(change => {
        md += `### ${change.field}\n`;
        md += `- **Old Value**: ${change.oldValue === null ? '*null*' : change.oldValue}\n`;
        md += `- **New Value**: ${change.newValue === null ? '*null*' : change.newValue}\n`;
        md += `- **Reason**: ${change.reason}\n\n`;
    });

    return md;
}

/**
 * Fully compliant prompt generation (reused from Phase 3).
 */
function generateSystemPrompt(memo) {
    const businessHours = memo.business_hours || "Standard business hours";
    const emergencyDefinition = memo.emergency_definition || "Any urgent issue that poses an immediate risk to property or safety";
    const transferRules = memo.call_transfer_rules || "Transfer only if it is a confirmed emergency";
    const nonEmergencyRules = memo.non_emergency_routing_rules || "Take message for next business day";

    return `You are Clara, an AI voice reception agent for a service trade business.

## Knowledge Base
- Business Hours: ${businessHours}
- Emergency Definition: ${emergencyDefinition}
- Call Transfer Rules: ${transferRules}
- Non-Emergency Rules: ${nonEmergencyRules}

## Strict Conversation Rules
You must strictly follow one of these two conversation flows. Do NOT ask too many questions; only collect what is needed for routing and dispatch. NEVER mention "function calls" or internal tools to the caller. When transferring a call, use the [transfer_call] tool silently.

### Flow 1: Business Hours Flow
1. GREETING: Greet the caller and state the business name.
2. PURPOSE: Ask the caller the purpose of their call.
3. COLLECT INFO: Collect the caller's name and number.
4. ROUTE: Transfer or route the call based on the Call Transfer Rules. 
5. FALLBACK: If the transfer fails, execute the transfer-fail protocol: explain that the team is currently assisting other customers and confirm next steps.
6. WRAP UP: Ask if they need anything else.
7. CLOSE: If no, politely close the call.

### Flow 2: After Hours Flow
1. GREETING: Greet the caller and state the business name.
2. PURPOSE: Ask the caller the purpose of their call.
3. CONFIRM EMERGENCY: Determine if the issue matches the Emergency Definition.
4. EMERGENCY HANDLING: If it is an emergency, immediately collect their name, number, and exact address. Attempt to transfer the call to the emergency queue.
5. EMERGENCY FALLBACK: If the transfer fails, apologize and assure them of a quick follow-up.
6. NON-EMERGENCY HANDLING: If it is not an emergency, collect their details and confirm follow-up will happen during business hours.
7. WRAP UP: Ask if they need anything else.
8. CLOSE: If no, politely close the call.
`;
}

/**
 * Builds the Retell Spec Object
 */
function createRetellSpec(version, memo, promptString) {
    return {
        metadata: {
            version: version,
            generated_at: new Date().toISOString(),
            status: memo.questions_or_unknowns?.length > 0 ? "needs_human_review" : "ready_for_deployment"
        },
        agent: {
            voice_id: "11labs-rachel",
            voice_style: "Professional, empathetic, and urgent",
            agent_name: `Clara Plumbing Agent ${version}`,
            language: "en-US",
            system_prompt: promptString,
            llm_websocket_url: "wss://your-custom-llm-endpoint.com/llm",
            agent_variables: {
                business_hours: memo.business_hours,
                emergency_definition: memo.emergency_definition,
                call_transfer_rules: memo.call_transfer_rules
            }
        }
    };
}

async function run() {
    const inputsDir = path.join(__dirname, '..', 'inputs');
    const outputsDir = path.join(__dirname, '..', 'outputs', 'accounts');

    const v1MemoPath = path.join(outputsDir, 'sample_memo.json');
    const onboardingTranscriptPath = path.join(inputsDir, 'onboarding_transcript.txt');
    const v2MemoPath = path.join(outputsDir, 'memo_v2.json');
    const diffPath = path.join(outputsDir, 'changes.md');
    const specV2Path = path.join(outputsDir, 'retell_spec_v2.json');

    try {
        await fs.access(onboardingTranscriptPath);

        const v1Memo = JSON.parse(await fs.readFile(v1MemoPath, 'utf8'));
        const onboardingText = await fs.readFile(onboardingTranscriptPath, 'utf8');

        const extractedUpdates = await extractUpdates(onboardingText);
        console.log("\nExtracted Updates from LLM:\n", JSON.stringify(extractedUpdates, null, 2));

        const { v2Memo, diff } = applyUpdates(v1Memo, extractedUpdates);

        await fs.writeFile(v2MemoPath, JSON.stringify(v2Memo, null, 2));
        console.log(`\nSaved memo_v2.json to ${v2MemoPath}`);

        const mdContent = generateDiffMarkdown(diff);
        await fs.writeFile(diffPath, mdContent);
        console.log(`Saved changes.md to ${diffPath}`);

        const promptString = generateSystemPrompt(v2Memo);
        const specV2 = createRetellSpec("v2", v2Memo, promptString);
        await fs.writeFile(specV2Path, JSON.stringify(specV2, null, 2));
        console.log(`Saved retell_spec_v2.json to ${specV2Path}`);

    } catch (e) {
        console.error("Pipeline Phase 4 failed:", e);
    }
}

if (require.main === module) {
    run();
}