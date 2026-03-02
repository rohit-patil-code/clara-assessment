const fs = require('fs').promises;
const path = require('path');

/**
 * Dynamically generates the system prompt for the Retell agent by injecting
 * the extracted account variables into a strict conversation flow template.
 */
/**
 * Dynamically generates the system prompt for the Retell agent by injecting
 * the extracted account variables into a strict conversation flow template.
 */
function generateSystemPrompt(memo) {
    // Provide fallbacks in case the extraction missed certain fields.
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
 * Reads an Account Memo JSON and maps it to a Retell Agent Spec.
 */
async function generateRetellSpec(memoPath) {
    try {
        // --- 1. Load the Account Memo JSON ---
        const memoContent = await fs.readFile(memoPath, 'utf8');
        const memo = JSON.parse(memoContent);

        console.log(`Loaded Account Memo. Known missing fields: ${memo.questions_or_unknowns?.length || 0}`);

        // --- 2. Generate Prompt ---
        const promptString = generateSystemPrompt(memo);

        // --- 3. Build the Retell Spec Object ---
        const retellSpec = {
            metadata: {
                version: "v1",
                generated_at: new Date().toISOString(),
                status: memo.questions_or_unknowns?.length > 0 ? "needs_human_review" : "ready_for_deployment"
            },
            agent: {
                // Retell specific configurations 
                voice_id: "11labs-rachel", // Example Voice ID
                voice_style: "Professional, empathetic, and urgent",
                agent_name: "Clara Plumbing Agent v1",
                language: "en-US",
                system_prompt: promptString,
                llm_websocket_url: "wss://your-custom-llm-endpoint.com/llm", // Where Retell sends audio streams

                // Key variables mapped from the memo
                agent_variables: {
                    business_hours: memo.business_hours,
                    emergency_definition: memo.emergency_definition,
                    call_transfer_rules: memo.call_transfer_rules
                }
            }
        };

        return retellSpec;

    } catch (error) {
        console.error("Error generating Retell Spec:", error);
        throw error;
    }
}

// --- EXAMPLE USAGE FLOW ---
async function run() {
    const memoPath = path.join(__dirname, '..', 'outputs', 'accounts', 'sample_memo.json');
    const specOutputPath = path.join(__dirname, '..', 'outputs', 'accounts', 'retell_spec_v1.json');

    try {
        // Check if the memo exists first
        await fs.access(memoPath);

        const spec = await generateRetellSpec(memoPath);

        console.log("\n--- Generated Retell Draft Spec ---");
        console.log(JSON.stringify(spec, null, 2));

        // Save the structured JSON
        await fs.writeFile(specOutputPath, JSON.stringify(spec, null, 2));
        console.log(`\nSaved Retell spec to ${specOutputPath}`);

    } catch (e) {
        if (e.code === 'ENOENT') {
            console.log("Error: sample_memo.json not found. Please run extract_memo.js first.");
        } else {
            console.error("Execution stopped due to error.");
        }
    }
}

if (require.main === module) {
    run();
}
