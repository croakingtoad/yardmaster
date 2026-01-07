# Yardmaster TUI - Color Scheme Proposal

## Design Philosophy: "Railway Professional"

As a senior color designer, I'm proposing a refined palette that:
- **Creates visual hierarchy** (eye naturally flows to important info)
- **Reduces eye strain** (softer tones, no harsh primaries)
- **Maintains railway theme** (steel, slate, warm amber accents)
- **Guides attention** (strategic color placement)
- **Professional aesthetic** (modern terminal UI standards)

---

## Current vs Proposed Color Palette

### 🎨 Current Issues

| Element | Current Color | Issue |
|---------|--------------|-------|
| Headers | `#00FFFF` (Cyan) | Too harsh, hurts eyes |
| Status | `#00FF00` (Pure green) | Screaming bright |
| Title | `#7D56F4` (Purple) | Decent but could be warmer |
| Selection | `#7D56F4` bg | Works but generic |
| Borders | `#7D56F4` | OK but could match theme better |

### ✨ Proposed Palette

#### **Primary Colors** (Brand Identity)
```
Railway Blue:    #5B9BD5  (Steel blue - professional, calming)
Amber Accent:    #F4A261  (Warm amber - highlights, calls-to-action)
Slate:           #475569  (Cool gray - secondary text)
```

#### **Semantic Colors** (Status & Feedback)
```
Success Green:   #6EE7B7  (Soft mint - active, healthy)
Caution Amber:   #FCD34D  (Warm yellow - warnings)
Danger Red:      #F87171  (Soft coral - errors, destructive)
Info Blue:       #60A5FA  (Sky blue - informational)
```

#### **UI Structure** (Hierarchy)
```
Background:      Terminal default
Text Primary:    #E2E8F0  (Soft white - main content)
Text Secondary:  #94A3B8  (Cool gray - labels)
Text Muted:      #64748B  (Darker gray - hints)
Border Primary:  #475569  (Slate - main borders)
Border Accent:   #5B9BD5  (Railway blue - important borders)
```

---

## Visual Mockup: List View

```
  🚂 Yardmaster TUI                                    [Railway Blue, Bold]

  📊 Active Port Registrations (3) • Page 1/1         [Railway Blue, Bold]

  ❯ switchyard                                        [Amber bg, White text]
    Port: 1225 • 🟢 ACTIVE • 🔒 Secured               [Railway Blue • Mint • Slate]
    https://locomotive.ngrok.dev                       [Info Blue, Underlined]

    myproject-api                                      [Soft White]
    Port: 3042 • 🟢 ACTIVE • 🔓 No Auth               [Railway Blue • Mint • Muted]
    https://abc-def-ghi.ngrok.app                      [Info Blue]

    testapp                                            [Soft White]
    Port: 4500 • 🟢 ACTIVE • 🔓 No Auth               [Railway Blue • Mint • Muted]
    (not tunneled)                                     [Muted, Italic]

  ────────────────────────────────────────────        [Border: Slate]
  [M] Menu • [Enter] Details • [R] Refresh • [Q] Quit [Muted]
```

---

## Visual Mockup: Detail View

```
╭──────────────────────────────────────────────────────────────────╮  [Border: Railway Blue]
│                                                                  │
│  🚂 Yardmaster TUI                                              │  [Railway Blue, Bold]
│                                                                  │
│  📍 Port Details: switchyard                                    │  [Amber, Bold]
│                                                                  │
│  ╭────────────────────────────────────────────────────────────╮ │
│  │                                                            │ │
│  │  App Name:          switchyard                            │ │  [Soft White]
│  │  Port:              1225                                  │ │  [Amber, Bold]
│  │  Status:            🟢 ACTIVE                             │ │  [Mint Green]
│  │  Process ID:        45123                                 │ │  [Secondary]
│  │  Binary:            node                                  │ │  [Info Blue]
│  │  Working Dir:       ~/repos/switchyard                    │ │  [Sky Blue]
│  │                                                            │ │
│  │  ──────────────── Tunnel Information ────────────────     │ │  [Railway Blue]
│  │                                                            │ │
│  │  Public URL:        https://locomotive.ngrok.dev          │ │  [Amber, Underlined]
│  │  Domain Type:       🌐 Custom Domain (Reserved)           │ │  [Mint]
│  │  Region:            us                                    │ │  [Secondary]
│  │                                                            │ │
│  │  ──────────────── Security ────────────────               │ │  [Railway Blue]
│  │                                                            │ │
│  │  Authentication:    🔒 Basic Auth Enabled                 │ │  [Mint]
│  │  IP Restrictions:   🔒 Enabled                            │ │  [Mint]
│  │                                                            │ │
│  │  ──────────────── Metadata ────────────────               │ │  [Railway Blue]
│  │                                                            │ │
│  │  Registered:        Jan 6, 2026 3:50:15 PM               │ │  [Secondary]
│  │  Uptime:            2 hours ago                           │ │  [Info Blue]
│  │  Managed By:        yardmaster                            │ │  [Secondary]
│  │                                                            │ │
│  ╰────────────────────────────────────────────────────────────╯ │
│                                                                  │
│  [Esc] Back • [E] Edit • [D] Delete • [C] Copy URL • [Q] Quit  │  [Muted]
│                                                                  │
╰──────────────────────────────────────────────────────────────────╯
```

---

## Color Rationale

### **Railway Blue (#5B9BD5)** - Primary Brand
- Used for: Title, section headers, borders, port numbers
- Why: Professional, calming, evokes steel/industrial theme
- Psychology: Trust, reliability, technical competence

### **Amber Accent (#F4A261)** - Call to Action
- Used for: Selected items, important values (like port numbers), ngrok URLs
- Why: Warm, inviting, draws eye without screaming
- Psychology: Energy, optimism, actionable items

### **Mint Green (#6EE7B7)** - Success States
- Used for: Active status, security enabled
- Why: Softer than pure green, still clearly "good"
- Psychology: Health, active, positive

### **Sky Blue (#60A5FA)** - Information
- Used for: URLs, process info, uptime
- Why: Distinct from Railway Blue, clearly informational
- Psychology: Calm, informative, accessible

### **Slate (#475569)** - Structure
- Used for: Borders, dividers, secondary text
- Why: Recedes visually, provides structure without competing
- Psychology: Stable, professional, infrastructure

---

## Visual Hierarchy

**Level 1: Critical Info** (Amber, Bold)
- Port numbers
- App names when selected
- ngrok URLs

**Level 2: Important Context** (Railway Blue, Bold)
- Section headers
- App title
- Navigation headers

**Level 3: Active Status** (Mint Green)
- Status indicators
- Security enabled states
- Success messages

**Level 4: Supporting Info** (Soft White/Secondary)
- Labels, metadata, timestamps
- Process details

**Level 5: Hints** (Muted Slate)
- Keyboard shortcuts
- Help text

---

## Implementation Preview

### Proposed Colors in Hex

```go
// Brand Colors
railwayBlue   = "#5B9BD5"  // Primary brand, headers
amberAccent   = "#F4A261"  // Highlights, CTAs
slate         = "#475569"  // Structure, borders

// Semantic Colors
successGreen  = "#6EE7B7"  // Active, success, enabled
cautionAmber  = "#FCD34D"  // Warnings
dangerRed     = "#F87171"  // Errors, destructive
infoBlue      = "#60A5FA"  // Links, information

// Text Hierarchy
textPrimary   = "#E2E8F0"  // Main content
textSecondary = "#94A3B8"  // Labels
textMuted     = "#64748B"  // Hints, help

// UI Structure
borderPrimary = "#475569"  // Standard borders
borderAccent  = "#5B9BD5"  // Important borders
bgSelected    = "#334155"  // Selected row (dark slate)
bgHighlight   = "#F4A26133" // Subtle amber tint (20% opacity)
```

---

## Key Improvements

1. **Reduced Eye Strain**: No pure primaries (#00FFFF → #5B9BD5)
2. **Clear Hierarchy**: Amber draws eye to actionable items
3. **Professional Feel**: Industrial/railway theme throughout
4. **Better Contrast**: Softer colors still meet WCAG AA standards
5. **Semantic Consistency**: Green=good, Amber=caution, Red=danger

---

## A/B Comparison

### Port Number Display

**Before**: `Port: 3000` (cyan header + white text)
**After**: `Port: 3000` (railway blue label + amber bold number)

### Selection

**Before**: Pure purple background (#7D56F4)
**After**: Amber background (#F4A261) with subtle shadow

### URLs

**Before**: White text, no emphasis
**After**: Sky blue (#60A5FA) with underline

---

## Recommendation

**Implement the "Railway Professional" palette** for:
- More sophisticated appearance
- Better visual hierarchy
- Reduced eye strain
- Stronger brand identity (railway theme)
- Professional color relationships

The mockup shows how colors work together to guide the user's attention naturally from title → headers → key values → supporting info → hints.
