// ==========================================
// 3_TOPO.JS (ENTERPRISE TOPOGRAPHY ENGINE)
// Validation & Correction of Topography Elevation with Smart Mapper
// ==========================================

let tempTopoImportData = { headers: [], data: [] };

function initTopoModule() {
    injectTopoMapperModal(); // Inject Modal Wizard ke DOM

    // 1. Perbaikan Performa: Listener Input Tolerance menggunakan Debounce
    const tolInput = document.getElementById('topo-tolerance');
    if (tolInput) {
        let debounceTimer;
        tolInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runTopoAnalysis(true);
            }, 50); 
        });
    }

    const actionPanel = document.getElementById('actions-topo');
    if (actionPanel) {
        const refreshBtn = actionPanel.querySelector('.lucide-rotate-ccw')?.closest('button');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!state.topoLogs || state.topoLogs.length === 0) {
                    if(typeof showToast === 'function') showToast("Please run calculation first.", "warning");
                    return;
                }
                runTopoAnalysis();
                if(typeof showToast === 'function') showToast("Tolerance updated and charts refreshed.", "success");
            });
        }
    }
    
    runTopoAnalysis(true);
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && btn.getAttribute('onclick')?.includes("'topo'")) {
        setTimeout(() => {
            runTopoAnalysis(true);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }, 100);
    }
});

// =========================================
// --- DOM INJECTION: TOPO SMART MAPPER ---
// =========================================
function injectTopoMapperModal() {
    if (document.getElementById('modal-topo-mapper')) return;

    const modal = document.createElement('div');
    modal.id = 'modal-topo-mapper';
    modal.className = 'fixed inset-0 bg-slate-900/90 hidden z-[110] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-fade-in border border-slate-700">
            <div class="p-4 border-b border-slate-200 bg-slate-800 flex justify-between items-center shrink-0">
                <div class="flex items-center gap-3">
                    <div class="bg-white/20 p-2 rounded-lg"><i data-lucide="map" class="w-5 h-5 text-emerald-300"></i></div>
                    <div>
                        <h3 class="text-white font-black text-sm tracking-widest uppercase">Topo Import Wizard</h3>
                        <p class="text-[10px] text-slate-300 font-medium mt-0.5">Map your survey CSV/Excel columns to the spatial engine.</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span id="topo-mapper-row-count" class="bg-slate-700 text-white text-[10px] font-black px-3 py-1 rounded shadow-inner border border-slate-600">0 POINTS DETECTED</span>
                    <button onclick="document.getElementById('modal-topo-mapper').classList.add('hidden')" class="text-slate-400 hover:text-white transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-100">
                <div class="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
                    <div class="bg-emerald-50 border-b border-emerald-100 p-3 flex items-center gap-2 shrink-0">
                        <i data-lucide="crosshair" class="w-4 h-4 text-emerald-600"></i>
                        <h4 class="text-[11px] font-black text-emerald-800 uppercase tracking-widest">Survey Coordinates (Required)</h4>
                    </div>
                    <div class="overflow-x-auto w-full">
                        <table class="w-full text-left text-[10px] whitespace-nowrap">
                            <thead class="bg-slate-100 text-slate-500">
                                <tr><th class="p-2.5 border-r border-slate-200 w-1/3">Target Schema</th><th class="p-2.5 border-r border-slate-200 w-1/2">Survey Column</th><th class="p-2.5">Preview</th></tr>
                            </thead>
                            <tbody id="topo-mapper-tbody" class="divide-y divide-slate-100 text-slate-700"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="p-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <p class="text-[11px] text-slate-500 font-bold italic" id="topo-mapper-status">Waiting for coordinate mapping...</p>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('modal-topo-mapper').classList.add('hidden')" class="px-5 py-2 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded border border-transparent transition-colors">Cancel</button>
                    <button id="btn-execute-topo-import" onclick="window.executeTopoImport()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded font-black text-sm shadow-md transition-all flex items-center gap-2 opacity-50 cursor-not-allowed" disabled>
                        <i data-lucide="check-circle" class="w-4 h-4"></i> PROCESS TOPO DATA
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// =========================================
// --- CORE ENGINE & LOGIC ---
// =========================================

window.processTopoFile = function() {
    const fileInput = document.getElementById('topo-file-upload');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
        if (state.topoData && state.topoData.length > 0) {
            runTopoCalculation();
            return;
        }
        if(typeof showToast === 'function') showToast('Please select a CSV/XLSX Topography file first.', 'warning');
        return;
    }

    if(typeof showLoader === 'function') showLoader("Reading File", "Extracting topography headers...");
    
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        Papa.parse(file, { 
            header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, ''), 
            complete: res => {
                if (!res.data.length) { hideLoader(); return showToast('Empty CSV data!', 'error'); }
                tempTopoImportData.headers = res.meta.fields;
                tempTopoImportData.data = res.data;
                hideLoader();
                openTopoMapperWizard();
            }
        });
    } 
    else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet, {raw: false, defval: ""});
                
                if (json.length === 0) throw new Error("Empty Excel Data");
                
                tempTopoImportData.headers = Object.keys(json[0]);
                tempTopoImportData.data = json;
                hideLoader();
                openTopoMapperWizard();
            } catch(e) {
                if(typeof hideLoader === 'function') hideLoader();
                if(typeof showToast === 'function') showToast("Error reading Excel file.", "error");
            }
        };
        reader.readAsArrayBuffer(file); 
    } 
    else {
        if(typeof hideLoader === 'function') hideLoader();
        if(typeof showToast === 'function') showToast("Unsupported file format.", "error");
    }
};

window.openTopoMapperWizard = function() {
    const tbody = document.getElementById('topo-mapper-tbody');
    document.getElementById('topo-mapper-row-count').textContent = `${tempTopoImportData.data.length.toLocaleString()} POINTS DETECTED`;

    const headers = tempTopoImportData.headers;
    const sampleRows = tempTopoImportData.data.slice(0, 2);

    const reqs = [
        { id: 'X', label: 'Easting (X) <span class="text-rose-500">*</span>', keywords: ['x', 'east', 'lon'] },
        { id: 'Y', label: 'Northing (Y) <span class="text-rose-500">*</span>', keywords: ['y', 'north', 'lat'] },
        { id: 'Z', label: 'Elevation (Z) <span class="text-rose-500">*</span>', keywords: ['z', 'elev', 'rl', 'topo'] }
    ];

    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords) => {
        let options = `<option value="">-- Select Column --</option>`;
        let autoSelected = "";
        
        headers.forEach(h => {
            let match = keywords.some(kw => h.toLowerCase() === kw || h.toLowerCase().includes(kw));
            let selected = "";
            if (match && !usedHeaders.has(h) && autoSelected === "") {
                selected = "selected"; autoSelected = h; usedHeaders.add(h);
            }
            options += `<option value="${h}" ${selected}>${h}</option>`;
        });

        const previewText = autoSelected ? sampleRows.map(r => String(r[autoSelected]).substring(0,12) || '-').join(' | ') : '-';
        const bgClass = autoSelected ? 'bg-emerald-50/50' : 'bg-rose-50/30';
        const badge = autoSelected ? `<span class="ml-1.5 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">Mapped</span>` : '';

        return `
            <tr class="topo-mapper-row ${bgClass} transition-colors" data-sys="${sysId}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-800">${sysLabel} ${badge}</td>
                <td class="p-2 border-r border-slate-200">
                    <select class="topo-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 bg-white shadow-sm" onchange="window.updateTopoPreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 topo-preview-cell truncate max-w-[120px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    tbody.innerHTML = reqs.map(req => createRow(req.id, req.label, req.keywords)).join('');

    document.getElementById('modal-topo-mapper').classList.remove('hidden');
    window.validateTopoMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updateTopoPreview = function(selectEl) {
    const val = selectEl.value;
    const tr = selectEl.closest('tr');
    const previewCell = tr.querySelector('.topo-preview-cell');
    
    if (val) {
        const sampleRows = tempTopoImportData.data.slice(0, 2);
        const previewText = sampleRows.map(r => String(r[val]).substring(0,12) || '-').join(' | ');
        previewCell.textContent = previewText; previewCell.title = previewText;
        tr.classList.remove('bg-rose-50/30', 'bg-white'); tr.classList.add('bg-blue-50/50'); 
    } else {
        previewCell.textContent = '-';
        tr.classList.replace('bg-blue-50/50', 'bg-rose-50/30');
    }
    window.validateTopoMapping();
};

window.validateTopoMapping = function() {
    const rows = document.querySelectorAll('.topo-mapper-row');
    let isValid = true;
    rows.forEach(tr => { if (!tr.querySelector('select').value) isValid = false; });

    const btn = document.getElementById('btn-execute-topo-import');
    const status = document.getElementById('topo-mapper-status');
    if (isValid) {
        btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "Coordinates mapped. Ready to calculate Topography.";
        status.className = "text-[11px] text-emerald-600 font-black tracking-wide";
    } else {
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        status.textContent = "Missing mandatory XYZ coordinates (*)";
        status.className = "text-[11px] text-rose-500 font-bold italic";
    }
};

window.executeTopoImport = function() {
    document.getElementById('modal-topo-mapper').classList.add('hidden');
    showLoader("Processing Topo Data", "Standardizing coordinates...");

    setTimeout(() => {
        const mapDictionary = {}; 
        document.querySelectorAll('.topo-mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) mapDictionary[sourceCol] = sysId;
        });

        // Transformasi ke format XYZ Standar
        const standardizedData = tempTopoImportData.data.map(row => {
            let newRow = {};
            for (const [srcKey, sysKey] of Object.entries(mapDictionary)) {
                let val = row[srcKey];
                newRow[sysKey] = (val !== undefined && val !== null) ? String(val).trim() : '';
            }
            return newRow;
        });

        state.topoData = standardizedData;
        tempTopoImportData = { headers: [], data: [] }; // Bersihkan RAM
        
        runTopoCalculation();
    }, 500);
};

function runTopoCalculation() {
    if(typeof showLoader === 'function') showLoader("Running Spatial Validation", "Calculating Inverse Distance Weighting...");
    
    setTimeout(() => {
        try {
            const zCol = state.detectedCoords.z, xCol = state.detectedCoords.x, yCol = state.detectedCoords.y, holeCol = state.coreCols.holeId;

            if (!zCol || !holeCol || !xCol || !yCol) throw new Error("X, Y, or Z column not detected in drill database."); 
            if (!state.topoData || state.topoData.length === 0) throw new Error("Topography data is missing.");

            state.topoLogs = [];
            const rawGrouped = typeof groupDataByHole === 'function' ? groupDataByHole(state.rawData, holeCol) : new Map();
            
            // Menggunakan kolom X, Y, Z hasil standarisasi dari Wizard
            const topoPoints = state.topoData.map(row => {
                const px = parseFloat(String(row['X']).replace(/,/g, '.'));
                const py = parseFloat(String(row['Y']).replace(/,/g, '.'));
                const pz = parseFloat(String(row['Z']).replace(/,/g, '.'));
                return { x: px, y: py, z: pz };
            }).filter(p => !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z));

            if (topoPoints.length === 0) throw new Error("Topography data has no valid numeric coordinates.");

            rawGrouped.forEach((drillRows, hole) => {
                if (drillRows[0]._origZ === undefined) { 
                    drillRows.forEach(r => r._origZ = r[zCol]); 
                }

                let drillX = NaN, drillY = NaN, origZ = NaN;
                const parseNum = (v) => {
                    if (v === undefined || v === null || v === '') return NaN;
                    return parseFloat(String(v).replace(/,/g, '.'));
                };

                for (let r of drillRows) {
                    if (isNaN(origZ)) origZ = parseNum(r._origZ);
                    if (isNaN(drillX)) drillX = parseNum(r[xCol]);
                    if (isNaN(drillY)) drillY = parseNum(r[yCol]);
                    if (!isNaN(origZ) && !isNaN(drillX) && !isNaN(drillY)) break;
                }

                if (!isNaN(origZ) && !isNaN(drillX) && !isNaN(drillY)) {
                    let top1 = { d: Infinity, z: 0 }, top2 = { d: Infinity, z: 0 }, top3 = { d: Infinity, z: 0 };
                    for (let i = 0; i < topoPoints.length; i++) {
                        const tp = topoPoints[i], dx = tp.x - drillX, dy = tp.y - drillY, d = Math.sqrt(dx * dx + dy * dy);
                        if (d < top1.d) { top3 = top2; top2 = top1; top1 = { d: d, z: tp.z }; } 
                        else if (d < top2.d) { top3 = top2; top2 = { d: d, z: tp.z }; } 
                        else if (d < top3.d) { top3 = { d: d, z: tp.z }; }
                    }

                    const nearest = [top1, top2, top3].filter(n => n.d !== Infinity);
                    let topoZ = 0, method = '', avgDist = 0;

                    if (nearest.length > 0 && nearest[0].d <= 0.1) { topoZ = nearest[0].z; method = 'EXACT'; avgDist = nearest[0].d; } 
                    else if (nearest.length > 0) {
                        let sumWeight = 0, sumZWeight = 0, sumDist = 0;
                        nearest.forEach(pt => { const weight = 1 / Math.pow(Math.max(pt.d, 0.001), 2); sumWeight += weight; sumZWeight += pt.z * weight; sumDist += pt.d; });
                        topoZ = sumZWeight / sumWeight; avgDist = sumDist / nearest.length;
                        method = avgDist <= 50 ? 'INTERPOLATED' : 'EXTRAPOLATED (WARNING)';
                    } else { topoZ = origZ; method = 'NO_DATA'; }

                    const diff = origZ - topoZ;
                    state.topoLogs.push({ Hole_ID: hole, Drill_Z: origZ, Topo_Z: topoZ, Diff: diff, Status: '', Method: method, AvgDist: avgDist, Corrected_Z: topoZ });
                    
                    drillRows.forEach(r => r[zCol] = topoZ.toFixed(2));
                } else {
                     state.topoLogs.push({ Hole_ID: hole, Drill_Z: NaN, Topo_Z: NaN, Diff: NaN, Status: 'ERROR', Method: 'INVALID_COORDS', AvgDist: NaN, Corrected_Z: NaN });
                }
            });

            state.isTopoValidated = true;

            if(state.domainedData && state.domainedData.length > 0) {
                if(typeof runDomaining === 'function') state.domainedData = runDomaining(state.rawData); 
                if(typeof runCompositing === 'function') state.compositedData = runCompositing(state.domainedData);
                if(typeof calculateEDA === 'function') calculateEDA(); 
                if(typeof renderDomain === 'function') renderDomain(); 
                if(typeof renderComposite === 'function') renderComposite(); 
                if(typeof renderEDA === 'function') renderEDA();
            }

            runTopoAnalysis();
            if(typeof showToast === 'function') showToast("Topography Calculation Complete.", "success");

        } catch (error) {
            console.error(error);
            if(typeof showToast === 'function') showToast(error.message || "An error occurred.", "error");
        } finally {
            if(typeof hideLoader === 'function') hideLoader();
        }
    }, 200);
}

function runTopoAnalysis(disableAnim = false) {
    const dashboard = document.getElementById('topo-dashboard');
    const chartsContainer = document.getElementById('topo-charts-container');
    const tableContainer = document.getElementById('topo-table-container');

    let emptyState = document.getElementById('topo-empty-state');
    if (!emptyState && dashboard) {
        emptyState = document.createElement('div');
        emptyState.id = 'topo-empty-state';
        emptyState.className = 'flex flex-col items-center justify-center flex-grow bg-white rounded-xl border border-slate-200 p-10 shadow-sm w-full min-h-[400px] mb-6';
        emptyState.innerHTML = `
            <div class="bg-slate-50 p-5 rounded-full shadow-inner mb-4 border border-slate-100">
                <i data-lucide="mountain" class="w-16 h-16 text-slate-300 drop-shadow-sm"></i>
            </div>
            <h3 class="text-xl font-black text-slate-600 mb-2 tracking-tight uppercase">Topography Validation</h3>
            <p class="text-sm font-medium text-slate-400 text-center max-w-md">
                No survey dataset loaded. Please import a CSV/XLSX file from the Action Panel to begin calculation.
            </p>
        `;
        dashboard.parentNode.insertBefore(emptyState, dashboard);
    }

    if (!state.topoLogs || state.topoLogs.length === 0) {
        if (emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
        if (dashboard) dashboard.classList.add('hidden');
        if (chartsContainer) chartsContainer.classList.add('hidden');
        if (tableContainer) tableContainer.classList.add('hidden');
        document.getElementById('btn-download-topo')?.classList.add('hidden');
        document.getElementById('btn-print-topo-pdf')?.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
    if (dashboard) { dashboard.classList.remove('hidden'); dashboard.classList.add('grid'); }
    if (chartsContainer) { chartsContainer.classList.remove('hidden'); chartsContainer.classList.add('grid'); }
    if (tableContainer) { tableContainer.classList.remove('hidden'); tableContainer.classList.add('flex'); }

    const tolInput = document.getElementById('topo-tolerance');
    const tol = tolInput ? (parseFloat(tolInput.value) || 0.5) : 0.5;

    state.topoLogs.forEach(log => {
        if (log.Method === 'INVALID_COORDS' || log.Method === 'ERROR') {
             log.Status = 'ERROR'; return;
        }
        if (log.Diff > tol) log.Status = 'FILL'; 
        else if (log.Diff < -tol) log.Status = 'CUT'; 
        else log.Status = 'MATCH';
    });

    renderTopoUI(disableAnim);
}

function renderTopoUI(disableAnim = false) {
    document.getElementById('btn-download-topo')?.classList.remove('hidden');
    document.getElementById('btn-print-topo-pdf')?.classList.remove('hidden');

    const logs = state.topoLogs;
    if (!logs || logs.length === 0) return;
    
    const statTotal = document.getElementById('topo-stat-total'); if (statTotal) statTotal.textContent = logs.length;
    const statMatch = document.getElementById('topo-stat-match'); if (statMatch) statMatch.textContent = logs.filter(l => l.Status === 'MATCH').length;
    const statFill = document.getElementById('topo-stat-fill'); if (statFill) statFill.textContent = logs.filter(l => l.Status === 'FILL').length;
    const statCut = document.getElementById('topo-stat-cut'); if (statCut) statCut.textContent = logs.filter(l => l.Status === 'CUT').length;

    const tbody = document.getElementById('topo-tbody');
    if (tbody) {
        tbody.innerHTML = logs.map(log => {
            let badgeClass = log.Status === 'FILL' ? 'bg-amber-100/50 text-amber-700 border border-amber-200' : 
                             (log.Status === 'CUT' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 
                             (log.Status === 'ERROR' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'));
            
            let methodClass = log.Method === 'EXACT' ? 'text-teal-600 font-bold' : 
                               (log.Method.includes('EXTRAPOLATED') ? 'text-rose-600 font-bold' : 'text-slate-500 font-medium');
                              
            return `<tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="p-3"><span class="px-2.5 py-1 rounded text-[9px] uppercase font-bold tracking-widest shadow-sm ${badgeClass}">${log.Status}</span></td>
                <td class="p-3 font-bold text-slate-800 font-mono">${log.Hole_ID}</td>
                <td class="p-3 font-mono text-[11px] ${methodClass}">${log.Method}</td>
                <td class="p-3 font-mono text-[11px] text-slate-500">${isNaN(log.AvgDist) ? '-' : log.AvgDist.toFixed(2)}</td>
                <td class="p-3 font-mono text-slate-500 text-right">${isNaN(log.Drill_Z) ? '-' : log.Drill_Z.toFixed(2)}</td>
                <td class="p-3 font-mono font-medium text-slate-600 text-right">${isNaN(log.Topo_Z) ? '-' : log.Topo_Z.toFixed(2)}</td>
                <td class="p-3 font-mono font-bold text-teal-700 text-right">${isNaN(log.Corrected_Z) ? '-' : log.Corrected_Z.toFixed(2)}</td>
                <td class="p-3 font-mono text-slate-700 text-right ${Math.abs(log.Diff)>0.5 ? 'font-bold' : ''}">${isNaN(log.Diff) ? '-' : (log.Diff > 0 ? '+' : '') + log.Diff.toFixed(2)}</td>
            </tr>`;
        }).join('');
    }
    
    renderTopoCharts(disableAnim);
}

function renderTopoCharts(disableAnim) {
    const ctxBefore = document.getElementById('topo-chart-before');
    const ctxAfter = document.getElementById('topo-chart-after');
    if (!ctxBefore || !ctxAfter || !state.topoLogs || state.topoLogs.length === 0) return;

    const dataBefore = state.topoLogs.filter(l => !isNaN(l.Topo_Z) && !isNaN(l.Drill_Z)).map(l => ({ x: l.Topo_Z, y: l.Drill_Z, raw: l }));
    const dataAfter = state.topoLogs.filter(l => !isNaN(l.Topo_Z) && !isNaN(l.Corrected_Z)).map(l => ({ x: l.Topo_Z, y: l.Corrected_Z, raw: l }));
    
    if (dataBefore.length === 0) return;

    const minZ = Math.min(...dataBefore.map(l => l.x)) - 2, maxZ = Math.max(...dataBefore.map(l => l.x)) + 2;
    const referenceLine = [{x: minZ, y: minZ}, {x: maxZ, y: maxZ}];
    
    const pointColors = state.topoLogs.filter(l => !isNaN(l.Topo_Z)).map(l => l.Status === 'FILL' ? '#b45309' : (l.Status === 'CUT' ? '#be123c' : '#334155'));
    const correctedColor = '#0f766e'; 

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    const n = dataBefore.length;
    dataBefore.forEach(pt => {
        sumX += pt.x; sumY += pt.y; sumXY += pt.x * pt.y;
        sumX2 += pt.x * pt.x; sumY2 += pt.y * pt.y;
    });
    const num = (n * sumXY) - (sumX * sumY);
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r = den === 0 ? 0 : num / den;
    const r2 = (r * r).toFixed(3);

    let r2Status = "", r2Color = "";
    if (r2 >= 0.90) { r2Status = "Excellent (High Confidence)"; r2Color = "#0f766e"; }
    else if (r2 >= 0.75) { r2Status = "Good (Acceptable)"; r2Color = "#0369a1"; } 
    else if (r2 >= 0.50) { r2Status = "Poor (Needs Evaluation)"; r2Color = "#b45309"; } 
    else { r2Status = "Bad (Unusable)"; r2Color = "#be123c"; }

    const fontStyle = { family: "'Inter', sans-serif", size: 10, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };

    let existBefore = Chart.getChart('topo-chart-before');
    if (existBefore) {
        existBefore.data.datasets[0].data = dataBefore;
        existBefore.data.datasets[0].backgroundColor = pointColors;
        existBefore.data.datasets[1].data = referenceLine;
        existBefore.options.plugins.title.text = `R² = ${r2} [${r2Status}]`;
        existBefore.options.plugins.title.color = r2Color;
        existBefore.update(disableAnim ? 'none' : 'default');
    } else {
        window.topoChartBeforeInstance = new Chart(ctxBefore, { 
            type: 'scatter', 
            data: { 
                datasets: [
                    { label: 'Drill Points', data: dataBefore, backgroundColor: pointColors, borderColor: 'white', borderWidth: 1, pointRadius: 3.5, pointHoverRadius: 6 }, 
                    { label: 'Ideal Surface', data: referenceLine, type: 'line', borderColor: '#94a3b8', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false }
                ] 
            }, 
            options: {
                responsive: true, maintainAspectRatio: false, animation: disableAnim ? false : { duration: 1000 }, 
                scales: {
                    x: { title: { display: true, text: 'Topography Z (Surface)', font: fontStyle, color: '#475569' }, grid: gridStyle, ticks: { font: fontStyle } },
                    y: { title: { display: true, text: 'Drill Collar Z', font: fontStyle, color: '#475569' }, grid: gridStyle, ticks: { font: fontStyle } }
                },
                plugins: { 
                    legend: { display: false }, 
                    title: { display: true, text: `R² = ${r2} [${r2Status}]`, font: { size: 12, weight: 'bold', family: "'Inter', sans-serif" }, color: r2Color, padding: { bottom: 15 } },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleFont: { size: 11 }, bodyFont: { family: 'monospace' }, padding: 10, cornerRadius: 4 } 
                },
                layout: { padding: 10 }
            } 
        });
    }

    let existAfter = Chart.getChart('topo-chart-after');
    if (existAfter) {
        existAfter.data.datasets[0].data = dataAfter;
        existAfter.data.datasets[1].data = referenceLine;
        existAfter.update(disableAnim ? 'none' : 'default');
    } else {
        window.topoChartAfterInstance = new Chart(ctxAfter, { 
            type: 'scatter', 
            data: { 
                datasets: [
                    { label: 'Corrected Points', data: dataAfter, backgroundColor: correctedColor, borderColor: 'white', borderWidth: 1, pointRadius: 3.5, pointHoverRadius: 6 }, 
                    { label: 'Ideal Surface', data: referenceLine, type: 'line', borderColor: '#94a3b8', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false }
                ] 
            }, 
            options: {
                responsive: true, maintainAspectRatio: false, animation: disableAnim ? false : { duration: 1000 },
                scales: {
                    x: { title: { display: true, text: 'Topography Z (Surface)', font: fontStyle, color: '#475569' }, grid: gridStyle, ticks: { font: fontStyle } },
                    y: { title: { display: true, text: 'Drill Collar Z', font: fontStyle, color: '#475569' }, grid: gridStyle, ticks: { font: fontStyle } }
                },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleFont: { size: 11 }, bodyFont: { family: 'monospace' }, padding: 10, cornerRadius: 4 } },
                layout: { padding: 10 }
            } 
        });
    }
}

window.generateTopoPdf = async function() {
    if (typeof showLoader === 'function') showLoader("Preparing PDF", "Downloading rendering module...");
    
    try { if (typeof ensurePdfLibraries === 'function') await ensurePdfLibraries(); } 
    catch(e) {
        if (typeof hideLoader === 'function') hideLoader();
        if (typeof showToast === 'function') showToast("Failed to load PDF library.", "error");
        return;
    }

    const jsPDFClass = typeof getJSPDFInstance === 'function' ? getJSPDFInstance() : (window.jspdf ? window.jspdf.jsPDF : window.jsPDF);
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        if (typeof hideLoader === 'function') hideLoader(); return;
    }

    if (typeof showLoader === 'function') showLoader("Exporting PDF", "Rendering Charts...");

    const pdf = new jsPDFClass('p', 'mm', 'a4'); 
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
    pdf.text("Nickel QAQC Report - Topography Validation", pageWidth / 2, 15, { align: 'center' });

    const chartBeforeWrap = document.getElementById('topo-chart-before').parentNode;
    const chartAfterWrap = document.getElementById('topo-chart-after').parentNode;
    const origBeforeStyle = chartBeforeWrap.getAttribute('style') || '';
    const origAfterStyle = chartAfterWrap.getAttribute('style') || '';

    try {
        const fixedStyles = `position: fixed; top: 0px; left: 0px; z-index: 10; background-color: #ffffff; width: 1000px; height: 500px; padding: 20px; box-sizing: border-box;`;
        
        chartBeforeWrap.setAttribute('style', fixedStyles);
        runTopoAnalysis(true); 
        await new Promise(r => setTimeout(r, 600)); 
        const canvasBefore = await html2canvas(chartBeforeWrap, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1000, height: 500 });
        chartBeforeWrap.setAttribute('style', origBeforeStyle); 
        
        chartAfterWrap.setAttribute('style', fixedStyles);
        runTopoAnalysis(true); 
        await new Promise(r => setTimeout(r, 600));
        const canvasAfter = await html2canvas(chartAfterWrap, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1000, height: 500 });
        chartAfterWrap.setAttribute('style', origAfterStyle);

        const mX = 15; let maxW = pageWidth - (mX * 2);
        let drawH1 = (canvasBefore.height * maxW) / canvasBefore.width; 
        let drawH2 = (canvasAfter.height * maxW) / canvasAfter.width; 
        let yPos = 30; 
        
        pdf.setFontSize(12); pdf.setFont("helvetica", "bold"); pdf.setTextColor(30, 41, 59);
        pdf.text("Before Validation:", mX, yPos); yPos += 5;
        pdf.addImage(canvasBefore.toDataURL('image/jpeg', 1.0), 'JPEG', mX, yPos, maxW, drawH1);
        yPos += drawH1 + 15;
        
        pdf.text("After Validation (Corrected):", mX, yPos); yPos += 5;
        pdf.addImage(canvasAfter.toDataURL('image/jpeg', 1.0), 'JPEG', mX, yPos, maxW, drawH2);

        pdf.save('Topography_QAQC_Report.pdf');
        if (typeof showToast === 'function') showToast("PDF successfully downloaded.", "success");
    } catch (err) {
        if (typeof showToast === 'function') showToast("An error occurred while rendering the PDF!", "error");
    } finally {
        if (typeof hideLoader === 'function') hideLoader(); 
        chartBeforeWrap.setAttribute('style', origBeforeStyle); 
        chartAfterWrap.setAttribute('style', origAfterStyle);
        try { runTopoAnalysis(true); } catch(e) {} 
    }
}

window.downloadTopoAudit = function() {
    if (!state.topoLogs || state.topoLogs.length === 0) return;
    const csvContent = ['Hole_ID,Spatial_Method,Ref_Radius_m,Original_Drill_Z,Survey_Topo_Z,Corrected_Z,Difference_m,Validation_Status'].concat(state.topoLogs.map(l => `"${l.Hole_ID}","${l.Method}",${(isNaN(l.AvgDist) ? 0 : l.AvgDist).toFixed(2)},${isNaN(l.Drill_Z)?0:l.Drill_Z},${isNaN(l.Topo_Z)?0:l.Topo_Z},${isNaN(l.Corrected_Z)?0:l.Corrected_Z},${isNaN(l.Diff)?0:l.Diff},"${l.Status}"`)).join('\r\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = 'NiCore_Topography_Validation.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); 
    if(typeof showToast === 'function') showToast("Topo Audit downloaded.", "success");
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initTopoModule); } else { initTopoModule(); }