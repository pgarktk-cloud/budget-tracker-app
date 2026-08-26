---
name: Technical Ledger
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#4c4546'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#006c4a'
  on-secondary: '#ffffff'
  secondary-container: '#82f5c1'
  on-secondary-container: '#00714e'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1b1b'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#85f8c4'
  secondary-fixed-dim: '#68dba9'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
  surface-primary: '#F9F9F9'
  surface-secondary: '#FFFFFF'
  text-muted: '#64748B'
  status-success: '#059669'
  status-attention: '#F87171'
  border-hairline: '#E4E2E4'
typography:
  display-currency:
    fontFamily: Source Serif 4
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
  display-currency-mobile:
    fontFamily: Source Serif 4
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  instrument-value:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  section-header:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.05em
  instrument-title:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.1em
  grid-content:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
spacing:
  margin-mobile: 20px
  margin-desktop: 32px
  section-padding: 24px
  gap-module: 20px
  gutter: 1px
---

# Technical Ledger (Technical Grid System)

A high-precision, console-inspired design system designed for household financial clarity. It replaces traditional "soft" UI metaphors (shadows, cards, rounded glass) with a strict "Technical Grid" architecture defined by 1px hairline dividers, monospaced data instrumentation, and a hybrid typographic scale.

## Typography

The system uses a strict hierarchy balancing characterful financial figures with technical metadata.

- **Primary Figures:** `Source Serif 4`, Semi-Bold. Used for major currency amounts (e.g., Net Worth, Total Burn).
- **Technical Metadata:** `Inter` (or system Monospace for figures). Used for instrumentation, labels, and secondary figures.
- **Labels:** `Inter`, All-Caps, Bold, 12px, tracking-wider. Used for section headers and instrumentation titles.
- **Body:** `Inter`, Regular. Used for list items and secondary descriptions.

| Role | Font Family | Size | Weight | Case |
| :--- | :--- | :--- | :--- | :--- |
| **Display Currency** | Source Serif 4 | 28px - 36px | 600 | Normal |
| **Instrument Title** | Inter | 12px | 700 | ALL CAPS |
| **Instrument Value** | Inter (Mono) | 24px | 600 | Normal |
| **Section Header** | Inter | 14px | 700 | ALL CAPS |
| **Grid Content** | Inter | 14px | 400 | Normal |

## Color Palette

The palette is functional and semantic, prioritizing status over decoration.

- **Surface (Primary):** `#f9f9f9` (Cream/Light Gray).
- **Surface (Secondary):** `#ffffff` (Pure White for interactive containers).
- **On-Surface (Primary):** `#000000` (Pure Black for primary amounts and text).
- **On-Surface (Secondary):** `#64748B` (Muted Slate for labels and technical metadata).
- **Semantic - Success:** `#059669` (Jade Green). Used for "On Track" status and positive progress.
- **Semantic - Attention:** `#F87171` (Coral Red). Used for "Over Budget" or "Warning" states.
- **Semantic - Primary Action:** `#000000` (Black) or `#059669` (Jade) for FABs/primary buttons.

## Layout & Spacing

The "Technical Grid" uses a strict modular approach.

- **Grid System:** Defined by `1px` hairline dividers (Border Color: `#e4e2e4`). No shadows or elevations.
- **Page Margins:** 20px - 24px (Mobile), 32px+ (Desktop).
- **Section Padding:** 24px - 32px for primary blocks.
- **Component Gaps:** 16px - 24px vertically between technical modules.
- **Density:** High. Content is packed for glanceability, using dividers instead of white space to separate intent.

## Components & Elements

### Containers & Dividers
- **The Hairline Architecture:** All sections are separated by `1px` solid borders.
- **Bento Modules:** Content is grouped into flat, bordered rectangular sections.
- **Corner Radius:** Minimal to None (0px - 4px). Use `0px` for section dividers and `8px` only for primary "floating" UI like FABs or bottom nav containers.

### Navigation
- **Top App Bar:** Minimalist. Large Title (Source Serif 4), profile avatar (top right), and sync indicators.
- **Bottom Nav (Mobile):** Fixed, white background, `1px` top border. Uses simple outline icons with text labels. High-contrast active state.
- **FAB:** Circular, high-contrast (Jade or Black), minimal shadow.

### Data Visualization
- **Technical Progress Bars:** 4px - 8px height. Solid fills. Use Jade (Success) or Coral (Warning). Gray background track.
- **Instrumentation Headers:** Multi-column layouts (2 or 3 columns) showing key metrics side-by-side, separated by vertical hairlines.
- **Trend Indicators:** Small pill-shaped badges with `+` or `-` percentages using semantic colors.

### Inputs & Forms
- **Technical Form Grid:** Inputs are arranged in a strict grid separated by hairlines.
- **Monospaced Figures:** Currency inputs always use monospaced fonts for alignment.

## Alignment & Hierarchy
1.  **Metric First:** Always lead with the primary financial amount in `Source Serif 4`.
2.  **Instrumentation Context:** Follow amounts with all-caps technical labels and monospaced comparisons.
3.  **Strict Borders:** Never use shadows to separate sections; use a 1px divider.
4.  **Glanceable Status:** Use semantic colors (Jade/Coral) only for status-critical information.
