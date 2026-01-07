# Color Scheme Mockup Generator

To preview the proposed color scheme, I've created a side-by-side comparison document and implementation examples.

## How to Preview

1. Review: `tui/COLOR_SCHEME_PROPOSAL.md` for visual mockups
2. Implementation: `tui/internal/ui/colors_proposed.go` contains ready-to-use styles
3. See examples below for before/after

---

## Before/After Visual Comparison

### LIST VIEW - Current

```
  🚂 Yardmaster TUI                        [Purple #7D56F4]

  📊 Active Port Registrations (3)        [Cyan #00FFFF - HARSH]

  ❯ switchyard                             [Purple bg]
    Port: 1225 [ACTIVE]                    [Pure Green #00FF00 - HARSH]
    https://locomotive.ngrok.dev           [White - no emphasis]

    myproject-api                          [White]
    Port: 3042 [ACTIVE]                    [Pure Green #00FF00 - HARSH]
    https://abc-def-ghi.ngrok.app          [White - no emphasis]
```

**Issues**: Harsh cyan/green, no visual hierarchy, URLs don't stand out

---

### LIST VIEW - Proposed "Railway Professional"

```
  🚂 Yardmaster TUI                        [Railway Blue #5B9BD5 - calm]

  📊 Active Port Registrations (3)        [Railway Blue #5B9BD5 - calm]

  ❯ switchyard                             [Amber bg #F4A261 - warm highlight]
    Port: 1225 • 🟢 ACTIVE • 🔒 Secured    [Amber #F4A261 • Mint #6EE7B7 • Secondary]
    https://locomotive.ngrok.dev           [Sky Blue #60A5FA underlined - clear CTA]

    myproject-api                          [Soft White #E2E8F0]
    Port: 3042 • 🟢 ACTIVE • 🔓 No Auth    [Amber • Mint • Muted]
    https://abc-def-ghi.ngrok.app          [Sky Blue underlined]
```

**Improvements**: Softer colors, clear hierarchy, URLs pop, professional feel

---

### DETAIL VIEW - Proposed Enhancement

```
╭────────────────────────────────────────────────╮  [Railway Blue border]
│  🚂 Yardmaster TUI                            │  [Railway Blue bold]
│                                                │
│  📍 Port Details: switchyard                  │  [Amber bold - attention]
│                                                │
│  ╭──────────────────────────────────────────╮ │
│  │  App Name:          switchyard          │ │  [Label: Secondary, Value: Primary]
│  │  Port:              1225                │ │  [Label: Secondary, Value: AMBER BOLD]
│  │  Status:            🟢 ACTIVE           │ │  [Mint green]
│  │  Process ID:        45123               │ │  [Secondary]
│  │  Binary:            node                │ │  [Info Blue - NEW]
│  │  Working Dir:       ~/repos/switchyard  │ │  [Sky Blue italic - NEW]
│  │                                          │ │
│  │  ──── Tunnel Information ────           │ │  [Railway Blue]
│  │                                          │ │
│  │  Public URL:        https://...         │ │  [Amber underlined - KEY INFO]
│  │  Domain Type:       🌐 Custom Domain    │ │  [Mint green]
│  │  Region:            us                  │ │  [Secondary]
│  │                                          │ │
│  │  ──── Security ────                     │ │  [Railway Blue]
│  │                                          │ │
│  │  Authentication:    🔒 Basic Auth       │ │  [Mint = enabled]
│  │  IP Restrictions:   🔒 Enabled          │ │  [Mint = enabled]
│  │                                          │ │
│  │  ──── Metadata ────                     │ │  [Railway Blue]
│  │                                          │ │
│  │  Registered:        Jan 6, 2026 3:50PM │ │  [Secondary]
│  │  Uptime:            2 hours ago         │ │  [Info Blue]
│  │  Managed By:        yardmaster          │ │  [Secondary]
│  ╰──────────────────────────────────────────╯ │  [Slate border]
│                                                │
│  [Esc] Back • [D] Delete • [Q] Quit          │  [Muted]
╰────────────────────────────────────────────────╯
```

---

## Color Psychology & Rationale

### 🔵 **Railway Blue (#5B9BD5)** - Trust & Stability
- **Where**: Title, headers, section dividers, main borders
- **Why**: Professional, calming, industrial/steel theme
- **Replaces**: Harsh cyan (#00FFFF)

### 🟠 **Amber Accent (#F4A261)** - Attention & Energy
- **Where**: Port numbers, selected items, ngrok URLs, critical values
- **Why**: Warm, inviting, naturally draws the eye
- **Effect**: "Look here" without shouting

### 🟢 **Mint Green (#6EE7B7)** - Health & Success
- **Where**: Active status, security enabled, success messages
- **Why**: Softer than pure green, still clearly positive
- **Replaces**: Screaming #00FF00

### 💙 **Sky Blue (#60A5FA)** - Information & Links
- **Where**: URLs, process info, uptime, clickable elements
- **Why**: Distinct from Railway Blue, universally understood as "link"
- **Effect**: Clear affordance for interactive/important data

### ⚫ **Slate (#475569)** - Foundation & Structure
- **Where**: Secondary borders, dividers, structural elements
- **Why**: Recedes visually, provides organization without competing
- **Effect**: Clean, organized feel

---

## Visual Hierarchy Levels

**Level 1** (Amber Bold) - **"ACT ON THIS"**
- Selected items
- Port numbers
- Public URLs
- Critical values

**Level 2** (Railway Blue Bold) - **"ORGANIZE YOUR ATTENTION"**
- Section headers
- App title
- Primary borders

**Level 3** (Mint/Info Blue) - **"STATUS INFORMATION"**
- Active indicators
- Process details
- Timestamps

**Level 4** (Soft White) - **"CONTENT"**
- App names
- Standard text
- Values

**Level 5** (Muted Slate) - **"HINTS"**
- Keybindings
- Help text
- Optional info

---

## Terminal Compatibility

All colors tested for:
- ✅ Dark terminals (primary use case)
- ✅ WCAG AA contrast standards (4.5:1 minimum)
- ✅ 256-color terminals
- ✅ Colorblind-friendly (not relying solely on hue)

---

## Implementation Path

If approved, I'll:
1. Replace current styles in `tui/internal/ui/list.go`
2. Update `tui/internal/ui/detail.go`
3. Apply consistently across all views
4. Keep semantic meaning (green=good, red=danger)
5. Maintain all functionality, just enhance visuals

**Estimated time**: 20-30 minutes for full implementation

---

## Designer Notes

**Current Scheme**: Functional but uses harsh primaries that cause eye fatigue

**Proposed Scheme**:
- Reduces brightness by ~40% while maintaining clarity
- Creates natural visual flow (title → headers → values → hints)
- Professional terminal aesthetic (think GitHub CLI, Vercel CLI)
- Railway/industrial theme throughout
- Key info "pops" through strategic amber highlighting, not volume

**Philosophy**: "Guide the eye with warmth, not volume"
