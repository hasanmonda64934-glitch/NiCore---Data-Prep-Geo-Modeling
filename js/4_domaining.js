// ==========================================
// 4_DOMAINING.JS
// Global EDA, 3-Zone Classification, JORC Justification & Reconciliation
// Fully Translated to Professional English & Optimized with Dynamic ML UI
// ==========================================

let domGlobalHist, domGlobalScatter;
let domPostHist;
let hangingHoleIds = [];
let anomalyHoleIds = [];

// --- DOMAIN COLOR DICTIONARY ---
function getDomainColor(domain) {
    const d = String(domain).toUpperCase();
    if (d === 'RED_LIM') return '#9f1239';   
    if (d === 'YEL_LIM') return '#b45309';   
    if (d === 'LIM') return '#b45309'; 
    if (d === 'SOFT_SAP') return '#10b981';  
    if (d === 'ROCKY_SAP') return '#047857'; 
    if (d === 'SAP') return '#10b981'; 
    if (d === 'BRK') return '#1e293b';       
    return '#94a3b8';                      
}

// Tab initialization hook (Final Smooth Fix)
const originalSwitchSubTabDomain = window.switchSubTab;
window.switchSubTab = function(tabId) {
    if (typeof originalSwitchSubTabDomain === 'function') {
        originalSwitchSubTabDomain(tabId);
    }
    if (tabId === 'domain') { 
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                initPreDomainingEDA();
                const planView = document.getElementById('dom-plan-view');
                if (planView && typeof Plotly !== 'undefined' && planView.data) {
                    Plotly.Plots.resize(planView);
                }
            });
        });
    }
};

// ==========================================
// PHASE A: PRE-DOMAINING (GLOBAL EDA)
// ==========================================
function initPreDomainingEDA() {
    if (state.rawData.length === 0) return;

    const postSection = document.getElementById('dom-post-section');
    let emptyState = document.getElementById('dom-post-empty-state');

    // INJEKSI EMPTY STATE UNTUK POST-DOMAINING
    if (!emptyState && postSection) {
        emptyState = document.createElement('div');
        emptyState.id = 'dom-post-empty-state';
        emptyState.className = 'flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 p-10 shadow-sm w-full min-h-[350px] mt-8 animate-fade-in';
        emptyState.innerHTML = `
            <div class="bg-slate-50 p-5 rounded-full shadow-inner mb-4 border border-slate-100">
                <i data-lucide="layers" class="w-16 h-16 text-slate-300 drop-shadow-sm"></i>
            </div>
            <h3 class="text-xl font-black text-slate-600 mb-2 tracking-tight uppercase">Post-Domaining Validation</h3>
            <p class="text-sm font-medium text-slate-400 text-center max-w-md">
                Waiting for geological classification. Please adjust your parameters and click "Cut & Classify" in the Action Panel to view the results.
            </p>
        `;
        postSection.parentNode.insertBefore(emptyState, postSection);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Toggle Empty State vs Post Section
    if (state.domainedData && state.domainedData.length > 0) {
        if (emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
        if (postSection) {
            postSection.classList.remove('hidden');
            setTimeout(() => { 
                if (typeof renderPostDomainingEDA === 'function') { 
                    renderPostDomainingEDA(); 
                } 
            }, 200);
        }
    } else {
        if (emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
        if (postSection) postSection.classList.add('hidden');
    }

    hangingHoleIds = []; 
    anomalyHoleIds = [];
    
    const targetAssays = ['ni', 'fe', 'mgo', 'sio2', 'co', 'al2o3', 'mno', 'cr2o3', 'fe2o3'];
    const assayCols = state.headers.filter(h => targetAssays.includes(h.toLowerCase().trim()));
    
    const glSel = document.getElementById('dom-global-element');
    const scX = document.getElementById('dom-scatter-x');
    const scY = document.getElementById('dom-scatter-y');
    const postSel = document.getElementById('dom-post-element'); 
    
    if (glSel) {
        const opts = assayCols.map(c => `<option value="${c}" class="bg-slate-800 text-white font-bold tracking-wide">${c}</option>`).join('');
        glSel.innerHTML = opts; scX.innerHTML = opts; scY.innerHTML = opts;
        if (postSel) postSel.innerHTML = opts;

        const niCol = assayCols.find(c => c.toLowerCase() === 'ni');
        const mgoCol = assayCols.find(c => c.toLowerCase() === 'mgo');
        
        if(niCol) { glSel.value = niCol; scY.value = niCol; if (postSel) postSel.value = niCol; }
        if(mgoCol) scX.value = mgoCol;
    }

    analyzeHangingHoles();
    analyzeGeochemicalAnomalies();
    renderPlanViewOverview();
    renderGlobalEDA();
    renderGlobalScatter();
    
    toggleDomainingMethodUI();
}

function renderPlanViewOverview() {
    const container = document.getElementById('dom-plan-view');
    if (!container || typeof Plotly === 'undefined') return;

    if (!state.detectedCoords.x || !state.detectedCoords.y) {
        container.innerHTML = `<div class="flex items-center justify-center h-full text-[10px] font-bold text-slate-400 italic bg-slate-50 rounded">Coordinates (X,Y) not found in CSV.</div>`;
        return;
    }

    // Baca filter aktif dari dropdown HTML
    const filterMode = document.getElementById('dom-plan-filter')?.value || 'ALL';

    const grouped = groupDataByHole(state.rawData, state.coreCols.holeId);
    let tracesData = { normal: {x:[],y:[],t:[]}, anomaly: {x:[],y:[],t:[]}, hanging: {x:[],y:[],t:[]} };

    grouped.forEach((holeData, holeId) => {
        const x = parseFloat(holeData[0][state.detectedCoords.x]);
        const y = parseFloat(holeData[0][state.detectedCoords.y]);
        if(!isNaN(x) && !isNaN(y)) {
            const isHanging = hangingHoleIds.includes(holeId);
            const isAnomaly = anomalyHoleIds.includes(holeId);

            // Logika Penyaringan (Filtering) Berdasarkan Pilihan Dropdown
            if (filterMode === 'HANGING' && !isHanging) return;
            if (filterMode === 'ANOMALY' && !isAnomaly) return;

            if (isHanging) { 
                tracesData.hanging.x.push(x); tracesData.hanging.y.push(y); tracesData.hanging.t.push(`Hole: ${holeId} (Hanging)`); 
            } else if (isAnomaly) { 
                tracesData.anomaly.x.push(x); tracesData.anomaly.y.push(y); tracesData.anomaly.t.push(`Hole: ${holeId} (Anomaly)`); 
            } else { 
                if (filterMode === 'ALL') { // Hanya masukkan lubang normal jika filter diset "ALL"
                    tracesData.normal.x.push(x); tracesData.normal.y.push(y); tracesData.normal.t.push(`Hole: ${holeId}`); 
                }
            }
        }
    });

    let traces = [];
    if(tracesData.normal.x.length > 0) traces.push({ x: tracesData.normal.x, y: tracesData.normal.y, mode: 'markers', type: 'scatter', name: 'Normal', text: tracesData.normal.t, hoverinfo: 'text', marker: { size: 6, color: '#0ea5e9', line: {color:'#0284c7', width:1} }});
    if(tracesData.anomaly.x.length > 0) traces.push({ x: tracesData.anomaly.x, y: tracesData.anomaly.y, mode: 'markers', type: 'scatter', name: 'Anomaly', text: tracesData.anomaly.t, hoverinfo: 'text', marker: { size: 8, color: '#f59e0b', line: {color:'#b45309', width:1.5} }});
    if(tracesData.hanging.x.length > 0) traces.push({ x: tracesData.hanging.x, y: tracesData.hanging.y, mode: 'markers', type: 'scatter', name: 'Hanging', text: tracesData.hanging.t, hoverinfo: 'text', marker: { size: 8, color: '#e11d48', line: {color:'#9f1239', width:1.5} }});

    const layout = { margin: { l: 15, r: 15, b: 15, t: 15 }, showlegend: false, xaxis: { showgrid: false, zeroline: false, showticklabels: false }, yaxis: { showgrid: false, zeroline: false, showticklabels: false, scaleanchor: 'x', scaleratio: 1 }, plot_bgcolor: 'rgba(0,0,0,0)', paper_bgcolor: 'rgba(0,0,0,0)', hovermode: 'closest' };
    Plotly.react(container, traces, layout, { displayModeBar: false, responsive: true });
}

function getElementColor(elName, alpha = 1) {
    const el = String(elName).toUpperCase();
    if (el.includes('NI')) return `rgba(16, 185, 129, ${alpha})`;      
    if (el.includes('FE')) return `rgba(239, 68, 68, ${alpha})`;       
    if (el.includes('MGO')) return `rgba(14, 165, 233, ${alpha})`;     
    return `rgba(148, 163, 184, ${alpha})`; 
}

function renderGlobalEDA() {
    const el = document.getElementById('dom-global-element').value;
    const c_len = state.coreCols.length;
    let lengths = [], totalMeter = 0, vals = [];

    state.rawData.forEach(r => {
        let len = c_len ? parseFloat(r[c_len]) : (parseFloat(r[state.coreCols.to]) - parseFloat(r[state.coreCols.from]));
        if (!isNaN(len) && len > 0) { lengths.push(len); totalMeter += len; }
        let v = parseFloat(r[el]);
        if (!isNaN(v) && v >= 0) vals.push(v);
    });

    document.getElementById('dom-gl-samples').textContent = vals.length.toLocaleString();
    document.getElementById('dom-gl-length').textContent = lengths.length ? (totalMeter / lengths.length).toFixed(2) : "0";
    document.querySelectorAll('.dom-gl-lbl').forEach(e => e.textContent = el);

    if(vals.length > 0) {
        vals.sort((a,b) => a-b);
        const min = vals[0], max = vals[vals.length-1], mean = vals.reduce((a,b)=>a+b, 0) / vals.length;
        const variance = vals.reduce((a,b)=>a+Math.pow(b-mean,2), 0) / vals.length, stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? (stdDev/mean) : 0;

        document.getElementById('dom-gl-mean').textContent = mean.toFixed(2);
        document.getElementById('dom-gl-minmax').textContent = `${min.toFixed(1)} - ${max.toFixed(1)}`;
        
        const cvEl = document.getElementById('dom-gl-cv');
        cvEl.textContent = cv.toFixed(2);
        cvEl.className = `text-2xl font-black mt-1 ${cv > 1.2 ? 'text-rose-600' : 'text-slate-700'}`;
        
        document.getElementById('dom-gl-cv-bar').style.width = `${Math.min(cv / 2.0 * 100, 100)}%`;
        document.getElementById('dom-gl-cv-bar').style.backgroundColor = cv > 1.2 ? '#e11d48' : '#10b981';
    }

    Chart.defaults.font.family = "'Inter', sans-serif";
    const commonOpt = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} };

    if(domGlobalHist) domGlobalHist.destroy();
    const binCount = 20, step = (vals[vals.length-1] - vals[0]) / binCount;
    let histBins = Array(binCount).fill(0), histLabels = [];
    for(let i=0; i<binCount; i++) histLabels.push(`${(vals[0]+i*step).toFixed(1)}`);
    vals.forEach(v => { let idx = Math.floor((v-vals[0])/step); if(idx>=binCount) idx=binCount-1; histBins[idx]++; });
    
    const elColorBg = getElementColor(el, 0.8);
    const elColorHex = getElementColor(el, 1.0);

    domGlobalHist = new Chart(document.getElementById('dom-chart-hist'), {
        type: 'bar', data: { labels: histLabels, datasets: [{ label: 'Frequency', data: histBins, backgroundColor: elColorBg, borderRadius: 3 }] },
        options: { ...commonOpt, plugins: { title: { display:true, text: `Global Histogram (${el}%)`, font:{size:11} } }, scales: { x: { display: false } } }
    });

    if (typeof Plotly !== 'undefined') {
        const boxContainer = document.getElementById('dom-chart-box-container');
        boxContainer.innerHTML = ''; 
        const plotDiv = document.createElement('div'); plotDiv.className = 'w-full h-full'; boxContainer.appendChild(plotDiv);
        const boxData = [{ x: vals, type: 'box', name: 'Global', marker: {color: elColorHex}, boxpoints: 'outliers', orientation: 'h' }];
        const boxLayout = { margin: { l: 40, r: 20, b: 30, t: 10 }, xaxis: {title: `${el} Grade (%)`, titlefont:{size:10}}, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' };
        Plotly.newPlot(plotDiv, boxData, boxLayout, {responsive: true, displayModeBar: false});
    }
}

function renderGlobalScatter() {
    const xCol = document.getElementById('dom-scatter-x').value;
    const yCol = document.getElementById('dom-scatter-y').value;
    if (!xCol || !yCol) return;

    let scatterPts = [];
    state.rawData.forEach((r) => {
        let x = parseFloat(r[xCol]), y = parseFloat(r[yCol]);
        if(!isNaN(x) && !isNaN(y)) scatterPts.push({x: x, y: y});
    });

    let rgbaBg = 'rgba(148, 163, 184, 0.3)'; 
    let rgbaBorder = 'rgba(148, 163, 184, 0.8)';
    
    const el = String(yCol).toUpperCase();
    if (el.includes('NI')) { rgbaBg = 'rgba(16, 185, 129, 0.3)'; rgbaBorder = 'rgba(16, 185, 129, 0.8)'; }      
    else if (el.includes('FE')) { rgbaBg = 'rgba(239, 68, 68, 0.3)'; rgbaBorder = 'rgba(239, 68, 68, 0.8)'; }  
    else if (el.includes('MGO')) { rgbaBg = 'rgba(14, 165, 233, 0.3)'; rgbaBorder = 'rgba(14, 165, 233, 0.8)'; } 

    if(domGlobalScatter) domGlobalScatter.destroy();
    
    domGlobalScatter = new Chart(document.getElementById('dom-chart-scatter'), {
        type: 'scatter', 
        data: { datasets: [{ label: `${yCol} vs ${xCol}`, data: scatterPts, backgroundColor: rgbaBg, borderColor: rgbaBorder, pointRadius: 2.0, borderWidth: 0.5 }] },
        options: { 
            responsive:true, maintainAspectRatio:false, 
            plugins:{ legend:{display:false}, tooltip: {callbacks: {label: (ctx) => `${xCol}: ${ctx.parsed.x}%, ${yCol}: ${ctx.parsed.y}%`}} }, 
            scales:{ x:{ title:{display:true, text:`${xCol} %`, font:{size:10, weight:'bold'}}, grid: {color: '#f8fafc'} }, y:{ title:{display:true, text:`${yCol} %`, font:{size:10, weight:'bold'}}, grid: {color: '#f8fafc'} } } 
        }
    });
}

function analyzeHangingHoles() {
    const groupedRaw = groupDataByHole(state.rawData, state.coreCols.holeId, state.coreCols.from);
    let hangingHoles = [];
    groupedRaw.forEach((rows, holeId) => {
        if (rows.length === 0) return;
        const eohRow = rows[rows.length - 1];
        let isGantung = false, reason = "";
        const litoCol = state.headers.find(h => h.toLowerCase().includes('lito') || h.toLowerCase().includes('rock'));
        const mgoCol = state.headers.find(h => h.toLowerCase() === 'mgo');
        
        if (litoCol && eohRow[litoCol]) {
            const lito = eohRow[litoCol].toLowerCase();
            if (!lito.includes('bedrock') && !lito.includes('brk')) { isGantung = true; reason = `Litho: ${eohRow[litoCol]}`; }
        } else if (mgoCol) {
            const mgoVal = parseFloat(eohRow[mgoCol]);
            if (!isNaN(mgoVal) && mgoVal < 20) { isGantung = true; reason = `MgO: ${mgoVal}%`; }
        }
        if (isGantung) hangingHoles.push({ hole: holeId, eoh: parseFloat(eohRow[state.coreCols.to]).toFixed(1), reason: reason });
    });

    hangingHoleIds = hangingHoles.map(h => h.hole); 

    const listEl = document.getElementById('dom-hanging-list');
    if (hangingHoles.length === 0) { listEl.innerHTML = `<div class="text-emerald-600 font-bold p-2 bg-emerald-100 rounded text-[10px]">Passed: All drill holes intersected bedrock.</div>`; return; }

    let html = `<p class="text-slate-500 mb-2 text-[9px] font-bold">Detected ${hangingHoles.length} premature EOH (Hanging Holes):</p>`;
    hangingHoles.slice(0, 10).forEach(h => {
        html += `<div class="flex justify-between items-center bg-white border border-rose-100 p-1.5 rounded mb-1.5 text-[10px] shadow-sm"><span class="font-black text-slate-700">${h.hole}</span><span class="text-rose-600 font-mono font-bold">EOH: ${h.eoh}m</span><span class="text-slate-500 bg-slate-50 px-1 rounded">${h.reason}</span></div>`;
    });
    listEl.innerHTML = html;
}

function analyzeGeochemicalAnomalies() {
    const listEl = document.getElementById('dom-anomaly-list');
    let anomalies = { sapNiHigh: 0, brkNiHigh: 0 };
    
    state.rawData.forEach(r => {
        const fe = parseFloat(r.Fe), ni = parseFloat(r.Ni), mgo = parseFloat(r.MgO);
        const hole = r[state.coreCols.holeId];
        if (!isNaN(fe) && !isNaN(ni) && !isNaN(mgo)) {
            let isAnom = false;
            if (mgo > 10 && mgo < 25 && ni > 2.5) { anomalies.sapNiHigh++; isAnom = true; }
            if (mgo > 28 && ni > 1.0) { anomalies.brkNiHigh++; isAnom = true; }
            if (isAnom && !anomalyHoleIds.includes(hole)) anomalyHoleIds.push(hole); 
        }
    });

    let html = '';
    if (anomalies.sapNiHigh > 0) html += `<div class="bg-white border border-amber-100 p-2 rounded mb-2 text-[10px] shadow-sm flex justify-between"><b class="text-amber-800">Supergene Saprolite (>2.5% Ni)</b> <span class="font-mono font-bold">${anomalies.sapNiHigh} spl</span></div>`;
    if (anomalies.brkNiHigh > 0) html += `<div class="bg-white border border-amber-100 p-2 rounded mb-2 text-[10px] shadow-sm flex justify-between"><b class="text-amber-800">Garnierite Bedrock (>1.0% Ni)</b> <span class="font-mono font-bold">${anomalies.brkNiHigh} spl</span></div>`;
    
    if (html === '') html = `<div class="text-emerald-600 font-bold p-2 bg-emerald-100 rounded text-[10px]">Passed: Geochemistry is stable, no extreme outliers detected.</div>`;
    listEl.innerHTML = html;
}

// ==========================================
// PHASE B: RULE-BASED DOMAINING ENGINE
// ==========================================
function autoCalculateDomainParams() {
    if (state.rawData.length === 0) return;
    
    const feValues = state.rawData.map(d => parseFloat(d.Fe)).filter(v => !isNaN(v) && v > 0);
    const mgoValues = state.rawData.map(d => parseFloat(d.MgO)).filter(v => !isNaN(v) && v > 0);

    if (feValues.length && mgoValues.length) {
        const paramFeLim = document.getElementById('param-fe-lim');
        const paramMgOSap = document.getElementById('param-mgo-sap');
        const paramMgOBrk = document.getElementById('param-mgo-brk');
        
        if (paramFeLim) paramFeLim.value = calculatePercentile(feValues, 0.70).toFixed(1);
        if (paramMgOSap) paramMgOSap.value = calculatePercentile(mgoValues, 0.35).toFixed(1);
        if (paramMgOBrk) paramMgOBrk.value = calculatePercentile(mgoValues, 0.85).toFixed(1);

        const paramFeRedLim = document.getElementById('param-fe-redlim');
        const paramMgORocky = document.getElementById('param-mgo-rocky');
        
        if (paramFeRedLim) paramFeRedLim.value = calculatePercentile(feValues, 0.85).toFixed(1);
        if (paramMgORocky) paramMgORocky.value = calculatePercentile(mgoValues, 0.65).toFixed(1);

        window.updateThresholdLines();
        showToast("Auto-Calculation (Percentile) completed successfully.", "success");
    }
}

function applyDomainingParams() {
    showLoader("Processing Engine", "Classifying geological domains...");
    
    setTimeout(() => {
        try {
            state.domainParams.fe_lim_min = parseFloat(document.getElementById('param-fe-lim').value);
            state.domainParams.mgo_sap_min = parseFloat(document.getElementById('param-mgo-sap').value);
            state.domainParams.mgo_brk_min = parseFloat(document.getElementById('param-mgo-brk').value);

            if (typeof state !== 'undefined' && state.sgParams) {
                state.sgParams['LIM'] = parseFloat(document.getElementById('sg-lim').value) || 1.4;
                state.sgParams['SAP'] = parseFloat(document.getElementById('sg-sap').value) || 1.5;
                state.sgParams['BRK'] = parseFloat(document.getElementById('sg-brk').value) || 2.2;
            }

            state.domainedData = runDomaining(state.rawData); 
            
            initPreDomainingEDA();
            
            const btnDl = document.getElementById('btn-download-domain');
            const btnPdf = document.getElementById('btn-print-domain');
            if(btnDl) btnDl.classList.remove('hidden');
            if(btnPdf) btnPdf.classList.remove('hidden');
            
            hideLoader();
            showToast("Geological Classification successful.", "success");
            setTimeout(()=> document.getElementById('dom-post-section').scrollIntoView({behavior: 'smooth'}), 300);
            
        } catch (error) {
            console.error("Error Domaining:", error);
            hideLoader();
            showToast("System failed to process data. Check Console.", "error");
        }
    }, 500);
}

function runDomaining(data) {
    const p = state.domainParams, c_id = state.coreCols.holeId, c_from = state.coreCols.from;
    let domainedResults = [];
    
    const isSubDomainEnabled = document.getElementById('toggle-subdomain') ? document.getElementById('toggle-subdomain').checked : false;
    const isLimSplit = document.getElementById('chk-split-lim') ? document.getElementById('chk-split-lim').checked : false;
    const isSapSplit = document.getElementById('chk-split-sap') ? document.getElementById('chk-split-sap').checked : false;

    const feRedLimMin = document.getElementById('param-fe-redlim') ? parseFloat(document.getElementById('param-fe-redlim').value) : 45;
    const mgoRockyMin = document.getElementById('param-mgo-rocky') ? parseFloat(document.getElementById('param-mgo-rocky').value) : 20;
    
    const feCol = Object.keys(data[0] || {}).find(k => k.toLowerCase() === 'fe');
    const mgoCol = Object.keys(data[0] || {}).find(k => k.toLowerCase() === 'mgo');
    
    const groupedMap = groupDataByHole(data, c_id, c_from);
    
    groupedMap.forEach((holeData) => {
        if (holeData.length === 0) return;
        let currentZone = 'LIM'; 
        
        const processedHole = holeData.map((row) => {
            const fe = feCol ? parseFloat(row[feCol]) : NaN;
            const mgo = mgoCol ? parseFloat(row[mgoCol]) : NaN;
            
            let geoDomain = 'UNCLASSIFIED';
            let finalSubDomain = 'UNCLASSIFIED'; 
            
            if (isNaN(fe) && isNaN(mgo)) {
                geoDomain = 'NO_DATA';
                finalSubDomain = 'NO_DATA';
            } else {
                if (currentZone === 'LIM') {
                    if (!isNaN(mgo) && mgo >= p.mgo_brk_min) currentZone = 'BRK';
                    else if ((!isNaN(fe) && fe < p.fe_lim_min) || (!isNaN(mgo) && mgo >= p.mgo_sap_min)) currentZone = 'SAP';
                } 
                else if (currentZone === 'SAP') {
                    if (!isNaN(mgo) && mgo >= p.mgo_brk_min) currentZone = 'BRK';
                }
                
                geoDomain = currentZone;

                if (isSubDomainEnabled) {
                    if (geoDomain === 'LIM' && isLimSplit) {
                        if (!isNaN(fe) && fe >= feRedLimMin) finalSubDomain = 'RED_LIM';
                        else finalSubDomain = 'YEL_LIM';
                    } 
                    else if (geoDomain === 'SAP' && isSapSplit) {
                        if (!isNaN(mgo) && mgo >= mgoRockyMin) finalSubDomain = 'ROCKY_SAP';
                        else finalSubDomain = 'SOFT_SAP';
                    } 
                    else {
                        finalSubDomain = geoDomain; 
                    }
                } else {
                    finalSubDomain = geoDomain;
                }
            }

            const finalSG = row.SG || state.sgParams[finalSubDomain] || state.sgParams[geoDomain] || 1.0;
            return { ...row, Geo_Domain: finalSubDomain, Base_Domain: geoDomain, SG: finalSG };
        });

        domainedResults.push(...processedHole);
    });
    
    return domainedResults;
}

// ==========================================
// PHASE C: VALIDATION & JUSTIFICATION
// ==========================================
function renderPostDomainingEDA() {
    renderPostDomainingStats();
    renderPostDomainingCharts(); 
    renderMultiPanelScatter();
    renderReconciliationTable();
    generateAIJustification();
}

function renderPostDomainingStats() {
    const tbody = document.getElementById('dom-post-stats-tbody');
    if (!tbody) return;

    const thead = tbody.previousElementSibling;
    if (thead && thead.tagName === 'THEAD') {
        thead.innerHTML = `
            <tr>
                <th class="p-2.5 border-r border-slate-600 font-bold w-32">Facies / Zone</th>
                <th class="p-2.5 border-r border-slate-600 text-center font-bold">Count</th>
                <th class="p-2.5 border-r border-slate-600 font-bold text-amber-300">Classification Rule</th>
                <th class="p-2.5 border-r border-slate-600 text-center font-bold text-emerald-300">Ni (%)</th>
                <th class="p-2.5 border-r border-slate-600 text-center font-bold text-rose-300">Fe (%)</th>
                <th class="p-2.5 text-center font-bold text-blue-300">MgO (%)</th>
            </tr>
        `;
    }

    if (!state.domainedData || state.domainedData.length === 0) return;

    const feLim = state.domainParams.fe_lim_min || 0;
    const mgoSap = state.domainParams.mgo_sap_min || 0;
    const mgoBrk = state.domainParams.mgo_brk_min || 0;
    
    const feRedLimMin = document.getElementById('param-fe-redlim') ? parseFloat(document.getElementById('param-fe-redlim').value) : 45;
    const mgoRockyMin = document.getElementById('param-mgo-rocky') ? parseFloat(document.getElementById('param-mgo-rocky').value) : 20;

    const getRule = (dom) => {
        switch(dom) {
            case 'LIM': return `Fe &ge; ${feLim}%`;
            case 'RED_LIM': return `Fe &ge; ${feRedLimMin}%`;
            case 'YEL_LIM': return `${feLim}% &le; Fe &lt; ${feRedLimMin}%`;
            case 'SAP': return `Fe &lt; ${feLim}% &amp; MgO &ge; ${mgoSap}%`;
            case 'SOFT_SAP': return `SAP base &amp; MgO &lt; ${mgoRockyMin}%`;
            case 'ROCKY_SAP': return `SAP base &amp; MgO &ge; ${mgoRockyMin}%`;
            case 'BRK': return `MgO &ge; ${mgoBrk}%`;
            default: return 'No specific rule';
        }
    };

    const calcMean = (dData, el) => {
        const actualCol = Object.keys(dData[0]).find(k => k.toLowerCase() === el.toLowerCase());
        if (!actualCol) return '-';
        let vals = dData.map(d => parseFloat(d[actualCol])).filter(v => !isNaN(v));
        if(!vals.length) return '-';
        return (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
    };

    const domains = [...new Set(state.domainedData.map(d => d.Geo_Domain))];
    const order = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK', 'UNCLASSIFIED', 'NO_DATA'];
    domains.sort((a, b) => {
        let idxA = order.indexOf(a), idxB = order.indexOf(b);
        if(idxA === -1) idxA = 99; if(idxB === -1) idxB = 99;
        return idxA - idxB;
    });

    let html = '';
    domains.forEach(dom => {
        const dData = state.domainedData.filter(d => d.Geo_Domain === dom);
        if(dData.length === 0) return;
        
        const niMean = calcMean(dData, 'Ni');
        const feMean = calcMean(dData, 'Fe');
        const mgoMean = calcMean(dData, 'MgO');
        const rule = getRule(dom);

        html += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-2.5 border-r border-slate-100 flex items-center gap-2 shadow-[inset_0_0_2px_rgba(0,0,0,0.02)]">
                <span class="w-3 h-3 rounded-full shadow-sm" style="background:${getDomainColor(dom)}"></span> 
                <span class="font-bold text-slate-800 text-[10px] tracking-wide">${dom}</span>
            </td>
            <td class="p-2.5 border-r border-slate-100 text-center font-mono font-medium text-slate-600">${dData.length}</td>
            <td class="p-2.5 border-r border-slate-100 font-mono text-[10px] text-amber-800 bg-amber-50/30 tracking-tight font-semibold shadow-inner">${rule}</td>
            <td class="p-2.5 border-r border-slate-100 text-right font-bold text-emerald-700 font-mono">${niMean}</td>
            <td class="p-2.5 border-r border-slate-100 text-right font-bold text-rose-700 font-mono">${feMean}</td>
            <td class="p-2.5 text-right font-bold text-blue-700 font-mono">${mgoMean}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function renderPostDomainingCharts() {
    const elInput = document.getElementById('dom-post-element').value;
    if (!state.domainedData || state.domainedData.length === 0) return;
    const domains = [...new Set(state.domainedData.map(d => d.Geo_Domain))];
    
    const histWrapper = document.getElementById('dom-hist-wrapper-container');
    const boxContainer = document.getElementById('dom-post-box-container');
    if (!histWrapper || !boxContainer) return;

    const viewMode = document.getElementById('dom-hist-view-mode') ? document.getElementById('dom-hist-view-mode').value : 'overlay';
    const actualCol = Object.keys(state.domainedData[0] || {}).find(k => k.toLowerCase() === elInput.toLowerCase()) || elInput;

    let allVals = [];
    let domainDataMap = {};

    domains.forEach(dom => {
        const vals = state.domainedData.filter(d => d.Geo_Domain === dom).map(d => parseFloat(d[actualCol])).filter(v => !isNaN(v));
        if(vals.length > 0) { domainDataMap[dom] = vals; allVals.push(...vals); }
    });

    if (allVals.length === 0) return;

    const minVal = Math.floor(Math.min(...allVals)), maxVal = Math.ceil(Math.max(...allVals));
    const hexToRgbA = (hex, alpha) => {
        if (!hex || hex === 'none') return `rgba(148, 163, 184, ${alpha})`;
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    histWrapper.innerHTML = ''; boxContainer.innerHTML = '';

    if (viewMode === 'overlay') {
        const step = (maxVal - minVal) / 40;
        let histData = [], boxData = [];

        domains.forEach(dom => {
            if (!domainDataMap[dom]) return;
            const vals = domainDataMap[dom], colorHex = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';
            histData.push({ x: vals, type: 'histogram', name: dom, opacity: 0.65, marker: { color: colorHex, line: { color: colorHex, width: 1.5 } }, xbins: { start: minVal, end: maxVal, size: step } });
            boxData.push({ x: vals, y: Array(vals.length).fill(dom), type: 'box', orientation: 'h', name: dom, marker: { color: colorHex, size: 3, opacity: 0.6 }, line: { width: 1.5 }, boxpoints: 'outliers' });
        });

        const histDiv = document.createElement('div'); histDiv.className = 'w-full h-full absolute inset-0'; histWrapper.appendChild(histDiv);
        const boxDiv = document.createElement('div'); boxDiv.className = 'w-full h-full absolute inset-0'; boxContainer.appendChild(boxDiv);

        const commonMargin = { l: 80, r: 25 }, commonXAxis = { range: [minVal, maxVal + (step * 2)], gridcolor: '#e2e8f0', zeroline: false, tickfont: { size: 10, color: '#64748b', weight: 'bold' } };
        const histLayout = { barmode: 'overlay', margin: { ...commonMargin, b: 20, t: 30 }, xaxis: { ...commonXAxis, showticklabels: true }, yaxis: { title: 'Frequency', titlefont: { size: 10, color: '#64748b' }, gridcolor: '#f1f5f9' }, showlegend: true, legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: {size: 10, weight: 'bold'} }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' };
        const boxLayout = { margin: { ...commonMargin, b: 30, t: 5 }, xaxis: { ...commonXAxis, title: `${elInput} Grade`, titlefont: { size: 10, color: '#64748b', weight: 'bold' } }, yaxis: { autorange: 'reversed', tickfont: { size: 10, weight: 'bold' } }, showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' };

        Plotly.newPlot(histDiv, histData, histLayout, { responsive: true, displayModeBar: false });
        Plotly.newPlot(boxDiv, boxData, boxLayout, { responsive: true, displayModeBar: false });

    } else {
        const binCount = viewMode === 'stepped' ? 30 : 20, step = (maxVal - minVal) / binCount;
        let labels = []; for (let i = 0; i <= binCount; i++) labels.push((minVal + (i * step)).toFixed(2));
        let histDatasets = [], boxData = [];

        domains.forEach(dom => {
            if (!domainDataMap[dom]) return;
            const vals = domainDataMap[dom], colorHex = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';
            let bins = Array(binCount).fill(0);
            vals.forEach(v => { let idx = Math.floor((v - minVal) / step); if (idx >= binCount) idx = binCount - 1; if (idx < 0) idx = 0; bins[idx]++; });

            if (viewMode === 'stepped') {
                histDatasets.push({ label: dom, data: bins, backgroundColor: hexToRgbA(colorHex, 0.5), borderColor: colorHex, borderWidth: 1.5, type: 'bar', barPercentage: 1.0, categoryPercentage: 1.0, hoverBackgroundColor: hexToRgbA(colorHex, 0.8) });
            } else {
                histDatasets.push({ label: dom, data: bins, backgroundColor: hexToRgbA(colorHex, 0.4), borderColor: colorHex, borderWidth: 2, fill: true, tension: 0.4, type: 'line' });
            }
            boxData.push({ x: vals, y: Array(vals.length).fill(dom), type: 'box', orientation: 'h', name: dom, marker: { color: colorHex, size: 3, opacity: 0.6 }, line: { width: 1.5 }, boxpoints: 'outliers' });
        });

        const canvas = document.createElement('canvas'); canvas.id = 'dom-post-hist'; histWrapper.appendChild(canvas);
        if (domPostHist) domPostHist.destroy();
        domPostHist = new Chart(canvas, { type: viewMode === 'stepped' ? 'bar' : 'line', data: { labels: labels, datasets: histDatasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' }, usePointStyle: true } } }, scales: { x: { display: viewMode === 'stepped', ticks: { font: { size: 9, weight: 'bold' }, color: '#64748b', maxTicksLimit: 10 }, grid: { display: false } }, y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 9 } } } } } });

        const boxDiv = document.createElement('div'); boxDiv.className = 'w-full h-full absolute inset-0'; boxContainer.appendChild(boxDiv);
        const boxLayout = { margin: { l: 80, r: 20, b: 30, t: 10 }, xaxis: { title: `${elInput} Grade`, titlefont: { size: 10, color: '#64748b' } }, showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', yaxis: { autorange: 'reversed' } };
        if (viewMode === 'stepped') { boxLayout.margin = { l: 80, r: 25, b: 30, t: 5 }; boxLayout.xaxis.range = [minVal, maxVal + (step * 2)]; }
        Plotly.newPlot(boxDiv, boxData, boxLayout, { responsive: true, displayModeBar: false });
    }
}

function generateConfidenceEllipse(xVals, yVals, color, xaxis, yaxis) {
    if(xVals.length < 5) return null; 
    
    const meanX = xVals.reduce((a,b)=>a+b,0)/xVals.length;
    const meanY = yVals.reduce((a,b)=>a+b,0)/yVals.length;
    const stdX = Math.sqrt(xVals.reduce((a,b)=>a+Math.pow(b-meanX,2),0)/xVals.length);
    const stdY = Math.sqrt(yVals.reduce((a,b)=>a+Math.pow(b-meanY,2),0)/yVals.length);

    let cov = 0;
    for(let i=0; i<xVals.length; i++) cov += (xVals[i]-meanX)*(yVals[i]-meanY);
    cov /= xVals.length;

    const varX = stdX*stdX; const varY = stdY*stdY;
    const trace = varX + varY;
    const det = varX*varY - cov*cov;
    const l1 = (trace + Math.sqrt(trace*trace - 4*det)) / 2;
    const l2 = (trace - Math.sqrt(trace*trace - 4*det)) / 2;
    const angle = Math.atan2(l1 - varX, cov);

    const scale = 2.4477;
    const a = Math.sqrt(l1) * scale;
    const b = Math.sqrt(l2) * scale;

    let ex = [], ey = [];
    for (let i = 0; i <= 100; i++) {
        let t = i * 2 * Math.PI / 100;
        let xt = a * Math.cos(t);
        let yt = b * Math.sin(t);
        ex.push(meanX + xt*Math.cos(angle) - yt*Math.sin(angle));
        ey.push(meanY + xt*Math.sin(angle) + yt*Math.cos(angle));
    }

    return {
        x: ex, y: ey, mode: 'lines', type: 'scatter', name: '95% Confidence',
        line: { color: color, width: 2, dash: 'dashdot' },
        xaxis: xaxis, yaxis: yaxis, hoverinfo: 'none'
    };
}

function renderMultiPanelScatter() {
    if (typeof Plotly === 'undefined') return;
    const feCol = state.headers.find(h => h.toLowerCase() === 'fe'), mgoCol = state.headers.find(h => h.toLowerCase() === 'mgo');
    if (!feCol || !mgoCol) return;

    let traces = [];
    ['LIM', 'SAP', 'BRK'].forEach((domain, idx) => {
        const domData = state.domainedData.filter(d => (d.Base_Domain === domain || d.Geo_Domain === domain) && parseFloat(d[mgoCol])>0 && parseFloat(d[feCol])>0);
        
        const x = domData.map(r => parseFloat(r[mgoCol])), y = domData.map(r => parseFloat(r[feCol]));
        const xFull = domData.map(r => parseFloat(r[mgoCol])), yFull = domData.map(r => parseFloat(r[feCol]));
        const axesMap = ['', '2', '3'];
        
        traces.push({
            x, y, mode: 'markers', type: 'scatter', name: domain,
            marker: { size: 2.5, color: getDomainColor(domain), opacity: 0.5 }, 
            xaxis: `x${axesMap[idx]}`, yaxis: `y${axesMap[idx]}`
        });

        const ellipseTrace = generateConfidenceEllipse(xFull, yFull, '#ef4444', `x${axesMap[idx]}`, `y${axesMap[idx]}`);
        if(ellipseTrace) traces.push(ellipseTrace);
    });

    const layout = {
        margin: { l: 45, r: 15, b: 40, t: 35 }, showlegend: false,
        grid: { rows: 1, columns: 3, pattern: 'independent' },
        xaxis:  { title: 'MgO (%)', titlefont:{size:10, color:'#64748b'}, domain: [0, 0.28], gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' }, 
        yaxis:  { title: 'Fe (%)', titlefont:{size:10, color:'#64748b'}, gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' },
        xaxis2: { title: 'MgO (%)', titlefont:{size:10, color:'#64748b'}, domain: [0.36, 0.64], gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' }, 
        yaxis2: { title: 'Fe (%)', titlefont:{size:10, color:'#64748b'}, anchor: 'x2', gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' }, 
        xaxis3: { title: 'MgO (%)', titlefont:{size:10, color:'#64748b'}, domain: [0.72, 1.0], gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' }, 
        yaxis3: { title: 'Fe (%)', titlefont:{size:10, color:'#64748b'}, anchor: 'x3', gridcolor:'#f1f5f9', zerolinecolor: '#e2e8f0' },
        annotations: [
            { text: "LIMONITE", font: {size: 11, weight:'bold', color: getDomainColor('LIM')}, showarrow: false, xref: 'x domain', yref: 'paper', x: 0.5, y: 1.08 },
            { text: "SAPROLITE", font: {size: 11, weight:'bold', color: getDomainColor('SAP')}, showarrow: false, xref: 'x2 domain', yref: 'paper', x: 0.5, y: 1.08 },
            { text: "BEDROCK", font: {size: 11, weight:'bold', color: getDomainColor('BRK')}, showarrow: false, xref: 'x3 domain', yref: 'paper', x: 0.5, y: 1.08 }
        ],
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)'
    };
    
    Plotly.react('dom-post-scatter', traces, layout, { responsive: true, displayModeBar: false }).then(() => {
        window.updateThresholdLines(); 
    });
}

window.updateThresholdLines = function() {
    const scatterDiv = document.getElementById('dom-post-scatter');
    if (!scatterDiv || !scatterDiv.data) return;

    const feLim = parseFloat(document.getElementById('param-fe-lim').value) || 0;
    const mgoSap = parseFloat(document.getElementById('param-mgo-sap').value) || 0;
    const mgoBrk = parseFloat(document.getElementById('param-mgo-brk').value) || 0;

    const shapes = [
        { type: 'line', xref: 'x domain', yref: 'y', x0: 0, x1: 1, y0: feLim, y1: feLim, line: { color: '#ef4444', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x2 domain', yref: 'y2', x0: 0, x1: 1, y0: feLim, y1: feLim, line: { color: '#ef4444', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x3 domain', yref: 'y3', x0: 0, x1: 1, y0: feLim, y1: feLim, line: { color: '#ef4444', width: 1.5, dash: 'dash' } },
        
        { type: 'line', xref: 'x', yref: 'y domain', x0: mgoSap, x1: mgoSap, y0: 0, y1: 1, line: { color: '#10b981', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x2', yref: 'y2 domain', x0: mgoSap, x1: mgoSap, y0: 0, y1: 1, line: { color: '#10b981', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x3', yref: 'y3 domain', x0: mgoSap, x1: mgoSap, y0: 0, y1: 1, line: { color: '#10b981', width: 1.5, dash: 'dash' } },
        
        { type: 'line', xref: 'x', yref: 'y domain', x0: mgoBrk, x1: mgoBrk, y0: 0, y1: 1, line: { color: '#64748b', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x2', yref: 'y2 domain', x0: mgoBrk, x1: mgoBrk, y0: 0, y1: 1, line: { color: '#64748b', width: 1.5, dash: 'dash' } },
        { type: 'line', xref: 'x3', yref: 'y3 domain', x0: mgoBrk, x1: mgoBrk, y0: 0, y1: 1, line: { color: '#64748b', width: 1.5, dash: 'dash' } }
    ];

    Plotly.relayout(scatterDiv, { shapes: shapes });
};

function generateAIJustification() {
    const method = document.getElementById('dom-method-select') ? document.getElementById('dom-method-select').value : 'univariate';
    const methodText = method === 'multivariate' 
        ? '<b>Multivariate Machine Learning</b> dynamically established the boundaries' 
        : '<b>Univariate Percentile / Manual limits</b> defined the boundaries';

    let html = `<p class="mb-2 text-[10px] text-slate-600 leading-relaxed">The system has validated the hard-boundary separation. ${methodText} based on empirical geochemical variances. Below is the domain justification:</p>
    <ul class="list-none space-y-2">`;

    const domains = [...new Set(state.domainedData.map(d => d.Geo_Domain))];

    domains.forEach(dom => {
        const domData = state.domainedData.filter(d => d.Geo_Domain === dom);
        if(domData.length === 0) return;

        const niVals = domData.map(d => parseFloat(d.Ni)).filter(v => !isNaN(v));
        const feVals = domData.map(d => parseFloat(d.Fe)).filter(v => !isNaN(v));
        
        const niMean = niVals.length > 0 ? niVals.reduce((a,b)=>a+b,0)/niVals.length : 0;
        const feMean = feVals.length > 0 ? feVals.reduce((a,b)=>a+b,0)/feVals.length : 0;
        
        const niStd = niVals.length > 0 ? Math.sqrt(niVals.reduce((a,b)=>a+Math.pow(b-niMean,2),0)/niVals.length) : 0;
        const niCv = niMean > 0 ? niStd/niMean : 0;

        let color = getDomainColor(dom);
        let desc = '';

        if (dom.includes('LIM')) {
            desc = `Population yields an actual average Fe of <span class="font-black text-slate-800">${feMean.toFixed(1)}%</span> and Ni of <span class="font-black text-slate-800">${niMean.toFixed(2)}%</span>. ${feMean >= 35 ? 'Indicates a mature Limonite profile (Iron Capping) suitable for HPAL.' : '<span class="text-rose-600 font-bold">Warning: Fe average is low. Check for silica dilution or transitional zones.</span>'}`;
        } else if (dom.includes('SAP')) {
            desc = `The target Ni grade averages <span class="font-black text-slate-800">${niMean.toFixed(2)}%</span> with a Coefficient of Variation (CV) of <b>${niCv.toFixed(2)}</b>. ${niCv > 1.2 ? '<br><span class="inline-block mt-1 text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded shadow-sm text-[9px]">⚠️ Top-Cut Required: High nugget effect detected, risk of over-estimation.</span>' : 'Grade distribution is strictly homogeneous (CV < 1.2), safe for Ordinary Kriging (OK).'}`;
        } else if (dom === 'BRK') {
            desc = `Ni back-check evaluation shows an average of <span class="font-black text-slate-800">${niMean.toFixed(2)}%</span>. Validating the successful separation of the basal waste zone (protolith).`;
        } else {
            desc = `Domain average Ni: ${niMean.toFixed(2)}%, Fe: ${feMean.toFixed(1)}%, CV: ${niCv.toFixed(2)}.`;
        }

        html += `<li class="bg-white p-2.5 rounded border border-slate-200 shadow-sm text-[10px]"><b style="color:${color}" class="flex items-center gap-1.5 mb-1"><span class="w-2.5 h-2.5 rounded shadow-sm" style="background:${color}"></span> ${dom} Domain:</b> ${desc}</li>`;
    });

    html += `</ul>`;
    document.getElementById('dom-justification-text').innerHTML = html;
}

// --- FITUR BARU: DYNAMIC PARAMETER & CENTROID TABLE ---
function renderReconciliationTable() {
    const tbody = document.getElementById('dom-reconciliation-tbody');
    if (!tbody || !state.domainedData || state.domainedData.length === 0) return;

    const table = tbody.closest('table');
    const method = document.getElementById('dom-method-select') ? document.getElementById('dom-method-select').value : 'univariate';

    // Mengubah judul header tabel yang ada di HTML secara dinamis
    const cardContainer = table.closest('.bg-white.border');
    if (cardContainer) {
        const titleEl = cardContainer.querySelector('h3, .font-black');
        const descEl = cardContainer.querySelector('p');
        const selectFilter = cardContainer.querySelector('select'); 
        
        // Sembunyikan elemen dropdown Field Logging yang sudah tidak dipakai
        if (selectFilter) {
            selectFilter.style.display = 'none'; 
            const labelNode = selectFilter.previousElementSibling;
            if(labelNode) labelNode.style.display = 'none';
        }

        if (method === 'univariate') {
            if (titleEl) titleEl.innerHTML = `<i data-lucide="bar-chart-2" class="w-4 h-4 text-indigo-600 inline mr-1"></i> DOMAIN PERCENTILES (UNIVARIATE VALIDATION)`;
            if (descEl) descEl.innerHTML = `Internal statistical distribution (percentiles) of each classified domain. Use this to validate your manual cut-off inputs.`;
        } else {
            if (titleEl) titleEl.innerHTML = `<i data-lucide="cpu" class="w-4 h-4 text-indigo-600 inline mr-1"></i> MULTIVARIATE CENTROIDS`;
            if (descEl) descEl.innerHTML = `Coordinates of natural geological boundaries generated by the Unsupervised K-Means Machine Learning algorithm.`;
        }
    }

    const domains = [...new Set(state.domainedData.map(d => d.Geo_Domain))];
    const order = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK', 'UNCLASSIFIED'];
    domains.sort((a, b) => {
        let idxA = order.indexOf(a), idxB = order.indexOf(b);
        if(idxA === -1) idxA = 99; if(idxB === -1) idxB = 99;
        return idxA - idxB;
    });

    if (method === 'univariate') {
        const getP = (arr, p) => arr.length ? calculatePercentile(arr, p).toFixed(2) : '-';

        let html = `
            <thead class="bg-[#0f172a] text-slate-200 text-[11px] tracking-wider">
                <tr>
                    <th class="p-3 border-r border-slate-700 text-left uppercase text-[10px]">Facies / Domain</th>
                    <th class="p-3 border-r border-slate-700 text-left uppercase text-[10px]">Element</th>
                    <th class="p-3 border-r border-slate-700 uppercase text-[10px]">Min</th>
                    <th class="p-3 border-r border-slate-700 text-teal-400 font-bold">P25</th>
                    <th class="p-3 border-r border-slate-700 text-amber-400 font-bold">P50 (Median)</th>
                    <th class="p-3 border-r border-slate-700 text-rose-400 font-bold">P75</th>
                    <th class="p-3 border-r border-slate-700 text-purple-400 font-bold">P90</th>
                    <th class="p-3 uppercase text-[10px]">Max</th>
                </tr>
            </thead>
            <tbody id="dom-reconciliation-tbody" class="bg-white divide-y divide-slate-100 text-xs font-mono font-medium text-center">
        `;

        domains.forEach(dom => {
            if (dom === 'NO_DATA') return;
            const dData = state.domainedData.filter(d => d.Geo_Domain === dom);
            if(dData.length === 0) return;

            const niVals = dData.map(d => parseFloat(d.Ni)).filter(v => !isNaN(v));
            const feVals = dData.map(d => parseFloat(d.Fe)).filter(v => !isNaN(v));
            const mgoVals = dData.map(d => parseFloat(d.MgO)).filter(v => !isNaN(v));

            const color = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';

            html += `
                <tr class="hover:bg-slate-50 transition-colors border-t-2 border-slate-200">
                    <td rowspan="3" class="p-2.5 border-r border-slate-200 text-left align-top bg-slate-50">
                        <span class="inline-flex items-center gap-1.5 font-bold tracking-widest text-[10px] uppercase" style="color: ${color}">
                            <span class="w-2.5 h-2.5 rounded shadow-sm" style="background: ${color}"></span> ${dom}
                        </span>
                        <div class="mt-1.5 text-[9px] text-slate-400 font-sans font-bold bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm w-max">N = ${dData.length}</div>
                    </td>
                    <td class="p-2.5 font-bold text-emerald-600 border-r border-slate-100 text-left bg-slate-50/50">Ni %</td>
                    <td class="p-2.5 border-r border-slate-100">${getP(niVals, 0)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-teal-600">${getP(niVals, 0.25)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-amber-600 font-bold">${getP(niVals, 0.50)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-rose-600">${getP(niVals, 0.75)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-purple-600 font-bold">${getP(niVals, 0.90)}</td>
                    <td class="p-2.5">${getP(niVals, 1)}</td>
                </tr>
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-bold text-rose-600 border-r border-slate-100 text-left bg-slate-50/50">Fe %</td>
                    <td class="p-2.5 border-r border-slate-100">${getP(feVals, 0)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-teal-600">${getP(feVals, 0.25)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-amber-600 font-bold">${getP(feVals, 0.50)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-rose-600">${getP(feVals, 0.75)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-purple-600 font-bold">${getP(feVals, 0.90)}</td>
                    <td class="p-2.5">${getP(feVals, 1)}</td>
                </tr>
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-bold text-blue-600 border-r border-slate-100 text-left bg-slate-50/50">MgO %</td>
                    <td class="p-2.5 border-r border-slate-100">${getP(mgoVals, 0)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-teal-600">${getP(mgoVals, 0.25)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-amber-600 font-bold">${getP(mgoVals, 0.50)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-rose-600">${getP(mgoVals, 0.75)}</td>
                    <td class="p-2.5 border-r border-slate-100 text-purple-600 font-bold">${getP(mgoVals, 0.90)}</td>
                    <td class="p-2.5">${getP(mgoVals, 1)}</td>
                </tr>
            `;
        });

        html += `</tbody>`;
        table.innerHTML = html;

    } else {
        // --- TABEL 2: MULTIVARIATE (K-MEANS CENTROID) ---
        let isComputed = !!state.kmeansCentroids;

        table.innerHTML = `
            <thead class="bg-[#0f172a] text-slate-200 text-[11px] tracking-wider">
                <tr>
                    <th class="p-3 border-r border-slate-700 text-left uppercase text-[10px]">Algorithmic Cluster</th>
                    <th class="p-3 border-r border-slate-700 text-emerald-400 font-bold text-[10px]">Ni Centroid Avg</th>
                    <th class="p-3 border-r border-slate-700 text-rose-400 font-bold text-[10px]">Fe Centroid Avg</th>
                    <th class="p-3 border-r border-slate-700 text-blue-400 font-bold text-[10px]">MgO Centroid Avg</th>
                    <th class="p-3 text-slate-400 font-bold uppercase text-[10px]">Algorithmic Derivation Rule</th>
                </tr>
            </thead>
            <tbody id="dom-reconciliation-tbody" class="bg-white divide-y divide-slate-100 text-xs font-mono font-medium text-center">
        `;

        if (!isComputed) {
            table.innerHTML += `<tr><td colspan="5" class="p-6 text-slate-400 italic font-bold">Awaiting Data. Please run Multivariate Machine Learning and click 'Cut & Classify'.</td></tr></tbody>`;
        } else {
            let html = '';
            
            domains.forEach(dom => {
                if (dom === 'NO_DATA') return;
                const dData = state.domainedData.filter(d => d.Geo_Domain === dom);
                if(dData.length === 0) return;

                const getMean = (arr) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : '-';
                
                const niVals = dData.map(d => parseFloat(d.Ni)).filter(v => !isNaN(v));
                const feVals = dData.map(d => parseFloat(d.Fe)).filter(v => !isNaN(v));
                const mgoVals = dData.map(d => parseFloat(d.MgO)).filter(v => !isNaN(v));
                
                const color = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';

                let derivation = '';
                if(dom === 'LIM') derivation = 'Primary Centroid 1';
                else if(dom === 'SAP') derivation = 'Primary Centroid 2';
                else if(dom === 'BRK') derivation = 'Primary Centroid 3';
                else if(dom === 'RED_LIM') derivation = 'Sub-cut: Fe &ge; LIM Centroid';
                else if(dom === 'YEL_LIM') derivation = 'Sub-cut: Fe &lt; LIM Centroid';
                else if(dom === 'ROCKY_SAP') derivation = 'Sub-cut: MgO Vector Gap > 30%';
                else if(dom === 'SOFT_SAP') derivation = 'Sub-cut: MgO Vector Gap < 30%';
                else derivation = 'Unclassified Pattern';

                html += `
                    <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                        <td class="p-2.5 border-r border-slate-200 text-left bg-slate-50">
                            <span class="inline-flex items-center gap-1.5 font-bold tracking-widest text-[10px] uppercase" style="color: ${color}">
                                <span class="w-2.5 h-2.5 rounded shadow-sm" style="background: ${color}"></span> ${dom}
                            </span>
                            <span class="ml-2 text-[9px] text-slate-400 font-sans">N=${dData.length}</span>
                        </td>
                        <td class="p-2.5 border-r border-slate-100 text-slate-800 font-bold">${getMean(niVals)}%</td>
                        <td class="p-2.5 border-r border-slate-100 text-rose-700 font-bold">${getMean(feVals)}%</td>
                        <td class="p-2.5 border-r border-slate-100 text-blue-700 font-bold">${getMean(mgoVals)}%</td>
                        <td class="p-2.5 text-slate-500 text-[9px] font-sans font-bold tracking-tight bg-slate-50/50">${derivation}</td>
                    </tr>
                `;
            });
            table.innerHTML += html + `</tbody>`;
        }
    }

    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function downloadDomainedData() {
    if (!state.domainedData || state.domainedData.length === 0) { 
        showToast("No domained data available.", "warning"); return; 
    }
    const BOM = "\uFEFF";
    const baseHeaders = Object.keys(state.domainedData[0]).filter(h => h !== 'Geo_Domain' && h !== 'Base_Domain');
    const headers = [...baseHeaders, 'Base_Domain', 'Geo_Domain']; 
    
    const csvContent = [
        headers.join(','), 
        ...state.domainedData.map(row => headers.map(h => `"${row[h] !== undefined ? row[h] : ''}"`).join(','))
    ].join('\r\n');
    
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `NiCore_Domained_Database.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast("Classified database downloaded successfully.", "success");
}

// ==========================================
// SMART ROUTER & HELPER
// ==========================================

function getActualColumnName(dataRow, possibleNames) {
    if (!dataRow) return null;
    const keys = Object.keys(dataRow);
    for (let k of keys) {
        if (possibleNames.includes(k.toLowerCase().trim())) return k;
    }
    for (let k of keys) {
        if (possibleNames.some(name => k.toLowerCase().includes(name))) return k;
    }
    return null;
}

window.toggleDomainingMethodUI = function() {
    const method = document.getElementById('dom-method-select').value;
    const btn = document.getElementById('btn-run-smart-dom');
    const desc = document.getElementById('dom-method-desc');

    const inputFeLim = document.getElementById('param-fe-lim');
    const inputMgoSap = document.getElementById('param-mgo-sap');
    const inputMgoBrk = document.getElementById('param-mgo-brk');
    const cutoffContainer = inputFeLim ? inputFeLim.closest('.grid') : null;
    
    if (method === 'univariate') {
        btn.innerHTML = '<i data-lucide="line-chart" class="w-3.5 h-3.5"></i> AUTO-FIT PERCENTILES';
        btn.className = "w-full mt-3 bg-slate-800 hover:bg-slate-900 text-teal-400 py-2.5 rounded-lg font-black text-xs shadow-md transition-all border border-slate-700 flex justify-center items-center gap-2";
        desc.innerHTML = 'Uses percentile thresholds (P70, P40, P80) for rigid single-element boundaries. Edit values manually or use Auto-Fit.';

        if(inputFeLim) { inputFeLim.readOnly = false; inputFeLim.classList.remove('bg-slate-100', 'text-slate-500'); }
        if(inputMgoSap) { inputMgoSap.readOnly = false; inputMgoSap.classList.remove('bg-slate-100', 'text-slate-500'); }
        if(inputMgoBrk) { inputMgoBrk.readOnly = false; inputMgoBrk.classList.remove('bg-slate-100', 'text-slate-500'); }
        if(cutoffContainer) cutoffContainer.classList.remove('opacity-70', 'pointer-events-none');
    } else {
        btn.innerHTML = '<i data-lucide="cpu" class="w-3.5 h-3.5"></i> RUN K-MEANS CLUSTERING';
        btn.className = "w-full mt-3 bg-indigo-900 hover:bg-indigo-950 text-indigo-300 py-2.5 rounded-lg font-black text-xs shadow-md transition-all border border-indigo-700 flex justify-center items-center gap-2";
        desc.innerHTML = 'Unsupervised Machine Learning dynamically maps 3D centroids (Fe, Ni, MgO) to find natural boundaries. <b>Cut-offs are locked and auto-generated.</b>';

        if(inputFeLim) { inputFeLim.readOnly = true; inputFeLim.classList.add('bg-slate-100', 'text-slate-500'); }
        if(inputMgoSap) { inputMgoSap.readOnly = true; inputMgoSap.classList.add('bg-slate-100', 'text-slate-500'); }
        if(inputMgoBrk) { inputMgoBrk.readOnly = true; inputMgoBrk.classList.add('bg-slate-100', 'text-slate-500'); }
        if(cutoffContainer) cutoffContainer.classList.add('opacity-70', 'pointer-events-none');
    }
    
    // PEMICU DINAMIS: Ubah wujud tabel di bawah seketika saat dropdown dipilih!
    if (typeof renderReconciliationTable === 'function') renderReconciliationTable();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.executeSmartDomaining = function() {
    const method = document.getElementById('dom-method-select');
    if (!method) return;
    
    if (method.value === 'univariate') {
        if (typeof autoCalculateDomainParams === 'function') {
            autoCalculateDomainParams();
        }
    } else if (method.value === 'multivariate') {
        if (typeof window.runMultivariateKMeans === 'function') {
            window.runMultivariateKMeans();
        }
    }
};

window.runMultivariateKMeans = function() {
    if (!state.rawData || state.rawData.length === 0) return;
    
    if(typeof showLoader === 'function') showLoader("Processing Geostatistical Clusters...", "Running Unsupervised Machine Learning algorithm over 3D dimensions...");

    setTimeout(() => {
        const sampleRow = state.rawData[0];
        const colFe = getActualColumnName(sampleRow, ['fe', 'fe_pct']);
        const colNi = getActualColumnName(sampleRow, ['ni', 'ni_pct']);
        const colMgO = getActualColumnName(sampleRow, ['mgo', 'mgo_pct']);

        if (!colFe || !colNi || !colMgO) {
            if(typeof hideLoader === 'function') hideLoader();
            if(typeof showToast === 'function') showToast("Required elements (Fe, Ni, MgO) not found!", "error");
            return;
        }

        let validData = [];
        state.rawData.forEach(row => {
            let fe = parseFloat(row[colFe]);
            let ni = parseFloat(row[colNi]);
            let mgo = parseFloat(row[colMgO]);
            if (!isNaN(fe) && !isNaN(ni) && !isNaN(mgo)) {
                validData.push({ fe, ni, mgo });
            }
        });

        if (validData.length < 10) {
            if(typeof hideLoader === 'function') hideLoader();
            return;
        }

        let means = { fe: 0, ni: 0, mgo: 0 };
        let stdDevs = { fe: 0, ni: 0, mgo: 0 };
        let N = validData.length;

        validData.forEach(d => { means.fe += d.fe; means.ni += d.ni; means.mgo += d.mgo; });
        means.fe /= N; means.ni /= N; means.mgo /= N;

        validData.forEach(d => {
            stdDevs.fe += Math.pow(d.fe - means.fe, 2);
            stdDevs.ni += Math.pow(d.ni - means.ni, 2);
            stdDevs.mgo += Math.pow(d.mgo - means.mgo, 2);
        });
        stdDevs.fe = Math.sqrt(stdDevs.fe / N);
        stdDevs.ni = Math.sqrt(stdDevs.ni / N);
        stdDevs.mgo = Math.sqrt(stdDevs.mgo / N);

        let normData = validData.map(d => ({
            fe: (d.fe - means.fe) / (stdDevs.fe || 1),
            ni: (d.ni - means.ni) / (stdDevs.ni || 1),
            mgo: (d.mgo - means.mgo) / (stdDevs.mgo || 1)
        }));

        let cLim = normData.reduce((prev, curr) => (curr.fe > prev.fe && curr.mgo < prev.mgo) ? curr : prev, normData[0]);
        let cBrk = normData.reduce((prev, curr) => (curr.mgo > prev.mgo) ? curr : prev, normData[0]);
        let cSap = normData.reduce((prev, curr) => (curr.ni > prev.ni && curr.mgo < cBrk.mgo && curr.fe < cLim.fe) ? curr : prev, normData[0]);

        let k = 3;
        let centroids = [ { ...cLim }, { ...cSap }, { ...cBrk } ];

        let clusters = new Array(N).fill(-1);
        let hasChanged = true;

        for (let iter = 0; iter < 50 && hasChanged; iter++) {
            hasChanged = false;
            for (let i = 0; i < N; i++) {
                let p = normData[i];
                let minDist = Infinity;
                let bestCluster = -1;
                for (let c = 0; c < k; c++) {
                    let d = Math.pow(p.fe - centroids[c].fe, 2) + Math.pow(p.ni - centroids[c].ni, 2) + Math.pow(p.mgo - centroids[c].mgo, 2);
                    if (d < minDist) { minDist = d; bestCluster = c; }
                }
                if (clusters[i] !== bestCluster) { clusters[i] = bestCluster; hasChanged = true; }
            }

            let newCentroids = Array(k).fill(null).map(() => ({ fe: 0, ni: 0, mgo: 0, count: 0 }));
            for (let i = 0; i < N; i++) {
                let c = clusters[i];
                newCentroids[c].fe += normData[i].fe; newCentroids[c].ni += normData[i].ni; newCentroids[c].mgo += normData[i].mgo; newCentroids[c].count++;
            }
            for (let c = 0; c < k; c++) {
                if (newCentroids[c].count > 0) {
                    centroids[c].fe = newCentroids[c].fe / newCentroids[c].count;
                    centroids[c].ni = newCentroids[c].ni / newCentroids[c].count;
                    centroids[c].mgo = newCentroids[c].mgo / newCentroids[c].count;
                }
            }
        }

        let realCentroids = centroids.map((c, i) => ({
            id: i, 
            fe: (c.fe * stdDevs.fe) + means.fe, 
            ni: (c.ni * stdDevs.ni) + means.ni, // PASTIKAN NI TERBACA
            mgo: (c.mgo * stdDevs.mgo) + means.mgo
        }));

        realCentroids.sort((a, b) => b.fe - a.fe); 
        let limCentroid = realCentroids[0];
        let sapCentroid, brkCentroid;
        
        if (realCentroids[1].mgo > realCentroids[2].mgo) {
            brkCentroid = realCentroids[1];
            sapCentroid = realCentroids[2];
        } else {
            brkCentroid = realCentroids[2];
            sapCentroid = realCentroids[1];
        }

        let cutFeLim = (limCentroid.fe + sapCentroid.fe) / 2;
        let cutMgoBrk = (sapCentroid.mgo + brkCentroid.mgo) / 2;
        let cutMgoSap = Math.min(sapCentroid.mgo, (limCentroid.mgo + sapCentroid.mgo) / 2); 

        let cutFeRedLim = limCentroid.fe; 
        let cutMgoRocky = sapCentroid.mgo + ((brkCentroid.mgo - sapCentroid.mgo) * 0.3);

        const paramFeLim = document.getElementById('param-fe-lim');
        const paramMgoSap = document.getElementById('param-mgo-sap');
        const paramMgoBrk = document.getElementById('param-mgo-brk');
        
        if (paramFeLim) paramFeLim.value = cutFeLim.toFixed(1);
        if (paramMgoSap) paramMgoSap.value = cutMgoSap.toFixed(1);
        if (paramMgoBrk) paramMgoBrk.value = cutMgoBrk.toFixed(1);

        const paramFeRed = document.getElementById('param-fe-redlim');
        const paramMgoRocky = document.getElementById('param-mgo-rocky');
        if (paramFeRed) paramFeRed.value = cutFeRedLim.toFixed(1);
        if (paramMgoRocky) paramMgoRocky.value = cutMgoRocky.toFixed(1);

        // --- SIMPAN MEMORI CENTROID UNTUK TABEL MULTIVARIATE NANTI ---
        state.kmeansCentroids = {
            lim: { ni: limCentroid.ni, fe: limCentroid.fe, mgo: limCentroid.mgo },
            sap: { ni: sapCentroid.ni, fe: sapCentroid.fe, mgo: sapCentroid.mgo },
            brk: { ni: brkCentroid.ni, fe: brkCentroid.fe, mgo: brkCentroid.mgo }
        };

        if(typeof hideLoader === 'function') hideLoader();
        if(typeof showToast === 'function') showToast("Algorithmic Centroids Generated!", "success");
        if(typeof lucide !== 'undefined') lucide.createIcons();
        if (typeof window.updateThresholdLines === 'function') window.updateThresholdLines();
        
    }, 500); 
};