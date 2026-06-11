/**
 * File: js/7_downhole.js
 * Description: Downhole Log Rendering Engine (Pure HTML Grid, Smart Auto-Scale, Excel-like Data Management)
 */

// ==========================================
// 1. DATA SOURCE SWITCHER
// ==========================================
window.changeDownholeSource = function() {
    const source = document.getElementById('dh-data-source').value;
    
    if (source === 'domained' && (!state.domainedData || state.domainedData.length === 0)) {
        if(typeof showToast === 'function') showToast("Domained data is empty. Please run Domaining first.", "warning");
        document.getElementById('dh-data-source').value = state.dhMode || 'raw';
        return;
    }
    if (source === 'composited' && (!state.compositedData || state.compositedData.length === 0)) {
        if(typeof showToast === 'function') showToast("Composited data is empty. Please run Compositing first.", "warning");
        document.getElementById('dh-data-source').value = state.dhMode || 'raw';
        return;
    }

    state.dhMode = source;
    initDownholeLog(); 
    if(typeof showToast === 'function') showToast(`Viewing ${source.toUpperCase()} data.`, "success");
};

function getActiveDownholeData() {
    if (!state.dhMode) state.dhMode = 'raw';
    if (state.dhMode === 'composited' && state.compositedData && state.compositedData.length > 0) return state.compositedData;
    if (state.dhMode === 'domained' && state.domainedData && state.domainedData.length > 0) return state.domainedData;
    return state.rawData || [];
}

// ==========================================
// 2. INIT HOLE ID & DROPDOWN
// ==========================================
function initDownholeLog() {
    const selector = document.getElementById('hole-selector');
    const sourceSelector = document.getElementById('dh-data-source');
    if (!selector) return;

    if (sourceSelector && state.dhMode) {
        sourceSelector.value = state.dhMode;
    }
    
    const dataToUse = getActiveDownholeData();
    if (!dataToUse || dataToUse.length === 0) {
        selector.innerHTML = '<option value="">No Data</option>';
        return;
    }

    const idKey = (state.coreCols && state.coreCols.holeId) ? state.coreCols.holeId : (state.coreCols && state.coreCols.id ? state.coreCols.id : 'Hole_ID');
    const uniqueHoles = [...new Set(dataToUse.map(d => d[idKey]))];
    const validHoles = uniqueHoles.filter(h => h !== undefined && h !== null && h.toString().trim() !== '');

    if (validHoles.length > 0) {
        const currentVal = selector.value;
        selector.innerHTML = validHoles.map(h => `<option value="${h}">${h}</option>`).join('');
        if (currentVal && validHoles.includes(currentVal)) selector.value = currentVal;
        else selector.value = validHoles[0];
        
        if (state.config) state.config.hasManuallySetScale = false; 
        renderLog();
    } else {
        selector.innerHTML = '<option value="">Invalid Data</option>';
    }
}

// ==========================================
// 3. PATTERN GENERATOR SVG
// ==========================================
function getPatternCSSString(pattern, color) {
    if (!pattern || pattern === 'solid') return `background-color: ${color};`;
    
    let svg = '';
    const stroke = "rgba(0,0,0,0.5)"; 
    const fill = "rgba(0,0,0,0.5)";

    switch(pattern) {
        case 'dots': 
            svg = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="1.5" fill="${fill}"/><circle cx="12" cy="12" r="1" fill="${fill}"/><circle cx="8" cy="14" r="1.5" fill="${fill}"/><circle cx="14" cy="4" r="1" fill="${fill}"/></svg>`; break;
        case 'conglomerate': 
            svg = `<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg"><ellipse cx="8" cy="8" rx="4" ry="3" fill="none" stroke="${stroke}" stroke-width="1.5"/><ellipse cx="22" cy="10" rx="3" ry="4" fill="none" stroke="${stroke}" stroke-width="1.5"/><ellipse cx="15" cy="22" rx="5" ry="3" fill="none" stroke="${stroke}" stroke-width="1.5"/><circle cx="5" cy="25" r="1" fill="${fill}"/><circle cx="26" cy="22" r="1" fill="${fill}"/></svg>`; break;
        case 'breccia': 
            svg = `<svg width="30" height="30" xmlns="http://www.w3.org/2000/svg"><polygon points="5,5 10,2 15,8 8,12" fill="none" stroke="${stroke}" stroke-width="1.5"/><polygon points="20,15 28,12 25,22 18,20" fill="none" stroke="${stroke}" stroke-width="1.5"/><polygon points="8,20 15,18 12,28 4,25" fill="none" stroke="${stroke}" stroke-width="1.5"/></svg>`; break;
        case 'lines-h': 
            svg = `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="5" x2="10" y2="5" stroke="${stroke}" stroke-width="1"/></svg>`; break;
        case 'dashed-h': 
            svg = `<svg width="20" height="10" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="5" x2="20" y2="5" stroke="${stroke}" stroke-width="1" stroke-dasharray="4,4"/></svg>`; break;
        case 'bricks': 
            svg = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="20" height="20" fill="none"/><path d="M0,10 L20,10 M10,0 L10,10 M0,10 L0,20 M20,10 L20,20" stroke="${stroke}" stroke-width="1"/></svg>`; break;
        case 'crosshatch': 
            svg = `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L20,20 M20,0 L0,20" stroke="${stroke}" stroke-width="1"/></svg>`; break;
        case 'coal': 
            return `background-color: #1e293b;`;
        default:
            return `background-color: ${color};`;
    }

    const encodedSVG = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
    return `background-color: ${color}; background-image: url('data:image/svg+xml;charset=utf-8,${encodedSVG}'); background-repeat: repeat;`;
}

// ==========================================
// 4. RENDER LOG MAIN PIPELINE
// ==========================================
function renderLog() {
    if (!state.styleMeta) state.styleMeta = { domains: {}, elements: {} };
    if (!state.styleMeta.domains) state.styleMeta.domains = {};
    if (!state.styleMeta.elements) state.styleMeta.elements = {};
    if (!state.detectedCoords) state.detectedCoords = {};
    if (!state.projectMeta) state.projectMeta = {};
    if (!state.config) state.config = {};
    if (!state.headers) state.headers = [];
    if (!state.coreCols) state.coreCols = { holeId: 'Hole_ID', from: 'From', to: 'To' };

    const activeHole = document.getElementById('hole-selector')?.value;
    const headerContainer = document.getElementById('report-header');
    const thead = document.getElementById('log-thead');
    const tbody = document.getElementById('tableBody');
    if (!activeHole || !thead || !tbody || !headerContainer) return;

    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.padding = '32px'; 

    const tabContent = document.getElementById('tab-downhole');
    if (tabContent) tabContent.className = "tab-content flex-col animate-fade-in flex h-full bg-transparent";
    
    const reportContainer = document.getElementById('report-container');
    if (reportContainer) reportContainer.className = "bg-white flex-grow flex flex-col relative w-full h-full overflow-hidden shadow-lg border border-slate-300 rounded-sm";
    
    if (!document.getElementById('anti-bleed-css')) {
        const style = document.createElement('style');
        style.id = 'anti-bleed-css';
        style.innerHTML = `.anti-bleed-table { border-collapse: separate !important; border-spacing: 0 !important; }`;
        document.head.appendChild(style);
    }
    
    const tableEl = tbody.closest('table');
    if (tableEl) {
        tableEl.className = "w-full table-fixed anti-bleed-table border-2 border-black bg-white"; 
    }

    const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
    const fromKey = state.coreCols.from || 'From';
    const toKey = state.coreCols.to || 'To';

    const dataToUse = getActiveDownholeData();
    const holeData = dataToUse
        .filter(d => d[holeIdKey] === activeHole)
        .sort((a,b) => parseFloat(a[fromKey]) - parseFloat(b[fromKey]));

    if (holeData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="p-10 text-center text-slate-500 font-bold">No data available for this Hole ID.</td></tr>';
        return;
    }

    let lithoCol = null;
    if (state.dhMode === 'domained') {
        lithoCol = 'Geo_Domain';
    } else if (state.dhMode === 'composited') {
        lithoCol = 'Domain';
        if (dataToUse.length > 0 && !dataToUse[0].hasOwnProperty('Domain') && dataToUse[0].hasOwnProperty('Geo_Domain')) {
            lithoCol = 'Geo_Domain';
        }
    } else {
        lithoCol = state.coreCols.litho;
        if (!lithoCol && dataToUse.length > 0) {
            lithoCol = Object.keys(dataToUse[0]).find(k => {
                let kw = k.toLowerCase();
                return kw.includes('litho') || kw.includes('lito') || kw.includes('rock') || kw === 'domain';
            });
        }
    }

    const rawHoleData = (state.rawData || []).filter(d => d[holeIdKey] === activeHole).sort((a,b) => parseFloat(a[fromKey]) - parseFloat(b[fromKey]));
    const firstRaw = rawHoleData.length > 0 ? rawHoleData[0] : holeData[0];

    let maxDepth = 0;
    rawHoleData.forEach(d => {
        let to = parseFloat(d[toKey]);
        if(isNaN(to)) to = (parseFloat(d[fromKey]) || 0) + (parseFloat(d['Length'] || d['length']) || 1);
        if(to > maxDepth) maxDepth = to;
    });

    // ====================================================================
    // RESPONSIVE SMART AUTO-SCALE COMPUTATION
    // Adjusts optimal scale based on Paper Orientation (Portrait vs Landscape)
    // ====================================================================
    if (!state.config.hasManuallySetScale && maxDepth > 0) {
        let orientation = state.config.paperOrientation || 'portrait';
        // Base usable height per page: Portrait ~ 26cm, Landscape ~ 17cm
        let basePrintHeightCm = orientation === 'landscape' ? 17 : 26;
        let targetTotalHeightCm = basePrintHeightCm * 2.5; // span across ~2.5 pages
        
        let optimalScale = targetTotalHeightCm / maxDepth; 
        optimalScale = Math.min(5.0, Math.max(0.5, optimalScale)); 
        
        state.config.cmPerMeter = parseFloat(optimalScale.toFixed(1));
        
        const scaleSlider = document.getElementById('inp-setting-scale');
        const scaleDisplay = document.getElementById('scale-val-display');
        if (scaleSlider) scaleSlider.value = state.config.cmPerMeter;
        if (scaleDisplay) scaleDisplay.textContent = state.config.cmPerMeter + ' CM/M';
    }

    const scaleCm = state.config.cmPerMeter ? state.config.cmPerMeter : 1.2;
    // ====================================================================

    const formatCoord = (val) => val && !isNaN(val) ? parseFloat(val).toFixed(2) : "-";

    const compName = state.projectMeta.company || 'PT ANN';
    const clientName = state.projectMeta.client || 'PT TBS';
    const geoName = state.projectMeta.geologist || '-';
    const locName = state.projectMeta.location || '-';
    const prospectName = state.projectMeta.block || '-';

    const xVal = formatCoord(state.detectedCoords.x && firstRaw[state.detectedCoords.x] ? firstRaw[state.detectedCoords.x] : "-");
    const yVal = formatCoord(state.detectedCoords.y && firstRaw[state.detectedCoords.y] ? firstRaw[state.detectedCoords.y] : "-");
    const zVal = formatCoord(state.detectedCoords.z && firstRaw[state.detectedCoords.z] ? firstRaw[state.detectedCoords.z] : "-") + " m";

    const getVal = (keywords) => { let key = Object.keys(firstRaw).find(k => keywords.some(kw => k.toLowerCase().includes(kw))); return key && firstRaw[key] ? firstRaw[key] : '-'; };
    const rigId = getVal(['rig']);
    const wellsite = getVal(['wellsite']);
    const driller = getVal(['drill master', 'driller', 'master']);
    const drillSpace = getVal(['space', 'spasi']);
    const drillMethod = getVal(['method', 'metode']) !== '-' ? getVal(['method', 'metode']) : 'Coring';
    const startDate = getVal(['start', 'mulai']);
    const finishDate = getVal(['finish', 'end', 'selesai']);

    let totalLen = 0, totalRec = 0; let isCOH = false;
    rawHoleData.forEach(r => { 
        let from = parseFloat(r[fromKey]) || 0;
        let to = parseFloat(r[toKey]);
        if(isNaN(to)) to = from + (parseFloat(r['Length'] || r['length']) || 1);
        let l = to - from;
        
        let recKey = Object.keys(r).find(k => k.toLowerCase().includes('recovery'));
        let rec = recKey ? parseFloat(r[recKey]) : NaN;
        if(l>0 && !isNaN(rec)) { totalLen += l; totalRec += (rec*l); }
        let statKey = Object.keys(r).find(k => ['status','remarks','ket','eoh','coh'].some(kw => k.toLowerCase().includes(kw)));
        if (statKey && typeof r[statKey] === 'string' && r[statKey].toUpperCase().includes('COH')) isCOH = true;
    });

    const recVal = totalLen > 0 ? (totalRec/totalLen).toFixed(2) + " %" : "-";
    const depthVal = isCOH ? "-" : maxDepth.toFixed(2) + " m";
    const cohVal = isCOH ? maxDepth.toFixed(2) + " m" : "-";

    headerContainer.className = "w-full bg-white relative shrink-0 pt-8 pb-6 font-sans border-0";
    const dynamicTitle = state.projectMeta.reportTitle || 'DRILLING EXPLORATION';

    headerContainer.innerHTML = `
        <div class="relative w-fit mx-auto mb-6 group flex items-center justify-center">
            <h2 class="text-lg font-black text-center uppercase tracking-[0.2em] text-black underline decoration-[2px] underline-offset-[6px] m-0 cursor-pointer hover:text-teal-700 transition-colors" onclick="window.promptChangeTitle()" title="Click to edit title">${dynamicTitle}</h2>
            <button onclick="window.promptChangeTitle()" class="absolute -right-10 opacity-0 group-hover:opacity-100 p-1.5 bg-slate-100 hover:bg-teal-500 hover:text-white text-slate-500 rounded shadow-sm border border-slate-200 hover:border-teal-500 transition-all" title="Edit Title">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
        </div>
        
        <div class="absolute left-8 top-12 bottom-6 flex flex-col justify-between items-center w-36">
            <div id="log-logo-left-container" class="flex-grow w-full flex items-center justify-center"></div>
            <div class="font-bold text-[11px] text-black text-center uppercase tracking-wide w-full truncate h-4" id="h-company">${compName}</div>
        </div>

        <div class="absolute right-8 top-12 bottom-6 flex flex-col justify-between items-center w-36">
            <div id="log-logo-right-container" class="flex-grow w-full flex items-center justify-center"></div>
            <div class="font-bold text-[11px] text-black text-center uppercase tracking-wide w-full truncate h-4" id="h-client-right">${clientName}</div>
        </div>

        <div class="flex justify-center w-full px-4 mt-2">
            <div class="grid grid-cols-4 gap-x-8 gap-y-2 text-[10px] text-black tracking-tight w-full max-w-[850px]">
                <div class="flex"><span class="w-24 shrink-0 font-bold">Client</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${clientName}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Start Drilling</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${startDate}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Easting</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${xVal}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Geologist</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${geoName}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Hole ID</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${activeHole}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Finish Drilling</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${finishDate}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Northing</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${yVal}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Wellsite</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${wellsite}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Location</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${locName}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">End Of Hole</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${depthVal}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Elevation</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${zVal}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Drill Master</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${driller}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Prospect</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${prospectName}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Cont. Of Hole</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${cohVal}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Drill Space</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${drillSpace}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Scale</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">1 m = ${scaleCm} cm</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Rig ID</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${rigId}</span></div>
                <div class="flex"><span class="w-24 shrink-0 font-bold">Hole Recovery</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${recVal}</span></div>
                <div class="flex col-span-2"><span class="w-24 shrink-0 font-bold">Drilling Method</span><span class="mr-2 font-bold">:</span> <span class="font-semibold">${drillMethod}</span></div>
            </div>
        </div>
    `;

    const logLogoLeft = document.getElementById('log-logo-left-container');
    if (logLogoLeft) {
        if (state.config && state.config.logoUrl) { logLogoLeft.innerHTML = `<img src="${state.config.logoUrl}" alt="Logo" class="max-w-[130px] max-h-[75px] object-contain">`; } 
        else { logLogoLeft.innerHTML = ``; }
    }
    const logLogoRight = document.getElementById('log-logo-right-container');
    if (logLogoRight) {
        if (state.config && state.config.clientLogoUrl) { logLogoRight.innerHTML = `<img src="${state.config.clientLogoUrl}" alt="Client Logo" class="max-w-[130px] max-h-[75px] object-contain">`; } 
        else { logLogoRight.innerHTML = ``; }
    }

    const targetAssays = ['ni', 'fe', 'mgo', 'sio2', 'co', 'al2o3', 'mno', 'cr2o3', 'fe2o3'];
    const amiraColors = { 'ni':'#0d9488', 'fe':'#dc2626', 'mgo':'#eab308', 'sio2':'#94a3b8', 'co':'#84cc16', 'al2o3':'#a855f7', 'mno':'#059669', 'cr2o3':'#2563eb', 'fe2o3':'#be123c' };
    
    let activeAssays = [];
    targetAssays.forEach(target => {
        let found = state.headers.find(h => h && h.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
        if(found && dataToUse.length > 0 && dataToUse[0].hasOwnProperty(found)) { 
            activeAssays.push(found); 
            if (!state.styleMeta.elements[found]) state.styleMeta.elements[found] = amiraColors[target]; 
        }
    });
    if (activeAssays.length === 0) {
        let allKeys = dataToUse.length > 0 ? Object.keys(dataToUse[0]) : state.headers;
        activeAssays = allKeys.filter(k => !isNaN(parseFloat(dataToUse[0][k])) && !['from','to','length','_id'].includes(k.toLowerCase())).slice(0, 9);
    }

    const chartAssays = activeAssays.filter(col => !col.toLowerCase().includes('al2o3')).slice(0, 5);

    // --- HELPER SENSOR TOP-CUT ---
    const applyTopCut = (val, elName, domainName) => {
        if (isNaN(val)) return val;
        const statObj = state.edaStats ? state.edaStats.find(s => s.Domain === domainName) : null;
        if (statObj) {
            const cutKey = Object.keys(statObj).find(key => key.toLowerCase() === `${elName.toLowerCase()}_topcut98`);
            if (cutKey && statObj[cutKey]) {
                const limit = parseFloat(statObj[cutKey]);
                if (val > limit) return limit;
            }
        }
        return val;
    };

    let assayMax = {};
    activeAssays.forEach(col => {
        let max = Math.max(...holeData.map(d => {
            let val = parseFloat(d[col]) || 0;
            let domName = lithoCol && d[lithoCol] ? String(d[lithoCol]).trim().toUpperCase() : 'UNKNOWN';
            return applyTopCut(val, col, domName); // Skala maks dihitung dari nilai ter-topcut
        }));
        assayMax[col] = max > 0 ? max : 100;
    });

    const thClass = "border-b border-r border-[#9ca3af] bg-[#9ca3af] relative z-10 align-middle text-black p-0";
    const thClassPad = "border-b border-r border-[#9ca3af] bg-[#9ca3af] relative z-10 align-middle text-black p-1 text-center";

    let chartHeader = '';
    if (chartAssays.length > 0) {
        let chartLegends = chartAssays.map(col => {
            let color = state.styleMeta.elements[col] || '#0d9488';
            return `
                <div class="flex justify-between items-center text-[8px] px-2 py-0.5 border-b border-white/5 last:border-0" style="color:${color};">
                    <span class="w-6 text-left font-bold">0.00</span>
                    <span class="font-black flex items-center gap-1.5 justify-center flex-grow">
                        <span class="flex items-center justify-center"><span class="w-3 h-[2px]" style="background-color:${color};"></span><span class="absolute w-1.5 h-1.5 rounded-full" style="background-color:${color};"></span></span> 
                        ${col.replace(' (%)', '')}%
                    </span>
                    <span class="w-6 text-right font-bold">${assayMax[col].toFixed(1)}</span>
                </div>`;
        }).join('');
        
        chartHeader = `
            <th rowspan="2" class="${thClassPad} w-[15%] min-w-[180px] align-top">
                <div class="mb-2 mt-1 text-[11px]">Assay Line Chart</div>
                <div class="w-full bg-[#0B1A33] rounded shadow-inner flex flex-col border border-black overflow-hidden py-1">${chartLegends}</div>
            </th>
        `;
    }

    let assayHeaders = activeAssays.map((col) => {
        return `
            <th class="${thClassPad} font-black text-[10px]" style="width: 3.2%; min-width: 45px;">
                ${col} (%)<br><span class="font-bold text-[8px] text-slate-700 leading-none block mt-1">0 - ${assayMax[col].toFixed(1)}</span>
            </th>`;
    }).join('');

    const verticalStyle = "writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; height: 120px; white-space: nowrap; margin: 0 auto;";

    thead.className = "sticky top-0 z-[60] shadow-md bg-[#9ca3af] border-b-2 border-black"; 
    
    thead.innerHTML = `
        <tr class="text-black font-black text-[10px] tracking-tight">
            <th rowspan="2" class="${thClass} w-[3%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Depth (m)</span></div></th>
            <th rowspan="2" class="${thClass} w-[4%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Symbol Zone</span></div></th>
            <th rowspan="2" class="${thClassPad} w-[4%]">Layer<br>Zone</th>
            <th rowspan="2" class="${thClass} w-[4%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Thickness (m)</span></div></th>
            <th rowspan="2" class="${thClassPad} w-auto min-w-[320px]">Description</th>
            <th rowspan="2" class="${thClass} w-[3%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Length (m)</span></div></th>
            <th rowspan="2" class="${thClass} w-[3%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Loss (m)</span></div></th>
            <th rowspan="2" class="${thClass} w-[3%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Swelling (m)</span></div></th>
            <th rowspan="2" class="${thClass} w-[3%]"><div class="vertical-text-wrapper"><span class="vertical-text text-[10px] font-bold">Recovery (%)</span></div></th>
            <th rowspan="2" class="${thClassPad} w-[5%] min-w-[60px]">Sample<br>ID</th>
            
            <th colspan="${activeAssays.length}" class="${thClassPad} py-1.5 text-[12px]">Assay</th>
            ${chartHeader}
        </tr>
        <tr>${assayHeaders}</tr>
    `;

    let accumulatedHeightPx = 0; 
    let rowCentersPx = [];
    holeData.forEach((row) => {
        let from = parseFloat(row[fromKey]) || 0;
        let to = parseFloat(row[toKey]);
        if(isNaN(to)) to = from + (parseFloat(row['Length'] || row['length']) || 1);
        
        let cellHeightCm = (to - from) * scaleCm; 
        if (cellHeightCm < 0.8 || isNaN(cellHeightCm)) cellHeightCm = 0.8; 
        let cellHeightPx = (cellHeightCm * 37.7952755906) + 1; 
        rowCentersPx.push(accumulatedHeightPx + (cellHeightPx / 2));
        accumulatedHeightPx += cellHeightPx;
    });

    let lines = ''; let circles = '';
    chartAssays.forEach(col => {
        let color = state.styleMeta.elements[col] || '#0d9488';
        let max = assayMax[col]; let prevX = null, prevY = null;
        holeData.forEach((row, i) => {
            let val = parseFloat(row[col]);
            if (!isNaN(val)) {
                let domName = lithoCol && row[lithoCol] ? String(row[lithoCol]).trim().toUpperCase() : 'UNKNOWN';
                let finalVal = applyTopCut(val, col, domName); // Pengkondisian grafik garis
                let xRaw = (finalVal / max);
                if(xRaw > 1) xRaw = 1; if(xRaw < 0) xRaw = 0;
                let x = 5 + (xRaw * 90); 
                let y = (rowCentersPx[i] / accumulatedHeightPx) * 100;
                if (prevX !== null && prevY !== null) { lines += `<line x1="${prevX}%" y1="${prevY}%" x2="${x}%" y2="${y}%" stroke="${color}" stroke-width="1.5"/>`; }
                circles += `<circle cx="${x}%" cy="${y}%" r="2.5" fill="${color}" stroke="black" stroke-width="0.5"/>`;
                prevX = x; prevY = y;
            }
        });
    });

    let svgContent = `
        <svg width="100%" height="100%" style="position: absolute; top: 0; left: 0; overflow: visible; z-index: 10;">
            <line x1="25%" y1="0" x2="25%" y2="100%" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2"/>
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4"/>
            <line x1="75%" y1="0" x2="75%" y2="100%" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2"/>
            ${lines}
            ${circles}
        </svg>
    `;

    tbody.innerHTML = '';
    holeData.forEach((row, index) => {
        try {
            const from = parseFloat(row[fromKey]) || 0;
            let to = parseFloat(row[toKey]);
            if(isNaN(to)) to = from + (parseFloat(row['Length'] || row['length']) || 1);
            const thickness = (to - from).toFixed(2);
            
            let cellHeight = (to - from) * scaleCm; 
            if (cellHeight < 0.8) cellHeight = 0.8; 

            let topVal = from.toFixed(1);
            let botVal = to.toFixed(1);
            topVal = topVal.endsWith('.0') ? topVal.slice(0, -2) : topVal;
            botVal = botVal.endsWith('.0') ? botVal.slice(0, -2) : botVal;

            let isLastRow = index === holeData.length - 1;
            const type = lithoCol && row[lithoCol] ? String(row[lithoCol]).trim() : "Undef";
            
            let styleConfig = state.styleMeta.domains[type];
            if (!styleConfig && type !== 'Undef') {
                let autoColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                let d = type.toUpperCase();
                
                // PERBAIKAN: Deteksi 5 Facies Domaining secara spesifik
                if (d.includes('RED_LIM') || d.includes('RED')) autoColor = '#9f1239'; // Merah Gelap (Fe Tinggi)
                else if (d.includes('YEL_LIM') || d.includes('YEL')) autoColor = '#b45309'; // Oranye/Amber
                else if (d === 'LIM' || d.includes('LIMONITE')) autoColor = '#b45309'; // Default Limonit
                else if (d.includes('ROCKY_SAP') || d.includes('ROCK')) autoColor = '#047857'; // Hijau Tua
                else if (d.includes('SOFT_SAP') || d.includes('SAP')) autoColor = '#10b981'; // Hijau Terang (Soft Sap)
                else if (d.includes('BRK') || d.includes('BED')) autoColor = '#1e293b'; // Slate Gelap (Bedrock)
                else if (d.includes('SOIL') || d.includes('OB') || d.includes('OVER')) autoColor = '#78350f'; // Coklat Tanah
                
                styleConfig = { color: autoColor, pattern: 'solid' };
                state.styleMeta.domains[type] = styleConfig; 
            } else if (!styleConfig) {
                styleConfig = { color: '#cbd5e1', pattern: 'solid' };
            }
            
            const patternStyle = getPatternCSSString(styleConfig.pattern, styleConfig.color);

            let assayCells = activeAssays.map((col) => {
                let val = row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '' ? parseFloat(row[col]) : '';
                let domName = lithoCol && row[lithoCol] ? String(row[lithoCol]).trim().toUpperCase() : 'UNKNOWN';
                let finalVal = val !== '' ? applyTopCut(val, col, domName) : ''; // Eksekusi pemangkasan teks angka
                
                let width = (finalVal !== '' && !isNaN(finalVal) && assayMax[col] > 0) ? (finalVal / assayMax[col]) * 100 : 0;
                let color = state.styleMeta.elements[col] || '#2dd4bf'; 
                let dispVal = finalVal !== '' ? (typeof finalVal === 'number' ? finalVal.toFixed(2) : finalVal) : '';
                
                return `
                    <td class="border-b border-r border-black relative p-0 overflow-hidden bg-white">
                        <div class="absolute top-0 left-0 h-full opacity-100 transition-all" style="width: ${width > 100 ? 100 : width}%; background-color: ${color};"></div>
                        <div class="absolute inset-0 flex items-center justify-center font-bold text-[9px] z-10 text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] px-0.5">${dispVal}</div>
                    </td>
                `;
            }).join('');

            let chartCell = index === 0 ? `<td rowspan="${holeData.length}" class="border-b border-r border-black relative p-0 bg-white align-top">${svgContent}</td>` : '';
            let getCell = (keywords, fallback) => { let key = Object.keys(row).find(k => keywords.some(kw => k.toLowerCase().includes(kw))); return key && row[key] !== undefined && row[key] !== '' ? row[key] : fallback; };
            
            let desc = getCell(['description', 'desc', 'deskripsi'], '');
            let lengthVal = getCell(['length', 'panjang'], thickness);
            let loss = getCell(['loss', 'coreloss'], '');
            let swelling = getCell(['swelling'], '');
            let recovery = getCell(['recovery'], '');
            let sampleId = getCell(['sampleid', 'sample_id', 'sample'], '');

            if (state.dhMode !== 'raw' && state.rawData && state.rawData.length > 0) {
                let rawOverlaps = state.rawData.filter(d => {
                    if (d[holeIdKey] !== activeHole) return false;
                    let rFrom = parseFloat(d[fromKey]) || 0;
                    let rTo = parseFloat(d[toKey]);
                    if(isNaN(rTo)) rTo = rFrom + (parseFloat(d['Length'] || d['length']) || 1);
                    return (from < rTo && to > rFrom);
                });

                if (rawOverlaps.length > 0) {
                    let getRawVal = (kws) => {
                        let vals = rawOverlaps.map(o => {
                            let k = Object.keys(o).find(key => kws.some(kw => key.toLowerCase().includes(kw)));
                            return k && o[k] ? String(o[k]).trim() : null;
                        }).filter(v => v && v !== '-');
                        return vals.length > 0 ? [...new Set(vals)].join(', ') : '';
                    };

                    if (!desc || desc === '-') desc = getRawVal(['description', 'desc', 'deskripsi']);
                    if (!sampleId || sampleId === '-') sampleId = getRawVal(['sampleid', 'sample_id', 'sample']);
                    if (!loss || loss === '-') loss = getRawVal(['loss', 'coreloss']);
                    if (!swelling || swelling === '-') swelling = getRawVal(['swelling']);
                    if (!recovery || recovery === '-') recovery = getRawVal(['recovery']);
                }
            }

            desc = desc || '-';
            sampleId = sampleId || '-';
            loss = loss || '0';
            swelling = swelling || '0';
            recovery = recovery || '100';

            let tr = document.createElement('tr');
            tr.className = "bg-white text-center hover:bg-slate-50 transition-colors";
            tr.innerHTML = `
                <td class="border-b border-r border-black relative p-0 align-top text-[10px] font-bold text-slate-700" style="height: ${cellHeight}cm;">
                    <div class="absolute top-1 left-1">${topVal}</div>
                    ${isLastRow ? `<div class="absolute bottom-1 left-1">${botVal}</div>` : ''}
                    <div class="absolute top-1/2 left-0 w-[5px] h-[1px] bg-black"></div>
                </td>
                <td class="border-b border-r border-black" style="${patternStyle}"></td>
                <td class="border-b border-r border-black px-1 font-bold text-[10px] text-slate-800 whitespace-normal leading-tight">${type}</td>
                <td class="border-b border-r border-black font-medium text-[10px] text-slate-800 text-center">${thickness}</td>
                <td class="border-b border-r border-black text-left text-[10px] font-medium text-slate-800 p-3 whitespace-normal leading-tight min-w-[320px]">${desc}</td>
                <td class="border-b border-r border-black text-[10px] font-medium text-slate-800 text-center">${lengthVal}</td>
                <td class="border-b border-r border-black text-[10px] font-medium text-slate-800 text-center">${loss}</td>
                <td class="border-b border-r border-black text-[10px] font-medium text-slate-800 text-center">${swelling}</td>
                <td class="border-b border-r border-black text-[10px] font-medium text-slate-800 text-center">${recovery}</td>
                <td class="border-b border-r border-black px-1 text-[10px] font-medium text-slate-800 whitespace-normal break-words leading-tight min-w-[60px]">${sampleId}</td>
                ${assayCells}
                ${chartCell}
            `;
            tbody.appendChild(tr);
        } catch (err) {
            console.error("Safeguard: Error rendering row", index, err);
        }
    });
}

// ==========================================
// 5. AUTO-TRIGGER & BYPASS HTML
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    ['btn-downhole', 'top-nav-view'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                setTimeout(() => { if (typeof initDownholeLog === 'function') initDownholeLog(); }, 100);
            });
        }
    });

    const holeSelector = document.getElementById('hole-selector');
    if (holeSelector) {
        holeSelector.setAttribute('onchange', ''); 
        holeSelector.addEventListener('change', () => {
            if (typeof renderLog === 'function') renderLog(); 
        });
    }
});

// ==========================================
// 6. SIDEBAR ACTIONS & SETTINGS
// ==========================================
function updatePaperOrientation() {
    const paperSelect = document.getElementById('rs-paper-size');
    if (!state.config) state.config = {};
    if (paperSelect) { 
        state.config.paperOrientation = paperSelect.value; 
        
        // Re-calculate auto scale when orientation changes
        if (!state.config.hasManuallySetScale) {
            if (typeof renderLog === 'function') renderLog();
        }
    }
}

function updateSettings() {
    if (!state.config) state.config = {};
    const scaleVal = document.getElementById('inp-setting-scale').value;
    state.config.cmPerMeter = parseFloat(scaleVal);
    
    state.config.hasManuallySetScale = true; 
    
    const displayEl = document.getElementById('scale-val-display');
    if(displayEl) displayEl.textContent = scaleVal + ' CM/M';
    
    const dataToUse = getActiveDownholeData();
    if (dataToUse && dataToUse.length > 0 && typeof renderLog === 'function') { 
        renderLog(); 
    }
}

function openEditProjectInfoModal() {
    if (!state.projectMeta) state.projectMeta = {};
    document.getElementById('edit-proj-company').value = state.projectMeta.company || '';
    document.getElementById('edit-proj-client').value = state.projectMeta.client || '';
    document.getElementById('edit-proj-loc').value = state.projectMeta.location || '';
    document.getElementById('edit-proj-block').value = state.projectMeta.block || '';
    document.getElementById('edit-proj-geo').value = state.projectMeta.geologist || '';
    document.getElementById('modal-edit-project-info').classList.remove('hidden');
}

function closeEditProjectInfoModal() { document.getElementById('modal-edit-project-info').classList.add('hidden'); }

function saveProjectInfo() {
    if (!state.projectMeta) state.projectMeta = {};
    state.projectMeta.company = document.getElementById('edit-proj-company').value || '-';
    state.projectMeta.client = document.getElementById('edit-proj-client').value || '-';
    state.projectMeta.location = document.getElementById('edit-proj-loc').value || '-';
    state.projectMeta.block = document.getElementById('edit-proj-block').value || '-';
    state.projectMeta.geologist = document.getElementById('edit-proj-geo').value || '-';
    closeEditProjectInfoModal();
    if (typeof renderLog === 'function') { renderLog(); }
    if (typeof showToast === 'function') { showToast("Project Information updated successfully.", "success"); }
}

// ==========================================
// 7. REPORT LOGOS LOGIC
// ==========================================
function handleReportLogo(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        if (!state.config) state.config = {};
        if (type === 'company') {
            state.config.logoUrl = e.target.result;
            document.getElementById('lbl-logo-company').textContent = "UPLOADED";
            document.getElementById('btn-rm-logo-company').classList.remove('hidden');
            document.getElementById('btn-rm-logo-company').classList.add('flex');
        } else if (type === 'client') {
            state.config.clientLogoUrl = e.target.result;
            document.getElementById('lbl-logo-client').textContent = "UPLOADED";
            document.getElementById('btn-rm-logo-client').classList.remove('hidden');
            document.getElementById('btn-rm-logo-client').classList.add('flex');
        }
        if (typeof renderLog === 'function') renderLog();
    };
    reader.readAsDataURL(file);
    event.target.value = ''; 
}

function removeReportLogo(type) {
    if (!state.config) state.config = {};
    if (type === 'company') {
        state.config.logoUrl = '';
        document.getElementById('lbl-logo-company').textContent = "UPLOAD";
        document.getElementById('btn-rm-logo-company').classList.add('hidden');
        document.getElementById('btn-rm-logo-company').classList.remove('flex');
    } else if (type === 'client') {
        state.config.clientLogoUrl = '';
        document.getElementById('lbl-logo-client').textContent = "UPLOAD";
        document.getElementById('btn-rm-logo-client').classList.add('hidden');
        document.getElementById('btn-rm-logo-client').classList.remove('flex');
    }
    if (typeof renderLog === 'function') renderLog();
}

// ==========================================
// 8. LEGENDS & STYLES MANAGER
// ==========================================
const symbolPatterns = [
    { value: 'solid', label: 'Solid Color' },
    { value: 'dots', label: 'Sandstone (Dots)' },
    { value: 'conglomerate', label: 'Conglomerate' },
    { value: 'breccia', label: 'Breccia (Angular)' },
    { value: 'lines-h', label: 'Shale (Lines)' },
    { value: 'dashed-h', label: 'Siltstone (Dash)' },
    { value: 'bricks', label: 'Limestone' },
    { value: 'crosshatch', label: 'Igneous / Bedrock' },
    { value: 'coal', label: 'Coal (Black)' }
];

function openStyleManagerModal() {
    const dataToUse = getActiveDownholeData();
    if (!dataToUse || dataToUse.length === 0) {
        if (typeof showToast === 'function') showToast("Please load data first.", "warning");
        return;
    }

    const domList = document.getElementById('style-domain-list');
    const elemList = document.getElementById('style-element-list');
    domList.innerHTML = ''; elemList.innerHTML = '';

    let lithoCol = null;
    if (state.dhMode === 'domained') {
        lithoCol = 'Geo_Domain';
    } else if (state.dhMode === 'composited') {
        lithoCol = 'Domain';
        if (dataToUse.length > 0 && !dataToUse[0].hasOwnProperty('Domain') && dataToUse[0].hasOwnProperty('Geo_Domain')) lithoCol = 'Geo_Domain';
    } else {
        lithoCol = state.coreCols.litho || state.headers.find(h => {
            if(!h) return false;
            let kw = h.toLowerCase();
            return kw.includes('litho') || kw.includes('lito') || kw.includes('rock') || kw === 'domain';
        });
    }

    let uniqueDomains = new Set();
    if (lithoCol) {
        dataToUse.forEach(r => { if(r[lithoCol]) uniqueDomains.add(String(r[lithoCol]).trim()); });
    } else {
        uniqueDomains.add("Undefined");
    }
    state.uniqueDomains = [...uniqueDomains];

    state.uniqueDomains.forEach((dom, i) => {
        let currentStyle = state.styleMeta.domains[dom] || { color: '#cbd5e1', pattern: 'solid' };
        let opts = symbolPatterns.map(p => `<option value="${p.value}" ${p.value === currentStyle.pattern ? 'selected' : ''}>${p.label}</option>`).join('');
        
        domList.insertAdjacentHTML('beforeend', `
            <div class="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-md shadow-sm">
                <span class="text-xs font-bold text-slate-700 truncate w-1/3" title="${dom}">${dom}</span>
                <div class="flex gap-2 w-2/3 justify-end">
                    <input type="color" id="cfg-color-dom-${i}" value="${currentStyle.color}" class="w-8 h-8 rounded cursor-pointer border border-slate-300 p-0.5 bg-white shrink-0">
                    <select id="cfg-pattern-dom-${i}" class="bg-slate-50 border border-slate-300 text-xs font-bold text-slate-600 rounded px-2 outline-none w-full focus:border-teal-500 transition-colors">
                        ${opts}
                    </select>
                </div>
            </div>`);
    });

    const targetAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    let activeAssays = targetAssays.filter(ta => state.headers.some(h => h.toLowerCase() === ta.toLowerCase()));
    
    if (activeAssays.length === 0) activeAssays = (state.visibleAssays || []).slice(0, 9);

    activeAssays.forEach((elem, i) => {
        let currentCol = state.styleMeta.elements[elem] || state.styleMeta.elements[elem.toLowerCase()] || '#0d9488';
        
        elemList.insertAdjacentHTML('beforeend', `
            <div class="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-md shadow-sm">
                <span class="text-xs font-black uppercase text-slate-700 truncate tracking-widest">${elem}</span>
                <input type="color" id="cfg-color-elem-${i}" data-elem="${elem}" value="${currentCol}" class="w-8 h-8 rounded cursor-pointer border border-slate-300 p-0.5 bg-white shrink-0">
            </div>`);
    });

    document.getElementById('modal-style-manager').classList.remove('hidden');
}

function closeStyleManagerModal() { document.getElementById('modal-style-manager').classList.add('hidden'); }

function saveStyleManager() {
    if (state.uniqueDomains) {
        state.uniqueDomains.forEach((dom, i) => {
            state.styleMeta.domains[dom] = { 
                color: document.getElementById(`cfg-color-dom-${i}`).value, 
                pattern: document.getElementById(`cfg-pattern-dom-${i}`).value 
            };
        });
    }

    const assayInputs = document.querySelectorAll('input[id^="cfg-color-elem-"]');
    assayInputs.forEach(input => {
        let elemName = input.getAttribute('data-elem');
        state.styleMeta.elements[elemName] = input.value;
        state.styleMeta.elements[elemName.toLowerCase()] = input.value; 
    });

    closeStyleManagerModal();
    if (typeof renderLog === 'function') renderLog();
    if (typeof showToast === 'function') showToast("Legends and styles updated successfully.", "success");
}

// ==========================================
// 9. HIGH-QUALITY BATCH PDF EXPORT ENGINE
// ==========================================
function openDownholeExportModal() {
    const dataToUse = getActiveDownholeData();
    if (!dataToUse || dataToUse.length === 0) {
        if (typeof showToast === 'function') showToast("No data available to export.", "warning");
        return;
    }

    const modal = document.getElementById('modal-export-pdf');
    const holeListContainer = document.getElementById('export-hole-list');
    
    const idKey = (state.coreCols && state.coreCols.holeId) ? state.coreCols.holeId : (state.coreCols && state.coreCols.id ? state.coreCols.id : 'Hole_ID');
    const uniqueHoles = [...new Set(dataToUse.map(d => d[idKey]).filter(h => h && h.toString().trim() !== ''))];
    
    document.getElementById('search-export-hole').value = '';
    document.getElementById('cb-export-all').checked = false;
    document.getElementById('export-count-label').textContent = '0 Selected';

    holeListContainer.innerHTML = '';
    uniqueHoles.forEach((hole) => {
        holeListContainer.insertAdjacentHTML('beforeend', `
            <label class="hole-export-item flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded shadow-sm cursor-pointer hover:border-teal-500 hover:bg-slate-50 transition-colors" data-hole="${hole.toLowerCase()}">
                <input type="checkbox" value="${hole}" class="cb-export-hole w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" onchange="updateExportCount()">
                <span class="text-xs font-bold text-slate-700 whitespace-normal break-words" title="${hole}">${hole}</span>
            </label>
        `);
    });
    
    modal.classList.remove('hidden');
}

function closeDownholeExportModal() { document.getElementById('modal-export-pdf').classList.add('hidden'); }

function filterExportHoles() {
    const term = document.getElementById('search-export-hole').value.toLowerCase();
    const items = document.querySelectorAll('.hole-export-item');
    items.forEach(item => { 
        if (item.dataset.hole.includes(term)) { item.style.display = 'flex'; } 
        else { item.style.display = 'none'; } 
    });
    updateExportCount();
}

function toggleAllExportHoles() {
    const isChecked = document.getElementById('cb-export-all').checked;
    const checkboxes = document.querySelectorAll('.cb-export-hole');
    checkboxes.forEach(cb => { 
        if (cb.closest('.hole-export-item').style.display !== 'none') { cb.checked = isChecked; } 
    });
    updateExportCount();
}

function updateExportCount() {
    const checkedCount = document.querySelectorAll('.cb-export-hole:checked').length;
    document.getElementById('export-count-label').textContent = `${checkedCount} Selected`;
    const totalVisible = Array.from(document.querySelectorAll('.hole-export-item')).filter(item => item.style.display !== 'none').length;
    document.getElementById('cb-export-all').checked = (checkedCount === totalVisible && totalVisible > 0);
}

async function executeBatchPDFExport() {
    const checkedBoxes = document.querySelectorAll('.cb-export-hole:checked');
    const selectedHoles = Array.from(checkedBoxes).map(cb => cb.value);

    if (selectedHoles.length === 0) {
        if(typeof showToast === 'function') showToast("Please select at least one Hole ID.", "warning");
        return;
    }

    closeDownholeExportModal();

    const floatUI = document.getElementById('floating-export-progress');
    const floatBar = document.getElementById('float-progress-bar');
    const floatText = document.getElementById('float-progress-text');
    const floatPct = document.getElementById('float-progress-pct');

    floatUI.classList.remove('hidden');
    floatUI.classList.add('flex');
    setTimeout(() => { floatUI.classList.remove('translate-y-10', 'opacity-0'); }, 50); 
    floatBar.style.width = '0%';

    const { jsPDF } = window.jspdf;
    
    const orientation = state.config?.paperOrientation || 'portrait';
    const pdf = new jsPDF({ orientation: orientation, unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const marginX = 10; 
    const marginY = 10;
    const printWidth = pdfWidth - (marginX * 2);
    const printHeight = pdfHeight - (marginY * 2);

    const holeSelector = document.getElementById('hole-selector');
    const originalActiveHole = holeSelector.value;
    
    let offscreenContainer = document.getElementById("offscreen-render-container");
    if (!offscreenContainer) {
        offscreenContainer = document.createElement('div');
        offscreenContainer.id = "offscreen-render-container";
        offscreenContainer.className = 'absolute top-0 left-[-9999px] w-[1400px] overflow-visible bg-white z-[-9999]';
        document.body.appendChild(offscreenContainer);
    }

    try {
        for (let i = 0; i < selectedHoles.length; i++) {
            const holeId = selectedHoles[i];
            
            let percent = Math.round((i / selectedHoles.length) * 100);
            floatBar.style.width = `${percent}%`;
            floatText.textContent = `Processing Document [${holeId}]...`;
            floatPct.textContent = `${percent}%`;

            holeSelector.value = holeId;
            renderLog();
            
            await new Promise(r => setTimeout(r, 150)); 

            const reportNode = document.getElementById('report-container');
            offscreenContainer.innerHTML = '';
            const clone = reportNode.cloneNode(true);
            
            clone.classList.remove('h-full', 'shadow-lg', 'border', 'rounded-sm');
            clone.style.height = 'auto';
            clone.style.maxHeight = 'none';
            
            const scrollArea = clone.querySelector('#table-scroll-area');
            if(scrollArea) {
                scrollArea.classList.remove('overflow-y-auto', 'overflow-x-auto', 'h-full', 'custom-scrollbar');
                scrollArea.style.overflow = 'visible';
                scrollArea.style.height = 'auto';
            }
            
            const theadClone = clone.querySelector('#log-thead');
            if(theadClone) {
                theadClone.classList.remove('sticky', 'top-0', 'z-[60]', 'shadow-md', 'border-b-2');
                theadClone.style.position = 'static';
                
                theadClone.querySelectorAll('th').forEach(th => {
                    th.classList.remove('border-[#9ca3af]', 'bg-[#9ca3af]');
                    th.classList.add('border-black', 'bg-[#b8c2cc]');
                });
            }

            const verticalWrappers = clone.querySelectorAll('.vertical-text-wrapper');
            verticalWrappers.forEach(div => {
                const span = div.querySelector('.vertical-text');
                const text = span ? span.innerText.trim() : '';
                div.style.writingMode = 'unset';
                div.style.transform = 'none';
                div.innerHTML = `
                    <svg width="24" height="120" xmlns="http://www.w3.org/2000/svg">
                        <text x="-60" y="14" transform="rotate(-90)" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="900" fill="#0f172a">${text}</text>
                    </svg>
                `;
            });

            offscreenContainer.appendChild(clone);
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 100)); 

            const fullCanvas = await html2canvas(clone, {
                scale: 2, 
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: clone.scrollWidth,
                windowHeight: clone.scrollHeight 
            });

            const ratioMmToPx = printWidth / fullCanvas.width;
            
            const cloneRect = clone.getBoundingClientRect();
            const tbodyEl = clone.querySelector('tbody');
            const tbodyRect = tbodyEl.getBoundingClientRect();
            const ratioCanvasToDom = fullCanvas.height / clone.scrollHeight;
            
            const headerHeightPx = (tbodyRect.top - cloneRect.top) * ratioCanvasToDom;
            const headerHeightMm = headerHeightPx * ratioMmToPx;

            let headerCanvas = document.createElement('canvas');
            headerCanvas.width = fullCanvas.width;
            headerCanvas.height = headerHeightPx;
            let hCtx = headerCanvas.getContext('2d');
            hCtx.drawImage(fullCanvas, 0, 0, fullCanvas.width, headerHeightPx, 0, 0, fullCanvas.width, headerHeightPx);
            const headerImgData = headerCanvas.toDataURL('image/jpeg', 0.95);

            let cutPointsPx = [];
            let currentDomY = tbodyRect.top - cloneRect.top;
            
            clone.querySelectorAll('#tableBody tr').forEach(tr => {
                const trRect = tr.getBoundingClientRect();
                currentDomY = trRect.bottom - cloneRect.top;
                cutPointsPx.push(currentDomY * ratioCanvasToDom);
            });
            cutPointsPx.push(fullCanvas.height);

            let currentCanvasY = 0;
            let pageNum = 1;

            while (currentCanvasY < fullCanvas.height - 5) { 
                if (pageNum > 1 || i > 0) {
                    if (!(pageNum === 1 && i === 0)) {
                        pdf.addPage(orientation, 'mm', 'a4');
                    }
                }

                let targetMaxCanvasY;
                if (pageNum === 1) {
                    targetMaxCanvasY = currentCanvasY + (printHeight / ratioMmToPx);
                } else {
                    targetMaxCanvasY = currentCanvasY + ((printHeight - headerHeightMm) / ratioMmToPx);
                }

                let bestCutY = targetMaxCanvasY;
                for (let j = cutPointsPx.length - 1; j >= 0; j--) {
                    if (cutPointsPx[j] <= targetMaxCanvasY && cutPointsPx[j] > currentCanvasY) {
                        bestCutY = cutPointsPx[j];
                        break;
                    }
                }

                let sliceHeightPx = bestCutY - currentCanvasY;
                let sliceHeightMm = sliceHeightPx * ratioMmToPx;

                let sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = fullCanvas.width;
                sliceCanvas.height = sliceHeightPx;
                let sCtx = sliceCanvas.getContext('2d');
                sCtx.drawImage(
                    fullCanvas, 
                    0, currentCanvasY, fullCanvas.width, sliceHeightPx, 
                    0, 0, sliceCanvas.width, sliceHeightPx 
                );
                
                let sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.95);

                if (pageNum === 1) {
                    pdf.addImage(sliceImgData, 'JPEG', marginX, marginY, printWidth, sliceHeightMm);
                } else {
                    pdf.addImage(headerImgData, 'JPEG', marginX, marginY, printWidth, headerHeightMm);
                    pdf.addImage(sliceImgData, 'JPEG', marginX, marginY + headerHeightMm, printWidth, sliceHeightMm);
                }

                currentCanvasY = bestCutY;
                pageNum++;
            }
            
            offscreenContainer.innerHTML = '';
        }

        floatBar.style.width = `100%`;
        floatText.textContent = `Compilation Complete! Downloading...`;
        floatPct.textContent = `100%`;
        
        await new Promise(r => setTimeout(r, 800)); 

        const safeCompany = state.projectMeta.company ? state.projectMeta.company.replace(/[^a-zA-Z0-9]/g, '_') : 'Project';
        const dataSourceLabel = state.dhMode ? state.dhMode.toUpperCase() : 'RAW';
        pdf.save(`NiCore_Downhole_${dataSourceLabel}_${safeCompany}.pdf`);
        
        if(typeof showToast === 'function') showToast("PDF Reports downloaded successfully.", "success");

    } catch (error) {
        console.error("Batch PDF Export Failed:", error);
        if(typeof showToast === 'function') showToast("Error generating PDF. Please ensure data is properly loaded.", "error");
    } finally {
        if (document.body.contains(offscreenContainer)) { offscreenContainer.innerHTML = ''; }
        
        holeSelector.value = originalActiveHole;
        renderLog();
        
        floatUI.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => {
            floatUI.classList.add('hidden');
            floatUI.classList.remove('flex');
        }, 500);
    }
}

// ==========================================
// 10. EDIT REPORT TITLE
// ==========================================
window.promptChangeTitle = function() {
    const currentTitle = state.projectMeta.reportTitle || 'DRILLING EXPLORATION';
    const newTitle = prompt("Update Main Report Title (leave blank to cancel):", currentTitle);
    
    if (newTitle !== null && newTitle.trim() !== '') {
        state.projectMeta.reportTitle = newTitle.trim().toUpperCase();
        if (typeof renderLog === 'function') renderLog();
    }
};

// ==========================================
// 11. ULTIMATE SPREADSHEET DATA MANAGEMENT
// Drag, Drop, Copy, Paste, Delete with Keyboard Nav
// ==========================================
let dhEditingData = [];
let dhHistory = [];
let dhHistoryIndex = -1;

// Global Drag State
let dmIsSelecting = false;
let dmStartCell = null;
let dmEndCell = null;

window.openDataManagementModal = function() {
    if (!state.rawData || state.rawData.length === 0) {
        if (typeof showToast === 'function') showToast("Please load a dataset first.", "warning");
        else alert("Please load a dataset first.");
        return;
    }
    
    const activeHole = document.getElementById('hole-selector')?.value;
    if (!activeHole) {
        if (typeof showToast === 'function') showToast("Please select an Active Hole first.", "warning");
        else alert("Please select an Active Hole first.");
        return;
    }

    const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
    const fromKey = state.coreCols.from || 'From';

    const holeData = state.rawData.filter(d => d[holeIdKey] === activeHole);
    holeData.sort((a,b) => (parseFloat(a[fromKey]) || 0) - (parseFloat(b[fromKey]) || 0));
    
    dhEditingData = JSON.parse(JSON.stringify(holeData));
    dhHistory = [];
    dhHistoryIndex = -1;
    dmIsSelecting = false;
    dmStartCell = null;
    dmEndCell = null;
    
    window.saveDMHistoryOverride();
    window.renderDMTable();
    window.setupDMEvents();
    
    document.getElementById('modal-data-management').classList.remove('hidden');
};

window.saveDMHistoryOverride = function() {
    if (dhHistoryIndex < dhHistory.length - 1) {
        dhHistory = dhHistory.slice(0, dhHistoryIndex + 1);
    }
    dhHistory.push(JSON.parse(JSON.stringify(dhEditingData)));
    dhHistoryIndex++;
    window.updateDMButtons();
};

window.updateDMButtons = function() {
    const btnUndo = document.getElementById('btn-undo-dm');
    const btnRedo = document.getElementById('btn-redo-dm');
    if(btnUndo) {
        btnUndo.disabled = dhHistoryIndex <= 0;
        if(btnUndo.disabled) btnUndo.classList.add('opacity-50'); else btnUndo.classList.remove('opacity-50');
    }
    if(btnRedo) {
        btnRedo.disabled = dhHistoryIndex >= dhHistory.length - 1;
        if(btnRedo.disabled) btnRedo.classList.add('opacity-50'); else btnRedo.classList.remove('opacity-50');
    }
};

window.undoDataManagement = function() { 
    if (dhHistoryIndex > 0) {
        dhHistoryIndex--;
        dhEditingData = JSON.parse(JSON.stringify(dhHistory[dhHistoryIndex]));
        window.renderDMTable();
        window.updateDMButtons();
        window.highlightDMSelection(document.getElementById('dm-tbody'));
    }
};

window.redoDataManagement = function() { 
    if (dhHistoryIndex < dhHistory.length - 1) {
        dhHistoryIndex++;
        dhEditingData = JSON.parse(JSON.stringify(dhHistory[dhHistoryIndex]));
        window.renderDMTable();
        window.updateDMButtons();
        window.highlightDMSelection(document.getElementById('dm-tbody'));
    }
};

window.renderDMTable = function() {
    const thead = document.getElementById('dm-thead');
    const tbody = document.getElementById('dm-tbody');
    if(!thead || !tbody) return;

    let headHTML = '<tr><th class="border border-slate-300 px-2 py-2 bg-slate-200 sticky top-0 z-10 w-10 text-center text-[#0B1A33]">#</th>';
    state.headers.forEach(h => {
        headHTML += `<th class="border border-slate-300 px-3 py-2 bg-slate-200 sticky top-0 z-10 text-[11px] font-bold uppercase text-[#0B1A33]">${h}</th>`;
    });
    headHTML += '<th class="border border-slate-300 px-2 py-2 bg-slate-200 sticky top-0 z-10 text-center text-[#0B1A33] text-[11px] font-bold uppercase min-w-[90px]">Actions</th></tr>';
    thead.innerHTML = headHTML;
    
    tbody.innerHTML = '';
    if (dhEditingData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${state.headers.length + 2}" class="text-center py-10 text-slate-400 font-bold text-xs">NO DATA AVAILABLE. ADD A NEW ROW.</td></tr>`;
    }
    
    dhEditingData.forEach((row, rowIndex) => {
        let tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors group";
        let tdHTML = `<td class="border border-slate-300 px-2 py-1.5 text-center text-[10px] font-bold text-slate-500 bg-slate-50 select-none">${rowIndex + 1}</td>`;
        
        state.headers.forEach(h => {
            let val = row[h]; if (val === null || val === undefined) val = '';
            tdHTML += `<td class="border border-slate-300 px-2 py-1.5 text-[11px] whitespace-nowrap min-w-[80px]" contenteditable="false" data-key="${h}" data-index="${rowIndex}">${val}</td>`;
        });
        
        tdHTML += `
            <td class="border border-slate-300 px-2 py-1 text-center bg-white select-none">
                <div class="flex items-center justify-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.addDMRow(${rowIndex}, 'above')" class="p-1 hover:bg-emerald-100 text-emerald-600 rounded" title="Insert Above"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>
                    <button onclick="window.addDMRow(${rowIndex}, 'below')" class="p-1 hover:bg-emerald-100 text-emerald-600 rounded" title="Insert Below"><i data-lucide="arrow-down" class="w-3.5 h-3.5"></i></button>
                    <button onclick="window.deleteDMRow(${rowIndex})" class="p-1 hover:bg-rose-100 text-rose-600 rounded ml-1" title="Delete Row"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </td>
        `;
        tr.innerHTML = tdHTML;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    window.highlightDMSelection(tbody);
};

window.highlightDMSelection = function(tbody) {
    if(!tbody) return;
    tbody.querySelectorAll('.selected-cell').forEach(td => td.classList.remove('selected-cell'));
    if(!dmStartCell || !dmEndCell) return;
    
    let minR = Math.min(dmStartCell.r, dmEndCell.r);
    let maxR = Math.max(dmStartCell.r, dmEndCell.r);
    let minC = Math.min(dmStartCell.c, dmEndCell.c);
    let maxC = Math.max(dmStartCell.c, dmEndCell.c);

    tbody.querySelectorAll('tr').forEach((tr, rIdx) => {
        if(rIdx >= minR && rIdx <= maxR) {
            Array.from(tr.children).forEach((td, cIdx) => {
                if(cIdx >= minC && cIdx <= maxC && td.hasAttribute('data-key')) {
                    td.classList.add('selected-cell');
                }
            });
        }
    });
};

window.addDMRow = function(index, pos) {
    let emptyRow = {};
    const activeHole = document.getElementById('hole-selector')?.value;
    const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
    
    state.headers.forEach(h => emptyRow[h] = '');
    emptyRow[holeIdKey] = activeHole;
    
    if (pos === 'above') dhEditingData.splice(index, 0, emptyRow);
    else dhEditingData.splice(index + 1, 0, emptyRow);
    
    window.saveDMHistoryOverride();
    window.renderDMTable();
};

window.addManagementRowEnd = function() { 
    let emptyRow = {};
    const activeHole = document.getElementById('hole-selector')?.value;
    const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
    
    state.headers.forEach(h => emptyRow[h] = '');
    emptyRow[holeIdKey] = activeHole;
    
    dhEditingData.push(emptyRow);
    window.saveDMHistoryOverride();
    window.renderDMTable();
    
    setTimeout(() => {
        const container = document.querySelector('#modal-data-management .overflow-auto');
        if(container) container.scrollTop = container.scrollHeight;
    }, 50);
};

window.deleteDMRow = function(index) {
    if(confirm('Are you sure you want to permanently delete this row?')) {
        dhEditingData.splice(index, 1);
        window.saveDMHistoryOverride();
        window.renderDMTable();
    }
};

window.saveDataManagement = function() { 
    const activeHole = document.getElementById('hole-selector')?.value;
    const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
    
    state.rawData = state.rawData.filter(d => d[holeIdKey] !== activeHole);
    state.rawData = state.rawData.concat(dhEditingData);
    
    const domains = new Set(state.uniqueDomains);
    const lithoCol = state.coreCols.litho || Object.keys(state.rawData[0] || {}).find(k => k.toLowerCase().includes('litho'));
    
    if (lithoCol) {
        dhEditingData.forEach(r => {
            if(r[lithoCol]) domains.add(String(r[lithoCol]).trim());
        });
        state.uniqueDomains = [...domains];
    }
    
    document.getElementById('modal-data-management').classList.add('hidden');
    
    if (typeof calculateDashboard === 'function') calculateDashboard(false);
    if (typeof renderLog === 'function') renderLog();
    if (typeof showToast === 'function') showToast("Data saved successfully.", "success");
};

// --- EVENTS MOUSE & DRAG SELECTION ---
window.setupDMEvents = function() {
    const tbody = document.getElementById('dm-tbody');
    if(!tbody) return;
    
    const newTbody = tbody.cloneNode(true);
    tbody.parentNode.replaceChild(newTbody, tbody);
    const activeTbody = document.getElementById('dm-tbody');

    activeTbody.addEventListener('dblclick', function(e) {
        let td = e.target.closest('td[data-key]');
        if(td) {
            td.setAttribute('contenteditable', 'true');
            td.focus();
            document.execCommand('selectAll', false, null);
        }
    });

    activeTbody.addEventListener('mousedown', function(e) {
        let td = e.target.closest('td[data-key]');
        if(!td) return;
        if(td.getAttribute('contenteditable') === 'true') return; 
        
        e.preventDefault(); 
        
        dmIsSelecting = true;
        let rIdx = parseInt(td.getAttribute('data-index'));
        let cIdx = Array.from(td.parentNode.children).indexOf(td);
        dmStartCell = { r: rIdx, c: cIdx };
        dmEndCell = { r: rIdx, c: cIdx };
        
        if(document.activeElement) document.activeElement.blur();
        window.highlightDMSelection(activeTbody);
    });

    activeTbody.addEventListener('mouseover', function(e) {
        if(!dmIsSelecting) return;
        let td = e.target.closest('td[data-key]');
        if(td) {
            let rIdx = parseInt(td.getAttribute('data-index'));
            let cIdx = Array.from(td.parentNode.children).indexOf(td);
            dmEndCell = { r: rIdx, c: cIdx };
            window.highlightDMSelection(activeTbody);
        }
    });

    activeTbody.addEventListener('blur', function(e) {
        if(e.target && e.target.tagName === 'TD' && e.target.getAttribute('contenteditable') === 'true') {
            e.target.setAttribute('contenteditable', 'false');
            const rIdx = e.target.getAttribute('data-index');
            const key = e.target.getAttribute('data-key');
            let val = e.target.innerText.trim();
            if (val !== '' && !isNaN(val)) val = parseFloat(val);
            
            if (dhEditingData[rIdx][key] !== val) {
                dhEditingData[rIdx][key] = val;
                window.saveDMHistoryOverride();
            }
        }
    }, true);

    activeTbody.addEventListener('keydown', function(e) {
        if(e.target && e.target.tagName === 'TD' && e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
        }
    });
};

document.addEventListener('mouseup', function() {
    dmIsSelecting = false;
});

// --- GLOBAL KEYBOARD SHORTCUTS (Ctrl+C, Ctrl+V, Arrow Keys, Delete, Undo) ---
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('modal-data-management');
    if(!modal || modal.classList.contains('hidden')) return;

    let isEditing = document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true';

    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undoDataManagement(); return; }
    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redoDataManagement(); return; }

    if (!isEditing && dmStartCell && dmEndCell && !e.shiftKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        let r = dmEndCell.r; let c = dmEndCell.c;
        if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (e.key === 'ArrowDown') r = Math.min(dhEditingData.length - 1, r + 1);
        if (e.key === 'ArrowLeft') c = Math.max(1, c - 1); 
        if (e.key === 'ArrowRight') c = Math.min(state.headers.length, c + 1);
        
        dmStartCell = {r, c}; dmEndCell = {r, c};
        window.highlightDMSelection(document.getElementById('dm-tbody'));
        
        let trs = document.getElementById('dm-tbody').querySelectorAll('tr');
        if(trs[r]) {
            let td = trs[r].children[c];
            if(td) td.scrollIntoView({block: 'nearest', inline: 'nearest'});
        }
        return;
    }

    if (!isEditing && e.ctrlKey && e.key.toLowerCase() === 'c') {
        const tbody = document.getElementById('dm-tbody');
        let selected = tbody.querySelectorAll('.selected-cell');
        if(selected.length === 0) return;

        let rowMap = {};
        selected.forEach(td => {
            let r = parseInt(td.getAttribute('data-index'));
            let key = td.getAttribute('data-key');
            let val = dhEditingData[r][key];
            if(val === undefined || val === null) val = '';
            if(!rowMap[r]) rowMap[r] = [];
            rowMap[r].push(val);
        });

        let tsv = Object.values(rowMap).map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            if (typeof showToast === 'function') showToast("Cells copied to clipboard.", "success");
        });
    }

    if (!isEditing && ((e.ctrlKey && e.key.toLowerCase() === 'x') || e.key === 'Delete' || e.key === 'Backspace')) {
        const tbody = document.getElementById('dm-tbody');
        let selected = tbody.querySelectorAll('.selected-cell');
        if(selected.length === 0) return;

        if (e.ctrlKey && e.key.toLowerCase() === 'x') {
            let rowMap = {};
            selected.forEach(td => {
                let r = parseInt(td.getAttribute('data-index'));
                let key = td.getAttribute('data-key');
                let val = dhEditingData[r][key];
                if(val === undefined || val === null) val = '';
                if(!rowMap[r]) rowMap[r] = [];
                rowMap[r].push(val);
            });
            let tsv = Object.values(rowMap).map(row => row.join('\t')).join('\n');
            navigator.clipboard.writeText(tsv);
        }

        let changed = false;
        selected.forEach(td => {
            let r = parseInt(td.getAttribute('data-index'));
            let key = td.getAttribute('data-key');
            if (dhEditingData[r][key] !== '') {
                dhEditingData[r][key] = ''; 
                td.innerText = ''; 
                changed = true;
            }
        });

        if (changed) window.saveDMHistoryOverride();
    }
});

document.addEventListener('paste', function(e) {
    const modal = document.getElementById('modal-data-management');
    if(!modal || modal.classList.contains('hidden')) return;
    
    let isEditing = document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true';
    if(isEditing) return; 

    if(!dmStartCell) return;
    e.preventDefault(); 
    
    let pasteData = (e.clipboardData || window.clipboardData).getData('text');
    let rows = pasteData.split(/\r?\n/);
    
    let startRowIdx = Math.min(dmStartCell.r, dmEndCell.r);
    let startColIdx = Math.min(dmStartCell.c, dmEndCell.c);

    const tbody = document.getElementById('dm-tbody');
    let headerCells = Array.from(tbody.querySelector('tr').children);
    let changed = false;

    for(let i = 0; i < rows.length; i++) {
        if(rows[i].trim() === '' && i === rows.length - 1) continue; 
        
        let cols = rows[i].split('\t');
        let targetR = startRowIdx + i;
        
        if(targetR >= dhEditingData.length) {
            let emptyRow = {};
            const activeHole = document.getElementById('hole-selector').value;
            const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
            state.headers.forEach(h => emptyRow[h] = '');
            emptyRow[holeIdKey] = activeHole;
            dhEditingData.push(emptyRow);
        }

        for(let j = 0; j < cols.length; j++) {
            let targetC = startColIdx + j;
            if(targetC < headerCells.length) {
                let key = headerCells[targetC].getAttribute('data-key');
                if(key) {
                    let val = cols[j].trim();
                    if(val !== '' && !isNaN(val)) val = parseFloat(val); 
                    
                    if(dhEditingData[targetR][key] !== val) {
                        dhEditingData[targetR][key] = val;
                        changed = true;
                    }
                }
            }
        }
    }

    if(changed) {
        window.saveDMHistoryOverride();
        window.renderDMTable();
        
        dmStartCell = { r: startRowIdx, c: startColIdx };
        dmEndCell = { 
            r: startRowIdx + rows.length - (rows[rows.length-1].trim() === '' ? 2 : 1), 
            c: startColIdx + rows[0].split('\t').length - 1 
        };
        window.highlightDMSelection(document.getElementById('dm-tbody'));
    }
});


// ==========================================
// 12. EXPORT TO CSV (DOWNLOAD EXCEL)
// ==========================================
window.exportToCSV = function() {
    if (!state.rawData || state.rawData.length === 0) {
        alert("No data available to export!");
        return;
    }

    let dataToExport = state.rawData;
    const modal = document.getElementById('modal-data-management');

    if (modal && !modal.classList.contains('hidden') && typeof dhEditingData !== 'undefined' && dhEditingData.length > 0) {
        const activeHole = document.getElementById('hole-selector').value;
        const holeIdKey = state.coreCols.holeId || state.coreCols.id || 'Hole_ID';
        const otherData = state.rawData.filter(d => d[holeIdKey] !== activeHole);
        dataToExport = otherData.concat(dhEditingData);
    }

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const safeCompany = (state.projectMeta.company && state.projectMeta.company !== '-') 
                        ? state.projectMeta.company.replace(/[^a-zA-Z0-9]/g, '_') 
                        : 'Database';
    
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;

    a.href = url;
    a.download = `NiCore_Export_${safeCompany}_${dateStr}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};