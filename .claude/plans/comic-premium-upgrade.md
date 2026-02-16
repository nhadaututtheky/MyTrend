# MyTrend "Comic Premium" Upgrade Plan

> Goal: Nang cap UI/UX MyTrend tu "basic comic sketch" len "Comic Premium"
> Giu nguyen DNA hand-drawn nhung them depth, polish, va modern UX patterns.
> Song song: stabilize codebase tu session bi gian doan truoc.

## Current State (Audit Result)
- Build: 0 errors, 3 CSS warnings (line-clamp)
- Routes: 18/19 FUNCTIONAL, 1 placeholder (/trends hub)
- Components: 12 comic components, all working
- Types: Complete type system (273 lines)
- Docker: 3-service compose (PocketBase + SvelteKit + Nginx)
- Real-time: PocketBase subscriptions on all collections
- Hub: Claude API streaming with SSE, token tracking

---

## Phase 0: Codebase Stabilization [CRITICAL]

### 0.1 Fix CSS Warnings
- Fix 3 line-clamp warnings in ProjectCard, conversations, search
- Add standard `line-clamp` property alongside `-webkit-line-clamp`

### 0.2 Lint & Test Audit
- Run npm run lint, fix errors
- Run npm run test, verify test suite
- Verify all routes render without runtime errors

### 0.3 Audit Incomplete Features
- Check all API endpoints completeness
- Verify stores (auth, theme, toast, sync)
- Check Hub streaming endpoint
- Decide: keep or remove service-worker.ts

### 0.4 Git Cleanup
- Review 47+ modified files
- Commit in logical batches
- Clean working tree

---

## Phase 1: "Neon Sketch" Design System [HIGH]

### 1.1 CSS Variables Upgrade (app.css)
New vars:
  --glow-green: 0 0 12px rgba(0,210,106,0.15)
  --glow-blue: 0 0 12px rgba(78,205,196,0.15)  
  --glow-red: 0 0 12px rgba(255,71,87,0.15)
  --shadow-neon: hard-shadow + subtle glow combined
  --transition-sketch: 250ms cubic-bezier(0.4,0,0.2,1)

### 1.2 Dark Mode Enhancement
- Deeper blacks, more contrast
- Subtle glow on accent borders (hover)
- Active nav items glow in sidebar
- Cards get faint type-colored shadow

### 1.3 New Animations
  @keyframes sketch-wobble  -> rotation wiggle on hover
  @keyframes neon-pulse     -> glow pulse for active items
  @keyframes sketch-fade-in -> opacity + rough reveal

### 1.4 Sketch Skeleton Loader
- ComicSkeleton.svelte: rough rectangles that flicker
- Variants: card, text-line, chart, avatar

---

## Phase 2: Bento Grid Dashboard [HIGH]

### 2.1 BentoGrid Component
- CSS Grid with variable cell sizes (span support)
- Responsive: 4col -> 2col -> 1col

### 2.2 Dashboard Redesign (/ route)
Layout:
  +------------------+----------+----------+
  |   Stats Overview |  Quick   | Activity |
  |   (span 2x1)    |  Actions | Streak   |
  +------------------+----------+----------+
  |  Trend Chart     | Top      | Recent   |
  |  (span 2x1)     | Topics   | Ideas    |
  +------------------+----------+----------+
  |  Project Cards (span 3x1, horizontal scroll) |
  +----------------------------------------------+

### 2.3 Enhanced Stats Cards
- Inline Rough.js sparklines
- Trend arrows (sketch style)
- Count-up animation on load

### 2.4 Quick Actions Panel
- New Conversation, Quick Idea, Import, Recent searches

---

## Phase 3: New Components [MEDIUM]

### 3.1 ComicSkeleton - loading placeholders
### 3.2 ComicSparkline - tiny inline Rough.js charts
### 3.3 ComicBentoCard - grid-span aware card
### 3.4 ComicDataTable - sortable, paginated, sketch-styled
### 3.5 ComicEmptyState - rough illustration + message

### 3.6 Existing Component Polish
- ComicCard: variant="neon" for dark glow
- ComicButton: Rough.js loading spinner
- ComicInput: search variant with icon
- ComicBadge: animated pulse prop
- ComicTabs: slide indicator
- ComicDialog: slide-from-right (drawer mode)

---

## Phase 4: Layout & Navigation [MEDIUM]

### 4.1 Sidebar: neon glow active, section dividers, tooltips
### 4.2 Header: expandable search, breadcrumbs, notifications
### 4.3 AI Drawer (NEW): right panel, reuses Hub components, persists across pages

---

## Phase 5: Page Upgrades [MEDIUM]

### 5.1 Dashboard: Bento + greeting + streak
### 5.2 Projects: Bento cards + progress bars + status filter
### 5.3 Conversations: DataTable + source badges + filters
### 5.4 Ideas: visual board + list/grid toggle + quick-add
### 5.5 Trends: smoother heatmap + date range + bubble chart
### 5.6 Hub: code highlighting + streaming animation
### 5.7 Search: instant + tabs + history
### 5.8 Graph: zoom/pan + node details + type filter

---

## Phase 6: Performance & Polish [LOW]

### 6.1 Lazy load charts, code splitting, service worker
### 6.2 Accessibility: ARIA, keyboard nav, reduced motion
### 6.3 Error boundaries, 404 page, consistent spacing

---

## Agent Strategy (Token-Optimized Parallel Streams)

Stream A (Stabilize):  Phase 0 -> build-error-resolver + Bash
Stream B (Design):     Phase 1 -> direct edit (CSS focused)
Stream C (Components): Phase 3 -> direct edit (Svelte focused)
Stream D (Layout):     Phase 4 -> direct edit

After A+B:
Stream E (Dashboard):  Phase 2 -> depends on BentoGrid + Sparkline
Stream F (Pages):      Phase 5 -> per-page upgrades

Final:
Stream G (Polish):     Phase 6 -> code-reviewer + accessibility

## Session Rules
1. Phase complete -> git commit with phase ref
2. Plan updated with checkmarks
3. Session break -> read plan + git log to resume
4. Commit format: feat(phase-N): description
