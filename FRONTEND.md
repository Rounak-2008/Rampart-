# RAMPART Frontend — Step 1 Setup

## Overview

This document describes the frontend project structure, design system, and common layout established in Step 1. The foundation is ready for building individual product pages in Step 2.

## Folder Structure

```
rampart-frontend/
├── index.html                 # Entry point; layout demo
├── FRONTEND.md               # This file — frontend documentation
├── css/
│   ├── variables.css         # Design tokens: colors, typography, spacing
│   ├── base.css              # Global resets and base element styles
│   ├── layout.css            # App shell: header, sidebar, main content
│   └── components.css        # Reusable UI components
├── js/
│   └── app.js                # Main application shell logic
├── pages/                    # (To be created in Step 2)
│   ├── dashboard.html
│   ├── repositories.html
│   ├── pull-requests.html
│   ├── contributors.html
│   ├── alerts.html
│   ├── trust-network.html
│   └── notifications.html
├── assets/
│   └── icons/               # (Optional SVG icons)
└── docs/                    # Additional documentation
```

## Design System

### Color Palette

All colors are defined as CSS variables in `css/variables.css`:

- **Primary**: `#4f46e5` (Indigo) — main actions, active states
- **Success**: `#16a34a` (Green) — vouches, positive signals
- **Danger**: `#dc2626` (Red) — denounces, suspicious activity
- **Warning**: `#d97706` (Amber) — alerts, pending review
- **Neutrals**: Background, surface, border, and text colors

### Typography

- **Font Family**: System fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI"...`)
- **Scale**: `xs` (12px) → `xxl` (36px)
- **Weights**: Regular (400), Medium (500), Semibold (600), Bold (700)

### Spacing

4px base unit scale:
- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 24px
- `--space-6`: 32px
- `--space-7`: 40px
- `--space-8`: 48px

### Components

All reusable UI components are in `css/components.css`:

- **Buttons**: Primary, secondary, success, danger; plus `-sm` and `-lg` sizes
- **Form Elements**: Input, textarea, select, labels, help text, error states
- **Badges**: Status labels with color variants (primary, success, danger, warning)
- **Cards**: Panels with optional header, title, subtitle
- **Navigation Links**: Sidebar nav with hover/active states
- **Alerts**: Info, success, warning, danger callouts
- **Tables**: Data table styling with hover effects
- **Tabs**: Tab navigation with active state
- **Empty State**: Centered placeholder for no-data views

## Layout

### Application Shell (Responsive Grid)

The layout is a sticky header + sidebar + main content structure:

```
┌─────────────────────────────────────┐
│  Header (64px, sticky)              │
├────────┬──────────────────────────┤
│        │                          │
│ Sidebar│     Main Content         │
│ (240px)│     Area                 │
│ (sticky│                          │
│  left) │                          │
│        │                          │
└────────┴──────────────────────────┘
```

**Breakpoints:**
- **Desktop** (1024px+): Full sidebar visible
- **Tablet** (768–1023px): Sidebar collapses to icon rail (~72px)
- **Mobile** (<768px): Sidebar becomes off-canvas drawer, header shows menu toggle

### HTML Structure

Every page should follow this shell:

```html
<div class="app-shell" data-page="page-key">
  <aside class="app-sidebar">
    <!-- Brand, navigation, footer -->
  </aside>

  <header class="app-header">
    <!-- Menu toggle, search, profile -->
  </header>

  <main class="app-main">
    <div class="app-main__inner">
      <!-- Page content -->
    </div>
  </main>
</div>

<div class="app-overlay"></div>
<script src="js/app.js"></script>
```

## JavaScript (`js/app.js`)

The main application module handles:

- **Mobile nav toggle**: Sidebar open/close on small screens
- **Active page marking**: Sets `is-active` class on nav links based on `data-page` attribute
- **API helper**: `APP.api.get()`, `APP.api.post()`, etc. for backend calls
- **Responsive handling**: Closes mobile nav when resizing back to desktop

### Usage

Every page must include `js/app.js` and set the `data-page` attribute on `.app-shell`:

```html
<div class="app-shell" data-page="dashboard">
  <!-- Page content -->
</div>
```

### API Integration

The API helper is ready for backend integration:

```javascript
// GET request
APP.api.get('/repositories')
  .then(data => console.log(data))
  .catch(error => console.error(error));

// POST request
APP.api.post('/repositories', {
  owner: 'gyash7995-oss',
  repo: 'my-project'
})
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

Default API base URL: `http://localhost:8000/api` (can be overridden via environment variable).

## Steps for Step 2 (Page Building)

Each product page will:

1. Use the shared layout (header + sidebar)
2. Import the design system CSS
3. Include `js/app.js`
4. Build page-specific content using the component library
5. Connect to backend APIs via `APP.api.*` helpers
6. Keep interactions within the `.app-main__inner` area

## Responsive Testing

### Desktop (1024px+)
- Full sidebar visible
- Header search prominent
- Multi-column layouts possible

### Tablet (768–1023px)
- Sidebar collapses to icons
- Header search still visible
- Tap-friendly buttons (min 48px)

### Mobile (<768px)
- Sidebar hidden, toggle button in header
- Search hidden
- Single-column layouts
- Full-width components

## Current State

✅ **Complete:**
- Layout shell (header, sidebar, responsive grid)
- Design tokens (colors, typography, spacing)
- Component library (buttons, forms, badges, cards, alerts, tables, tabs)
- Navigation structure with active state marking
- Mobile responsiveness with toggle drawer
- API helper for backend integration

❌ **Not yet implemented:**
- Individual product pages (Dashboard, Repositories, etc.)
- Backend API endpoints
- Real data fetching
- Authentication / login

## Next Steps (Step 2)

1. Build `pages/dashboard.html` with repository stats and alerts
2. Build `pages/pull-requests.html` with PR list and filtering
3. Build `pages/contributors.html` with contributor profiles
4. Build `pages/alerts.html` with suspicious activity alerts
5. Build `pages/trust-network.html` with relationship visualization
6. Connect all pages to backend APIs

## Testing the Layout

To view the layout demo:

1. Open `index.html` in a browser
2. Test the sidebar toggle on mobile (< 768px)
3. Try resizing the window to see responsive changes
4. Click nav links to see active state change

No backend required for the layout — it's fully static and demonstrates all available components.
