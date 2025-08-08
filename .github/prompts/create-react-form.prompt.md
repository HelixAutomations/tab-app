---
mode: agent
model: auto
tools: ["vscode.search","vscode.workspace","copilot.codeEdits"]
description: Generate a Fluent UI React v9 form component with validation and submit handler.
---

Inputs
- Component name: ${input:name:MyForm}
- Fields (comma-separated): ${input:fields:title:string,description:string}
- Submit path: ${input:submitPath:/api/submit}

Instructions
- Create a functional component in TypeScript using React 18 and Fluent UI v9.
- Build controlled inputs for each field with basic validation.
- Expose `onSubmit` prop; default to POST ${input:submitPath} with axios.
- Include minimal Jest test scaffolding.

Output
- File path suggestion under src/components/${input:name}.tsx
- Component code and test code.
