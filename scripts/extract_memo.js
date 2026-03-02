const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// We are using Cerebras API with the fast Llama 3.1 8B model.
const API_KEY = process.env.API_KEY;
const API_URL = `https://api.cerebras.ai/v1/chat/completions`;

// --- SYSTEM PROMPT TEMPLATE ---
const SYSTEM_PROMPT = `You are a precise operational data extractor. 
Your task is to analyze the provided call transcript and extract operational details into a structured 'Account Memo JSON'.

You MUST extract exactly the following 14 fields:
1. "account_id" (string or null): Generate a simple slug based on the company name if not explicitly provided.
2. "company_name" (string or null): The name of the client's business.
3. "business_hours" (string or null): The stated operating hours including days, start, end, and timezone.
4. "office_address" (string or null): The physical location of the business, if present.
5. "services_supported" (array of strings): A list of services the business offers.
6. "emergency_definition" (array of strings): A list of triggers that the business considers an emergency.
7. "emergency_routing_rules" (string or null): Rules on who to call, the order, and fallbacks for emergencies.
8. "non_emergency_routing_rules" (string or null): How to handle standard service requests.
9. "call_transfer_rules" (string or null): Timeouts, retries, and what to say if a transfer fails.
10. "integration_constraints" (string or null): Specific CRM or software rules (e.g., "never create sprinkler jobs in ServiceTrade").
11. "after_hours_flow_summary" (string or null): A brief summary of what happens when a customer calls after hours.
12. "office_hours_flow_summary" (string or null): A brief summary of what happens when a customer calls during office hours.
13. "questions_or_unknowns" (array of strings): CRITICAL. If any of the above details are missing, ambiguous, or not explicitly stated in the transcript, DO NOT GUESS. Leave the respective field as null/empty, and add a descriptive flag to this array (e.g., "Integration constraints not mentioned").
14. "notes" (string or null): Short additional context or observations.

Return ONLY valid JSON. Do not use markdown formatting blocks like \`\`\`json. The JSON object must have exactly the 14 keys listed above.`;

async function extractAccountMemo(transcriptPath) {
    try {
        // --- 1. READ TRANSCRIPT ---
        const transcriptText = await fs.readFile(transcriptPath, 'utf8');

        // --- 2. PREPARE API PAYLOAD ---
        const payload = {
            model: "llama3.1-8b",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Transcript to analyze:\n${transcriptText}` }
            ],
            response_format: { type: "json_object" }
        };

        // --- 3. CALL LLM API ---
        console.log("Sending transcript to Cerebras API...");
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

        // --- 4. EXTRACT TEXT AND PARSE JSON ---
        const rawOutput = data.choices[0].message.content;
        const accountMemo = JSON.parse(rawOutput);

        console.log("Extraction successful!");
        return accountMemo;

    } catch (error) {
        console.error("Error extracting account memo:", error);
        throw error;
    }
}

// --- EXAMPLE USAGE FLOW ---
async function run() {
    if (!API_KEY) {
        console.warn("\x1b[33m%s\x1b[0m", "WARNING: No API_KEY environment variable found. The API call will fail.");
    }

    const sampleTranscriptPath = path.join(__dirname, '..', 'inputs', 'sample_transcript.txt');

    // Create a dummy transcript in /inputs for testing if it doesn't already exist
    try {
        await fs.access(sampleTranscriptPath);
    } catch {
        const dummyTranscript = "Agent: Thank you for calling Clara Plumbing.\nCaller: What if I have a leak right now, it's flooding!\nAgent: Oh, any active flooding or bursting pipes is considered an emergency. I will transfer you to our on-call technician immediately.";
        await fs.writeFile(sampleTranscriptPath, dummyTranscript);
        console.log("Created dummy transcript for testing at:", sampleTranscriptPath);
    }

    try {
        const memo = await extractAccountMemo(sampleTranscriptPath);

        console.log("\n--- Extracted Account Memo ---");
        console.log(JSON.stringify(memo, null, 2));

        // Save the structured JSON to the /outputs/accounts folder
        const outputPath = path.join(__dirname, '..', 'outputs', 'accounts', 'sample_memo.json');
        await fs.writeFile(outputPath, JSON.stringify(memo, null, 2));
        console.log(`\nSaved memo to ${outputPath}`);
    } catch (e) {
        console.log("\nExecution stopped due to error.");
    }
}

if (require.main === module) {
    run();
}