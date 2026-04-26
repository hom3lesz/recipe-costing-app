# Recipe Costing — Marketing Website Design Spec
**Date:** 2026-04-26  
**Status:** Approved

---

## Overview

A standalone Next.js marketing website for the Recipe Costing app — a Windows desktop GP calculator for restaurants and hospitality businesses. The site promotes the free desktop app, collects waitlist emails for the upcoming paid SaaS version, and is structured to become a full sales funnel when pricing launches.

**Not** the app itself. This is a separate public-facing product website.

---

## Project Setup

| Property | Value |
|----------|-------|
| Project location | Separate folder: `recipe-costing-website/` (desktop or chosen directory) |
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS v3 |
| Animations | Framer Motion |
| Language | TypeScript |
| Output | `output: 'export'` — static HTML/CSS/JS, deployable anywhere |
| Deployment target | Static host (Netlify, GitHub Pages, custom, etc.) |

---

## Visual Direction

**Style:** Dark hero sections + warm light content sections.

- Hero, nav, CTA banners, and footer use the dark navy palette
- Features, how-it-works, testimonials, pricing, FAQ use warm cream/off-white
- Hard edge transitions between dark and light sections (no gradual fade)
- Glassmorphism cards on dark sections only
- Clean white cards with soft shadows on light sections

### Colour Tokens

```
Dark palette:
  --dark-900: #0d0f18   (page background — dark sections)
  --dark-800: #131520
  --dark-700: #191c2a
  --dark-600: #1f2235
  --dark-500: #2a2d4a
  --dark-400: #35395c
  --dark-200: #5c6190
  --dark-100: #9196be
  --dark-50:  #e8eaf6

Amber palette:
  --brand-500: #e8a838   (primary CTA, headings)
  --brand-400: #f5d485   (gradient highlight)
  --brand-600: #c48c20   (darker amber)
  --brand-900: #78350f

Light palette:
  --light-bg:   #fdf8f0  (main light section background)
  --light-bg-2: #faf7f2
  --warm-accent: #c2773a (amber for light sections)
  --warm-text:   #2d1b0e
  --warm-muted:  #8b6555
  --warm-border: #e8d5c4
```

### Typography

- Font: **Inter** (Google Fonts — already used in app and existing landing.html)
- Headings: weight 900, tight tracking (`-0.03em`)
- Subheadings: weight 700
- Body: weight 400–500
- Small labels: weight 600, uppercase, wide tracking

### Effects

- Gradient text: `linear-gradient(135deg, #e8a838 0%, #f5d485 40%, #e8a838 80%)`
- Glassmorphism: `backdrop-blur(16px)`, `rgba(25,28,42,0.7)`, `border: 1px solid rgba(53,57,92,0.5)`
- Amber glow: `box-shadow: 0 0 40px rgba(232,168,56,0.2), 0 0 80px rgba(232,168,56,0.08)`
- Orb backgrounds: blurred radial circles, animated with pulse-glow keyframe

---

## Site Structure

6 pages, all statically generated:

| Page | Route | Type |
|------|-------|------|
| Home | `/` | Long scrolling landing page |
| Features | `/features` | Feature deep-dive |
| Pricing | `/pricing` | Pricing tiers + waitlist CTAs |
| Waitlist | `/waitlist` | Email capture + early access |
| About | `/about` | Mission + who it's for |
| Contact | `/contact` | Contact form + support info |

---

## File / Folder Structure

```
recipe-costing-website/
├── app/
│   ├── layout.tsx              # Root layout: Navbar + Footer + font
│   ├── page.tsx                # Home
│   ├── features/page.tsx
│   ├── pricing/page.tsx
│   ├── waitlist/page.tsx
│   ├── about/page.tsx
│   └── contact/page.tsx
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx          # Sticky nav, transparent → glass on scroll
│   │   └── Footer.tsx          # Links, social placeholders, newsletter
│   ├── sections/               # Full-width page sections (used in pages)
│   │   ├── Hero.tsx
│   │   ├── StatsBand.tsx
│   │   ├── ProblemSolution.tsx
│   │   ├── FeatureHighlights.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── Screenshots.tsx     # Auto-scroll marquee
│   │   ├── Testimonials.tsx
│   │   ├── PricingPreview.tsx  # Abbreviated — links to /pricing
│   │   ├── FAQ.tsx
│   │   └── FinalCTA.tsx
│   └── ui/
│       ├── Button.tsx          # Primary (shimmer amber), Secondary (glass), Ghost
│       ├── SectionWrapper.tsx  # Handles dark/light variant + max-width + padding
│       ├── AnimateIn.tsx       # Framer Motion scroll-trigger wrapper
│       ├── FeatureCard.tsx
│       ├── TestimonialCard.tsx
│       ├── PricingCard.tsx     # With Coming Soon badge variant
│       ├── FAQItem.tsx         # Accordion item
│       ├── CounterStat.tsx     # Animated number counter on scroll
│       └── WaitlistForm.tsx    # Email form with success state
├── lib/
│   └── data.ts                 # All static copy: features, FAQs, testimonials, pricing tiers, nav links
├── public/
│   └── screenshots/            # App screenshots (copy from app repo assets/)
│       ├── dashboard.png
│       ├── recipes.png
│       ├── detail.png
│       ├── home.png
│       ├── sidebar.png
│       └── logo.png
├── next.config.js              # output: 'export', images: unoptimized
├── tailwind.config.ts          # Custom colours, fonts, keyframes
├── tsconfig.json
└── package.json
```

---

## Pages — Detailed Section Breakdown

### 1. Home (`/`)

Sections in order:

1. **Hero** (dark)
   - Sticky nav overlay
   - Badge: "Built for professional kitchens"
   - Headline: "Know Your Numbers. Own Your Kitchen."
   - Sub: "Calculate recipe costs, GP%, allergens and nutrition in seconds."
   - CTAs: "⬇ Download for Windows — Free" (amber shimmer) + "Join the Waitlist →" (glass)
   - Social proof: avatar stack, star rating, "Free · No account needed"
   - 3D tilted app screenshot (rotateX 18deg), straightens as user scrolls
   - Background orb blobs

2. **Stats Band** (dark → transition)
   - 4 animated counters: 2k+ Chefs, 50k+ Recipes, 4.9★ Rating, £0 Forever Free

3. **Problem / Solution** (light)
   - Left: the problem (guessing prices, losing margin, spreadsheet chaos)
   - Right: the solution (Recipe Costing handles it automatically)

4. **Feature Highlights** (light)
   - 6-card grid, scroll-triggered stagger
   - GP Calculator, Ingredient Library, Dashboard Analytics, Allergen Tracking, PDF Export, Supplier Tracking

5. **How It Works** (light)
   - 3-step process: Add Ingredients → Build Recipes → Know Your Margin
   - Connector line between steps

6. **Screenshots Marquee** (dark)
   - Auto-scrolling horizontal strip of app screenshots, pauses on hover

7. **Testimonials** (light)
   - 3 placeholder testimonial cards (chef, caterer, bakery owner)

8. **Pricing Preview** (dark)
   - Abbreviated 3-card preview with "Coming Soon" badges
   - CTA: "See full pricing →"

9. **FAQ** (light)
   - 6 common questions, accordion expand/collapse

10. **Final CTA** (dark)
    - "Ready to know your numbers?" headline
    - Dual CTAs: Download + Waitlist

11. **Footer** (dark)
    - Logo, nav links, social placeholders, copyright

---

### 2. Features (`/features`)

- Hero (dark, shorter): "Every tool you need to run a profitable kitchen"
- Feature sections: one per major feature, alternating left/right layout with app screenshot + copy
  - Recipe Costing Calculator
  - Ingredient Library
  - GP% & Profit Calculator
  - Dashboard & Analytics
  - Allergen Tracking (14 allergens)
  - Supplier & Price Tracking
  - PDF / Print Export
  - What-If Modeller
  - Sub-Recipe Support
- CTA section: Download or Join Waitlist

---

### 3. Pricing (`/pricing`)

- Header (dark): "Simple, transparent pricing"
- Monthly/Yearly toggle (spring animation, saves % badge on yearly)
- 3 pricing cards (light section):

  | Tier | Monthly | Yearly | Features |
  |------|---------|--------|---------|
  | Starter | £9/mo | £79/yr | 1 location, 50 recipes, core features |
  | Professional | £19/mo | £159/yr | Unlimited recipes, exports, allergen reports |
  | Business | £39/mo | £319/yr | Multi-location, team access, priority support |

- All cards show **"Coming Soon"** badge + "Join Waitlist" CTA
- Pro card is visually highlighted (amber border + glow)
- Note: "Currently available as a free Windows desktop app"
- Code comment: `{/* TODO: Replace href with Stripe payment link when ready */}`
- FAQ section: "What happens when pricing launches?", "Is the desktop app staying free?", etc.
- Comparison table (light section)

---

### 4. Waitlist (`/waitlist`)

- Hero (dark): "Be first. Get early access."
- Benefits section (light): what early access members get
  - Locked-in early-bird pricing
  - Direct input on features
  - Priority onboarding support
  - Lifetime discount on annual plan
- Form (light, centered):
  - Name (text)
  - Email (email, required)
  - Business type (select: Restaurant, Café, Bakery, Catering, Meal Prep, Other)
  - Message (textarea, optional)
  - Submit button: "Join the Waitlist" (amber shimmer)
- Success state: checkmark animation + "You're on the list!" message
- Social proof: "Join 500+ food businesses already signed up"
- Note: Form submission is a client-side no-op placeholder. Wire up to Formspree, EmailJS, or a custom API route — marked with `// TODO: Connect to form handler`

---

### 5. About (`/about`)

- Hero (dark): "Built for the people who feed the people"
- Mission section (light): Why this exists — food businesses fail because of bad pricing
- Who it's for (light): chefs, bakers, caterers, restaurants, meal prep, hospitality groups
- Why GP% matters (light): editorial-style section with key stat callouts
- Values section (light): Simple, Accurate, Honest
- CTA (dark): Download or Join Waitlist

---

### 6. Contact (`/contact`)

- Header (dark): "Get in touch"
- Two-column layout (light):
  - Left: contact form (name, email, subject, message)
  - Right: info cards (support email placeholder, business inquiry, response time)
- Social media placeholders (Twitter/X, LinkedIn, Instagram)
- CTA strip: "Just want the app? Download it free →"

---

## Shared Components — Specs

### Navbar
- Fixed top, full width
- Logo left, nav links centre, CTA right
- Dark sections: transparent background, white text
- Light sections: blurred white/glass background, dark text (detected via scroll position)
- Mobile: hamburger → full-screen slide-down menu
- Links: Features, How it Works, Pricing, About + "Download Free" primary button + "Join Waitlist" ghost link

### Button variants
- **Primary**: amber shimmer gradient, dark text, rounded-2xl, shadow
- **Secondary**: glass (dark sections) or white with border (light sections), rounded-2xl
- **Ghost**: text only with underline hover

### AnimateIn
- Wraps any children with Framer Motion
- Default: fade up from 30px, 0.5s ease-out
- Supports `delay` and `stagger` props for card grids

### PricingCard
- Props: `tier`, `price`, `yearlyPrice`, `features[]`, `highlighted`, `comingSoon`
- When `comingSoon`: renders badge + disabled-style CTA
- Comment in code: `{/* Stripe: replace this href with checkout link */}`

### WaitlistForm
- Controlled form with validation
- Submit → shows loading spinner → success state (no page reload)
- Comment: `{/* TODO: wire up to form handler — Formspree, EmailJS, or custom API */}`

---

## Animations Summary

| Element | Animation |
|---------|-----------|
| Hero headline | Slide up + fade in on load |
| Hero app screenshot | Float (translateY loop), straightens on scroll |
| Background orbs | Slow pulse-glow opacity loop |
| Nav | Background fade-in on scroll |
| Feature cards | Staggered fade-up on scroll enter |
| Stat counters | Count from 0 to target when in viewport |
| Screenshots marquee | Continuous horizontal scroll, pauses on hover |
| Pricing toggle | Spring layout animation on price switch |
| FAQ accordion | Height animate + rotate chevron |
| Waitlist form success | Scale in + checkmark draw |
| Page transitions | Framer AnimatePresence fade |

---

## SEO & Metadata

Each page exports a `metadata` object:
```ts
export const metadata: Metadata = {
  title: 'Recipe Costing — Know Your Numbers. Own Your Kitchen.',
  description: '...',
  openGraph: { ... },
}
```

- Semantic HTML: `<main>`, `<section>`, `<article>`, `<nav>`, `<footer>`
- Alt text on all images
- Accessible form labels
- Focus-visible states on all interactive elements

---

## Data Layer (`lib/data.ts`)

All copy lives here — not hardcoded in components:
- `features[]` — name, description, icon, screenshot
- `testimonials[]` — name, role, business, quote, avatar placeholder
- `faqs[]` — question, answer
- `pricingTiers[]` — name, monthly, yearly, features[], highlighted, comingSoon
- `navLinks[]`
- `socialLinks[]` — placeholder hrefs

---

## Future-Ready Hooks

All payment and form integrations are marked with `TODO` comments:
- Stripe checkout links on every CTA button in `/pricing`
- Form submission handler in `/waitlist` and `/contact`
- Analytics (GA4 or Plausible) stub in root layout
- A/B testing note on hero headline

---

## Out of Scope (for now)

- Blog / news section (can be added later with MDX)
- Product roadmap page
- Countdown timer (add when launch date is set)
- Real testimonials (placeholder copy used)
- Real form backend (Formspree / EmailJS / custom API — marked with TODOs)
- Authentication / account system
