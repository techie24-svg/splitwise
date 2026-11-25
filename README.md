# App Reverse Engineering Workspace

A dedicated workspace for inspecting application architecture, analyzing features without original source code, and reconstructing clean, compatible implementations.

Integrated with **REA (Reverse Engineer Anything)**: [github.com/morluto/rea](https://github.com/morluto/rea).

---

## Workspace Directory Structure

```text
reverse-engineering/
├── targets/       # Place target applications here (APKs, Electron apps, .asar, binaries, WASM)
├── extracted/     # Unpacked bundles, extracted resources, and decompiled assets
├── analysis/      # Architecture notes, dependency graphs, and findings
└── README.md      # This guide
```

---

## Setting Up REA (`morluto/rea`)

### Option A: Agent MCP Setup (Recommended for AI Agents)
Run the setup wizard from a trusted directory outside the target application:
```bash
npx rea-agents setup
```
- Select your AI agent environment (e.g. Gemini CLI / Antigravity / Claude Code / Cursor).
- Approve the configuration plan to register REA's Model Context Protocol (MCP) server.
- Restart the agent session to activate the tools.

### Option B: Global CLI Installation (Terminal Usage)
```bash
npm install --global rea-agents
rea --help
```

---

## Workflow Guide

1. **Place Target**: Place the target application or bundle inside [`targets/`](file:///Users/yagarwal/downloads/gemini%20personal/reverse-engineering/targets).
2. **Inspect & Extract**:
   - For Electron / JavaScript:
     ```bash
     npx -y rea-agents@latest analyze-javascript-application ./targets/<app> --json
     ```
3. **Document Findings**: Store module boundaries, API signatures, and reconstruction notes inside [`analysis/`](file:///Users/yagarwal/downloads/gemini%20personal/reverse-engineering/analysis).
