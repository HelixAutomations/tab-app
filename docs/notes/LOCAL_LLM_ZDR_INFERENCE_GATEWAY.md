# Local LLM ZDR Inference Gateway

> Purpose: active focus brief for replacing paused privileged Azure OpenAI processing with Helix-controlled local inference.
>
> Verified: 2026-06-02 against branch `main`. Re-verify file refs if picked up after 2026-07-02.

---

## 1. Why this exists (user intent)

The current focus is to resume the paused AI processing in tab-app without sending privileged client material to Azure OpenAI or any third-party model endpoint.

User intent, verbatim: "without using azure open ai which still uses gpt and claude servers to process, i want to stand up a helix vm and run a local llm there, nothing goes out, thatll work right?" The practical interpretation is: stand up a Helix-owned Azure VM running a local LLM, lock the network so prompts and outputs do not leave Helix-controlled Azure infrastructure, then point the paused CCL and Attendance Note flows at that endpoint.

Important correction: Azure OpenAI is GPT-family models via Azure, not Claude. The concern still stands: it is a managed external model service from Helix's privilege and retention perspective. This brief is about removing that dependency for privileged auto-ingested material.

---

## 2. Current state - verified findings

### 2.1 CCL is paused outside localhost

- [server/server.js](../../server/server.js#L212-L239) defines `guardCclOperations`, tracks `CCL.Operations.Disabled.Blocked`, and returns `403` with code `CCL_DISABLED` for `/api/ccl`, `/api/ccl-ai`, `/api/ccl-admin`, `/api/ccl-ops`, `/ccls`, and `/api/ccl-date` unless the request host is localhost.
- [server/index.js](../../server/index.js#L765-L815) has the same production server guard, also covering `/api/ccl-dry-run`; [server/index.js](../../server/index.js#L905-L988) mounts `/api/ccl-date` and `/ccls` through the same guard.
- [src/app/admin.ts](../../src/app/admin.ts#L8-L24) documents the ZDR/LPP containment position and makes `isCclOperationsAvailable()` return true only for localhost unless `viewAsProd` is false.
- [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts#L1-L24) routes CCL client calls to `http://localhost:8080` when the frontend is on local port 3000, otherwise same-origin.
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx#L999-L1001) explicitly notes that hosted environments do not call CCL because CCL is local-only under the ZDR/LPP containment gate.

### 2.2 Attendance Note AI is paused by default, gated to local or LZ

- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js#L2203-L2232) states the LPP/confidentiality rule: AI generation only runs locally, or in production for LZ. Non-allowlisted hosted callers get `403` with code `AI_DISABLED` before the call transcript is sent to `chatCompletion`.
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js#L2249-L2330) builds the full legal attendance-note prompt from `dubber_transcript_sentences`, recording metadata, and the team roster, then calls `chatCompletion(systemPrompt, userPrompt, { temperature: 0.3 })`.
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L842-L879) makes AI Assist available only for localhost or LZ, persists the toggle per user, and emits `Dubber.AttendanceNote.AiAssist.Toggled`.
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx#L1519-L1577) skips the attendance-note POST when AI Assist is off and falls back to manual intake if the server returns `AI_DISABLED`.
- [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L115-L120) defines the AI Assist props; [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx#L1318-L1331) renders the AI Assist pill and describes the off state as "Transcript is not sent to the AI."

### 2.3 The shared AI client is Azure OpenAI

- [server/utils/aiClient.js](../../server/utils/aiClient.js#L1-L23) is the central Azure OpenAI client. It uses `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `azure-openai-api-key` from Key Vault/env.
- [server/utils/aiClient.js](../../server/utils/aiClient.js#L28-L58) constructs an `AzureOpenAI` SDK client and tracks `AI.Client.Initialised`.
- [server/utils/aiClient.js](../../server/utils/aiClient.js#L87-L120) sends `systemPrompt` and `userPrompt` to the Azure deployment through `chatCompletion`.
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js#L2-L14) describes CCL AI Fill as Azure OpenAI backed and imports `chatCompletion`, `chatCompletionStream`, and `DEPLOYMENT` from `aiClient`.
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js#L1191-L1224) exposes `/api/ccl-ai/fill`; [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js#L1582-L1914) exposes pressure-test logic and calls `chatCompletion` for verification.

### 2.4 What is paused in tab-app

- CCL AI fill, CCL pressure-test/Safety Net, generated CCL document/static routes, CCL date tools, Home To Do CCL cards, and matter-opening handoff into CCL.
- Attendance Note/Telephone Note automatic AI generation from Dubber call transcripts. Manual note filing, Clio activity/communication legs, NetDocs upload, and save paths remain live.

### 2.5 Existing Azure Instructions VNet posture

Verified 2026-05-29 by read-only Azure CLI and Azure Advisor checks in tenant `Helix Law Ltd`, subscription `Helix Automations`, resource group `Instructions`, region `uksouth`. No Azure resources were changed. Azure CLI prompts to install the `azure-firewall` and `bastion` extensions were declined.

Current network shell:

- VNet: `instructions_vnet` with address space `192.168.0.0/16`.
- The original card-data-grade shape is still visible: firewall, Bastion, app integration, function integration, private endpoint, key, database, APIM-shaped, and deployment subnets all exist.
- The enforcement layer has been relaxed in places. Do not assume the VNet alone means private or no-egress behaviour.

Subnets observed:

| Subnet | CIDR | Observed role |
|---|---:|---|
| `AzureFirewallSubnet` | `192.168.0.0/26` | Reserved for Azure Firewall, but only a public IP named `instructions_vnet-firewall` was found. No Azure Firewall resource was confirmed. |
| `FunctionPrivateEndpoint` | `192.168.0.64/27` | Function private endpoint area. Contains `functions-instructions-pe`, which is disconnected. |
| `FunctionConnectedEndpoint` | `192.168.0.96/27` | Private endpoints for `instructionfunctions` storage blob/file/queue/table. |
| `AzureBastionSubnet` | `192.168.0.128/26` | Reserved for Bastion. No Bastion host resource was confirmed because the CLI wanted to install the Bastion extension. |
| `DeploymentSubnet` | `192.168.0.192/27` | Contains `vm-instructions-cli`, a deallocated Linux `Standard_B1s` VM with private IP only. |
| `AppSubnet` | `192.168.1.0/24` | Legacy or currently unused from this pass. |
| `FunctionSubnet` | `192.168.2.0/24` | Legacy or currently unused from this pass. |
| `KeySubnet` | `192.168.3.0/24` | Key Vault private endpoint subnet. Has `nsg-keyvault-protect`, but the NSG has no explicit rules. |
| `DatabaseSubnet` | `192.168.4.0/24` | Database-shaped subnet. Has `nsg-database-protect`, but the SQL private endpoint is currently in `AppPrivateEndpoint`, not here. |
| `AppPrivateEndpoint` | `192.168.5.0/27` | Web app, SQL, and blob private endpoints. UDR attached but empty. |
| `AppIntegrationSubnet` | `192.168.5.32/27` | Delegated to `Microsoft.Web/serverfarms`. Used by most Instructions App Services for regional VNet integration. |
| `FunctionIntegrationSubnet` | `192.168.6.0/27` | Delegated to `Microsoft.Web/serverFarms`. Used by `instructions-vnet-functions`. |
| `ApimPrivateEndpoint` | `192.168.7.128/27` | APIM-shaped subnet. No APIM private endpoint target was confirmed. |

Private endpoints and DNS:

- Private DNS zones are linked to `instructions_vnet` for `privatelink.azurewebsites.net`, `privatelink.vaultcore.azure.net`, `privatelink.database.windows.net`, `privatelink.blob.core.windows.net`, `privatelink.file.core.windows.net`, `privatelink.queue.core.windows.net`, `privatelink.table.core.windows.net`, and `privatelink.azure-api.net`.
- Approved private endpoints exist for `instruct-helix-law`, `instruct-helixlaw-pitch`, `instruct-helixlaw-consult`, `instruct-helixlaw-invoice`, `instruct-helixlaw-payments`, `helixlaw-instructions` Key Vault, `instructionfunctions` storage blob/file/queue/table, `instructionfiles` blob, and the `instructions` SQL server.
- `functions-instructions-pe` targets `instructions-helix-law` and reports `Disconnected`; treat it as stale or broken until rechecked.

App Service and Function integration:

- Instructions App Service plan `instruct-helix-law` is `P1v3` / `PremiumV3` with 3 workers.
- `instruct-helix-law`, `instruct-helixlaw-pitch`, `instruct-helixlaw-consult`, `instruct-helixlaw-invoice`, and `instruct-helixlaw-payments` are integrated with `AppIntegrationSubnet`.
- `helixlaw-enquiry-processing` is in the `Instructions` resource group but has no VNet integration from this pass.
- `instructions-vnet-functions` is running and integrated with `FunctionIntegrationSubnet`.
- `instructions-functions` is stopped and has no VNet integration.
- Current Hub App Service `link-hub-v1` lives in resource group `Main`, runs on `link-hub-service-v1` (`P1v3` / `PremiumV3`), has public network access enabled, and has no VNet integration. Hub cannot directly call a private-only inference VM yet.

Lowered walls and obvious gaps:

- SQL server `instructions` has `publicNetworkAccess: Enabled`, `AllowAllWindowsAzureIps`, a broad `local-dev` firewall rule from `0.0.0.0` to `255.255.255.255`, and many ad hoc single-IP rules. This is the clearest mismatch with the private endpoint design.
- Key Vault queries showed `helixlaw-instructions` and `kv-helix-aiden` with no active network ACLs from the CLI output. Advisor also flagged Key Vault firewall and diagnostic logging issues, and flagged `kv-helix-aiden` for missing Private Link and deletion protection.
- Storage posture is mixed. `instructionfunctions` has public network access disabled. `instructionfiles`, `instructionfunctionapps`, and `instructions8c44` have public network access enabled with default action `Allow`; `instructionfiles` allows shared key access.
- `instructions-function-natgateway` exists with public IP `instructions-function-nat-ip`, but every subnet inspected showed `nat: null`. Treat the NAT gateway as unused until proven otherwise.
- `instructions-private-routing-udr` exists and is attached to some subnets, but contains no routes. It does not force egress through a firewall or blackhole.
- `nsg-keyvault-protect`, `nsg-database-protect`, and `nsg-apim-allow` have no explicit rules. `nsg-functionintegration-egress` has one inbound allow from `20.90.134.42/32` to `443`, but was not attached to the subnets inspected.
- App Service access restrictions are inconsistent: most Instructions apps and SCM endpoints allow `Any`; `instruct-helixlaw-consult` has a public ingress restriction to a single IP but SCM still allows `Any`.
- Advisor also flagged SQL public network access, lack of Azure Firewall protection for the VNet, storage network/shared-key posture, App Service diagnostics/health checks/managed identity, NAT zone redundancy, and VM guest/backup/update/security posture.

How the local inference VM should fit this setup:

- Do not reuse `DeploymentSubnet` for the GPU inference VM. It currently holds the old deallocated CLI VM and is too small/ambiguous as an operational landing zone.
- Do not place the GPU VM in any private endpoint subnet. Private endpoint subnets should stay reserved for Private Link NICs.
- Create a dedicated `InferenceSubnet`, preferably `/27` or `/26` inside `192.168.0.0/16`, for GPU inference NICs.
- Put the GPU VM in `InferenceSubnet` with no public IP. Add an NSG that allows inbound only from a Hub VNet integration subnet and, if needed, `FunctionIntegrationSubnet` or `AppIntegrationSubnet`.
- Add Hub regional VNet integration using a new delegated subnet rather than reusing the existing `AppIntegrationSubnet`, which is already serving the Instructions App Service plan.
- Preferred path: Hub App Service calls the VM private IP/private DNS name directly over the VNet.
- Fallback path: use `instructions-vnet-functions` as a private bridge only if direct Hub VNet integration is blocked. This is less clean for privileged prompts unless Function ingress, auth, and logging are locked down.
- Add private DNS for the inference endpoint, for example `llm.instructions.internal`, or use a stable private IP at first. Do not expose vLLM publicly.
- Do not rely on the existing firewall/NAT/UDR resources for egress control until they are explicitly wired and verified. For the ZDR claim, egress control must be designed and tested as part of Phase A.

### 2.6 Cost envelope and commit gate

Live Azure retail pricing checked 2026-06-02 for UK South. Treat these as planning figures, not approval to deploy.

| Item | Approx cost | Use |
|---|---:|---|
| `Standard_NC4as_T4_v3` Linux VM | GBP 0.458/hour, about GBP 335/month 24/7 | Smallest sensible GPU POC. |
| `Standard_NC8as_T4_v3` Linux VM | GBP 0.656/hour, about GBP 479/month 24/7 | Preferred POC headroom if quota allows. |
| `Standard_NC16as_T4_v3` Linux VM | GBP 1.050/hour, about GBP 766/month 24/7 | Stronger small-model serving. |
| `Standard_NC24ads_A100_v4` Linux VM | GBP 3.421/hour, about GBP 2,497/month 24/7 | Defer unless T4 model quality fails. |
| Premium SSD P30 LRS | about GBP 122/month plus mount charge | Default model/data disk for POC. |
| Premium SSD P40 LRS | about GBP 234/month plus mount charge | Larger model cache only if needed. |
| Azure Bastion Basic | about GBP 103/month 24/7 | Private admin path if no existing Bastion is available. |
| Azure Bastion Standard | about GBP 158/month 24/7 | Private admin path with stronger operational features. |

Commit gate before spend:

- Check GPU family quota in UK South and one fallback UK/nearby region.
- Confirm whether an existing Bastion host can be used; do not create a duplicate private admin cost by default.
- Decide POC run pattern: deallocate outside testing by default. Compute stops charging when deallocated, but disk and Bastion continue.
- Start with NC4 or NC8 T4 plus P30 unless a model-quality reason justifies a larger SKU.
- Record the chosen SKU, expected monthly ceiling, and stop/deallocate owner in System > Infrastructure before provisioning.

---

## 3. Plan

### Phase 0 - Foundation and visibility before cloud commitment

Goal: make the proposed inference estate visible, cost-bounded, and auditable inside Hub before any privileged flow is re-enabled.

| # | Change | File | Detail |
|---|--------|------|--------|
| F0 | Add proposed inference landing zone to System > Infrastructure | [src/tabs/roadmap/system/SystemInfrastructureView.tsx](../../src/tabs/roadmap/system/SystemInfrastructureView.tsx), future planned-state manifest `src/tabs/roadmap/system/data/localInferencePlan.json` | Add a planned-state panel/card for `local-llm-zdr-inference-gateway`: target RG/VNet/subnet, chosen VM SKU, disk, Bastion/access path, expected cost ceiling, and current status. Do not present it as deployed until Azure inventory confirms resources. |
| F1 | Add ZDR/LPP proof checklist | System infrastructure planned-state data or companion manifest | Show blockers: no public IP, private route from Hub, outbound locked after setup, no prompt/output logs, model licence recorded, manual fallback if unhealthy. |
| F2 | Add cost and stop/deallocate controls to the plan | System infrastructure planned-state data or companion manifest | Surface monthly estimate, run pattern, stop owner, and whether the VM should be deallocated outside tests. |
| F3 | Add admin access/audit model | System infrastructure planned-state data or companion manifest | Document Bastion or jump path, Entra user identity, VM auth/sudo logs, and the fact that IP alone is not the identity control. |
| F4 | Keep implementation blocked behind capability health | [server/utils/aiClient.js](../../server/utils/aiClient.js) or new gateway | No privileged hosted route should switch on until provider capability says local, private, healthy, and content-free telemetry only. |

Phase 0 acceptance:

- System > Infrastructure has a visible planned local inference entry before resources are created.
- The entry distinguishes planned, provisioning, healthy, degraded, and blocked states.
- Cost ceiling and deallocation rule are visible to the operator.
- The ZDR/LPP proof checklist is visible and starts blocked by default.
- No CCL or Attendance Note hosted flow is re-enabled by this phase.

### Phase A - Private local inference service POC

Goal: prove Helix can run a local LLM endpoint on Helix-controlled Azure infrastructure without prompt/output egress.

| # | Change | File | Detail |
|---|--------|------|--------|
| A0 | Confirm Azure network landing zone | Infra/runbook | Use `Instructions` RG and `instructions_vnet` unless a cleaner dedicated RG is approved. Add a new `InferenceSubnet`; do not reuse private endpoint subnets or `DeploymentSubnet`. |
| A1 | Provision locked-down GPU VM | Infra/runbook | Ubuntu N-series VM, private IP only, no public IP, NSG allows inference traffic only from Hub's private route and optional trusted bridge subnets. |
| A2 | Run local OpenAI-compatible server | VM | Prefer `vLLM` for server workloads. `Ollama` is acceptable for first smoke but less ideal for multi-user production serving. |
| A3 | Add internal inference gateway config | `server/utils/aiClient.js` or new `server/utils/localAiClient.js` | Introduce `HELIX_LOCAL_LLM_BASE_URL`, `HELIX_LOCAL_LLM_MODEL`, `HELIX_AI_PROVIDER=azure-openai|local-llm`. Do not remove Azure path yet. |
| A4 | Add no-content telemetry contract | `server/utils/aiClient.js` / new gateway | Track route, provider, model, duration, token counts, status. Never log prompt text, transcript text, CCL facts, or completions. |

Phase A acceptance:
- A server-side smoke can call the private endpoint from the app service/network and receive JSON.
- Hub has either direct VNet integration to the inference subnet or an explicitly approved private bridge through `instructions-vnet-functions`.
- VM cannot be reached publicly.
- VM cannot make arbitrary outbound internet calls after setup mode is closed. Existing NAT/UDR/firewall-looking resources are not accepted as proof unless they are wired and tested.
- App logs prove calls happened without storing prompt/output content.

### Phase B - Re-enable Attendance Note through local inference only

Goal: use the lower-risk surface first because it already has manual fallback.

| # | Change | File | Detail |
|---|--------|------|--------|
| B1 | Provider gate | [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) | Replace `AI_ATTENDANCE_ALLOWLIST` as the primary production blocker with "local provider healthy and private". Keep allowlist as an override during rollout. |
| B2 | Fail closed | [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) | If local LLM health fails, return structured disabled/unavailable response and keep manual intake. |
| B3 | UI copy | [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx), [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) | Change tooltip/copy from generic AI Assist to private Helix AI Assist once the local endpoint is active. |
| B4 | Smoke path | server ops check catalog or Activity tab | Add an operator-visible check: local inference health, provider, model, no public endpoint, last successful attendance-note generation. |

Phase B acceptance:
- Non-LZ production users can generate attendance notes only when `HELIX_AI_PROVIDER=local-llm` and health is green.
- If the VM is down or public network posture is not proven, the UI remains manual.
- No transcript content appears in App Insights, ops logs, form submissions, or browser telemetry.

### Phase C - Re-enable CCL through local inference only

Goal: re-open CCL once model quality and data controls are proven on Attendance Note.

| # | Change | File | Detail |
|---|--------|------|--------|
| C1 | Split the guard | [server/server.js](../../server/server.js), [server/index.js](../../server/index.js) | Replace localhost-only `guardCclOperations` with provider-aware guard: allow hosted CCL only when local LLM provider is active, healthy, and marked private. |
| C2 | Client visibility | [src/app/admin.ts](../../src/app/admin.ts), [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx), [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) | Surface CCL again only when server capability says local privileged AI is available. Do not rely only on hostname. |
| C3 | Matter-opening handoff | [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts), [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx), [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx), [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx) | Re-enable CCL handoff after matter open only when local privileged AI is healthy. |
| C4 | CCL AI routes | [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) | Route fill, streaming fill, context preview, and pressure-test through the local provider when privileged mode is active. Keep fallback disabled for privileged flows. |

Phase C acceptance:
- CCL hosted flow never calls Azure OpenAI for privileged matter content.
- CCL routes fail closed with an explicit reason if local inference is not private/healthy.
- Matter opening can complete without CCL if local inference is unavailable.

---

## 4. Step-by-step execution order

1. Add the planned local inference entry to System > Infrastructure and keep it in `planned` or `blocked` state until cloud evidence exists.
2. Check GPU quota and confirm whether existing Bastion/private admin access can be reused.
3. Pick a model/licence candidate and target VM family. Default: start with NC4 or NC8 T4 for Attendance Note POC, then test larger models for CCL quality only if needed.
4. Create or plan a dedicated `InferenceSubnet` in `instructions_vnet`. Keep private endpoint subnets and `DeploymentSubnet` out of scope for inference hosting.
5. Add Hub private connectivity. Default: VNet integrate `link-hub-v1` from `Main` into `instructions_vnet` through a new delegated subnet. Alternative: use `instructions-vnet-functions` as a private bridge only if direct integration is blocked.
6. Provision VM and private networking manually or with IaC. No public IP. Private subnet only. Deny outbound by default after setup.
7. Install NVIDIA drivers/CUDA using Azure-supported N-series guidance, then run `vLLM` with an OpenAI-compatible `/v1/chat/completions` endpoint bound to private IP only.
8. Add a server-side local inference gateway with strict no-content logging.
9. Add health/capability endpoint consumed by tab-app server/UI. Capability must say `provider=local-llm`, `private=true`, `healthy=true`, and model name.
10. Wire Attendance Note to the gateway first. Verify manual fallback and no-content telemetry.
11. Only after Attendance Note quality and controls are proven, split the CCL guard and re-enable CCL routes in hosted environments.
12. Add changelog entries per shipped phase.

---

## 5. Verification checklist

Phase 0:
- [ ] System > Infrastructure shows a planned local inference entry with status, target network, cost envelope, access model, and proof checklist.
- [ ] Planned entry is visibly separate from deployed Azure inventory until Resource Graph confirms the resources exist.
- [ ] GPU quota has been checked for the chosen family and region before provisioning.
- [ ] Existing Bastion/private access has been checked before adding a new Bastion cost.
- [ ] Cost ceiling and deallocation owner are recorded before VM creation.
- [ ] ZDR/LPP checklist starts blocked and cannot be marked healthy without route, egress, logging, and model-licence evidence.

Phase A:
- [ ] `InferenceSubnet` exists or is planned, and is separate from `DeploymentSubnet`, private endpoint subnets, and App/Function integration subnets.
- [ ] Hub has a proven private route to the local LLM endpoint, or an explicitly approved bridge through `instructions-vnet-functions`.
- [ ] VM has no public IP and NSG denies public inbound.
- [ ] Local LLM endpoint is reachable only from approved private network sources.
- [ ] Outbound internet is blocked after setup, or restricted to an explicit allowlist with change control.
- [ ] `curl` from app network succeeds against private endpoint; external `curl` fails.
- [ ] Existing `instructions` SQL, Key Vault, storage, NAT, route table, and firewall gaps are either remediated or explicitly documented as out of scope for the inference POC. Do not use them as evidence of no-egress without verification.
- [ ] Logs show provider/model/duration/status only, with no prompt/output content.

Phase B:
- [ ] Attendance Note generation works for a non-LZ production user only when local provider health is green.
- [ ] Turning AI Assist off never posts the transcript to `/attendance-note`.
- [ ] Local provider outage returns manual fallback, not Azure fallback.
- [ ] App Insights events include started/completed/failed without transcript text.

Phase C:
- [ ] `/api/ccl-ai/fill`, `/api/ccl-ai/pressure-test`, `/api/ccl`, `/api/ccl-date`, and `/ccls` remain blocked unless local privileged AI capability is healthy.
- [ ] Hosted CCL calls use local provider only. No Azure OpenAI call path for privileged CCL payloads.
- [ ] Matter-opening handoff into CCL resumes only when the local provider is available; otherwise matter opening still completes.
- [ ] Home To Do CCL cards and Operations Dashboard CCL controls are visible only when the server capability permits them.

---

## 6. Open decisions (defaults proposed)

1. Model/runtime: Default `vLLM` with an OpenAI-compatible API. Rationale: easiest server-side swap for existing chat-completion calls and better production serving than a desktop-oriented runtime.
2. Azure shape: Default single private GPU VM for POC. Rationale: simplest operationally. Move to VMSS only if concurrency/availability requires it.
3. First re-enabled flow: Default Attendance Note before CCL. Rationale: existing manual fallback, smaller blast radius, and easier quality evaluation.
4. Legal/security sign-off gate: Default fail closed until network, logging, model licence, and retention posture are documented. Rationale: the whole point is ZDR/LPP containment.
5. Fallback behaviour: Default no Azure OpenAI fallback for privileged flows. Rationale: fallback would silently recreate the original risk.
6. Hub connectivity: Default direct Hub App Service VNet integration to `instructions_vnet` using a new delegated subnet. Use `instructions-vnet-functions` as a bridge only if direct integration cannot be made cleanly.
7. Inference subnet: Default new `InferenceSubnet`, not `DeploymentSubnet`. Rationale: the existing CLI VM subnet is a deployment/ops leftover, not a clean production inference boundary.
8. Network cleanup sequencing: Default do only the minimum network work needed for private inference first, but track SQL/Key Vault/storage/firewall/NAT/UDR cleanup as separate hardening before claiming the whole Instructions estate is locked down.

---

## 7. Out of scope

- Re-enabling Pitch Builder or communication pressure-test. They were not part of the pause.
- Sending privileged CCL or transcript content to Azure OpenAI, OpenAI, Anthropic, Claude, or any external inference API.
- On-prem hardware. This brief assumes Helix-controlled Azure VM is acceptable for the legal posture.
- Training or fine-tuning on client data. Inference only.
- Broad AI refactor for non-privileged helpers such as comms framework, forms AI, or prompt coach.

---

## 8. File index (single source of truth)

Client:
- [src/tabs/roadmap/system/SystemInfrastructureView.tsx](../../src/tabs/roadmap/system/SystemInfrastructureView.tsx) - System > Infrastructure home for planned/deployed inference estate visibility.
- [src/tabs/roadmap/system/data/azureInfrastructureEnrichment.json](../../src/tabs/roadmap/system/data/azureInfrastructureEnrichment.json) - current Azure inventory/cost data feeding the Infrastructure view; do not hand-edit planned resources into this generated current-state file.
- Future planned-state manifest `src/tabs/roadmap/system/data/localInferencePlan.json` - proposed local inference estate, cost ceiling, proof checklist, and rollout state before Azure resources exist.
- [src/tabs/roadmap/Roadmap.tsx](../../src/tabs/roadmap/Roadmap.tsx) - System navigation and Infrastructure entry point.
- [src/app/admin.ts](../../src/app/admin.ts) - CCL capability and visibility gate.
- [src/components/modern/OperationsDashboard.tsx](../../src/components/modern/OperationsDashboard.tsx) - CCL lifecycle visibility and actions.
- [src/tabs/home/Home.tsx](../../src/tabs/home/Home.tsx) - Home To Do CCL cards and call-filing surface.
- [src/components/modern/CallsAndNotes.tsx](../../src/components/modern/CallsAndNotes.tsx) - AI Assist availability, manual fallback, attendance-note POST.
- [src/components/modern/AttendanceNoteBox.tsx](../../src/components/modern/AttendanceNoteBox.tsx) - AI Assist pill/copy and manual note UI.
- [src/tabs/matters/ccl/cclAiService.ts](../../src/tabs/matters/ccl/cclAiService.ts) - client CCL API base helper.
- [src/tabs/instructions/MatterOpening/processingActions.ts](../../src/tabs/instructions/MatterOpening/processingActions.ts) - matter-opening CCL steps.
- [src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx](../../src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx) - matter-opening hosted CCL skip.
- [src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx](../../src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx) - matter-opening CCL behaviour.
- [src/components/modern/matter-opening/MatterOpenedHandoff.tsx](../../src/components/modern/matter-opening/MatterOpenedHandoff.tsx) - opened matter handoff messaging/actions.

Server:
- [server/utils/aiClient.js](../../server/utils/aiClient.js) - current Azure OpenAI client, likely provider switch point.
- [server/routes/ccl-ai.js](../../server/routes/ccl-ai.js) - CCL fill, stream, context, pressure-test AI routes.
- [server/routes/dubberCalls.js](../../server/routes/dubberCalls.js) - attendance-note transcript prompt and server gate.
- [server/server.js](../../server/server.js) - local dev server CCL guard.
- [server/index.js](../../server/index.js) - production server CCL guard and route mounts.
- [server/routes/matterRequests.js](../../server/routes/matterRequests.js) - CCL/matter-opening request interactions called out by the original pause.

Scripts / docs:
- [logs/changelog.md](../../logs/changelog.md) - add one entry per shipped phase.
- Future infra/runbook path TBD - VM provisioning, driver install, local LLM runtime, network controls.

### Stash metadata (REQUIRED - used by `check stash overlap`)

```yaml
# Stash metadata
id: local-llm-zdr-inference-gateway
verified: 2026-06-02
branch: main
touches:
  client:
    - src/tabs/roadmap/system/SystemInfrastructureView.tsx
    - src/tabs/roadmap/system/data/azureInfrastructureEnrichment.json
    - src/tabs/roadmap/system/data/localInferencePlan.json
    - src/tabs/roadmap/Roadmap.tsx
    - src/app/admin.ts
    - src/components/modern/OperationsDashboard.tsx
    - src/tabs/home/Home.tsx
    - src/components/modern/CallsAndNotes.tsx
    - src/components/modern/AttendanceNoteBox.tsx
    - src/tabs/matters/ccl/cclAiService.ts
    - src/tabs/instructions/MatterOpening/processingActions.ts
    - src/tabs/instructions/MatterOpening/CompactMatterWizard.tsx
    - src/tabs/instructions/MatterOpening/FlatMatterOpening.tsx
    - src/components/modern/matter-opening/MatterOpenedHandoff.tsx
  server:
    - server/utils/aiClient.js
    - server/routes/ccl-ai.js
    - server/routes/dubberCalls.js
    - server/server.js
    - server/index.js
    - server/routes/matterRequests.js
  submodules: []
depends_on: []
coordinates_with:
  - activity-route-live-checks-and-prod-parity-surface
  - activity-testing-security-and-operational-visibility-control-plane
  - agent-ratings-and-reminders-system
  - agent-suggestions-inbox-in-my-helix
  - app-wide-ux-improvement-proof-programme
  - b1-operator-actions-surface-first-class-one-offs-in-app
  - call-centre-external-attendance-note-and-clio-mirror
  - ccl-dev-diff-harness-colleague-feedback-loop-tbd
  - ccl-first-wrap-upload-confirmation-docx-fidelity-prompt-and-model-refresh
  - ccl-legal-document-production-hardening
  - ccl-prompt-feedback-loop-self-driving-template-improvement
  - ccl-review-action-extraction
  - ccl-review-wrap-up-pipeline-toasting-field-rail-ia-redesign-non-flagged-pt-bug-docx-fidelity-audit
  - chat-tab-removal-retain-infra
  - clio-token-refresh-architecture-audit
  - clio-token-refresh-shared-primitive
  - clio-webhook-reconciliation-and-selective-rollout
  - compactmatterwizard-split-by-wizardmode
  - company-watch-companies-house-follows-user-notifications-and-message-carry-forward
  - database-index-and-dual-db-audit
  - demo-console-unify-demo-mode-rehearsal-record-and-walkthrough-into-one-premium-surface
  - dev-loop-cold-boot-performance-overhaul
  - direct-referral-onboarding-and-pitch-link-activation
  - docs-transfer-review-ccl-review-fixes
  - forge-control-room-with-asana-mirror-and-system-tab-library-and-comms
  - forms-ia-ld-undertaking-complaint-flow
  - forms-preflight-matrix-in-activity-tab
  - forms-stream-persistence
  - function-retirement-phase-2-d-and-e-transactionapprovalpopup-and-mattersreport-cleanup
  - google-ads-reports-purposeful-clarity-sourcing-and-stored-metric-table
  - helix-rehearsal-record-luke-test-as-firm-seed
  - helix-software-dev-productivity-control-plane
  - home-animation-order-and-demo-insert-fidelity
  - home-skeletons-aligned-cascade
  - home-todo-god-view-lz-can-see-firm-wide-with-filter-back-to-mine
  - home-todo-single-pickup-surface
  - hub-first-projects-brief-asana-link-dev-god-mode-reorder-audit-notes
  - hub-rollout-training-and-confidence-recovery
  - hub-system-errors-repair-queue
  - management-dashboard-trust-gate
  - operationsdashboard-carve-up-by-section
  - operator-god-mode-system-tab-pressure-release-valve
  - ppc-report-does-paid-acquisition-actually-pay
  - quick-actions-rework-empty-state
  - realtime-delta-merge-upgrade
  - realtime-multi-replica-safety
  - reception-kpis-direct-db-tap
  - reception-performance-kpi-dashboard
  - reporting-trust-and-ops-visibility
  - resources-hub-forms-pattern-rebuild
  - resources-tab-restructure-with-templates-section
  - retire-helix-keys-proxy-and-add-form-route-preflight
  - risk-assessment-and-proof-of-id-clio-upload-plus-home-to-do-evidence-card
  - server-mail-send-helper-extraction
  - session-probing-activity-tab-visibility-and-persistence
  - staging-walkthrough-call-2026-05-11-to-do-strip-realtime-focus-plus-parked-items
  - system-data-sync-visibility
  - system-errors-triage-revamp
  - to-do-confidence-reveal-one-at-a-time-demo-parity-predictable-redirects-completion-state-updates
  - ui-responsiveness-hover-scroll-and-tab-navigation
  - unified-overview-surface-for-prospects-and-matters
  - userbubble-and-private-hub-tools-control-consolidation-and-sort
  - ux-realtime-navigation-programme
  - vault-room-developer-hygiene-hmr-dev-performance-and-ai-clutter-guardrails
  - workspace-header-amalgamation
conflicts_with: []
```

---

## 9. Gotchas appendix

- Treat System > Infrastructure as the operator's map for this project. It should show planned and blocked state before Azure resources exist, then reconcile to Resource Graph once they do.
- Do not bury the cost model in chat only. The chosen GPU SKU, disk, Bastion decision, monthly ceiling, and deallocation rule belong in the infrastructure surface before provisioning.
- Do not let a private VM become a new black box. The Hub surface needs model, provider, health, route, last success/failure, and proof checklist status without storing prompt or output content.
- The current pause has two layers: server hard guards and client visibility gates. Re-enabling only the server routes will still leave hosted UI hidden or inert.
- Do not make `isCclOperationsAvailable()` trust the browser hostname alone for the future hosted state. It should consume a server capability/health answer so users do not see CCL controls when the local model is unhealthy.
- Attendance Note is the safer first slice because the manual path already exists and is the default. CCL has a wider blast radius across matter opening, Home To Do, generated documents, and review rails.
- Do not implement Azure OpenAI fallback for privileged payloads. Fallback must remain manual/blocked, otherwise an outage would silently reintroduce the ZDR/LPP risk.
- Network posture is part of the feature, not deployment detail. "Nothing goes out" requires NSG/Azure Firewall/private endpoint controls plus log discipline.
- The Instructions VNet exists, but current posture is mixed. SQL public access, storage public access, empty UDRs, unused NAT, empty NSGs, and missing Hub VNet integration mean the old VNet cannot be treated as a sealed boundary without further work.
- `link-hub-v1` is currently outside the Instructions VNet. Any implementation that only creates a private VM will fail unless Hub gets private connectivity or a deliberately secured bridge.
- The CLI VM `vm-instructions-cli` is deallocated, private-only, and small (`Standard_B1s`). It is useful as historical evidence of the old deployment shape, not as the inference host.
- The broad SQL firewall rule named `local-dev` is an obvious security cleanup candidate, but do not remove it during the inference work without an explicit production access plan and approval.