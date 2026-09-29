---
name: Mandarina Telemetry
version: 1.0.0
description: >
  Unified design system for AI agent observability UIs (traces, harnesses,
  tool calls, token telemetry). One token set, two themes: `light` and `dark`.
default-theme: light
theme-switch: "[data-theme='dark'] or prefers-color-scheme: dark"
source-of-truth: "Hex values in this file. Any older Material-style palettes are deprecated."

themes:
  light:
    bg-canvas: '#ffffff'
    bg-panel: '#f8f9fa'
    bg-raised: '#ffffff'
    bg-muted: '#f1f3f5'
    bg-overlay: '#ffffff'
    border-default: '#e5e7eb'
    border-subtle: '#f3f4f6'
    border-strong: '#d1d5db'
    text-primary: '#111827'
    text-secondary: '#1f2937'
    text-muted: '#4b5563'
    text-disabled: '#9ca3af'
    primary: '#ea580c'
    primary-hover: '#c2410c'
    primary-active: '#9a3412'
    primary-glow: '#f97316'
    on-primary: '#ffffff'
    primary-tint: '#fff7ed'
    primary-tint-border: '#ffedd5'
    primary-text: '#9a3412'
    focus-ring: 'rgba(234, 88, 12, 0.12)'
    selection: '#ffedd5'
    success: {base: '#10b981', bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0'}
    prompt: {base: '#3b82f6', bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe'}
    reasoning: {base: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe'}
    tool: {base: '#06b6d4', bg: '#ecfeff', text: '#155e75', border: '#a5f3fc'}
    warning: {base: '#eab308', bg: '#fefce8', text: '#854d0e', border: '#fef08a'}
    error: {base: '#f43f5e', bg: '#fff1f2', text: '#9f1239', border: '#fecdd3'}
    shadow-1: '0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 3px 0 rgba(0,0,0,0.02)'
    shadow-2: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)'
    shadow-3: '0 20px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04)'
    glow-active: '0 0 0 1px #ea580c, 0 0 0 3px rgba(234,88,12,0.12)'
  dark:
    bg-canvas: '#0f0f11'
    bg-panel: '#17171a'
    bg-raised: '#1f1f23'
    bg-muted: '#2a2a2f'
    bg-overlay: '#2a2a2f'
    border-default: '#27272a'
    border-subtle: '#1e1e24'
    border-strong: '#3f3f46'
    text-primary: '#ececf1'
    text-secondary: '#d4d4d8'
    text-muted: '#a1a1aa'
    text-disabled: '#71717a'
    primary: '#ff8a2a'
    primary-hover: '#ffa14e'
    primary-active: '#e8761a'
    primary-glow: '#ff8a2a'
    on-primary: '#0f0f11'
    primary-tint: 'rgba(255, 138, 42, 0.14)'
    primary-tint-border: 'rgba(255, 138, 42, 0.45)'
    primary-text: '#ff8a2a'
    focus-ring: 'rgba(255, 138, 42, 0.20)'
    selection: 'rgba(255, 138, 42, 0.14)'
    success: {base: '#22c55e', bg: 'rgba(34,197,94,0.12)', text: '#22c55e', border: 'rgba(34,197,94,0.25)'}
    prompt: {base: '#60a5fa', bg: 'rgba(96,165,250,0.12)', text: '#60a5fa', border: 'rgba(96,165,250,0.25)'}
    reasoning: {base: '#a78bfa', bg: 'rgba(167,139,250,0.12)', text: '#a78bfa', border: 'rgba(167,139,250,0.25)'}
    tool: {base: '#22d3ee', bg: 'rgba(34,211,238,0.12)', text: '#22d3ee', border: 'rgba(34,211,238,0.25)'}
    warning: {base: '#eab308', bg: 'rgba(234,179,8,0.12)', text: '#eab308', border: 'rgba(234,179,8,0.25)'}
    error: {base: '#f43f5e', bg: 'rgba(244,63,94,0.10)', text: '#f43f5e', border: 'rgba(244,63,94,0.30)'}
    shadow-1: 'none'
    shadow-2: '0 4px 12px -2px rgba(0,0,0,0.45)'
    shadow-3: '0 12px 32px -4px rgba(0,0,0,0.65), 0 4px 12px -2px rgba(0,0,0,0.45)'
    glow-active: '0 0 0 1px #ff8a2a, 0 0 16px -2px rgba(255,138,42,0.35)'

typography:
  font-sans: "Inter, system-ui, sans-serif"
  font-mono: "'JetBrains Mono', ui-monospace, monospace"
  display:      {family: sans, size: 2.25rem,   weight: 700, line-height: 2.75rem,  tracking: -0.025em}
  display-mobile: {family: sans, size: 1.75rem, weight: 700, line-height: 2.25rem,  tracking: -0.02em}
  headline-lg:  {family: sans, size: 1.5rem,    weight: 600, line-height: 2rem,     tracking: -0.02em}
  headline-md:  {family: sans, size: 1.25rem,   weight: 600, line-height: 1.75rem,  tracking: -0.015em}
  headline-sm:  {family: sans, size: 1.125rem,  weight: 600, line-height: 1.5rem,   tracking: -0.01em}
  title-md:     {family: sans, size: 0.9375rem, weight: 500, line-height: 1.375rem, tracking: -0.01em}
  body-lg:      {family: sans, size: 1rem,      weight: 400, line-height: 1.5rem}
  body-md:      {family: sans, size: 0.875rem,  weight: 400, line-height: 1.375rem}
  body-sm:      {family: sans, size: 0.8125rem, weight: 400, line-height: 1.25rem}
  label-md:     {family: sans, size: 0.8125rem, weight: 500, line-height: 1.125rem}
  code-md:      {family: mono, size: 0.8125rem, weight: 400, line-height: 1.375rem}
  code-sm:      {family: mono, size: 0.75rem,   weight: 500, line-height: 1.125rem}
  metric:       {family: mono, size: 1.25rem,   weight: 600, line-height: 1.5rem,   tracking: -0.02em}
  label-sm:     {family: mono, size: 0.6875rem, weight: 600, line-height: 1rem,     tracking: 0.04em, transform: uppercase}
  label-xs:     {family: mono, size: 0.625rem,  weight: 500, line-height: 0.75rem,  tracking: 0.06em, transform: uppercase}

rounded:
  sm: 4px      # badges, chips, tags, list items, checkboxes (checkbox may use 2-3px)
  md: 6px      # buttons, inputs, tabs, metric boxes, inline code
  lg: 8px      # cards, panels, code blocks, modals
  xl: 12px     # flyouts, command palette
  full: 9999px # live status dots ONLY

spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
  margin-mobile: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  gutter-mobile: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem

breakpoints:
  tablet: 768px
  desktop: 1280px

layout:
  rail-left: 240px
  inspector-right: 380px
  row-compact: 32px
  row-expandable: 44px
  control-height-compact: 32px
  control-height-regular: 38px
---

# Mandarina Telemetry: Design System

> **For LLMs and code generators:** This file is the single source of truth for UI generation.
> Read the **Rules for LLMs** section first, then use the tokens in the YAML frontmatter.
> Never hard-code a hex value in components; always reference a semantic token.

## 1. Rules for LLMs

1. **Two themes, one set of tokens.** Every color is a semantic token (e.g. `bg-panel`, `text-muted`, `primary`) with a `light` and a `dark` value. Generate components against tokens; never write `#fff` or `#111827` inline.
2. **Theme selection.** Default to `light`. Switch to `dark` when `[data-theme="dark"]` is set on `<html>`, or when no explicit theme is set and `prefers-color-scheme: dark` matches. If the user asks for a specific theme, generate that one. If unspecified, always support both.
3. **Density first.** This is dense developer tooling. Prefer tight spacing (`space-xs` to `space-md` inside components), 13-14px body text, and 1px borders. No large hero whitespace, no decorative gradients, no illustrations.
4. **Borders over shadows.** Separate regions with 1px `border-default`. Shadows are minimal in light mode and nearly absent in dark mode. Depth in dark mode comes from tonal stacking (`bg-canvas` → `bg-panel` → `bg-raised` → `bg-overlay`).
5. **Orange = action and liveness.** `primary` is reserved for primary actions, focus, selection, and *currently running* things. Do not use it for decoration or as a generic status color.
6. **Semantic lanes carry meaning.** Use the six lanes only for what they mean (see section 3). Never use a lane color purely for decoration.
7. **Monospace for machine data.** Timestamps, durations, token counts, model names, file paths, tool signatures, JSON, logs, and step indices always use `font-mono` with `font-variant-numeric: tabular-nums`. Prose and UI chrome use `font-sans`.
8. **Never rely on color alone.** Pair every status color with a text label or icon (badges always include a label).
9. **Accessibility.** Text/background contrast at least 4.5:1 for body, 3:1 for large text and UI borders. Every interactive element needs a visible focus state (section 6). Respect `prefers-reduced-motion` (disable pulse and blink animations).
10. **Round only what the spec allows.** Fully round shapes (`rounded-full`) are only for live status dots. Everything else uses `sm`/`md`/`lg`/`xl`.

## 2. Brand & Style

Precision instrumentation for AI agent execution harnesses, trace graphs, and LLM orchestration observability. Think Linear, Vercel, and avionics dashboards: exact, quiet, information-dense.

- **Light mode ("Light-Engineered Precision"):** crisp white and cool-gray surfaces, paper-clean legibility for long debugging sessions.
- **Dark mode ("Cybernetic Precision"):** matte carbon layers with targeted orange photoluminescent glows on active elements.
- **Shared personality:** hyper-observable, deterministic, no ornamental noise.

## 3. Color

### 3.1 Neutral surfaces (theme-dependent)

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `bg-canvas` | App root, main canvas | `#ffffff` | `#0f0f11` |
| `bg-panel` | Sidebars, inspector, terminal, panel underlays | `#f8f9fa` | `#17171a` |
| `bg-raised` | Cards, hovered rows, active trace rows | `#ffffff` | `#1f1f23` |
| `bg-muted` | Code blocks, table headers, gutters, inputs/hover (dark) | `#f1f3f5` | `#2a2a2f` |
| `bg-overlay` | Popovers, modals, command palette | `#ffffff` | `#2a2a2f` |
| `border-default` | Pane and card boundaries | `#e5e7eb` | `#27272a` |
| `border-subtle` | Row rules, inner dividers | `#f3f4f6` | `#1e1e24` |
| `border-strong` | Hover borders, checkbox borders | `#d1d5db` | `#3f3f46` |

Note the inversion: in light mode panels are *darker* than cards; in dark mode panels are *lighter* than the canvas. Always use the tokens; do not assume direction.

### 3.2 Text

| Token | Use | Light | Dark |
|---|---|---|---|
| `text-primary` | Titles, key metrics, active log output | `#111827` | `#ececf1` |
| `text-secondary` | Body copy, payload keys, active tabs | `#1f2937` | `#d4d4d8` |
| `text-muted` | Labels, timestamps, metadata, inactive icons | `#4b5563` | `#a1a1aa` |
| `text-disabled` | Disabled, empty spans, line numbers | `#9ca3af` | `#71717a` |

### 3.3 Brand primary

| Token | Light | Dark |
|---|---|---|
| `primary` | `#ea580c` | `#ff8a2a` |
| `primary-hover` | `#c2410c` | `#ffa14e` |
| `primary-active` | `#9a3412` | `#e8761a` |
| `on-primary` (text on primary) | `#ffffff` | `#0f0f11` |
| `primary-tint` (focus rows, selected pills) | `#fff7ed` | `rgba(255,138,42,0.14)` |
| `focus-ring` | `rgba(234,88,12,0.12)` | `rgba(255,138,42,0.20)` |

### 3.4 Semantic telemetry lanes

Each lane has `base` (solid fills, bars, dots), `bg` (badge background), `text` (badge text), `border` (badge border). Values per theme are in the frontmatter.

| Lane | Meaning | Use for |
|---|---|---|
| `success` (emerald/green) | Completed, healthy | Lifecycle success, passed guardrails, online harnesses, response assembly bars |
| `prompt` (blue) | Input | User prompts, context injection, upstream queries, prompt tokens |
| `reasoning` (violet) | Thinking and orchestration | Chain-of-thought, reflection, prompt synthesis, sub-agent handoffs, parallel workers |
| `tool` (cyan) | Execution and IO | MCP calls, bash, LSP, file writes, external APIs, tool latency bars |
| `warning` (amber) | Degraded | Context saturation, high latency, rate limits |
| `error` (rose) | Halt and fault | Timeouts, exceptions, injections, overflow, kill switches, aborts |

Pending/streaming states use the **primary** tint (orange) with a pulsing dot, not a lane color.

## 4. Typography

**Inter** for prose, headings, navigation, and UI chrome. **JetBrains Mono** for all machine/computational data. Full scale is in the frontmatter `typography` block.

- Headlines use tight negative tracking; no decorative weights (only 500/600/700).
- Enable `font-variant-numeric: tabular-nums` (`font-feature-settings: "tnum" 1`) on every metric, duration, and token count so live-updating numbers don't jitter.
- Badges and micro-labels use uppercase `label-sm` or `label-xs` with positive tracking.
- Use `display-mobile` below 768px.

## 5. Layout & Spacing

**Workbench model** with a 12-column grid for overview dashboards.

3-pane workbench (desktop):
1. **Left rail** (collapsible, 240px): harness runs, agent threads, filters.
2. **Central canvas** (fluid): waterfall traces, execution stream, tool sequences.
3. **Right inspector** (380px fixed, or docked bottom): raw prompt/completion JSON, context gauge, token analytics.

| Breakpoint | Behavior | Margin / gutter |
|---|---|---|
| Desktop ≥ 1280px | 3 panes expanded; optional bottom terminal tray | 2rem / 2rem |
| Tablet 768–1279px | Inspector becomes slide-over drawer; timeline scrolls horizontally with sticky headers | 1.5rem / 1.5rem |
| Mobile < 768px | Single column; segmented tabs (Runs / Trace / Payload) | 1rem / 1rem |

Rows: `32px` compressed trace rows, `44px` expandable event rows. Controls: `32px` compact, `38px` regular.

## 6. Elevation, Depth & Focus

| Level | Use | Light | Dark |
|---|---|---|---|
| 0 Flat | Panels, tables, code | 1px `border-default` | tonal layer + 1px border |
| 1 Raised | Hovered cards/rows | `shadow-1` on `bg-raised` | border lightens to `border-strong` |
| 2 Flyout | Dropdowns, menus, tooltips | `shadow-2` + border | `shadow-2` + `border-strong` |
| 3 Modal | Kill confirmations, stack traces, command palette | `shadow-3` | `shadow-3` + `border-strong` |

- **Active node / trace focus:** `box-shadow: var(--glow-active)`. Light: 1px orange border plus 3px soft ring. Dark: 1px orange border plus 16px orange halo. Use only for the currently inspected or currently running element.
- **Status rim:** for semantic alerts on cards, add a 1px top inset in the lane color (e.g. `rgba(244,63,94,0.5)` for a blocked harness).
- **Focus-visible (all interactive):** `outline: 2px solid var(--primary); outline-offset: 2px`, or the input focus style below.

## 7. Shapes

| Token | Size | Applied to |
|---|---|---|
| `rounded-sm` | 4px | Badges, chips, trace tags, list items, checkboxes (2-3px allowed) |
| `rounded-md` | 6px | Buttons, inputs, tabs, segmented controls, metric boxes, inline code |
| `rounded-lg` | 8px | Cards, panels, code blocks, modals, inspector |
| `rounded-xl` | 12px | Flyouts, command palette |
| `rounded-full` | 9999px | Live pulse dots and status pips only |

## 8. Components

All values are theme tokens; both themes are covered by the same spec.

### Buttons
- **Primary:** bg `primary`, text `on-primary`, weight 600, `rounded-md`. Hover `primary-hover`; active `primary-active` (dark: also `scale(0.98)`); focus ring 2px offset with `focus-ring`. Dark hover adds `0 0 12px rgba(255,138,42,0.4)`.
- **Secondary:** bg `bg-canvas` (light) or `bg-raised` (dark), text `text-primary`, 1px `border-default`. Hover: bg `bg-panel` (light) or `bg-muted` (dark), border `border-strong`.
- **Ghost / icon:** transparent, text `text-muted`. Hover: bg `bg-muted` (light) or `bg-raised` (dark), text `text-primary`.
- **Destructive:** bg `error.bg` (light: white), text `error.base`, 1px `error.border`. Hover: slightly stronger `error.bg`. Used for kill/abort actions; always confirm via modal.

### Chips & telemetry badges
- `rounded-sm`, `label-sm` or `label-xs` (uppercase mono), height 20 or 24px, padding `0 6px`.
- Colors from the lane: bg `lane.bg`, text `lane.text`, border 1px `lane.border`.
- Badge variants: **Success/Completed**, **Prompt**, **Reasoning**, **Tool call**, **Warning**, **Error/Fault**, **Pending/Streaming** (primary tint + `primary-text` + `primary-tint-border`, with pulsing 6px dot).

### Inputs & search
- bg `bg-canvas` (light) or `#121215` (dark), 1px `border-default`, text `text-primary`, placeholder `text-disabled`, `rounded-md`.
- Focus: border `primary` + `0 0 0 3px focus-ring` (dark may add `0 0 8px rgba(255,138,42,0.2)`).
- **Global filter:** right-aligned `⌘K` hint in a `bg-muted` mono badge.
- **Terminal prompt variant:** persistent `primary` chevron `❯` and a mono caret blinking at 1s (disabled under reduced motion).

### Checkboxes & switches
- **Checkbox:** 16px (compact 14px), `border-strong`; checked bg `primary`, mark `on-primary`.
- **Switch:** 36×20 track (compact 28×16), track `border-default`/`bg-muted`; on = `primary`; thumb white (light) or `#0f0f11` (dark); 150ms ease-out.

### Trace waterfall & timeline cards
- Container: `bg-canvas`, 1px `border-default`, `rounded-md` (light) / `rounded-lg` (dark cards).
- Header: `bg-panel`, bottom border, `label-md`.
- **Span bars:** 8px or 16px high, `rounded-sm`, colored by lane: `reasoning` for thinking time, `tool` for tool/MCP latency, `success` for response assembly, `prompt` for context ingestion, `error` for failed spans.
- Selected span: `primary-tint` envelope plus `glow-active`.

### Lists & event traces
- Row: timestamp (mono, `text-disabled`) → lane badge → actor tag (e.g. `orchestrator`, `worker-02`) → single-line truncated payload (`text-primary`).
- Separators 1px `border-subtle`; hover bg `bg-raised`; selected bg `primary-tint`.

### Telemetry metric cards
- bg `bg-panel`, 1px `border-default`, `rounded-lg`, padding `space-md`.
- Title: `label-xs` uppercase `text-disabled`. Value: `metric` in `text-primary`, tabular. Optional delta tag using `success` or `error`.
- Hover: border → `border-strong` (dark adds a faint top-edge glow).

### Live output & terminal logs
- bg `bg-panel`, 1px `border-default`, padding `space-md`, `code-md`.
- Line numbers `text-disabled`; selected line `selection`.

### Domain components
- **Harness tree node:** tree-line connectors from orchestrator to sub-agents; live token-burn and latency tickers at branch tips (mono, tabular).
- **Token gauge:** segmented horizontal bar: Prompt tokens (`prompt.base`), Completion tokens (`primary`), Cached context (`text-disabled`), relative to the model's context limit; label with `used / max`.
- **Live pulse dot:** 6px `rounded-full`, lane color, 1.5s pulse animation (respect reduced motion).

## 9. Implementation snippets

### CSS custom properties

```css
:root {
  color-scheme: light;
  --bg-canvas: #ffffff;  --bg-panel: #f8f9fa;  --bg-raised: #ffffff;
  --bg-muted: #f1f3f5;   --bg-overlay: #ffffff;
  --border-default: #e5e7eb; --border-subtle: #f3f4f6; --border-strong: #d1d5db;
  --text-primary: #111827; --text-secondary: #1f2937;
  --text-muted: #4b5563;   --text-disabled: #9ca3af;
  --primary: #ea580c; --primary-hover: #c2410c; --primary-active: #9a3412;
  --on-primary: #ffffff; --primary-tint: #fff7ed;
  --focus-ring: rgba(234,88,12,0.12);
  --success: #10b981; --success-bg: #ecfdf5; --success-text: #065f46; --success-border: #a7f3d0;
  --prompt: #3b82f6;  --prompt-bg: #eff6ff;  --prompt-text: #1e40af;  --prompt-border: #bfdbfe;
  --reasoning: #8b5cf6; --reasoning-bg: #f5f3ff; --reasoning-text: #5b21b6; --reasoning-border: #ddd6fe;
  --tool: #06b6d4;    --tool-bg: #ecfeff;    --tool-text: #155e75;    --tool-border: #a5f3fc;
  --warning: #eab308; --warning-bg: #fefce8; --warning-text: #854d0e; --warning-border: #fef08a;
  --error: #f43f5e;   --error-bg: #fff1f2;   --error-text: #9f1239;   --error-border: #fecdd3;
  --shadow-1: 0 1px 2px 0 rgba(0,0,0,.04), 0 1px 3px 0 rgba(0,0,0,.02);
  --shadow-2: 0 4px 6px -1px rgba(0,0,0,.05), 0 2px 4px -2px rgba(0,0,0,.05);
  --shadow-3: 0 20px 25px -5px rgba(0,0,0,.08), 0 8px 10px -6px rgba(0,0,0,.04);
  --glow-active: 0 0 0 1px #ea580c, 0 0 0 3px rgba(234,88,12,.12);
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-xl: 12px;
  --font-sans: Inter, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

/* Dark: explicit toggle */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: #0f0f11;  --bg-panel: #17171a;  --bg-raised: #1f1f23;
  --bg-muted: #2a2a2f;   --bg-overlay: #2a2a2f;
  --border-default: #27272a; --border-subtle: #1e1e24; --border-strong: #3f3f46;
  --text-primary: #ececf1; --text-secondary: #d4d4d8;
  --text-muted: #a1a1aa;   --text-disabled: #71717a;
  --primary: #ff8a2a; --primary-hover: #ffa14e; --primary-active: #e8761a;
  --on-primary: #0f0f11; --primary-tint: rgba(255,138,42,.14);
  --focus-ring: rgba(255,138,42,.20);
  --success: #22c55e; --success-bg: rgba(34,197,94,.12);  --success-text: #22c55e; --success-border: rgba(34,197,94,.25);
  --prompt: #60a5fa;  --prompt-bg: rgba(96,165,250,.12);  --prompt-text: #60a5fa;  --prompt-border: rgba(96,165,250,.25);
  --reasoning: #a78bfa; --reasoning-bg: rgba(167,139,250,.12); --reasoning-text: #a78bfa; --reasoning-border: rgba(167,139,250,.25);
  --tool: #22d3ee;    --tool-bg: rgba(34,211,238,.12);    --tool-text: #22d3ee;    --tool-border: rgba(34,211,238,.25);
  --warning: #eab308; --warning-bg: rgba(234,179,8,.12);  --warning-text: #eab308; --warning-border: rgba(234,179,8,.25);
  --error: #f43f5e;   --error-bg: rgba(244,63,94,.10);    --error-text: #f43f5e;   --error-border: rgba(244,63,94,.30);
  --shadow-1: none;
  --shadow-2: 0 4px 12px -2px rgba(0,0,0,.45);
  --shadow-3: 0 12px 32px -4px rgba(0,0,0,.65), 0 4px 12px -2px rgba(0,0,0,.45);
  --glow-active: 0 0 0 1px #ff8a2a, 0 0 16px -2px rgba(255,138,42,.35);
}

/* Dark: follow OS when no explicit theme is set (duplicate the dark block above here) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* same variables as :root[data-theme="dark"] */ }
}

.mono, code, pre, .metric { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

### Tailwind mapping (v3 `theme.extend`)

```js
colors: {
  canvas: 'var(--bg-canvas)', panel: 'var(--bg-panel)', raised: 'var(--bg-raised)',
  muted: 'var(--bg-muted)', overlay: 'var(--bg-overlay)',
  line: { DEFAULT: 'var(--border-default)', subtle: 'var(--border-subtle)', strong: 'var(--border-strong)' },
  ink: { DEFAULT: 'var(--text-primary)', 2: 'var(--text-secondary)', muted: 'var(--text-muted)', off: 'var(--text-disabled)' },
  primary: { DEFAULT: 'var(--primary)', hover: 'var(--primary-hover)', active: 'var(--primary-active)', on: 'var(--on-primary)', tint: 'var(--primary-tint)' },
  success: 'var(--success)', prompt: 'var(--prompt)', reasoning: 'var(--reasoning)',
  tool: 'var(--tool)', warning: 'var(--warning)', error: 'var(--error)',
},
borderRadius: { sm: '4px', md: '6px', lg: '8px', xl: '12px' },
fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
```

## 10. Do / Don't

**Do**
- Use tokens for every color, radius, and font.
- Show live activity with a lane-colored pulsing dot plus label.
- Keep panels dense; truncate payloads to a single line and expand in the inspector.
- Use `glow-active` on exactly one primary focus target at a time.

**Don't**
- Don't hard-code hex values or use pure `#000` / `#fff` text.
- Don't use gradients, heavy blur shadows, or emoji as status indicators.
- Don't use orange for success, info, or decoration.
- Don't mix lanes (e.g. red for "tool call"); don't invent new status colors.
- Don't use proportional numerals in live metrics.
- Don't round anything fully unless it is a status dot.

## 11. Generation checklist

Before returning UI code, verify:
- [ ] Both themes work (or the requested one), via tokens only
- [ ] Focus-visible state on every interactive element
- [ ] Mono + tabular-nums for all timestamps, durations, tokens, paths, logs
- [ ] Status badges have text labels, not just color
- [ ] Radii, spacing, and heights match sections 5 and 7
- [ ] Responsive at 768px and 1280px breakpoints
- [ ] Animations disabled under `prefers-reduced-motion`
- [ ] Contrast at least 4.5:1 for text in both themes

## 12. Provenance & decisions

This file merges the *Mandarina Telemetry* (light) and *Obsidian Telemetry* (dark) specs. Resolved conflicts:
- **Source of truth** is the body hex values of each original, not the Material-style YAML palettes (deprecated).
- **Primary orange** is one token: `#ea580c` (light) / `#ff8a2a` (dark).
- **Semantic lanes** unified to six. Light-mode `prompt` and `warning` values, `text-secondary` (dark), `primary-active` (dark), and dark input background `#121215` are derived to complete the set.
- **Violet** covers both reasoning (light spec) and sub-agent orchestration (dark spec); distinguish the two with the actor tag, not a new color.
- **Base radius** unified: 4px for badges, 6px for controls, 8px for panels, 12px for flyouts.
- **Units** normalized to rem (px kept for radii and fixed layout dimensions).
