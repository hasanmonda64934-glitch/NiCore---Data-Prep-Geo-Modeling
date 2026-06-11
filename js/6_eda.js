// ==========================================
// 6_EDA.JS (CLEANED - SNOWDEN ARCHITECTURE)
// Advanced Exploratory Data Analysis (Murni Statistik & Outlier)
// ==========================================

let edaScatterInst = null, edaProbInst = null, edaContactInst = null, edaSwathInst = null;
let edaFinalHistInst = null;

function getElColor(elName, alpha = 1) {
    const el = String(elName).toUpperCase();
    if (el.includes('NI')) return `rgba(16, 185, 129, ${alpha})`;      
    if (el.includes('FE')) return `rgba(239, 68, 68, ${alpha})`;       
    if (el.includes('MGO')) return `rgba(14, 165, 233, ${alpha})`;     
    if (el.includes('SIO2')) return `rgba(100, 116, 139, ${alpha})`;   
    if (el.includes('CO')) return `rgba(99, 102, 241, ${alpha})`;      
    if (el.includes('AL')) return `rgba(245, 158, 11, ${alpha})`;      
    if (el.includes('CR2O3')) return `rgba(4, 120, 87, ${alpha})`;        
    return `rgba(148, 163, 184, ${alpha})`; 
}

function calculateEDA() {
    if (!state.compositedData || state.compositedData.length === 0) { 
        state.edaStats = []; 
        return; 
    }
    
    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const elements = state.headers.filter(h => allowedAssays.includes(h));
    
    let stats = []; 
    const domainOrder = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK'];
    domains.sort((a, b) => {
        let idxA = domainOrder.indexOf(a); let idxB = domainOrder.indexOf(b);
        if(idxA === -1) idxA = 99; if(idxB === -1) idxB = 99;
        return idxA - idxB;
    });

    domains.forEach(domain => {
        const domData = state.compositedData.filter(d => d.Geo_Domain === domain);
        if(domData.length === 0) return;

        let domStats = { Domain: domain, Count: domData.length };
        
        let weights = [];
        if (state.detectedCoords.x && state.detectedCoords.y) {
            weights = getDeclusteringWeights(domData, state.detectedCoords.x, state.detectedCoords.y, 25);
        }
        
        elements.forEach(el => {
            const vals = domData.filter(d => d[el] !== '' && !isNaN(parseFloat(d[el]))).map(d => parseFloat(d[el])).filter(v => v >= 0);
            if (vals.length === 0) return;

            const n = vals.length;
            const sum = vals.reduce((a, b) => a + b, 0);
            const mean = sum / n;
            
            let declusteredSum = 0, validWtSum = 0;
            if (weights.length > 0) {
                domData.forEach((d, idx) => {
                    const val = parseFloat(d[el]);
                    if (!isNaN(val) && val >= 0 && weights[idx] > 0) { declusteredSum += val * weights[idx]; validWtSum += weights[idx]; }
                });
            }
            const declusteredMean = validWtSum > 0 ? (declusteredSum / validWtSum) : mean;

            const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
            const stdDev = Math.sqrt(variance);
            
            const sorted = [...vals].sort((a,b) => a - b);
            const q1 = sorted[Math.floor(n * 0.25)] || 0;
            const median = sorted.length % 2 !== 0 ? sorted[Math.floor(n / 2)] : (sorted[Math.floor(n / 2) - 1] + sorted[Math.floor(n / 2)]) / 2;
            const q3 = sorted[Math.floor(n * 0.75)] || 0;

            let sumCube = 0, sumQuad = 0;
            vals.forEach(v => {
                const diff = v - mean;
                sumCube += Math.pow(diff, 3);
                sumQuad += Math.pow(diff, 4);
            });
            let skewness = 0, kurtosis = 0;
            if (n > 2 && stdDev > 0) {
                skewness = (sumCube / n) / Math.pow(stdDev, 3);
                kurtosis = (sumQuad / n) / Math.pow(stdDev, 4) - 3; 
            }

            domStats[`${el}_Min`] = Math.min(...vals).toFixed(2); 
            domStats[`${el}_Max`] = Math.max(...vals).toFixed(2);
            domStats[`${el}_Q1`] = q1.toFixed(2);
            domStats[`${el}_Median`] = median.toFixed(3);
            domStats[`${el}_Q3`] = q3.toFixed(2);
            domStats[`${el}_Mean`] = mean.toFixed(3); 
            domStats[`${el}_DeclusMean`] = declusteredMean.toFixed(3);
            domStats[`${el}_StdDev`] = stdDev.toFixed(3); 
            domStats[`${el}_Var`] = variance.toFixed(3); 
            domStats[`${el}_CV`] = (mean > 0 ? (stdDev / mean) : 0).toFixed(2); 
            domStats[`${el}_Skew`] = skewness.toFixed(2); 
            domStats[`${el}_Kurt`] = kurtosis.toFixed(2); 
            domStats[`${el}_TopCut98`] = calculatePercentile(vals, 0.98).toFixed(2);
        });
        stats.push(domStats);
    });
    
    state.edaStats = stats;
}

function resetEDAParameters() {
    if (state.compositedData.length === 0 || !confirm("Manual Top-Cut values will be reset. Continue?")) return;
    calculateEDA(); 
    renderEDA(); 
    showToast("Parameters reset to default engine calculations.", "success");
}

function renderEDA() {
    const emptyState = document.getElementById('eda-empty');
    const mainContainer = document.getElementById('eda-container');
    const actionPanel = document.getElementById('actions-eda');

    if (!state.edaStats || state.edaStats.length === 0) { 
        if(mainContainer) mainContainer.classList.add('hidden'); 
        if(emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
        if(actionPanel) actionPanel.classList.add('hidden');
        return; 
    }
    
    if(emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
    if(mainContainer) mainContainer.classList.remove('hidden');
    if(actionPanel) { actionPanel.classList.remove('hidden'); actionPanel.classList.add('flex'); }

    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const elements = state.headers.filter(h => allowedAssays.includes(h));
    
    const fillOpt = (id, def, isDom = false, addAll = false) => {
        const el = document.getElementById(id); if(!el) return;
        const arr = isDom ? domains : elements;
        if(arr.length===0) return;
        const cur = el.value;
        let html = '';
        if(addAll) html += `<option value="ALL" class="bg-indigo-50 text-indigo-700 font-black">ALL DOMAINS (Overlay)</option>`;
        html += arr.map(a => `<option value="${a}" class="bg-white text-slate-800 font-bold">${a}</option>`).join('');
        el.innerHTML = html;
        if(cur === 'ALL' && addAll) el.value = 'ALL';
        else if(arr.includes(cur)) el.value = cur; 
        else if (addAll) el.value = 'ALL';
        else if (arr.includes(def)) el.value = def; 
        else el.value = arr[0];
    };

    fillOpt('univariate-element-select', 'Ni');
    fillOpt('select-x', 'MgO'); fillOpt('select-y', 'Fe');
    fillOpt('select-ternary-a', 'Fe'); fillOpt('select-ternary-b', 'SiO2'); fillOpt('select-ternary-c', 'MgO');
    
    fillOpt('select-prob-domain', domains[0], true, true);
    fillOpt('heatmap-domain', 'ALL', true, true);
    
    fillOpt('contact-element', 'Ni'); 
    if (domains.length >= 2) {
        fillOpt('contact-dom-a', domains[0], true); 
        fillOpt('contact-dom-b', domains[1], true);
    } else {
        fillOpt('contact-dom-a', domains[0], true); 
        fillOpt('contact-dom-b', domains[0], true); 
    }
    
    fillOpt('swath-element', 'Ni'); 
    fillOpt('swath-domain', domains[0], true);
    
    const sAxis = document.getElementById('swath-axis');
    if(sAxis) {
        let h = '';
        if(state.detectedCoords.y) h += `<option value="${state.detectedCoords.y}" class="bg-white text-slate-800 font-bold">North (Y)</option>`;
        if(state.detectedCoords.x) h += `<option value="${state.detectedCoords.x}" class="bg-white text-slate-800 font-bold">East (X)</option>`;
        if(state.detectedCoords.z) h += `<option value="${state.detectedCoords.z}" class="bg-white text-slate-800 font-bold">Elevation (Z)</option>`;
        sAxis.innerHTML = h;
    }

    try {
        renderEDAUnivariateSection();
        renderCorrelationHeatmap(); 
        renderEDAScatter();
        renderTernaryPlot();
        renderContactAnalysis();
        renderSwathPlot();
    } catch(e) { console.error("EDA Render Error:", e); }
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderEDAUnivariateSection() {
    const el = document.getElementById('univariate-element-select').value;
    if(!el) return;

    let html = '';
    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    const domainOrder = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK'];
    
    domains.sort((a, b) => {
        let idxA = domainOrder.indexOf(a); let idxB = domainOrder.indexOf(b);
        if(idxA === -1) idxA = 99; if(idxB === -1) idxB = 99;
        return idxA - idxB;
    });

    domains.forEach(dom => {
        const stat = state.edaStats.find(s => s.Domain === dom);
        if(!stat || !stat[`${el}_Mean`]) return;
        
        const cv = parseFloat(stat[`${el}_CV`]);
        const cvClass = cv > 1.2 ? 'text-rose-600 font-black' : 'text-indigo-600 font-bold';
        
        const skew = parseFloat(stat[`${el}_Skew`]);
        const skewClass = skew > 1.5 || skew < -1.5 ? 'text-rose-600 font-bold' : 'text-slate-600';
        
        const kurt = parseFloat(stat[`${el}_Kurt`]);
        const kurtClass = kurt > 3.0 ? 'text-rose-600 font-bold' : 'text-slate-600';

        html += `<tr class="hover:bg-slate-50 transition-colors text-[11px]">
            <td class="px-3 py-2 border-r flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm shadow-sm" style="background:${getDomainColor(dom)}"></span><b class="text-slate-800">${dom}</b></td>
            <td class="px-3 py-2 border-r text-center font-medium">${stat.Count}</td>
            <td class="px-3 py-2 border-r text-right text-slate-500">${stat[`${el}_Min`]}</td>
            <td class="px-3 py-2 border-r text-right text-slate-500">${stat[`${el}_Max`]}</td>
            <td class="px-3 py-2 border-r text-right text-slate-500">${stat[`${el}_Q1`]}</td>
            <td class="px-3 py-2 border-r text-right font-bold text-slate-700">${stat[`${el}_Median`]}</td>
            <td class="px-3 py-2 border-r text-right text-slate-500">${stat[`${el}_Q3`]}</td>
            <td class="px-3 py-2 border-r text-right bg-emerald-50/40 text-slate-700">${stat[`${el}_Mean`]}</td>
            <td class="px-3 py-2 border-r text-right bg-emerald-50/40 font-black text-emerald-700">${stat[`${el}_DeclusMean`]}</td>
            <td class="px-3 py-2 border-r text-right bg-indigo-50/40 text-slate-500">${stat[`${el}_Var`]}</td>
            <td class="px-3 py-2 border-r text-right bg-indigo-50/40 text-indigo-600">${stat[`${el}_StdDev`]}</td>
            <td class="px-3 py-2 border-r text-right bg-indigo-50/40 ${cvClass}">${stat[`${el}_CV`]}</td>
            <td class="px-3 py-2 border-r text-right bg-purple-50/30 ${skewClass}">${stat[`${el}_Skew`]}</td>
            <td class="px-3 py-2 border-r text-right bg-purple-50/30 ${kurtClass}">${stat[`${el}_Kurt`]}</td>
            <td class="px-3 py-2 text-right font-black text-amber-700 bg-amber-50/60">${stat[`${el}_TopCut98`]}</td>
        </tr>`;
    });
    
    const tbody = document.getElementById('eda-univariate-tbody');
    if(tbody) tbody.innerHTML = html;
    
    const pDom = document.getElementById('select-prob-domain').value;
    renderProbabilityPlot(el, pDom);
    renderFinalDistribution();
}

function renderCorrelationHeatmap() {
    if (typeof Plotly === 'undefined') return;
    const container = document.getElementById('eda-heatmap-plot');
    if (!container) return;

    if (container.clientWidth === 0 || container.clientHeight === 0) {
        setTimeout(renderCorrelationHeatmap, 250);
        return;
    }

    container.innerHTML = '';
    const plotDiv = document.createElement('div');
    plotDiv.style.position = 'absolute';
    plotDiv.style.inset = '0';
    container.appendChild(plotDiv);

    const dom = document.getElementById('heatmap-domain').value;
    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3'];
    const elements = state.headers.filter(h => allowedAssays.includes(h));
    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    
    let data = state.compositedData;
    if (dom !== 'ALL' && domains.includes(dom)) {
        data = data.filter(d => d.Geo_Domain === dom);
    }

    const n = elements.length;
    let zValues = Array(n).fill(0).map(() => Array(n).fill(0));
    let annotations = [];

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0, count = 0;
            data.forEach(d => {
                const x = parseFloat(d[elements[i]]);
                const y = parseFloat(d[elements[j]]);
                if (!isNaN(x) && !isNaN(y)) {
                    sumX += x; sumY += y; sumXY += x * y;
                    sumX2 += x * x; sumY2 += y * y;
                    count++;
                }
            });
            
            let r = 0;
            if (count > 1) {
                const num = (count * sumXY) - (sumX * sumY);
                const den = Math.sqrt((count * sumX2 - sumX * sumX) * (count * sumY2 - sumY * sumY));
                r = den !== 0 ? num / den : 0;
            }
            
            zValues[n - 1 - i][j] = r; 
            const textColor = Math.abs(r) > 0.5 ? '#ffffff' : '#334155';
            annotations.push({ x: elements[j], y: elements[i], text: r.toFixed(2), font: { color: textColor, size: 10, weight: 'bold' }, showarrow: false });
        }
    }

    const trace = {
        x: elements, y: [...elements].reverse(), z: zValues, type: 'heatmap', colorscale: 'RdBu', zmin: -1, zmax: 1,
        showscale: true, colorbar: { thickness: 12, len: 0.8, tickfont: { size: 9, color: '#64748b' } }
    };

    const layout = {
        margin: { l: 40, r: 10, b: 30, t: 10 },
        xaxis: { tickfont: { size: 10, weight: 'bold', color: '#475569' } },
        yaxis: { tickfont: { size: 10, weight: 'bold', color: '#475569' } },
        annotations: annotations, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', autosize: true
    };

    Plotly.newPlot(plotDiv, [trace], layout, { responsive: true, displayModeBar: false });
}

function renderProbabilityPlot(el = null, dom = null) {
    if(!el) el = document.getElementById('univariate-element-select').value;
    if(!dom) dom = document.getElementById('select-prob-domain').value;
    
    document.getElementById('top-cut-label').textContent = `Top-Cut ${el} (${dom === 'ALL' ? 'Selected Domain' : dom})`;
    
    if(edaProbInst) edaProbInst.destroy();
    Chart.defaults.font.family = "'Inter', sans-serif";
    
    let datasets = [];
    let minVal = Infinity, maxVal = -Infinity;
    
    const domainsToProcess = dom === 'ALL' ? [...new Set(state.compositedData.map(d => d.Geo_Domain))] : [dom];

    domainsToProcess.forEach(activeDom => {
        let vals = state.compositedData
            .filter(d => d.Geo_Domain === activeDom && d[el] !== '' && !isNaN(parseFloat(d[el])))
            .map(d => parseFloat(d[el]))
            .filter(v => v > 0)
            .sort((a,b) => a-b);
            
        if(vals.length === 0) return;

        if (vals[0] < minVal) minVal = vals[0];
        if (vals[vals.length-1] > maxVal) maxVal = vals[vals.length-1];

        let plotData = []; 
        const n = vals.length;
        for(let i = 0; i < n; i++) {
            let prob = ((i + 1 - 0.5) / n) * 100;
            plotData.push({x: prob, y: vals[i]});
        }
        
        let color = getDomainColor(activeDom);
        if(dom === 'ALL' && activeDom === 'UNCLASSIFIED') color = '#94a3b8'; 
        else if(dom !== 'ALL') color = getElColor(el, 1); 

        datasets.push({ 
            label: `${el} (${activeDom})`, 
            data: plotData, 
            borderColor: color, 
            backgroundColor: color, 
            borderWidth: dom === 'ALL' ? 1.5 : 2, 
            pointRadius: dom === 'ALL' ? 0.5 : 2, 
            pointHoverRadius: 5, 
            showLine: false 
        });
    });

    if (datasets.length === 0) return;

    let currentCut = 0;
    if (dom !== 'ALL') {
        const statObj = state.edaStats.find(s => s.Domain === dom);
        currentCut = statObj && statObj[`${el}_TopCut98`] ? parseFloat(statObj[`${el}_TopCut98`]) : maxVal;
        datasets.push({ 
            label: 'Top-Cut', 
            data: [{x: 0.1, y: currentCut}, {x: 99.9, y: currentCut}],
            type: 'line', borderColor: '#e11d48', borderDash: [5,5], borderWidth: 2, pointRadius: 0, showLine: true 
        });
    }

    const inputCut = document.getElementById('input-manual-topcut');
    if(inputCut) {
        if (dom === 'ALL') {
            inputCut.value = '';
            inputCut.disabled = true;
            inputCut.placeholder = "Select Single Domain";
        } else {
            inputCut.disabled = false;
            inputCut.value = currentCut.toFixed(2);
        }
    }

    edaProbInst = new Chart(document.getElementById('eda-probability-chart'), {
        type: 'line', 
        data: { datasets: datasets },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                legend: { display: dom === 'ALL', position: 'bottom', labels: { boxWidth: 8, font: {size: 9} } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} (Prob: ${ctx.parsed.x.toFixed(1)}%)` } }
            }, 
            scales: { 
                x: { type: 'linear', title: {display: true, text: 'Cumulative Probability (%)', font:{size:10, weight:'bold'}}, min: 0, max: 100, grid: {color:'#f8fafc'} }, 
                y: { type: 'logarithmic', title: {display: true, text: `${el} Grade (Log Scale)`, font:{size:10, weight:'bold'}}, min: minVal * 0.5, max: maxVal * 1.5, grid: {color:'#f1f5f9'} } 
            } 
        }
    });
}

function applyManualTopCut() {
    const el = document.getElementById('univariate-element-select').value;
    const dom = document.getElementById('select-prob-domain').value;
    if (dom === 'ALL') return showToast("Please select a specific domain to apply top-cut.", "warning");

    const val = parseFloat(document.getElementById('input-manual-topcut').value);
    if(isNaN(val) || val <= 0) return showToast("Invalid value. Must be greater than 0.", "error");
    
    const statObj = state.edaStats.find(s => s.Domain === dom);
    if(statObj) { 
        statObj[`${el}_TopCut98`] = val.toFixed(2); 
        renderEDAUnivariateSection(); renderFinalDistribution(); 
        showToast(`Top-Cut for ${el} (${dom}) successfully locked at ${val.toFixed(2)}%.`, "success"); 
        const inputEl = document.getElementById('input-manual-topcut');
        inputEl.classList.add('bg-emerald-100', 'text-emerald-800');
        setTimeout(() => inputEl.classList.remove('bg-emerald-100', 'text-emerald-800'), 500);
    }
}

function renderEDAScatter() {
    const xCol = document.getElementById('select-x').value, yCol = document.getElementById('select-y').value;
    if(!xCol || !yCol) return;
    
    let datasets = [];
    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    
    domains.forEach(dom => {
        let pts = [];
        const statObj = state.edaStats.find(s => s.Domain === dom);
        const cutX = statObj && statObj[`${xCol}_TopCut98`] ? parseFloat(statObj[`${xCol}_TopCut98`]) : Infinity;
        const cutY = statObj && statObj[`${yCol}_TopCut98`] ? parseFloat(statObj[`${yCol}_TopCut98`]) : Infinity;

        state.compositedData.filter(d=>d.Geo_Domain===dom).forEach((d) => {
            let x = parseFloat(d[xCol]), y = parseFloat(d[yCol]);
            if(!isNaN(x) && !isNaN(y)) {
                x = Math.min(x, cutX); y = Math.min(y, cutY);
                pts.push({x,y});
            }
        });
        if(pts.length>0) datasets.push({ 
            label: dom, data: pts, 
            backgroundColor: getDomainColor(dom).replace('rgb', 'rgba').replace(')', ', 0.5)'), 
            pointRadius: 2.0, borderWidth: 0, hoverRadius: 5 
        });
    });

    if(edaScatterInst) edaScatterInst.destroy();
    edaScatterInst = new Chart(document.getElementById('eda-scatter-chart'), {
        type: 'scatter', data: { datasets },
        options: { 
            responsive:true, maintainAspectRatio:false, 
            plugins:{legend:{position:'top', labels:{usePointStyle:true, boxWidth:8, font:{size:10, weight:'bold'}}}}, 
            scales:{ x:{title:{display:true, text:`${xCol} %`, font:{weight:'bold'}}, grid:{color:'#f8fafc'}}, y:{title:{display:true, text:`${yCol} %`, font:{weight:'bold'}}, grid:{color:'#f8fafc'}} } 
        }
    });
}

function renderTernaryPlot() {
    if (typeof Plotly === 'undefined') return;
    const container = document.getElementById('eda-ternary-plot');
    if (!container) return;

    if (container.clientWidth === 0 || container.clientHeight === 0) {
        setTimeout(renderTernaryPlot, 250);
        return;
    }

    container.innerHTML = '';
    const plotDiv = document.createElement('div');
    plotDiv.style.position = 'absolute';
    plotDiv.style.inset = '0';
    container.appendChild(plotDiv);

    const presetEl = document.getElementById('ternary-preset');
    const preset = presetEl ? presetEl.value : 'custom';
    const customControls = document.getElementById('ternary-custom-controls');

    const getOrigHeader = (searchNames) => {
        if(!state.headers) return null;
        const upperHeaders = state.headers.map(h => h.toUpperCase());
        for (let name of searchNames) {
            const idx = upperHeaders.indexOf(name.toUpperCase());
            if (idx !== -1) return state.headers[idx];
        }
        return null;
    };

    let colA, colB, colC, labelA, labelB, labelC;
    let scaleA = 1, scaleB = 1, scaleC = 1;
    let plotlyData = [];
    let isAlteration = (preset === 'alteration');
    let feCol, alCol, siCol, mgCol, scaleFe = 1, scaleAl = 1, scaleSi = 1, scaleMg = 1;

    if (preset === 'custom') {
        if (customControls) customControls.style.display = 'flex';
        colA = document.getElementById('select-ternary-a').value;
        colB = document.getElementById('select-ternary-b').value;
        colC = document.getElementById('select-ternary-c').value;
        labelA = colA; labelB = colB; labelC = colC;
        
        const getScale = (el) => {
            const e = el.toUpperCase();
            if (e === 'NI' || e === 'CR2O3' || e === 'CR' || e === 'MNO' || e === 'MN') return 10;
            if (e === 'CO') return 100;
            return 1; 
        };
        scaleA = getScale(colA); scaleB = getScale(colB); scaleC = getScale(colC);

    } else if (preset === 'weathering' || preset === 'laterite_type') {
        if (customControls) customControls.style.display = 'none';
        colA = getOrigHeader(['FE2O3', 'FE']); colB = getOrigHeader(['SIO2', 'SI']); colC = getOrigHeader(['MGO', 'MG']);

        if(!colA || !colB || !colC) {
            container.innerHTML = `<div class="w-full h-full flex items-center justify-center text-rose-500 font-bold text-xs bg-rose-50 rounded border border-rose-200">Missing Fe, SiO2, or MgO</div>`; return;
        }

        scaleA = colA.toUpperCase() === 'FE' ? 1.4297 : 1; scaleB = colB.toUpperCase() === 'SI' ? 2.1393 : 1; scaleC = colC.toUpperCase() === 'MG' ? 1.6581 : 1; 
        labelA = 'Fe2O3_Eq'; labelB = 'SiO2_Eq'; labelC = 'MgO_Eq';

        if (preset === 'weathering') {
            plotlyData.push(
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [40, 100, 40, 40], b: [60, 0, 0, 60], c: [0, 0, 60, 0], line: {color: '#ef4444', width: 3}, fillcolor: 'rgba(239, 68, 68, 0.05)', name: 'Limonite', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [60], b: [20], c: [20], text: ['<b>LIMONITE ZONE</b>'], textfont: {color: '#ef4444', size: 13, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false },
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [15, 40, 40, 15, 15], b: [85, 60, 0, 0, 85], c: [0, 0, 60, 85, 0], line: {color: '#f59e0b', width: 3}, fillcolor: 'rgba(245, 158, 11, 0.05)', name: 'Saprolite', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [25], b: [37.5], c: [37.5], text: ['<b>SAPROLITE ZONE</b>'], textfont: {color: '#f59e0b', size: 13, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false },
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 15, 15, 0, 0], b: [100, 85, 0, 0, 100], c: [0, 0, 85, 100, 0], line: {color: '#64748b', width: 3}, fillcolor: 'rgba(100, 116, 139, 0.05)', name: 'Bedrock', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [5], b: [47.5], c: [47.5], text: ['<b>BEDROCK ZONE</b>'], textfont: {color: '#64748b', size: 13, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false }
            );
        } else {
            plotlyData.push(
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [40, 100, 40, 40], b: [60, 0, 0, 60], c: [0, 0, 60, 0], line: {color: '#ef4444', width: 3}, fillcolor: 'rgba(239, 68, 68, 0.05)', name: 'Oxide Laterite', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [65], b: [17.5], c: [17.5], text: ['<b>OXIDE LATERITE</b><br>(Limonitic Ore)'], textfont: {color: '#ef4444', size: 11, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false },
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 40, 0, 0], b: [100, 60, 50, 100], c: [0, 0, 50, 0], line: {color: '#f59e0b', width: 3}, fillcolor: 'rgba(245, 158, 11, 0.05)', name: 'Clay Silicate', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [15], b: [70], c: [15], text: ['<b>CLAY SILICATE</b><br>(Smectite/Nontronite)'], textfont: {color: '#f59e0b', size: 11, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false },
                { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 0, 40, 0], b: [0, 50, 60, 0], c: [100, 50, 0, 100], line: {color: '#10b981', width: 3}, fillcolor: 'rgba(16, 185, 129, 0.05)', name: 'Hydrosilicate', hoverinfo: 'skip' },
                { type: 'scatterternary', mode: 'text', a: [15], b: [15], c: [70], text: ['<b>HYDROSILICATE</b><br>(Garnierite/Serpentine)'], textfont: {color: '#10b981', size: 11, family: 'Inter, sans-serif'}, hoverinfo: 'skip', showlegend: false }
            );
        }

    } else if (preset === 'enrichment') {
        if (customControls) customControls.style.display = 'none';
        colA = getOrigHeader(['FE2O3', 'FE']); colB = getOrigHeader(['NI']); colC = getOrigHeader(['MGO', 'MG']);

        if(!colA || !colB || !colC) return;
        scaleA = colA.toUpperCase() === 'FE' ? 1.4297 : 1; scaleB = 10; scaleC = colC.toUpperCase() === 'MG' ? 1.6581 : 1; 
        labelA = 'Fe2O3_Eq'; labelB = 'Ni (*10)'; labelC = 'MgO_Eq';

        plotlyData.push(
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [50, 100, 50, 50], b: [50, 0, 0, 50], c: [0, 0, 50, 0], line: {color: '#ef4444', width: 3}, fillcolor: 'rgba(239, 68, 68, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [50, 50, 0, 0, 50], b: [50, 15, 15, 100, 50], c: [0, 35, 85, 0, 0], line: {color: '#10b981', width: 3}, fillcolor: 'rgba(16, 185, 129, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [50, 50, 0, 0, 50], b: [15, 0, 0, 15, 15], c: [35, 50, 100, 85, 35], line: {color: '#64748b', width: 3}, fillcolor: 'rgba(100, 116, 139, 0.05)' }
        );
        
    } else if (preset === 'lateritization') {
        if (customControls) customControls.style.display = 'none';
        colA = getOrigHeader(['FE2O3', 'FE']); colB = getOrigHeader(['AL2O3', 'AL']); colC = getOrigHeader(['SIO2', 'SI']);
        if(!colA || !colB || !colC) return;

        scaleA = colA.toUpperCase() === 'FE' ? 1.4297 : 1; scaleB = colB.toUpperCase() === 'AL' ? 1.8895 : 1; scaleC = colC.toUpperCase() === 'SI' ? 2.1393 : 1; 
        labelA = 'Fe2O3_Eq'; labelB = 'Al2O3_Eq'; labelC = 'SiO2_Eq';

        plotlyData.push(
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [50, 100, 50, 50], b: [50, 0, 0, 50], c: [0, 0, 50, 0], line: {color: '#ef4444', width: 3}, fillcolor: 'rgba(239, 68, 68, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 50, 0, 0], b: [100, 50, 50, 100], c: [0, 0, 50, 0], line: {color: '#f59e0b', width: 3}, fillcolor: 'rgba(245, 158, 11, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 50, 0, 0], b: [0, 0, 50, 0], c: [100, 50, 50, 100], line: {color: '#64748b', width: 3}, fillcolor: 'rgba(100, 116, 139, 0.05)' }
        );

    } else if (isAlteration) {
        if (customControls) customControls.style.display = 'none';
        feCol = getOrigHeader(['FE2O3', 'FE']); alCol = getOrigHeader(['AL2O3', 'AL']); siCol = getOrigHeader(['SIO2', 'SI']); mgCol = getOrigHeader(['MGO', 'MG']);
        if(!feCol || !alCol || !siCol || !mgCol) return;

        scaleFe = feCol.toUpperCase() === 'FE' ? 1.4297 : 1; scaleAl = alCol.toUpperCase() === 'AL' ? 1.8895 : 1; scaleSi = siCol.toUpperCase() === 'SI' ? 2.1393 : 1; scaleMg = mgCol.toUpperCase() === 'MG' ? 1.6581 : 1; 
        labelA = 'Al2O3 + Fe2O3'; labelB = 'SiO2'; labelC = 'MgO';

        plotlyData.push(
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [50, 100, 50, 50], b: [50, 0, 0, 50], c: [0, 0, 50, 0], line: {color: '#ef4444', width: 3}, fillcolor: 'rgba(239, 68, 68, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [10, 50, 50, 10, 10], b: [90, 50, 0, 0, 90], c: [0, 0, 50, 90, 0], line: {color: '#f59e0b', width: 3}, fillcolor: 'rgba(245, 158, 11, 0.05)' },
            { type: 'scatterternary', mode: 'lines', fill: 'toself', a: [0, 10, 10, 0, 0], b: [100, 90, 0, 0, 100], c: [0, 0, 90, 100, 0], line: {color: '#64748b', width: 3}, fillcolor: 'rgba(100, 116, 139, 0.05)' }
        );
    }

    const getLabelFormat = (el, scale) => {
        let name = el;
        if (scale > 1.4 && el.toUpperCase() === 'FE') name = 'Fe2O3_Eq';
        else if (scale > 1.8 && el.toUpperCase() === 'AL') name = 'Al2O3_Eq';
        else if (scale > 2.0 && el.toUpperCase() === 'SI') name = 'SiO2_Eq';
        else if (scale > 1.6 && el.toUpperCase() === 'MG') name = 'MgO_Eq';
        return scale !== 1 && (preset === 'custom' || preset === 'enrichment') ? `${name} (*${scale})` : name;
    };

    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    domains.forEach(dom => {
        let aArr = [], bArr = [], cArr = [], tArr = [];
        const statObj = state.edaStats.find(s => s.Domain === dom);
        
        if (isAlteration) {
            let cutFe = Infinity, cutAl = Infinity, cutSi = Infinity, cutMg = Infinity;
            if(statObj) {
                if(statObj[`${feCol}_TopCut98`]) cutFe = parseFloat(statObj[`${feCol}_TopCut98`]);
                if(statObj[`${alCol}_TopCut98`]) cutAl = parseFloat(statObj[`${alCol}_TopCut98`]);
                if(statObj[`${siCol}_TopCut98`]) cutSi = parseFloat(statObj[`${siCol}_TopCut98`]);
                if(statObj[`${mgCol}_TopCut98`]) cutMg = parseFloat(statObj[`${mgCol}_TopCut98`]);
            }
            state.compositedData.filter(d => d.Geo_Domain === dom).forEach((d) => {
                let vFe = parseFloat(d[feCol]), vAl = parseFloat(d[alCol]), vSi = parseFloat(d[siCol]), vMg = parseFloat(d[mgCol]);
                if(!isNaN(vSi) && !isNaN(vMg) && (!isNaN(vFe) || !isNaN(vAl))) {
                    vFe = isNaN(vFe) ? 0 : Math.min(vFe, cutFe) * scaleFe;
                    vAl = isNaN(vAl) ? 0 : Math.min(vAl, cutAl) * scaleAl;
                    let vB = Math.min(vSi, cutSi) * scaleSi, vC = Math.min(vMg, cutMg) * scaleMg, vA = vFe + vAl;
                    const sum = vA + vB + vC;
                    if(sum > 0) {
                        aArr.push((vA / sum) * 100); bArr.push((vB / sum) * 100); cArr.push((vC / sum) * 100);
                        tArr.push(`<b>${dom}</b><br>${labelA}: ${vA.toFixed(2)}%<br>${labelB}: ${vB.toFixed(2)}%<br>${labelC}: ${vC.toFixed(2)}%`);
                    }
                }
            });
        } else {
            let cutA = Infinity, cutB = Infinity, cutC = Infinity;
            if(statObj) {
                if(statObj[`${colA}_TopCut98`]) cutA = parseFloat(statObj[`${colA}_TopCut98`]);
                if(statObj[`${colB}_TopCut98`]) cutB = parseFloat(statObj[`${colB}_TopCut98`]);
                if(statObj[`${colC}_TopCut98`]) cutC = parseFloat(statObj[`${colC}_TopCut98`]);
            }
            state.compositedData.filter(d => d.Geo_Domain === dom).forEach((d) => {
                let vA = parseFloat(d[colA]), vB = parseFloat(d[colB]), vC = parseFloat(d[colC]);
                if(!isNaN(vA) && !isNaN(vB) && !isNaN(vC)) {
                    vA = Math.min(vA, cutA); vB = Math.min(vB, cutB); vC = Math.min(vC, cutC);
                    const sA = vA * scaleA, sB = vB * scaleB, sC = vC * scaleC;
                    const sum = sA + sB + sC;
                    if(sum > 0) {
                        aArr.push((sA / sum) * 100); bArr.push((sB / sum) * 100); cArr.push((sC / sum) * 100);
                        tArr.push(`<b>${dom}</b><br>${labelA}: ${vA.toFixed(2)}%<br>${labelB}: ${vB.toFixed(2)}%<br>${labelC}: ${vC.toFixed(2)}%`);
                    }
                }
            });
        }

        if(aArr.length > 0) {
            plotlyData.push({ type: 'scatterternary', mode: 'markers', name: dom, a: aArr, b: bArr, c: cArr, text: tArr, hoverinfo: 'text', marker: { color: getDomainColor(dom), size: 2.5, opacity: 0.5 } });
        }
    });

    let finalLabelA = isAlteration ? labelA : getLabelFormat(colA, scaleA);
    let finalLabelB = isAlteration ? labelB : getLabelFormat(colB, scaleB);
    let finalLabelC = isAlteration ? labelC : getLabelFormat(colC, scaleC);

    const layout = {
        ternary: { sum: 100,
            aaxis: { title: finalLabelA, titlefont: { size: 13, color: '#334155', family: 'Inter, sans-serif' }, tickfont: { size: 9, color: '#94a3b8' }, min: 0, linewidth: 1, ticks: 'outside', gridcolor: '#e2e8f0' },
            baxis: { title: finalLabelB, titlefont: { size: 13, color: '#334155', family: 'Inter, sans-serif' }, tickfont: { size: 9, color: '#94a3b8' }, min: 0, linewidth: 1, ticks: 'outside', gridcolor: '#e2e8f0' },
            caxis: { title: finalLabelC, titlefont: { size: 13, color: '#334155', family: 'Inter, sans-serif' }, tickfont: { size: 9, color: '#94a3b8' }, min: 0, linewidth: 1, ticks: 'outside', gridcolor: '#e2e8f0' }
        },
        margin: { l: 30, r: 30, b: 30, t: 30 }, autosize: true, showlegend: (preset === 'custom'), paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', hovermode: 'closest'
    };
    Plotly.newPlot(plotDiv, plotlyData, layout, { responsive: true, displayModeBar: false });
}

function renderContactAnalysis() {
    const el = document.getElementById('contact-element').value;
    const domA = document.getElementById('contact-dom-a').value;
    const domB = document.getElementById('contact-dom-b').value;
    const ctx = document.getElementById('eda-contact-chart');
    if(edaContactInst) edaContactInst.destroy();

    if(domA === domB) {
        edaContactInst = new Chart(ctx, { type:'line', data:{datasets:[]}, options:{plugins:{title:{display:true, text:'⚠️ Select 2 different domains', color:'#ef4444'}}, scales:{x:{display:false},y:{display:false}}} }); return;
    }

    const maxDist = 5, binSize = 0.5; let bins = {};
    for(let i=-maxDist; i<=maxDist; i+=binSize) bins[i.toFixed(1)] = {sum:0, count:0};
    const grouped = groupDataByHole(state.domainedData, state.coreCols.holeId, state.coreCols.from);

    grouped.forEach(hd => {
        for(let i=0; i<hd.length-1; i++) {
            let curr = hd[i], next = hd[i+1], valid = false, rev = false;
            if(curr.Geo_Domain===domA && next.Geo_Domain===domB) valid=true;
            else if(curr.Geo_Domain===domB && next.Geo_Domain===domA) { valid=true; rev=true; }

            if(valid) {
                const cZ = parseFloat(curr[state.coreCols.to]);
                hd.forEach(s => {
                    const f = parseFloat(s[state.coreCols.from]), t = parseFloat(s[state.coreCols.to]), v = parseFloat(s[el]);
                    if(!isNaN(f)&&!isNaN(t)&&!isNaN(v)){
                        let d = ((f+t)/2) - cZ; if(rev) d = -d;
                        if(d>=-maxDist && d<=maxDist) { const bK = (Math.round(d/binSize)*binSize).toFixed(1); if(bins[bK]){ bins[bK].sum+=v; bins[bK].count++; } }
                    }
                });
            }
        }
    });

    let pData = [], countData = []; 
    Object.keys(bins).sort((a,b)=>parseFloat(a)-parseFloat(b)).forEach(k => { 
        const b = bins[k]; 
        pData.push({x: parseFloat(k), y: b.count>0 ? b.sum/b.count : null}); 
        countData.push({x: parseFloat(k), y: b.count});
    });
    
    edaContactInst = new Chart(ctx, {
        type: 'bar', 
        data: { 
            datasets: [
                { label: `Avg ${el} Grade`, data: pData, type: 'line', borderColor: '#f97316', borderWidth: 3, pointRadius: 4, spanGaps: true, yAxisID: 'y' },
                { label: 'Sample Count', data: countData, type: 'bar', backgroundColor: 'rgba(148, 163, 184, 0.4)', barPercentage: 1, categoryPercentage: 1, yAxisID: 'y1' }
            ] 
        },
        options: { 
            responsive:true, maintainAspectRatio:false, 
            plugins:{legend:{position: 'top', labels:{boxWidth:10, font:{size:10, weight:'bold'}}}}, 
            scales:{ 
                x:{type:'linear', title:{display:true, text:`← Dist in ${domA} (m) | BOUNDARY | Dist in ${domB} (m) →`, font:{size:10, weight:'bold'}}, min:-maxDist, max:maxDist, ticks:{stepSize:1}, grid:{color:'#f1f5f9'}}, 
                y:{type: 'linear', position: 'left', title:{display:true, text:`Avg ${el} Grade`, font:{size:10, weight:'bold', color: '#f97316'}}, grid:{color:'#f8fafc'}},
                y1:{type: 'linear', position: 'right', title:{display:true, text:`Sample Count`, font:{size:10, weight:'bold', color: '#64748b'}}, grid:{drawOnChartArea: false}}
            } 
        },
        plugins: [{ id:'vline', afterDraw:(c)=>{ const xa=c.scales.x; if(xa.min<=0 && xa.max>=0){ const ct=c.ctx; ct.save(); ct.beginPath(); ct.moveTo(xa.getPixelForValue(0),c.scales.y.top); ct.lineTo(xa.getPixelForValue(0),c.scales.y.bottom); ct.lineWidth=2; ct.strokeStyle='#94a3b8'; ct.setLineDash([5,5]); ct.stroke(); ct.restore(); } } }]
    });
}

function renderSwathPlot() {
    const el = document.getElementById('swath-element').value, dom = document.getElementById('swath-domain').value;
    const ax = document.getElementById('swath-axis').value, bw = parseFloat(document.getElementById('swath-width').value)||50;
    if(edaSwathInst) edaSwathInst.destroy();
    if(!ax) return;

    let fData = state.compositedData.filter(d=>d.Geo_Domain===dom);
    let minC = Infinity, maxC = -Infinity;
    fData.forEach(d => { let v=parseFloat(d[ax]); if(!isNaN(v)){ if(v<minC) minC=v; if(v>maxC) maxC=v; } });
    if(minC===Infinity) return;

    minC = Math.floor(minC/bw)*bw; maxC = Math.ceil(maxC/bw)*bw;
    let bins = {}; for(let c=minC; c<=maxC; c+=bw) bins[c] = { sum:0, len:0, cnt:0 };
    fData.forEach(d => {
        let c=parseFloat(d[ax]), v=parseFloat(d[el]), l=parseFloat(d.Length||1);
        if(!isNaN(c)&&!isNaN(v)) { let bK = Math.floor(c/bw)*bw; if(bins[bK]){ bins[bK].sum+=(v*l); bins[bK].len+=l; bins[bK].cnt++; } }
    });

    let labels=[], gData=[], cData=[];
    Object.keys(bins).sort((a,b)=>parseFloat(a)-parseFloat(b)).forEach(k => {
        labels.push(parseFloat(k)+(bw/2)); const b=bins[k];
        if(b.cnt>0){ gData.push((b.sum/b.len).toFixed(3)); cData.push(b.cnt); } else { gData.push(null); cData.push(0); }
    });

    const elColor = getElColor(el, 1);
    edaSwathInst = new Chart(document.getElementById('eda-swath-chart'), {
        type: 'bar', data: { labels: labels, datasets: [
            { label: `Average ${el}`, data: gData, type: 'line', borderColor: elColor, borderWidth: 3, spanGaps:true, yAxisID:'y' },
            { label: 'Sample Count', data: cData, type: 'bar', backgroundColor: 'rgba(148, 163, 184, 0.3)', yAxisID:'y1', barPercentage:1, categoryPercentage:1 }
        ]},
        options: { responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false}, plugins:{legend:{position:'top', labels:{boxWidth:10, font:{size:10, weight:'bold'}}}}, scales:{ x:{title:{display:true, text:'Coordinate (m)', font:{size:10, weight:'bold'}}, grid:{display:false}}, y:{type:'linear', position:'left', title:{display:true, text:`${el} Grade (%)`, font:{size:10, weight:'bold', color:elColor}}, ticks:{color:elColor}}, y1:{type:'linear', position:'right', title:{display:true, text:'Sample Count', font:{size:10, weight:'bold', color:'#64748b'}}, grid:{drawOnChartArea:false}, ticks:{color:'#64748b'}} } }
    });
}

function downloadEDAStatistics() {
    if (!state.edaStats || state.edaStats.length === 0) { 
        showToast("No statistics available. Please run analysis first.", "warning"); 
        return; 
    }

    showToast("Generating Full Univariate Report...", "info");

    const allowedAssays = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const elements = state.headers.filter(h => allowedAssays.includes(h));
    
    let excelData = [[
        'Domain', 'Element', 'Sample_Count', 'Min', 'Max', 'Q1', 'Median', 'Q3', 
        'Raw_Mean', 'Declus_Mean', 'Variance', 'Std_Dev', 'Coeff_Var', 'Skewness', 'Kurtosis', 'TopCut_98th'
    ]];

    state.edaStats.forEach(stat => {
        elements.forEach(el => {
            if (stat[`${el}_Mean`] !== undefined) {
                excelData.push([
                    stat.Domain, el, stat.Count, stat[`${el}_Min`], stat[`${el}_Max`], stat[`${el}_Q1`], stat[`${el}_Median`], stat[`${el}_Q3`], 
                    stat[`${el}_Mean`], stat[`${el}_DeclusMean`], stat[`${el}_Var`], stat[`${el}_StdDev`], stat[`${el}_CV`], stat[`${el}_Skew`], stat[`${el}_Kurt`], stat[`${el}_TopCut98`]
                ]);
            }
        });
    });

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        ws['!cols'] = [ {wch: 10}, {wch: 10}, {wch: 12}, {wch: 8}, {wch: 8}, {wch: 8}, {wch: 8}, {wch: 8}, {wch: 10}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 12} ];
        XLSX.utils.book_append_sheet(wb, ws, "Full_Univariate_Stats");
        XLSX.writeFile(wb, `NiCore_Full_EDA_Statistics.xlsx`);
        showToast("Full Statistics Report downloaded successfully.", "success");
    } catch (err) { console.error(err); showToast("Failed to generate Excel file.", "error"); }
}

function renderFinalDistribution() {
    const el = document.getElementById('univariate-element-select').value;
    if (!el || !state.compositedData || state.compositedData.length === 0) return;

    const histWrapper = document.getElementById('hist-wrapper-container');
    const boxContainer = document.getElementById('eda-final-box-container');
    if (!histWrapper || !boxContainer) return;

    const viewMode = document.getElementById('hist-view-mode') ? document.getElementById('hist-view-mode').value : 'overlay';

    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    const domainOrder = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK'];
    domains.sort((a, b) => {
        let idxA = domainOrder.indexOf(a); let idxB = domainOrder.indexOf(b);
        if(idxA === -1) idxA = 99; if(idxB === -1) idxB = 99;
        return idxA - idxB;
    });

    let allCappedVals = [];
    let domainDataMap = {};

    domains.forEach(dom => {
        const statObj = state.edaStats.find(s => s.Domain === dom);
        const topCut = statObj && statObj[`${el}_TopCut98`] ? parseFloat(statObj[`${el}_TopCut98`]) : Infinity;

        let vals = state.compositedData
            .filter(d => d.Geo_Domain === dom && d[el] !== '' && !isNaN(parseFloat(d[el])))
            .map(d => { let v = parseFloat(d[el]); return v > topCut ? topCut : v; });

        if (vals.length > 0) {
            domainDataMap[dom] = vals;
            allCappedVals.push(...vals);
        }
    });

    if (allCappedVals.length === 0) return;

    const minVal = Math.floor(Math.min(...allCappedVals));
    const maxVal = Math.ceil(Math.max(...allCappedVals));
    
    const hexToRgbA = (hex, alpha) => {
        if (!hex || hex.startsWith('rgba')) return hex;
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    histWrapper.innerHTML = '';
    boxContainer.innerHTML = '';

    if (viewMode === 'overlay') {
        const step = (maxVal - minVal) / 40;
        let histData = [];
        let boxData = [];

        domains.forEach(dom => {
            if (!domainDataMap[dom]) return;
            const vals = domainDataMap[dom];
            const colorHex = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';

            histData.push({
                x: vals, type: 'histogram', name: dom, opacity: 0.65,
                marker: { color: colorHex, line: { color: colorHex, width: 1.5 } },
                xbins: { start: minVal, end: maxVal, size: step }
            });

            boxData.push({
                x: vals, y: Array(vals.length).fill(dom), type: 'box', orientation: 'h', name: dom,
                marker: { color: colorHex, size: 3, opacity: 0.6 }, line: { width: 1.5 }, boxpoints: 'outliers'
            });
        });

        const histDiv = document.createElement('div'); histDiv.className = 'w-full h-full absolute inset-0'; histWrapper.appendChild(histDiv);
        const boxDiv = document.createElement('div'); boxDiv.className = 'w-full h-full absolute inset-0'; boxContainer.appendChild(boxDiv);

        const commonMargin = { l: 80, r: 25 }; 
        const commonXAxis = { range: [minVal, maxVal + (step * 2)], gridcolor: '#e2e8f0', zeroline: false, tickfont: { size: 10, color: '#64748b', weight: 'bold' } };

        const histLayout = {
            barmode: 'overlay', margin: { ...commonMargin, b: 20, t: 30 },
            xaxis: { ...commonXAxis, showticklabels: true }, 
            yaxis: { title: 'Frequency', titlefont: { size: 10, color: '#64748b' }, gridcolor: '#f1f5f9' },
            showlegend: true, legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: {size: 10, weight: 'bold'} },
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)'
        };

        const boxLayout = {
            margin: { ...commonMargin, b: 30, t: 5 }, xaxis: { ...commonXAxis, title: `${el} Grade (Capped)`, titlefont: { size: 10, color: '#64748b', weight: 'bold' } },
            yaxis: { autorange: 'reversed', tickfont: { size: 10, weight: 'bold' } }, showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)'
        };

        Plotly.newPlot(histDiv, histData, histLayout, { responsive: true, displayModeBar: false });
        Plotly.newPlot(boxDiv, boxData, boxLayout, { responsive: true, displayModeBar: false });

    } else {
        const binCount = viewMode === 'stepped' ? 30 : 20; 
        const step = (maxVal - minVal) / binCount;
        
        let labels = [];
        for (let i = 0; i <= binCount; i++) labels.push((minVal + (i * step)).toFixed(2));

        let histDatasets = [];
        let boxData = [];

        domains.forEach(dom => {
            if (!domainDataMap[dom]) return;
            const vals = domainDataMap[dom];
            const colorHex = typeof getDomainColor === 'function' ? getDomainColor(dom) : '#94a3b8';

            let bins = Array(binCount).fill(0);
            vals.forEach(v => {
                let idx = Math.floor((v - minVal) / step);
                if (idx >= binCount) idx = binCount - 1;
                if (idx < 0) idx = 0;
                bins[idx]++;
            });

            if (viewMode === 'stepped') {
                histDatasets.push({
                    label: dom, data: bins, backgroundColor: hexToRgbA(colorHex, 0.5), borderColor: colorHex, borderWidth: 1.5,
                    type: 'bar', barPercentage: 1.0, categoryPercentage: 1.0, hoverBackgroundColor: hexToRgbA(colorHex, 0.8) 
                });
            } else {
                histDatasets.push({
                    label: dom, data: bins, backgroundColor: hexToRgbA(colorHex, 0.4), borderColor: colorHex, borderWidth: 2,
                    fill: true, tension: 0.4, type: 'line'
                });
            }

            boxData.push({ x: vals, y: Array(vals.length).fill(dom), type: 'box', orientation: 'h', name: dom, marker: { color: colorHex, size: 3, opacity: 0.6 }, line: { width: 1.5 }, boxpoints: 'outliers' });
        });

        const canvas = document.createElement('canvas');
        canvas.id = 'eda-final-hist-chart';
        histWrapper.appendChild(canvas);

        if (edaFinalHistInst) edaFinalHistInst.destroy();
        edaFinalHistInst = new Chart(canvas, {
            type: viewMode === 'stepped' ? 'bar' : 'line',
            data: { labels: labels, datasets: histDatasets },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10, weight: 'bold' }, usePointStyle: true } } },
                scales: { 
                    x: { display: viewMode === 'stepped', ticks: { font: { size: 9, weight: 'bold' }, color: '#64748b', maxTicksLimit: 10 }, grid: { display: false } }, 
                    y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 9 } } } 
                }
            }
        });

        const boxDiv = document.createElement('div'); boxDiv.className = 'w-full h-full absolute inset-0'; boxContainer.appendChild(boxDiv);
        const boxLayout = { 
            margin: { l: 80, r: 20, b: 30, t: 10 }, xaxis: { title: `${el} Grade (Capped)`, titlefont: { size: 10, color: '#64748b' } }, 
            showlegend: false, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', yaxis: { autorange: 'reversed' } 
        };
        
        if (viewMode === 'stepped') {
            boxLayout.margin = { l: 80, r: 25, b: 30, t: 5 };
            boxLayout.xaxis.range = [minVal, maxVal + (step * 2)];
        }
        
        Plotly.newPlot(boxDiv, boxData, boxLayout, { responsive: true, displayModeBar: false });
    }
}