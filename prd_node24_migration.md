Handover Protocol: homebridge-vantage-lts Node 24 Upgrade
1. Issue Summary
The plugin homebridge-vantage-lts fails to compile on Node.js v24 (V8 engine v12.9+).

Root Cause: The dependency libxmljs (C++ addon) uses deprecated V8 APIs that have been removed in Node 24 (specifically v8::ObjectTemplate::SetAccessor, v8::String::WriteUtf8, and Nan::MakeCallback).

Current State: The plugin is dead. Attempts to rebuild libxmljs fail with exit code 1 during node-gyp compilation.

Goal: Refactor the codebase to remove the dependency on the legacy libxmljs library and replace it with a modern, compatible XML parser.

2. Target Environment

Deployment: Raspberry Pi (Linux ARM64).

Development: Windows PC (VS Code).

Engine: Node.js v24.13.1 (Strict requirement).

Action Plan for AI Agent
Phase 1: Dependency Replacement

Remove libxmljs: Delete it from package.json and node_modules.

Select Replacement:

Preferred: fast-xml-parser (Pure JavaScript, no compilation required, future-proof).

Alternative: libxmljs2 (Only if a drop-in C++ replacement is strictly necessary, but verify Node 24 support first).

Phase 2: Code Refactoring

Scan Source: Identify all files requiring libxmljs (likely vantage.js or index.js).

Rewrite Parser Logic:

Locate the functions handling XML responses from the Vantage InFusion Controller.

Replace the libxmljs parsing logic (which uses C++ bindings) with standard JS object traversal provided by the new parser.

Note: libxmljs often uses XPath for selection. If moving to fast-xml-parser, you may need to write a small utility to navigate the JSON object structure or use a library that supports XPath-like querying on JSON.

Phase 3: Validation (Windows)

Install & Test: Run npm install on Windows to ensure the new dependencies install without errors.

Mock Test: Create a simple test script passing a sample Vantage XML string to the new parser to verify it extracts the correct data (IDs, Status, etc.).

Phase 4: Build & Deploy

Pack: Create a .tar.gz or push to a private Git repository.

Deploy: Instruct the user on how to transfer this patched version to the Raspberry Pi and install it via hb-service add <path>.