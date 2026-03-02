# Clara - zero-cost automation pipeline

This project is a zero-cost automation pipeline designed to process call transcripts and generate AI voice agent configurations.

## Project Structure

The repository is organized into specific directories to separate concerns and manage the flow of data through the pipeline:

- **`/inputs`**: This directory is the entry point for raw data. It typically holds incoming call transcripts (e.g., in `.txt`, `.json`, or `.vtt` formats) that are pending processing.
- **`/outputs/accounts`**: This is where the final, generated AI voice agent configurations are stored. They are structured by account name or ID to keep configurations organized for different users or tenants.
- **`/workflows`**: Contains step-by-step workflow definitions. If you are using an orchestrator (like n8n, GitHub Actions, or a custom runner), the JSON/YAML workflow files define the data extraction and transformation sequence here.
- **`/scripts`**: Houses all the utility scripts, parsers, and execution logic (Node.js/Python). For instance, scripts to trigger the pipeline, map transcript text to agent personas, or interface with external APIs belong here.
