---
applyTo: "src/**"
---

# Wayfinding (agent-assistive UI annotations)

Wayfinding is the convention that makes the running Helix Hub UI inspectable
by humans AND by AI agents that share the operator's browser window. Without
it, an agent can only refer to UI parts via brittle CSS selectors or vague
descriptions; with it, the agent can name regions ("click on
`home/calls-and-notes`") and the operator can see exactly what is meant.

## The three pieces

### 1. `data-helix-region="<name>"` HTML attributes

Stamp on the outer element of every "addressable" surface. Names are stable,
dot-delimited, and lowercase-kebab.

| Pattern | Example | Use for |
|---------|---------|---------|
| `app/<part>` | `app/root`, `app/header` | App-level shell pieces |
| `tab/<key>` | `tab/home`, `tab/instructions`, `tab/reports` | Top-level tabs |
| `<tab>/<panel>` | `home/calls-and-notes`, `home/quick-actions` | Panels within a tab |
| `<tab>/<panel>/<item>` | `instructions/list/HLX-00898-37693` | Specific records |
| `modal/<key>` | `modal/user-bubble`, `modal/eid-detail` | Modals |
| `dev/<part>` | `dev/wayfinding-overlay` | Dev-only surfaces |

Region names ship to production. They're inert (no styling, no behaviour) but
add ~25 bytes per element. Add them generously to anything an agent or
operator might want to point at.

```tsx
<section data-helix-region="home/calls-and-notes">
  {/* ... */}
</section>
```

### 2. `window.__helix__` debug API (dev only)

Registered at boot from [src/utils/devWayfinding.ts](src/utils/devWayfinding.ts). Open DevTools and:

```js
window.__helix__.help()           // list available methods
window.__helix__.regions()        // every mounted region with rect + visibility
window.__helix__.currentRegion()  // topmost visible region
window.__helix__.tabs()           // mounted tab/* regions
window.__helix__.build()          // build id stamped on <html>
```

An agent looking at a screenshot can ask the operator to paste
`window.__helix__.regions()` to ground its instructions.

### 3. `<html data-helix-build="<sha>@<iso-ts>">`

Stamped at boot. Surfaces the build the operator is currently seeing in every
screenshot, page-source dump, or HAR capture. Set
`REACT_APP_BUILD_SHA` at build time to make this meaningful in production
(falls back to `dev` locally).

### Bonus: Wayfinding overlay

`Ctrl+Shift+H` toggles a translucent overlay that outlines every
`[data-helix-region]` element with its name. Dev only. Lives at
[src/components/dev/WayfindingOverlay.tsx](src/components/dev/WayfindingOverlay.tsx).

## Rules when adding new components

1. If the component renders a panel, modal, tab, or addressable record, add
   a `data-helix-region` to its outer element.
2. Use the patterns in the table above. Do not invent new top-level
   namespaces without a good reason — stable names matter more than perfect
   names.
3. Don't rely on region attributes for styling (`[data-helix-region]` CSS
   selectors are forbidden). They are observation-only.
4. Don't remove a region name once shipped — agents and operators may have
   bookmarked it.

## Why this matters

The compounding goal: every session where the agent has the same browser
window the operator does, the agent should be able to ground itself in the
DOM without screenshot OCR or guesswork. Each new region attribute makes the
next session a little more autonomous.
