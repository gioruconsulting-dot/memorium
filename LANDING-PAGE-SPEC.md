# **Repetita — Landing Page Spec**

**Date**: 4 April 2026 **Status**: Ready to build **What**: Rebuild the sign-in page (`/sign-in`) as a landing page for sharing with external people **Why**: Current sign-in page is a bare Clerk widget — doesn't explain what Repetita is

---

## **Design Direction**

**Aesthetic**: Minimal/premium (Linear, Notion vibe) with a retro/neon hero logo that provides personality. The logo is the bold element; everything else is restrained.

**Core principle**: Remove everything removable. If a UI element doesn't earn its spot, cut it.

---

## **Page Structure (top to bottom)**

### **1\. Logo with Animated Orbital Rings (\~40% of mobile screen)**

* Logo image at `/public/logo-repetita.png`  
* Size: 160px tall on mobile, 220px on desktop  
* **Critical**: Apply `mix-blend-mode: lighten` on the `<img>` — the logo is a JPEG with black background, this makes the black invisible against our dark page  
* 5 concentric CSS orbital rings surround the logo (see Ring Spec below)

### **2\. Tagline**

* Text (two lines): Stop forgetting.Start remembering.  
* Font: DM Sans, weight 600, 20px mobile / 24px desktop  
* Color: var(--color-foreground) (\#e8e6e1)  
* Letter-spacing: \-0.01em, centered

### **3\. Three Steps**

Three centered text lines, 3-4px gap between them:  
 Choose what to learnGet daily questionsLet spaced repetition work its magic

*   
* Font: DM Sans, weight 400, 13px mobile / 15px desktop  
* Color: \#60A5FA (azure) at 80% opacity  
* No numbers, no icons, no bullets

### **4\. Animated Counter \+ Sign-In CTA**

**Counter** (above button):

* Text: `[count]+ questions generated and counting`  
* Font: DM Sans, weight 500, 14px, color var(--color-foreground)  
* Animated count-up from 0 → target over 1.8s, ease-out cubic, 800ms start delay  
* Round displayed number down to nearest 100, append "+"  
* Use `font-variant-numeric: tabular-nums` (prevents digit width jiggle)  
* Target comes from `GET /api/stats/public` — show "—" while loading

**Clerk SignIn** (the CTA):

* Use Clerk's `<SignIn />` with appearance prop to achieve:  
  * No card border/container — transparent background  
  * Violet (\#7c3aed) filled button with white text  
  * No header text, no footer/"Secured by Clerk" text  
  * Rounded-xl, shadow, font-semibold  
    Test multiple times to make sure it renders accurately

**Fine print** (below Clerk widget):

* Text: `Free to use · No credit card required`  
* Font: DM Sans, 12px, var(--color-muted) at 70% opacity

### **5\. Footer**

* Text: `Powered by spaced repetition science`  
* Font: DM Sans, 12px, var(--color-muted) at 50% opacity  
* At bottom of page (after flex spacer or absolute positioned)

---

## **Background: Starry Sky**

* 60-80 small white dots (1-2px) at random positions, full page  
* Each star has a twinkle animation: opacity oscillates 0.2 ↔ 0.85, randomized duration (2-5s) and delay (0-5s)  
* **Gradient overlay**: fades from transparent at top to \~90% background opacity (\#121210) at \~70% page height — stars visible behind logo, faded out behind text  
* Stars are absolutely positioned divs, pointer-events: none  
* Generate star positions once via useState lazy initializer (don't regenerate on re-render)

---

## **Ring Spec (5 Orbital Rings)**

All rings are pure CSS — @keyframes for rotation \+ glow, no JS libraries.

| Ring | Offset from logo | Border | Style | Direction | Rotation speed | Glow delay |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| 1 | \+50px | 2px | dashed | clockwise | 70s | 0s |
| 2 | \+90px | 1.5px | dashed | counter-clockwise | 55s | 1.2s |
| 3 | \+125px | 1.5px | dotted | clockwise | 80s | 2.4s |
| 4 | \+158px | 1px | dashed | counter-clockwise | 45s | 3.6s |
| 5 | \+188px | 1px | dotted | clockwise | 90s | 4.8s |

**Base colors** (alternating): Rings 1, 3, 5 \= violet (\#7c3aed). Rings 2, 4 \= azure (\#60A5FA).

**Glow pulse animation** (per ring):

* 6 second cycle  
* 0%/100%: base color border \+ subtle matching box-shadow  
* 50%: border shifts to \#EEFF99 (yellow) \+ yellow box-shadow glow  
* Outer rings have progressively lower glow intensity (ring 1 brightest, ring 5 faintest)  
* Staggered by 1.2s between rings → creates outward ripple effect

---

## **New API Endpoint**

### **GET /api/stats/public**

File: `/app/api/stats/public/route.js`

* No authentication required (called from sign-in page, user isn't logged in yet)

---

## **Color Reference**

| Purpose | Value |
| ----- | ----- |
| Page background | \#121210 (var(--color-background)) |
| Primary text | \#e8e6e1 (var(--color-foreground)) |
| Muted text | \#8a8880 (var(--color-muted)) |
| Border | \#333330 (var(--color-border)) |
| Brand accent (logo) | \#EEFF99 |
| Steps text (azure) | \#60A5FA |
| CTA button (violet) | \#7c3aed |
| Ring glow (yellow) | \#EEFF99 |

---

## **Files to Change**

| Action | File | Notes |
| ----- | ----- | ----- |
| MODIFY | `/app/sign-in/[[...sign-in]]/page.js` | Full rebuild — read existing file first |
| CREATE | `/app/api/stats/public/route.js` | Public endpoint, no auth |
| ADD | `/public/logo-repetita.png` | Logo file (placed manually) |

---

## **Constraints**

* No new npm dependencies — pure CSS \+ vanilla JS for animations  
* Page must be a client component ('use client') for counter animation \+ star generation  
* Don't change middleware — unauthenticated users still redirect to /sign-in  
* Don't modify any other pages, components, or the sign-up page  
* Don't create separate CSS files — use Tailwind \+ inline styles for custom animations  
* Mobile-first: design for 390px width, then scale up  
* DM Sans font throughout (already loaded in the app via next/font/google)  
* Slight scroll on mobile is acceptable — but the Google button should be at least partially visible on first load (no scrolling)

---

## **Known Risks**

1. **Logo sizing on mobile**: Outermost ring is \~350px wide on 390px screen. If it clips on a real device, reduce outer ring offsets by 10-15%.  
2. **Clerk appearance styling**: Clerk's internal markup can be unpredictable. The appearance config above is a starting point — may need inspection of rendered HTML to get selectors right. Priority: no card chrome, violet button, no header/footer.  
3. **Logo swap in future**: Just replace `/public/logo-repetita.png` with new file. No code changes needed if aspect ratio is similar.

---

## **Post-Build Checklist**

* \[ \] Stars twinkle on page load  
* \[ \] All 5 rings rotate (mix of clockwise/counter-clockwise)  
* \[ \] Yellow glow ripples outward across rings  
* \[ \] Counter animates from 0 to actual DB count  
* \[ \] Clerk Google button is violet with white text  
* \[ \] No Clerk card border or "Secured by Clerk" footer visible  
* \[ \] Logo blends cleanly into background (no black rectangle)  
* \[ \] Steps text is azure, tagline is foreground color, fine print is muted  
* \[ \] Works on mobile 390px — button visible without scrolling (or with minimal scroll)  
* \[ \] Works on desktop — content centered, generous whitespace

