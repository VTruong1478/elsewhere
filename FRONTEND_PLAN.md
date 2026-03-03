# Elsewhere — Frontend Plan

Next.js App Router + Tailwind. Mobile-first; desktop feed and layout must match the provided Figma mockup 1:1. This plan follows the design system strictly; no improvisation.

---

## 1. Design Tokens

### 1.1 Token naming scheme

Use a consistent prefix and scale name so Tailwind (or CSS variables) can reference them. Example pattern: `--elsewhere-{category}-{name}` or Tailwind theme keys like `elsewhere.colors.primary`.

- **Colors:** Map each palette entry to a semantic token. Primary, secondary, accent, background, surface, surface-alt (border), surface-chip, text, text-secondary, text-tertiary, text-inverse, status-high, status-medium, status-low, overlay-selected (white 15%).
- **Typography:** One token per style. **Lora** is used only for display and headings (display-xl through heading-italic). **DM Sans** is used only for body, UI labels, buttons, and captions (body-l/m/s, ui-button, ui-label-l/m/s, ui-caption, ui-overline). Each style = font-family + font-size + line-height + font-weight (+ italic where specified). Do not mix font families within a single component except as defined in the token tables (e.g. a card may use a heading token = Lora and a body token = DM Sans). Do not override weight beyond the defined token weight.
- **Spacing:** All spacing uses the 4px base scale; allowed values only: 4, 8, 12, 16, 20, 24, 32, 40 (see Spacing Rules (Strict) below). Mobile margin 16, gutter 8; tablet margin 24, gutter 16; desktop margin 40, gutter 24. Map to tokens for margin, gutter, and generic spacing from the allowed scale only.
- **Radii:** Only two values: 8px and 16px. Token names e.g. radius-sm (8), radius-md (16). No other border-radius values.
- **Shadows:** One shadow only: Shadow Map — y=2, blur=8, color #2F2F2F at 50% opacity. Token name e.g. shadow-map. Use shadow-map ONLY if the Figma mockup shows a shadow on that element; if Figma shows no shadow, use no shadow at all.
- **Interaction states:** Hover, pressed, and selected use ONLY the selected overlay (#FFFFFF at 15% opacity). No other overlays, no derived colors, no new hex values. Disabled and focus use only existing palette (e.g. opacity reduction, accent/primary focus ring).

### 1.2 Color token table

| Token role | Hex / value | Use |
|------------|-------------|-----|
| primary | #4F5D3F | Primary actions, high emphasis |
| secondary | #8C9F7B | Secondary elements |
| accent | #3E4F73 | Accent (e.g. links, highlights) |
| background | #EFEBE0 | Page background |
| surface | #FCF9F4 | Cards, panels |
| surface-alt / border | #D2D4C7 | Borders, dividers (use at 1px; see Borders rule below) |
| surface-chip | #D8D3C6 | Chip background |
| text | #2F2F2F | Primary text |
| text-secondary | #6B6A62 | Secondary text |
| text-tertiary | #9B9A91 | Tertiary text |
| text-inverse | #FFFFFF | Text on dark/primary |
| status-high | #4F5D3F | Positive/success |
| status-medium | #C4943A | Warning/medium |
| status-low | #A85C3A | Error/low |
| overlay-selected | #FFFFFF 15% | Selected state overlay |

**Borders:** All borders use surface-alt (#D2D4C7) at 1px. No other border colors or widths unless specified in Figma.

### 1.3 Typography token table (Lora — display and headings only)

Lora is used only for display and heading styles. Do not use Lora for body text, labels, buttons, or captions.

| Token | Font | Size/line | Weight | Notes |
|-------|------|-----------|--------|-------|
| display-xl | Lora | 48/56 | Bold | |
| display-l | Lora | 32/40 | Bold | |
| heading-xl | Lora | 28/36 | Bold | |
| heading-l | Lora | 24/32 | Bold | |
| heading-m | Lora | 20/28 | Bold | |
| heading-s | Lora | 16/24 | Bold | |
| heading-italic | Lora | 24/32 | Bold Italic | |

### 1.4 Typography token table (DM Sans — body, UI labels, buttons, captions only)

DM Sans is used only for body text, UI labels, buttons, and captions. Do not use DM Sans for display or heading styles.

| Token | Font | Size/line | Weight | Notes |
|-------|------|-----------|--------|-------|
| body-l | DM Sans | 16/24 | Regular | |
| body-m | DM Sans | 14/24 | Regular | |
| body-s | DM Sans | 12/20 | Regular | |
| ui-button | DM Sans | 16/20 | Bold | |
| ui-label-l | DM Sans | 16/20 | Bold | |
| ui-label-m | DM Sans | 12/16 | Bold | |
| ui-label-s | DM Sans | 10/14 | Bold | |
| ui-caption | DM Sans | 12/20 | Regular | |
| ui-overline | DM Sans | 10/14 | Bold, UPPERCASE | |

**Typography rules:** Do not mix font families within a single component unless the combination is defined in the token tables (e.g. heading + body on a card = Lora + DM Sans per tokens). Do not override font-weight beyond the defined token weight for each style.

### 1.5 Radii and shadows

- **Radii:** Only 8px and 16px. Map to two tokens (e.g. radius-sm = 8px, radius-md = 16px). Use nowhere else.
- **Shadows:** Shadow-map is the only shadow allowed (y=2, blur=8, #2F2F2F at 50%). Use shadow-map ONLY if the Figma mockup shows a shadow on that element; if Figma shows no shadow, use no shadow at all.

### 1.6 Spacing Rules (Strict)

- All spacing must use a **4px base scale**.
- **Allowed spacing values only:** 4, 8, 12, 16, 20, 24, 32, 40 (units in px when implemented).
- No arbitrary spacing values (e.g. 10px, 18px, 22px, etc.).
- Component padding (cards, chips, buttons, metric tiles, nav, overlay cards) must use only the allowed spacing scale.
- Gaps between elements must use spacing tokens from this scale only.
- Do not hardcode pixel spacing outside the defined scale.

### 1.7 Z-Index Scale

Use only the following z-index values; no arbitrary z-index values outside this scale.

| Value | Use |
|-------|-----|
| 10 | Card overlays / selected overlay layer |
| 20 | Dropdowns / popovers |
| 30 | Map overlay card |
| 40 | Top navigation |
| 50 | Modals |

---

## 2. Breakpoints and Grid

### 2.1 Breakpoints

| Breakpoint | Range | Columns | Margin | Gutter |
|------------|--------|---------|--------|--------|
| Mobile | 320–480px | 4 | 16px | 8px |
| Tablet | 481–1024px | 8 | 24px | 16px |
| Desktop | 1025px+ | 12 | 40px | 24px |

### 2.2 Layout rules by breakpoint

- **Mobile:** Single column; content full width within margin. Bottom tabs for primary nav. Top area for search + filter chips. Feed scrolls as single scroll context. Map (if shown) typically full-screen or as overlay; behavior to match Figma (e.g. list-first with map as alternate view).
- **Tablet:** Use 8-column grid; content can span multiple columns. Decide from Figma whether nav is top bar or bottom tabs; keep feed and map relationship consistent with desktop if applicable.
- **Desktop:** Split view: Feed on the left, Map on the right, matching the provided Figma mockup 1:1. Top nav bar spans full width. Feed column scrolls independently; map view stays fixed (no scroll). Column widths and proportions must match the screenshot. No layout improvisation.

### 2.3 Scroll behavior

- Desktop: Feed is the only scrolling region in the left column; map (right) is fixed. Top nav remains fixed. Overflow and scroll containers must be set so only the feed scrolls.
- Mobile/tablet: Per Figma — typically one main scroll for feed; map as separate view or overlay as designed.

---

## 3. Component Inventory

### 3.1 App shell and navigation

- **App shell:** Wrapper for layout (background color token), safe areas, and main content slot. Uses grid/layout rules for current breakpoint.
- **Top nav (desktop):** Full-width bar; contains logo/brand, primary nav items, and any global actions. Matches Figma mockup exactly (height, padding, typography, colors). Uses margin 40 (desktop), spacing scale for padding, z-index 40 (per z-index scale), and allowed colors only.
- **Bottom tabs (mobile):** Tab bar fixed to bottom; tabs for main sections (e.g. Feed, Map, Favorites, Profile). Uses surface and border (surface-alt 1px). Min tap target 44px. Selected state: overlay-selected (white 15%) on top of tab background.

### 3.2 Feed and search

- **Search bar:** Input for feed search (q). Typography: body or UI label per design (DM Sans only). Border radius 8px or 16px only. Border: surface-alt (#D2D4C7) 1px. Background surface or surface-alt. Focus state with focus ring using accent or primary; no new colors. Optional search icon (Lucide).
- **Filter chips:** Horizontal set of chips (All spots, Quiet, Free, Libraries, Open late). Background surface-chip; selected = base + overlay-selected (15% white). Border radius 8px or 16px only. Typography UI label or body. Spacing between chips from spacing scale.

### 3.3 Place cards and metrics

- **Place card:** Card for one place in the feed. Surface background, border surface-alt 1px (if bordered), border radius 8px or 16px. Shadow: use shadow-map only if the Figma mockup shows a shadow on the card; otherwise no shadow. Contains: place name (heading token = Lora), address/secondary text (body/caption token = DM Sans), metric tiles (Noise, Tables, Outlets), pills (per MVP pill rule below), match badge, save button, and any “Open until” / “Closing soon” / “Open late” text. Selected state: overlay-selected (#FFFFFF 15%) on top of card. Font mix per token table only.
- **Match badge:** Displays match score percent (and optionally 2–3 “why matched” reasons). Uses typography and colors from palette only (e.g. primary or accent for score). No custom shapes or colors.
- **Metric tiles (Noise / Tables / Outlets):** Three metrics with exact UI labels. Noise: Silent / Quiet / Vibrant. Tables: Limited / Mixed / Ideal (with 5-dot display: Limited=1 filled, Mixed=3, Ideal=5; frontend-only mapping; backend stores category only). Outlets: None / Limited / Ample. Typography UI label or caption; colors text and text-secondary. Tiles laid out per Figma (e.g. side by side or stacked).
- **Pills:** Small tags (e.g. “study rooms”, “cozy nooks”). Surface-chip or surface-alt background; border radius 8px only; typography ui-caption or body-s. No new colors.
- **Pills on feed cards (MVP rule):** For each place card, use the data provided by the feed API (backend computes per backend plan). Display rule: for each place, take the most recent N ratings where N = 20; collect all values from `ratings.pills` across those ratings; select the top 2 pill strings by frequency; if there are no pills in that window, show none — render nothing in the pills row (no empty row, no placeholder).

### 3.4 Actions and map

- **Save button:** Button or icon to save/unsave place (favorite). Uses primary or secondary color; selected state = overlay-selected (#FFFFFF 15%) or filled state per Figma. Icon from Lucide unless Figma specifies a custom SVG.
- **Rate button:** Triggers rating flow (noise, tables, outlets, wifi, vibe, pills, notes). Style: primary or secondary per Figma; typography ui-button; border radius 8px or 16px.
- **Map:** Map view is implemented with **Google Maps**. Styling should remain consistent with the design system where the map UI (controls, overlay card) is concerned; do not invent new colors for map styling. Use default Google Maps styling for MVP unless a custom style is provided (e.g. from Figma or design). **Google Maps controls policy:** Disable default Google Maps UI controls (zoom, map type, fullscreen) unless explicitly required. If controls are needed, build custom controls using the Elsewhere design system (spacing, colors, radii from this plan). Do not introduce Google’s default UI styling into the app chrome. Map tile styling remains default Google styling for MVP unless a custom map style is provided.
- **Map pins:** Pin marker per place. **Scale definition:** Default pin scale = 1; selected pin scale = 1.15. When motion is allowed: selected pin scales to 1.15 with a subtle bounce. When prefers-reduced-motion is enabled: selected pin switches instantly to scale 1.15 with no animation and no bounce. Unselected: no animation. No other animation anywhere in the app (see Accessibility).
- **Map overlay card:** Compact place card shown on the map when a pin is selected. Same design system as place card (surface, radii 8/16, typography, metric labels). Position per Figma. Z-index: 30 (per z-index scale). Shadow: use shadow-map only if Figma shows a shadow on this element; otherwise no shadow.

### 3.5 Auth and onboarding

- **Login:** Screen for Google sign-in. Background, surface, and text tokens only. One primary button “Sign in with Google”; typography ui-button. No extra illustrations or colors unless in Figma.
- **Onboarding:** Steps for radius, noise preference, needs outlets, needs wifi, vibe preference. Form controls (inputs, toggles, chips) use only palette + overlay-selected. Lora for headings, DM Sans for body and labels. Radii 8px and 16px only.

### 3.6 Profile and empty states

- **Profile:** Screen for user info and preferences (and possibly sign-out). Uses same typography and color tokens. No new components beyond app shell, headings, body text, and buttons/chips.
- **Empty states (MVP):** When a list or section has no content (e.g. no favorites, no search results), use a placeholder empty state: a Lucide icon + friendly text. Use only existing typography and palette; no new colors. If custom illustrations are added later, they can replace the placeholder.

---

## 4. Metrics and Levels (exact UI labels)

- **Noise:** Silent | Quiet | Vibrant. Display these three labels only; map backend values (silent/quiet/vibrant) to these title-case labels.
- **Tables:** Limited | Mixed | Ideal. Backend stores category only. Frontend 5-dot display: Limited = 1 filled dot, Mixed = 3 filled dots, Ideal = 5 filled dots. No other mapping.
- **Outlets:** None | Limited | Ample. Display as-is (title-case from backend none/limited/ample).

Use these strings exactly in the UI; no synonyms or alternate wording.

---

## 5. Interaction States (strict)

Hover, pressed, and selected use ONLY the selected overlay: #FFFFFF at 15% opacity. No other overlays, no derived colors, no new hex values.

- **Hover:** Apply overlay-selected (#FFFFFF 15%) over the component background. **Desktop hover feedback:** Hover feedback is allowed but must be **instant** (no animation or transition). No fade transitions, no easing, no transform animations. Cursor must show pointer on interactive elements.
- **Pressed / Active:** Apply overlay-selected (#FFFFFF 15%) over the component background (same overlay; may combine with active styling per Figma, but no additional colors).
- **Selected:** Apply overlay-selected (#FFFFFF 15%) over the component background. Used for selected chip, selected card, selected tab.
- **Disabled:** Use only existing palette: reduce visibility via text-tertiary and/or opacity on the element (e.g. 50% opacity). No new hex values; no separate “disabled” color.
- **Focus:** Visible focus ring for keyboard users. Ring color: accent (#3E4F73) or primary (#4F5D3F) only; ring width and offset from spacing scale. Ensure 3:1 contrast against background (WCAG AA for focus indicator).

**Overlay implementation rule:** The selected overlay (#FFFFFF at 15% opacity) must be applied as a **layered overlay** (e.g. pseudo-element or separate overlay layer). Do NOT reduce opacity of the entire component. Do NOT modify the base background color. Text and icons must retain full opacity and contrast. The overlay must not affect accessibility contrast compliance (contrast is measured against the underlying surface; the overlay is a visual state indicator only).

Do not use lighter/darker shades, derived colors, or any overlay other than #FFFFFF at 15%.

---

## 6. Accessibility (WCAG AA)

### 6.1 Contrast

- **Text on background/surface:** Primary text (#2F2F2F) on #EFEBE0 / #FCF9F4 must meet 4.5:1 for normal text, 3:1 for large text (e.g. headings 18pt+ or 14pt+ bold).
- **Text secondary/tertiary:** #6B6A62 and #9B9A91 on background/surface: verify contrast for their use (e.g. secondary text ≥ 4.5:1 where required for readability; tertiary for non-essential text).
- **Text inverse on primary/secondary/accent:** #FFFFFF on #4F5D3F, #8C9F7B, #3E4F73 — check 4.5:1 and use for buttons/links only where contrast passes.
- Document any combination that does not meet AA and restrict it to decorative or non-essential use only.

### 6.2 Focus styles

- All interactive elements (links, buttons, chips, form controls, card links) must have a visible focus indicator.
- Use only allowed colors: accent or primary for focus ring; no new hex values.
- Ring must meet at least 3:1 contrast against the component background.

### 6.3 Tap targets and keyboard

- Minimum touch target size: 44×44px for taps (buttons, chips, list rows, icon buttons).
- All interactive UI must be reachable and activatable via keyboard (Tab, Enter, Space). Feed, cards, and map pins must be keyboard-focusable where they are actionable.
- Logical tab order; no trap focus unless a modal is open (then trap within modal and return focus on close).

### 6.4 Motion

- **prefers-reduced-motion: respect:** When prefers-reduced-motion is enabled, map pin selection still changes to the selected scale state (scale 1.15) but with no bounce and no animation — instant state change only. All other animations and transitions (hover, page transitions, etc.) must be disabled. No other animations anywhere in the app.
- **Desktop hover:** Hover feedback is instant only (no transition or animation); see Interaction States. Cursor pointer on interactive elements.

---

## 7. Icons

- **Default:** Lucide React for all standard UI (search, save, close, chevrons, settings, etc.). Use one size/style set consistently (e.g. 20px or 24px for primary actions).
- **Custom SVGs:** Only when a specific icon must match Figma exactly and Lucide has no equivalent. Do not invent new icon styles or add decorative icons beyond design.

---

## 8. File and Folder Structure (Next.js App Router)

Recommendation only; adjust to team conventions.

- **app:** Route segments. Layouts per breakpoint (e.g. (auth), (app) with feed/map split on desktop). Pages: feed, map, places/[id], favorites, onboarding, login, profile. Route handlers only where needed (e.g. API proxy for photos); most data from Server Components or client fetch per backend plan.
- **components:** Reusable UI. Subfolders suggested: ui (buttons, inputs, chips), feed (search bar, filter chips, place card, match badge, metric tiles, pills), map (pins, overlay card), layout (app shell, top nav, bottom tabs), auth (login form), onboarding (steps), profile, empty-state. One component per file; no code in this plan.
- **lib:** Utilities (formatting, distance, API clients), constants (metrics labels, filter chip keys), and any shared helpers. Types in lib or a dedicated types folder.
- **styles:** Global CSS and Tailwind entry. Design tokens (colors, typography, spacing, radii, shadows) defined here or in tailwind.config; single source of truth for the token naming scheme.
- **types:** Shared TypeScript types (place, rating, user preferences, feed item) if not colocated with components or lib.

Keep styles and tokens in one place; reference tokens from Tailwind config or CSS variables so components do not hardcode hex or pixel values.

---

## 9. Build Order Checklist

- Set up Next.js App Router project and Tailwind; install Lora and DM Sans (e.g. next/font or link).
- Define design tokens (colors, typography, spacing, radii, shadow, z-index) in Tailwind theme or CSS variables; enforce 8px/16px radii, spacing scale (4, 8, 12, 16, 20, 24, 32, 40) only, z-index scale (10, 20, 30, 40, 50) only, and no extra colors.
- Implement app shell: desktop split view (feed left, map right, top nav) and mobile layout (single column, bottom tabs); match Figma for desktop 1:1.
- Build top nav (desktop) and bottom tabs (mobile) with correct typography and colors; selected state = overlay-selected.
- Add search bar and filter chips; wire to feed query params (q, filter) per backend plan.
- Build place card: surface, radii, shadow only if Figma shows a shadow on the card (shadow-map; otherwise none); match badge, metric tiles (Noise/Tables/Outlets with exact labels; tables 5-dot frontend mapping), pills per MVP rule (top 2 from last 20 ratings, or nothing), save and rate buttons; “Open until” / “Closing soon” / “Open late” copy.
- Implement map with Google Maps: map view, pins (animate/scale on select only; instant state change when prefers-reduced-motion), overlay card (shadow only if Figma shows it); feed and map data from same feed API.
- Add login and auth callback; then onboarding (radius, noise, outlets, wifi, vibe) and profile.
- Implement place detail page (rating form: noise, tables, outlets, wifi, vibe, pills, notes); submit rating and favorites.
- Add empty states: placeholder (Lucide icon + friendly text) for feed, search, favorites; existing typography and palette only; custom illustrations can replace placeholder later.
- Run accessibility pass: contrast, focus styles, tap targets, keyboard nav, prefers-reduced-motion (instant map pin state change only; all other animation off).

---

## 10. Explicit “Do Not” Constraints

- **Colors:** Do not introduce any new hex values or new palette colors. Use only the defined primary, secondary, accent, background, surface, surface-alt, surface-chip, text, text-secondary, text-tertiary, text-inverse, status-high/medium/low, and overlay-selected (white 15%).
- **Radii:** Do not use any border-radius other than 8px and 16px.
- **Interaction states:** Hover, pressed, and selected must use ONLY the selected overlay (#FFFFFF at 15% opacity). No other overlays, no derived colors, no lighter/darker shades.
- **Animation:** Do not add animation anywhere except map pins (default scale 1, selected scale 1.15; with motion: scale + subtle bounce; when prefers-reduced-motion: instant scale 1.15 only, no bounce/animation). No hover transitions, page transitions, or micro-interactions elsewhere. Hover feedback is instant only.
- **Spacing:** Do not use spacing values outside the 4px scale: 4, 8, 12, 16, 20, 24, 32, 40 only. No arbitrary pixel spacing.
- **Overlay:** Apply overlay-selected as a layered overlay (pseudo-element or separate layer); do not reduce opacity of the entire component; do not modify base background; text/icons full opacity; overlay must not break contrast.
- **Z-index:** Use only the defined z-index scale (10, 20, 30, 40, 50). No arbitrary z-index values.
- **Map controls:** Do not introduce default Google Maps UI controls into the app chrome unless required; if needed, use custom controls from the design system.
- **Design:** Do not improvise. Desktop feed and layout must match the provided Figma mockup 1:1. If something is ambiguous or missing, ask instead of inventing.
- **Typography:** Do not use fonts other than Lora and DM Sans, or sizes/weights outside the defined styles (display-xl through ui-overline). Lora only for display and headings; DM Sans only for body, UI labels, buttons, captions. Do not mix font families within a component except as defined in the token tables. Do not override font-weight beyond the defined token weight.
- **Borders:** Use only surface-alt (#D2D4C7) at 1px for borders. No other border colors or widths unless specified in Figma.
- **Shadows:** Shadow-map is the only shadow allowed. Use it ONLY if the Figma mockup shows a shadow on that element; if Figma shows no shadow, use no shadow at all.
- **Icons:** Do not invent custom icon styles; use Lucide React or a custom SVG only when required to match Figma exactly.

This frontend plan is the single source of truth for the Elsewhere UI implementation. Any design suggestion or deviation should be confirmed before changing the plan or the design system.
