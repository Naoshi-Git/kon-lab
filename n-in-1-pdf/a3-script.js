/**
 * PDF N-in-1 Generator Logic
 */

// State
let currentFile = null;
let originalPdfDoc = null;
let pageMapping = []; // { type: 'page', pageIndex: number, originalOrder: number } | { type: 'blank' }
let deletedPages = []; // { pageIndex: number, originalOrder: number }
let a3Orientation = 'Landscape';
let globalScale = 1.0;
let pageCache = {}; // index -> Object URL (JPEG Blob)

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const fileInfo = document.getElementById('file-info');
const nValueSelect = document.getElementById('n-value');
const orientationSelect = document.getElementById('page-orientation');
const btnExport = document.getElementById('btn-export');
const btnPrint = document.getElementById('btn-print');
const previewContainer = document.getElementById('preview-container');
const slotToolbarTemplate = document.getElementById('slot-toolbar-template');
const emptySlotToolbarTemplate = document.getElementById('empty-slot-toolbar-template');
const loadingOverlay = document.getElementById('loading-overlay');
const zoomScaleSlider = document.getElementById('zoom-slider');
const zoomScaleInput = document.getElementById('zoom-input');
const deletedPagesGroup = document.getElementById('deleted-pages-group');
const deletedPagesList = document.getElementById('deleted-pages-list');
const loadingTextEl = document.getElementById('loading-text');
const loadingSubtextEl = document.getElementById('loading-subtext');
const loadingBarEl = document.getElementById('loading-progress-bar');

const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const appContainer = document.querySelector('.app-container');
const btnZoomIn = document.getElementById('btn-preview-zoom-in');
const btnZoomOut = document.getElementById('btn-preview-zoom-out');
const previewZoomLevel = document.getElementById('preview-zoom-level');

const a3OrientationSelect = document.getElementById('a3-orientation');
const presetSelect = document.getElementById('preset-select');
const presetNameInput = document.getElementById('preset-name');
const btnSavePreset = document.getElementById('btn-save-preset');
const btnDeletePreset = document.getElementById('btn-delete-preset');

let uiZoom = 1.0;

// getGridConfig is no longer needed globally, cols/rows will be determined per sheet.

const loadingMessages = [
    "高度なレイアウトを計算中...",
    "軽量なプレビューを生成中...",
    "描画処理を最適化しています...",
    "各ページをスライスしています...",
    "UIをピクセルパーフェクトに調整中...",
    "もう少々お待ちください..."
];
let loadingMsgIdx = 0;
let loadingMsgInterval = null;

function showLoading(maxProgress = 0) { 
    loadingOverlay.classList.remove('hidden'); 
    loadingBarEl.style.width = '0%';
    loadingSubtextEl.textContent = maxProgress ? `0 / ${maxProgress}` : '準備中...';
    
    if(loadingMsgInterval) clearInterval(loadingMsgInterval);
    loadingMsgIdx = 0;
    loadingTextEl.textContent = loadingMessages[0];
    
    loadingMsgInterval = setInterval(() => {
        loadingMsgIdx = (loadingMsgIdx + 1) % loadingMessages.length;
        loadingTextEl.textContent = loadingMessages[loadingMsgIdx];
    }, 2000);
}

function updateLoadingProgress(current, max) {
    if (max <= 0) return;
    const percent = Math.min(100, Math.round((current / max) * 100));
    loadingBarEl.style.width = `${percent}%`;
    loadingSubtextEl.textContent = `${current} / ${max} 完了`;
}

function hideLoading() { 
    loadingOverlay.classList.add('hidden'); 
    if(loadingMsgInterval) clearInterval(loadingMsgInterval);
}

// Init
function init() {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    btnToggleSidebar.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');
    });

    btnZoomIn.addEventListener('click', () => {
        if (uiZoom < 3.0) {
            uiZoom = Math.min(3.0, uiZoom + 0.1);
            updateUIZoom();
        }
    });

    btnZoomOut.addEventListener('click', () => {
        if (uiZoom > 0.3) {
            uiZoom = Math.max(0.3, uiZoom - 0.1);
            updateUIZoom();
        }
    });

    a3OrientationSelect.addEventListener('change', (e) => { a3Orientation = e.target.value; renderLayout(); });
    
    // Presets
    loadPresets();
    presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
            applyPreset(val);
            presetNameInput.value = val;
            btnDeletePreset.style.display = 'inline-block';
        } else {
            presetNameInput.value = '';
            btnDeletePreset.style.display = 'none';
        }
    });

    btnSavePreset.addEventListener('click', () => {
        const name = presetNameInput.value.trim();
        if (!name) {
            alert('プリセット名を入力してください。');
            return;
        }
        savePreset(name);
    });

    btnDeletePreset.addEventListener('click', () => {
        const name = presetNameInput.value.trim();
        if (name && confirm(`プリセット「${name}」を削除しますか？`)) {
            deletePreset(name);
        }
    });
    
    // Zoom sync and apply
    zoomScaleSlider.addEventListener('input', (e) => {
        globalScale = parseFloat(e.target.value);
        zoomScaleInput.value = globalScale.toFixed(2);
        updateScaleCSS();
    });
    zoomScaleInput.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val)) val = 1.0;
        if (val < 0.1) val = 0.1;
        if (val > 3.0) val = 3.0;
        globalScale = val;
        zoomScaleSlider.value = val;
        zoomScaleInput.value = val.toFixed(2);
        updateScaleCSS();
    });



    btnExport.addEventListener('click', generateNIn1Pdf);
    btnPrint.addEventListener('click', generatePrintPdf); // high quality print instead of DOM print
}

// Presets Functions
function loadPresets() {
    let presets = JSON.parse(localStorage.getItem('a3PrintPresets')) || {};
    
    if (Object.keys(presets).length === 0) {
        presets['デフォルト'] = { a3Orientation: 'Landscape', globalScale: 1.0 };
        localStorage.setItem('a3PrintPresets', JSON.stringify(presets));
    }
    
    presetSelect.innerHTML = '<option value="">-- 保存済みの設定 --</option>';
    for (const name in presets) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        presetSelect.appendChild(opt);
    }
}

function applyPreset(name) {
    const presets = JSON.parse(localStorage.getItem('a3PrintPresets')) || {};
    const preset = presets[name];
    if (preset) {
        a3Orientation = preset.a3Orientation || 'Landscape';
        globalScale = preset.globalScale || 1.0;
        
        a3OrientationSelect.value = a3Orientation;
        zoomScaleSlider.value = globalScale;
        zoomScaleInput.value = globalScale.toFixed(2);
        
        updateScaleCSS();
        renderLayout();
    }
}

function savePreset(name) {
    const presets = JSON.parse(localStorage.getItem('a3PrintPresets')) || {};
    presets[name] = {
        a3Orientation: a3Orientation,
        globalScale: globalScale
    };
    localStorage.setItem('a3PrintPresets', JSON.stringify(presets));
    loadPresets();
    presetSelect.value = name;
    btnDeletePreset.style.display = 'inline-block';
}

function deletePreset(name) {
    const presets = JSON.parse(localStorage.getItem('a3PrintPresets')) || {};
    delete presets[name];
    localStorage.setItem('a3PrintPresets', JSON.stringify(presets));
    loadPresets();
    presetNameInput.value = '';
    btnDeletePreset.style.display = 'none';
}

function updateUIZoom() {
    previewContainer.style.setProperty('--ui-zoom', uiZoom);
    if (!('zoom' in document.body.style)) {
        previewContainer.style.transform = `scale(${uiZoom})`;
        previewContainer.style.marginBottom = `${60 * uiZoom}px`;
    }
    previewZoomLevel.textContent = Math.round(uiZoom * 100) + '%';
}

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('PDFファイルを選択してください。');
        return;
    }
    
    showLoading();
    currentFile = file; // Store reference to prevent Detached ArrayBuffer
    fileInfo.textContent = `読込中: ${file.name}`;
    fileInfo.classList.remove('hidden');

    try {
        const buffer = await currentFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        originalPdfDoc = await loadingTask.promise;
        
        // Setup initial mappings
        pageMapping = [];
        deletedPages = [];
        
        // Revoke old blob urls
        Object.values(pageCache).forEach(item => {
            if (item && item.url) URL.revokeObjectURL(item.url);
        });
        pageCache = {};

        for (let i = 0; i < originalPdfDoc.numPages; i++) {
            pageMapping.push({ type: 'page', pageIndex: i, originalOrder: i, isA3Full: false });
        }

        fileInfo.textContent = `${file.name} (${originalPdfDoc.numPages}ページ)`;
        btnExport.disabled = false;
        btnPrint.disabled = false;

        await renderLayout();
    } catch (e) {
        console.error(e);
        alert('読み込みに失敗しました。');
        fileInfo.classList.add('hidden');
    } finally {
        hideLoading();
    }
}

function updateScaleCSS() {
    const images = document.querySelectorAll('.page-preview-img');
    images.forEach(img => {
        img.style.transform = `scale(${globalScale})`;
    });
}

function updateDeletedPagesTray() {
    deletedPagesList.innerHTML = '';
    deletedPages.sort((a,b) => a.originalOrder - b.originalOrder);
    
    if (deletedPages.length === 0) {
        deletedPagesGroup.style.display = 'none';
        return;
    }
    
    deletedPagesGroup.style.display = 'flex';
    deletedPages.forEach(item => {
        const d = document.createElement('div');
        d.className = 'deleted-item';
        d.innerHTML = `P.${item.pageIndex + 1}`;
        
        const btn = document.createElement('button');
        btn.className = 'btn-restore';
        btn.textContent = '復元';
        btn.onclick = () => {
            // Restore it back to optimal position via originalOrder
            deletedPages = deletedPages.filter(x => x !== item);
            
            // Find insertion index in pageMapping based on originalOrder loosely
            let insertIdx = pageMapping.length;
            for(let i=0; i<pageMapping.length; i++) {
                if (pageMapping[i].type === 'page' && pageMapping[i].originalOrder > item.originalOrder) {
                    insertIdx = i;
                    break;
                }
            }
            
            pageMapping.splice(insertIdx, 0, { type: 'page', pageIndex: item.pageIndex, originalOrder: item.originalOrder });
            
            updateDeletedPagesTray();
            renderLayout();
        };
        d.appendChild(btn);
        deletedPagesList.appendChild(d);
    });
}

async function renderLayout() {
    if (!originalPdfDoc) return;

    // Ensure DOM updates block lightly
    await new Promise(r => setTimeout(r, 10));

    previewContainer.innerHTML = '';
    
    const { cols, rows } = getGridConfig();
    const slotsPerSheet = cols * rows;

    const sheetVisualWidth = 640; 
    const aspect = a3Orientation === 'Portrait' ? Math.sqrt(2) : 1 / Math.sqrt(2); 
    const sheetVisualHeight = sheetVisualWidth * aspect;

    // Pack pages into sheets
    let sheets = [];
    let currentSheet = [];
    
    for (let i = 0; i < pageMapping.length; i++) {
        const item = pageMapping[i];
        item._mapIndex = i; // Store original index to manipulate pageMapping later
        
        if (item.type === 'page' && item.isA3Full) {
            if (currentSheet.length > 0) {
                while (currentSheet.length < 2) currentSheet.push({ type: 'ghost-blank' });
                sheets.push(currentSheet);
                currentSheet = [];
            }
            sheets.push([item]);
        } else {
            currentSheet.push(item);
            if (currentSheet.length === 2) {
                sheets.push(currentSheet);
                currentSheet = [];
            }
        }
    }
    if (currentSheet.length > 0) {
        while (currentSheet.length < 2) currentSheet.push({ type: 'ghost-blank' });
        sheets.push(currentSheet);
    }
    if (sheets.length === 0) sheets.push([]);

    const maxProgress = sheets.reduce((acc, sheet) => acc + sheet.length, 0);
    showLoading(maxProgress);
    let currentProgress = 0;

    for (let s = 0; s < sheets.length; s++) {
        const sheetItems = sheets[s];
        const isA3Sheet = sheetItems.length === 1 && sheetItems[0].isA3Full;
        const cols = isA3Sheet ? 1 : (a3Orientation === 'Portrait' ? 1 : 2);
        const rows = isA3Sheet ? 1 : (a3Orientation === 'Portrait' ? 2 : 1);

        const sheetEl = document.createElement('div');
        sheetEl.className = 'sheet';
        sheetEl.style.width = `${sheetVisualWidth}px`;
        sheetEl.style.height = `${sheetVisualHeight}px`;
        sheetEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        sheetEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        sheetEl.style.gridAutoFlow = 'row';
        sheetEl.style.boxSizing = 'border-box';
        sheetEl.style.position = 'relative';

        sheetEl.style.padding = '0px';

        for (let i = 0; i < sheetItems.length; i++) {
            const slotItem = sheetItems[i];
            const mapIndex = slotItem._mapIndex; // Only defined for non-ghost items

            const slotEl = document.createElement('div');
            slotEl.className = 'slot';

            const overlayEl = document.createElement('div');
            overlayEl.className = 'slot-overlay';

            if (slotItem && slotItem.type !== 'ghost-blank') {
                if (slotItem.type === 'page') {
                    // Create IMG tag for huge memory savings
                    const img = document.createElement('img');
                    img.className = 'page-preview-img';
                    img.style.transform = `scale(${globalScale})`;
                    slotEl.appendChild(img);
                    
                    // Large page number overlay
                    const numOverlay = document.createElement('div');
                    numOverlay.className = 'page-number-overlay';
                    numOverlay.textContent = slotItem.pageIndex + 1;
                    slotEl.appendChild(numOverlay);

                    // Copy Badge logic
                    let copyCount = 0;
                    for (let k = 0; k <= mapIndex; k++) {
                        if (pageMapping[k].type === 'page' && pageMapping[k].pageIndex === slotItem.pageIndex) {
                            copyCount++;
                        }
                    }
                    if (copyCount > 1) {
                        const badge = document.createElement('div');
                        badge.className = 'copy-badge';
                        badge.textContent = `[${copyCount}]`;
                        slotEl.appendChild(badge);
                        img.classList.add('is-duplicate');
                    }

                    try {
                        const cached = await getCachedPageUrl(slotItem.pageIndex);
                        img.src = cached.url;

                        let slotW, slotH;
                        if (a3Orientation === 'Portrait') {
                            slotW = 297 / cols;
                            slotH = 420 / rows;
                        } else {
                            slotW = 420 / cols;
                            slotH = 297 / rows;
                        }
                        const isSlotLandscape = slotW > slotH;
                        
                        if (cached.isLandscape !== isSlotLandscape) {
                            const scaleF = isSlotLandscape ? slotW/slotH : slotH/slotW;
                            img.style.transform = `scale(${globalScale * scaleF}) rotate(90deg)`;
                        }
                    } catch(e) { console.error('Image load fail:', e); }

                    // Toolbar
                    const tbContent = slotToolbarTemplate.content.cloneNode(true);
                    const btnA3Toggle = tbContent.querySelector('.btn-a3-toggle');
                    if (slotItem.isA3Full) {
                        btnA3Toggle.textContent = 'A4に戻す';
                    } else {
                        btnA3Toggle.textContent = 'A3表示';
                    }
                    btnA3Toggle.onclick = () => {
                        slotItem.isA3Full = !slotItem.isA3Full;
                        renderLayout();
                    };
                    tbContent.querySelector('.btn-duplicate').onclick = () => {
                        pageMapping.splice(mapIndex + 1, 0, { type: 'page', pageIndex: slotItem.pageIndex, originalOrder: slotItem.originalOrder, isA3Full: slotItem.isA3Full });
                        renderLayout();
                    };
                    tbContent.querySelector('.btn-skip').onclick = () => {
                        // Mark as deleted
                        const removed = pageMapping.splice(mapIndex, 1)[0];
                        deletedPages.push({ pageIndex: removed.pageIndex, originalOrder: removed.originalOrder });
                        updateDeletedPagesTray();
                        renderLayout();
                    };
                    tbContent.querySelector('.btn-blank').onclick = () => {
                        pageMapping.splice(mapIndex, 0, { type: 'blank' });
                        renderLayout();
                    };
                    overlayEl.appendChild(tbContent);
                } else if (slotItem.type === 'blank') {
                    slotEl.classList.add('is-skipped');
                    const tbContent = emptySlotToolbarTemplate.content.cloneNode(true);
                    tbContent.querySelector('.btn-remove-blank').onclick = () => {
                        pageMapping.splice(mapIndex, 1);
                        renderLayout();
                    };
                    overlayEl.appendChild(tbContent);
                }
            } else if (slotItem && slotItem.type === 'ghost-blank') {
                slotEl.classList.add('is-ghost');
                slotEl.style.backgroundColor = '#f8fafc'; 
            } else {
                slotEl.classList.add('is-skipped');
                slotEl.style.backgroundColor = '#f8fafc'; 
            }
            
            slotEl.appendChild(overlayEl);
            sheetEl.appendChild(slotEl);

            currentProgress++;
            updateLoadingProgress(currentProgress, maxProgress);
        }
        previewContainer.appendChild(sheetEl);
    }
    
    updateDeletedPagesTray();
    hideLoading();
}

async function getCachedPageUrl(pageIndex) {
    if (pageCache[pageIndex]) return pageCache[pageIndex];

    const page = await originalPdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const isLandscape = viewport.width > viewport.height;
    
    // Limits rendering resolution to conserve WebGL memory and heap
    const renderScale = Math.min(800 / viewport.width, 1.5);
    const finalViewport = page.getViewport({ scale: renderScale });
    
    const offCanvas = document.createElement('canvas');
    offCanvas.width = finalViewport.width;
    offCanvas.height = finalViewport.height;
    
    await page.render({ canvasContext: offCanvas.getContext('2d'), viewport: finalViewport }).promise;
    
    // Save to JPEG Blob URL -> Frees canvas memory!
    return new Promise((resolve) => {
        offCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            pageCache[pageIndex] = { url, isLandscape };
            resolve(pageCache[pageIndex]);
        }, 'image/jpeg', 0.85);
    });
}

// Generates PDF and returns Blob URL
async function createFinalPdfBlob() {
    if (!currentFile) return null;
    
    const { PDFDocument } = window.PDFLib;
    const finalDoc = await PDFDocument.create();
    
    // ALWAYS read fresh buffer to avoid "Detached ArrayBuffer" error
    const freshBuffer = await currentFile.arrayBuffer();
    const srcDoc = await PDFDocument.load(freshBuffer);
    
    const A3_W = 841.89;
    const A3_H = 1190.55;
    const PAGE_WIDTH = a3Orientation === 'Portrait' ? Math.min(A3_W, A3_H) : Math.max(A3_W, A3_H);
    const PAGE_HEIGHT = a3Orientation === 'Portrait' ? Math.max(A3_W, A3_H) : Math.min(A3_W, A3_H);

    let sheets = [];
    let currentSheet = [];
    
    for (let i = 0; i < pageMapping.length; i++) {
        const item = pageMapping[i];
        if (item.type === 'page' && item.isA3Full) {
            if (currentSheet.length > 0) {
                while (currentSheet.length < 2) currentSheet.push({ type: 'ghost-blank' });
                sheets.push(currentSheet);
                currentSheet = [];
            }
            sheets.push([item]);
        } else {
            currentSheet.push(item);
            if (currentSheet.length === 2) {
                sheets.push(currentSheet);
                currentSheet = [];
            }
        }
    }
    if (currentSheet.length > 0) {
        while (currentSheet.length < 2) currentSheet.push({ type: 'ghost-blank' });
        sheets.push(currentSheet);
    }

    const pageVariationsNeeded = new Set();
    sheets.forEach(sheetItems => {
        const isA3Sheet = sheetItems.length === 1 && sheetItems[0].isA3Full;
        sheetItems.forEach(item => {
            if (item.type === 'page') {
                pageVariationsNeeded.add(`${item.pageIndex}_${isA3Sheet}`);
            }
        });
    });
    
    if (pageVariationsNeeded.size === 0) return null;
    
    const indexMap = {};
    for (let variation of pageVariationsNeeded) {
        const [pageIndexStr, isA3Str] = variation.split('_');
        const idx = parseInt(pageIndexStr);
        const isA3Full = isA3Str === 'true';
        
        const srcPage = srcDoc.getPage(idx);
        const origBox = typeof srcPage.getCropBox === 'function' ? srcPage.getCropBox() : { x: 0, y: 0, width: srcPage.getWidth(), height: srcPage.getHeight() };
        
        const cols = isA3Full ? 1 : (a3Orientation === 'Portrait' ? 1 : 2);
        const rows = isA3Full ? 1 : (a3Orientation === 'Portrait' ? 2 : 1);
        const cellW = PAGE_WIDTH / cols;
        const cellH = PAGE_HEIGHT / rows;

        let shouldRotate = false;
        if ((origBox.width > origBox.height) !== (cellW > cellH)) {
            shouldRotate = true;
        }

        let fitScaleX, fitScaleY, cropW, cropH;
        if (shouldRotate) {
            fitScaleX = cellW / origBox.height;
            fitScaleY = cellH / origBox.width;
            const finalScale = Math.min(fitScaleX, fitScaleY) * globalScale;
            cropW = cellH / finalScale;
            cropH = cellW / finalScale;
        } else {
            fitScaleX = cellW / origBox.width;
            fitScaleY = cellH / origBox.height;
            const finalScale = Math.min(fitScaleX, fitScaleY) * globalScale;
            cropW = cellW / finalScale;
            cropH = cellH / finalScale;
        }
        
        const cropX = origBox.x + (origBox.width - cropW) / 2;
        const cropY = origBox.y + (origBox.height - cropH) / 2;
        
        const embeddedPage = await finalDoc.embedPage(srcPage, {
            left: cropX, bottom: cropY, right: cropX + cropW, top: cropY + cropH
        });
        
        indexMap[variation] = { page: embeddedPage, shouldRotate, cellW, cellH };
    }

    const maxProgress = sheets.reduce((acc, sheet) => acc + sheet.length, 0);
    showLoading(maxProgress);
    let currentProgress = 0;

    for (let s = 0; s < sheets.length; s++) {
        const sheetItems = sheets[s];
        const currentSheetPage = finalDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        const isA3Sheet = sheetItems.length === 1 && sheetItems[0].isA3Full;
        const cols = isA3Sheet ? 1 : (a3Orientation === 'Portrait' ? 1 : 2);

        for (let i = 0; i < sheetItems.length; i++) {
            const item = sheetItems[i];
            
            if (item.type === 'page') {
                const variation = `${item.pageIndex}_${isA3Sheet}`;
                const { page: embeddedPage, shouldRotate, cellW, cellH } = indexMap[variation];
                
                const col = i % cols;
                const row = Math.floor(i / cols);
                
                const x = col * cellW;
                const y = PAGE_HEIGHT - (row + 1) * cellH; 

                if (shouldRotate) {
                    currentSheetPage.drawPage(embeddedPage, {
                        x: x,
                        y: y + cellH,
                        width: cellH,
                        height: cellW,
                        rotate: window.PDFLib.degrees(-90)
                    });
                } else {
                    currentSheetPage.drawPage(embeddedPage, { x: x, y: y, width: cellW, height: cellH });
                }
            }
            
            currentProgress++;
            updateLoadingProgress(currentProgress, maxProgress);
        }
        
        if (s % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }



    const pdfBytes = await finalDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

// Export 
async function generateNIn1Pdf() {
    if (!currentFile) return;
    
    showLoading();
    btnExport.disabled = true;

    try {
        const blob = await createFinalPdfBlob();
        if(!blob) throw new Error("出力するページがありません。");
        const url = URL.createObjectURL(blob);
        
        const dateObj = new Date();
        const yy = String(dateObj.getFullYear()).slice(-2);
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const yymmdd = `${yy}${mm}${dd}`;
        const baseName = currentFile.name.replace(/\.pdf$/i, '');

        const a = document.createElement('a');
        a.href = url;
        a.download = `[A3-mix]${baseName}_${yymmdd}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) {
        console.error(e);
        alert(e.message || 'PDF生成中にエラーが発生しました。');
    } finally {
        btnExport.disabled = false;
        hideLoading();
    }
}

// Print via high-quality blob open
async function generatePrintPdf() {
    if (!currentFile) return;
    showLoading();
    btnPrint.disabled = true;

    try {
        const blob = await createFinalPdfBlob();
        if(!blob) throw new Error("出力するページがありません。");
        const url = URL.createObjectURL(blob);
        // Opens the PDF natively in browser handling printing natively
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000); // give time to load in new tab
    } catch(e) {
        console.error(e);
        alert(e.message || '印刷用データの生成にエラーが発生しました。');
    } finally {
        btnPrint.disabled = false;
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', init);
