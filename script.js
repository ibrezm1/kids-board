/**
 * Teaching Whiteboard - Pure Vanilla JavaScript
 * Zero dependencies, works directly on GitHub Pages.
 * Optimized for teaching, presenting, and smooth handwriting.
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const BRUSH_SIZES = {
    thin: { pen: 3, eraser: 18 },
    medium: { pen: 7, eraser: 36 },
    thick: { pen: 14, eraser: 68 }
  };

  // --- DOM Elements ---
  const canvas = document.getElementById('whiteboard');
  const ctx = canvas.getContext('2d');
  const canvasContainer = document.getElementById('canvas-container');
  const dropOverlay = document.getElementById('drop-overlay');

  // Toolbar & Buttons
  const toolPen = document.getElementById('tool-pen');
  const toolEraser = document.getElementById('tool-eraser');
  const sizeButtons = document.querySelectorAll('.btn-size');
  const colorButtons = document.querySelectorAll('.color-btn');
  const customColorInput = document.getElementById('custom-color');
  const btnUndo = document.getElementById('btn-undo');
  const btnClear = document.getElementById('btn-clear');
  const btnUpload = document.getElementById('btn-upload');
  const btnDownload = document.getElementById('btn-download');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const imageUploadInput = document.getElementById('image-upload-input');

  // Modal & Toast
  const clearModal = document.getElementById('clear-modal');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const btnModalConfirm = document.getElementById('btn-modal-confirm');
  const toast = document.getElementById('toast');
  const toastUndo = document.getElementById('toast-undo');
  let toastTimer = null;

  // --- App State ---
  const state = {
    tool: 'pen',             // 'pen' | 'eraser'
    color: '#111827',        // Default black
    sizeName: 'medium',      // 'thin' | 'medium' | 'thick'
    isDrawing: false,
    currentStroke: null,     // In-progress stroke
    history: [],             // Stack of drawing actions (strokes and uploaded images)
    redoStack: [],           // Stack of undone actions
    clearedBackup: null,     // Recovery buffer for Erase All
    dpr: window.devicePixelRatio || 1,
    width: 0,
    height: 0
  };

  // --- High DPI Canvas Resizing ---
  function resizeCanvas() {
    state.dpr = window.devicePixelRatio || 1;
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    // Buffer dimensions scaled by devicePixelRatio for razor-sharp rendering
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);

    // CSS display dimensions
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;

    redrawAll();
  }

  // --- Rendering Pipeline ---
  function configureContext(stroke) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = stroke.size;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
    }
  }

  function drawStroke(stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    ctx.save();
    configureContext(stroke);

    if (pts.length === 1) {
      // Single click / dot
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      // Smooth midpoint quadratic curves for fluid handwriting
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }

    ctx.stroke();
    ctx.restore();
  }

  function drawImageAction(imgAction) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(imgAction.img, imgAction.x, imgAction.y, imgAction.width, imgAction.height);
    ctx.restore();
  }

  function redrawAll() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(state.dpr, state.dpr);

    // Draw all actions from history
    for (let i = 0; i < state.history.length; i++) {
      const action = state.history[i];
      if (action.type === 'stroke') {
        drawStroke(action);
      } else if (action.type === 'image') {
        drawImageAction(action);
      }
    }

    ctx.restore();
  }

  // --- Pointer Coordinates & Events ---
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function onPointerDown(e) {
    // Only primary button (left mouse button, touch, or stylus tip)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    state.isDrawing = true;
    const pt = getPointerPos(e);
    const strokeSize = state.tool === 'eraser' 
      ? BRUSH_SIZES[state.sizeName].eraser 
      : BRUSH_SIZES[state.sizeName].pen;

    state.currentStroke = {
      type: 'stroke',
      tool: state.tool,
      color: state.color,
      size: strokeSize,
      points: [pt]
    };

    // Draw initial contact dot immediately
    ctx.save();
    ctx.scale(state.dpr, state.dpr);
    drawStroke(state.currentStroke);
    ctx.restore();
  }

  function onPointerMove(e) {
    if (!state.isDrawing || !state.currentStroke) return;

    const pt = getPointerPos(e);
    state.currentStroke.points.push(pt);

    // Real-time incremental curve smoothing
    const pts = state.currentStroke.points;
    const len = pts.length;
    if (len >= 3) {
      ctx.save();
      ctx.scale(state.dpr, state.dpr);
      configureContext(state.currentStroke);

      const p0 = pts[len - 3];
      const p1 = pts[len - 2];
      const p2 = pts[len - 1];

      const mid1X = (p0.x + p1.x) / 2;
      const mid1Y = (p0.y + p1.y) / 2;
      const mid2X = (p1.x + p2.x) / 2;
      const mid2Y = (p1.y + p2.y) / 2;

      ctx.beginPath();
      ctx.moveTo(mid1X, mid1Y);
      ctx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function onPointerUp(e) {
    if (!state.isDrawing) return;
    state.isDrawing = false;

    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (state.currentStroke && state.currentStroke.points.length > 0) {
      state.history.push(state.currentStroke);
      state.redoStack = []; // Reset redo after fresh action
      state.currentStroke = null;
      redrawAll(); // Final smooth repainting
    }
  }

  // --- Tool Switching (Pen / Eraser) ---
  function setTool(toolName) {
    state.tool = toolName;
    toolPen.classList.toggle('active', toolName === 'pen');
    toolEraser.classList.toggle('active', toolName === 'eraser');
    canvas.style.cursor = toolName === 'eraser' ? 'cell' : 'crosshair';
  }

  // --- Size Switching (Thin / Medium / Thick) ---
  function setSize(sizeName) {
    if (!BRUSH_SIZES[sizeName]) return;
    state.sizeName = sizeName;
    sizeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === sizeName);
    });
  }

  // --- Color Selection ---
  function setColor(colorHex, targetBtn = null) {
    state.color = colorHex;

    // Update active highlight on swatch buttons
    colorButtons.forEach((btn) => btn.classList.remove('active'));
    if (targetBtn) {
      targetBtn.classList.add('active');
    } else {
      const match = Array.from(colorButtons).find(
        (b) => b.dataset.color.toLowerCase() === colorHex.toLowerCase()
      );
      if (match) match.classList.add('active');
    }

    // Crucial for teaching flow: changing color automatically reactivates the Pen!
    if (state.tool === 'eraser') {
      setTool('pen');
    }
  }

  // --- Undo (Erase Last) & Redo ---
  function undo() {
    if (state.history.length === 0) return;
    const lastAction = state.history.pop();
    state.redoStack.push(lastAction);
    redrawAll();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    const nextAction = state.redoStack.pop();
    state.history.push(nextAction);
    redrawAll();
  }

  // --- Clear All (Erase Entire Board) with Safeguard Modal ---
  function openClearModal() {
    if (state.history.length === 0) return;
    clearModal.classList.remove('hidden');
  }

  function closeClearModal() {
    clearModal.classList.add('hidden');
  }

  function confirmClear() {
    closeClearModal();
    if (state.history.length === 0) return;

    // Save backup in case teacher cleared unintentionally
    state.clearedBackup = [...state.history];
    state.history = [];
    state.redoStack = [];
    redrawAll();

    showToast('Whiteboard cleared', () => {
      if (state.clearedBackup) {
        state.history = [...state.clearedBackup];
        state.clearedBackup = null;
        redrawAll();
      }
    });
  }

  function showToast(text, onUndo) {
    const toastText = document.getElementById('toast-text');
    toastText.textContent = text;
    toast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);

    toastUndo.onclick = () => {
      if (onUndo) onUndo();
      hideToast();
    };

    toastTimer = setTimeout(() => {
      hideToast();
    }, 5000);
  }

  function hideToast() {
    toast.classList.add('hidden');
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  }

  // --- Download Board as PNG ---
  function downloadBoardAsPNG() {
    // Create an export canvas with solid white background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const expCtx = exportCanvas.getContext('2d');

    // Fill white background
    expCtx.fillStyle = '#ffffff';
    expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Composite all whiteboard contents
    expCtx.drawImage(canvas, 0, 0);

    // Generate filename with timestamp
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `whiteboard-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.png`;

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // --- Upload PNG or Image onto Whiteboard ---
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        // Calculate dimensions to fit nicely within viewport with margin
        const maxWidth = state.width * 0.85;
        const maxHeight = state.height * 0.85;
        let w = img.width;
        let h = img.height;

        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = w * ratio;
          h = h * ratio;
        }

        // Center on screen
        const x = (state.width - w) / 2;
        const y = (state.height - h) / 2;

        const imageAction = {
          type: 'image',
          img: img,
          x: x,
          y: y,
          width: w,
          height: h
        };

        state.history.push(imageAction);
        state.redoStack = [];
        redrawAll();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Fullscreen Toggle ---
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // --- Keyboard Shortcuts ---
  function handleKeyDown(e) {
    // Ignore keystrokes when typing into an input
    if (e.target.tagName === 'INPUT') return;

    const key = e.key.toLowerCase();

    // Undo (Ctrl+Z or Cmd+Z)
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    // Redo (Ctrl+Y or Cmd+Y)
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      redo();
      return;
    }

    // Download PNG (Ctrl+S or Cmd+S)
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      downloadBoardAsPNG();
      return;
    }

    // Upload image (Ctrl+O or Cmd+O)
    if ((e.ctrlKey || e.metaKey) && key === 'o') {
      e.preventDefault();
      imageUploadInput.click();
      return;
    }

    // Single Key Shortcuts:
    if (key === 'p') {
      setTool('pen');
    } else if (key === 'e') {
      setTool('eraser');
    } else if (key === 'c') {
      // Clear with confirmation
      openClearModal();
    } else if (key === 'f') {
      toggleFullscreen();
    } else if (key === 'escape') {
      closeClearModal();
      hideToast();
    } else if (key === 'enter') {
      if (!clearModal.classList.contains('hidden')) {
        confirmClear();
      }
    } else if (key >= '1' && key <= '6') {
      // Color presets 1-6
      const idx = parseInt(key, 10) - 1;
      if (colorButtons[idx]) {
        setColor(colorButtons[idx].dataset.color, colorButtons[idx]);
      }
    }
  }

  // --- Drag & Drop Support for Images ---
  function setupDragAndDrop() {
    ['dragenter', 'dragover'].forEach((eventName) => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.remove('hidden');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'drop') {
          dropOverlay.classList.add('hidden');
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files.length > 0) {
            handleImageFile(dt.files[0]);
          }
        } else if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) {
          dropOverlay.classList.add('hidden');
        }
      });
    });
  }

  // --- Event Listeners Setup ---
  function initEventListeners() {
    // Window resize
    window.addEventListener('resize', resizeCanvas);

    // Pointer events on canvas
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    // Tool buttons
    toolPen.addEventListener('click', () => setTool('pen'));
    toolEraser.addEventListener('click', () => setTool('eraser'));

    // Size buttons
    sizeButtons.forEach((btn) => {
      btn.addEventListener('click', () => setSize(btn.dataset.size));
    });

    // Quick Color buttons
    colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => setColor(btn.dataset.color, btn));
    });

    // Custom Color picker
    customColorInput.addEventListener('input', (e) => {
      setColor(e.target.value);
    });

    // Undo & Clear buttons
    btnUndo.addEventListener('click', undo);
    btnClear.addEventListener('click', openClearModal);

    // Modal buttons
    btnModalCancel.addEventListener('click', closeClearModal);
    btnModalConfirm.addEventListener('click', confirmClear);
    clearModal.addEventListener('click', (e) => {
      if (e.target === clearModal) closeClearModal();
    });

    // Upload & Download
    btnUpload.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleImageFile(e.target.files[0]);
        imageUploadInput.value = ''; // Allow re-selecting the same file
      }
    });

    btnDownload.addEventListener('click', downloadBoardAsPNG);
    btnFullscreen.addEventListener('click', toggleFullscreen);

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeyDown);

    // Drag and drop for images
    setupDragAndDrop();

    // Prevent default touch gestures (e.g. pull-to-refresh)
    canvasContainer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvasContainer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  // --- App Initialization ---
  function init() {
    initEventListeners();
    resizeCanvas();
    setTool('pen');
    setSize('medium');
    setColor('#111827', colorButtons[0]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
