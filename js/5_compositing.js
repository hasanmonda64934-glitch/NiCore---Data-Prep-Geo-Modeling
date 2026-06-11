// ==========================================
// 5_COMPOSITING.JS (JORC/KCMI Compliant)
// Downhole Compositing, Mass Balance Validation & Modeler Pack
// Translated to Professional English with Smart AI Analyzer
// ==========================================

let compLenHistInstance = null;

function getCompColor(elName, alpha = 1) {
    const el = String(elName).toUpperCase();
    if (el.includes('NI')) return `rgba(16, 185, 129, ${alpha})`;      
    if (el.includes('FE')) return `rgba(239, 68, 68, ${alpha})`;       
    if (el.includes('MGO')) return `rgba(14, 165, 233, ${alpha})`;     
    if (el.includes('SIO2')) return `rgba(100, 116, 139, ${alpha})`;   
    if (el.includes('CO')) return `rgba(99, 102, 241, ${alpha})`;      
    if (el.includes('AL')) return `rgba(245, 158, 11, ${alpha})`;      
    if (el.includes('CR2O3')) return `rgba(4, 120, 87, ${alpha})`;
    return `rgba(148, 163, 184, ${alpha})`; // Slate
}

function getSampleLength(row, c_len, c_from, c_to) {
    let len = 0;
    if (c_len && row[c_len] !== undefined) {
        len = parseFloat(row[c_len]);
    } else if (row['Length'] !== undefined) {
        len = parseFloat(row['Length']);
    } else {
        len = parseFloat(row[c_to]) - parseFloat(row[c_from]);
    }
    return (!isNaN(len) && len > 0) ? len : 0;
}

// =====================================
// 1. ENGINE KOMPOSIT (SG-WEIGHTED & RECOVERY)
// =====================================
function runCompositing(data) {
    let composites = [];
    let auditLog = []; 
    
    const c_id = state.coreCols.holeId; 
    const c_from = state.coreCols.from; 
    const c_to = state.coreCols.to;
    
    const xCol = state.detectedCoords.x;
    const yCol = state.detectedCoords.y;
    const zCol = state.detectedCoords.z;

    const compTarget = state.compParams.length;
    const minResidualLen = compTarget * (state.compParams.minResidualPct / 100);
    const actionMethod = state.compParams.action; 
    
    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const assayCols = state.headers.filter(h => allowedAssays.includes(h));

    const groupedMap = groupDataByHole(data, c_id, c_from);

    groupedMap.forEach((holeData, holeId) => {
        if (holeData.length === 0) return;

        const collarX = parseFloat(holeData[0][xCol]) || 0;
        const collarY = parseFloat(holeData[0][yCol]) || 0;
        const collarZ = parseFloat(holeData[0][zCol]) || 0;

        let blocks = [];
        let currentBlock = [];
        let currentDomain = holeData[0].Geo_Domain;

        holeData.forEach(row => {
            if (state.compParams.boundaryMode === 'soft' || row.Geo_Domain === currentDomain) {
                currentBlock.push(row);
            } else {
                blocks.push({ domain: currentDomain, data: currentBlock });
                currentDomain = row.Geo_Domain;
                currentBlock = [row];
            }
        });
        if (currentBlock.length > 0) blocks.push({ domain: currentDomain, data: currentBlock });

        blocks.forEach((block) => {
            let blockData = block.data;
            let blockStart = parseFloat(blockData[0][c_from]);
            let blockEnd = parseFloat(blockData[blockData.length - 1][c_to]);
            let blockTotalLen = blockEnd - blockStart;
            
            let intervals = [];
            
            if (actionMethod === 'distribute') {
                let idealComps = Math.round(blockTotalLen / compTarget) || 1;
                let activeCompLen = blockTotalLen / idealComps;
                for (let i = 0; i < idealComps; i++) {
                    intervals.push({ from: blockStart + i * activeCompLen, to: blockStart + (i + 1) * activeCompLen, status: 'Distributed' });
                }
            } else {
                let curr = blockStart;
                while (curr < blockEnd - 0.001) {
                    let next = curr + compTarget;
                    let status = 'Standard';
                    
                    if (next > blockEnd) {
                        next = blockEnd;
                        let len = next - curr;
                        
                        if (len < compTarget - 0.001) { 
                            if (actionMethod === 'discard') {
                                if (len >= minResidualLen) { intervals.push({ from: curr, to: next, status: 'Kept (>= Min)' }); }
                                else { auditLog.push({ Hole_ID: holeId, Interval: `${curr.toFixed(2)} - ${next.toFixed(2)}`, Length: len.toFixed(2), Domain: block.domain, Action: 'Discarded (Below Min)' }); }
                            } else if (actionMethod === 'merge') {
                                if (len < minResidualLen && intervals.length > 0) {
                                    intervals[intervals.length - 1].to = next; 
                                    intervals[intervals.length - 1].status = 'Merged with Below';
                                } else {
                                    intervals.push({ from: curr, to: next, status: 'Kept (>= Min)' });
                                }
                            } else if (actionMethod === 'keep') {
                                intervals.push({ from: curr, to: next, status: 'Kept as Short' });
                            }
                        }
                    } else {
                        intervals.push({ from: curr, to: next, status: status });
                    }
                    curr = next;
                }
            }

            intervals.forEach(iv => {
                let compFrom = iv.from;
                let compTo = iv.to;
                let targetLen = compTo - compFrom;
                
                let sumMassPerEl = {}; 
                let weightedGrades = {};
                let totalSampledLen = 0; 
                
                assayCols.forEach(c => { weightedGrades[c] = 0; sumMassPerEl[c] = 0; });

                blockData.forEach(raw => {
                    const rawFrom = parseFloat(raw[c_from]); 
                    const rawTo = parseFloat(raw[c_to]);
                    
                    if (rawFrom < compTo && rawTo > compFrom) {
                        const weight = Math.min(compTo, rawTo) - Math.max(compFrom, rawFrom);
                        if (weight > 0.001) {
                            totalSampledLen += weight;
                            
                            let rawSG = parseFloat(raw.SG) || state.sgParams[block.domain] || 1.0;
                            let massWeight = weight * rawSG;

                            assayCols.forEach(c => {
                                let val = parseFloat(raw[c]);
                                if(!isNaN(val)) {
                                    weightedGrades[c] += val * massWeight;
                                    sumMassPerEl[c] += massWeight;
                                }
                            });
                        }
                    }
                });

                let compRow = {
                    [c_id]: holeId,
                    [c_from]: compFrom.toFixed(2),
                    [c_to]: compTo.toFixed(2),
                    Length: targetLen.toFixed(2),
                    Recovery_Pct: targetLen > 0 ? ((totalSampledLen / targetLen) * 100).toFixed(1) : "0.0", 
                    Geo_Domain: block.domain,
                    _comp_id: `C_${holeId}_${compFrom.toFixed(1)}`,
                    SG: state.sgParams[block.domain] || 1.0,
                    [xCol]: collarX,
                    [yCol]: collarY,
                    [zCol]: (collarZ - (compFrom + targetLen / 2)).toFixed(2)
                };

                assayCols.forEach(c => {
                    compRow[c] = sumMassPerEl[c] > 0 ? (weightedGrades[c] / sumMassPerEl[c]).toFixed(3) : "";
                });

                composites.push(compRow);
                
                let logEntry = {
                    Comp_ID: compRow['_comp_id'],
                    Hole_ID: holeId, 
                    From: compFrom.toFixed(2), 
                    To: compTo.toFixed(2), 
                    Length: targetLen.toFixed(2),
                    Recovery: compRow['Recovery_Pct'] + "%",
                    Domain: block.domain, 
                    Action: iv.status
                };

                assayCols.forEach(el => {
                    logEntry[`${el}_Grade`] = compRow[el] !== "" ? compRow[el] : "NS"; 
                });

                auditLog.push(logEntry);
            });
        });
    });
    
    state.compositeAuditLog = auditLog;
    return composites;
}


// =====================================
// 2. SMART AI ANALYZER & JUSTIFICATION UI
// =====================================
function analyzeSmartBoundary() {
    if (state.domainedData.length === 0) { showToast("Please run domaining first.", "warning"); return; }
    
    showLoader("AI Analyzer", "Evaluating contact gradients and sampling variance...");
    
    setTimeout(() => {
        let jumpNiCount = 0; let jumpFeCount = 0; let totalContacts = 0;
        let rawLengths = [];
        
        const groupedData = groupDataByHole(state.domainedData, state.coreCols.holeId, state.coreCols.from);

        groupedData.forEach(holeData => {
            if(holeData.length === 0) return;

            for (let i = 0; i < holeData.length - 1; i++) {
                // Kumpulkan data panjang sampel
                let len = getSampleLength(holeData[i], state.coreCols.length, state.coreCols.from, state.coreCols.to);
                if(len > 0) rawLengths.push(len);

                // Analisa Batas Geologi (Boundary)
                if (holeData[i].Geo_Domain !== holeData[i+1].Geo_Domain) {
                    totalContacts++;
                    const ni1 = parseFloat(holeData[i].Ni); const ni2 = parseFloat(holeData[i+1].Ni);
                    const fe1 = parseFloat(holeData[i].Fe); const fe2 = parseFloat(holeData[i+1].Fe);
                    
                    if (!isNaN(ni1) && !isNaN(ni2) && Math.abs(ni1 - ni2) > 0.3) jumpNiCount++;
                    if (!isNaN(fe1) && !isNaN(fe2) && Math.abs(fe1 - fe2) > 10.0) jumpFeCount++;
                }
            }
            // Tangkap panjang baris terakhir
            let lastLen = getSampleLength(holeData[holeData.length-1], state.coreCols.length, state.coreCols.from, state.coreCols.to);
            if(lastLen > 0) rawLengths.push(lastLen);
        });

        if (totalContacts === 0 && rawLengths.length === 0) { 
            hideLoader(); showToast("Not enough data to analyze.", "info"); return; 
        }

        // --- 1. LOGIKA BOUNDARY MODE ---
        let pctSharp = totalContacts > 0 ? ((jumpNiCount + jumpFeCount) / (totalContacts * 2)) * 100 : 0;
        let recMode = pctSharp > 40 ? 'hard' : 'soft';

        // --- 2. LOGIKA ACTION METHOD ---
        let avgRawLen = 1.0, cvLen = 0;
        if(rawLengths.length > 0) {
            avgRawLen = rawLengths.reduce((a,b)=>a+b,0) / rawLengths.length;
            let varianceLen = rawLengths.reduce((a,b)=>a+Math.pow(b-avgRawLen,2),0) / rawLengths.length;
            cvLen = avgRawLen > 0 ? Math.sqrt(varianceLen) / avgRawLen : 0;
        }

        let recAction = 'merge';
        // Jika CV rendah (sampel aslinya sangat seragam) -> Distribute lebih aman secara geostatistik
        // Jika CV tinggi (sampel aslinya campur aduk panjangnya) -> Merge sisa potongan (residual) agar tidak hancur
        if (cvLen < 0.25) {
            recAction = 'distribute';
        } else {
            recAction = 'merge';
        }

        // Auto-update dropdown UI
        const modeSelect = document.getElementById('param-comp-mode');
        const actionSelect = document.getElementById('param-comp-action');
        if(modeSelect) modeSelect.value = recMode;
        if(actionSelect) actionSelect.value = recAction;

        // Render Panel Justifikasi
        renderAIJustificationPanel(recMode, pctSharp, recAction, cvLen, avgRawLen);

        hideLoader();
        showToast("AI Recommendations applied to parameters.", "success");
    }, 600);
}

function renderAIJustificationPanel(mode, pctSharp, action, cvLen, avgLen) {
    let container = document.getElementById('comp-ai-justification');
    const actionPanel = document.getElementById('actions-composite');
    const analyzerBtn = actionPanel.querySelector('button[onclick="analyzeSmartBoundary()"]');

    if (!container) {
        container = document.createElement('div');
        container.id = 'comp-ai-justification';
        container.className = 'bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 shadow-sm mb-2 animate-fade-in transition-all';
        // Sisipkan tepat di bawah tombol Analyzer
        if(analyzerBtn) {
            analyzerBtn.insertAdjacentElement('afterend', container);
        } else {
            actionPanel.prepend(container);
        }
    }

    let modeTitle = mode === 'hard' ? 'Hard Boundary (Strict)' : 'Soft Boundary (Blend)';
    let modeColor = mode === 'hard' ? 'text-rose-600' : 'text-emerald-600';
    let modeDesc = mode === 'hard' 
        ? `Sharp chemical gradients detected across <b>${pctSharp.toFixed(1)}%</b> of domain contacts. Hard boundary is required to prevent grade smearing between distinct geological zones.`
        : `Transitional and gradual chemical changes detected (Sharpness: <b>${pctSharp.toFixed(1)}%</b>). Soft boundary allows blending to reflect the natural geology of the deposit.`;

    let actionTitle = action === 'merge' ? 'Merge to Previous' : 'Distribute Remainder';
    let actionColor = action === 'merge' ? 'text-amber-600' : 'text-blue-600';
    let actionDesc = action === 'merge'
        ? `Raw sample lengths are highly variable (CV: <b>${cvLen.toFixed(2)}</b>). Merging residuals into the previous interval prevents the creation of micro-samples, ensuring mass balance remains intact.`
        : `Raw sample lengths are very uniform (CV: <b>${cvLen.toFixed(2)}</b>). Distributing the remainder perfectly ensures equal-volume support, which is the mathematically ideal state for Kriging.`;

    container.innerHTML = `
        <h4 class="text-[10px] font-black uppercase text-indigo-800 mb-3 border-b border-indigo-200/60 pb-2 flex items-center gap-1.5">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-500"></i> Parameter Selection Rationale
        </h4>
        
        <div class="space-y-3">
            <div>
                <p class="text-[10px] font-black uppercase tracking-wider ${modeColor} mb-0.5">1. Boundary: ${modeTitle}</p>
                <p class="text-[10px] text-slate-600 leading-relaxed">${modeDesc}</p>
            </div>
            <div class="border-t border-indigo-200/50 pt-2">
                <p class="text-[10px] font-black uppercase tracking-wider ${actionColor} mb-0.5">2. Residual Rule: ${actionTitle}</p>
                <p class="text-[10px] text-slate-600 leading-relaxed">${actionDesc}</p>
            </div>
        </div>
    `;
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function applyCompositingParams() {
    showLoader("Regularization Engine", "Compositing samples and calculating SG-weighted mass balance...");

    setTimeout(() => {
        state.compParams.boundaryMode = document.getElementById('param-comp-mode').value;
        state.compParams.length = parseFloat(document.getElementById('param-comp-len').value) || 1.0;
        state.compParams.minResidualPct = parseFloat(document.getElementById('param-comp-min').value) || 0;
        state.compParams.action = document.getElementById('param-comp-action').value;

        const badge = document.getElementById('comp-mode-badge');
        if (badge) {
            badge.classList.remove('hidden');
            if (state.compParams.boundaryMode === 'hard') {
                badge.className = "absolute top-0 right-0 bg-slate-800 text-teal-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-widest shadow-sm transition-colors z-20";
                badge.textContent = "Mode: Strict Hard Boundary";
            } else {
                badge.className = "absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-widest shadow-sm transition-colors z-20";
                badge.textContent = "Mode: Soft Boundary (Blend)";
            }
        }

        state.compositedData = runCompositing(state.domainedData);
        renderComposite(); 
        
        try { if(!document.getElementById('tab-downhole').classList.contains('hidden') && typeof initDownholeLog === 'function') initDownholeLog(); } catch(e) {}
        try { if(!document.getElementById('tab-map2d').classList.contains('hidden') && typeof initMap2D === 'function') initMap2D(); } catch(e) {}
        
        hideLoader();
        showToast(`Compositing executed using ${state.compParams.boundaryMode.toUpperCase()} BOUNDARY.`, "success");
        setTimeout(() => document.getElementById('composite-dashboard').scrollIntoView({behavior: 'smooth'}), 300);
    }, 500);
}

// =====================================
// 3. EXPORT EXCEL (MASS BALANCE AUDIT)
// =====================================
function openCompositeExportModal() {
    if (!state.compositedData || state.compositedData.length === 0) { 
        showToast("Please run Regularization first.", "warning"); 
        return; 
    }
    showToast("Generating Full Excel Report...", "info");
    setTimeout(() => executeCompositeExport(true), 300);
}

function executeCompositeExport(forceDirectDownload = false) {
    if (typeof XLSX === 'undefined') {
        return showToast("System Error: Library SheetJS (XLSX) is missing!", "error");
    }

    const wb = XLSX.utils.book_new();

    // 1. SHEET AUDIT LOG
    if (state.compositeAuditLog && state.compositeAuditLog.length > 0) {
        const auditWs = XLSX.utils.json_to_sheet(state.compositeAuditLog);
        XLSX.utils.book_append_sheet(wb, auditWs, "Audit_Log");
    }

    // 2. SHEET MASS BALANCE
    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const availableAssays = state.headers.filter(h => allowedAssays.includes(h));
    const domains = ['ALL', ...new Set(state.compositedData.map(d => d.Geo_Domain))];
    
    let mbData = [['Domain', 'Element', 'N_Raw', 'N_Comp', 'Min_Raw', 'Min_Comp', 'Q1_Raw', 'Q1_Comp', 'Median_Raw', 'Median_Comp', 'Q3_Raw', 'Q3_Comp', 'Max_Raw', 'Max_Comp', 'Mean_Raw', 'Mean_Comp', 'Bias_Mean_Pct', 'Var_Raw', 'Var_Comp', 'CV_Raw', 'CV_Comp', 'Validation_Status']];

    const calcStatsExp = (data, el, isRaw) => {
        let sumGradeLength = 0, sumLength = 0, min = Infinity, max = -Infinity, count = data.length;
        let vals = [];
        const c_len = state.coreCols.length;

        data.forEach(d => {
            const grade = parseFloat(d[el]);
            let len = getSampleLength(d, c_len, state.coreCols.from, state.coreCols.to);
            if (len <= 0) len = 1;
            
            if (!isNaN(grade)) {
                sumGradeLength += (grade * len);
                sumLength += len;
                vals.push(grade);
                if (grade < min) min = grade;
                if (grade > max) max = grade;
            }
        });

        if(vals.length === 0) return { count:0, min:0, max:0, mean:0, variance:0, cv:0, q1:0, median:0, q3:0 };

        const mean = sumLength > 0 ? (sumGradeLength / sumLength) : 0;
        let sumSqDiff = 0;
        data.forEach(d => {
            const grade = parseFloat(d[el]);
            let len = isRaw ? getSampleLength(d, c_len, state.coreCols.from, state.coreCols.to) : parseFloat(d.Length);
            if (isNaN(len) || len <= 0) len = 1;
            if (!isNaN(grade)) sumSqDiff += len * Math.pow(grade - mean, 2); 
        });

        const variance = sumLength > 0 ? (sumSqDiff / sumLength) : 0;
        const stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? stdDev / mean : 0;
        
        const sortedVals = [...vals].sort((a, b) => a - b);
        const q1 = sortedVals[Math.floor(sortedVals.length * 0.25)] || 0;
        const median = sortedVals[Math.floor(sortedVals.length * 0.50)] || 0;
        const q3 = sortedVals[Math.floor(sortedVals.length * 0.75)] || 0;

        return { count, min, max, mean, variance, cv, q1, median, q3 };
    };

    availableAssays.forEach(el => {
        domains.forEach(dom => {
            let rawData = state.domainedData.filter(d => d[el] !== '' && !isNaN(parseFloat(d[el])));
            let compData = state.compositedData.filter(d => d[el] !== '' && !isNaN(parseFloat(d[el])));

            if (dom !== 'ALL') {
                rawData = rawData.filter(d => d.Geo_Domain === dom);
                compData = compData.filter(d => d.Geo_Domain === dom);
            }

            if (rawData.length > 0 && compData.length > 0) {
                const rS = calcStatsExp(rawData, el, true);
                const cS = calcStatsExp(compData, el, false);

                const meanDiff = rS.mean > 0 ? Math.abs((cS.mean - rS.mean) / rS.mean) * 100 : 0;
                let status = meanDiff <= 1.5 ? 'VALID' : 'BIAS_WARNING';
                if (cS.variance > rS.variance) status += ' | VARIANCE_INCREASED';

                mbData.push([
                    dom, el, rS.count, cS.count, 
                    rS.min.toFixed(3), cS.min.toFixed(3), 
                    rS.q1.toFixed(3), cS.q1.toFixed(3),
                    rS.median.toFixed(3), cS.median.toFixed(3),
                    rS.q3.toFixed(3), cS.q3.toFixed(3),
                    rS.max.toFixed(3), cS.max.toFixed(3),
                    rS.mean.toFixed(3), cS.mean.toFixed(3), 
                    meanDiff.toFixed(2) + '%',
                    rS.variance.toFixed(4), cS.variance.toFixed(4),
                    rS.cv.toFixed(3), cS.cv.toFixed(3),
                    status
                ]);
            }
        });
    });

    const mbWs = XLSX.utils.aoa_to_sheet(mbData);
    XLSX.utils.book_append_sheet(wb, mbWs, "Mass_Balance");

    XLSX.writeFile(wb, `NiCore_Composite_Audit_Report.xlsx`);
    showToast("Excel Report generated successfully.", "success");
}

// =====================================
// 4. DASHBOARD & VALIDASI VISUAL
// =====================================
function renderComposite() {
    const dash = document.getElementById('composite-dashboard');
    const chartsRow = document.getElementById('comp-charts-row');
    const tableCont = document.getElementById('comp-validation-table-container');
    const headerTitle = document.querySelector('#tab-composite .bg-slate-800');

    let emptyState = document.getElementById('comp-empty-state');
    if (!emptyState && dash) {
        emptyState = document.createElement('div');
        emptyState.id = 'comp-empty-state';
        emptyState.className = 'flex flex-col items-center justify-center flex-grow bg-white rounded-xl border border-slate-200 p-10 shadow-sm w-full min-h-[350px] mb-6 mt-4 animate-fade-in';
        emptyState.innerHTML = `
            <div class="bg-slate-50 p-5 rounded-full shadow-inner mb-4 border border-slate-100">
                <i data-lucide="minimize-2" class="w-16 h-16 text-slate-300 drop-shadow-sm"></i>
            </div>
            <h3 class="text-xl font-black text-slate-600 mb-2 tracking-tight uppercase">Regularization Required</h3>
            <p class="text-sm font-medium text-slate-400 text-center max-w-md">
                No composited data available. Please adjust your Target Length and click "Run Regularization" in the Action Panel to begin.
            </p>
        `;
        if (headerTitle) {
            headerTitle.parentNode.insertBefore(emptyState, headerTitle.nextSibling);
        } else {
            dash.parentNode.insertBefore(emptyState, dash);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    if (!state.compositedData || state.compositedData.length === 0) {
        if (emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
        if (dash) { dash.classList.add('hidden'); dash.classList.remove('grid'); }
        if (chartsRow) { chartsRow.classList.add('hidden'); chartsRow.classList.remove('grid'); }
        if (tableCont) { tableCont.classList.add('hidden'); tableCont.classList.remove('flex', 'md:flex-row'); }
        return;
    }

    if (emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
    if (dash) { dash.classList.remove('hidden'); dash.classList.add('grid'); }
    if (chartsRow) { chartsRow.classList.remove('hidden'); chartsRow.classList.add('grid'); }
    if (tableCont) { tableCont.classList.remove('hidden'); tableCont.classList.add('flex', 'md:flex-row'); }

    const rawCount = state.rawData.length;
    const compCount = state.compositedData.length;
    const c_len = state.coreCols.length;
    
    let rawMeterage = state.rawData.reduce((sum, row) => sum + getSampleLength(row, c_len, state.coreCols.from, state.coreCols.to), 0);
    let compMeterage = state.compositedData.reduce((sum, row) => sum + (parseFloat(row['Length']) || 0), 0);
    
    if(document.getElementById('stat-raw-count')) document.getElementById('stat-raw-count').textContent = rawCount.toLocaleString(); 
    if(document.getElementById('stat-comp-count')) document.getElementById('stat-comp-count').textContent = compCount.toLocaleString();
    if(document.getElementById('stat-comp-title')) document.getElementById('stat-comp-title').textContent = `Composited (${state.compParams.length}m)`;
    if(document.getElementById('stat-comp-ratio')) document.getElementById('stat-comp-ratio').textContent = `-${rawCount > 0 ? ((rawCount - compCount) / rawCount * 100).toFixed(1) : 0}%`;
    if(document.getElementById('stat-raw-meter')) document.getElementById('stat-raw-meter').textContent = `${rawMeterage.toFixed(1)}m`; 
    if(document.getElementById('stat-comp-meter')) document.getElementById('stat-comp-meter').textContent = `${compMeterage.toFixed(1)}m`;
    
    const elSelect = document.getElementById('comp-val-element');
    const domSelect = document.getElementById('comp-val-domain');
    
    if (elSelect && domSelect) {
        const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
        const assayCols = state.headers.filter(h => allowedAssays.includes(h));
        const uniqueDomains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
        
        const currEl = elSelect.value;
        const currDom = domSelect.value;

        elSelect.innerHTML = assayCols.map(c => `<option value="${c}" class="bg-slate-800 text-white font-bold">${c}</option>`).join('');
        domSelect.innerHTML = `<option value="ALL">All Domains</option>` + uniqueDomains.map(d => `<option value="${d}">${d}</option>`).join('');
        
        if (assayCols.includes(currEl)) elSelect.value = currEl;
        else if (assayCols.includes('Ni')) elSelect.value = 'Ni';
        else if (assayCols.length > 0) elSelect.value = assayCols[0];

        if (currDom === 'ALL' || uniqueDomains.includes(currDom)) domSelect.value = currDom;
        else domSelect.value = 'ALL';

        renderLengthDistribution();
        renderCompositeValidation();
    }
}

function renderLengthDistribution() {
    const c_len = state.coreCols.length;
    let rawLens = state.rawData.map(r => getSampleLength(r, c_len, state.coreCols.from, state.coreCols.to)).filter(v => v > 0);
    let compLens = state.compositedData.map(r => parseFloat(r.Length)).filter(v => !isNaN(v) && v > 0);
    
    if(compLenHistInstance) compLenHistInstance.destroy();
    const ctx = document.getElementById('comp-len-chart');
    if(!ctx) return;

    const targetLen = state.compParams.length; 
    const maxLen = Math.max(...rawLens, targetLen * 2);
    const step = maxLen / 15;
    
    let labels = [], rawBins = Array(15).fill(0), compBins = Array(15).fill(0);
    for(let i=0; i<15; i++) labels.push(`${(i*step).toFixed(1)}`);
    
    rawLens.forEach(v => { let idx = Math.floor(v/step); if(idx>=15) idx=14; rawBins[idx]++; });
    compLens.forEach(v => { let idx = Math.floor(v/step); if(idx>=15) idx=14; compBins[idx]++; });

    const verticalLinePlugin = {
        id: 'verticalLinePlugin',
        afterDraw: (chart) => {
            if (targetLen) {
                const ctx = chart.ctx, xAxis = chart.scales.x, yAxis = chart.scales.y;
                const xPixel = xAxis.getPixelForValue(targetLen / step); 
                ctx.save(); ctx.beginPath(); ctx.moveTo(xPixel, yAxis.top); ctx.lineTo(xPixel, yAxis.bottom);
                ctx.lineWidth = 2; ctx.strokeStyle = '#ef4444'; ctx.setLineDash([5, 5]); ctx.stroke();
                ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px Inter'; ctx.textAlign = 'center';
                ctx.fillText(`Target: ${targetLen}m`, xPixel, yAxis.top - 5); ctx.restore();
            }
        }
    };

    compLenHistInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
            { label: 'Raw Lengths', data: rawBins, backgroundColor: 'rgba(148, 163, 184, 0.5)', borderWidth: 0, barPercentage: 1.0, categoryPercentage: 1.0 },
            { label: 'Comp Lengths', data: compBins, backgroundColor: 'rgba(20, 184, 166, 0.8)', borderWidth: 0, barPercentage: 0.8, categoryPercentage: 0.8 } 
        ]},
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 }, grid:{display:false} }, y: { display: false } }, 
            plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 9 } } } } 
        },
        plugins: [verticalLinePlugin] 
    });
}

function renderCompositeValidation() {
    const element = document.getElementById('comp-val-element').value;
    const domain = document.getElementById('comp-val-domain').value;
    if (!element || state.compositedData.length === 0) return;

    let histWrapper = document.getElementById('comp-hist-wrapper-dynamic');
    if (!histWrapper) {
        const canvas = document.getElementById('comp-hist-chart');
        if (canvas) {
            histWrapper = canvas.parentElement;
            histWrapper.id = 'comp-hist-wrapper-dynamic';
        }
    }
    const boxContainer = document.getElementById('comp-box-chart');
    if (!histWrapper || !boxContainer) return;

    let histDiv = document.getElementById('comp-hist-plotly-div');
    if (!histDiv) {
        histWrapper.innerHTML = ''; 
        histDiv = document.createElement('div');
        histDiv.id = 'comp-hist-plotly-div';
        histDiv.className = 'w-full h-full absolute inset-0';
        histWrapper.appendChild(histDiv);
    }
    
    let boxDiv = document.getElementById('comp-box-plotly-div');
    if (!boxDiv) {
        boxContainer.innerHTML = ''; 
        boxDiv = document.createElement('div');
        boxDiv.id = 'comp-box-plotly-div';
        boxDiv.className = 'w-full h-full absolute inset-0';
        boxContainer.appendChild(boxDiv);
    }

    const c_len = state.coreCols.length;
    let rawData = state.domainedData.filter(d => d[element] !== '' && !isNaN(parseFloat(d[element])));
    let compData = state.compositedData.filter(d => d[element] !== '' && !isNaN(parseFloat(d[element])));

    if (domain !== 'ALL') {
        rawData = rawData.filter(d => d.Geo_Domain === domain);
        compData = compData.filter(d => d.Geo_Domain === domain);
    }

    if (rawData.length === 0 || compData.length === 0) {
        Plotly.purge(histDiv);
        Plotly.purge(boxDiv);
        return;
    }

    const calcStats = (data, isRaw) => {
        let sumGradeLength = 0, sumLength = 0, min = Infinity, max = -Infinity, count = data.length;
        let vals = [];

        data.forEach(d => {
            const grade = parseFloat(d[element]);
            let len = isRaw ? getSampleLength(d, c_len, state.coreCols.from, state.coreCols.to) : parseFloat(d.Length);
            if (isNaN(len) || len <= 0) len = 1;

            if (!isNaN(grade)) {
                sumGradeLength += (grade * len);
                sumLength += len;
                vals.push(grade);
                if (grade < min) min = grade;
                if (grade > max) max = grade;
            }
        });

        const mean = sumLength > 0 ? (sumGradeLength / sumLength) : 0;
        let sumSqDiff = 0;
        data.forEach(d => {
            const grade = parseFloat(d[element]);
            let len = isRaw ? getSampleLength(d, c_len, state.coreCols.from, state.coreCols.to) : parseFloat(d.Length);
            if (isNaN(len) || len <= 0) len = 1;
            if (!isNaN(grade)) sumSqDiff += len * Math.pow(grade - mean, 2); 
        });

        const variance = sumLength > 0 ? (sumSqDiff / sumLength) : 0;
        const stdDev = Math.sqrt(variance);
        const cv = mean > 0 ? stdDev / mean : 0;
        
        const sortedVals = [...vals].sort((a, b) => a - b);
        const q1 = sortedVals[Math.floor(sortedVals.length * 0.25)] || 0;
        const q2 = sortedVals[Math.floor(sortedVals.length * 0.50)] || 0; 
        const q3 = sortedVals[Math.floor(sortedVals.length * 0.75)] || 0;

        return { count, min, max, mean, variance, cv, vals, q1, q2, q3 };
    };

    const rawStats = calcStats(rawData, true);
    const compStats = calcStats(compData, false);

    // --- TABEL MASS BALANCE VALIDASI ---
    const meanDiffPct = Math.abs((compStats.mean - rawStats.mean) / rawStats.mean) * 100;
    const isMeanValid = meanDiffPct <= 1.5; 
    const isVarValid = compStats.variance <= rawStats.variance; 

    const tbody = document.getElementById('comp-val-tbody');
    if(tbody) {
        tbody.innerHTML = `
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-r border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">Sample Count (N)</td>
                <td class="p-3 border-r border-slate-100 text-right bg-slate-50">${rawStats.count}</td>
                <td class="p-3 border-r border-slate-100 text-right bg-teal-50 font-black text-teal-700">${compStats.count}</td>
                <td class="p-3 text-center text-slate-400 text-[10px]">-</td>
            </tr>
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-r border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">Min - Max</td>
                <td class="p-3 border-r border-slate-100 text-right bg-slate-50">${rawStats.min.toFixed(2)} - <span class="text-rose-500">${rawStats.max.toFixed(2)}</span></td>
                <td class="p-3 border-r border-slate-100 text-right bg-teal-50 font-bold">${compStats.min.toFixed(2)} - <span class="text-rose-600">${compStats.max.toFixed(2)}</span></td>
                <td class="p-3 text-center text-slate-400 text-[10px]">Max Smoothed</td>
            </tr>
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-r border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">Q1 - Median - Q3</td>
                <td class="p-3 border-r border-slate-100 text-right bg-slate-50 text-[10px]"><span class="text-slate-400">${rawStats.q1.toFixed(2)}</span> - <b>${rawStats.q2.toFixed(2)}</b> - <span class="text-slate-400">${rawStats.q3.toFixed(2)}</span></td>
                <td class="p-3 border-r border-slate-100 text-right bg-teal-50 text-[10px] text-teal-800"><span class="text-teal-600/70">${compStats.q1.toFixed(2)}</span> - <b>${compStats.q2.toFixed(2)}</b> - <span class="text-teal-600/70">${compStats.q3.toFixed(2)}</span></td>
                <td class="p-3 text-center text-slate-400 text-[10px]">IQR Reduced</td>
            </tr>
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-r border-slate-100 text-[11px] uppercase tracking-wider font-black text-slate-800">Mean Grade</td>
                <td class="p-3 border-r border-slate-100 text-right bg-slate-100 font-black text-slate-700">${rawStats.mean.toFixed(3)}</td>
                <td class="p-3 border-r border-slate-100 text-right bg-emerald-50 font-black text-emerald-700">${compStats.mean.toFixed(3)}</td>
                <td class="p-3 text-center">
                    ${isMeanValid ? '<span class="bg-emerald-500 text-white px-2.5 py-1 rounded font-bold text-[9px] uppercase tracking-widest shadow-sm"><i data-lucide="check-circle" class="w-3 h-3 inline"></i> Valid (< 1.5%)</span>' : '<span class="bg-rose-500 text-white px-2.5 py-1 rounded font-bold text-[9px] uppercase tracking-widest shadow-sm"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> Bias > 1.5%</span>'}
                </td>
            </tr>
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-r border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-500">Coeff. Variance (CV)</td>
                <td class="p-3 border-r border-slate-100 text-right bg-slate-50">${rawStats.cv.toFixed(2)}</td>
                <td class="p-3 border-r border-slate-100 text-right bg-teal-50 font-bold">${compStats.cv.toFixed(2)}</td>
                <td class="p-3 text-center">
                    ${isVarValid ? '<span class="text-emerald-600 font-bold text-[10px]">Variance Dropped (OK)</span>' : '<span class="text-amber-500 font-bold text-[10px]">Variance Increased (Check)</span>'}
                </td>
            </tr>
        `;
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }

    // --- RENDER PLOTLY HISTOGRAM OVERLAY ---
    const minX = Math.floor(Math.min(rawStats.min, compStats.min));
    const maxX = Math.ceil(Math.max(rawStats.max, compStats.max));
    const step = (maxX - minX) / 30; 

    let elColorHex = getCompColor(element, 1).replace('rgba','rgb').replace(', 1)',')');
    let elColorTrans = getCompColor(element, 0.6);

    const histData = [
        {
            x: rawStats.vals, type: 'histogram', name: 'Raw Data', opacity: 0.5,
            marker: { color: '#94a3b8', line: { color: '#64748b', width: 1 } },
            xbins: { start: minX, end: maxX, size: step }
        },
        {
            x: compStats.vals, type: 'histogram', name: 'Composited', opacity: 0.7,
            marker: { color: elColorTrans, line: { color: elColorHex, width: 1.5 } },
            xbins: { start: minX, end: maxX, size: step }
        }
    ];

    const commonMargin = { l: 40, r: 15 }; 
    const commonXAxis = { range: [minX, maxX + step], gridcolor: '#e2e8f0', zeroline: false, tickfont: { size: 9, color: '#64748b', weight: 'bold' } };

    const histLayout = {
        barmode: 'overlay', margin: { ...commonMargin, b: 20, t: 30 },
        xaxis: { ...commonXAxis, showticklabels: true }, 
        yaxis: { title: 'Freq', titlefont: { size: 9, color: '#64748b' }, gridcolor: '#f1f5f9' },
        showlegend: true, legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: {size: 9, weight: 'bold'} },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)'
    };
    
    Plotly.react(histDiv, histData, histLayout, { responsive: true, displayModeBar: false });

    // --- RENDER BOX PLOT ---
    const boxData = [
        { x: rawStats.vals, y: Array(rawStats.vals.length).fill('RAW'), type: 'box', orientation: 'h', name: 'RAW', marker: {color: '#94a3b8', size: 3, opacity: 0.5}, line: {width: 1}, boxpoints: 'outliers' },
        { x: compStats.vals, y: Array(compStats.vals.length).fill('COMP'), type: 'box', orientation: 'h', name: 'COMP', marker: {color: elColorHex, size: 3, opacity: 0.8}, line: {width: 1.5}, boxpoints: 'outliers' }
    ];
    
    const boxLayout = { 
        margin: { ...commonMargin, b: 30, t: 5 }, 
        xaxis: { ...commonXAxis, title: `${element} Grade (%)`, titlefont: { size: 9, color: '#64748b', weight: 'bold' } }, 
        showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', 
        yaxis: { autorange: 'reversed', tickfont: { size: 9, weight: 'bold' } }
    };
    
    Plotly.react(boxDiv, boxData, boxLayout, {responsive: true, displayModeBar: false});
}

// ==========================================
// 5. EXPORT 3D MODELER PACK
// ==========================================
function generateExcelPack() {
    if (state.compositedData.length === 0 || state.domainedData.length === 0) { showToast("Data belum siap.", "error"); return; }
    
    if (typeof XLSX === 'undefined') {
        return showToast("System Error: Library SheetJS (XLSX) tidak terpasang di index.html Anda!", "error");
    }

    showToast("Preparing 3D Modeler Excel Pack...", "info");
    
    const applyTopCut = document.getElementById('zip-apply-topcut')?.checked || false;
    const currentCogNi = parseFloat(document.getElementById('map2d-cog-ni')?.value) || 0;
    
    const rawGrouped = groupDataByHole(state.rawData, state.coreCols.holeId);
    const domGrouped = groupDataByHole(state.domainedData, state.coreCols.holeId, state.coreCols.from);
    
    let collarData = [['Hole_ID', 'X', 'Y', 'Z_Original', 'Z_Topo', 'Z_Final', 'Delta_Z', 'Max_Depth', 'Topo_Status', 'Validation_Note']];
    let surveyData = [['Hole_ID', 'Depth', 'Dip', 'Azimuth']];

    rawGrouped.forEach((holeRaw, hole) => {
        const findValidCoord = (coordColName) => { if (!coordColName) return 0; for (let i = 0; i < holeRaw.length; i++) { const val = parseFloat(holeRaw[i][coordColName]); if (!isNaN(val)) return val; } return 0; };
        const x = findValidCoord(state.detectedCoords.x), y = findValidCoord(state.detectedCoords.y);
        let zOrig = holeRaw[0]._origZ !== undefined ? holeRaw[0]._origZ : findValidCoord(state.detectedCoords.z);
        let maxDepth = Math.max(...holeRaw.map(d => parseFloat(d[state.coreCols.to]) || 0));
        
        let zTopo = '-', zFinal = zOrig, deltaZ = '-', topoStatus = 'UNVALIDATED', validationNote = 'Belum divalidasi';
        if(state.isTopoValidated) { 
            const topoRec = state.topoLogs.find(l => l.Hole_ID === hole); 
            if(topoRec) { zTopo = parseFloat(topoRec.Topo_Z.toFixed(2)); zFinal = parseFloat(topoRec.Corrected_Z.toFixed(2)); deltaZ = parseFloat(topoRec.Diff.toFixed(2)); topoStatus = topoRec.Status; validationNote = topoRec.Method; } 
        }
        collarData.push([hole, x, y, zOrig, zTopo, zFinal, deltaZ, parseFloat(maxDepth.toFixed(2)), topoStatus, validationNote]);
        
        const dipVal = state.detectedCoords.dip && holeRaw[0][state.detectedCoords.dip] !== undefined ? parseFloat(holeRaw[0][state.detectedCoords.dip]) : -90;
        const aziVal = state.detectedCoords.azimuth && holeRaw[0][state.detectedCoords.azimuth] !== undefined ? parseFloat(holeRaw[0][state.detectedCoords.azimuth]) : 0;
        surveyData.push([hole, parseFloat(maxDepth.toFixed(2)), dipVal, aziVal]);
    });

    let geologyData = [['Hole_ID', 'From', 'To', 'Lithology']];
    domGrouped.forEach((holeDom, hole) => {
        if(holeDom.length === 0) return;
        let currentDom = holeDom[0].Geo_Domain, startDepth = parseFloat(holeDom[0][state.coreCols.from]), endDepth = parseFloat(holeDom[0][state.coreCols.to]);
        for(let i = 1; i < holeDom.length; i++) {
            let nextFrom = parseFloat(holeDom[i][state.coreCols.from]), nextTo = parseFloat(holeDom[i][state.coreCols.to]);
            if (holeDom[i].Geo_Domain === currentDom && Math.abs(nextFrom - endDepth) <= 0.01) { endDepth = nextTo; } 
            else { geologyData.push([hole, parseFloat(startDepth.toFixed(2)), parseFloat(endDepth.toFixed(2)), currentDom]); currentDom = holeDom[i].Geo_Domain; startDepth = nextFrom; endDepth = nextTo; }
        }
        geologyData.push([hole, parseFloat(startDepth.toFixed(2)), parseFloat(endDepth.toFixed(2)), currentDom]);
    });

    let baseAssayCols = [...state.headers.filter(h => !['X','Y','Z','Easting','Northing','Elevation'].includes(h)), 'Recovery_Pct', 'SG', 'Geo_Domain'];
    let exportHeaders = [...baseAssayCols];
    
    const structuralCols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to, 'Length', 'Recovery_Pct', 'Geo_Domain', '_id', '_comp_id', 'Lithology', 'SG', 'Ore_Class'];
    const elementsToCut = state.headers.filter(h => !structuralCols.includes(h) && !['X','Y','Z','Easting','Northing','Elevation'].includes(h));
    
    if (applyTopCut) {
        elementsToCut.forEach(el => { if (state.headers.includes(el)) exportHeaders.push(`${el}_Cut`); });
    }
    exportHeaders.push('Ore_Class'); 
    
    let assayData = [exportHeaders];
    
    state.compositedData.forEach(row => {
        let rowData = exportHeaders.map(h => {
            if (h === 'Ore_Class') return (parseFloat(row.Ni) >= currentCogNi) ? 'ORE' : 'WASTE';
            
            let isCutCol = h.endsWith('_Cut');
            let baseElement = isCutCol ? h.replace('_Cut', '') : h;
            let val = row[baseElement] !== undefined ? row[baseElement] : '';
            
            if (val !== '' && !isNaN(val)) {
                let numVal = parseFloat(val);
                if (isCutCol && state.edaStats && state.edaStats.length > 0) {
                    const domainStat = state.edaStats.find(s => s.Domain === row.Geo_Domain);
                    if (domainStat && domainStat[`${baseElement}_TopCut98`]) {
                        const topCutVal = parseFloat(domainStat[`${baseElement}_TopCut98`]);
                        if (numVal > topCutVal) return parseFloat(topCutVal.toFixed(3));
                    }
                }
                return h === 'Recovery_Pct' ? parseFloat(numVal.toFixed(1)) : parseFloat(numVal.toFixed(3));
            }
            return val;
        });
        assayData.push(rowData);
    });

    let paramData = [['Geo_Domain', 'Element', 'Top_Cut_98', 'Nugget_C0', 'Sill_C0_C1', 'Range_a_Meter']];
    if (state.edaStats && state.edaStats.length > 0) {
        state.edaStats.forEach(stat => {
            Object.keys(stat).filter(k => k.endsWith('_Mean')).map(k => k.replace('_Mean', '')).forEach(el => {
                paramData.push([stat.Domain, el, stat[`${el}_TopCut98`] || '-', stat[`${el}_Nugget`] || '-', stat[`${el}_Sill`] || '-', stat[`${el}_Range`] || '-']);
            });
        });
    }

    try {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(collarData), "Collar");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(surveyData), "Survey");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(geologyData), "Geology");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assayData), "Assay_Composited");
        if (paramData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paramData), "GeoStat_Params");
        
        XLSX.writeFile(wb, `NiCore_3DPack_${state.compParams.length}m${applyTopCut ? '_Capped' : ''}.xlsx`);
        showToast("Success! 3D Modeler Excel file is ready.", "success");
    } catch (err) { 
        showToast("Failed to generate Excel file.", "error"); 
        console.error(err);
    }
}