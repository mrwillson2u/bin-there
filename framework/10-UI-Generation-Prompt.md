# UI Generation Prompt

> **Purpose:** Auto-generated prompt for UI design tools (Google Stitch, v0, Galileo AI, etc.)
> 
> **How to use:** After completing UX Framework and Visual Style Guide, ask the AI to generate this prompt. Then paste it into your UI generation tool.

---

## Generation Status

`[TODO: Not Generated / Generated on YYYY-MM-DD]`

---

## Generated Prompt

*AI: Replace the content below with a generated prompt based on the filled-out UX Framework and Visual Style Guide. Keep it structured for optimal AI UI generation, and keep it **compact — under ~150 lines**. Summarize from the docs; never paste whole documents in. See `examples/task-app/framework/10-UI-Generation-Prompt.md` for a complete worked example.*

```
[PROMPT WILL BE GENERATED HERE]
```

---

## Prompt Template

*AI: Use this template structure when generating the prompt. Fill in values from the framework docs.*

### App Overview
```
Build a [project type] called [name] for [target users].

Core purpose: [one-sentence description from Concept doc]
```

### User Context
```
Primary user: [persona name] — [brief description]
Key jobs to be done:
- [JTBD 1]
- [JTBD 2]
- [JTBD 3]

Main user flow: [primary journey from UX Framework]
```

### Screens / Views Needed
```
1. [Screen name]: [purpose, key elements]
2. [Screen name]: [purpose, key elements]
3. [Screen name]: [purpose, key elements]
...
```

### Visual Style
```
Tone: [visual tone from Style Guide]
Color palette:
- Primary: [hex]
- Secondary: [hex]
- Background: [hex]
- Text: [hex]
- Accent/Success: [hex]
- Error: [hex]

Typography:
- Headings: [font]
- Body: [font]

Style references: [reference apps/sites from Style Guide]

Additional notes:
- [dark mode, spacing preferences, component styles, etc.]
```

### Features to Include
```
MVP features:
- [feature 1]
- [feature 2]
- [feature 3]

Key interactions:
- [interaction 1, e.g., "drag to reorder tasks"]
- [interaction 2]
```

### Platform & Constraints
```
Platform: [web, mobile, desktop]
Responsive: [yes/no, breakpoints]
Accessibility: [requirements]
```

### What to Generate
```
Please generate:
- [ ] Full app UI with all screens
- [ ] Just the main screen / dashboard
- [ ] Specific screen: [name]
- [ ] Component library / design system
- [ ] Mobile version
- [ ] Desktop version

Style preference:
- [ ] High-fidelity (production-ready look)
- [ ] Wireframe (layout focus)
- [ ] Something in between
```

---

## Tool-Specific Tips

### Google Stitch
- Works well with detailed feature lists
- Specify "Material Design 3" if you want that style
- Can iterate: "Make the sidebar collapsible" / "Add a floating action button"

### Vercel v0
- Prefers concise, specific prompts
- Good with: "Build a [thing] with [framework] that does [features]"
- Outputs React/Next.js code directly

### Galileo AI
- Excels at full app flows
- Specify user journeys for best results
- Can generate multiple screens at once

### Figma AI / Plugins
- Use the visual style section heavily
- Specify component-level details
- Good for design system generation

### General Tips
- Start broad, then iterate with specific requests
- Reference the style guide for consistency across iterations
- Generate mobile and desktop separately for better results
- Ask for "variations" to explore different approaches

---

## Iteration Log

*Track your UI generation iterations here*

| Date | Tool | Prompt Summary | Result | Notes |
|------|------|----------------|--------|-------|
| | | | | |

---

## Exporting Designs

After generating UI designs:

1. **Screenshot/export** the designs you like
2. **Save to** `assets/ui-concepts/` (create if needed)
3. **Reference** in Visual Style Guide and PRD
4. **Note decisions** in Decision Log (e.g., "DEC-005: Chose card-based layout over list view")
