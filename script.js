/**
 * Teaching Whiteboard - Pure Vanilla JavaScript
 * Zero dependencies, works directly on GitHub Pages.
 * Optimized for teaching, presenting, and smooth handwriting.
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const BRUSH_SIZES = {
    thin: { pen: 3, eraser: 40 },
    medium: { pen: 7, eraser: 80 },
    thick: { pen: 14, eraser: 140 }
  };

  // Ink colors that swap with the board theme so writing stays visible
  const INK_BLACK = '#111827';
  const INK_WHITE = '#f8fafc';

  // --- DOM Elements ---
  const canvas = document.getElementById('whiteboard');
  const ctx = canvas.getContext('2d');
  const canvasContainer = document.getElementById('canvas-container');
  const dropOverlay = document.getElementById('drop-overlay');
  const eraserCursor = document.getElementById('eraser-cursor');

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
  const btnDarkMode = document.getElementById('btn-darkmode');
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
    height: 0,
    darkMode: false,           // Dark board background toggle
    
    // Multi-touch & viewport transform
    activePointers: new Map(),  // Track all active touch/pen points
    gestureState: null,         // Current gesture (pan/pinch)
    viewport: {
      scale: 1,
      offsetX: 0,
      offsetY: 0
    }
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

    if (stroke.tool === 'eraser') {
      // Rectangular duster eraser
      const halfWidth = stroke.size / 2;
      const halfHeight = stroke.size / 3;
      
      if (pts.length === 1) {
        // Single click - erase rectangle
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(pts[0].x - halfWidth, pts[0].y - halfHeight, stroke.size, stroke.size * 0.66);
        ctx.restore();
        return;
      }

      // For eraser, we need to erase rectangles along the path
      for (let i = 0; i < pts.length; i++) {
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(pts[i].x - halfWidth, pts[i].y - halfHeight, stroke.size, stroke.size * 0.66);
      }
    } else {
      // Pen drawing (original logic)
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
    }
    
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
    
    // Apply viewport transform
    ctx.translate(state.viewport.offsetX, state.viewport.offsetY);
    ctx.scale(state.viewport.scale, state.viewport.scale);

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
  
  function screenToWorld(screenX, screenY) {
    return {
      x: (screenX - state.viewport.offsetX) / state.viewport.scale,
      y: (screenY - state.viewport.offsetY) / state.viewport.scale
    };
  }
  
  function getGestureCenter() {
    const pts = Array.from(state.activePointers.values());
    if (pts.length < 2) return null;
    
    const x = (pts[0].x + pts[1].x) / 2;
    const y = (pts[0].y + pts[1].y) / 2;
    return { x, y };
  }
  
  function getGestureDistance() {
    const pts = Array.from(state.activePointers.values());
    if (pts.length < 2) return 0;
    
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  function startGesture() {
    if (state.activePointers.size !== 2) return;
    
    // Cancel any in-progress stroke
    if (state.isDrawing) {
      state.isDrawing = false;
      if (state.currentStroke && state.currentStroke.points.length > 0) {
        state.history.push(state.currentStroke);
        state.redoStack = [];
      }
      state.currentStroke = null;
    }
    
    const center = getGestureCenter();
    const distance = getGestureDistance();
    
    state.gestureState = {
      centerX: center.x,
      centerY: center.y,
      distance: distance,
      startScale: state.viewport.scale,
      startOffsetX: state.viewport.offsetX,
      startOffsetY: state.viewport.offsetY
    };
  }
  
  function updateGesture() {
    if (!state.gestureState || state.activePointers.size < 2) return;
    
    const center = getGestureCenter();
    const distance = getGestureDistance();
    
    if (!center || distance === 0) return;
    
    // Calculate scale change
    const scaleRatio = distance / state.gestureState.distance;
    const newScale = Math.max(0.2, Math.min(10, state.gestureState.startScale * scaleRatio));
    
    // Zoom towards gesture center
    const worldX = (state.gestureState.centerX - state.gestureState.startOffsetX) / state.gestureState.startScale;
    const worldY = (state.gestureState.centerY - state.gestureState.startOffsetY) / state.gestureState.startScale;
    
    state.viewport.scale = newScale;
    state.viewport.offsetX = center.x - worldX * newScale;
    state.viewport.offsetY = center.y - worldY * newScale;
    
    // Update zoom indicator
    updateZoomIndicator();
    
    redrawAll();
  }
  
  function endGesture() {
    state.gestureState = null;
  }

  function onPointerDown(e) {
    // Only primary button (left mouse button, touch, or stylus tip)
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    
    const pt = getPointerPos(e);
    state.activePointers.set(e.pointerId, pt);
    
    // If we now have 2 pointers, start gesture mode
    if (state.activePointers.size === 2) {
      startGesture();
      return;
    }
    
    // Only start drawing if this is the first pointer (palm rejection)
    if (state.activePointers.size > 1) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    state.isDrawing = true;
    const worldPt = screenToWorld(pt.x, pt.y);
    const strokeSize = state.tool === 'eraser' 
      ? BRUSH_SIZES[state.sizeName].eraser 
      : BRUSH_SIZES[state.sizeName].pen;

    state.currentStroke = {
      type: 'stroke',
      tool: state.tool,
      color: resolveInkColor(state.color),
      size: strokeSize,
      points: [worldPt]
    };

    // Show eraser cursor if erasing
    if (state.tool === 'eraser') {
      moveEraserCursor(e.clientX, e.clientY);
    }

    // Draw initial contact dot immediately
    ctx.save();
    ctx.scale(state.dpr, state.dpr);
    ctx.translate(state.viewport.offsetX, state.viewport.offsetY);
    ctx.scale(state.viewport.scale, state.viewport.scale);
    drawStroke(state.currentStroke);
    ctx.restore();
  }

  function onPointerMove(e) {
    const pt = getPointerPos(e);
    
    // Update pointer position
    if (state.activePointers.has(e.pointerId)) {
      state.activePointers.set(e.pointerId, pt);
    }
    
    // Move eraser cursor with pointer
    if (state.tool === 'eraser' && state.activePointers.size === 1) {
      moveEraserCursor(e.clientX, e.clientY);
    }
    
    // Handle gesture if active
    if (state.gestureState && state.activePointers.size >= 2) {
      updateGesture();
      return;
    }
    
    // Otherwise handle drawing
    if (!state.isDrawing || !state.currentStroke) return;

    const worldPt = screenToWorld(pt.x, pt.y);
    state.currentStroke.points.push(worldPt);

    // Real-time incremental rendering
    const pts = state.currentStroke.points;
    const len = pts.length;
    
    ctx.save();
    ctx.scale(state.dpr, state.dpr);
    ctx.translate(state.viewport.offsetX, state.viewport.offsetY);
    ctx.scale(state.viewport.scale, state.viewport.scale);
    configureContext(state.currentStroke);
    
    if (state.currentStroke.tool === 'eraser') {
      // Draw rectangle for eraser
      const p = pts[len - 1];
      const halfWidth = state.currentStroke.size / 2;
      const halfHeight = state.currentStroke.size / 3;
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(p.x - halfWidth, p.y - halfHeight, state.currentStroke.size, state.currentStroke.size * 0.66);
    } else if (len >= 3) {
      // Smooth curve for pen
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
    }
    
    ctx.restore();
  }

  function onPointerUp(e) {
    state.activePointers.delete(e.pointerId);
    
    // If we were in gesture mode and drop below 2 pointers, end gesture
    if (state.gestureState && state.activePointers.size < 2) {
      endGesture();
    }

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
    
    if (toolName === 'eraser') {
      canvas.style.cursor = 'none';
      updateEraserCursor();
    } else {
      canvas.style.cursor = 'crosshair';
      hideEraserCursor();
    }
  }
  
  function updateEraserCursor() {
    if (!eraserCursor) return;
    
    const size = BRUSH_SIZES[state.sizeName].eraser;
    const width = size;
    const height = size * 0.66;
    
    eraserCursor.style.width = width + 'px';
    eraserCursor.style.height = height + 'px';
    eraserCursor.classList.add('visible');
  }
  
  function hideEraserCursor() {
    if (!eraserCursor) return;
    eraserCursor.classList.remove('visible');
  }
  
  function moveEraserCursor(clientX, clientY) {
    if (!eraserCursor || state.tool !== 'eraser') return;
    
    const size = BRUSH_SIZES[state.sizeName].eraser;
    const width = size;
    const height = size * 0.66;
    
    eraserCursor.style.left = (clientX - width / 2) + 'px';
    eraserCursor.style.top = (clientY - height / 2) + 'px';
  }

  // --- Size Switching (Thin / Medium / Thick) ---
  function setSize(sizeName) {
    if (!BRUSH_SIZES[sizeName]) return;
    state.sizeName = sizeName;
    sizeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === sizeName);
    });
    
    // Update cursor if eraser is active
    if (state.tool === 'eraser') {
      setTool('eraser');
    }
  }

  // --- Color Selection ---
  // Resolve the ink color for the current theme: black ink becomes white on a
  // dark board (and vice-versa) so writing always stays visible.
  function resolveInkColor(colorHex) {
    const c = (colorHex || '').toLowerCase();
    if (c === INK_BLACK) return state.darkMode ? INK_WHITE : INK_BLACK;
    return colorHex;
  }

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

    // Fill background matching the current board theme
    expCtx.fillStyle = state.darkMode ? '#1e293b' : '#ffffff';
    expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Composite all whiteboard contents (already includes viewport transform)
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

        // Center on screen in world coordinates
        const worldCenterX = (state.width / 2 - state.viewport.offsetX) / state.viewport.scale;
        const worldCenterY = (state.height / 2 - state.viewport.offsetY) / state.viewport.scale;
        
        const x = worldCenterX - w / 2;
        const y = worldCenterY - h / 2;

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

  // --- Zoom Controls ---
  function updateZoomIndicator() {
    const zoomValue = document.getElementById('zoom-value');
    if (zoomValue) {
      zoomValue.textContent = Math.round(state.viewport.scale * 100) + '%';
    }
  }
  
  function setZoom(newScale, centerX, centerY) {
    newScale = Math.max(0.2, Math.min(10, newScale));
    
    if (centerX === undefined) centerX = state.width / 2;
    if (centerY === undefined) centerY = state.height / 2;
    
    // Zoom towards center point
    const worldX = (centerX - state.viewport.offsetX) / state.viewport.scale;
    const worldY = (centerY - state.viewport.offsetY) / state.viewport.scale;
    
    state.viewport.scale = newScale;
    state.viewport.offsetX = centerX - worldX * newScale;
    state.viewport.offsetY = centerY - worldY * newScale;
    
    updateZoomIndicator();
    redrawAll();
  }
  
  function zoomIn() {
    setZoom(state.viewport.scale * 1.2);
  }
  
  function zoomOut() {
    setZoom(state.viewport.scale / 1.2);
  }
  
  function resetView() {
    state.viewport.scale = 1;
    state.viewport.offsetX = 0;
    state.viewport.offsetY = 0;
    updateZoomIndicator();
    redrawAll();
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

  // --- Dark Board Mode ---
  function setDarkMode(enabled) {
    state.darkMode = enabled;
    document.body.classList.toggle('dark-board', enabled);
    if (btnDarkMode) {
      btnDarkMode.classList.toggle('active', enabled);
      btnDarkMode.setAttribute('aria-pressed', String(enabled));
      btnDarkMode.title = enabled ? 'Switch to Light Board (D)' : 'Switch to Dark Board (D)';
    }

    // Re-map black ink across all existing strokes so past writing stays visible
    const blackToHex = enabled ? INK_WHITE : INK_BLACK;
    const fromHex = enabled ? INK_BLACK : INK_WHITE;
    for (let i = 0; i < state.history.length; i++) {
      const action = state.history[i];
      if (action.type === 'stroke' && action.tool !== 'eraser' &&
          (action.color || '').toLowerCase() === fromHex) {
        action.color = blackToHex;
      }
    }

    // Keep the custom color picker in sync with the active ink color
    if (customColorInput) {
      customColorInput.value = resolveInkColor(state.color);
    }

    redrawAll();
  }

  function toggleDarkMode() {
    setDarkMode(!state.darkMode);
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
    } else if (key === 'd') {
      toggleDarkMode();
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
    
    // Zoom controls
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

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
    if (btnDarkMode) btnDarkMode.addEventListener('click', toggleDarkMode);

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
    updateZoomIndicator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
