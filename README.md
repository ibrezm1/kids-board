# 🎓 Teaching Whiteboard

A fast, lightweight, and distraction-free browser-based drawing board built specifically for teaching, online lectures, code walkthroughs, and visual presentations.

Ready to be hosted directly on **GitHub Pages** with **zero build step**, zero dependencies, and no backend.

---

## ✨ Key Features

- **Instant Drawing**: Open the page and immediately start writing or sketching — no login, no menus, no lag.
- **Smooth Freehand Pen**: Uses midpoint quadratic curve smoothing for fluid, natural handwriting on mice, trackpads, and styluses.
- **Quick Colors (One-Click)**: Instant access to high-contrast teaching colors:
  - **Black** (`#111827`)
  - **Red** (`#dc2626`)
  - **Blue** (`#2563eb`)
  - **Green** (`#16a34a`)
  - **Orange** (`#ea580c`)
  - **Purple** (`#9333ea`)
  - 🎨 **Custom Color Picker** for any custom shade.
  - *Teacher Workflow:* Clicking any color instantly switches back to the Pen tool so you never lose teaching momentum.
- **Eraser Tool**: Cleanly erase individual strokes with proportional sizing.
- **Quick Erase Last (Undo)**: Supports multiple undo operations (`Ctrl+Z` / `Cmd+Z`) and redo (`Ctrl+Y`).
- **Erase All (Clear Board)**:
  - Distinct danger styling to prevent accidental clicks.
  - Confirmation modal safeguards your board notes against accidental wipes.
  - 5-second recovery toast with an **Undo** button in case of accidental clears.
- **3 Preset Brush Sizes**:
  - `Thin` (diagram details and fine notes)
  - `Medium` (default, comfortable lecture writing)
  - `Thick` (headings and emphasis)
- **📤 Upload PNG / Image Capability**:
  - Upload diagrams, equations, assignments, or screenshots directly onto the whiteboard via button (`Ctrl+O`) or **drag & drop**.
  - Annotate and write directly over the uploaded images.
- **📥 Download as PNG**: Save the current board and annotations as a crisp PNG snapshot (`Ctrl+S`).
- **High-DPI Retina Ready**: Scaled with `devicePixelRatio` for razor-sharp rendering on 4K monitors, iPads, and Smart Boards.
- **Touch & Stylus Friendly**: Full `PointerEvents` support with `touch-action: none` to prevent accidental page scrolls or pull-to-refresh gestures.
- **Fullscreen Mode**: Maximize drawing real-estate for classroom projectors and screen shares (`F`).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `P` | Select **Pen** Tool |
| `E` | Select **Eraser** Tool |
| `1` – `6` | Instant **Color Switching** (Black, Red, Blue, Green, Orange, Purple) |
| `Ctrl + Z` / `Cmd + Z` | **Undo** (Erase Last) |
| `Ctrl + Y` / `Cmd + Y` | **Redo** |
| `C` | **Clear Board** (opens confirmation modal) |
| `Ctrl + S` / `Cmd + S` | **Download PNG** |
| `Ctrl + O` / `Cmd + O` | **Upload PNG / Image** |
| `F` | Toggle **Fullscreen** |
| `Esc` | Cancel modal / Dismiss alert |
| `Enter` | Confirm modal |

---

## 🚀 How to Deploy to GitHub Pages

Because this project uses pure HTML, CSS, and vanilla JavaScript without any build tools:

1. **Commit & Push to GitHub**:
   ```bash
   git add .
   git commit -m "feat: initial teaching whiteboard"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub.
   - Click **Settings** (top tabs).
   - In the left sidebar, click **Pages**.
   - Under **Build and deployment** > **Branch**:
     - Select `main` (or `master`)
     - Select `/ (root)` folder
   - Click **Save**.

3. **Open Your Whiteboard**:
   - In 1–2 minutes, your whiteboard will be live at:
     `https://<username>.github.io/<repository-name>/`

---

## 📁 File Structure

```text
├── index.html        # Clean semantic markup and accessible UI
├── style.css         # Modern light theme styles with responsive toolbar
├── script.js         # Canvas engine, pointer events, undo/redo, file upload/export
└── README.md         # Documentation & deployment guide
```

---

## 💡 Teaching Tips

1. **Annotating Student Work or Diagrams**: Click **Upload** or drag an image onto the canvas, then use the colored pens to highlight, circle, or write notes over it.
2. **Saving Lecture Notes**: At the end of class, click **Save** (or press `Ctrl+S`) to export the finished whiteboard as a PNG file to share with students.
3. **Screen Sharing**: Press `F` to enter Fullscreen before sharing your screen on Zoom, Google Meet, or Teams for an uncluttered, distraction-free whiteboard experience.
