const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');
const mainView = document.getElementById('main-view');

// State
let image = null; 
let currentFileName = 'annotated_image';
let annotations = []; // { x, y, color }
let currentColor = '#ff00ff';
let currentRadius = 10;
let currentThickness = 2;
let currentTextSize = 16;

// Palette (Persistent)
let palette = [
    { color: '#ff00ff', tag: 'Magenta', isDefault: true },
    { color: '#00ffff', tag: 'Cyan', isDefault: true },
    { color: '#00ff00', tag: 'Lime', isDefault: true },
    { color: '#ccff00', tag: 'Neon Yellow', isDefault: true },
    { color: '#ff6600', tag: 'Orange', isDefault: true }
];

// Options (Persistent)
let exportWithLog = false;
let exportWithSummary = false;

// LocalStorage Keys
const STORAGE_PALETTE = 'tiff_annotator_palette_v2';
const STORAGE_OPTS = 'tiff_annotator_options_v2';

// Transform state
let scale = 1;
let panX = 0;
let panY = 0;

// Interaction state
let isDraggingCircle = false;
let draggedCircle = null;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

// Load Settings
function loadSettings() {
    const savedPalette = localStorage.getItem(STORAGE_PALETTE);
    if (savedPalette) palette = JSON.parse(savedPalette);

    const savedOpts = localStorage.getItem(STORAGE_OPTS);
    if (savedOpts) {
        const opts = JSON.parse(savedOpts);
        exportWithLog = !!opts.log;
        exportWithSummary = !!opts.summary;
        document.getElementById('opt-log').checked = exportWithLog;
        document.getElementById('opt-summary').checked = exportWithSummary;
    }
}

function saveSettings() {
    localStorage.setItem(STORAGE_PALETTE, JSON.stringify(palette));
    localStorage.setItem(STORAGE_OPTS, JSON.stringify({ log: exportWithLog, summary: exportWithSummary }));
}

// Init Event Listeners for UI
document.getElementById('radius-slider').addEventListener('input', (e) => {
    currentRadius = parseInt(e.target.value);
    document.getElementById('radius-val').innerText = currentRadius;
    draw();
});

document.getElementById('thickness-slider').addEventListener('input', (e) => {
    currentThickness = parseInt(e.target.value);
    document.getElementById('thickness-val').innerText = currentThickness;
    draw();
});

document.getElementById('textsize-slider').addEventListener('input', (e) => {
    currentTextSize = parseInt(e.target.value);
    document.getElementById('textsize-val').innerText = currentTextSize;
    draw();
});

document.getElementById('opt-log').addEventListener('change', (e) => { exportWithLog = e.target.checked; saveSettings(); });
document.getElementById('opt-summary').addEventListener('change', (e) => { exportWithSummary = e.target.checked; saveSettings(); });

document.getElementById('add-color-btn').addEventListener('click', () => {
    document.getElementById('new-color-picker').click();
});

document.getElementById('new-color-picker').addEventListener('input', (e) => {
    const newColor = e.target.value;
    if (!palette.find(p => p.color === newColor)) {
        palette.push({ color: newColor, tag: 'New Tag', isDefault: false });
        currentColor = newColor;
        saveSettings();
        updateStats();
    }
});

// File Handling
window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
window.addEventListener('dragleave', (e) => { if (e.target === document.body || e.target === dropZone) dropZone.classList.remove('dragover'); });
window.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    currentFileName = file.name.replace(/\.[^/.]+$/, "");
    const reader = new FileReader();
    reader.onload = function(event) {
        const buffer = event.target.result;
        if (file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff')) {
            try {
                const ifds = UTIF.decode(buffer);
                UTIF.decodeImage(buffer, ifds[0]);
                const tiff = ifds[0];
                const rgba = UTIF.toRGBA8(tiff);
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = tiff.width; tempCanvas.height = tiff.height;
                const tempCtx = tempCanvas.getContext('2d');
                const imgData = tempCtx.createImageData(tiff.width, tiff.height);
                imgData.data.set(rgba); tempCtx.putImageData(imgData, 0, 0);
                loadImageFromUrl(tempCanvas.toDataURL());
            } catch (err) { console.error(err); alert("Failed to parse TIFF file."); }
        } else {
            const blob = new Blob([buffer], { type: file.type });
            loadImageFromUrl(URL.createObjectURL(blob));
        }
    };
    reader.readAsArrayBuffer(file);
}

function loadImageFromUrl(url) {
    const img = new Image();
    img.onload = () => { image = img; resetView(); };
    img.src = url;
}

function resetView() {
    if (!image) return;
    canvas.width = image.width; canvas.height = image.height;
    const viewEl = document.getElementById('main-view');
    const viewRect = viewEl.getBoundingClientRect();
    const scaleX = viewRect.width / image.width;
    const scaleY = viewRect.height / image.height;
    scale = Math.min(scaleX, scaleY) * 0.9;
    if (scale > 1) scale = 1;
    panX = (viewRect.width - image.width * scale) / 2;
    panY = (viewRect.height - image.height * scale) / 2;
    annotations = []; 
    updateStats(); updateTransform(); draw();
}

function draw() {
    if (!image) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    drawAnnotations(ctx);
}

function drawAnnotations(targetCtx) {
    let counters = {};
    let lastIndices = {};
    annotations.forEach((ann, index) => {
        counters[ann.color] = (counters[ann.color] || 0) + 1;
        lastIndices[ann.color] = index;
    });

    annotations.forEach((ann, index) => {
        targetCtx.beginPath();
        targetCtx.arc(ann.x, ann.y, currentRadius, 0, 2 * Math.PI);
        targetCtx.lineWidth = currentThickness;
        targetCtx.strokeStyle = ann.color;
        targetCtx.globalAlpha = 1.0;
        targetCtx.stroke();
        
        if (index === lastIndices[ann.color]) {
            const num = counters[ann.color];
            targetCtx.fillStyle = ann.color;
            targetCtx.font = `bold ${currentTextSize}px Arial`;
            targetCtx.textAlign = 'left';
            targetCtx.textBaseline = 'middle';
            targetCtx.globalAlpha = 0.75;
            targetCtx.lineWidth = Math.max(2, currentTextSize * 0.15);
            targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            targetCtx.strokeText(num, ann.x + currentRadius + 5, ann.y);
            targetCtx.fillText(num, ann.x + currentRadius + 5, ann.y);
            targetCtx.globalAlpha = 1.0;
        }
    });
}

function updateTransform() {
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
}

canvas.addEventListener('mousedown', (e) => {
    if (!image) return;
    if (e.button === 1 || (e.shiftKey && e.button === 0)) {
        isPanning = true; startPanX = e.clientX - panX; startPanY = e.clientY - panY;
        canvas.style.cursor = 'grabbing'; e.preventDefault(); return;
    }
    const pos = getMousePos(e);
    if (e.button === 2) { removeNearest(pos); return; }
    if (e.button === 0) {
        const clicked = findNearest(pos);
        const hitDistance = currentRadius + Math.max(5, currentThickness);
        if (clicked && distance(pos, clicked) < hitDistance) {
            if (clicked.color !== currentColor) {
                clicked.color = currentColor;
                annotations = annotations.filter(a => a !== clicked);
                annotations.push(clicked);
                updateStats(); draw();
            }
            isDraggingCircle = true; draggedCircle = clicked;
        } else {
            annotations.push({ x: pos.x, y: pos.y, color: currentColor });
            updateStats(); draw();
            isDraggingCircle = true; draggedCircle = annotations[annotations.length - 1];
        }
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) { panX = e.clientX - startPanX; panY = e.clientY - startPanY; updateTransform(); }
    else if (isDraggingCircle && draggedCircle) { draggedCircle.x = getMousePos(e).x; draggedCircle.y = getMousePos(e).y; draw(); }
});

window.addEventListener('mouseup', () => { isPanning = false; isDraggingCircle = false; draggedCircle = null; canvas.style.cursor = 'crosshair'; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

mainView.addEventListener('wheel', (e) => {
    if (!image || !e.shiftKey) return;
    e.preventDefault();
    const zoomFactor = 1.15;
    const direction = e.deltaY > 0 ? -1 : 1;
    const rect = mainView.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
    const oldScale = scale;
    scale *= (direction > 0 ? zoomFactor : 1 / zoomFactor);
    scale = Math.max(0.1, Math.min(scale, 20));
    panX = mouseX - (mouseX - panX) * (scale / oldScale);
    panY = mouseY - (mouseY - panY) * (scale / oldScale);
    updateTransform();
}, { passive: false });

function distance(p1, p2) { return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)); }
function findNearest(pos) { return annotations.length === 0 ? null : annotations.reduce((p, c) => distance(pos, c) < distance(pos, p) ? c : p); }
function removeNearest(pos) {
    const nearest = findNearest(pos);
    if (nearest && distance(pos, nearest) < currentRadius + Math.max(5, currentThickness)) {
        annotations = annotations.filter(a => a !== nearest);
        updateStats(); draw();
    }
}

function updateStats() {
    const total = annotations.length;
    let colorCounts = {};
    annotations.forEach(a => { colorCounts[a.color] = (colorCounts[a.color] || 0) + 1; });
    
    const container = document.getElementById('stats-container');
    container.innerHTML = '';
    
    palette.forEach(p => {
        const count = colorCounts[p.color] || 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        
        const row = document.createElement('div');
        row.className = `stat-row ${p.color === currentColor ? 'active' : ''}`;
        row.dataset.color = p.color;
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                <span class="stat-color-indicator" style="background-color: ${p.color}"></span>
                <input type="text" class="tag-input" data-color="${p.color}" value="${p.tag}" placeholder="Tag name">
            </div>
            <div class="stat-values">
                <span class="stat-count">${count}</span>
                <span class="stat-percent">(${percent}%)</span>
                ${!p.isDefault ? `<button class="delete-color-btn" data-color="${p.color}" title="Remove color">&times;</button>` : ''}
            </div>
        `;
        
        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-input') || e.target.classList.contains('delete-color-btn')) return;
            currentColor = p.color;
            updateStats();
        });
        
        const input = row.querySelector('.tag-input');
        input.addEventListener('input', (e) => {
            p.tag = e.target.value;
            saveSettings();
        });

        const delBtn = row.querySelector('.delete-color-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                palette = palette.filter(item => item.color !== p.color);
                annotations = annotations.filter(a => a.color !== p.color);
                if (currentColor === p.color) currentColor = palette[0].color;
                saveSettings();
                updateStats();
                draw();
            });
        }
        
        container.appendChild(row);
    });
    
    if (palette.length === 0) container.innerHTML = '<div style="color: #666; font-style: italic;">No colors in palette</div>';
}

document.getElementById('export-btn').addEventListener('click', () => {
    if (!image) { alert("Please load an image first."); return; }
    
    const total = annotations.length;
    let colorCounts = {};
    annotations.forEach(a => { colorCounts[a.color] = (colorCounts[a.color] || 0) + 1; });

    // Filter palette for non-zero counts for log/overlay
    const activePalette = palette.filter(p => (colorCounts[p.color] || 0) > 0);

    // 1. Image Export
    const expCanvas = document.createElement('canvas');
    let finalHeight = canvas.height;
    const footerPadding = currentTextSize * 2.5;
    if (exportWithSummary && activePalette.length > 0) {
        finalHeight += footerPadding;
    }
    expCanvas.width = canvas.width;
    expCanvas.height = finalHeight;
    const expCtx = expCanvas.getContext('2d');
    
    expCtx.fillStyle = "#ffffff";
    expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);
    expCtx.drawImage(image, 0, 0);
    drawAnnotations(expCtx);

    if (exportWithSummary && activePalette.length > 0) {
        expCtx.fillStyle = "#111111"; 
        expCtx.fillRect(0, canvas.height, expCanvas.width, footerPadding);
        
        let summaryX = 20;
        let summaryY = canvas.height + footerPadding / 2;
        expCtx.textAlign = 'left';
        expCtx.textBaseline = 'middle';
        expCtx.font = `bold ${currentTextSize}px Arial`;
        
        activePalette.forEach(p => {
            const count = colorCounts[p.color];
            const percent = Math.round((count / total) * 100);
            expCtx.fillStyle = p.color;
            const text = `${p.tag}: ${count} (${percent}%)`;
            expCtx.fillText(text, summaryX, summaryY);
            summaryX += expCtx.measureText(text + "   ").width;
        });
    }

    const link = document.createElement('a');
    link.download = `${currentFileName}_annotated.jpg`;
    link.href = expCanvas.toDataURL('image/jpeg', 0.95);
    link.click();

    // 2. Log Export
    if (exportWithLog) {
        let logText = `Filename: ${currentFileName}\nDate: ${new Date().toLocaleString()}\nTotal: ${total}\n\n`;
        activePalette.forEach(p => {
            const count = colorCounts[p.color];
            const percent = Math.round((count / total) * 100);
            logText += `${p.tag}: ${count} (${percent}%)\n`;
        });
        const blob = new Blob([logText], { type: 'text/plain' });
        const logLink = document.createElement('a');
        logLink.download = `${currentFileName}_stats.txt`;
        logLink.href = URL.createObjectURL(blob);
        setTimeout(() => logLink.click(), 100);
    }
});

loadSettings();
updateStats();
