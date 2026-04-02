const stageContent = {
  capture: {
    title: "Stage 1: Capture and qualify",
    copy:
      "Enquiries land, route into Teams, and appear in the operational queue. The system should immediately make clear who owns the enquiry, what the next action is, and how ready it is to progress.",
    points: [
      "Unify intake semantics across the whole product.",
      "Make claim, stage, and ownership state obvious in one place.",
      "Reduce friction between Teams notifications and Hub actions.",
    ],
  },
  hub: {
    title: "Stage 2: Operate the lifecycle",
    copy:
      "Helix Hub is the operational core. It should let staff move from prospect to instruction to matter without losing context, duplicating state, or hunting for the real source of truth.",
    points: [
      "Treat prospects, compliance, and matter progression as one flow.",
      "Make internal actions feel like edits to a shared operational graph.",
      "Surface freshness, responsibility, and next action together.",
    ],
  },
  portal: {
    title: "Stage 3: Carry the client through",
    copy:
      "The client-facing experience should feel like a continuation of the same system. Internal decisions in Hub should shape what the client sees next, not force manual translation.",
    points: [
      "Use shared lifecycle state across onboarding, payment, and matter portal views.",
      "Turn Current Snapshot and checklist state into deliberate product surfaces.",
      "Make the portal feel premium without drifting away from operational truth.",
    ],
  },
};

const modeContent = {
  operator: {
    title: "Operator view",
    copy:
      "The command centre should collapse noisy status into one operational lane: who owns the work, what changed, and what single action moves the record forward.",
    cards: [
      {
        label: "Immediate action",
        title: "Claim, pitch, progress",
        body: "One surface for queue, workbench, and transition state.",
      },
      {
        label: "Freshness",
        title: "Live, not guessed",
        body: "Snapshot vs live state should be visible, not implied.",
      },
      {
        label: "Continuity",
        title: "Portal-linked",
        body: "Every internal decision should connect to the client-facing journey.",
      },
    ],
  },
  client: {
    title: "Client continuum",
    copy:
      "The client should feel one clear progression from initial instruction to active matter. Internally, that means Hub must write the state the portal actually depends on.",
    cards: [
      {
        label: "Transition",
        title: "No cold handoff",
        body: "Instruction, document workspace, and portal should feel like one journey.",
      },
      {
        label: "Shared truth",
        title: "Lifecycle-driven screens",
        body: "The client's next screen should be a direct result of operational status, not guesswork.",
      },
      {
        label: "Clarity",
        title: "Premium, not vague",
        body: "Matter progress, checklist state, and current position should read with confidence.",
      },
    ],
  },
  intelligence: {
    title: "AI workbench",
    copy:
      "AI should help prepare decisions, not hide them. The strongest version of Helix uses AI to accelerate context gathering, drafting, checking, and explanation with clear evidence trails.",
    cards: [
      {
        label: "Preparation",
        title: "Summarise before the user asks",
        body: "Prepare the matter, enquiry, and portal context before the workbench opens.",
      },
      {
        label: "Verification",
        title: "Evidence-backed suggestions",
        body: "Suggestions should cite source state, not appear as black-box magic.",
      },
      {
        label: "Control",
        title: "Operator stays in charge",
        body: "AI speeds up review, drafting, and transitions without removing accountable ownership.",
      },
    ],
  },
};

function updateStage(nextStage) {
  const content = stageContent[nextStage];
  if (!content) return;

  document.getElementById("stage-title").textContent = content.title;
  document.getElementById("stage-copy").textContent = content.copy;
  document.getElementById("stage-points").innerHTML = content.points
    .map((point) => `<li>${point}</li>`)
    .join("");

  document.querySelectorAll(".topology-node").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.stage === nextStage);
  });
}

function updateMode(nextMode) {
  const content = modeContent[nextMode];
  if (!content) return;

  document.getElementById("mode-title").textContent = content.title;
  document.getElementById("mode-copy").textContent = content.copy;
  document.getElementById("mode-rail").innerHTML = content.cards
    .map(
      (card) => `
        <div class="rail-card">
          <span class="rail-label">${card.label}</span>
          <strong>${card.title}</strong>
          <p>${card.body}</p>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll(".mode-chip").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === nextMode);
  });
}

document.querySelectorAll(".topology-node").forEach((button) => {
  button.addEventListener("click", () => updateStage(button.dataset.stage));
});

document.querySelectorAll(".mode-chip").forEach((button) => {
  button.addEventListener("click", () => updateMode(button.dataset.mode));
});

updateStage("capture");
updateMode("operator");