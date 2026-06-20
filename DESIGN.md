---
name: RallyFire
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#b6c7e7'
  on-secondary: '#20314a'
  secondary-container: '#374762'
  on-secondary-container: '#a5b6d5'
  tertiary: '#ffffff'
  on-tertiary: '#2e3132'
  tertiary-container: '#e1e3e4'
  on-tertiary-container: '#626566'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#b6c7e7'
  on-secondary-fixed: '#091c34'
  on-secondary-fixed-variant: '#374762'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Montserrat
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  stats-number:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '900'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  container-max: 1280px
  gutter: 20px
---

## Brand & Style
The design system is engineered to capture the high-velocity energy of competitive tennis while maintaining the communal warmth of a local club. The brand personality is **Athletic, Precise, and Vibrant**. It targets serious players who track stats and casual enthusiasts looking for matches.

The visual style is **Modern Athleticism**, blending high-contrast color theory with a clean, systematic layout. It utilizes wide gutters and ample whitespace to ensure clarity during high-intensity use-cases (like mid-match scoring). The emotional response should be one of "readiness"—the UI feels fast, responsive, and professional, mirroring the state of a player on the baseline.

## Colors
The palette is rooted in the physical environment of the sport.
- **Electric Lime (#CCFF00):** The primary action color, derived from a fresh tennis ball. Used for high-priority CTAs, progress indicators, and active states.
- **Deep Court Blue (#1A2B44):** The secondary color, providing a professional, stable foundation reminiscent of hard-court surfaces.
- **Crisp White (#F8F9FA):** Used for typography on dark backgrounds and for secondary cards to maintain high legibility.
- **Midnight Neutral (#0F172A):** The core background color to allow the Electric Lime to "pop" with maximum vibrance.

Status colors follow standard conventions but are saturated to match the primary palette: Success (Emerald), Warning (Amber), and Critical (Crimson).

## Typography
Typography is built on a hierarchy of power and precision. **Montserrat** is used for all headlines and display text; its geometric construction and bold weights convey strength. For specific score-tracking and statistics, an italicized heavy weight of Montserrat is used to suggest forward motion and speed.

**Inter** handles all functional and body text. Its high x-height ensures that match details, player bios, and rules remain legible even at smaller sizes on mobile devices. All labels use an uppercase treatment with slight letter-spacing to distinguish them from interactive body elements.

## Layout & Spacing
The design system utilizes a **fluid 12-column grid** for desktop and a **4-column grid** for mobile. A strict 8px spatial grid governs all padding and margins to maintain mathematical harmony.

- **Mobile:** 16px side margins with 12px gutters. Content is primarily stacked in single-column cards.
- **Desktop:** 40px side margins with 24px gutters. Use asymmetrical layouts (8 columns for main content, 4 for stats/leaderboards) to create visual interest.
- **Rhythm:** Use "lg" spacing (40px) between major sections to allow the bold typography room to breathe.

## Elevation & Depth
This design system uses **Tonal Layering** combined with **Ambient Shadows** to create a sense of focused hierarchy.

1.  **Base (Level 0):** Midnight Neutral (#0F172A).
2.  **Surface (Level 1):** Deep Court Blue (#1A2B44). Used for primary cards and navigation bars.
3.  **Overlay (Level 2):** Lighter tint of the secondary color with a soft, diffused shadow (15% opacity, 20px blur, 8px offset). Used for modals and active cards.

To emphasize the "Electric Lime" primary color, use a faint outer glow (2px-4px) on primary buttons instead of a traditional drop shadow, making them appear self-illuminated against the dark background.

## Shapes
The shape language is **Rounded**, balancing the aggression of the colors with an approachable feel.
- **Buttons and Inputs:** 0.5rem (8px) radius.
- **Cards and Containers:** 1rem (16px) radius to create a distinct frame for content.
- **Profile Avatars:** Always circular to contrast against the predominantly rectangular grid.
- **Interactive States:** On hover, elements should slightly scale (1.02x) to provide tactile feedback.

## Components
- **Buttons:** Primary buttons are solid Electric Lime with black text for maximum contrast. Secondary buttons use a Deep Court Blue stroke with White text.
- **Scoreboard Cards:** Use a high-contrast layout with large "stats-number" typography. The background of the winning side should have a subtle Electric Lime left-border accent.
- **Chips:** Small, pill-shaped indicators for match types (e.g., "Singles", "Tournament"). Use a low-opacity Electric Lime fill with 100% opacity text.
- **Input Fields:** Dark backgrounds with a subtle border. On focus, the border transitions to Electric Lime with a soft outer glow.
- **Match Lists:** Use clean, horizontal rows with 16px internal padding. Separate rows with a 1px border in a lighter tint of the secondary color.
- **Progress Bars:** For skill levels or match completion, use a thick 8px bar with an Electric Lime fill and a Deep Court Blue track.