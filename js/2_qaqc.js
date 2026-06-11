// ==========================================
// 2_QAQC.JS (DATABASE VALIDATION & LAB ANALYTICS)
// Handles Geological Data Validation and Lab Control Charts
// Adapted for Pro Layout Right Sidebar & Element Statistics
// Fully Localized to English with Professional Clean UI Theme
// ==========================================

// ==========================================
// SECTION A: DATABASE VALIDATION (GEOLOGY)
// ==========================================

function renderQAQCSettings() {
    let filterScrollContainer = document.getElementById('qaqc-filter-scroll-container');
    const actionsPanel = document.getElementById('actions-qaqc');
    
    if (!filterScrollContainer && actionsPanel) {
        const oldFilterBox = actionsPanel.querySelector('.bg-white.border.border-slate-200');
        
        filterScrollContainer = document.createElement('div');
        filterScrollContainer.id = 'qaqc-filter-scroll-container';
        filterScrollContainer.className = 'bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-2 flex flex-col flex-grow min-h-[300px] max-h-[50vh]';
        
        filterScrollContainer.innerHTML = `
            <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 shrink-0 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <i data-lucide="filter" class="w-3.5 h-3.5 text-teal-600"></i> Validation Rules
            </h4>
            <div class="overflow-y-auto custom-scrollbar flex-grow pr-1 space-y-2 mb-3">
                <div id="qaqc-blank-checkboxes"></div>
                <div id="qaqc-negative-checkboxes"></div>
                <div id="qaqc-zero-checkboxes"></div>
            </div>
            <div class="shrink-0 pt-3 border-t border-slate-100 mt-auto">
                <label class="flex items-center gap-2 cursor-pointer bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 hover:border-teal-400 transition-all shadow-sm group">
                    <input type="checkbox" id="qaqc-spike-toggle" class="w-4 h-4 text-teal-600 rounded cursor-pointer" checked>
                    <span class="text-[10px] font-bold text-slate-700 uppercase group-hover:text-teal-700">Detect Spikes</span>
                </label>
                <button onclick="applyQAQCSettings()" class="w-full bg-teal-600 hover:bg-teal-700 text-white py-3 rounded-lg font-black text-xs transition-all shadow-md flex items-center justify-center gap-2">
                    <i data-lucide="check-circle" class="w-4 h-4"></i> Apply Filters
                </button>
            </div>
        `;
        
        if (oldFilterBox) {
            oldFilterBox.replaceWith(filterScrollContainer);
        } else {
            actionsPanel.prepend(filterScrollContainer);
        }
    }

    const blankContainer = document.getElementById('qaqc-blank-checkboxes');
    const negContainer = document.getElementById('qaqc-negative-checkboxes');
    const zeroContainer = document.getElementById('qaqc-zero-checkboxes');

    const createCb = (col, isChecked, prefix) => `
        <div>
            <input type="checkbox" id="${prefix}-${col}" value="${col}" class="${prefix}-cb hidden custom-checkbox" ${isChecked ? 'checked' : ''}>
            <label for="${prefix}-${col}" class="cursor-pointer bg-white border border-slate-200 rounded-md text-[9px] uppercase font-bold px-2 py-1.5 text-slate-600 transition-colors select-none block text-center shadow-sm hover:border-teal-400 hover:text-teal-700">${col}</label>
        </div>`;

    const assayCols = state.headers.filter(h => h && !String(h).toLowerCase().includes('id') && !String(h).toLowerCase().includes('lito') && !['x','y','z','easting','northing','elevation', 'from', 'to', 'length'].includes(String(h).toLowerCase()));

    const createAccordion = (title, icon, iconColor, content, isOpen = false) => `
        <details class="bg-slate-50 border border-slate-200 rounded-lg group" ${isOpen ? 'open' : ''}>
            <summary class="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between p-2.5 cursor-pointer select-none hover:bg-slate-100 rounded-lg transition-colors">
                <span class="flex items-center gap-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-${iconColor}"></i> ${title}</span>
                <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180"></i>
            </summary>
            <div class="flex flex-wrap gap-1.5 p-2.5 pt-1 border-t border-slate-100">
                ${content}
            </div>
        </details>
    `;

    if (blankContainer) {
        const cbHtml = state.headers.map(col => createCb(col, state.qaqcBlankCols.includes(col), 'blank')).join('');
        blankContainer.innerHTML = createAccordion('Blank Cells (Null)', 'file-minus', 'rose-500', cbHtml, true);
    }
    if (negContainer) {
        const cbHtml = state.headers.map(col => createCb(col, state.qaqcNegativeCols.includes(col), 'neg')).join('');
        negContainer.innerHTML = createAccordion('Negative (< 0)', 'trending-down', 'orange-500', cbHtml, false);
    }
    if (zeroContainer) {
        if (state.qaqcZeroCols.length === 0 && state.rawData.length > 0) state.qaqcZeroCols = [...assayCols];
        const cbHtml = assayCols.map(col => createCb(col, state.qaqcZeroCols.includes(col), 'zero')).join('');
        zeroContainer.innerHTML = createAccordion('Detection Limit (BDL)', 'target', 'blue-500', cbHtml, false);
    }

    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function applyQAQCSettings() {
    state.qaqcBlankCols = Array.from(document.querySelectorAll('.blank-cb:checked')).map(cb => cb.value);
    state.qaqcNegativeCols = Array.from(document.querySelectorAll('.neg-cb:checked')).map(cb => cb.value);
    state.qaqcZeroCols = Array.from(document.querySelectorAll('.zero-cb:checked')).map(cb => cb.value);
    runQAQC(); 
    renderQAQC(); 
    showToast("Audit parameters applied successfully.", "success");
}

function generateQAQCLogs(dataToProcess, updateErrorMap = false) {
    let logs = []; 
    if (updateErrorMap) state.errorMap = {}; 
    
    const c_id = state.coreCols.holeId, c_from = state.coreCols.from, c_to = state.coreCols.to, c_len = state.coreCols.length;
    const checkSpikes = document.getElementById('qaqc-spike-toggle') ? document.getElementById('qaqc-spike-toggle').checked : true;

    if(!c_id || !c_from || !c_to) return logs;
    const groupedMap = groupDataByHole(dataToProcess, c_id, c_from);
    
    const assayCols = state.headers.filter(h => h && !String(h).toLowerCase().includes('id') && !String(h).toLowerCase().includes('lito') && !['x','y','z','easting','northing','elevation', 'from', 'to', 'length'].includes(String(h).toLowerCase()));

    groupedMap.forEach((holeData, holeId) => {
        for (let i = 0; i < holeData.length; i++) {
            const current = holeData[i], rId = current._id, from = parseFloat(current[c_from]), to = parseFloat(current[c_to]), length = parseFloat(current[c_len]);
            
            const addFlag = (col) => { if(updateErrorMap) flagErrorCell(rId, col); };
            const addPrevFlag = (prevId, col) => { if(updateErrorMap) flagErrorCell(prevId, col); };

            if(state.qaqcBlankCols) {
                state.qaqcBlankCols.forEach(col => {
                    if (current[col] === '' || current[col] === null || current[col] === undefined) {
                        logs.push({ type: 'Error', hole: holeId, depth: `${current[c_from] || '?'}-${current[c_to] || '?'}`, message: `Attribute [${col}] is Null/Blank.`, rowId: rId, col: col }); 
                        addFlag(col);
                    }
                });
            }

            if (c_len && !isNaN(from) && !isNaN(to) && !isNaN(length)) {
                if (Math.abs((to - from) - length) > 0.01) {
                    logs.push({ type: 'Error', hole: holeId, depth: `${from}-${to}`, message: `Interval error. Diff ${(to-from).toFixed(2)} vs Length ${length}`, rowId: rId, col: c_len });
                    addFlag(c_from); addFlag(c_to); addFlag(c_len);
                }
            }

            if(state.qaqcNegativeCols) {
                state.qaqcNegativeCols.forEach(col => {
                    if (current[col] !== '' && parseFloat(current[col]) < 0) {
                        logs.push({ type: 'Error', hole: holeId, depth: `${from}-${to}`, message: `Value [${col}] is negative.`, rowId: rId, col: col }); 
                        addFlag(col);
                    }
                });
            }

            if (state.qaqcZeroCols && state.qaqcZeroCols.length > 0) {
                state.qaqcZeroCols.forEach(col => {
                    const rawVal = current[col];
                    if (rawVal !== '') {
                        if (parseFloat(rawVal) === 0) {
                            logs.push({ type: 'Warning', hole: holeId, depth: `${from}-${to}`, message: `Value [${col}] is 0. High risk for Kriging.`, rowId: rId, col: col, isBdl: true }); 
                            addFlag(col);
                        } else if (typeof rawVal === 'string' && rawVal.trim().startsWith('<')) {
                            logs.push({ type: 'Warning', hole: holeId, depth: `${from}-${to}`, message: `BDL text format detected [${col}]: ${rawVal}`, rowId: rId, col: col, isBdl: true }); 
                            addFlag(col);
                        }
                    }
                });
            }

            if (i > 0 && !isNaN(from)) {
                const prev = holeData[i-1], prevTo = parseFloat(prev[c_to]);
                if (!isNaN(prevTo)) {
                    const diff = from - prevTo;
                    if (diff < -0.01) { 
                        logs.push({ type: 'Critical', hole: holeId, depth: `${from}`, message: `Overlap hitting Depth ${prevTo}.`, rowId: rId, col: c_from }); 
                        addFlag(c_from); addPrevFlag(prev._id, c_to); 
                    } 
                    else if (diff > 0.01) { 
                        logs.push({ type: 'Warning', hole: holeId, depth: `${prevTo} - ${from}`, message: `Missing interval (Gap).`, rowId: rId, col: c_from }); 
                        addFlag(c_from); addPrevFlag(prev._id, c_to); 
                    }
                }
                
                if (checkSpikes && i < holeData.length - 1) {
                    const next = holeData[i+1];
                    assayCols.forEach(col => {
                        const currVal = parseFloat(current[col]), prevVal = parseFloat(prev[col]), nextVal = parseFloat(next[col]);
                        if(!isNaN(currVal) && !isNaN(prevVal) && !isNaN(nextVal) && prevVal > 0 && nextVal > 0) {
                            if(((currVal - prevVal) / prevVal) > 1.0 && ((currVal - nextVal) / nextVal) > 0.5 && Math.abs(currVal - prevVal) > 0.5) {
                                logs.push({ type: 'Warning', hole: holeId, depth: `${current[c_from]}-${current[c_to]}`, message: `Spike Anomaly [${col}] jump to ${currVal}.`, rowId: rId, col: col }); 
                                addFlag(col);
                            }
                        }
                    });
                }
            }
        }
    });
    return logs;
}

function runQAQC() {
    state.qaqcLogs = generateQAQCLogs(state.rawData, true); 
    renderQAQCSummary();
}

function renderQAQCSummary() {
    const statTotal = document.getElementById('qaqc-stat-total');
    const statCritical = document.getElementById('qaqc-stat-critical');
    const statWarning = document.getElementById('qaqc-stat-warning');
    const statError = document.getElementById('qaqc-stat-error');
    
    if (statTotal) statTotal.textContent = state.qaqcLogs.length;
    if (statCritical) statCritical.textContent = state.qaqcLogs.filter(l => l.type === 'Critical').length;
    if (statWarning) statWarning.textContent = state.qaqcLogs.filter(l => l.type === 'Warning').length;
    if (statError) statError.textContent = state.qaqcLogs.filter(l => l.type === 'Error').length;
}

function renderElementStatistics() {
    const tableContainer = document.getElementById('qaqc-table-container');
    if (!tableContainer) return;

    let statsContainer = document.getElementById('qaqc-element-stats');
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'qaqc-element-stats';
        statsContainer.className = 'mb-6 shrink-0 overflow-hidden rounded-xl border border-slate-300 shadow-sm bg-white animate-fade-in w-full';
        tableContainer.parentNode.insertBefore(statsContainer, tableContainer);
    }

    if (state.rawData.length === 0) {
        statsContainer.classList.add('hidden');
        return;
    }
    statsContainer.classList.remove('hidden');

    const targetAssays = ['ni', 'fe', 'co', 'al2o3', 'sio2', 'cao', 'mgo', 'cr2o3', 'mno', 'cr', 'fe2o3', 'fe203'];
    let availableCols = state.headers.filter(h => h && targetAssays.includes(String(h).toLowerCase().trim()));

    if (availableCols.length === 0) {
        state.headers.forEach(h => {
            if(h) {
                const hLow = String(h).toLowerCase().trim();
                if (hLow.length <= 6 && !['hole_id', 'hole id', 'from', 'to', 'length', 'x', 'y', 'z', 'dip', 'azimuth'].includes(hLow)) {
                    if(availableCols.length < 10) availableCols.push(h);
                }
            }
        });
    }

    if (availableCols.length === 0) {
        statsContainer.innerHTML = '<div class="p-4 text-center text-slate-500 font-bold">Assay columns not found for statistical calculation.</div>';
        return;
    }

    const statsData = availableCols.map(col => {
        const rawVals = state.rawData.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        const count = rawVals.length;
        if (count === 0) return { col, count: 0, errors: state.qaqcLogs ? state.qaqcLogs.filter(l => l.col === col).length : 0 };

        const sum = rawVals.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        
        const variance = count > 1 ? rawVals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (count - 1) : 0;
        const stdev = Math.sqrt(variance);
        
        let min = Infinity, max = -Infinity, dl = Infinity;
        for (let i = 0; i < count; i++) {
            let v = rawVals[i];
            if (v < min) min = v;
            if (v > max) max = v;
            if (v > 0 && v < dl) dl = v;
        }
        if (min === Infinity) min = 0;
        if (max === -Infinity) max = 0;
        if (dl === Infinity) dl = 0;
        
        const range = max - min;
        const cv = mean > 0 ? (stdev / mean) * 100 : 0;
        const errors = state.qaqcLogs ? state.qaqcLogs.filter(l => l.col === col).length : 0;

        return {
            col, count, mean, stdev, min, max, range, dl, cv, errors,
            m3d: mean - 3 * stdev,
            m2d: mean - 2 * stdev,
            p2d: mean + 2 * stdev,
            p3d: mean + 3 * stdev,
            dl5: 5 * dl
        };
    });

    // PERBAIKAN: Menghapus 'uppercase' dari baris <thead> agar format teks unsur mengikuti aslinya dari CSV.
    let html = `
        <div class="bg-slate-50 border-b border-slate-200 p-3 text-left relative z-20 shadow-sm flex items-center gap-2">
            <h3 class="font-bold text-slate-700 text-xs tracking-widest uppercase">Global Element Statistics</h3>
        </div>
        <div class="overflow-x-auto overflow-y-auto custom-scrollbar max-h-[40vh]">
            <table class="w-full text-center border-collapse whitespace-nowrap text-[11px] md:text-xs">
                <thead class="sticky top-0 z-10 shadow-sm">
                    <tr class="text-slate-600 font-black tracking-wider bg-slate-100 border-b border-slate-200">
                        <th class="p-3 border-r border-slate-200 uppercase">Statistic</th>
                        ${availableCols.map(c => `<th class="p-3 border-r border-slate-200">%${c}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-700 bg-white">
    `;

    const addRow = (label, key, isErrorRow = false, formatter = (v) => v.toFixed(3)) => {
        html += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-2.5 font-bold text-slate-600 border-r border-slate-100 bg-slate-50 shadow-[inset_0_0_2px_rgba(0,0,0,0.02)]">${label}</td>
                ${statsData.map(d => {
                    if (d.count === 0 && key !== 'errors') return `<td class="p-2.5 border-r border-slate-100">-</td>`;
                    let val = d[key];
                    let text = typeof formatter === 'function' && d.count > 0 ? formatter(val) : val;
                    let cellClass = "p-2.5 border-r border-slate-100 font-mono font-medium";
                    
                    if (isErrorRow) {
                        if (val > 0) cellClass += " text-rose-600 font-black"; 
                        else cellClass += " text-slate-400";
                    }
                    
                    return `<td class="${cellClass}">${text}</td>`;
                }).join('')}
            </tr>
        `;
    };

    addRow('Count of Analyzed', 'count', false, v => v); 
    addRow('Mean', 'mean');
    addRow('STDEV', 'stdev');
    addRow('-3d', 'm3d');
    addRow('-2d', 'm2d');
    addRow('+2d', 'p2d');
    addRow('+3d', 'p3d');
    addRow('DL', 'dl');
    addRow('5DL', 'dl5');
    addRow('Max', 'max');
    addRow('Min', 'min');
    addRow('Range', 'range');
    addRow('CV', 'cv');
    addRow('Error Count', 'errors', true, v => v); 

    html += `
                </tbody>
            </table>
        </div>
    `;

    statsContainer.innerHTML = html;
}

function renderQAQC() {
    const badge = document.getElementById('qaqc-badge');
    const tableContainer = document.getElementById('qaqc-table-container');
    const tbody = document.getElementById('qaqc-tbody');
    const hasBdlLogs = state.qaqcLogs ? state.qaqcLogs.some(l => l.isBdl) : false;
    
    renderElementStatistics();

    let emptyState = document.getElementById('qaqc-empty-state');
    if (!emptyState && tableContainer) {
        emptyState = document.createElement('div');
        emptyState.id = 'qaqc-empty-state';
        emptyState.className = 'hidden flex-col items-center justify-center flex-grow bg-emerald-50 rounded-xl border border-emerald-200 p-10 shadow-inner h-full min-h-[400px]';
        emptyState.innerHTML = `
            <div class="bg-white p-5 rounded-full shadow-sm mb-4 border border-emerald-100">
                <i data-lucide="shield-check" class="w-16 h-16 text-emerald-500 drop-shadow-sm"></i>
            </div>
            <h3 class="text-2xl font-black text-emerald-800 mb-2 tracking-tight">Database Integrity Passed 100%</h3>
            <p class="text-sm font-medium text-emerald-600/80 text-center max-w-md">
                Excellent! No anomalies were detected based on the current filter parameters. The database is perfectly clean and ready for compositing.
            </p>
        `;
        tableContainer.parentNode.insertBefore(emptyState, tableContainer.nextSibling);
    }
    
    let fixBtnContainer = document.getElementById('qaqc-fix-actions');
    if (!fixBtnContainer) {
        const actionsPanel = document.getElementById('actions-qaqc');
        if (actionsPanel) {
            fixBtnContainer = document.createElement('div');
            fixBtnContainer.id = 'qaqc-fix-actions';
            fixBtnContainer.className = 'w-full mt-2 shrink-0';
            
            const filterScrollContainer = document.getElementById('qaqc-filter-scroll-container');
            if (filterScrollContainer && filterScrollContainer.nextSibling) {
                actionsPanel.insertBefore(fixBtnContainer, filterScrollContainer.nextSibling);
            } else {
                actionsPanel.appendChild(fixBtnContainer);
            }
        }
    }

    if (fixBtnContainer) {
        if (hasBdlLogs) {
            fixBtnContainer.classList.remove('hidden');
            fixBtnContainer.innerHTML = `
                <button onclick="autoFixBDLValues()" class="w-full bg-slate-800 hover:bg-slate-900 text-teal-400 py-3 rounded-lg flex items-center justify-center gap-2 font-bold shadow-md text-sm transition-colors animate-pulse mb-2">
                    <i data-lucide="wand-2" class="w-4 h-4"></i> Auto-Fix BDL (0 & <)
                </button>
            `;
        } else {
            fixBtnContainer.classList.add('hidden');
        }
    }

    if (state.qaqcLogs && state.qaqcLogs.length > 0) {
        if(badge) { badge.classList.remove('hidden'); badge.textContent = state.qaqcLogs.length; }
        if(emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
        if(tableContainer) tableContainer.classList.remove('hidden');
        
        const maxDisplay = 300, displayLogs = state.qaqcLogs.slice(0, maxDisplay);
        
        let html = displayLogs.map(log => {
            let badgeClass = 'bg-amber-100 text-amber-700 border border-amber-200';
            if (log.type === 'Critical') badgeClass = 'bg-rose-100 text-rose-700 border border-rose-200';
            else if (log.type === 'Error') badgeClass = 'bg-orange-100 text-orange-700 border border-orange-200';
            
            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="p-3"><span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-widest ${badgeClass}">${log.type}</span></td>
                <td class="p-3 font-bold text-slate-800">${log.hole}</td>
                <td class="p-3 font-mono text-slate-500 font-semibold">${log.depth}</td>
                <td class="p-3 text-slate-600 font-medium">${log.message}</td>
                <td class="p-3 text-center"><button onclick="openEditModalAndScroll(${log.rowId})" class="bg-slate-800 text-teal-400 hover:bg-slate-900 px-4 py-2 rounded text-[10px] uppercase font-bold tracking-wide transition-all shadow-sm">Fix Issue</button></td>
            </tr>`;
        }).join('');
        
        if (state.qaqcLogs.length > maxDisplay) {
            html += `<tr><td colspan="5" class="p-4 text-center text-amber-700 bg-amber-50 font-bold text-xs border-t border-amber-200 shadow-inner">Displaying first ${maxDisplay} logs. Export for full details.</td></tr>`;
        }
        if(tbody) tbody.innerHTML = html;
        
    } else { 
        if(badge) badge.classList.add('hidden'); 
        if(tableContainer) tableContainer.classList.add('hidden');
        if(emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
    }
    
    renderAuditButton();
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function autoFixBDLValues() {
    if (!confirm("Auto-Fix BDL will perform:\n1. Zeros (0) will be replaced with the lowest detection limit > 0.\n2. Text limits like '<0.1' will be parsed to half the absolute value (0.05) per JORC standard.\n\nContinue?")) return;

    let changesMade = 0;
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    const minValuesMap = {};
    if (state.qaqcZeroCols) {
        state.qaqcZeroCols.forEach(col => {
            const validVals = state.rawData.map(d => parseFloat(d[col])).filter(v => !isNaN(v) && v > 0);
            if (validVals.length > 0) {
                minValuesMap[col] = validVals.reduce((min, p) => p < min ? p : min, validVals[0]);
            }
        });
    }

    state.rawData.forEach(row => {
        if (!state.qaqcZeroCols) return;
        state.qaqcZeroCols.forEach(col => {
            const rawVal = row[col];
            if (rawVal === '') return;

            let newVal = null;

            if (parseFloat(rawVal) === 0 && minValuesMap[col] !== undefined) {
                newVal = minValuesMap[col].toString();
            } 
            else if (typeof rawVal === 'string' && rawVal.trim().startsWith('<')) {
                const limitNum = parseFloat(rawVal.replace('<', '').trim());
                if (!isNaN(limitNum)) newVal = (limitNum / 2).toString();
            }

            if (newVal !== null) {
                state.auditTrail.push({ 
                    Row_ID: row._id,
                    Waktu_Edit: timestamp, Hole_ID: row[state.coreCols.holeId] || 'N/A', 
                    Depth_From: row[state.coreCols.from] || 'N/A', Depth_To: row[state.coreCols.to] || 'N/A', 
                    Kolom_Diedit: col, Nilai_Lama: rawVal, Nilai_Baru: newVal 
                });
                row[col] = newVal;
                changesMade++;
            }
        });
    });

    if (changesMade > 0) {
        if (state.domainedData && state.domainedData.length > 0) {
            if(typeof runPipeline === 'function') runPipeline(); 
        } else {
            runQAQC();
            renderQAQC();
        }
        
        showToast(`${changesMade} BDL values successfully normalized. Audit trail updated.`, "success");
        renderAuditButton();
    } else {
        showToast("No data requires adjustment.", "info");
    }
}

function openEditModal() {
    if (state.rawData.length === 0) return;
    const modal = document.getElementById('edit-modal'), thead = document.getElementById('edit-thead'), tbody = document.getElementById('edit-tbody');
    const maxPage = Math.ceil(state.rawData.length / state.editRowsPerPage);
    if (state.editPage < 1) state.editPage = 1; if (state.editPage > maxPage) state.editPage = maxPage;
    
    const pageInfo = document.getElementById('edit-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${state.editPage} / ${maxPage}`;
    const pageControls = document.getElementById('edit-pagination-controls');
    if (pageControls) pageControls.classList.remove('hidden');
    
    thead.innerHTML = `<tr><th class="p-3 border-r border-slate-700 font-bold bg-[#0f172a] w-12 text-center">#</th>${state.headers.map(h => `<th class="p-3 border-r border-slate-700 font-bold">${h}</th>`).join('')}</tr>`;
    const startIndex = (state.editPage - 1) * state.editRowsPerPage, endIndex = startIndex + state.editRowsPerPage, pageData = state.rawData.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageData.map((row, relativeIdx) => {
        return `<tr id="edit-row-${row._id}" class="hover:bg-slate-50 transition-colors"><td class="p-2 border-r border-b border-slate-200 bg-slate-100 text-slate-500 text-center text-xs font-mono font-bold">${startIndex + relativeIdx + 1}</td>${state.headers.map(h => {
            const hasError = state.errorMap[row._id] && state.errorMap[row._id][h];
            const errClass = hasError ? 'bg-rose-50 text-rose-800 font-bold border-rose-300 ring-inset ring-2 ring-rose-400' : 'border-r border-b border-slate-200';
            return `<td contenteditable="true" data-id="${row._id}" data-col="${h}" class="p-2 min-w-[80px] outline-none text-slate-700 ${errClass}">${row[h]}</td>`;
        }).join('')}</tr>`;
    }).join('');
    modal.classList.remove('hidden');
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function changeEditPage(direction) { saveEditedDataSilent(); state.editPage += direction; openEditModal(); }
function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }
function openEditModalAndScroll(rowId) {
    const rowIndex = state.rawData.findIndex(r => r._id == rowId);
    if (rowIndex !== -1) state.editPage = Math.floor(rowIndex / state.editRowsPerPage) + 1;
    openEditModal();
    setTimeout(() => { const targetRow = document.getElementById(`edit-row-${rowId}`); if (targetRow) { targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); targetRow.classList.add('flash-highlight'); setTimeout(() => { targetRow.classList.remove('flash-highlight'); }, 2000); } }, 100);
}

function saveEditedDataSilent() {
    const cells = document.querySelectorAll('#edit-tbody td[contenteditable="true"]'); let changesMade = 0; const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    cells.forEach(cell => {
        const id = cell.getAttribute('data-id'), col = cell.getAttribute('data-col'), val = cell.textContent.trim(), targetRow = state.rawData.find(r => r._id == id);
        if (targetRow && targetRow[col] !== val) {
            state.auditTrail.push({ 
                Row_ID: targetRow._id,
                Waktu_Edit: timestamp, Hole_ID: targetRow[state.coreCols.holeId] || 'N/A', Depth_From: targetRow[state.coreCols.from] || 'N/A', Depth_To: targetRow[state.coreCols.to] || 'N/A', Kolom_Diedit: col, Nilai_Lama: targetRow[col], Nilai_Baru: val 
            });
            targetRow[col] = val; changesMade++;
        }
    }); return changesMade;
}

function saveEditedData() {
    const changesMade = saveEditedDataSilent(); 
    closeEditModal(); 
    
    if (state.domainedData && state.domainedData.length > 0) {
        if(typeof runPipeline === 'function') runPipeline();
    } else {
        runQAQC(); 
        renderQAQC();
    }
    
    if (changesMade > 0) {
        showToast(`${changesMade} changes applied. Audit Trail updated.`, "success"); 
    } else {
        showToast("No changes detected.", "info");
    }
}

// ==========================================
// CENTRAL EXPORT & MULTI-SHEET REPORTS
// ==========================================

function renderAuditButton() { 
    const btn = document.getElementById('btn-download-audit');
    if (btn && state.rawData.length > 0) {
        btn.classList.remove('hidden');
        btn.innerHTML = `<i data-lucide="folder-output" class="w-4 h-4"></i> Export Reports & Stats`;
        btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700', 'bg-indigo-600', 'hover:bg-indigo-700');
        btn.classList.add('bg-slate-800', 'hover:bg-slate-900');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function downloadAuditTrail() {
    if (state.rawData.length === 0) return;
    
    const modalId = 'export-stats-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        document.body.appendChild(modal);
    }
    
    const hasEdits = state.auditTrail.length > 0;

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
            <div class="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <i data-lucide="file-spreadsheet" class="text-teal-600"></i> Export Validation Reports
                </h3>
                <button onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-rose-500 transition-colors">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            
            <div class="p-6 flex flex-col gap-3">
                <p class="text-xs text-slate-500 mb-2 font-medium">Select the reports you want to export. Multiple selections will be exported as sheets within a single Excel file.</p>
                
                <label class="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 py-3 px-4 rounded-xl flex items-center gap-3 transition-colors border border-slate-300 group shadow-sm hover:shadow cursor-pointer">
                    <input type="checkbox" id="export-chk-pre" class="w-5 h-5 text-teal-600 rounded cursor-pointer" checked>
                    <div class="bg-slate-200 p-2 rounded-lg text-slate-600 group-hover:bg-slate-300 transition-colors"><i data-lucide="bar-chart-big" class="w-5 h-5"></i></div>
                    <div class="text-left flex-grow">
                        <div class="leading-none mb-1 text-slate-800 font-bold text-sm">Pre-Validation Stats</div>
                        <div class="text-[10px] text-slate-500 font-normal">Original data statistics (Before fixes)</div>
                    </div>
                </label>

                <label class="w-full bg-teal-50 hover:bg-teal-100 text-teal-800 py-3 px-4 rounded-xl flex items-center gap-3 transition-colors border border-teal-200 group shadow-sm hover:shadow cursor-pointer">
                    <input type="checkbox" id="export-chk-post" class="w-5 h-5 text-teal-600 rounded cursor-pointer" checked>
                    <div class="bg-teal-600 p-2 rounded-lg text-white"><i data-lucide="line-chart" class="w-5 h-5"></i></div>
                    <div class="text-left flex-grow">
                        <div class="leading-none mb-1 font-bold text-sm">Post-Validation Stats</div>
                        <div class="text-[10px] text-teal-700/80 font-normal">Current data statistics (After fixes)</div>
                    </div>
                </label>

                <div class="border-t border-slate-100 my-2"></div>

                <label class="w-full ${hasEdits ? 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 shadow-sm hover:shadow cursor-pointer' : 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed opacity-70'} py-3 px-4 rounded-xl flex items-center gap-3 transition-colors border group">
                    <input type="checkbox" id="export-chk-audit" class="w-5 h-5 text-teal-600 rounded" ${hasEdits ? 'checked' : 'disabled'}>
                    <div class="${hasEdits ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-400'} p-2 rounded-lg"><i data-lucide="history" class="w-5 h-5"></i></div>
                    <div class="text-left flex-grow">
                        <div class="leading-none mb-1 font-bold text-sm">Audit Trail Log (History)</div>
                        <div class="text-[10px] ${hasEdits ? 'text-slate-500' : 'text-slate-400'} font-normal">${hasEdits ? 'Record of all manual & auto-fixes' : 'No data changes detected yet'}</div>
                    </div>
                </label>
            </div>
            
            <div class="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                <button onclick="executeMultiExport()" class="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg font-bold text-sm shadow-md transition-colors flex items-center gap-2">
                    <i data-lucide="download" class="w-4 h-4"></i> Download Selected
                </button>
            </div>
        </div>
    `;
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function getStatsData(isBefore) {
    let dataset = state.rawData;
    let targetLogs = state.qaqcLogs || [];
    
    if (isBefore && state.auditTrail.length > 0) {
        dataset = state.rawData.map(row => ({...row})); 
        for (let i = state.auditTrail.length - 1; i >= 0; i--) {
            const log = state.auditTrail[i];
            const row = dataset.find(r => {
                if (log.Row_ID !== undefined) return r._id === log.Row_ID;
                const hId = r[state.coreCols.holeId] || 'N/A';
                const dFrom = r[state.coreCols.from] || 'N/A';
                const dTo = r[state.coreCols.to] || 'N/A';
                return hId == log.Hole_ID && dFrom == log.Depth_From && dTo == log.Depth_To;
            });
            if (row) {
                row[log.Kolom_Diedit] = log.Nilai_Lama;
            }
        }
        targetLogs = generateQAQCLogs(dataset, false); 
    }

    const targetAssays = ['ni', 'fe', 'co', 'al2o3', 'sio2', 'cao', 'mgo', 'cr2o3', 'mno', 'cr', 'fe2o3', 'fe203'];
    
    let availableCols = state.headers.filter(h => h && targetAssays.includes(String(h).toLowerCase().trim()));
    if (availableCols.length === 0) {
        state.headers.forEach(h => {
            if(h) {
                const hLow = String(h).toLowerCase().trim();
                if (hLow.length <= 6 && !['hole_id', 'hole id', 'from', 'to', 'length', 'x', 'y', 'z', 'dip', 'azimuth'].includes(hLow)) {
                    if(availableCols.length < 10) availableCols.push(h);
                }
            }
        });
    }

    if(availableCols.length === 0) return null;

    const statsData = availableCols.map(col => {
        const rawVals = dataset.map(row => parseFloat(row[col])).filter(v => !isNaN(v));
        const count = rawVals.length;
        if(count === 0) return { col, count: 0, errors: targetLogs ? targetLogs.filter(l => l.col === col).length : 0 };
        
        const sum = rawVals.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        
        const variance = count > 1 ? rawVals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (count - 1) : 0;
        const stdev = Math.sqrt(variance);
        
        let min = Infinity, max = -Infinity, dl = Infinity;
        for (let i = 0; i < count; i++) {
            let v = rawVals[i];
            if (v < min) min = v;
            if (v > max) max = v;
            if (v > 0 && v < dl) dl = v;
        }
        if (min === Infinity) min = 0;
        if (max === -Infinity) max = 0;
        if (dl === Infinity) dl = 0;
        
        const range = max - min;
        const cv = mean > 0 ? (stdev / mean) * 100 : 0;
        const errors = targetLogs ? targetLogs.filter(l => l.col === col).length : 0; 

        return { col, count, mean, stdev, m3d: mean - 3*stdev, m2d: mean - 2*stdev, p2d: mean + 2*stdev, p3d: mean + 3*stdev, dl, dl5: 5*dl, max, min, range, cv, errors };
    });

    let excelRows = [];
    const pushStatRow = (metricName, key, isFloat=true) => {
        let rowObj = { "Metric": metricName };
        statsData.forEach(d => {
            let val = '-';
            if (d.count > 0 && d[key] !== 'N/A') {
                val = isFloat ? parseFloat(d[key].toFixed(3)) : d[key];
            } else if (d[key] === 'N/A') {
                val = 'N/A';
            }
            rowObj[`%${d.col}`] = val;
        });
        excelRows.push(rowObj);
    };

    pushStatRow('Count of Analyzed', 'count', false);
    pushStatRow('Mean', 'mean');
    pushStatRow('STDEV', 'stdev');
    pushStatRow('-3d', 'm3d');
    pushStatRow('-2d', 'm2d');
    pushStatRow('+2d', 'p2d');
    pushStatRow('+3d', 'p3d');
    pushStatRow('DL', 'dl');
    pushStatRow('5DL', 'dl5');
    pushStatRow('Max', 'max');
    pushStatRow('Min', 'min');
    pushStatRow('Range', 'range');
    pushStatRow('CV', 'cv');
    pushStatRow('Error Count', 'errors', false); 
    
    return excelRows;
}

function executeMultiExport() {
    const wantPre = document.getElementById('export-chk-pre')?.checked;
    const wantPost = document.getElementById('export-chk-post')?.checked;
    const wantAudit = document.getElementById('export-chk-audit')?.checked && !document.getElementById('export-chk-audit')?.disabled;

    if (!wantPre && !wantPost && !wantAudit) {
        showToast("Please select at least one report to export.", "warning");
        return;
    }

    showLabOverlay("Preparing Excel Export", "Compiling statistical table data...");
    
    setTimeout(() => {
        if (typeof XLSX === 'undefined') {
            hideLabOverlay();
            showToast("SheetJS library is not loaded. Cannot export to Excel.", "error");
            return;
        }

        const wb = XLSX.utils.book_new();
        let sheetsAdded = 0;

        if (wantPre) {
            const preData = getStatsData(true);
            if (preData) {
                const wsPre = XLSX.utils.json_to_sheet(preData);
                XLSX.utils.book_append_sheet(wb, wsPre, "Pre-Validation Stats");
                sheetsAdded++;
            }
        }

        if (wantPost) {
            const postData = getStatsData(false);
            if (postData) {
                const wsPost = XLSX.utils.json_to_sheet(postData);
                XLSX.utils.book_append_sheet(wb, wsPost, "Post-Validation Stats");
                sheetsAdded++;
            }
        }

        if (wantAudit) {
            const auditDataFormatted = state.auditTrail.map(log => {
                const { Row_ID, ...rest } = log;
                return rest;
            });
            const wsAudit = XLSX.utils.json_to_sheet(auditDataFormatted);
            XLSX.utils.book_append_sheet(wb, wsAudit, "Audit Trail");
            sheetsAdded++;
        }

        if (sheetsAdded > 0) {
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
            const fileName = `NiCore_Validation_Reports_${dateStr}.xlsx`;
            
            XLSX.writeFile(wb, fileName);
            showToast("Reports successfully exported to Excel.", "success");
        } else {
            showToast("No data available to export.", "error");
        }

        hideLabOverlay();
        const modal = document.getElementById('export-stats-modal');
        if (modal) modal.remove();

    }, 500); 
}

function downloadQAQCLog() {
    if (state.qaqcLogs.length === 0) { showToast("No anomalies found.", "info"); return; }
    const csvContent = ['Severity,Hole_ID,Depth_Interval,Anomaly_Description'].concat(state.qaqcLogs.map(l => `"${l.type}","${l.hole}","${l.depth}\t","${l.message}"`)).join('\r\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = 'NiCore_Database_Validation_Report.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast("Log downloaded successfully.", "success");
}

// ==========================================
// SECTION B: LAB QA/QC ANALYTICS (MODUL TERPADU)
// ==========================================

// --- UTILITIES LAB & AESTHETIC LOADER ---
let labLoaderTimeout = null;

function showLabOverlay(title, desc) {
    let loader = document.getElementById('lab-render-overlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'lab-render-overlay';
        loader.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex flex-col items-center justify-center transition-all duration-300 opacity-0 pointer-events-none';
        loader.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full text-center transform scale-95 transition-transform duration-300" id="lab-loader-box">
                <div class="relative w-20 h-20 mb-6">
                    <div class="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-teal-600 rounded-full border-t-transparent animate-spin"></div>
                    <i data-lucide="file-text" class="absolute inset-0 m-auto w-8 h-8 text-teal-600 animate-pulse"></i>
                </div>
                <h3 id="lab-loader-title" class="text-xl font-black text-slate-800 mb-2">Processing Data</h3>
                <p id="lab-loader-desc" class="text-sm font-medium text-slate-500">Please wait a moment...</p>
            </div>
        `;
        document.body.appendChild(loader);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    document.getElementById('lab-loader-title').textContent = title;
    document.getElementById('lab-loader-desc').textContent = desc;
    
    if (labLoaderTimeout) clearTimeout(labLoaderTimeout);
    
    labLoaderTimeout = setTimeout(() => {
        if(loader) {
            loader.classList.remove('opacity-0', 'pointer-events-none');
            loader.classList.add('opacity-100');
            const box = document.getElementById('lab-loader-box');
            if(box) {
                box.classList.remove('scale-95');
                box.classList.add('scale-100');
            }
        }
    }, 10);
}

function hideLabOverlay() {
    if (labLoaderTimeout) clearTimeout(labLoaderTimeout);
    
    const loader = document.getElementById('lab-render-overlay');
    if (loader) {
        loader.classList.remove('opacity-100');
        loader.classList.add('opacity-0', 'pointer-events-none');
        const box = document.getElementById('lab-loader-box');
        if (box) {
            box.classList.remove('scale-100');
            box.classList.add('scale-95');
        }
    }
}

function parseCleanNumber(valStr) {
    if (valStr === undefined || valStr === null) return NaN;
    let s = valStr.toString().trim();
    if (s === '') return NaN;
    s = s.replace(/</g, '').replace(/>/g, ''); 
    if (s.includes(',') && s.includes('.')) {
        let lastComma = s.lastIndexOf(',');
        let lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(/,/g, '.');
        else s = s.replace(/,/g, ''); 
    } else if (s.includes(',')) {
        s = s.replace(/,/g, '.'); 
    }
    return parseFloat(s);
}

const excelBorderPlugin = {
    id: 'excelBorder',
    beforeDraw: (chart) => {
        const ctx = chart.ctx;
        const {top, left, bottom, right} = chart.chartArea;
        ctx.save(); ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
        ctx.strokeRect(left, top, right - left, bottom - top); ctx.restore();
    }
};
if (typeof Chart !== 'undefined') Chart.register(excelBorderPlugin);

// --- STATE LAB ---
const labState = {
    blank: { data: [], cols: [], batuanCol: null, chart: null },
    dup: { raw: [], numCols: [], pairs: [], charts: { rel: null, sct: null, cum: null } },
    std: { raw: [], numCols: [], crmNames: [], config: {}, chart: null, remarksCol: null }
};

// --- DOM INJECTION MURNI ---
function injectQAQCLabUI() {
    let tabLab = document.getElementById('tab-qaqclab') || document.querySelector("div[id*='qaqclab']");
    let actionLab = document.getElementById('actions-qaqclab') || document.querySelector("div[id*='actions-qaqclab']");
    
    if (!tabLab) {
        const contents = document.querySelectorAll('.tab-content');
        tabLab = Array.from(contents).find(el => el.innerHTML.includes('Blank Control Chart') || el.innerHTML.includes('Validasi Blank'));
    }
    if (!actionLab) {
        const actions = document.querySelectorAll('[id^="actions-"]');
        actionLab = Array.from(actions).find(el => el.id.includes('lab') || el.innerHTML.includes('Upload Master CRM') || el.innerHTML.includes('Upload Lab Report'));
    }

    if (!tabLab || !actionLab) {
        console.error("Lab QA/QC DOM not found! Failed to inject UI.");
        return;
    }
    
    if (document.getElementById('lab-module-wrapper')) return;

    ['blankPdfModal', 'dupPdfModal', 'stdPdfModal', 'export-stats-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    tabLab.innerHTML = `
    <div id="lab-module-wrapper" class="flex flex-col h-full w-full">
        <div class="flex items-center justify-between mb-4 shrink-0 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
            <nav class="flex space-x-2" id="navTabsLab">
                <button onclick="switchLabTab('blank')" id="tabBtn-blank" class="px-4 py-2 font-bold text-sm rounded-lg transition-colors bg-emerald-100 text-emerald-800 shadow-sm"><i data-lucide="droplet" class="w-4 h-4 inline-block mr-1"></i> Blank Validation</button>
                <button onclick="switchLabTab('duplicate')" id="tabBtn-duplicate" class="px-4 py-2 font-bold text-sm rounded-lg transition-colors text-slate-600 hover:bg-slate-100 border border-transparent"><i data-lucide="copy" class="w-4 h-4 inline-block mr-1"></i> Duplicate Validation</button>
                <button onclick="switchLabTab('standard')" id="tabBtn-standard" class="px-4 py-2 font-bold text-sm rounded-lg transition-colors text-slate-600 hover:bg-slate-100 border border-transparent"><i data-lucide="target" class="w-4 h-4 inline-block mr-1"></i> Standard (CRM) Validation</button>
            </nav>
        </div>
        
        <div class="flex-grow overflow-y-auto custom-scrollbar pb-10 pr-2">
            <div id="module-blank" class="space-y-4 block">
                <div id="blankDashboard" class="hidden flex-col space-y-4 animate-fade-in">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-slate-400">
                            <p class="text-[10px] font-bold text-slate-500 uppercase">Filtered Samples</p>
                            <p id="blankTotalSample" class="text-3xl font-black text-slate-800">0</p>
                        </div>
                        <div class="bg-emerald-50 p-4 rounded-xl shadow-sm border-l-4 border-emerald-500">
                            <p class="text-[10px] font-bold text-emerald-600 uppercase">Passed Validation</p>
                            <p id="blankTotalPass" class="text-3xl font-black text-emerald-700">0</p>
                        </div>
                        <div class="bg-rose-50 p-4 rounded-xl shadow-sm border-l-4 border-rose-500">
                            <p class="text-[10px] font-bold text-rose-600 uppercase">Failed Validation</p>
                            <p id="blankTotalFail" class="text-3xl font-black text-rose-700">0</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" id="blankPdfCaptureArea">
                        <div id="blankPdfChartArea" class="lg:col-span-2 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <div class="relative flex-grow min-h-[350px] w-full">
                                <canvas id="blankChart"></canvas>
                            </div>
                        </div>
                        <div id="blankPdfTableArea" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <h3 class="text-[11px] font-black text-slate-600 mb-3 text-center uppercase tracking-widest">Element Statistics</h3>
                            <div id="blankTableContainer" class="overflow-x-auto max-h-[350px] border border-slate-200 rounded-lg custom-scrollbar">
                                <table class="w-full text-xs text-center whitespace-nowrap border-collapse">
                                    <thead class="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-500 shadow-sm z-10"><tr id="blankSummaryHead"></tr></thead>
                                    <tbody id="blankSummaryBody" class="divide-y divide-slate-100 bg-white"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div class="overflow-auto max-h-[400px] custom-scrollbar">
                            <table class="w-full text-xs text-left whitespace-nowrap">
                                <thead id="blankDataTableHead" class="text-slate-500 uppercase bg-slate-100 sticky top-0 z-10 shadow-sm border-b border-slate-200"><tr><th class="px-4 py-3">Awaiting Data...</th></tr></thead>
                                <tbody id="blankDataTableBody" class="divide-y divide-slate-100"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div id="module-duplicate" class="space-y-4 hidden">
                <div id="dupDashboard" class="hidden flex-col space-y-4 animate-fade-in">
                    <div class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border-l-4 border-slate-400">
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">JORC Filtered (> 5x DL): <span id="dupTotalPairs" class="text-2xl font-black text-slate-800 block mt-1">0</span></div>
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Passed Precision: <span id="dupPassCount" class="text-2xl font-black text-emerald-600 block mt-1">0</span></div>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 class="text-[11px] font-black text-slate-600 mb-3 text-center uppercase tracking-widest">Duplicate Precision Statistics</h3>
                        <div id="dupSummaryWrap" class="overflow-x-auto border border-slate-200 rounded-lg custom-scrollbar">
                            <table class="w-full text-sm text-center whitespace-nowrap border-collapse">
                                <thead class="bg-slate-100 text-slate-500 border-b border-slate-200"><tr id="dupSummaryHead"></tr></thead>
                                <tbody id="dupSummaryBody" class="divide-y divide-slate-100 bg-white"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="text-[11px] font-black text-slate-600 uppercase tracking-widest">Data Review (<span id="dupReviewEl" class="text-teal-600"></span>)</h3>
                            <span class="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">Original & Duplicate</span>
                        </div>
                        <div class="overflow-auto border border-slate-200 rounded-lg max-h-[350px] custom-scrollbar">
                            <table class="w-full text-xs text-center whitespace-nowrap border-collapse">
                                <thead class="bg-slate-100 text-slate-500 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                    <tr>
                                        <th class="px-4 py-2 border-r border-slate-200">Sample ID</th><th class="px-4 py-2 border-r border-slate-200">Original</th><th class="px-4 py-2 border-r border-slate-200">Duplicate</th><th class="px-4 py-2 border-r border-slate-200">Average</th><th class="px-4 py-2 border-r border-slate-200">Abs. Diff</th><th class="px-4 py-2 border-r border-slate-200">Rel. Error (%)</th><th class="px-4 py-2 bg-slate-100">Status</th>
                                    </tr>
                                </thead>
                                <tbody id="dupDataTableBody" class="divide-y divide-slate-100 bg-white"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex flex-col space-y-4">
                        <div id="dupChart1Wrap" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200"><div class="relative h-[400px] w-full"><canvas id="dupChartRelDiff"></canvas></div></div>
                        <div id="dupChart2Wrap" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200"><div class="relative h-[400px] w-full"><canvas id="dupChartScatter"></canvas></div></div>
                        <div id="dupChart3Wrap" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200"><div class="relative h-[400px] w-full"><canvas id="dupChartCumFreq"></canvas></div></div>
                    </div>
                </div>
            </div>

            <div id="module-standard" class="space-y-4 hidden">
                <div id="stdDashboard" class="hidden flex-col space-y-4 animate-fade-in">
                    <div id="stdStatsGrid" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-slate-400">
                            <p class="text-[10px] font-bold text-slate-500 uppercase">Total Samples</p>
                            <p id="stdStatN" class="text-3xl font-black text-slate-800">0</p>
                        </div>
                        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-teal-500">
                            <p class="text-[10px] font-bold text-teal-600 uppercase">Lab Average</p>
                            <p id="stdStatMean" class="text-3xl font-black text-slate-800">-</p>
                        </div>
                        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-slate-600">
                            <p class="text-[10px] font-bold text-slate-600 uppercase">Accuracy Bias (%)</p>
                            <p id="stdStatBias" class="text-3xl font-black text-slate-800">-</p>
                        </div>
                        <div class="bg-rose-50 p-4 rounded-xl shadow-sm border-l-4 border-rose-500">
                            <p class="text-[10px] font-bold text-rose-600 uppercase">Failures (> 3SD)</p>
                            <p id="stdStatFail" class="text-3xl font-black text-rose-800">0</p>
                        </div>
                    </div>

                    <div id="stdChartWrap" class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div class="relative h-[450px] w-full"><canvas id="stdControlChart"></canvas></div>
                    </div>

                    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="text-[11px] font-black text-slate-600 uppercase tracking-widest">CRM Data Review Table</h3>
                            <span class="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">Z-Score = (Lab Value - Target) / SD</span>
                        </div>
                        <div class="overflow-auto border border-slate-200 rounded-lg max-h-[350px] custom-scrollbar">
                            <table class="w-full text-xs text-center whitespace-nowrap border-collapse">
                                <thead class="bg-slate-100 text-slate-500 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                    <tr>
                                        <th class="px-4 py-2 border-r border-slate-200">No.</th><th class="px-4 py-2 border-r border-slate-200">Sample ID</th><th class="px-4 py-2 border-r border-slate-200">CRM ID</th><th class="px-4 py-2 border-r border-slate-200">Assay Lab</th><th class="px-4 py-2 border-r border-slate-200">Deviation</th><th class="px-4 py-2 border-r border-slate-200">Z-Score</th><th class="px-4 py-2 bg-slate-100">Control Status</th>
                                    </tr>
                                </thead>
                                <tbody id="stdDataTableBody" class="divide-y divide-slate-100 bg-white"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;

    // INJECT RIGHT SIDEBAR (ACTIONS & PARAMS)
    actionLab.innerHTML = `
        <div id="action-blank" class="flex-col gap-4 flex animate-fade-in">
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="upload" class="w-3.5 h-3.5 text-slate-500"></i> Upload Blank Data</h4>
                <input type="file" id="blankCsvFile" accept=".csv" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-xs mb-3 bg-slate-50 cursor-pointer text-slate-600 outline-none focus:border-teal-500">
                <button id="blankProcessBtn" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-sm flex items-center justify-center gap-2"><i data-lucide="play-circle" class="w-4 h-4"></i> Process Data</button>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hidden animate-fade-in" id="blankParamsBox">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="settings-2" class="w-3.5 h-3.5 text-slate-500"></i> Filter Parameters</h4>
                
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Tolerance Limit (%)</label>
                <input type="number" id="blankTolerance" value="0.05" step="0.01" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold outline-none focus:border-teal-500 text-slate-700">
                
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Select Element</label>
                <select id="blankChartElement" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold text-slate-700 outline-none focus:border-teal-500"></select>

                <div id="blankBatuanContainer" class="hidden">
                    <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Rock Filter</label>
                    <select id="blankChartBatuan" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold text-teal-700 outline-none focus:border-teal-500"></select>
                </div>

                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Decimals</label>
                <input type="number" id="blankDecimals" value="3" min="0" max="6" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm font-bold outline-none focus:border-teal-500 text-slate-700">
            </div>

            <button id="blankOpenPdfBtn" class="hidden w-full bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-bold py-3 rounded-lg shadow-sm text-sm flex items-center justify-center gap-2 transition-all animate-fade-in"><i data-lucide="file-text" class="w-4 h-4"></i> Export PDF Report</button>
        </div>

        <div id="action-duplicate" class="flex-col gap-4 hidden animate-fade-in">
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="upload" class="w-3.5 h-3.5 text-slate-500"></i> Upload Duplicate (CSV)</h4>
                <input type="file" id="dupCsvFile" accept=".csv" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-xs mb-2 bg-slate-50 cursor-pointer text-slate-600 outline-none focus:border-teal-500">
                <p class="text-[9px] text-slate-500 mb-3 leading-tight">*Requires: ID Column (Original) & Remarks (ORI/DPL)</p>
                <button id="dupProcessBtn" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-sm flex items-center justify-center gap-2"><i data-lucide="play-circle" class="w-4 h-4"></i> Process Data</button>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hidden animate-fade-in" id="dupParamsBox">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="settings-2" class="w-3.5 h-3.5 text-slate-500"></i> Analysis Parameters</h4>
                
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Target Element</label>
                <select id="dupElementSelect" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold text-slate-700 outline-none focus:border-teal-500"></select>

                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Detection Limit (DL)</label>
                <input type="number" id="dupDlLimit" value="0.01" step="0.001" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold text-slate-700 outline-none focus:border-teal-500">

                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider" title="Relative Precision Limit">Failures Setting (%)</label>
                <input type="number" id="dupPrecisionLimit" value="20" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm font-bold text-rose-600 outline-none focus:border-teal-500">
            </div>

            <button id="dupOpenPdfBtn" class="hidden w-full bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-bold py-3 rounded-lg shadow-sm text-sm flex items-center justify-center gap-2 transition-all animate-fade-in"><i data-lucide="file-text" class="w-4 h-4"></i> Export PDF Report</button>
        </div>

        <div id="action-standard" class="flex-col gap-4 hidden animate-fade-in">
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="upload" class="w-3.5 h-3.5 text-slate-500"></i> Upload CRM Data (CSV)</h4>
                <input type="file" id="stdCsvFile" accept=".csv" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-xs mb-2 bg-slate-50 cursor-pointer text-slate-600 outline-none focus:border-teal-500">
                <p class="text-[9px] text-slate-500 mb-3 leading-tight">*Requires: CRM identifier column in Remarks.</p>
                <button id="stdProcessBtn" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-sm flex items-center justify-center gap-2"><i data-lucide="play-circle" class="w-4 h-4"></i> Process Data</button>
            </div>

            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hidden animate-fade-in" id="stdParamsBox">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="settings-2" class="w-3.5 h-3.5 text-slate-500"></i> Certificate Config</h4>
                
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Analysis Element</label>
                <select id="stdElementSelect" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-3 font-bold text-slate-700 outline-none focus:border-teal-500"></select>

                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Select Target CRM</label>
                <select id="stdCrmSelect" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm mb-4 font-bold text-slate-700 outline-none focus:border-teal-500"></select>

                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <label class="block text-[10px] font-bold text-slate-600 mb-1 uppercase">Target Value (Certified)</label>
                    <input type="number" id="stdTargetVal" step="0.001" placeholder="e.g: 1.54" class="w-full border border-slate-300 px-3 py-1.5 rounded text-sm mb-3 font-bold text-center outline-none focus:border-teal-500">

                    <label class="block text-[10px] font-bold text-slate-600 mb-1 uppercase">1 SD (Certificate)</label>
                    <input type="number" id="stdSdVal" step="0.001" placeholder="e.g: 0.05" class="w-full border border-slate-300 px-3 py-1.5 rounded text-sm font-bold text-center outline-none focus:border-teal-500">
                </div>
            </div>

            <button id="stdOpenPdfBtn" class="hidden w-full bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-bold py-3 rounded-lg shadow-sm text-sm flex items-center justify-center gap-2 transition-all animate-fade-in"><i data-lucide="file-text" class="w-4 h-4"></i> Export PDF Report</button>
        </div>
    `;

    // INJECT MODALS BARU MURNI
    const modals = document.createElement('div');
    modals.id = 'qaqc-lab-modals-container';
    modals.innerHTML = `
        <div id="blankPdfModal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 flex justify-center items-center z-[100] backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <h2 class="text-lg font-bold text-slate-800 mb-2">Export PDF Report (Blank)</h2>
                <p class="text-xs text-slate-500 mb-4 border-b border-slate-100 pb-3">Select combination to render PDF.</p>
                <div class="space-y-4">
                    <div>
                        <label class="font-bold text-slate-700 text-sm">Elements</label>
                        <div id="blankPdfElements" class="grid grid-cols-4 gap-2 mt-1 border border-slate-200 p-2 rounded-lg bg-slate-50 text-xs max-h-32 overflow-y-auto custom-scrollbar"></div>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 text-sm">Rocks</label>
                        <div id="blankPdfBatuan" class="grid grid-cols-2 gap-2 mt-1 border border-slate-200 p-2 rounded-lg bg-slate-50 text-xs max-h-32 overflow-y-auto custom-scrollbar"></div>
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-2">
                    <button onclick="document.getElementById('blankPdfModal').classList.add('hidden')" class="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-bold transition-colors">Cancel</button>
                    <button id="blankGeneratePdfBtn" class="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-bold shadow-md transition-colors flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Start Render</button>
                </div>
            </div>
        </div>

        <div id="dupPdfModal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 flex justify-center items-center z-[100] backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <h2 class="text-lg font-bold text-slate-800 mb-2">Export PDF Report (Duplicate)</h2>
                <p class="text-xs text-slate-500 mb-4 border-b border-slate-100 pb-3">Select elements to render charts into PDF.</p>
                <div class="space-y-4">
                    <div>
                        <label class="font-bold text-slate-700 text-sm">Select Elements</label>
                        <div id="dupPdfElements" class="grid grid-cols-4 gap-2 mt-1 border border-slate-200 p-2 rounded-lg bg-slate-50 text-xs max-h-32 overflow-y-auto custom-scrollbar"></div>
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-2">
                    <button onclick="document.getElementById('dupPdfModal').classList.add('hidden')" class="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-bold transition-colors">Cancel</button>
                    <button id="dupGeneratePdfBtn" class="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-bold shadow-md transition-colors flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Start Render</button>
                </div>
            </div>
        </div>

        <div id="stdPdfModal" class="hidden fixed inset-0 bg-slate-900 bg-opacity-60 flex justify-center items-center z-[100] backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <h2 class="text-lg font-bold text-slate-800 mb-2">Export PDF Report (CRM Standard)</h2>
                <p class="text-xs text-slate-500 mb-4 border-b border-slate-100 pb-3">Select Elements and CRM combination to render.</p>
                <div class="space-y-4">
                    <div>
                        <label class="font-bold text-slate-700 text-sm">Select Elements</label>
                        <div id="stdPdfElements" class="grid grid-cols-4 gap-2 mt-1 border border-slate-200 p-2 rounded-lg bg-slate-50 text-xs max-h-32 overflow-y-auto custom-scrollbar"></div>
                    </div>
                    <div>
                        <label class="font-bold text-slate-700 text-sm">Select CRM</label>
                        <div id="stdPdfCrms" class="grid grid-cols-2 gap-2 mt-1 border border-slate-200 p-2 rounded-lg bg-slate-50 text-xs max-h-32 overflow-y-auto custom-scrollbar"></div>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 font-medium">
                        The system will only render charts that have Target & SD values configured.
                    </div>
                </div>
                <div class="mt-6 flex justify-end space-x-2">
                    <button onclick="document.getElementById('stdPdfModal').classList.add('hidden')" class="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-bold transition-colors">Cancel</button>
                    <button id="stdGeneratePdfBtn" class="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-bold shadow-md transition-colors flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Start Render</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modals);
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.switchLabTab = function(targetTab) {
    const tabs = ['blank', 'duplicate', 'standard'];
    tabs.forEach(tab => {
        const content = document.getElementById(`module-${tab}`);
        const btn = document.getElementById(`tabBtn-${tab}`);
        const action = document.getElementById(`action-${tab}`);
        
        if (tab === targetTab) {
            if(content) { content.classList.remove('hidden'); content.classList.add('block'); }
            if(action) { action.classList.remove('hidden'); action.classList.add('flex'); }
            
            if (btn) {
                btn.className = "px-4 py-2 font-bold text-sm rounded-lg transition-colors bg-emerald-100 text-emerald-800 shadow-sm";
            }
        } else {
            if(content) { content.classList.add('hidden'); content.classList.remove('block'); }
            if(action) { action.classList.add('hidden'); action.classList.remove('flex'); }
            if(btn) {
                btn.className = "px-4 py-2 font-bold text-sm rounded-lg transition-colors text-slate-600 hover:bg-slate-100 border border-transparent";
            }
        }
    });
};

// --- VALIDASI ROBUST & AUTO INJECTOR: EKSTRAK LIBRARY PDF ---
let isPdfLibsLoading = false;

async function ensurePdfLibraries() {
    if ((window.jspdf || window.jsPDF) && typeof html2canvas !== 'undefined') return true;
    
    if (isPdfLibsLoading) {
        while(isPdfLibsLoading) { await new Promise(r => setTimeout(r, 200)); }
        return true;
    }
    isPdfLibsLoading = true;
    try {
        if (typeof html2canvas === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
                script.onload = resolve; script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        if (!window.jspdf && !window.jsPDF) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                script.onload = resolve; script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        isPdfLibsLoading = false;
        return true;
    } catch (error) {
        isPdfLibsLoading = false;
        throw error;
    }
}

function getJSPDFInstance() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
}

// ============================================================================
// LAB QA/QC: BLANK MAPPER & PROCESSOR
// ============================================================================
let tempBlankImportData = { headers: [], data: [] };

function initLabBlank() {
    document.getElementById('blankProcessBtn')?.addEventListener('click', () => {
        const file = document.getElementById('blankCsvFile').files[0];
        if (!file) return showToast('Please select a Blank CSV file!', 'warning');

        showLoader("Reading Lab File", "Extracting headers for QA/QC mapping...");
        setTimeout(() => {
            Papa.parse(file, { 
                header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, ''), 
                complete: res => {
                    if (!res.data.length) { hideLoader(); return showToast('Empty data!', 'error'); }
                    tempBlankImportData.headers = res.meta.fields;
                    tempBlankImportData.data = res.data;
                    hideLoader();
                    openBlankMapperWizard();
                }
            });
        }, 500);
    });

    ['blankChartElement', 'blankChartBatuan', 'blankTolerance', 'blankDecimals'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => runBlankAnalysis());
    });

    document.getElementById('blankOpenPdfBtn')?.addEventListener('click', () => document.getElementById('blankPdfModal')?.classList.remove('hidden'));
    document.getElementById('blankGeneratePdfBtn')?.addEventListener('click', async () => generateBlankPdf());
}

window.openBlankMapperWizard = function() {
    const idTbody = document.getElementById('blank-mapper-id-tbody');
    const assayTbody = document.getElementById('blank-mapper-assay-tbody');
    document.getElementById('blank-mapper-row-count').textContent = `${tempBlankImportData.data.length.toLocaleString()} SAMPLES DETECTED`;

    const headers = tempBlankImportData.headers;
    const sampleRows = tempBlankImportData.data.slice(0, 2);

    // KELOMPOK 1: IDENTIFIERS
    const idReqs = [
        { id: 'Sample_ID', label: 'Sample ID <span class="text-rose-500">*</span>', keywords: ['blank sample', 'sample', 'no', 'id'] },
        { id: 'Lithology', label: 'Rock/Lithology', keywords: ['rock', 'litho', 'batuan', 'material'] },
        { id: 'Remarks', label: 'Remarks/Batch', keywords: ['remark', 'batch', 'desc', 'keterangan'] }
    ];

    // KELOMPOK 2: ASSAYS (Berdasarkan gambar)
    const assayReqs = [
        { id: 'Ni', keywords: ['ni'] }, { id: 'Fe', keywords: ['fe'] }, { id: 'Co', keywords: ['co'] },
        { id: 'Al2O3', keywords: ['al2o3', 'al'] }, { id: 'SiO2', keywords: ['sio2', 'si'] },
        { id: 'CaO', keywords: ['cao', 'ca'] }, { id: 'MgO', keywords: ['mgo', 'mg'] },
        { id: 'Cr2O3', keywords: ['cr2o3', 'cr'] }, { id: 'MnO', keywords: ['mno', 'mn'] }
    ];

    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords, isMandatory) => {
        let options = `<option value="">-- Ignore / Not Available --</option>`;
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
        const bgClass = autoSelected ? 'bg-emerald-50/50' : (isMandatory ? 'bg-rose-50/30' : 'bg-white');
        const badge = autoSelected ? `<span class="ml-1.5 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">Mapped</span>` : '';

        return `
            <tr class="blank-mapper-row ${bgClass} transition-colors" data-sys="${sysId}" data-mandatory="${isMandatory}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-800">${sysLabel} ${badge}</td>
                <td class="p-2 border-r border-slate-200">
                    <select class="blank-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-teal-500 bg-white shadow-sm" onchange="window.updateBlankPreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 blank-preview-cell truncate max-w-[120px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    idTbody.innerHTML = idReqs.map(req => createRow(req.id, req.label, req.keywords, true)).join('');
    assayTbody.innerHTML = assayReqs.map(req => createRow(req.id, req.id, req.keywords, false)).join('');

    document.getElementById('modal-blank-mapper').classList.remove('hidden');
    window.validateBlankMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updateBlankPreview = function(selectEl) {
    const val = selectEl.value;
    const tr = selectEl.closest('tr');
    const previewCell = tr.querySelector('.blank-preview-cell');
    
    if (val) {
        const sampleRows = tempBlankImportData.data.slice(0, 2);
        const previewText = sampleRows.map(r => String(r[val]).substring(0,12) || '-').join(' | ');
        previewCell.textContent = previewText; previewCell.title = previewText;
        tr.classList.remove('bg-rose-50/30', 'bg-white'); tr.classList.add('bg-blue-50/50'); 
    } else {
        previewCell.textContent = '-';
        if (tr.dataset.mandatory === 'true') tr.classList.replace('bg-blue-50/50', 'bg-rose-50/30');
        else tr.classList.replace('bg-blue-50/50', 'bg-white');
    }
    window.validateBlankMapping();
};

window.addCustomBlankAssay = function() {
    const assayTbody = document.getElementById('blank-mapper-assay-tbody');
    let customId = prompt("Enter new assay name (e.g., Fe2O3):");
    if (!customId || customId.trim() === '') return;
    
    customId = customId.trim().replace(/[^a-zA-Z0-9_]/g, '');
    let options = `<option value="">-- Ignore --</option>` + tempBlankImportData.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    
    assayTbody.insertAdjacentHTML('beforeend', `
        <tr class="blank-mapper-row bg-white transition-colors" data-sys="${customId}" data-mandatory="false">
            <td class="p-2 border-r border-slate-200 font-bold text-rose-700">${customId} <span class="ml-1 text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Custom</span></td>
            <td class="p-2 border-r border-slate-200"><select class="blank-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold outline-none focus:border-teal-500 bg-white" onchange="window.updateBlankPreview(this)">${options}</select></td>
            <td class="p-2 font-mono text-slate-500 blank-preview-cell">-</td>
        </tr>
    `);
};

window.validateBlankMapping = function() {
    const rows = document.querySelectorAll('.blank-mapper-row[data-mandatory="true"]');
    let isValid = true;
    rows.forEach(tr => { if (!tr.querySelector('select').value) isValid = false; });

    const btn = document.getElementById('btn-execute-blank-import');
    const status = document.getElementById('blank-mapper-status');
    if (isValid) {
        btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "Sample ID linked. Ready to process.";
        status.className = "text-[11px] text-teal-600 font-black tracking-wide";
    } else {
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        status.textContent = "Missing mandatory Sample ID (*)";
        status.className = "text-[11px] text-rose-500 font-bold italic";
    }
};

window.executeBlankImport = function() {
    showLoader("Processing Blank Data", "Normalizing Lab CSV structure...");
    document.getElementById('modal-blank-mapper').classList.add('hidden');

    setTimeout(() => {
        const mapDictionary = {}; 
        const finalHeaders = [];
        let mappedAssays = []; // Simpan assay yang berhasil di-map agar tahu mana yang numerik
        
        document.querySelectorAll('.blank-mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) {
                mapDictionary[sourceCol] = sysId;
                finalHeaders.push(sysId);
                // Jika itu dari tabel assay, simpan di array mappedAssays
                if (tr.closest('#blank-mapper-assay-tbody')) mappedAssays.push(sysId);
            }
        });

        // 1. Eksekusi Transformasi Data
        const standardizedData = tempBlankImportData.data.map((row, index) => {
            let newRow = { _id: index };
            for (const [srcKey, sysKey] of Object.entries(mapDictionary)) {
                let val = row[srcKey];
                newRow[sysKey] = (val !== undefined && val !== null) ? String(val).trim() : '';
            }
            return newRow;
        });

        // 2. Set State Blank Lab
        labState.blank.data = standardizedData;
        
        // Pengecekan ada batuan atau tidak
        labState.blank.batuanCol = finalHeaders.includes('Lithology') ? 'Lithology' : null;
        
        // Pastikan hanya memasukkan Assay yang benar-benar ada angkanya
        labState.blank.cols = mappedAssays.filter(h => {
            for(let i=0; i<Math.min(100, labState.blank.data.length); i++){
                let val = labState.blank.data[i][h];
                if (val !== undefined && val !== null && val.toString().trim() !== '') {
                    if (!isNaN(parseCleanNumber(val))) return true;
                }
            } 
            return false;
        });

        if(!labState.blank.cols.length) {
            hideLoader(); return showToast('No numeric element columns detected after mapping.', 'error');
        }

        // 3. Persiapan UI Lab (Dropdown Element & Rock)
        const bSelect = document.getElementById('blankChartBatuan');
        const bCont = document.getElementById('blankBatuanContainer');
        const pdfBCont = document.getElementById('blankPdfBatuan');
        
        if(bSelect) bSelect.innerHTML = '<option value="Semua">All Rocks</option>';
        if(pdfBCont) pdfBCont.innerHTML = `<label class="flex items-center"><input type="checkbox" class="blank-pdf-batuan-cb w-3 h-3 text-teal-600" value="Semua" checked><span class="ml-1">All</span></label>`;

        if (labState.blank.batuanCol) {
            let setB = new Set(labState.blank.data.map(r => r[labState.blank.batuanCol]).filter(v => v && v.trim()));
            if (setB.size > 0 && bSelect && pdfBCont) {
                setB.forEach(b => {
                    bSelect.innerHTML += `<option value="${b}">${b}</option>`;
                    pdfBCont.innerHTML += `<label class="flex items-center"><input type="checkbox" class="blank-pdf-batuan-cb w-3 h-3 text-teal-600" value="${b}"><span class="ml-1">${b}</span></label>`;
                });
                bCont?.classList.remove('hidden');
            }
        } else { bCont?.classList.add('hidden'); }

        const eSelect = document.getElementById('blankChartElement');
        const pdfECont = document.getElementById('blankPdfElements');
        if(eSelect) eSelect.innerHTML = ''; 
        if(pdfECont) pdfECont.innerHTML = '';

        labState.blank.cols.forEach(c => {
            let sel = c.toLowerCase() === 'ni' ? 'selected' : '';
            if(eSelect) eSelect.innerHTML += `<option value="${c}" ${sel}>${c}</option>`;
            if(pdfECont) pdfECont.innerHTML += `<label class="flex items-center"><input type="checkbox" class="blank-pdf-el-cb w-3 h-3 text-teal-600" value="${c}" checked><span class="ml-1">${c}</span></label>`;
        });

        document.getElementById('blankParamsBox')?.classList.remove('hidden');
        document.getElementById('blankDashboard')?.classList.remove('hidden');
        document.getElementById('blankDashboard')?.classList.add('flex');
        document.getElementById('blankOpenPdfBtn')?.classList.remove('hidden');
        
        tempBlankImportData = { headers: [], data: [] }; // Clear RAM

        hideLoader();
        showToast("Blank Lab Data standardized & processed.", "success");
        runBlankAnalysis();

    }, 600);
};

function runBlankAnalysis(disableAnim = false) {
    if(!labState.blank.data.length) return;
    const tol = parseFloat(document.getElementById('blankTolerance')?.value) || 0;
    const el = document.getElementById('blankChartElement')?.value;
    const bat = document.getElementById('blankChartBatuan')?.value;
    let dec = parseInt(document.getElementById('blankDecimals')?.value) || 0;

    let filtered = labState.blank.batuanCol && bat && bat !== 'Semua' ? labState.blank.data.filter(r => r[labState.blank.batuanCol] === bat) : labState.blank.data;
    
    renderBlankSummaryTable(filtered, labState.blank.cols, tol, el, dec);
    renderBlankDataTable(filtered, el, tol, disableAnim);
}

function calculateBlankStats(data, colName, tol) {
    let vals = [], errs = 0;
    let min = Infinity, max = -Infinity, dl = Infinity;

    data.forEach(r => {
        let rawVal = r[colName];
        if(rawVal !== undefined && rawVal !== null && rawVal.toString().trim() !== '') {
            let num = parseCleanNumber(rawVal);
            if(!isNaN(num)){
                let isLt = rawVal.toString().trim().startsWith('<');
                vals.push(num);
                if (num < min) min = num;
                if (num > max) max = num;
                if(isLt && num > 0 && num < dl) dl = num;
            }
        }
    });

    let n = vals.length; if(!n) return null;
    let sum = vals.reduce((a,b)=>a+b,0), mean = sum/n;
    let stdev = n>1 ? Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(n-1)) : 0;
    
    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 0;
    if (dl === Infinity) dl = min > 0 ? min : 0.01;

    vals.forEach(v => { if(v>tol) errs++; });
    
    return {
        n, mean, stdev, min3d: mean-3*stdev, min2d: mean-2*stdev, plus2d: mean+2*stdev, plus3d: mean+3*stdev,
        dl, dl5: 5*dl, max, min, range: max-min, cv: mean!==0 ? (stdev/mean)*100 : 0, errs
    };
}

function renderBlankSummaryTable(data, cols, tol, selectedEl, dec) {
    const head = document.getElementById('blankSummaryHead');
    const body = document.getElementById('blankSummaryBody');
    if(!head || !body) return;
    
    let hHTML = '<th class="p-3 border-r border-slate-200 font-bold">Metric</th>';
    cols.forEach(c => { hHTML += `<th class="p-3 border-r border-slate-200 font-bold">%${c}</th>`; });
    head.innerHTML = hHTML;

    let stats = {}; cols.forEach(c => stats[c] = calculateBlankStats(data, c, tol));

    const rows = [
        {id: 'Count of Analyzed', k: 'n', f: v=>v}, {id: 'Mean', k: 'mean', f: v=>v.toFixed(dec)}, {id: 'STDEV', k: 'stdev', f: v=>v.toFixed(dec)},
        {id: '-3d', k: 'min3d', f: v=>v.toFixed(dec)}, {id: '-2d', k: 'min2d', f: v=>v.toFixed(dec)},
        {id: '+2d', k: 'plus2d', f: v=>v.toFixed(dec)}, {id: '+3d', k: 'plus3d', f: v=>v.toFixed(dec)},
        {id: 'DL', k: 'dl', f: v=>v.toFixed(dec)}, {id: '5DL', k: 'dl5', f: v=>v.toFixed(dec)},
        {id: 'Max', k: 'max', f: v=>v.toFixed(dec)}, {id: 'Min', k: 'min', f: v=>v.toFixed(dec)},
        {id: 'Range', k: 'range', f: v=>v.toFixed(dec)}, {id: 'CV', k: 'cv', f: v=>v.toFixed(dec)}, {id: 'Error', k: 'errs', f: v=>v}
    ];

    let bHTML = '';
    rows.forEach((r,i) => {
        bHTML += `<tr class="hover:bg-slate-50 transition-colors"><td class="p-2.5 font-bold text-slate-600 border-r border-slate-100 bg-slate-50">${r.id}</td>`;
        cols.forEach(c => {
            let val = stats[c] ? stats[c][r.k] : 0;
            let cls = 'text-slate-700 font-mono font-medium';
            if(r.id === 'Error' && val > 0) cls += ' text-rose-600 font-black'; 
            bHTML += `<td class="p-2.5 border-r border-slate-100 ${cls}"> ${r.f(val)}</td>`;
        });
        bHTML += `</tr>`;
    });
    body.innerHTML = bHTML;
}

function renderBlankDataTable(data, el, tol, disableAnim = false) {
    if(!data.length) return;
    const head = document.getElementById('blankDataTableHead');
    const body = document.getElementById('blankDataTableBody');
    if(!head || !body) return;
    
    let pass=0, fail=0, cLabels=[], cVals=[];
    let headers = Object.keys(data[0]);

    let hHTML = '<tr>';
    headers.forEach(h => { hHTML += `<th class="px-4 py-3 border-b border-slate-200 ${h===el?'bg-slate-200 text-slate-800 font-extrabold':''}">${h}</th>`; });
    hHTML += `<th class="px-4 py-3 border-b border-slate-200 bg-slate-200 sticky right-0 z-20">STATUS (${el})</th></tr>`;
    head.innerHTML = hHTML;

    let bHTML = '';
    data.forEach((r,i) => {
        let val = parseCleanNumber(r[el]) || 0;
        let isF = val > tol;
        if(isF) fail++; else pass++;

        let lbl = r['Batch'] || r['Batch ID'] || r['Blank Sample'] || r['Sample ID'] || r['ID'] || r['No'] || `Smpl ${i+1}`;
        cLabels.push(lbl); cVals.push(val);

        bHTML += `<tr class="${isF?'bg-rose-50 hover:bg-rose-100':'bg-white hover:bg-slate-50'}">`;
        headers.forEach(h => { bHTML += `<td class="px-4 py-2 border-b border-slate-100 ${h===el?(isF?'text-rose-600 font-bold bg-rose-50':'text-slate-800 font-bold bg-slate-50'):''}">${r[h]||''}</td>`; });
        bHTML += `<td class="px-4 py-2 border-b border-l border-slate-200 sticky right-0 text-center shadow-[-5px_0_10px_rgba(0,0,0,0.02)] ${isF?'bg-rose-50':'bg-white'}"><span class="${isF?'bg-rose-600':'bg-emerald-500'} text-white px-2 py-1 rounded-full text-[10px] font-bold shadow-sm">${isF?'FAIL':'PASS'}</span></td></tr>`;
    });
    body.innerHTML = bHTML;

    const elTotal = document.getElementById('blankTotalSample'); if(elTotal) elTotal.innerText = data.length;
    const elPass = document.getElementById('blankTotalPass'); if(elPass) elPass.innerText = pass;
    const elFail = document.getElementById('blankTotalFail'); if(elFail) elFail.innerText = fail;

    renderBlankChart(cLabels, cVals, tol, el, document.getElementById('blankChartBatuan')?.value, disableAnim);
}

function renderBlankChart(labels, vals, tol, el, batuan, disableAnim = false) {
    const canvas = document.getElementById('blankChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let existChart = Chart.getChart('blankChart');
    if(existChart) existChart.destroy();
    let limitData = Array(labels.length).fill(tol);
    
    let maxVal = vals.length > 0 ? vals.reduce((max, p) => p > max ? p : max, vals[0]) : 0;
    let suggestedMaxY = Math.max(tol * 2, maxVal) * 1.2;
    
    const chartFont = { family: "'Inter', sans-serif", size: 11, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };
    
    labState.blank.chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [
            { label:`Limit ${el}`, data:limitData, borderColor:'#e11d48', borderWidth:2, borderDash: [5,5], pointRadius:0, pointHoverRadius:0, pointStyle:'line' },
            { label:`%${el}`, data:vals, borderColor:'#0f172a', backgroundColor:'#0f172a', pointBorderColor:'#0f172a', borderWidth:1.5, pointRadius:4, pointHoverRadius:6, pointStyle:'circle' }
        ]},
        options: {
            responsive: true, maintainAspectRatio: false, animation: disableAnim ? false : { duration: 1000 },
            layout: { padding: 10 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display:true, text:`Figure Of % ${el} Blank${batuan && batuan!=='Semua'?` (${batuan})`:''}`, font:{size:16, weight:'bold', family: "'Inter', sans-serif"}, color:'#1e293b'},
                legend: { position:'bottom', labels: {color:'#475569', usePointStyle:true, boxWidth:8, padding:20, font: chartFont}},
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 }
            },
            scales: {
                y: { beginAtZero:true, suggestedMax: suggestedMaxY, grid: gridStyle, ticks:{ font: chartFont } },
                x: { grid:{display:false}, ticks:{display:false} }
            }
        }
    });
}

async function generateBlankPdf() {
    const els = Array.from(document.querySelectorAll('.blank-pdf-el-cb:checked')).map(c=>c.value);
    const bats = Array.from(document.querySelectorAll('.blank-pdf-batuan-cb:checked')).map(c=>c.value);
    
    document.getElementById('blankPdfModal')?.classList.add('hidden');
    
    if(!els.length || !bats.length) {
        showToast('Select at least 1 element and 1 rock!', 'warning');
        return;
    }

    showLabOverlay("Preparing PDF", "Downloading rendering module...");

    try {
        await ensurePdfLibraries();
    } catch(e) {
        hideLabOverlay();
        showToast("Failed to load PDF library. Check your internet connection.", "error");
        return;
    }

    const jsPDFClass = getJSPDFInstance();
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        hideLabOverlay();
        showToast('PDF library not detected.', 'error');
        return;
    }

    showLabOverlay("Generating PDF Report", "Preparing rendering data...");

    const origEl = document.getElementById('blankChartElement')?.value;
    const origBat = document.getElementById('blankChartBatuan')?.value;
    
    const pdf = new jsPDFClass('l', 'mm', 'a4'); let isFirstPage = true;
    
    const cArea = document.getElementById('blankPdfChartArea');
    const tArea = document.getElementById('blankPdfTableArea');
    const tCont = document.getElementById('blankTableContainer');

    const domState = { cStyle: cArea.getAttribute('style')||'', tStyle: tArea.getAttribute('style')||'', tcStyle: tCont.getAttribute('style')||'' };

    try {
        for(let b of bats) {
            showLabOverlay("Generating PDF Report", `Rendering Rock Statistics Table [${b}]...`);
            document.getElementById('blankChartBatuan').value = b;
            
            cArea.style.display = "none";
            tArea.style.position = "fixed"; tArea.style.top = "0px"; tArea.style.left = "0px";
            tArea.style.width = "max-content"; tArea.style.minWidth = "1000px"; 
            tArea.style.zIndex = "1"; // Tepat di bawah loading overlay
            tArea.style.backgroundColor = "#ffffff"; tArea.style.display = "block"; 
            tCont.style.maxHeight = "none"; tCont.style.overflow = "visible";

            document.getElementById('blankChartElement').value = els[0];
            runBlankAnalysis(true); await new Promise(r=>setTimeout(r,600));

            let targetWidth = tArea.scrollWidth + 10;
            const canvasTable = await html2canvas(tArea, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: targetWidth, windowWidth: targetWidth });

            if (!isFirstPage) pdf.addPage();
            isFirstPage = false;

            const pageWidth = pdf.internal.pageSize.getWidth();
            let titleBatuan = b === 'Semua' ? 'All Rocks' : `Rock: ${b}`;
            pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
            pdf.text(`Nickel QAQC Validation Report - Statistics Summary | ${titleBatuan}`, pageWidth / 2, 15, { align: 'center' });

            const mX = 10, mY = 25;
            let maxW = pageWidth - (mX * 2);
            let maxH = pdf.internal.pageSize.getHeight() - mY - 10;
            let finalW = maxW, finalH = (canvasTable.height * finalW) / canvasTable.width;

            if (finalH > maxH) { finalH = maxH; finalW = (canvasTable.width * finalH) / canvasTable.height; }
            pdf.addImage(canvasTable.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - finalW) / 2, mY, finalW, finalH);

            tArea.setAttribute('style', domState.tStyle); tCont.setAttribute('style', domState.tcStyle); cArea.setAttribute('style', domState.cStyle);
            
            cArea.style.position = "fixed"; cArea.style.top = "0px"; cArea.style.left = "0px";
            cArea.style.width = "1200px"; cArea.style.height = "600px"; 
            cArea.style.zIndex = "1"; // Tepat di bawah loading overlay
            cArea.style.backgroundColor = "#ffffff"; cArea.style.display = "flex"; 

            for(let e of els) {
                showLabOverlay("Generating PDF Report", `Rendering Chart: [${e}] on rock [${b}]...`);
                document.getElementById('blankChartElement').value = e;
                runBlankAnalysis(true);
                if (labState.blank.chart) labState.blank.chart.resize();
                await new Promise(r=>setTimeout(r,800));

                const canvasChart = await html2canvas(cArea, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200, windowWidth: 1200 });
                pdf.addPage();
                
                const pageWidthChart = pdf.internal.pageSize.getWidth();
                pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
                pdf.text(`Nickel QAQC Validation Report - Element Chart: ${e} | ${titleBatuan}`, pageWidthChart / 2, 15, { align: 'center' });

                finalW = maxW; finalH = (canvasChart.height * finalW) / canvasChart.width;
                if (finalH > maxH) { finalH = maxH; finalW = (canvasChart.width * finalH) / canvasChart.height; }
                pdf.addImage(canvasChart.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - finalW) / 2, mY, finalW, finalH);
            }
            cArea.setAttribute('style', domState.cStyle); 
        }
        showLabOverlay("Generating PDF Report", `Saving PDF File...`);
        pdf.save('QAQC_Blank_Sample_Report.pdf');
        await new Promise(r=>setTimeout(r,500));
        showToast('PDF downloaded successfully.', 'success');
    } catch(e) { showToast('Failed to render PDF!', 'error'); console.error(e); } 
    finally {
        cArea.setAttribute('style', domState.cStyle); tArea.setAttribute('style', domState.tStyle); tCont.setAttribute('style', domState.tcStyle);
        if(origBat) document.getElementById('blankChartBatuan').value = origBat; 
        if(origEl) document.getElementById('blankChartElement').value = origEl;
        runBlankAnalysis();
        hideLabOverlay();
    }
}


// ============================================================================
// LAB QA/QC: DUPLICATE MAPPER & PROCESSOR
// ============================================================================
let tempDupImportData = { headers: [], data: [] };

function initLabDuplicate() {
    document.getElementById('dupProcessBtn')?.addEventListener('click', () => {
        const file = document.getElementById('dupCsvFile').files[0];
        if (!file) return showToast('Please select a Duplicate CSV file!', 'warning');

        showLoader("Reading Lab File", "Extracting headers for Duplicate mapping...");
        setTimeout(() => {
            Papa.parse(file, { 
                header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, ''), 
                complete: res => {
                    if (!res.data.length) { hideLoader(); return showToast('Empty CSV data!', 'error'); }
                    tempDupImportData.headers = res.meta.fields;
                    tempDupImportData.data = res.data;
                    hideLoader();
                    openDupMapperWizard();
                }
            });
        }, 500);
    });

    ['dupElementSelect', 'dupDlLimit', 'dupPrecisionLimit'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            if (id === 'dupElementSelect') setDuplicateDefaults();
            runDupAnalysis();
        });
    });

    document.getElementById('dupOpenPdfBtn')?.addEventListener('click', () => document.getElementById('dupPdfModal')?.classList.remove('hidden'));
    document.getElementById('dupGeneratePdfBtn')?.addEventListener('click', async () => generateDupPdf());
}

window.openDupMapperWizard = function() {
    const idTbody = document.getElementById('dup-mapper-id-tbody');
    const assayTbody = document.getElementById('dup-mapper-assay-tbody');
    document.getElementById('dup-mapper-row-count').textContent = `${tempDupImportData.data.length.toLocaleString()} ROWS DETECTED`;

    const headers = tempDupImportData.headers;
    const sampleRows = tempDupImportData.data.slice(0, 2);

    // KELOMPOK 1: IDENTIFIERS (ORI / DPL Binding)
    const idReqs = [
        { id: 'Original_ID', label: 'Original/Hole ID <span class="text-rose-500">*</span>', keywords: ['original', 'id', 'sample', 'hole'] },
        { id: 'Remarks', label: 'Remarks (ORI/DUP) <span class="text-rose-500">*</span>', keywords: ['remark', 'type', 'status'] }
    ];

    // KELOMPOK 2: ASSAYS (Otomatis mendeteksi kolom dari gambar Excel user)
    const assayReqs = [
        { id: 'Ni', keywords: ['ni'] }, { id: 'Fe', keywords: ['fe'] }, { id: 'Co', keywords: ['co'] },
        { id: 'Al2O3', keywords: ['al2o3', 'al'] }, { id: 'SiO2', keywords: ['sio2', 'si'] },
        { id: 'CaO', keywords: ['cao', 'ca'] }, { id: 'MgO', keywords: ['mgo', 'mg'] },
        { id: 'Cr2O3', keywords: ['cr2o3', 'cr'] }, { id: 'MnO', keywords: ['mno', 'mn'] }
    ];

    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords, isMandatory) => {
        let options = `<option value="">-- Ignore / Not Available --</option>`;
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
        const bgClass = autoSelected ? 'bg-emerald-50/50' : (isMandatory ? 'bg-rose-50/30' : 'bg-white');
        const badge = autoSelected ? `<span class="ml-1.5 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">Mapped</span>` : '';

        return `
            <tr class="dup-mapper-row ${bgClass} transition-colors" data-sys="${sysId}" data-mandatory="${isMandatory}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-800">${sysLabel} ${badge}</td>
                <td class="p-2 border-r border-slate-200">
                    <select class="dup-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-teal-500 bg-white shadow-sm" onchange="window.updateDupPreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 dup-preview-cell truncate max-w-[120px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    idTbody.innerHTML = idReqs.map(req => createRow(req.id, req.label, req.keywords, true)).join('');
    assayTbody.innerHTML = assayReqs.map(req => createRow(req.id, req.id, req.keywords, false)).join('');

    document.getElementById('modal-dup-mapper').classList.remove('hidden');
    window.validateDupMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updateDupPreview = function(selectEl) {
    const val = selectEl.value;
    const tr = selectEl.closest('tr');
    const previewCell = tr.querySelector('.dup-preview-cell');
    
    if (val) {
        const sampleRows = tempDupImportData.data.slice(0, 2);
        const previewText = sampleRows.map(r => String(r[val]).substring(0,12) || '-').join(' | ');
        previewCell.textContent = previewText; previewCell.title = previewText;
        tr.classList.remove('bg-rose-50/30', 'bg-white'); tr.classList.add('bg-blue-50/50'); 
    } else {
        previewCell.textContent = '-';
        if (tr.dataset.mandatory === 'true') tr.classList.replace('bg-blue-50/50', 'bg-rose-50/30');
        else tr.classList.replace('bg-blue-50/50', 'bg-white');
    }
    window.validateDupMapping();
};

window.addCustomDupAssay = function() {
    const assayTbody = document.getElementById('dup-mapper-assay-tbody');
    let customId = prompt("Enter new assay name (e.g., Fe2O3):");
    if (!customId || customId.trim() === '') return;
    
    customId = customId.trim().replace(/[^a-zA-Z0-9_]/g, '');
    let options = `<option value="">-- Ignore --</option>` + tempDupImportData.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    
    assayTbody.insertAdjacentHTML('beforeend', `
        <tr class="dup-mapper-row bg-white transition-colors" data-sys="${customId}" data-mandatory="false">
            <td class="p-2 border-r border-slate-200 font-bold text-teal-700">${customId} <span class="ml-1 text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Custom</span></td>
            <td class="p-2 border-r border-slate-200"><select class="dup-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold outline-none focus:border-teal-500 bg-white" onchange="window.updateDupPreview(this)">${options}</select></td>
            <td class="p-2 font-mono text-slate-500 dup-preview-cell">-</td>
        </tr>
    `);
};

window.validateDupMapping = function() {
    const rows = document.querySelectorAll('.dup-mapper-row[data-mandatory="true"]');
    let isValid = true;
    rows.forEach(tr => { if (!tr.querySelector('select').value) isValid = false; });

    const btn = document.getElementById('btn-execute-dup-import');
    const status = document.getElementById('dup-mapper-status');
    if (isValid) {
        btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "Identifiers linked. Ready to process.";
        status.className = "text-[11px] text-teal-600 font-black tracking-wide";
    } else {
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        status.textContent = "Missing mandatory identifiers (*)";
        status.className = "text-[11px] text-rose-500 font-bold italic";
    }
};

window.executeDupImport = function() {
    showLoader("Processing Duplicates", "Extracting ORI/DPL Pairs...");
    document.getElementById('modal-dup-mapper').classList.add('hidden');

    setTimeout(() => {
        const mapDictionary = {}; 
        const finalHeaders = [];
        let mappedAssays = []; 
        
        document.querySelectorAll('.dup-mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) {
                mapDictionary[sourceCol] = sysId;
                finalHeaders.push(sysId);
                if (tr.closest('#dup-mapper-assay-tbody')) mappedAssays.push(sysId);
            }
        });

        // 1. Eksekusi Transformasi Data
        const standardizedData = tempDupImportData.data.map((row, index) => {
            let newRow = { _id: index };
            for (const [srcKey, sysKey] of Object.entries(mapDictionary)) {
                let val = row[srcKey];
                newRow[sysKey] = (val !== undefined && val !== null) ? String(val).trim() : '';
            }
            return newRow;
        });

        labState.dup.raw = standardizedData;

        // 2. TENTUKAN PASANGAN (ORI vs DPL) MENGGUNAKAN NAMA KOLOM STANDARD
        let oriMap = new Map();
        labState.dup.raw.forEach((r) => {
            let type = r['Remarks'] ? r['Remarks'].toString().toUpperCase().trim() : '';
            let id = r['Original_ID'] ? r['Original_ID'].toString().toUpperCase().trim() : '';
            if (id && ['ORI','ORIGINAL'].includes(type)) {
                if (!oriMap.has(id)) oriMap.set(id, r); 
            }
        });

        labState.dup.pairs = [];
        labState.dup.raw.forEach((r) => {
            let type = r['Remarks'] ? r['Remarks'].toString().toUpperCase().trim() : '';
            let id = r['Original_ID'] ? r['Original_ID'].toString().toUpperCase().trim() : '';
            if (id && ['DPL','DUP','DUPLICATE'].includes(type)) {
                let ori = oriMap.get(id);
                if (ori) labState.dup.pairs.push({id: id, ori: ori, dpl: r});
            }
        });

        if (!labState.dup.pairs.length) {
            hideLoader(); return showToast('Error: No ORI & DPL pairs found in Remarks column!', 'error');
        }

        // 3. Pastikan hanya memasukkan Assay yang benar-benar ada angkanya
        labState.dup.numCols = mappedAssays.filter(h => {
            for(let i=0; i<Math.min(100, labState.dup.raw.length); i++){
                let val = labState.dup.raw[i][h];
                if (val !== undefined && val !== null && val.toString().trim() !== '') {
                    if (!isNaN(parseCleanNumber(val))) return true;
                }
            } 
            return false;
        });

        if (!labState.dup.numCols.length) {
            hideLoader(); return showToast('No numeric element columns detected after mapping.', 'error');
        }

        // 4. Update UI Dropdowns
        const selectEl = document.getElementById('dupElementSelect');
        const pdfECont = document.getElementById('dupPdfElements');
        if(selectEl) selectEl.innerHTML = ''; 
        if(pdfECont) pdfECont.innerHTML = ''; 
        
        labState.dup.numCols.forEach(col => {
            let sel = col.toLowerCase() === 'ni' ? 'selected' : '';
            if(selectEl) selectEl.innerHTML += `<option value="${col}" ${sel}>${col}</option>`;
            if(pdfECont) pdfECont.innerHTML += `<label class="flex items-center"><input type="checkbox" class="dup-pdf-el-cb w-3 h-3 text-teal-600" value="${col}" checked><span class="ml-1">${col}</span></label>`;
        });

        setDuplicateDefaults();
        document.getElementById('dupParamsBox')?.classList.remove('hidden');
        document.getElementById('dupDashboard')?.classList.remove('hidden');
        document.getElementById('dupDashboard')?.classList.add('flex');
        document.getElementById('dupOpenPdfBtn')?.classList.remove('hidden');
        
        tempDupImportData = { headers: [], data: [] }; // Clear RAM

        hideLoader();
        showToast(`Success! Found ${labState.dup.pairs.length} Sample Pairs.`, "success");
        runDupAnalysis();

    }, 600);
};

function getElementSpecs(colName) {
    let el = colName.toLowerCase().trim();
    if (['fe', 'sio2', 'mgo', 'fe2o3'].includes(el)) return { dl: 0.5, lim: 20 };
    if (['co'].includes(el)) return { dl: 0.001, lim: 20 };
    return { dl: 0.01, lim: 20 };
}

function setDuplicateDefaults() {
    const el = document.getElementById('dupElementSelect')?.value;
    if(!el) return;
    const specs = getElementSpecs(el);
    const dLim = document.getElementById('dupDlLimit');
    const pLim = document.getElementById('dupPrecisionLimit');
    if(dLim) dLim.value = specs.dl;
    if(pLim) pLim.value = specs.lim;
}

function runDupAnalysis(disableAnim = false) {
    const el = document.getElementById('dupElementSelect')?.value;
    const dlLimit = parseFloat(document.getElementById('dupDlLimit')?.value) || 0.01;
    const precLimit = parseFloat(document.getElementById('dupPrecisionLimit')?.value) || 20;

    if (!el || !labState.dup.pairs.length) return;

    let rData=[], sData=[], errs=[], reviewData = [];
    let sX=0, sY=0, sXY=0, sXX=0, sYY=0, count=0, pass=0;
    let minX=Infinity, maxX=-Infinity;

    labState.dup.pairs.forEach(p => {
        let o = parseCleanNumber((p.ori[el]||'').toString().trim());
        let d = parseCleanNumber((p.dpl[el]||'').toString().trim());
        
        if (!isNaN(o) && !isNaN(d)) {
            let avg = (o+d)/2;
            let rd = avg===0 ? 0 : ((o-d)/avg)*100;
            let err = Math.abs(rd);
            let isFiltered = avg <= (5 * dlLimit);

            if (!isFiltered) {
                count++;
                if (err <= precLimit) pass++;
                rData.push({x:avg, y:rd}); sData.push({x:o, y:d}); errs.push(err);
                sX+=o; sY+=d; sXY+=o*d; sXX+=o*o; sYY+=d*d;
                if(o<minX) minX=o; if(o>maxX) maxX=o; if(avg>maxX) maxX=avg;
            }
            reviewData.push({ id: p.id, o: o, d: d, avg: avg, absDiff: Math.abs(o - d), err: err, isFail: err > precLimit, isFiltered: isFiltered });
        }
    });

    const elTotal = document.getElementById('dupTotalPairs'); if(elTotal) elTotal.innerText = count;
    const elPass = document.getElementById('dupPassCount'); if(elPass) elPass.innerText = pass;

    let m=0, c=0, r2=0;
    if(count>1){
        let denom = (count * sXX - sX * sX);
        if(denom !== 0) {
            m = (count*sXY - sX*sY) / denom;
            c = (sY - m*sX) / count;
            let rDenom = Math.sqrt(denom * (count*sYY - sY*sY));
            if(rDenom !== 0) { let r = (count*sXY - sX*sY) / rDenom; r2 = r*r; }
        }
    }

    let cUp=[], cDn=[];
    let xMaxCurve = Math.max(maxX * 1.1, 5.0); 
    for(let x=0.01; x<=xMaxCurve; x+=0.02){
        let val = precLimit + ((200 * dlLimit) / x);
        if(val > 150) val = 150; 
        cUp.push({x, y:val}); cDn.push({x, y:-val});
    }
    cUp.unshift({x: 0.001, y: 150}); cDn.unshift({x: 0.001, y: -150});

    let sortedErrsAsc = [...errs].sort((a,b) => a - b);
    let cumFreq = sortedErrsAsc.map((e,i) => ({x:((i+1)/count)*100, y:e}));

    renderDupRelChart(el, rData, cUp, cDn, precLimit, maxX, disableAnim);
    renderDupScatterChart(el, sData, m, c, r2, maxX, disableAnim);
    renderDupCumChart(el, cumFreq, precLimit, pass, count, disableAnim);
    renderDupSummaryTable();
    renderDupReviewTable(reviewData, el);
}

function renderDupSummaryTable() {
    const head = document.getElementById('dupSummaryHead');
    const body = document.getElementById('dupSummaryBody');
    if(!head || !body) return;
    
    let hHTML = '<th class="p-3 border-r border-slate-200 font-bold">Metric</th>';
    labState.dup.numCols.forEach(c => { hHTML += `<th class="p-3 border-r border-slate-200 font-bold">%${c}</th>`; });
    head.innerHTML = hHTML;

    let stats = {};
    let activeEl = document.getElementById('dupElementSelect')?.value;

    labState.dup.numCols.forEach(col => {
        const specs = getElementSpecs(col);
        let dl = specs.dl; let lim = specs.lim;
        
        if (col === activeEl) {
            dl = parseFloat(document.getElementById('dupDlLimit')?.value) || dl;
            lim = parseFloat(document.getElementById('dupPrecisionLimit')?.value) || lim;
        }

        let errs = []; let count = 0; let fails = 0;

        labState.dup.pairs.forEach(p => {
            let o = parseCleanNumber((p.ori[col]||'').toString().trim());
            let d = parseCleanNumber((p.dpl[col]||'').toString().trim());
            
            if (!isNaN(o) && !isNaN(d)) {
                let avg = (o + d) / 2;
                if (avg > (5 * dl)) {
                    count++;
                    let rd = avg === 0 ? 0 : (Math.abs(o - d) / avg) * 100;
                    let err = Math.abs(rd);
                    errs.push(err);
                    if (err > lim) fails++;
                }
            }
        });

        let p90 = 0;
        if (errs.length > 1) {
            let meanErr = errs.reduce((sum, val) => sum + val, 0) / errs.length;
            let variance = errs.reduce((sum, val) => sum + Math.pow(val - meanErr, 2), 0) / (errs.length - 1);
            let stdevErr = Math.sqrt(variance);
            p90 = (2 * stdevErr) / Math.sqrt(2);
        }

        stats[col] = { count: count, lim: lim, fails: fails, failPct: count === 0 ? 0 : (fails / count) * 100, dl: dl, p90: p90 };
    });

    const rows = [
        {id: 'Total Duplicate Samples (> 5x DL)', k: 'count', f: v=>v},
        {id: 'Failures Setting', k: 'lim', f: v=>v},
        {id: 'Total of Failures', k: 'fails', f: v=>v},
        {id: '% Failures', k: 'failPct', f: v=>v.toFixed(1) + '%'},
        {id: 'Detection Limit', k: 'dl', f: v=>v},
        {id: 'Precision (90%)', k: 'p90', f: v=>v.toFixed(1)}
    ];

    let bHTML = '';
    rows.forEach((r, i) => {
        bHTML += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="p-2.5 font-bold text-slate-600 border-r border-slate-100 bg-slate-50">${r.id}</td>`;
        labState.dup.numCols.forEach(c => {
            let val = stats[c] ? stats[c][r.k] : 0;
            bHTML += `<td class="p-2.5 border-r border-slate-100 font-mono font-medium text-slate-700">${r.f(val)}</td>`;
        });
        bHTML += `</tr>`;
    });
    body.innerHTML = bHTML;
}

function renderDupReviewTable(data, el) {
    const elSpan = document.getElementById('dupReviewEl');
    if (elSpan) elSpan.innerText = el;
    const body = document.getElementById('dupDataTableBody');
    if (!body) return;

    let bHTML = '';
    if (data.length === 0) {
        bHTML = '<tr><td colspan="7" class="px-4 py-3 text-slate-500 italic">No data for this element.</td></tr>';
    } else {
        data.forEach((r) => {
            let statusHTML = r.isFiltered ? `<span class="bg-slate-400 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">BDL Excluded</span>` 
                : (r.isFail ? `<span class="bg-rose-500 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">FAIL</span>` 
                : `<span class="bg-emerald-500 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">PASS</span>`);
            
            bHTML += `<tr class="${r.isFiltered ? 'bg-slate-50 text-slate-400' : (r.isFail ? 'bg-rose-50 hover:bg-rose-100' : 'bg-white hover:bg-slate-50')}">
                <td class="px-4 py-2 border-b border-slate-100 font-mono ${r.isFiltered ? 'text-slate-400' : 'text-slate-700'} font-semibold">${r.id}</td>
                <td class="px-4 py-2 border-b border-slate-100">${r.o}</td>
                <td class="px-4 py-2 border-b border-slate-100">${r.d}</td>
                <td class="px-4 py-2 border-b border-slate-100 font-bold ${r.isFiltered ? 'bg-slate-100' : 'bg-slate-50 text-slate-800'}">${r.avg.toFixed(4)}</td>
                <td class="px-4 py-2 border-b border-slate-100">${r.absDiff.toFixed(4)}</td>
                <td class="px-4 py-2 border-b border-slate-100 font-bold ${r.isFiltered ? 'text-slate-400' : (r.isFail ? 'text-rose-600' : 'text-slate-800')}">${r.err.toFixed(2)}</td>
                <td class="px-4 py-2 border-b border-l border-slate-200 ${r.isFiltered ? 'bg-slate-100' : 'bg-slate-50'} shadow-inner">${statusHTML}</td>
            </tr>`;
        });
    }
    body.innerHTML = bHTML;
}

function renderDupRelChart(el, pts, cU, cD, lim, mx, disableAnim) {
    const canvas = document.getElementById('dupChartRelDiff');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let existChart = Chart.getChart('dupChartRelDiff');
    if(existChart) existChart.destroy();
    
    const chartFont = { family: "'Inter', sans-serif", size: 11, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };

    labState.dup.charts.rel = new Chart(ctx, {
        type:'scatter', data:{ datasets:[
            {label:'Pts', data:pts, backgroundColor:'#ffffff', borderColor:'#0f766e', borderWidth: 1.5, pointRadius:3, order:2},
            {label:'+', data:cU, type:'line', borderColor:'#e11d48', borderWidth:2, borderDash: [5,5], fill:false, pointRadius:0, tension:0, order:1, pointStyle: 'line'},
            {label:'-', data:cD, type:'line', borderColor:'#e11d48', borderWidth:2, borderDash: [5,5], fill:false, pointRadius:0, tension:0, order:1, pointStyle: 'line'}
        ]}, options:{
            responsive:true, maintainAspectRatio:false, animation: disableAnim ? false : {duration: 1000}, 
            plugins:{ legend:{display:false}, title: { display: true, text: [`Duplicate Samples - ${el}`, `Relative Difference % vs Average wt. %`], font: { size: 14, weight: 'bold', family: "'Inter', sans-serif"}, color: '#1e293b' }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 } },
            scales:{ 
                x:{type: 'linear', title:{display:true,text:`Average ${el} wt. %`, font:{weight:'bold'}, color:'#475569'}, min: 0, suggestedMax: Math.ceil(mx + 0.5), grid:{color:'#e2e8f0', drawTicks:false}, ticks:{font: chartFont}}, 
                y:{type: 'linear', title:{display:true,text:'Relative Difference %', font:{weight:'bold'}, color:'#475569'}, grid: gridStyle, ticks:{font: chartFont, stepSize:20, callback: v => v.toFixed(2)}, min:-100, max:100} 
            }
        }
    });
}

function renderDupScatterChart(el, pts, m, c, r2, mx, disableAnim) {
    const canvas = document.getElementById('dupChartScatter');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let existChart = Chart.getChart('dupChartScatter');
    if(existChart) existChart.destroy();
    
    let maxY = pts.length > 0 ? pts.reduce((max, d) => d.y > max ? d.y : max, pts[0].y) : 0;
    let maxVal = Math.max(mx, maxY) * 1.1; 
    
    let regLine = [{x:0, y:m*0+c}, {x:maxVal, y:m*maxVal+c}];
    let oneToOneLine = [{x:0, y:0}, {x:maxVal, y:maxVal}];
    
    const chartFont = { family: "'Inter', sans-serif", size: 11, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };

    labState.dup.charts.sct = new Chart(ctx, {
        type:'scatter', data:{ datasets:[
            {label:'Pts', data:pts, backgroundColor:'#0f766e', borderColor:'#0f766e', pointStyle:'circle', pointRadius:3.5, order:3},
            {label:'Reg', data:regLine, type:'line', borderColor:'#e11d48', borderWidth:1.5, fill:false, pointRadius:0, order:2, pointStyle: 'line'},
            {label:'Ref', data:oneToOneLine, type:'line', borderColor:'#94a3b8', borderDash:[5,5], borderWidth:1.5, fill:false, pointRadius:0, order:1, pointStyle: 'line'}
        ]}, options:{
            responsive:true, maintainAspectRatio:false, animation: disableAnim ? false : {duration: 1000},
            plugins:{ legend:{display:false}, title:{ display:true, text:[`Scatter Plot of ${el}`, 'Exploration Sample', '', `y = ${m.toFixed(4)}x ${c>=0?'+':'-'} ${Math.abs(c).toFixed(4)}`, `R² = ${r2.toFixed(3)}`], font:{size:14, weight:'bold', family: "'Inter', sans-serif"}, color:'#1e293b'}, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 } },
            scales:{ 
                x:{type: 'linear', title:{display:true,text:`Original ${el} %`, font:{weight:'bold'}, color:'#475569'}, grid:gridStyle, ticks:{font:chartFont}, min:0, max:maxVal}, 
                y:{type: 'linear', title:{display:true,text:`Duplicate ${el} %`, font:{weight:'bold'}, color:'#475569'}, grid:gridStyle, ticks:{font:chartFont}, min:0, max:maxVal} 
            }
        }
    });
}

function renderDupCumChart(el, pts, lim, passCount, totalCount, disableAnim) {
    const canvas = document.getElementById('dupChartCumFreq');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let existChart = Chart.getChart('dupChartCumFreq');
    if(existChart) existChart.destroy();
    let limLine = [{x:0,y:lim}, {x:100,y:lim}];
    
    const chartFont = { family: "'Inter', sans-serif", size: 11, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };

    labState.dup.charts.cum = new Chart(ctx, {
        type:'scatter', data:{ datasets:[
            {label:'Err', data:pts, backgroundColor:'#0f766e', borderColor:'#0f766e', pointStyle:'circle', pointRadius:3.5, order:2},
            {label:'Lim', data:limLine, type:'line', borderColor:'#e11d48', borderDash:[10,5], borderWidth:2, fill:false, pointRadius:0, order:1, pointStyle: 'line'}
        ]}, options:{
            responsive:true, maintainAspectRatio:false, animation: disableAnim ? false : {duration: 1000}, 
            plugins:{
                legend:{display:false},
                title: { display: true, text: [`Duplicate Samples - ${el}`, 'Cumulative Frequency of the Relative Error', 'Estimate of Precision'], font: { size: 14, weight: 'bold', family: "'Inter', sans-serif"}, color: '#1e293b' },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 }
            },
            scales:{
                x:{type: 'linear', title:{display:true,text:'Cumulative Frequency %', font:{weight:'bold'}, color:'#475569'}, grid:gridStyle, ticks:{font:chartFont, stepSize:10, callback:v=>v+'%'}, min:0, max:100},
                y:{type: 'linear', title:{display:true,text:'Relative Error %', font:{weight:'bold'}, color:'#475569'}, grid:gridStyle, ticks:{font:chartFont, stepSize:10, callback:v=>v+'%'}, min:0, max:100}
            }
        },
        plugins: [{
            id: 'customCenterText',
            afterDraw: (chart) => {
                const ctxArea = chart.ctx;
                let safeY = lim + 15; if (safeY > 80) safeY = lim - 15; 
                let yP = chart.scales.y.getPixelForValue(safeY);
                let xP = chart.scales.x.getPixelForValue(50);
                let precisionRate = totalCount === 0 ? 0 : (passCount / totalCount) * 100;
                let isAcceptable = precisionRate >= 90; 
                
                ctxArea.save(); ctxArea.textAlign='center'; ctxArea.fillStyle = isAcceptable ? '#0f766e' : '#e11d48'; ctxArea.font='bold 12px sans-serif';
                ctxArea.fillText(isAcceptable ? 'Precision Acceptable' : 'Precision Not Acceptable', xP, yP); 
                ctxArea.fillText(`data based on ${el}`, xP, yP+14); 
                ctxArea.restore();
            }
        }]
    });
}

async function generateDupPdf() {
    const els = Array.from(document.querySelectorAll('.dup-pdf-el-cb:checked')).map(c => c.value);
    
    document.getElementById('dupPdfModal')?.classList.add('hidden');
    
    if (!els.length) {
        showToast('Select at least one element to print!', 'warning');
        return;
    }

    showLabOverlay("Preparing PDF", "Downloading rendering module...");

    try {
        await ensurePdfLibraries();
    } catch(e) {
        hideLabOverlay();
        showToast("Failed to load PDF library. Check your internet connection.", "error");
        return;
    }

    const jsPDFClass = getJSPDFInstance();
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        hideLabOverlay();
        showToast('PDF library not detected.', 'error');
        return;
    }

    showLabOverlay("Generating PDF Report", "Rendering Statistics Table...");

    const origEl = document.getElementById('dupElementSelect')?.value;
    const pdf = new jsPDFClass('p', 'mm', 'a4'); 
    
    const wrapSum = document.getElementById('dupSummaryWrap');
    const wrap1 = document.getElementById('dupChart1Wrap');
    const wrap2 = document.getElementById('dupChart2Wrap');
    const wrap3 = document.getElementById('dupChart3Wrap');

    const domState = { 
        wSumStyle: wrapSum.getAttribute('style') || '',
        w1Style: wrap1.getAttribute('style') || '', 
        w2Style: wrap2.getAttribute('style') || '', 
        w3Style: wrap3.getAttribute('style') || '' 
    };

    try {
        wrapSum.style.overflow = "visible"; wrapSum.style.maxHeight = "none";
        wrapSum.style.position = "fixed"; wrapSum.style.top = "0px"; wrapSum.style.left = "0px";
        wrapSum.style.width = "max-content"; wrapSum.style.minWidth = "1000px";
        wrapSum.style.zIndex = "1"; // Tepat di bawah loading overlay
        wrapSum.style.backgroundColor = "#ffffff";
        
        await new Promise(r => setTimeout(r, 300));
        
        let targetWidth = wrapSum.scrollWidth + 10;
        const canvasTable = await html2canvas(wrapSum, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: targetWidth, windowWidth: targetWidth });
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
        pdf.text(`Nickel QAQC Validation Report - Duplicate Summary`, pageWidth / 2, 15, { align: 'center' });

        const mX = 10, mY = 25;
        let maxW = pageWidth - (mX * 2); 
        let maxH = pdf.internal.pageSize.getHeight() - mY - 10; 
        
        let finalW = maxW; let finalH = (canvasTable.height * finalW) / canvasTable.width;
        if (finalH > maxH) { finalH = maxH; finalW = (canvasTable.width * finalH) / canvasTable.height; }
        pdf.addImage(canvasTable.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - finalW) / 2, mY, finalW, finalH);

        wrapSum.setAttribute('style', domState.wSumStyle);

        const chartStyles = `position: fixed; top: 0px; left: 0px; z-index: 1; background-color: #ffffff; display: block; width: 1200px; height: 500px; padding: 20px; box-sizing: border-box;`;
        wrap1.setAttribute('style', chartStyles); wrap2.setAttribute('style', chartStyles); wrap3.setAttribute('style', chartStyles);

        for (let e of els) {
            showLabOverlay("Generating PDF Report", `Rendering Element Chart: [${e}]...`);
            document.getElementById('dupElementSelect').value = e;
            setDuplicateDefaults(); runDupAnalysis(true);
            if (labState.dup.charts.rel) labState.dup.charts.rel.resize();
            if (labState.dup.charts.sct) labState.dup.charts.sct.resize();
            if (labState.dup.charts.cum) labState.dup.charts.cum.resize();
            await new Promise(r => setTimeout(r, 800));

            const c1 = await html2canvas(wrap1, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200, height: 500 });
            const c2 = await html2canvas(wrap2, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200, height: 500 });
            const c3 = await html2canvas(wrap3, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200, height: 500 });

            pdf.addPage();
            const pageWidthChart = pdf.internal.pageSize.getWidth();
            pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
            pdf.text(`Nickel QAQC Validation Report - Duplicate Element: ${e}`, pageWidthChart / 2, 15, { align: 'center' });

            let drawW = maxW; let drawH = (c1.height * drawW) / c1.width; 
            let yPos = mY;
            
            pdf.addImage(c1.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - drawW) / 2, yPos, drawW, drawH);
            yPos += drawH + 5; pdf.addImage(c2.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - drawW) / 2, yPos, drawW, drawH);
            yPos += drawH + 5; pdf.addImage(c3.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - drawW) / 2, yPos, drawW, drawH);
        }

        showLabOverlay("Generating PDF Report", `Saving PDF File...`);
        pdf.save('QAQC_Duplicate_Samples_Report.pdf');
        await new Promise(r=>setTimeout(r,500));
        showToast("PDF downloaded successfully.", "success");
    } catch(e) { 
        showToast('Failed to render PDF!', 'error'); console.error(e); 
    } finally {
        wrapSum.setAttribute('style', domState.wSumStyle); wrap1.setAttribute('style', domState.w1Style);
        wrap2.setAttribute('style', domState.w2Style); wrap3.setAttribute('style', domState.w3Style);
        
        if(origEl) {
            document.getElementById('dupElementSelect').value = origEl;
            setDuplicateDefaults(); runDupAnalysis();
        }
        hideLabOverlay();
    }
}


// ============================================================================
// LAB QA/QC: STANDARD (CRM) MAPPER & PROCESSOR
// ============================================================================
let tempStdImportData = { headers: [], data: [] };

function initLabStandard() {
    document.getElementById('stdProcessBtn')?.addEventListener('click', () => {
        const file = document.getElementById('stdCsvFile').files[0];
        if (!file) return showToast('Please select CRM CSV/Database file!', 'warning');

        showLoader("Reading Lab File", "Extracting headers for CRM mapping...");
        setTimeout(() => {
            Papa.parse(file, {
                header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, ''),
                complete: res => {
                    if (!res.data.length) { hideLoader(); return showToast('Empty CSV data!', 'error'); }
                    tempStdImportData.headers = res.meta.fields;
                    tempStdImportData.data = res.data;
                    hideLoader();
                    openStdMapperWizard();
                }
            });
        }, 500);
    });

    ['stdElementSelect', 'stdCrmSelect'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            loadStdConfigToUI(); runStdAnalysis();
        });
    });

    ['stdTargetVal', 'stdSdVal'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            saveStdConfigFromUI(); runStdAnalysis(); 
        });
    });

    document.getElementById('stdOpenPdfBtn')?.addEventListener('click', () => {
        document.getElementById('stdPdfModal')?.classList.remove('hidden');
    });
    document.getElementById('stdGeneratePdfBtn')?.addEventListener('click', async () => generateStdPdf());
}

window.openStdMapperWizard = function() {
    const idTbody = document.getElementById('std-mapper-id-tbody');
    const assayTbody = document.getElementById('std-mapper-assay-tbody');
    document.getElementById('std-mapper-row-count').textContent = `${tempStdImportData.data.length.toLocaleString()} ROWS DETECTED`;

    const headers = tempStdImportData.headers;
    const sampleRows = tempStdImportData.data.slice(0, 2);

    // KELOMPOK 1: IDENTIFIERS
    const idReqs = [
        { id: 'Sample_ID', label: 'Sample ID <span class="text-rose-500">*</span>', keywords: ['sample', 'id', 'no', 'batch'] },
        { id: 'Remarks', label: 'CRM Name Col <span class="text-rose-500">*</span>', keywords: ['remark', 'standard', 'crm', 'type'] }
    ];

    // KELOMPOK 2: ASSAYS (Cr2O3 Included)
    const assayReqs = [
        { id: 'Ni', keywords: ['ni'] }, { id: 'Fe', keywords: ['fe'] }, { id: 'Co', keywords: ['co'] },
        { id: 'Al2O3', keywords: ['al2o3', 'al'] }, { id: 'SiO2', keywords: ['sio2', 'si'] },
        { id: 'CaO', keywords: ['cao', 'ca'] }, { id: 'MgO', keywords: ['mgo', 'mg'] },
        { id: 'Cr2O3', keywords: ['cr2o3', 'cr'] }, { id: 'MnO', keywords: ['mno', 'mn'] }
    ];

    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords, isMandatory) => {
        let options = `<option value="">-- Ignore / Not Available --</option>`;
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
        const bgClass = autoSelected ? 'bg-emerald-50/50' : (isMandatory ? 'bg-rose-50/30' : 'bg-white');
        const badge = autoSelected ? `<span class="ml-1.5 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">Mapped</span>` : '';

        return `
            <tr class="std-mapper-row ${bgClass} transition-colors" data-sys="${sysId}" data-mandatory="${isMandatory}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-800">${sysLabel} ${badge}</td>
                <td class="p-2 border-r border-slate-200">
                    <select class="std-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-teal-500 bg-white shadow-sm" onchange="window.updateStdPreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 std-preview-cell truncate max-w-[120px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    idTbody.innerHTML = idReqs.map(req => createRow(req.id, req.label, req.keywords, true)).join('');
    assayTbody.innerHTML = assayReqs.map(req => createRow(req.id, req.id, req.keywords, false)).join('');

    document.getElementById('modal-std-mapper').classList.remove('hidden');
    window.validateStdMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updateStdPreview = function(selectEl) {
    const val = selectEl.value;
    const tr = selectEl.closest('tr');
    const previewCell = tr.querySelector('.std-preview-cell');
    
    if (val) {
        const sampleRows = tempStdImportData.data.slice(0, 2);
        const previewText = sampleRows.map(r => String(r[val]).substring(0,12) || '-').join(' | ');
        previewCell.textContent = previewText; previewCell.title = previewText;
        tr.classList.remove('bg-rose-50/30', 'bg-white'); tr.classList.add('bg-blue-50/50'); 
    } else {
        previewCell.textContent = '-';
        if (tr.dataset.mandatory === 'true') tr.classList.replace('bg-blue-50/50', 'bg-rose-50/30');
        else tr.classList.replace('bg-blue-50/50', 'bg-white');
    }
    window.validateStdMapping();
};

window.addCustomStdAssay = function() {
    const assayTbody = document.getElementById('std-mapper-assay-tbody');
    let customId = prompt("Enter new assay name (e.g., Fe2O3):");
    if (!customId || customId.trim() === '') return;
    
    customId = customId.trim().replace(/[^a-zA-Z0-9_]/g, '');
    let options = `<option value="">-- Ignore --</option>` + tempStdImportData.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    
    assayTbody.insertAdjacentHTML('beforeend', `
        <tr class="std-mapper-row bg-white transition-colors" data-sys="${customId}" data-mandatory="false">
            <td class="p-2 border-r border-slate-200 font-bold text-teal-700">${customId} <span class="ml-1 text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Custom</span></td>
            <td class="p-2 border-r border-slate-200"><select class="std-mapper-select w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold outline-none focus:border-teal-500 bg-white" onchange="window.updateStdPreview(this)">${options}</select></td>
            <td class="p-2 font-mono text-slate-500 std-preview-cell">-</td>
        </tr>
    `);
};

window.validateStdMapping = function() {
    const rows = document.querySelectorAll('.std-mapper-row[data-mandatory="true"]');
    let isValid = true;
    rows.forEach(tr => { if (!tr.querySelector('select').value) isValid = false; });

    const btn = document.getElementById('btn-execute-std-import');
    const status = document.getElementById('std-mapper-status');
    if (isValid) {
        btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "Identifiers linked. Ready to process CRM data.";
        status.className = "text-[11px] text-teal-600 font-black tracking-wide";
    } else {
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        status.textContent = "Missing mandatory identifiers (*)";
        status.className = "text-[11px] text-rose-500 font-bold italic";
    }
};

window.executeStdImport = function() {
    showLoader("Processing CRM Data", "Extracting CRM identifiers and variables...");
    document.getElementById('modal-std-mapper').classList.add('hidden');

    setTimeout(() => {
        const mapDictionary = {}; 
        let mappedAssays = []; 
        
        document.querySelectorAll('.std-mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) {
                mapDictionary[sourceCol] = sysId;
                if (tr.closest('#std-mapper-assay-tbody')) mappedAssays.push(sysId);
            }
        });

        // 1. Transform Data
        const standardizedData = tempStdImportData.data.map((row, index) => {
            let newRow = { _id: index };
            for (const [srcKey, sysKey] of Object.entries(mapDictionary)) {
                let val = row[srcKey];
                newRow[sysKey] = (val !== undefined && val !== null) ? String(val).trim() : '';
            }
            return newRow;
        });

        labState.std.raw = standardizedData;
        labState.std.remarksCol = 'Remarks';

        // 2. Tentukan CRM Unik dari kolom Remarks
        let crmSet = new Set();
        labState.std.raw.forEach(r => {
            let type = r['Remarks'] ? r['Remarks'].toString().toUpperCase().trim() : '';
            if (type && !['', 'ORI', 'ORIGINAL', 'DPL', 'DUP', 'DUPLICATE', 'BLANK'].includes(type)) {
                crmSet.add(type);
            }
        });

        labState.std.crmNames = Array.from(crmSet).sort();
        if (!labState.std.crmNames.length) {
            hideLoader(); return showToast('No rows found with valid CRM markers in Remarks column.', 'error');
        }

        labState.std.crmNames.forEach(crm => { if (!labState.std.config[crm]) labState.std.config[crm] = {}; });

        // 3. Pastikan kolom Assay adalah Numerik
        labState.std.numCols = mappedAssays.filter(h => {
            for(let i=0; i<Math.min(100, labState.std.raw.length); i++){
                let val = labState.std.raw[i][h];
                if (val !== undefined && val !== null && val.toString().trim() !== '') {
                    if (!isNaN(parseCleanNumber(val))) return true;
                }
            } 
            return false;
        });

        if (!labState.std.numCols.length) {
            hideLoader(); return showToast('No numeric element columns found!', 'error');
        }

        // 4. Update UI CRM Panel
        const elSelect = document.getElementById('stdElementSelect');
        const crmSelect = document.getElementById('stdCrmSelect');
        const pdfECont = document.getElementById('stdPdfElements');
        const pdfCCont = document.getElementById('stdPdfCrms');
        
        if(elSelect) elSelect.innerHTML = ''; 
        if(crmSelect) crmSelect.innerHTML = '';
        if(pdfECont) pdfECont.innerHTML = ''; 
        if(pdfCCont) pdfCCont.innerHTML = '';

        labState.std.numCols.forEach(col => {
            let sel = col.toLowerCase() === 'ni' ? 'selected' : '';
            if(elSelect) elSelect.innerHTML += `<option value="${col}" ${sel}>${col}</option>`;
            if(pdfECont) pdfECont.innerHTML += `<label class="flex items-center"><input type="checkbox" class="std-pdf-el-cb w-3 h-3 text-teal-600" value="${col}" checked><span class="ml-1">${col}</span></label>`;
        });

        labState.std.crmNames.forEach((crm, i) => {
            if(crmSelect) crmSelect.innerHTML += `<option value="${crm}" ${i===0?'selected':''}>${crm}</option>`;
            if(pdfCCont) pdfCCont.innerHTML += `<label class="flex items-center"><input type="checkbox" class="std-pdf-crm-cb w-3 h-3 text-teal-600" value="${crm}" checked><span class="ml-1">${crm}</span></label>`;
        });

        document.getElementById('stdParamsBox')?.classList.remove('hidden');
        document.getElementById('stdDashboard')?.classList.remove('hidden');
        document.getElementById('stdDashboard')?.classList.add('flex');
        document.getElementById('stdOpenPdfBtn')?.classList.remove('hidden');
        
        tempStdImportData = { headers: [], data: [] }; // Bersihkan RAM
        
        hideLoader();
        showToast(`CRM data processed successfully. Found ${labState.std.crmNames.length} unique CRMs.`, "success");
        loadStdConfigToUI();
        runStdAnalysis();
    }, 600);
};

function saveStdConfigFromUI() {
    const el = document.getElementById('stdElementSelect')?.value;
    const crm = document.getElementById('stdCrmSelect')?.value;
    const target = parseFloat(document.getElementById('stdTargetVal')?.value);
    const sd = parseFloat(document.getElementById('stdSdVal')?.value);

    if(!el || !crm) return;
    if (!labState.std.config[crm]) labState.std.config[crm] = {};
    if (!isNaN(target) && !isNaN(sd)) {
        labState.std.config[crm][el] = { target: target, sd: sd };
    } else {
        delete labState.std.config[crm][el]; 
    }
}

function loadStdConfigToUI() {
    const el = document.getElementById('stdElementSelect')?.value;
    const crm = document.getElementById('stdCrmSelect')?.value;
    const tInput = document.getElementById('stdTargetVal');
    const sInput = document.getElementById('stdSdVal');

    if(!el || !crm || !tInput || !sInput) return;
    if (labState.std.config[crm] && labState.std.config[crm][el]) {
        tInput.value = labState.std.config[crm][el].target;
        sInput.value = labState.std.config[crm][el].sd;
    } else {
        tInput.value = ''; sInput.value = '';
    }
}

function runStdAnalysis(disableAnim = false) {
    const el = document.getElementById('stdElementSelect')?.value;
    const crm = document.getElementById('stdCrmSelect')?.value;
    const remCol = labState.std.remarksCol;

    if (!el || !crm || !labState.std.raw.length) return;

    const conf = labState.std.config[crm] && labState.std.config[crm][el] ? labState.std.config[crm][el] : null;

    let crmData = [];
    let sumAssay = 0, count = 0, failCount = 0;
    let cLabels = [], cVals = [];
    
    const headers = Object.keys(labState.std.raw[0]);
    const idCol = headers.find(h => ['sample id', 'id', 'sample_id', 'no', 'batch'].includes(h.toLowerCase())) || headers[0];

    labState.std.raw.forEach((r, idx) => {
        let type = r[remCol] ? r[remCol].toString().toUpperCase().trim() : '';
        if (type === crm) {
            let rawVal = r[el];
            let val = parseCleanNumber(rawVal);
            if (!isNaN(val)) {
                count++; sumAssay += val;
                let lbl = r[idCol] || `S-${count}`;
                cLabels.push(lbl); cVals.push(val);

                let zScore = null, status = 'NOT SET', deviasi = null;
                if (conf) {
                    deviasi = val - conf.target;
                    zScore = deviasi / conf.sd;
                    let absZ = Math.abs(zScore);
                    
                    if (absZ > 3) { status = 'FAIL'; failCount++; }
                    else if (absZ > 2) { status = 'WARNING'; }
                    else { status = 'PASS'; }
                }
                
                crmData.push({ num: count, id: lbl, crm: type, val: val, dev: deviasi, z: zScore, stat: status });
            }
        }
    });

    let mean = count > 0 ? (sumAssay / count) : 0;
    let bias = 0;
    if (conf && conf.target > 0) bias = ((mean - conf.target) / conf.target) * 100;

    const nEl = document.getElementById('stdStatN'); if(nEl) nEl.innerText = count;
    const mEl = document.getElementById('stdStatMean'); if(mEl) mEl.innerText = count > 0 ? mean.toFixed(4) : '-';
    const bEl = document.getElementById('stdStatBias'); if(bEl) bEl.innerText = conf ? bias.toFixed(2) + '%' : '-';
    const fEl = document.getElementById('stdStatFail'); if(fEl) fEl.innerText = conf ? failCount : '-';

    renderStdReviewTable(crmData);
    renderStdControlChart(cLabels, cVals, crm, el, conf, disableAnim);
}

function renderStdReviewTable(data) {
    const body = document.getElementById('stdDataTableBody');
    if (!body) return;
    if (!data.length) {
        body.innerHTML = '<tr><td colspan="7" class="px-4 py-3 text-slate-500 italic">No data available for this selection.</td></tr>';
        return;
    }

    let bHTML = '';
    data.forEach(r => {
        let statusHTML = `<span class="bg-slate-400 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">UNCONFIGURED</span>`;
        let bgRow = 'bg-white hover:bg-slate-50';
        
        if (r.stat === 'PASS') { statusHTML = `<span class="bg-emerald-500 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">PASS</span>`; } 
        else if (r.stat === 'WARNING') { statusHTML = `<span class="bg-amber-500 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm">WARNING (>2SD)</span>`; bgRow = 'bg-amber-50'; } 
        else if (r.stat === 'FAIL') { statusHTML = `<span class="bg-rose-600 text-white px-2 py-1 rounded-full text-[9px] font-bold shadow-sm animate-pulse">FAIL (>3SD)</span>`; bgRow = 'bg-rose-50'; }

        bHTML += `<tr class="${bgRow} transition-colors border-b border-slate-100">
            <td class="px-4 py-2 text-slate-500">${r.num}</td>
            <td class="px-4 py-2 font-mono font-bold text-slate-800">${r.id}</td>
            <td class="px-4 py-2 text-slate-600 font-semibold">${r.crm}</td>
            <td class="px-4 py-2 font-bold text-slate-800 bg-slate-50">${r.val.toFixed(4)}</td>
            <td class="px-4 py-2 ${r.dev && r.dev < 0 ? 'text-rose-500' : 'text-teal-600'}">${r.dev !== null ? r.dev.toFixed(4) : '-'}</td>
            <td class="px-4 py-2 font-bold ${r.z !== null && Math.abs(r.z) > 2 ? 'text-rose-600' : 'text-slate-700'}">${r.z !== null ? r.z.toFixed(2) : '-'}</td>
            <td class="px-4 py-2">${statusHTML}</td>
        </tr>`;
    });
    body.innerHTML = bHTML;
}

function renderStdControlChart(labels, vals, crmName, elName, conf, disableAnim) {
    const canvas = document.getElementById('stdControlChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let existChart = Chart.getChart('stdControlChart');
    if(existChart) existChart.destroy();

    const chartFont = { family: "'Inter', sans-serif", size: 11, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };

    let datasets = [{
        label: `Assay ${elName}`, data: vals, borderColor: '#0f172a', backgroundColor: '#0f172a', 
        borderWidth: 1.5, pointRadius: 4, pointHoverRadius: 6, pointStyle: 'circle', tension: 0.1, z: 10
    }];

    let yMin = 0, yMax = 1;
    if (vals.length > 0) {
        let minV = vals.reduce((min, p) => p < min ? p : min, vals[0]);
        let maxV = vals.reduce((max, p) => p > max ? p : max, vals[0]);
        yMin = minV * 0.9;
        yMax = maxV * 1.1;
    }

    if (conf) {
        const t = conf.target; const sd = conf.sd; const len = labels.length;
        datasets.push({ label: 'Target', data: Array(len).fill(t), borderColor: '#0f766e', borderWidth: 2, borderDash: [5,5], pointRadius: 0, fill: false, z: 1, pointStyle: 'line' });
        datasets.push({ label: '+2SD (Warning)', data: Array(len).fill(t + 2*sd), borderColor: '#f59e0b', borderWidth: 2, borderDash: [2,2], pointRadius: 0, fill: false, z: 1, pointStyle: 'line' });
        datasets.push({ label: '-2SD (Warning)', data: Array(len).fill(t - 2*sd), borderColor: '#f59e0b', borderWidth: 2, borderDash: [2,2], pointRadius: 0, fill: false, z: 1, pointStyle: 'line' });
        datasets.push({ label: '+3SD (Control)', data: Array(len).fill(t + 3*sd), borderColor: '#e11d48', borderWidth: 2, pointRadius: 0, fill: false, z: 1, pointStyle: 'line' });
        datasets.push({ label: '-3SD (Control)', data: Array(len).fill(t - 3*sd), borderColor: '#e11d48', borderWidth: 2, pointRadius: 0, fill: false, z: 1, pointStyle: 'line' });

        yMin = Math.min(yMin, t - 4*sd); yMax = Math.max(yMax, t + 4*sd);
    }

    labState.std.chart = new Chart(ctx, {
        type: 'line', data: { labels: labels, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: disableAnim ? false : {duration: 1000},
            layout: { padding: 10 }, 
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#475569', font: chartFont } },
                title: { display: true, text: [`Standard CRM Control Chart - ${crmName}`, `Analysis Element: ${elName} (%)`], font: { size: 16, weight: 'bold', family: "'Inter', sans-serif" }, color: '#1e293b' },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 }
            },
            scales: {
                x: { title: { display: true, text: 'Sequence / Sample ID', font: { weight: 'bold' }, color: '#475569' }, grid: { drawOnChartArea: false }, ticks: { font: chartFont } },
                y: { title: { display: true, text: `${elName} Assay (%)`, font: { weight: 'bold' }, color: '#475569' }, grid: gridStyle, ticks: { font: chartFont }, min: yMin, max: yMax }
            }
        }
    });
}

async function generateStdPdf() {
    const els = Array.from(document.querySelectorAll('.std-pdf-el-cb:checked')).map(c => c.value);
    const crms = Array.from(document.querySelectorAll('.std-pdf-crm-cb:checked')).map(c => c.value);
    
    document.getElementById('stdPdfModal')?.classList.add('hidden');
    
    if (!els.length || !crms.length) {
        showToast('Select at least 1 element and 1 CRM!', 'warning');
        return;
    }

    showLabOverlay("Preparing PDF", "Downloading rendering module...");

    try {
        await ensurePdfLibraries();
    } catch(e) {
        hideLabOverlay();
        showToast("Failed to load PDF library. Check your internet connection.", "error");
        return;
    }

    const jsPDFClass = getJSPDFInstance();
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        hideLabOverlay();
        showToast('PDF library not detected.', 'error');
        return;
    }

    showLabOverlay("Generating PDF Report", "Rendering Charts...");
    
    const origEl = document.getElementById('stdElementSelect')?.value;
    const origCrm = document.getElementById('stdCrmSelect')?.value;
    
    const pdf = new jsPDFClass('l', 'mm', 'a4'); 
    let isFirstPage = true;
    
    const wrapStats = document.getElementById('stdStatsGrid');
    const wrapChart = document.getElementById('stdChartWrap');
    
    const domState = { 
        wSStyle: wrapStats.getAttribute('style') || '',
        wCStyle: wrapChart.getAttribute('style') || '' 
    };

    try {
        const fixedBaseStyles = `position: fixed; top: 0px; left: 0px; z-index: 1; background-color: #ffffff; width: 1200px; padding: 20px; box-sizing: border-box;`;
        wrapStats.setAttribute('style', fixedBaseStyles);
        wrapChart.setAttribute('style', fixedBaseStyles + " height: 600px;");

        for (let c of crms) {
            for (let e of els) {
                if (labState.std.config[c] && labState.std.config[c][e]) {
                    showLabOverlay("Generating PDF Report", `Rendering CRM [${c}] Element [${e}]...`);
                    
                    document.getElementById('stdCrmSelect').value = c;
                    document.getElementById('stdElementSelect').value = e;
                    loadStdConfigToUI();
                    runStdAnalysis(true);
                    if (labState.std.chart) labState.std.chart.resize();
                    await new Promise(r => setTimeout(r, 800));

                    const canvasStats = await html2canvas(wrapStats, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200 });
                    const canvasChart = await html2canvas(wrapChart, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 1200, height: 600 });

                    if (!isFirstPage) pdf.addPage();
                    isFirstPage = false;

                    const pageWidth = pdf.internal.pageSize.getWidth();
                    pdf.setFontSize(16); 
                    pdf.setFont("helvetica", "bold");
                    pdf.text(`Nickel QAQC Validation Report - CRM ${c} | Element: ${e}`, pageWidth / 2, 15, { align: 'center' });

                    const targetData = labState.std.config[c][e].target;
                    const sdData = labState.std.config[c][e].sd;
                    
                    pdf.setFontSize(10);
                    pdf.setFont("helvetica", "italic");
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`Certified Value (Target): ${targetData}  |  1 Standard Deviation: ${sdData}`, pageWidth / 2, 22, { align: 'center' });

                    const mX = 10;
                    let maxW = pageWidth - (mX * 2); 
                    
                    let statH = (canvasStats.height * maxW) / canvasStats.width;
                    pdf.addImage(canvasStats.toDataURL('image/jpeg', 1.0), 'JPEG', (pageWidth - maxW) / 2, 26, maxW, statH);

                    let chartY = 26 + statH + 5;
                    let chartH = (canvasChart.height * maxW) / canvasChart.width;
                    
                    let maxChartH = pdf.internal.pageSize.getHeight() - chartY - 10;
                    if (chartH > maxChartH) { 
                        let shrinkRatio = maxChartH / chartH;
                        chartH = maxChartH; 
                        maxW = maxW * shrinkRatio; 
                    }
                    
                    let chartX = (pageWidth - maxW) / 2;
                    pdf.addImage(canvasChart.toDataURL('image/jpeg', 1.0), 'JPEG', chartX, chartY, maxW, chartH);
                }
            }
        }

        if (isFirstPage) {
            showToast("No report printed! Make sure Target & SD values are configured.", "warning");
        } else {
            showLabOverlay("Generating PDF Report", `Saving PDF File...`);
            pdf.save('QAQC_Standard_CRM_Report.pdf');
            await new Promise(r=>setTimeout(r,500));
            showToast("PDF downloaded successfully.", "success");
        }
    } catch(e) { 
        showToast('Error occurred while rendering PDF!', 'error'); console.error(e); 
    } finally {
        wrapStats.setAttribute('style', domState.wSStyle);
        wrapChart.setAttribute('style', domState.wCStyle);
        document.getElementById('stdElementSelect').value = origEl;
        document.getElementById('stdCrmSelect').value = origCrm;
        loadStdConfigToUI();
        runStdAnalysis();
        hideLabOverlay();
    }
}

// INJEKSI UI LAB SAAT HALAMAN DIMUAT (Robust Initialization)
function initLabModule() {
    injectQAQCLabUI();
    initLabBlank();
    initLabDuplicate();
    initLabStandard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLabModule);
} else {
    initLabModule();
}