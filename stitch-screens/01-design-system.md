# AI Mock Interview Studio — Design System

> Source: Google Stitch project **AI Interview Practice Platform**
> Project ID: `7152366827888150836`
> Design system asset: `assets/876803d92a6c482fbf1fbe78f8547f9a`
> Version: 1 · Synced: 2026-10-18

---

## 1. Brand & Style

### Personality & Emotional Response
The design system targets software engineers, engineering managers, and technical candidates preparing for rigorous technical interviews using local/self-hosted infrastructure with **BYOK (Bring Your Own Key)**. The visual language conveys architectural precision, cryptographic trust, calm focus, and high performance. It eliminates interview anxiety through structured clarity, crisp data displays, and transparent feedback loops.

### Aesthetic Direction
A modern, engineering-grade minimalism infused with subtle tactile precision:
- **Surface Architecture:** Dark-mode-first aesthetic with deep slate canvas, quiet surface separation, and hairline borders (0.5px to 1px) with controlled opacity.
- **Micro-Metaphors:** Terminal-inspired telemetry, cryptographic key status chips, model response latency graphs, and precise evaluation rubrics.
- **Tone:** Authoritative, private, distraction-free, and respectful of developer ergonomics.

---

## 2. Colors

### Material 3 Color Roles (Fidelity Dark variant)

| Role | Token | Hex |
|---|---|---|
| Surface | `surface` | `#051424` |
| Surface dim | `surface-dim` | `#051424` |
| Surface bright | `surface-bright` | `#2c3a4c` |
| Surface container lowest | `surface-container-lowest` | `#010f1f` |
| Surface container low | `surface-container-low` | `#0d1c2d` |
| Surface container | `surface-container` | `#122131` |
| Surface container high | `surface-container-high` | `#1c2b3c` |
| Surface container highest | `surface-container-highest` | `#273647` |
| On surface | `on-surface` | `#d4e4fa` |
| On surface variant | `on-surface-variant` | `#c7c4d8` |
| Inverse surface | `inverse-surface` | `#d4e4fa` |
| Inverse on surface | `inverse-on-surface` | `#233143` |
| Outline | `outline` | `#918fa1` |
| Outline variant | `outline-variant` | `#464555` |
| Surface tint | `surface-tint` | `#c3c0ff` |
| **Primary (Deep Indigo)** | `primary` / `primary-container` | `#c3c0ff` / `#4f46e5` |
| On primary | `on-primary` / `on-primary-container` | `#1d00a5` / `#dad7ff` |
| Inverse primary | `inverse-primary` | `#4d44e3` |
| **Secondary (Slate Dark 900)** | `secondary` / `secondary-container` | `#bec6e0` / `#3f465c` |
| On secondary | `on-secondary` / `on-secondary-container` | `#283044` / `#adb4ce` |
| **Tertiary (Emerald/Teal)** | `tertiary` / `tertiary-container` | `#4edea3` / `#006e4b` |
| On tertiary | `on-tertiary` / `on-tertiary-container` | `#003824` / `#67f4b7` |
| **Error (Rose)** | `error` / `error-container` | `#ffb4ab` / `#93000a` |
| On error | `on-error` / `on-error-container` | `#690005` / `#ffdad6` |
| Background | `background` | `#051424` |
| On background | `on-background` | `#d4e4fa` |
| Surface variant | `surface-variant` | `#273647` |

### Brand Palette Overrides
| Token | Value | Use |
|---|---|---|
| `--primary` | `#4F46E5` (Deep Indigo) | Cognitive intelligence, active focus states, primary actions, primary speech/audio waveforms |
| `--secondary` | `#0F172A` (Slate Dark 900) | Application canvas, background surfaces, sidebar partitions, floating console drawers |
| `--tertiary` | `#10B981` (Emerald/Teal) | Positive performance, rubric pass, active local SQLite sync, verified API key badges |
| `--neutral` | `#94A3B8` (Slate Muted 400) | Structural typography, inactive controls, metadata, subtle outlines |

### Functional Accents
| Token | Hex | Use |
|---|---|---|
| Security Warning | `#F59E0B` (Amber) | Rate limits, non-encrypted export warnings, BYOK threshold alerts |
| Destructive / Error | `#F43F5E` (Rose) | Leaked key alerts, invalid token formats, failed inference, session termination |

### Custom Surface Scale
| Token | Value |
|---|---|
| `bg-canvas` | `#090D16` |
| `bg-surface-subtle` | `#0F172A` |
| `bg-surface-elevated` | `#1E293B` |
| `bg-surface-overlay` | `#334155` |
| `border-hairline` | `rgba(148, 163, 184, 0.12)` |
| `border-focus` | `rgba(79, 70, 229, 0.6)` |

---

## 3. Typography

### Type System
- **Primary Typeface:** `Geist` — engineered for ultra-clean readability in analytical UI; renders interface copy, questions, transcripts, evaluation narratives.
- **Monospaced Companion:** `JetBrains Mono` — applied systematically to tokens, model checkpoints (`gpt-4o`, `claude-3-5-sonnet`, `deepseek-r1`), BYOK hash previews (`sk-...9b2a`), latency timings (`184ms`), token counts, code exercise blocks.

### Scale

| Token | Font | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| `display` | Geist | 40px | 600 | 48px | -0.02em |
| `headline-lg` | Geist | 32px | 600 | 40px | -0.02em |
| `headline-lg-mobile` | Geist | 26px | 600 | 32px | -0.01em |
| `headline-md` | Geist | 24px | 500 | 32px | -0.015em |
| `headline-sm` | Geist | 18px | 500 | 26px | -0.01em |
| `body-lg` | Geist | 16px | 400 | 24px | — |
| `body-md` | Geist | 14px | 400 | 20px | — |
| `body-sm` | Geist | 12px | 400 | 18px | — |
| `label-code-lg` | JetBrains Mono | 14px | 500 | 20px | -0.01em |
| `label-code-sm` | JetBrains Mono | 12px | 400 | 16px | 0em |
| `label-caps` | JetBrains Mono | 10px | 600 | 14px | 0.08em |

### Rules
- Headers avoid excessive weight; **max weight 600** (Semi-bold) to preserve developer-first minimalism.
- `label-caps` (uppercase monospace) reserved for metadata badges, SQLite connection tags, protocol status, rubric weights.
- High-contrast letter-spacing reductions (`-0.015em` to `-0.02em`) on titles above 24px for optical compactness.

---

## 4. Layout & Spacing

### Grid & Composition
- **Layout Model:** Fluid grid inside constrained modular shells.
- **Shell:** Dual-pane or tri-pane:
  - Collapsible session telemetry/questions sidebar — **280px fixed**
  - Primary interactive arena — **fluid, max 860px reading column**
  - Contextual inspection drawer — **340px** (live code/rubric)
- **Desktop (1280px+):** 12-column, 20px (`1.25rem`) gutters, 32px (`2rem`) screen safe margins.
- **Tablet (768–1279px):** 8-column, panels convert to collapsible side-drawers / stacked tabs.
- **Mobile (< 768px):** Single-column stacked stream, 12px (`0.75rem`) gutters, edge-to-edge conversational container with anchored input/voice control bar.

### Spacing Scale
| Token | Value |
|---|---|
| `space-xs` | 4px (`0.25rem`) |
| `space-sm` | 8px (`0.5rem`) |
| `space-md` | 16px (`1rem`) |
| `space-lg` | 24px (`1.5rem`) |
| `space-xl` | 40px (`2.5rem`) |
| `gutter` | 20px (`1.25rem`) |
| `gutter-mobile` | 12px (`0.75rem`) |
| `margin` | 32px (`2rem`) |
| `margin-mobile` | 16px (`1rem`) |

8px base rhythm with 4px sub-increments. Metric cards / parameter groups / question prompts use `space-md` inner padding.

---

## 5. Elevation & Depth

Tonal stacking + micro-borders (no high-blur shadows):

| Tier | Color | Border |
|---|---|---|
| Base Layer (viewport) | `#090D16` | — |
| Container Tier 1 (cards, sidebars, settings) | `#0F172A` | `1px solid rgba(148, 163, 184, 0.08)` |
| Container Tier 2 (active question cards, response boxes, model outputs) | `#1E293B` | `1px solid rgba(148, 163, 184, 0.16)` |
| Floating Overlays & Modals (command palettes, BYOK manager, rubric drawers) | `#1E293B` @ 95% opacity | `backdrop-filter: blur(12px)` |

### Glow Accents (active states: audio listening, model streaming)
```css
box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.4),
            0 0 24px -4px rgba(79, 70, 229, 0.15);
```

Card separators replace drop shadows with `0.5px` or `1px` crisp slate-tint borders.

---

## 6. Shapes

| Radius | Token | Value |
|---|---|---|
| Base (default) | `DEFAULT` | `8px` / `0.5rem` |
| Small | `sm` | `4px` / `0.25rem` |
| Medium | `md` | `12px` / `0.75rem` |
| Large | `lg` | `16px` / `1rem` |
| XL | `xl` | `24px` / `1.5rem` |
| Full (pill) | `full` | `9999px` |

### Usage
- **Input fields, buttons, card containers:** `8px`
- **Badges, status chips, model tags:** `9999px` (pill)
- **Terminal & code blocks:** `12px`
- **Interactive checkboxes:** `4px` with sharp internal ticks

---

## 7. Component Specs

### Buttons
- **Primary:** Deep Indigo (`#4F46E5`) fill, white text, `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18)`, hover `#4338CA`.
- **Secondary / Ghost:** Transparent + `1px solid rgba(148, 163, 184, 0.2)`, text `#E2E8F0`, hover fill `rgba(30, 41, 59, 0.6)`.
- **Destructive:** Rose border and text (`#F43F5E`), hover fill `rgba(244, 63, 94, 0.08)`.

### BYOK Key Input
- Monospace (`JetBrains Mono`).
- Password-masking toggle + auto key-format verification (`sk-ant-…` vs `sk-…`).
- Right-flank local SQLite badge: *"Stored locally in SQLite (unencrypted RAM only)"*.
- Active focus:
  ```css
  outline: none;
  border-color: #4F46E5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
  ```

### Provider & Status Chips (Badges)
Built with `label-caps` typography + pill borders.
| Chip | Border | Text | Dot |
|---|---|---|---|
| OpenAI | `#334155` | `#E2E8F0` | neutral |
| Anthropic | `rgba(217, 119, 6, 0.3)` | `#FDE68A` | amber |
| Ollama / Local | `rgba(16, 185, 129, 0.3)` | `#6EE7B7` | emerald |
| Active Recording | animated pulse | — | `#10B981` or `#4F46E5` |

### Cards (Interview Prompts & Analysis)
- Background `#0F172A`, border `1px solid rgba(148, 163, 184, 0.12)`.
- Header section divided with `1px solid rgba(148, 163, 184, 0.08)`.
- Feedback cards: split rubric ratings — Emerald (`#10B981`) score meter for pass, Amber (`#F59E0B`) for improvement, with inline monospaced code diffs.

### Lists & Telemetry Logs
- Clean key-value pairs with alternating slate row tints on hover (`rgba(30, 41, 59, 0.4)`).
- Time stamps / token counts right-aligned in `label-code-sm`.
- Question difficulty markers `L3-Junior`, `L5-Senior`, `Staff` as monospaced micro-badges.

---

## 8. CSS Variables (one-shot bundle)

```css
:root {
  /* Brand palette */
  --primary: #4F46E5;
  --primary-hover: #4338CA;
  --secondary: #0F172A;
  --tertiary: #10B981;
  --neutral: #94A3B8;

  /* Surface scale */
  --bg-canvas: #090D16;
  --bg-surface-subtle: #0F172A;
  --bg-surface-elevated: #1E293B;
  --bg-surface-overlay: #334155;

  /* Borders */
  --border-hairline: rgba(148, 163, 184, 0.12);
  --border-strong: rgba(148, 163, 184, 0.20);
  --border-focus: rgba(79, 70, 229, 0.6);
  --border-t1: rgba(148, 163, 184, 0.08);
  --border-t2: rgba(148, 163, 184, 0.16);

  /* Accents */
  --warning: #F59E0B;
  --destructive: #F43F5E;
  --success: #10B981;

  /* Text */
  --text-primary: #d4e4fa;
  --text-secondary: #c7c4d8;
  --text-muted: #94A3B8;
  --text-bright: #E2E8F0;

  /* Radius */
  --radius-sm: 4px;
  --radius: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
  --gutter: 20px;
  --margin: 32px;

  /* Font families */
  --font-sans: "Geist", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", monospace;

  /* Glow */
  --glow-active: 0 0 0 1px rgba(79, 70, 229, 0.4),
                 0 0 24px -4px rgba(79, 70, 229, 0.15);
}
```

---

## 9. Project Screens (5 generated + 1 spec)

| # | Title | Screen ID | Resolution | Status |
|---|---|---|---|---|
| 1 | `01-Requirements.md` (spec) | `30f674e9d97b4bad89dc3e4831562fc0` | 600×600 | markdown |
| 2 | `Cấu hình AI (BYOK)` | `f1eb8a78745149de987fc81ca8910ed4` | 1280×1263 | ✅ Downloaded |
| 3 | `2. Bắt đầu phỏng vấn` | `5282ae1d49fb4528987e1c5357dd1020` | 2560×4182 | 🔒 auth-gated |
| 4 | `3. Phiên đang diễn ra` | `392921d1447d49b1bb27e06c9f51ad69` | 2560×3984 | 🔒 auth-gated |
| 5 | `4. Báo cáo đánh giá chi tiết` | `f698edb312ee4350a201d4781f51332e` | 2560×5788 | 🔒 auth-gated |
| 6 | `5. Lịch sử & Dữ liệu SQLite` | `dbf19795aa99465c9318b3bcb0499e59` | 2560×2852 | 🔒 auth-gated |

Auth-gated means the Stitch download URLs require OAuth credentials that aren't exposed to CLI curl; fetch via Stitch UI.
