---
name: Focus Flow
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 3.5rem
    fontWeight: '700'
    lineHeight: 4rem
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.875rem
    letterSpacing: 0em
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0.005em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  # ĐÃ ĐỒNG BỘ 2026-10-29 với tailwind.config nhúng trong 21 màn hình Stitch.
  # Bản gốc của Stitch ghi DEFAULT 0.25rem / lg 0.5rem / xl 0.75rem / full 9999px,
  # nhưng HTML thực tế dùng theme.extend.borderRadius → extend GHI ĐÈ key gốc của Tailwind.
  # Giá trị bên dưới là giá trị THỰC TẾ đã render trong 21/21 màn hình (đã duyệt bằng bản đó).
  sm: 0.125rem        # 2px
  DEFAULT: 0.125rem   # 2px  ← HTML: 0.125rem (bản gốc Stitch: 0.25rem)
  md: 0.375rem        # 6px
  lg: 0.25rem         # 4px  ← HTML: 0.25rem (bản gốc Stitch: 0.5rem)
  xl: 0.5rem          # 8px  ← HTML: 0.5rem (bản gốc Stitch: 0.75rem)
  full: 0.75rem       # 12px ← HTML: 0.75rem (bản gốc Stitch: 9999px)
  # LƯU Ý: 'full' KHÔNG phải hình tròn. Vì nằm trong theme.extend nên nó ghi đè
  # 9999px của Tailwind. Dùng class tường minh 'rounded-[9999px]' khi cần tròn thật
  # (avatar, radial progress ring).
spacing:
  gutter: 1rem
  gutter-md: 1.25rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies a high-density, distraction-free digital workplace engineered for deliberate practice, spaced repetition, and systematic cognitive training. It merges austere Swiss-inspired functionalism with subtle tactile cues found in modern high-performance developer tools and executive operating software.

The target audience consists of ambitious professionals, software engineers, researchers, and lifelong learners in Vietnam who demand rigorous daily tracking without sensory overload. The interface evokes quiet discipline, clarity of thought, and immediate agency. 

Visual characteristics:
- **Quiet Foundations:** Monochromatic slate and zinc surfaces ground cognitive load, prioritizing legibility and signal-to-noise ratio.
- **Precision Accents:** Purpose-driven chromatic assignments—emerald for progression, amber for urgency/retention, and indigo for synthetic/AI evaluations.
- **Structural Integrity:** Ultra-fine architectural borders and subdued backdrop blurs establish modular spatial zoning, replacing decorative styling with analytical clarity.
- **Culturally Attuned Typography:** Optimized letter-spacing and vertical pacing specifically balanced to prevent clipping and visual clutter with Vietnamese diacritical marks (dấu câu).

## Colors

The color architecture is built around an uncompromising dark-mode default to preserve ocular comfort during deep morning and late-night focus sessions. 

- **Primary (`#10b981` / Emerald):** Drives physical feedback, completed habit loops, daily streak metrics, retention thresholds, and skill mastery milestones.
- **Secondary (`#6366f1` / Indigo):** Designates intelligent or AI-driven interventions—mock interview grading, automated flashcard generation, rubric assessments, and systemic insights.
- **Tertiary (`#f59e0b` / Amber):** Represents active friction—pending FSRS review counts, overdue milestones, attention-demanding drill flags, and review sessions approaching lapse.
- **Neutral (`#090d16` / Deep Zinc-Slate):** Provides the deep structural canvas. Paired with tiered surface tones (`#111726`, `#182238`, `#232f4b`), it crafts depth without pure-black optical glare.
- **Text & Foreground:** Pure high-contrast off-whites (`#f8fafc`) for semantic values and primary labels, descending to zinc-400 (`#94a3b8`) for secondary metrics and zinc-500 (`#64748b`) for inactive states or metadata.

## Typography

Typography balances analytical precision with deep natural language legibility:
- **Headlines (`Space Grotesk`):** Delivers a technical, sharp edge to high-level metric views, dashboard banners, and skill tree node headers.
- **Body (`Be Vietnam Pro`):** Purpose-selected for native, uncompromised Vietnamese language rendering. Extended line-height tokens (`1.625rem` on body-md) preserve ample vertical room, preventing stacked diacritic marks (như dấu hỏi, ngã, nặng, sắc) from colliding with upper ascenders.
- **Monospace & Utility (`JetBrains Mono`):** Powers tabular data, FSRS algorithms parameters (`S`, `R`, `D`), timestamps, streak tallies, hotkey badges, and command-line inputs.

All uppercase labels must utilize `JetBrains Mono` with loose tracking (`0.04em` to `0.06em`) for immediate peripheral scanability.

## Layout & Spacing

The structural layout utilizes a strict 12-column modular fluid grid anchored by ergonomic constraints for rapid key-driven interaction.

- **Desktop (>= 1280px):** 12-column grid, capped at a maximum container width of `1600px` for panoramic operational oversight, or constrained to `896px` (max-w-4xl) for dedicated single-task modes (FSRS flashcard drills, mock interview transcript evaluations). Outer margin is `margin-lg` (2.5rem) with `gutter-lg` (1.5rem).
- **Tablet (768px - 1279px):** 8-column layout. Sidebars collapse to icon-only navigation or drawer states. Margins shift to `margin-md` (1.5rem), gutters to `gutter-md` (1.25rem).
- **Mobile (< 768px):** 4-column compact flow. Main tracking interfaces convert to single-column vertical stacks. Quick-log actions dock fixed to the bottom thumb zone with standard `margin` (1rem) and `gutter` (1rem).

Vertical spacing strictly relies on multiples of `0.25rem` (4px baseline). Component internal padding leverages `space-sm` (0.5rem) and `space-md` (0.75rem) to ensure a compact, information-dense operational dashboard.

## Elevation & Depth

This system avoids heavy, diffuse drop shadows, using a combination of tonal layering, calibrated surface translucency, and low-contrast perimeter borders to establish distinct spatial planes.

- **Ground Level (Canvas):** Tone `#090d16`. Solid, non-interactive base surface.
- **Layer 1 (Card & Module Base):** Background `#0f1523`, delimited by a subtle border: `1px solid rgba(148, 163, 184, 0.08)`.
- **Layer 2 (Hovered States & Active Nodes):** Background `#161f33`, accented with an inner perimeter highlight: `inset 0 1px 0 0 rgba(255, 255, 255, 0.05)` and a micro ambient shadow `0 4px 12px -2px rgba(0, 0, 0, 0.4)`.
- **Layer 3 (Modals, Command Palette & Floating Sheets):** High-density surface `#131b2e` backed by a `backdrop-blur-md` overlay (`rgba(9, 13, 22, 0.8)`). Outer border sharpens to `1px solid rgba(148, 163, 184, 0.16)`.
- **Active State Highlights:** Elements receiving focus or undergoing AI processing cast a 12px localized aura colored to match the context: Emerald glow (`rgba(16, 185, 129, 0.15)`) for habit/mastery, Indigo glow (`rgba(99, 102, 241, 0.2)`) for AI evaluation.

## Shapes

The geometric identity is defined by a controlled `Soft` profile (`roundedness: 1`), projecting an engineered, utilitarian aesthetic reminiscent of precision hardware and IDE terminals.

- **Micro Components (Chips, Badges, Hotkey tags):** `rounded` (0.125rem / 2px). Tight corners reflect dense data utility.
- **Interactive Controls (Buttons, Inputs, Selectors):** `rounded-md` (0.375rem / 6px). Balances tactile comfort with crisp geometry.
- **Containers & Surfaces (Cards, FSRS Review Cards, Dialogs):** `rounded-lg` (0.25rem / 4px). Encloses information modularly without softening structural boundaries.
- **Data Visualizations & Skill Tree Nodes:** Rigid hexagonal or sharp-cornered rounded rectangles (`rounded-sm`, 2px) to communicate structural progression and logic branches. Fully circular elements are reserved exclusively for avatars and radial completion rings — those use the explicit `rounded-[9999px]` utility, **not** `rounded-full` (which resolves to 0.75rem / 12px here).

## Components

### Buttons & Interactive Triggers
- **Primary (Mastery / Commit):** Solid Emerald (`#10b981`), foreground `#042f2e` (deep teal-black), font `JetBrains Mono` weight 600. Hover: brightness ramp to 105% with a sharp click compression (`scale-[0.98]`).
- **AI Action (Synthesize / Evaluate):** Gradient boundary `rgba(99, 102, 241, 0.4)` over a dark `#181e36` core, Indigo text (`#818cf8`), accompanied by an animated spark indicator.
- **Ghost / Utility:** Transparent background, `1px solid rgba(148, 163, 184, 0.12)`, text `#94a3b8`. Hover: background `rgba(255, 255, 255, 0.04)`, text `#f8fafc`.

### Quick-Log Input Sheets & Fields
- Inputs feature background `#0c101c`, a recessed inset border `1px solid rgba(148, 163, 184, 0.12)`, and text `Be Vietnam Pro` body-md.
- Focus state eliminates the OS ring, utilizing an explicit border transition to Emerald (`#10b981`) or Indigo (`#6366f1`) with zero layout shift.
- Floating quick-log bars accept raw text alongside keyboard triggers (e.g., `/habit`, `/review`, `@tag`) styled via inline `JetBrains Mono` chips.

### Flashcard Review Units (FSRS System)
- Symmetrical cards built with `#0f1523`, minimum height of 340px, centering questions in `headline-sm` with optional code snippets.
- Evaluation bar contains 4 keyboard-bound intervals (`[1] Lại`, `[2] Khó`, `[3] Tốt`, `[4] Dễ`) styled with color-coded baseline indicators: Red, Amber, Emerald, and Indigo. Subtext displays predicted memory stability intervals in `label-sm`.

### Skill Tree Nodes & Progress Bars
- Linear progress bars feature track height `4px` or `6px` in `#1a233a`, with active fills in radiant `#10b981` incorporating a subtle horizontal gradient pulse during active sessions.
- Skill Tree nodes are organized as modular cards with active status rings, connection paths traced via 1.5px dashed borders (`rgba(148, 163, 184, 0.2)`), illuminating to solid Emerald when prerequisites are completed.

### AI Evaluator & Mock Interview Feedback Panels
- Container: Surface `#12182b` framed by a `1px` subtle border in `rgba(99, 102, 241, 0.3)`.
- Features segmented scoring chips (e.g., `Ngữ pháp: 9/10`, `Tư duy: 8/10`, `Độ mạch lạc: 9.5/10`) using `label-md` on `rgba(99, 102, 241, 0.1)` backgrounds.
- Real-time transcription streams display interim tokens in zinc-400 (`#94a3b8`), snapping to off-white (`#f8fafc`) once confirmed by the evaluator engine.
