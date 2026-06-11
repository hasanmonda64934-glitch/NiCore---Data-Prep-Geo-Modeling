// ==========================================
// 1_CORE_WORKSPACE.JS
// CENTRAL BRAIN: Routing, State, Save/Load & Utilities
// Includes ultra-robust rehydration to prevent crashes
// ==========================================

// --- STATE MANAGEMENT ---
let state = {
    projectMeta: { company: '', client: '', location: '', block: '', geologist: '' },
    headers: [], rawData: [], qaqcLogs: [], errorMap: {}, domainedData: [], compositedData: [], edaStats: [], qaqcBlankCols: [], qaqcNegativeCols: [], qaqcZeroCols: [], exportCols: [], auditTrail: [], compositeAuditLog: [], 
    coreCols: { 
        holeId: 'Hole_ID', from: 'From', to: 'To', length: 'Length',
        wellsite: null, operator: null, drillSpace: null, method: null, rig: null, startDate: null, endDate: null, status: null
    },
    domainParams: { fe_lim_min: 35, mgo_sap_min: 10, mgo_brk_min: 28 },
    sgParams: { 'LIM': 1.4, 'SAP': 1.5, 'BRK': 2.2 },
    mcParams: { 'LIM': 35, 'SAP': 25, 'BRK': 5 },
    compParams: { length: 1.0, minResidualPct: 50, action: 'merge', boundaryMode: 'hard' }, 
    chartX: 'Fe', chartY: 'MgO', ternaryA: 'Fe', ternaryB: 'MgO', ternaryC: 'Ni',
    detectedCoords: { x: null, y: null, z: null, dip: null, azimuth: null },
    topoData: [], topoLogs: [], isTopoValidated: false, map2dData: [],
    editPage: 1, editRowsPerPage: 100, dhMode: 'raw', dhSelectedHole: null
};

let edaChartInstance = null, probChartInstance = null, contactChartInstance = null, varioChartInstance = null, topoChartBeforeInstance = null, topoChartAfterInstance = null;
let dhCharts = { ni: null, major: null, co: null, hist: null };
let rawHistChartObj = null; 
window.lithoChartInstance = null; 

// --- UI & ROUTING UTILITIES ---
function showLoader(title = "Processing Data", desc = "Please wait a moment...") {
    let loader = document.getElementById('global-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex flex-col items-center justify-center transition-all duration-300 opacity-0 pointer-events-none hidden';
        loader.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center">
                <div class="relative w-16 h-16 mb-4">
                    <div class="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-teal-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <h3 id="loader-title" class="text-lg font-black text-slate-800 mb-1">Processing</h3>
                <p id="loader-desc" class="text-xs text-slate-500 font-medium">Please wait...</p>
            </div>
        `;
        document.body.appendChild(loader);
    }
    document.getElementById('loader-title').textContent = title;
    document.getElementById('loader-desc').textContent = desc;
    loader.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    loader.classList.add('flex', 'opacity-100');
}

function updateGeologistBadge() {
    const badge = document.getElementById('user-geologist-name');
    if(badge) {
        let geoName = state.projectMeta && state.projectMeta.geologist 
            ? state.projectMeta.geologist 
            : 'GEOLOGIST';
        
        // Memastikan tampilannya rapi walau namanya panjang
        badge.textContent = geoName;
    }
}

function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    loader.classList.remove('opacity-100');
    loader.classList.add('opacity-0');
    setTimeout(() => { loader.classList.remove('flex'); loader.classList.add('hidden', 'pointer-events-none'); }, 300);
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    let bgClass = 'bg-[#0f172a] border-l-[3px] border-blue-500', icon = 'info';
    if (type === 'success') { bgClass = 'bg-[#0f172a] border-l-[3px] border-teal-500'; icon = 'check-circle'; }
    if (type === 'error') { bgClass = 'bg-[#0f172a] border-l-[3px] border-rose-600'; icon = 'alert-triangle'; }
    if (type === 'warning') { bgClass = 'bg-[#0f172a] border-l-[3px] border-amber-500'; icon = 'alert-circle'; }

    toast.className = `toast-enter ${bgClass} text-white px-4 py-3 rounded shadow-2xl flex items-center gap-3 font-medium text-sm`;
    toast.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 shrink-0 opacity-80"></i> <span>${message}</span>`;
    container.appendChild(toast);
    if(typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => { toast.classList.replace('toast-enter', 'toast-exit'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function activateTopMenu(menuId) {
    document.querySelectorAll('.left-menu-group').forEach(el => el.classList.add('hidden'));
    
    document.querySelectorAll('.top-nav-btn').forEach(btn => {
        btn.classList.remove('border-emerald-400', 'text-white', 'bg-black/20');
        btn.classList.add('border-transparent', 'text-emerald-100/70');
    });
    const activeTop = document.getElementById('top-nav-' + menuId);
    if (activeTop) {
        activeTop.classList.remove('border-transparent', 'text-emerald-100/70');
        activeTop.classList.add('border-emerald-400', 'text-white', 'bg-black/20');
    }

    const activeLeftMenu = document.getElementById('left-menu-' + menuId);
    if (activeLeftMenu) {
        activeLeftMenu.classList.remove('hidden');
        
        if (menuId === 'project') {
            if(document.getElementById('upload-status') && document.getElementById('upload-status').classList.contains('hidden')){
                document.querySelectorAll('.tab-content').forEach(el => { 
                    el.classList.add('hidden'); el.classList.remove('flex', 'block'); 
                });
                document.getElementById('tab-upload')?.classList.remove('hidden');
                document.getElementById('tab-upload')?.classList.add('block');
                document.getElementById('right-sidebar')?.classList.add('hidden');
            } else {
                switchSubTab('upload');
            }
        } else if (menuId === 'validation') {
            switchSubTab('qaqc');
        } else if (menuId === 'analysis') {
            switchSubTab('domain');
        } else if (menuId === 'view') {
            switchSubTab('downhole');
        }
    }
}

function switchSubTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => { 
        el.classList.add('hidden'); el.classList.remove('flex', 'block'); 
    });
    document.querySelectorAll('.action-panel').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sub-nav-btn').forEach(btn => btn.classList.remove('active-left-nav'));

    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('flex');
    }
    
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active-left-nav');

    const rightSidebar = document.getElementById('right-sidebar');
    const targetAction = document.getElementById('actions-' + tabId);
    
    if (tabId === 'upload' || tabId === 'project') {
        if(rightSidebar) rightSidebar.classList.add('hidden');
    } else if (targetAction && rightSidebar) {
        rightSidebar.classList.remove('hidden');
        targetAction.classList.remove('hidden');
        targetAction.classList.add('flex');
    } else if (rightSidebar) {
        rightSidebar.classList.add('hidden');
    }

    // --- PERBAIKAN FINAL "PLOTLY ZERO-DIMENSION BUG" ---
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => {
            window.dispatchEvent(new Event('resize')); 
            if (typeof Plotly !== 'undefined') {
                const plotlyDivs = ['dom-post-scatter', 'dom-plan-view', 'eda-ternary-plot', 'densityScatterChart', 'densityBoxChart'];
                plotlyDivs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.data) { try { Plotly.Plots.resize(el); } catch(e){} }
                });
            }
        }, 50);
    });
    
    // Saklar otomatis bawaan aplikasi Anda
    if (tabId === 'downhole') {
        setTimeout(() => {
            if (typeof initDownholeLog === 'function') initDownholeLog(); 
        }, 100);
    } 
    else if (tabId === 'map2d') {
        setTimeout(() => {
            // Panggil inisialisasi peta
            if (typeof initMap2D === 'function') initMap2D();
            // Paksa Leaflet mengukur ulang kontainernya
            if (typeof leafletMapInstance !== 'undefined' && leafletMapInstance) {
                leafletMapInstance.invalidateSize();
            }
        }, 300);
    }
    else if (tabId === 'block') {
        setTimeout(() => {
            if (typeof initBlockUI === 'function') initBlockUI(); 
        }, 100);
    }
}

function openNewProjectModal() { document.getElementById('modal-new-project')?.classList.remove('hidden'); }
function closeNewProjectModal() { document.getElementById('modal-new-project')?.classList.add('hidden'); }

window.saveNewProject = function() {
    const modalInputs = document.querySelectorAll('#modal-new-project input[type="text"]');
    if(modalInputs.length >= 5) {
        state.projectMeta = {
            company: modalInputs[0].value || 'Unknown Company',
            client: modalInputs[1].value || 'Unknown Client',
            location: modalInputs[2].value || 'Unknown Location',
            block: modalInputs[3].value || 'Unknown Block',
            geologist: modalInputs[4].value || 'Unknown Geologist'
        };
    }
    const fileInput = document.getElementById('file-upload');
    const file = fileInput ? fileInput.files[0] : null;

    closeNewProjectModal();
    updateGeologistBadge();
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            handleDataUpload(event.target.result);
            unlockProjectMenus();
        };
        reader.readAsText(file);
    } else {
        showToast("Project successfully created. Please input the CSV file later.", "warning");
        unlockProjectMenus(); 
    }
}

function unlockProjectMenus() {
    document.getElementById('top-nav-validation')?.classList.remove('opacity-50', 'pointer-events-none');
    document.getElementById('top-nav-analysis')?.classList.remove('opacity-50', 'pointer-events-none');
    document.getElementById('top-nav-view')?.classList.remove('opacity-50', 'pointer-events-none');
    document.getElementById('menu-save-project')?.classList.remove('hidden');
    document.getElementById('menu-close-project')?.classList.remove('hidden');
    document.getElementById('menu-overview-title')?.classList.remove('hidden');
    document.getElementById('btn-upload')?.classList.remove('hidden');
    
    document.getElementById('workspace-landing')?.classList.add('hidden');
    document.getElementById('upload-status')?.classList.remove('hidden');
    switchSubTab('upload');
}

// Fallback upload trigger
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('file-upload')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) { 
            const reader = new FileReader(); 
            reader.onload = function(event) { 
                handleDataUpload(event.target.result); 
                unlockProjectMenus();
                e.target.value = ''; 
            }; 
            reader.readAsText(file); 
        }
    });
});

// =========================================================================
// FITUR BARU: SHORTCUT EXCEL (COPY, CUT, PASTE, UNDO, REDO, DELETE/CLEAR)
// =========================================================================
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('modal-data-management');
    // Hanya berjalan jika pop up Data Management sedang terbuka
    if(!modal || modal.classList.contains('hidden')) return;

    let isEditing = document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true';

    // Undo (Ctrl+Z) & Redo (Ctrl+Y)
    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if(typeof undoDataManagement === 'function') undoDataManagement(); return; }
    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); if(typeof redoDataManagement === 'function') redoDataManagement(); return; }

    // Fitur: COPY Excel (Ctrl+C)
    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'c') {
        const tbody = document.getElementById('dm-tbody');
        if(!tbody) return;
        let selected = tbody.querySelectorAll('.selected-cell');
        if(selected.length === 0) return;

        let rowMap = {};
        selected.forEach(td => {
            let r = parseInt(td.getAttribute('data-index'));
            let key = td.getAttribute('data-key');
            let val = currentEditingData[r][key];
            if(val === undefined || val === null) val = '';
            
            if(!rowMap[r]) rowMap[r] = [];
            rowMap[r].push(val);
        });

        let tsv = Object.values(rowMap).map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsv).then(() => {});
    }

    // Fitur: CUT Excel (Ctrl+X)
    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'x') {
        const tbody = document.getElementById('dm-tbody');
        if(!tbody) return;
        let selected = tbody.querySelectorAll('.selected-cell');
        if(selected.length === 0) return;

        let rowMap = {};
        let changed = false;
        selected.forEach(td => {
            let r = parseInt(td.getAttribute('data-index'));
            let key = td.getAttribute('data-key');
            let val = currentEditingData[r][key];
            if(val === undefined || val === null) val = '';
            
            if(!rowMap[r]) rowMap[r] = [];
            rowMap[r].push(val);
            
            if (currentEditingData[r][key] !== '') {
                currentEditingData[r][key] = ''; 
                td.innerText = ''; 
                changed = true;
            }
        });

        let tsv = Object.values(rowMap).map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsv);

        if (changed && typeof saveDMHistory === 'function') saveDMHistory();
    }

    // Fitur: DELETE / BACKSPACE (Clear Content)
    if (!isEditing && (e.key === 'Delete' || e.key === 'Backspace')) {
        const tbody = document.getElementById('dm-tbody');
        if(!tbody) return;
        let selected = tbody.querySelectorAll('.selected-cell');
        if(selected.length === 0) return;

        let changed = false;
        selected.forEach(td => {
            let r = parseInt(td.getAttribute('data-index'));
            let key = td.getAttribute('data-key');
            
            if (currentEditingData[r][key] !== '') {
                currentEditingData[r][key] = ''; 
                td.innerText = ''; 
                changed = true;
            }
        });

        if (changed && typeof saveDMHistory === 'function') saveDMHistory();
    }
});


// ==========================================
// DATA UPLOAD & SMART COLUMN MAPPER WIZARD
// ==========================================
let tempImportData = { headers: [], data: [] };

function handleDataUpload(csvText) {
    showLoader("Reading CSV File", "Extracting headers for mapping...");
    setTimeout(() => {
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, '') });
        if(parsed.data.length === 0) { hideLoader(); showToast("File is corrupted or empty.", "error"); return; }
        
        tempImportData.headers = parsed.meta.fields;
        tempImportData.data = parsed.data;
        
        hideLoader();
        openColumnMapperWizard();
    }, 500);
}

window.openColumnMapperWizard = function() {
    const mandatoryTbody = document.getElementById('mapper-mandatory-tbody');
    const opsTbody = document.getElementById('mapper-ops-tbody');
    const assayTbody = document.getElementById('mapper-assay-tbody');
    document.getElementById('mapper-row-count').textContent = `${tempImportData.data.length.toLocaleString()} ROWS DETECTED`;

    const headers = tempImportData.headers;
    const sampleRows = tempImportData.data.slice(0, 2);

    // KELOMPOK 1: SPATIAL (Wajib)
    const spatialReqs = [
        { id: 'Hole_ID', label: 'Hole_ID <span class="text-rose-500">*</span>', keywords: ['hole', 'bh_id', 'dh_id', 'id'] },
        { id: 'X', label: 'X (Easting) <span class="text-rose-500">*</span>', keywords: ['x', 'east'] },
        { id: 'Y', label: 'Y (Northing) <span class="text-rose-500">*</span>', keywords: ['y', 'north'] },
        { id: 'Z', label: 'Z (Elevation) <span class="text-rose-500">*</span>', keywords: ['z', 'elev', 'rl'] },
        { id: 'From', label: 'From <span class="text-rose-500">*</span>', keywords: ['from', 'depth_from'] },
        { id: 'To', label: 'To <span class="text-rose-500">*</span>', keywords: ['to', 'depth_to'] }
    ];

    // KELOMPOK 2: DRILL OPS & GEOTECH
    const opsReqs = [
        { id: 'Sample_ID', label: 'Sample_ID', keywords: ['sample', 'sampel'] },
        { id: 'Length', label: 'Length', keywords: ['length', 'interval'] },
        { id: 'Status', label: 'Status', keywords: ['status', 'keterangan'] },
        { id: 'loss', label: 'loss', keywords: ['loss', 'coreloss'] },
        { id: 'swelling', label: 'swelling', keywords: ['swelling'] },
        { id: 'recovery', label: 'recovery', keywords: ['recovery', 'rec'] },
        { id: 'Rig', label: 'Rig', keywords: ['rig', 'mesin'] },
        { id: 'Start Drilling', label: 'Start Drilling', keywords: ['start', 'mulai'] },
        { id: 'Finish Drilling', label: 'Finish Drilling', keywords: ['finish', 'selesai', 'end'] },
        { id: 'Wellsite', label: 'Wellsite', keywords: ['wellsite', 'lokasi', 'block'] },
        { id: 'Driller', label: 'Driller', keywords: ['driller', 'master', 'operator'] },
        { id: 'Space', label: 'Space', keywords: ['space', 'spasi', 'jarak'] },
        { id: 'Metode', label: 'Metode', keywords: ['metode', 'method'] }
    ];

    // KELOMPOK 3: GEOLOGY & ASSAYS
    const assayReqs = [
        { id: 'Lithology', label: 'Lithology', keywords: ['litho', 'lito', 'rock', 'domain'] },
        { id: 'Description', label: 'Description', keywords: ['desc', 'deskripsi', 'remark'] },
        { id: 'Ni', label: 'Ni', keywords: ['ni'] },
        { id: 'Fe', label: 'Fe', keywords: ['fe'] },
        { id: 'MgO', label: 'MgO', keywords: ['mgo'] },
        { id: 'SiO2', label: 'SiO2', keywords: ['sio2', 'si'] },
        { id: 'Co', label: 'Co', keywords: ['co'] },
        { id: 'Al2O3', label: 'Al2O3', keywords: ['al2o3', 'al'] },
        { id: 'MnO', label: 'MnO', keywords: ['mno', 'mn'] },
        { id: 'Cr2O3', label: 'Cr2O3', keywords: ['cr2o3', 'cr'] },
        { id: 'Fe2O3', label: 'Fe2O3', keywords: ['fe2o3'] }
    ];

    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords, isMandatory) => {
        let options = `<option value="">-- Ignore / Not Available --</option>`;
        let autoSelected = "";
        
        headers.forEach(h => {
            // Pencocokan eksak dulu, baru include
            let match = keywords.some(kw => h.toLowerCase() === kw || h.toLowerCase().includes(kw));
            let selected = "";
            if (match && !usedHeaders.has(h) && autoSelected === "") {
                selected = "selected";
                autoSelected = h;
                usedHeaders.add(h);
            }
            options += `<option value="${h}" ${selected}>${h}</option>`;
        });

        const previewText = autoSelected ? sampleRows.map(r => String(r[autoSelected]).substring(0,15) || '-').join(' | ') : '-';
        const bgClass = autoSelected ? 'bg-emerald-50/50' : (isMandatory ? 'bg-rose-50/30' : 'bg-white');
        const badge = autoSelected ? `<span class="ml-1.5 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">Mapped</span>` : '';

        return `
            <tr class="mapper-row ${bgClass} transition-colors" data-sys="${sysId}" data-mandatory="${isMandatory}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-800">${sysLabel} ${badge}</td>
                <td class="p-2 border-r border-slate-200">
                    <select class="mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-teal-500 bg-white shadow-sm" onchange="window.updatePreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 preview-cell truncate max-w-[120px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    mandatoryTbody.innerHTML = spatialReqs.map(req => createRow(req.id, req.label, req.keywords, true)).join('');
    opsTbody.innerHTML = opsReqs.map(req => createRow(req.id, req.id, req.keywords, false)).join('');
    assayTbody.innerHTML = assayReqs.map(req => createRow(req.id, req.id, req.keywords, false)).join('');

    document.getElementById('modal-column-mapper').classList.remove('hidden');
    window.validateMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updatePreview = function(selectEl) {
    const val = selectEl.value;
    const tr = selectEl.closest('tr');
    const previewCell = tr.querySelector('.preview-cell');
    
    if (val) {
        const sampleRows = tempImportData.data.slice(0, 2);
        const previewText = sampleRows.map(r => String(r[val]).substring(0,15) || '-').join(' | ');
        previewCell.textContent = previewText;
        previewCell.title = previewText;
        tr.classList.remove('bg-rose-50/30', 'bg-white');
        tr.classList.add('bg-blue-50/50'); 
    } else {
        previewCell.textContent = '-';
        if (tr.dataset.mandatory === 'true') tr.classList.replace('bg-blue-50/50', 'bg-rose-50/30');
        else tr.classList.replace('bg-blue-50/50', 'bg-white');
    }
    window.validateMapping();
};

window.addCustomAssayRow = function() {
    const assayTbody = document.getElementById('mapper-assay-tbody');
    let customId = prompt("Enter new attribute name (e.g., Scandium, CaO):");
    if (!customId || customId.trim() === '') return;
    
    customId = customId.trim().replace(/[^a-zA-Z0-9_]/g, '');
    let options = `<option value="">-- Ignore / Not Available --</option>` + tempImportData.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    
    assayTbody.insertAdjacentHTML('beforeend', `
        <tr class="mapper-row bg-white transition-colors" data-sys="${customId}" data-mandatory="false">
            <td class="p-2 border-r border-slate-200 font-bold text-indigo-700">${customId} <span class="ml-1 text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Custom</span></td>
            <td class="p-2 border-r border-slate-200">
                <select class="mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold outline-none focus:border-teal-500 bg-white" onchange="window.updatePreview(this)">
                    ${options}
                </select>
            </td>
            <td class="p-2 font-mono text-slate-500 preview-cell">-</td>
        </tr>
    `);
};

window.validateMapping = function() {
    const rows = document.querySelectorAll('.mapper-row[data-mandatory="true"]');
    let isValid = true;
    rows.forEach(tr => {
        const sel = tr.querySelector('select');
        if (!sel.value) isValid = false;
    });

    const btn = document.getElementById('btn-execute-import');
    const status = document.getElementById('mapper-status-text');
    if (isValid) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "All mandatory parameters linked. Database ready to build.";
        status.className = "text-[11px] text-teal-600 font-black tracking-wide";
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        status.textContent = "Waiting for mandatory spatial parameters to be linked (*)";
        status.className = "text-[11px] text-rose-500 font-bold italic";
    }
};

window.executeDataImport = function() {
    showLoader("Building Database", "Restructuring and standardizing arrays...");
    document.getElementById('modal-column-mapper').classList.add('hidden');

    setTimeout(() => {
        const mapDictionary = {}; 
        const finalHeaders = [];
        
        document.querySelectorAll('.mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) {
                mapDictionary[sourceCol] = sysId;
                finalHeaders.push(sysId);
            }
        });

        const standardizedData = tempImportData.data.map((row, index) => {
            let newRow = { _id: index };
            for (const [srcKey, sysKey] of Object.entries(mapDictionary)) {
                let val = row[srcKey];
                newRow[sysKey] = (val !== undefined && val !== null) ? String(val).trim() : '';
            }
            return newRow;
        });

        // Set Global State dengan Header Standar Sistem
        state.headers = finalHeaders;
        state.rawData = standardizedData;
        state.editPage = 1;

        // Binding Core Columns yang dipastikan ada sesuai format baru
        state.coreCols.holeId = 'Hole_ID';
        state.coreCols.from = 'From';
        state.coreCols.to = 'To';
        
        state.detectedCoords.x = 'X';
        state.detectedCoords.y = 'Y';
        state.detectedCoords.z = 'Z';

        // Auto-bind opsional kolom agar 7_downhole.js & module lain dapat membaca
        state.coreCols.length = finalHeaders.includes('Length') ? 'Length' : null;
        state.coreCols.litho = finalHeaders.includes('Lithology') ? 'Lithology' : null;
        state.coreCols.wellsite = finalHeaders.includes('Wellsite') ? 'Wellsite' : null;
        state.coreCols.operator = finalHeaders.includes('Driller') ? 'Driller' : null;
        state.coreCols.drillSpace = finalHeaders.includes('Space') ? 'Space' : null;
        state.coreCols.method = finalHeaders.includes('Metode') ? 'Metode' : null;
        state.coreCols.rig = finalHeaders.includes('Rig') ? 'Rig' : null;
        state.coreCols.startDate = finalHeaders.includes('Start Drilling') ? 'Start Drilling' : null;
        state.coreCols.endDate = finalHeaders.includes('Finish Drilling') ? 'Finish Drilling' : null;
        state.coreCols.status = finalHeaders.includes('Status') ? 'Status' : null;

        // Setup QAQC Tracker
        const targetBlankNeg = ['From', 'To', 'Length', 'loss', 'swelling', 'recovery', 'Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
        const targetZero = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
        
        state.qaqcBlankCols = finalHeaders.filter(h => targetBlankNeg.includes(h));
        state.qaqcNegativeCols = finalHeaders.filter(h => targetBlankNeg.includes(h));
        state.qaqcZeroCols = finalHeaders.filter(h => targetZero.includes(h));

        state.exportCols = [...finalHeaders, 'Geo_Domain'];

        const uploadCount = document.getElementById('upload-count');
        if (uploadCount) uploadCount.textContent = standardizedData.length.toLocaleString();
        
        renderUploadSummary();
        unlockProjectMenus();

        if(typeof renderQAQCSettings === 'function') renderQAQCSettings(); 
        if(typeof runQAQC === 'function') runQAQC();
        if(typeof renderQAQC === 'function') renderQAQC();

        tempImportData = { headers: [], data: [] };

        hideLoader();
        showToast("Database Constructed Successfully!", "success");
    }, 800);
};

function renderUploadSummary() {
    try {
        const data = state.rawData, c_id = state.coreCols.holeId, c_to = state.coreCols.to, c_len = state.coreCols.length;
        if(!c_id || data.length === 0) return;
        
        const groupedMap = groupDataByHole(data, c_id);
        const elHoles = document.getElementById('profile-holes'); if(elHoles) elHoles.textContent = groupedMap.size.toLocaleString();
        
        let totalMeterage = 0, maxDepthGlobal = 0, minDepthGlobal = 9999;
        if (c_len) { totalMeterage = data.reduce((sum, row) => sum + (parseFloat(row[c_len]) || 0), 0); }
        
        groupedMap.forEach((holeData) => {
            const maxD = Math.max(...holeData.map(d => parseFloat(d[c_to]) || 0));
            const minD = Math.min(...holeData.map(d => parseFloat(d[state.coreCols.from]) || 0));
            if (maxD > maxDepthGlobal) maxDepthGlobal = maxD;
            if (minD < minDepthGlobal) minDepthGlobal = minD;
            if (!c_len) totalMeterage += maxD;
        });

        const elMeterage = document.getElementById('profile-meterage'); if(elMeterage) elMeterage.textContent = totalMeterage.toFixed(1);
        const elMaxDepth = document.getElementById('profile-max-depth'); if(elMaxDepth) elMaxDepth.textContent = maxDepthGlobal.toFixed(1) + ' m';
        const elAvgDepth = document.getElementById('profile-avg-depth'); if(elAvgDepth) elAvgDepth.textContent = (totalMeterage / groupedMap.size).toFixed(1) + ' m';

        // Set Database Cols String
        const detCols = document.getElementById('det-cols'); 
        if(detCols) {
            let cols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to].filter(Boolean).join(', ');
            detCols.textContent = cols || '-';
        }

        const getUnique = (col) => {
            if (!col) return '-';
            const vals = [...new Set(data.map(d => d[col]).filter(v => v && String(v).trim() !== ''))];
            return vals.length > 0 ? vals.slice(0, 4).join(', ') + (vals.length > 4 ? ', etc.' : '') : '-';
        };

        const opsWellsite = document.getElementById('ops-wellsite'); if(opsWellsite) opsWellsite.textContent = getUnique(state.coreCols.wellsite);
        const opsMethod = document.getElementById('ops-method'); if(opsMethod) opsMethod.textContent = getUnique(state.coreCols.method);

        let spaceMap = new Map();
        groupedMap.forEach((holeData) => {
            let sp = state.coreCols.drillSpace ? holeData[0][state.coreCols.drillSpace] : null;
            if (sp && String(sp).trim() !== '') {
                sp = String(sp).trim();
                spaceMap.set(sp, (spaceMap.get(sp) || 0) + 1);
            }
        });
        let spaceParts = [];
        spaceMap.forEach((count, sp) => spaceParts.push(`${sp} (${count})`));
        const opsSpace = document.getElementById('ops-space'); if(opsSpace) opsSpace.textContent = spaceParts.length > 0 ? spaceParts.join(', ') : '-';

        // Render Lithology Chart
        const lithoCard = document.getElementById('lithology-chart-container');
        if (lithoCard) renderLithologyChart(lithoCard);

        // --- Render Rig Operations Tracker (New Compact Design) ---
        let rigMap = new Map();
        groupedMap.forEach((holeData, holeId) => {
            let rig = state.coreCols.rig ? holeData[0][state.coreCols.rig] : 'Default Rig';
            if (!rig || String(rig).trim() === '') rig = 'Default Rig';
            let maxD = Math.max(...holeData.map(d => parseFloat(d[c_to]) || 0));
            let eDate = state.coreCols.endDate ? holeData[holeData.length-1][state.coreCols.endDate] : '-';

            if (!rigMap.has(rig)) rigMap.set(rig, { count: 0, meterage: 0, endDates: [] });
            let r = rigMap.get(rig);
            r.count += 1; 
            r.meterage += maxD;
            if (eDate && eDate !== '-') r.endDates.push(eDate);
        });

        const rigContainer = document.getElementById('rig-status-container');
        const rigTotalBadge = document.getElementById('rig-total-count');
        if (rigTotalBadge) rigTotalBadge.textContent = `${rigMap.size} Rigs`;

        if (rigContainer) {
            let rigHtml = '';
            if (rigMap.size === 0) rigHtml = `<div class="p-4 text-center text-slate-400 italic text-xs">Rig data not available</div>`;
            rigMap.forEach((r, rigName) => {
                let eDate = r.endDates.length > 0 ? r.endDates.sort().reverse()[0] : '-';
                // HTML Card Rig Mini
                rigHtml += `
                    <div class="border border-slate-200 rounded-lg p-3 flex flex-col gap-2 hover:border-teal-400 bg-white shadow-sm transition-colors">
                        <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
                            <h4 class="font-black text-[10px] text-slate-800 uppercase">${rigName}</h4>
                            <span class="bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm">${r.count} Holes</span>
                        </div>
                        <div class="flex justify-between text-[9px] mt-0.5">
                            <div class="flex flex-col">
                                <span class="text-slate-400 font-bold uppercase tracking-widest mb-0.5">Meterage</span>
                                <span class="font-black text-slate-700">${r.meterage.toFixed(1)} m</span>
                            </div>
                            <div class="flex flex-col text-right">
                                <span class="text-slate-400 font-bold uppercase tracking-widest mb-0.5">Last EOH</span>
                                <span class="font-bold text-slate-600">${eDate}</span>
                            </div>
                        </div>
                    </div>`;
            });
            rigContainer.innerHTML = rigHtml;
        }

        // --- Render Assay Table (New Tabular Design) ---
        const targetAssays = ['ni', 'fe', 'mgo', 'sio2', 'co', 'al2o3', 'mno', 'fe2o3', 'cr2o3'];
        const numericCols = targetAssays.map(ta => state.headers.find(h => h.toLowerCase().trim() === ta)).filter(Boolean);
        const tbodyAssay = document.getElementById('assay-table-body');
        
        if (tbodyAssay && numericCols.length > 0) {
            let assayHtml = '';
            numericCols.forEach(col => {
                const validData = data.map(d => parseFloat(d[col])).filter(v => !isNaN(v));
                if(validData.length === 0) return;
                validData.sort((a,b) => a-b);
                const sum = validData.reduce((a,b)=>a+b, 0), count = validData.length, mean = sum / count;
                const mid = Math.floor(count / 2), median = count % 2 !== 0 ? validData[mid] : (validData[mid-1] + validData[mid]) / 2;
                const variance = validData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count, stdDev = Math.sqrt(variance);
                const cv = mean > 0 ? (stdDev / mean) : 0, min = validData[0], max = validData[count-1];
                
                assayHtml += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-2 border-r border-slate-100 font-black text-slate-800">${col}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-medium text-slate-600 text-center">${count.toLocaleString()}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-black text-teal-600 text-right">${mean.toFixed(3)}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-medium text-slate-700 text-right">${median.toFixed(3)}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-medium text-slate-500 text-right">${min.toFixed(2)}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-medium text-slate-500 text-right">${max.toFixed(2)}</td>
                        <td class="px-4 py-2 border-r border-slate-100 font-medium text-slate-700 text-right">${stdDev.toFixed(3)}</td>
                        <td class="px-4 py-2 font-black text-right ${cv > 1.0 ? 'text-rose-600' : 'text-slate-800'}">${cv.toFixed(3)}</td>
                    </tr>`;
            });
            tbodyAssay.innerHTML = assayHtml;
        }
    } catch(err) { console.error("Error in renderUploadSummary:", err); }
}

function renderLithologyChart(container) {
    const litoCol = state.headers.find(h => { const lh = h.toLowerCase(); return lh.includes('lito') || lh.includes('litho') || lh.includes('rock') || lh.includes('domain'); });
    
    // PERBAIKAN: 
    // 1. Menambahkan border eksplisit yang rapi (border-slate-400).
    // 2. Menggunakan trik "absolute inset-0" pada canvas agar ukurannya patuh 100% 
    //    pada kontainer dan TIDAK melebar/overflow ke kanan.
    container.innerHTML = `
        <h3 class="text-[10px] font-black text-slate-700 mb-3 uppercase tracking-widest border-b border-slate-100 pb-2 shrink-0">Lithology Breakdown</h3>
        <div class="w-full flex-grow border border-slate-400 rounded-md p-2 flex flex-col relative" style="min-h: 260px; max-width: 100%;">
            <div class="relative w-full h-full flex-grow">
                ${litoCol ? '<canvas id="litho-donut-chart" class="absolute inset-0"></canvas>' : '<div class="absolute inset-0 flex items-center justify-center"><p class="text-[10px] text-slate-400 font-bold italic">Lithology column not found.</p></div>'}
            </div>
        </div>
    `;

    if (!litoCol) return;
    
    const counts = {}; let total = 0;
    state.rawData.forEach(row => {
        let val = row[litoCol];
        if (val) { val = val.trim().toUpperCase(); counts[val] = (counts[val] || 0) + 1; total++; }
    });
    const sortedLabels = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
    const sortedData = sortedLabels.map(l => counts[l]);
    const displayLabels = sortedLabels.map(l => `${l} (${((counts[l]/total)*100).toFixed(1)}%)`);
    
    if(!state.styleMeta) state.styleMeta = { domains: {}, elements: {} };
    if(!state.styleMeta.domains) state.styleMeta.domains = {};

    const bgColors = sortedLabels.map(dom => {
        if (state.styleMeta.domains[dom] && state.styleMeta.domains[dom].color && state.styleMeta.domains[dom].color !== '#cbd5e1') {
            return state.styleMeta.domains[dom].color;
        }
        const d = String(dom).toUpperCase();
        let autoColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        if (d.includes('LIM')) autoColor = '#b45309'; 
        else if (d.includes('SAP') && !d.includes('ROCK')) autoColor = '#10b981'; 
        else if (d.includes('ROCK')) autoColor = '#059669'; 
        else if (d.includes('BRK') || d.includes('BED')) autoColor = '#1e293b'; 
        else if (d.includes('SOIL') || d.includes('OB') || d.includes('OVER')) autoColor = '#78350f'; 
        
        state.styleMeta.domains[dom] = { color: autoColor, pattern: 'solid' };
        return autoColor;
    });

    const ctx = document.getElementById('litho-donut-chart');
    if(window.lithoChartInstance) window.lithoChartInstance.destroy();
    
    window.lithoChartInstance = new Chart(ctx, { 
        type: 'doughnut', 
        data: { 
            labels: displayLabels, 
            datasets: [{ 
                data: sortedData, 
                backgroundColor: bgColors, 
                borderWidth: 2, 
                borderColor: '#ffffff',
                hoverOffset: 4
            }] 
        }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '50%', // PERBAIKAN: Diperkecil jadi 50% agar donat lebih tebal/besar
            layout: {
                padding: { top: 10, bottom: 5, left: 10, right: 10 }
            },
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        usePointStyle: true, 
                        boxWidth: 8, 
                        font: { size: 10, family: 'sans-serif', weight: 'bold' }, 
                        padding: 15 // Jarak lega agar teks legenda menepi rapi ke bawah
                    } 
                }, 
                tooltip: { callbacks: { label: (item) => ` ${item.raw} interval` } } 
            } 
        } 
    });
}

// --- SAVE, LOAD & RE-HYDRATION (ROBUST) ---
window.saveWorkspace = function() {
    if (!state || !state.rawData || state.rawData.length === 0) {
        showToast("No data to save.", "warning"); return;
    }
    
    showToast("Packaging database and charts...", "info");
    
    try {
        // Salin densityState secara dangkal untuk dimodifikasi sebelum simpan
        let densityToSave = null;
        if (typeof densityState !== 'undefined') {
            // HAPUS referensi grafik sebelum disimpan agar tidak Circular Error
            densityToSave = { ...densityState };
            densityToSave.charts = { hist: null, box: null, scatter: null, depth: null, rel: null, control: null };
        }

        const workspaceData = {
            appSignature: "NiCore-HSN-Studio", 
            version: "3.0", 
            timestamp: new Date().toISOString(),
            coreState: state,
            densityState: densityToSave, // Gunakan versi yang sudah dibersihkan grafiknya
            labState: typeof labState !== 'undefined' ? labState : null
        };

        // Pembersihan labState (jika ada)
        if(workspaceData.labState) {
            if(workspaceData.labState.blank) workspaceData.labState.blank.chart = null;
            if(workspaceData.labState.dup && workspaceData.labState.dup.charts) {
                workspaceData.labState.dup.charts.rel = null; 
                workspaceData.labState.dup.charts.sct = null; 
                workspaceData.labState.dup.charts.cum = null;
            }
            if(workspaceData.labState.std) workspaceData.labState.std.chart = null;
        }

        // Proses unduh menggunakan Blob
        const blob = new Blob([JSON.stringify(workspaceData)], { type: "application/json" });
        const companyName = state.projectMeta && state.projectMeta.company ? state.projectMeta.company.replace(/\s+/g, '_') : "Project";
        const fileName = `NiCore_${companyName}.hsn`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Workspace saved successfully: ${fileName}`, "success");
    } catch (e) { 
        console.error("Save Error Detail:", e); 
        showToast("Failed to save .hsn file: Object reference conflict detected.", "error"); 
    }
}

window.loadWorkspace = function(event) {
    const file = event.target.files[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith('.hsn')) { showToast("File format must be .hsn", "error"); event.target.value = ''; return; }

    showLoader("Restoring Project", "Reading .hsn file and rebuilding database...");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.appSignature !== "NiCore-HSN-Studio") throw new Error("Invalid Signature");

            if (importedData.version === "3.0" && importedData.coreState) { state = importedData.coreState; } 
            else if (importedData.state) { state = importedData.state; } 
            else { throw new Error("State data not found"); }

            if (importedData.densityState && typeof densityState !== 'undefined') Object.assign(densityState, importedData.densityState);
            if (importedData.labState && typeof labState !== 'undefined') Object.assign(labState, importedData.labState);

            rebuildWorkspaceUI();
            hideLoader();
            showToast("Project loaded successfully! All tables and charts restored.", "success");
            event.target.value = '';
        } catch (err) {
            console.error("Critical Load Error:", err);
            hideLoader();
            showToast("Failed to load project: " + err.message, "error");
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function rebuildWorkspaceUI() {
    updateGeologistBadge();
    try { unlockProjectMenus(); } catch(e) { console.warn("Error unlocking menus:", e); }

    // --- 1. MEMULIHKAN PARAMETER DOMAINING (CUT-OFF) ---
    if (state.domainParams) {
        if(document.getElementById('param-fe-lim')) document.getElementById('param-fe-lim').value = state.domainParams.fe_lim_min;
        if(document.getElementById('param-mgo-sap')) document.getElementById('param-mgo-sap').value = state.domainParams.mgo_sap_min;
        if(document.getElementById('param-mgo-brk')) document.getElementById('param-mgo-brk').value = state.domainParams.mgo_brk_min;
    }

    // --- 2. MEMULIHKAN PARAMETER DENSITY (SG) ---
    if (state.sgParams) {
        ['lim', 'sap', 'brk'].forEach(dom => {
            const inputEl = document.getElementById(`sg-${dom}`);
            const val = state.sgParams[dom.toUpperCase()];
            if (inputEl && val) {
                inputEl.value = val;
                // Jika nilai SG bukan default (artinya dari lab), beri warna hijau tervalidasi
                if ((dom === 'lim' && val !== 1.4) || (dom === 'sap' && val !== 1.5) || (dom === 'brk' && val !== 2.2)) {
                    inputEl.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700');
                }
            }
        });
    }

    // --- 3. MEMULIHKAN PARAMETER COMPOSITING ---
    if (state.compParams) {
        if(document.getElementById('param-comp-len')) document.getElementById('param-comp-len').value = state.compParams.length;
        if(document.getElementById('param-comp-min')) document.getElementById('param-comp-min').value = state.compParams.minResidualPct;
        if(document.getElementById('param-comp-action')) document.getElementById('param-comp-action').value = state.compParams.action;
        if(document.getElementById('param-comp-mode')) document.getElementById('param-comp-mode').value = state.compParams.boundaryMode;
    }

    try {
        const uploadCount = document.getElementById('upload-count');
        if (uploadCount && state.rawData) uploadCount.textContent = state.rawData.length.toLocaleString();
        renderUploadSummary();
    } catch(e) { console.warn("Error rendering summary:", e); }

    try {
        if (typeof renderQAQCSettings === 'function') renderQAQCSettings();
        if (typeof runQAQC === 'function') runQAQC();
        if (typeof renderQAQC === 'function') renderQAQC();
    } catch(e) { console.warn("Error QAQC:", e); }

    try {
        if (state.isTopoValidated && typeof renderTopoUI === 'function') renderTopoUI();
    } catch(e) { console.warn("Error Topo:", e); }

    try {
        if (typeof densityState !== 'undefined' && densityState.processedData && densityState.processedData.length > 0) {
            if(typeof renderDensityDashboard === 'function') renderDensityDashboard();
            const btnDensity = document.getElementById('btn-density');
            if(btnDensity) { btnDensity.classList.remove('hidden'); btnDensity.disabled = false; }
        }
    } catch(e) { console.warn("Error Density:", e); }

    try {
        if (typeof labState !== 'undefined') {
            if (labState.blank && labState.blank.data && labState.blank.data.length > 0 && typeof runBlankAnalysis === 'function') {
                const eSel = document.getElementById('blankChartElement');
                const pdfBlankEl = document.getElementById('blankPdfElements');
                if (labState.blank.cols && labState.blank.cols.length > 0) {
                    if(eSel) eSel.innerHTML = labState.blank.cols.map(c => `<option value="${c}">${c}</option>`).join('');
                    if(pdfBlankEl) pdfBlankEl.innerHTML = labState.blank.cols.map(c => `<label class="flex items-center"><input type="checkbox" class="blank-pdf-el-cb w-3 h-3 text-blue-600" value="${c}" checked><span class="ml-1">${c}</span></label>`).join('');
                }
                const bSel = document.getElementById('blankChartBatuan');
                const pdfBlankBat = document.getElementById('blankPdfBatuan');
                if (labState.blank.batuanCol) {
                    let setB = new Set(labState.blank.data.map(r => r[labState.blank.batuanCol]).filter(v => v && String(v).trim() !== ''));
                    if(bSel) {
                        bSel.innerHTML = '<option value="Semua">Semua Batuan</option>';
                        setB.forEach(b => bSel.innerHTML += `<option value="${b}">${b}</option>`);
                    }
                    if(pdfBlankBat) {
                        let batHTML = `<label class="flex items-center"><input type="checkbox" class="blank-pdf-batuan-cb w-3 h-3 text-blue-600" value="Semua" checked><span class="ml-1">Semua</span></label>`;
                        setB.forEach(b => batHTML += `<label class="flex items-center"><input type="checkbox" class="blank-pdf-batuan-cb w-3 h-3 text-blue-600" value="${b}"><span class="ml-1">${b}</span></label>`);
                        pdfBlankBat.innerHTML = batHTML;
                    }
                    document.getElementById('blankBatuanContainer')?.classList.remove('hidden');
                }
                document.getElementById('blankParamsBox')?.classList.remove('hidden');
                document.getElementById('blankDashboard')?.classList.remove('hidden');
                document.getElementById('blankDashboard')?.classList.add('flex');
                document.getElementById('blankOpenPdfBtn')?.classList.remove('hidden');
                runBlankAnalysis(true);
            }
            if (labState.dup && labState.dup.pairs && labState.dup.pairs.length > 0 && typeof runDupAnalysis === 'function') {
                const eSel = document.getElementById('dupElementSelect');
                const pdfDupEl = document.getElementById('dupPdfElements');
                if(labState.dup.numCols && labState.dup.numCols.length > 0) {
                    if(eSel) eSel.innerHTML = labState.dup.numCols.map(c => `<option value="${c}">${c}</option>`).join('');
                    if(pdfDupEl) pdfDupEl.innerHTML = labState.dup.numCols.map(c => `<label class="flex items-center"><input type="checkbox" class="dup-pdf-el-cb w-3 h-3 text-rose-600" value="${c}" checked><span class="ml-1">${c}</span></label>`).join('');
                }
                document.getElementById('dupParamsBox')?.classList.remove('hidden');
                document.getElementById('dupDashboard')?.classList.remove('hidden');
                document.getElementById('dupDashboard')?.classList.add('flex');
                document.getElementById('dupOpenPdfBtn')?.classList.remove('hidden');
                runDupAnalysis(true);
            }
            if (labState.std && labState.std.raw && labState.std.raw.length > 0 && typeof runStdAnalysis === 'function') {
                const eSel = document.getElementById('stdElementSelect'); 
                const crmSel = document.getElementById('stdCrmSelect');
                const pdfStdEl = document.getElementById('stdPdfElements');
                const pdfStdCrm = document.getElementById('stdPdfCrms');
                if(labState.std.numCols && labState.std.numCols.length > 0) {
                    if(eSel) eSel.innerHTML = labState.std.numCols.map(c => `<option value="${c}">${c}</option>`).join('');
                    if(pdfStdEl) pdfStdEl.innerHTML = labState.std.numCols.map(c => `<label class="flex items-center"><input type="checkbox" class="std-pdf-el-cb w-3 h-3 text-emerald-600" value="${c}" checked><span class="ml-1">${c}</span></label>`).join('');
                }
                if(labState.std.crmNames && labState.std.crmNames.length > 0) {
                    if(crmSel) crmSel.innerHTML = labState.std.crmNames.map(c => `<option value="${c}">${c}</option>`).join('');
                    if(pdfStdCrm) pdfStdCrm.innerHTML = labState.std.crmNames.map(c => `<label class="flex items-center"><input type="checkbox" class="std-pdf-crm-cb w-3 h-3 text-emerald-600" value="${c}" checked><span class="ml-1">${c}</span></label>`).join('');
                }
                document.getElementById('stdParamsBox')?.classList.remove('hidden');
                document.getElementById('stdDashboard')?.classList.remove('hidden');
                document.getElementById('stdDashboard')?.classList.add('flex');
                document.getElementById('stdOpenPdfBtn')?.classList.remove('hidden');
                runStdAnalysis(true);
            }
        }
    } catch(e) { console.warn("Error Lab Rehydration:", e); }

    try {
        if(typeof renderAll === 'function') renderAll();
        if(!document.getElementById('tab-downhole')?.classList.contains('hidden') && typeof initDownholeLog === 'function') initDownholeLog(); 
        if(!document.getElementById('tab-map2d')?.classList.contains('hidden') && typeof initMap2D === 'function') initMap2D();
        if (typeof initPreDomainingEDA === 'function') {
            initPreDomainingEDA();
        }    
    } catch(e) { console.warn("Error rendering sub-modules:", e); }
}

// --- UTILITIES ---
window.resetData = function() {
    // 1. Peringatan konfirmasi agar user tidak tidak sengaja menghapus progres
    if (state.rawData && state.rawData.length > 0) {
        if (!confirm("Are you sure you want to close the project? All unsaved progress will be permanently lost!")) {
            return;
        }
    }
    
    // 2. Tampilkan loader agar transisi penutupan terasa mulus secara UI/UX
    if (typeof showLoader === 'function') {
        showLoader("Closing Project", "Purging Memory & Resetting Workspace...");
    }

    // 3. Eksekusi Hard Refresh (F5)
    setTimeout(() => {
        // Ini akan mereset total seluruh state, GPU memory (WebGL), dan RAM browser
        window.location.reload(); 
    }, 800);
};

function runPipeline() {
    if(typeof runQAQC === 'function') runQAQC();
    if(typeof runDomaining === 'function') state.domainedData = runDomaining(state.rawData);
    if(typeof runCompositing === 'function') state.compositedData = runCompositing(state.domainedData);
    if(typeof calculateEDA === 'function') calculateEDA();
    if(typeof renderAll === 'function') renderAll();
    if(!document.getElementById('tab-downhole')?.classList.contains('hidden') && typeof initDownholeLog === 'function') initDownholeLog();
    if(!document.getElementById('tab-map2d')?.classList.contains('hidden') && typeof initMap2D === 'function') initMap2D();
}

function renderAll() { 
    if(typeof renderQAQC === 'function') renderQAQC(); 
    if(typeof renderDomain === 'function') renderDomain(); 
    if(typeof renderComposite === 'function') renderComposite(); 
    if(typeof renderEDA === 'function') renderEDA(); 
    if(typeof lucide !== 'undefined') lucide.createIcons(); 
}

function parseCSV(csvText) {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, '') });
    const headers = parsed.meta.fields;
    const data = parsed.data.map((row, index) => {
        let cleanRow = { _id: index };
        headers.forEach(h => { cleanRow[h] = row[h] !== undefined && row[h] !== null ? String(row[h]).trim() : ''; });
        return cleanRow;
    });
    return { headers, data };
}

function groupDataByHole(dataArray, holeCol, sortCol) {
    const map = new Map();
    dataArray.forEach(d => {
        const h = d[holeCol];
        if (h !== undefined && h !== null && h !== '') {
            if (!map.has(h)) map.set(h, []);
            map.get(h).push(d);
        }
    });
    if (sortCol) map.forEach(arr => arr.sort((a, b) => parseFloat(a[sortCol]) - parseFloat(b[sortCol])));
    return map;
}

function calculatePercentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos); const rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function flagErrorCell(rowId, col) {
    if (!state.errorMap[rowId]) state.errorMap[rowId] = {};
    state.errorMap[rowId][col] = true;
}

function getSummaryStatistics(data) {
    if (!data || data.length === 0) return { count: 0, mean: 0, median: 0, std: 0 };
    const count = data.length; if (count === 0) return { count: 0, mean: 0, median: 0, std: 0 };
    const sum = data.reduce((a, b) => a + b, 0), mean = sum / count;
    data.sort((a, b) => a - b);
    const mid = Math.floor(count / 2), median = (count % 2 !== 0) ? data[mid] : (data[mid - 1] + data[mid]) / 2;
    const std = Math.sqrt(data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / count);
    return { count, mean: mean.toFixed(3), median: median.toFixed(3), std: std.toFixed(3) };
}

function getDeclusteringWeights(dataArray, xCol, yCol, cellSize = 25) {
    const cellCounts = {}; const cellAssigned = [];
    dataArray.forEach(d => {
        const x = parseFloat(d[xCol]), y = parseFloat(d[yCol]);
        if (isNaN(x) || isNaN(y)) { cellAssigned.push(null); return; }
        const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cellKey = `${cx}_${cy}`;
        if (!cellCounts[cellKey]) cellCounts[cellKey] = 0;
        cellCounts[cellKey]++; cellAssigned.push(cellKey);
    });
    let totalWeight = 0;
    const weights = cellAssigned.map(key => { if (!key) return 0; const w = 1 / cellCounts[key]; totalWeight += w; return w; });
    const n = weights.filter(w => w > 0).length;
    return weights.map(w => w > 0 ? (w * n) / totalWeight : 0);
}

function calculateDesurvey(collarX, collarY, collarZ, depth, dip, azimuth) {
    const radDip = dip * (Math.PI / 180), radAzi = azimuth * (Math.PI / 180);
    return { x: collarX + (depth * Math.cos(radDip) * Math.sin(radAzi)), y: collarY + (depth * Math.cos(radDip) * Math.cos(radAzi)), z: collarZ + (depth * Math.sin(radDip)) };
}

function getDomainColor(domain) {
    const d = String(domain).toUpperCase();
    if (d.includes('LIM')) return '#b45309'; 
    if (d.includes('SAP') && !d.includes('ROCK')) return '#10b981'; 
    if (d.includes('ROCK')) return '#059669'; 
    if (d.includes('BRK') || d.includes('BED')) return '#1e293b'; 
    return '#' + Math.floor(Math.random()*16777215).toString(16);
}

function getDomainBadgeClass(domain) {
    if (domain === 'LIM') return 'bg-amber-700 text-white'; 
    if (domain === 'SAP') return 'bg-emerald-500 text-white'; 
    if (domain === 'BRK') return 'bg-[#1e293b] text-white'; 
    return 'bg-slate-400 text-white'; 
}

function renderDynamicTable(tableId, dataArray, maxRows = 150) {
    const thead = document.getElementById(`${tableId}-thead`); const tbody = document.getElementById(`${tableId}-tbody`);
    if(dataArray.length === 0 || !thead || !tbody) return;
    let displayCols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to, 'Length'];
    const potentialLito = state.headers.find(h => h.toLowerCase().includes('lito') || h.toLowerCase().includes('rock'));
    if(tableId === 'domain' && potentialLito) displayCols.push(potentialLito);
    displayCols.push('Geo_Domain');
    const excludeCols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to, 'Length', 'Geo_Domain', '_id', '_comp_id', 'SG', 'Ore_Class', 'Z', 'X', 'Y', 'Easting', 'Northing', 'Elevation', potentialLito];
    const assayCols = state.headers.filter(h => !excludeCols.includes(h) && h !== undefined);
    assayCols.slice(0, 5).forEach(c => displayCols.push(c));
    if(state.headers.includes('SG')) displayCols.push('SG');

    thead.innerHTML = `<tr>${displayCols.map(c => `<th class="p-3 font-bold ${c === 'Geo_Domain' ? 'text-teal-400' : ''}">${c}</th>`).join('')}</tr>`;
    tbody.innerHTML = dataArray.slice(0, maxRows).map(row => {
        return `<tr class="hover:bg-slate-50 transition-colors">
            ${displayCols.map(c => {
                if (c === 'Geo_Domain') return `<td class="p-3"><span class="px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest shadow-sm ${getDomainBadgeClass(row[c])}">${row[c]}</span></td>`;
                if (c === potentialLito && tableId === 'domain') return `<td class="p-3 text-slate-400 line-through text-xs">${row[c] || ''}</td>`;
                if (['Ni', 'Fe', 'MgO'].includes(c)) return `<td class="p-3 font-mono font-medium text-slate-700">${row[c] || ''}</td>`;
                if (['SG', 'Z'].includes(c)) return `<td class="p-3 font-mono font-medium text-teal-600">${row[c] || ''}</td>`;
                return `<td class="p-3 font-semibold text-slate-800">${row[c] || ''}</td>`;
            }).join('')}
        </tr>`;
    }).join('');
}

window.addEventListener('beforeunload', function (e) {
    if (state.rawData && state.rawData.length > 0) { e.preventDefault(); e.returnValue = ''; }
});