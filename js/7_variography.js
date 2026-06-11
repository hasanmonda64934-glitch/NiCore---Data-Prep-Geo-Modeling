// ============================================================================
// 7_VARIOGRAPHY.JS - ADVANCED SNOWDEN ARCHITECTURE ENGINE
// Multi-Directional Variogram, 2D Contour Fan Map, and KNA Validation
// ============================================================================

let edaVarioInst = null;
let krigingScene = null, krigingCamera = null, krigingRenderer = null, krigingMesh = null, krigingAnimationId = null;
let knaScatterInst = null, knaSwathInst = null;

// Global Memory for Smart Auto-Detect & KNA
window.lastVarioMapGrid = null;
window.lastVarioMaxLags = null;
window.lastVarioGlobalVar = null;
window.knaResults = null;

// ============================================================================
// 1. ENGINE INITIALIZATION & TAB ROUTING
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const originalSwitchSubTab = window.switchSubTab;
    window.switchSubTab = function(tabId) {
        if (originalSwitchSubTab) originalSwitchSubTab(tabId);
        
        if (tabId === 'variography') {
            setTimeout(() => {
                initVariographyUI();
                window.switchVarioSubTab('map'); // Default buka tab Map
                renderVariogram();
            }, 150);
        } else {
            if (typeof disposeKrigingEllipsoid === 'function') disposeKrigingEllipsoid();
        }
    };
});

window.switchVarioSubTab = function(subTab) {
    ['vsub-map', 'vsub-model', 'vsub-validation'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(id).classList.remove('grid');
    });

    ['btn-vsub-map', 'btn-vsub-model', 'btn-vsub-validation'].forEach(id => {
        document.getElementById(id).className = "px-5 py-2.5 text-xs font-black uppercase tracking-widest border-b-[3px] border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-t-lg transition-colors";
    });

    ['ctrl-vsub-map', 'ctrl-vsub-model', 'ctrl-vsub-validation'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(id).classList.remove('flex');
    });

    const activeBtnClass = "px-5 py-2.5 text-xs font-black uppercase tracking-widest border-b-[3px] border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg transition-colors";
    
    document.getElementById(`vsub-${subTab}`).classList.remove('hidden');
    document.getElementById(`btn-vsub-${subTab}`).className = activeBtnClass;
    document.getElementById(`ctrl-vsub-${subTab}`).classList.remove('hidden');
    document.getElementById(`ctrl-vsub-${subTab}`).classList.add('flex');

    if (subTab === 'model') {
        document.getElementById('vsub-model').classList.add('grid');
    }

    // PERBAIKAN 1: Robust Resize untuk Plotly & Three.js
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (typeof Plotly !== 'undefined') {
            try { Plotly.Plots.resize(document.getElementById('variogram-map-plot')); } catch(e){}
            try { Plotly.Plots.resize(document.getElementById('kna-scatter-plot')); } catch(e){}
        }
        if (edaVarioInst) edaVarioInst.resize();
        if (knaSwathInst) knaSwathInst.resize();
        
        if (subTab === 'model') {
            const container = document.getElementById('kriging-ellipsoid-3d');
            if (container && container.clientWidth > 0) { // Pastikan container sudah punya ukuran
                if (!krigingRenderer) {
                    initKrigingEllipsoid(); 
                } else {
                    krigingCamera.aspect = container.clientWidth / container.clientHeight;
                    krigingCamera.updateProjectionMatrix();
                    krigingRenderer.setSize(container.clientWidth, container.clientHeight);
                }
            } else {
                // Retry if container is still rendering
                setTimeout(() => {
                    if (container && container.clientWidth > 0 && krigingRenderer) {
                        krigingCamera.aspect = container.clientWidth / container.clientHeight;
                        krigingCamera.updateProjectionMatrix();
                        krigingRenderer.setSize(container.clientWidth, container.clientHeight);
                    } else if (container && container.clientWidth > 0 && !krigingRenderer) {
                        initKrigingEllipsoid();
                    }
                }, 200);
            }
        }
    }, 100);
}

function initVariographyUI() {
    if (!state.compositedData || state.compositedData.length === 0) return;

    const domains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    const allowedAssays = ['ni', 'fe', 'mgo', 'sio2', 'co', 'al2o3', 'mno', 'cr2o3', 'fe2o3'];
    let elements = state.headers.filter(h => allowedAssays.includes(String(h).toLowerCase().trim()));

    if (elements.length === 0) {
        state.headers.forEach(h => {
            const hl = String(h).toLowerCase().trim();
            if (hl.length <= 5 && !['from', 'to', 'x', 'y', 'z', 'dip', 'hole'].some(k => hl.includes(k))) {
                elements.push(h);
            }
        });
    }

    const fillDropdown = (id, arr, def) => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentSelection = el.value;
        el.innerHTML = arr.map(a => `<option value="${a}" class="bg-slate-800 text-white font-bold">${a}</option>`).join('');
        if (arr.includes(currentSelection)) el.value = currentSelection;
        else if (arr.length > 0) el.value = arr[0];
    };

    fillDropdown('vario-element', elements, elements[0]);
    fillDropdown('vario-domain', domains, domains[0]);
}

// ============================================================================
// 2. DIRECTIONAL VARIOGRAM & 360° FAN SWEEP (WEB WORKER)
// ============================================================================
function renderVariogram() {
    const el = document.getElementById('vario-element')?.value;
    const dom = document.getElementById('vario-domain')?.value;
    if (!el || !dom || !state.compositedData || state.compositedData.length === 0) return;

    const dData = state.compositedData.filter(d => d.Geo_Domain === dom);
    if (edaVarioInst) edaVarioInst.destroy();
    if (dData.length === 0) {
        if(typeof showToast === 'function') showToast(`No composited data found for domain ${dom}.`, "warning");
        return;
    }
    
    const stat = state.edaStats ? (state.edaStats.find(s => s.Domain === dom) || {}) : {};
    
    if (stat[`${el}_Azimuth`] !== undefined) {
        const savedAzi = parseFloat(stat[`${el}_Azimuth`]);
        if(document.getElementById('fan-azimuth')) document.getElementById('fan-azimuth').value = savedAzi;
        if(document.getElementById('fan-azimuth-val')) document.getElementById('fan-azimuth-val').value = savedAzi;
        if(document.getElementById('vario-azimuth')) document.getElementById('vario-azimuth').value = savedAzi;
        if(document.getElementById('vario-azimuth-val')) document.getElementById('vario-azimuth-val').value = savedAzi;
    }

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

    const holeCol = state.coreCols?.holeId || 'Hole_ID';
    const flatData = dData.map(d => {
        const holeId = d[holeCol] || d.Hole_ID || d.id;
        const rawCollar = state.rawData ? (state.rawData.find(r => r[holeCol] === holeId) || {}) : {};
        
        const fromVal = parseFloat(d[state.coreCols?.from] || d.From || d.from || 0);
        const toVal = parseFloat(d[state.coreCols?.to] || d.To || d.to || 0);
        const midDepth = isNaN(fromVal) || isNaN(toVal) ? 0 : (fromVal + toVal) / 2;

        const xVal = parseFloat(d[state.detectedCoords?.x] || d.X || d.Easting || rawCollar[state.detectedCoords?.x] || rawCollar.X || rawCollar.Easting || 0);
        const yVal = parseFloat(d[state.detectedCoords?.y] || d.Y || d.Northing || rawCollar[state.detectedCoords?.y] || rawCollar.Y || rawCollar.Northing || 0);
        const collarZ = parseFloat(d[state.detectedCoords?.z] || d.Z || d.Elevation || rawCollar[state.detectedCoords?.z] || rawCollar.Z || rawCollar.Elevation || 0);
        
        let val = parseFloat(d[el]);
        if (isNaN(val)) val = parseFloat(d[String(el).toLowerCase()]);
        if (isNaN(val)) val = parseFloat(d[String(el).toUpperCase()]);

        // TERAPKAN TOP-CUT SEBELUM MASUK KE ENGINE VARIOGRAM
        val = applyTopCut(val, el, dom);

        return { val: val, x: xVal, y: yVal, z: collarZ - midDepth, id: holeId };
    }).filter(d => !isNaN(d.val) && !isNaN(d.x) && !isNaN(d.y) && !isNaN(d.z));

    if (flatData.length === 0) {
        if(typeof showToast === 'function') showToast("Coordinate extraction failed. Check your data.", "error");
        return;
    }

    const vals = flatData.map(d => d.val);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    const vVar = variance > 0 ? variance : 0.1;

    const hLagDist = parseFloat(document.getElementById('vario-hop-lag')?.value) || 25.0;
    const hLagTol = parseFloat(document.getElementById('vario-hop-tol')?.value) || 12.5;
    const hMaxLags = parseInt(document.getElementById('vario-hop-count')?.value) || 6;
    const hAziTol = parseFloat(document.getElementById('vario-cone-tol')?.value) || 22.5;
    const hBandwidth = parseFloat(document.getElementById('vario-bandwidth')?.value) || 50.0;
    
    const vLagDist = parseFloat(document.getElementById('vario-vert-lag')?.value) || 1.0;
    const vLagTol = parseFloat(document.getElementById('vario-vert-tol')?.value) || 0.5;
    const targetAzimuth = parseFloat(document.getElementById('vario-azimuth-val')?.value) || 0;

    const canvasContainer = document.getElementById('eda-variogram-chart');
    if (canvasContainer) {
        const ctx = canvasContainer.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "bold 12px Inter, sans-serif"; ctx.fillStyle = "#8b5cf6"; ctx.textAlign = "center";
        ctx.fillText(`⚙️ Geostat Engine: Processing 360° Omnidirectional Fan Sweep...`, ctx.canvas.width / 2, ctx.canvas.height / 2);
    }

    const workerCode = `
        self.onmessage = function(e) {
            const { points, hLagDist, hLagTol, hMaxLags, hAziTol, hBandwidth, vLagDist, vLagTol, targetAzi } = e.data;
            
            let bMaj = {}, bMin = {}, bVer = {};
            for(let i=1; i<=hMaxLags; i++) { bMaj[i] = {sq:0, cnt:0}; bMin[i] = {sq:0, cnt:0}; }
            for(let i=1; i<=50; i++) bVer[i] = {sq:0, cnt:0};

            let varioMapGrid = {};
            for (let a = 0; a < 360; a += 15) {
                varioMapGrid[a] = {};
                for (let l = 1; l <= hMaxLags; l++) { varioMapGrid[a][l] = { sq: 0, cnt: 0 }; }
            }

            const minorAzi = (targetAzi + 90) % 360;
            const normAng = (a) => { let ang = a % 360; if(ang < 0) ang += 360; return ang >= 180 ? ang - 180 : ang; };
            const tAzi = normAng(targetAzi); const mAzi = normAng(minorAzi);

            const n = points.length;
            for(let i=0; i<n; i++) {
                let p1 = points[i];
                for(let j=i+1; j<n; j++) {
                    let p2 = points[j];
                    let dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
                    
                    let horizDist = Math.sqrt(dx*dx + dy*dy);
                    let sqDiff = Math.pow(p1.val - p2.val, 2);

                    if (Math.abs(dz) > horizDist * 3.73) { 
                        let vIdx = Math.round(Math.abs(dz) / vLagDist);
                        let vDev = Math.abs(Math.abs(dz) - (vIdx * vLagDist));
                        if (vIdx > 0 && vIdx <= 50 && vDev <= vLagTol) {
                            bVer[vIdx].sq += sqDiff; bVer[vIdx].cnt++;
                        }
                    } else {
                        let pairAzi = (Math.atan2(dx, dy) * 180 / Math.PI); 
                        let nPairAzi = normAng(pairAzi); 
                        
                        let dMaj = Math.abs(nPairAzi - tAzi); if (dMaj > 90) dMaj = 180 - dMaj;
                        if (dMaj <= hAziTol && (horizDist * Math.sin(dMaj * Math.PI / 180) <= hBandwidth)) {
                            let lIdx = Math.round(horizDist / hLagDist);
                            if (lIdx > 0 && lIdx <= hMaxLags && Math.abs(horizDist - (lIdx * hLagDist)) <= hLagTol) {
                                bMaj[lIdx].sq += sqDiff; bMaj[lIdx].cnt++;
                            }
                        }
                        let dMin = Math.abs(nPairAzi - mAzi); if (dMin > 90) dMin = 180 - dMin;
                        if (dMin <= hAziTol && (horizDist * Math.sin(dMin * Math.PI / 180) <= hBandwidth)) {
                            let lIdx = Math.round(horizDist / hLagDist);
                            if (lIdx > 0 && lIdx <= hMaxLags && Math.abs(horizDist - (lIdx * hLagDist)) <= hLagTol) {
                                bMin[lIdx].sq += sqDiff; bMin[lIdx].cnt++;
                            }
                        }

                        let fullPairAzi = pairAzi < 0 ? pairAzi + 360 : pairAzi;
                        for (let angleBox = 0; angleBox < 360; angleBox += 15) {
                            let angDiff = Math.abs(fullPairAzi - angleBox);
                            if (angDiff > 180) angDiff = 360 - angDiff;
                            if (angDiff <= 15) { 
                                let lIdx = Math.round(horizDist / hLagDist);
                                if (lIdx > 0 && lIdx <= hMaxLags && Math.abs(horizDist - (lIdx * hLagDist)) <= hLagTol) {
                                    varioMapGrid[angleBox][lIdx].sq += sqDiff;
                                    varioMapGrid[angleBox][lIdx].cnt++;
                                }
                            }
                        }
                    }
                }
            }
            self.postMessage({ bMaj, bMin, bVer, varioMapGrid });
        };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.postMessage({ points: flatData, hLagDist, hLagTol, hMaxLags, hAziTol, hBandwidth, vLagDist, vLagTol, targetAzi: targetAzimuth });

    worker.onmessage = function(e) {
        const { bMaj, bMin, bVer, varioMapGrid } = e.data;
        
        window.lastVarioMapGrid = varioMapGrid;
        window.lastVarioMaxLags = hMaxLags;
        window.lastVarioGlobalVar = vVar;

        let dMaj = [], dMin = [], dVer = [], totalPairs = 0;

        for (let i = 1; i <= hMaxLags; i++) {
            if (bMaj[i].cnt > 0) { dMaj.push({ x: i * hLagDist, y: bMaj[i].sq / (2 * bMaj[i].cnt), cnt: bMaj[i].cnt }); totalPairs += bMaj[i].cnt; }
            if (bMin[i].cnt > 0) { dMin.push({ x: i * hLagDist, y: bMin[i].sq / (2 * bMin[i].cnt), cnt: bMin[i].cnt }); totalPairs += bMin[i].cnt; }
        }
        for (let i = 1; i <= 50; i++) {
            if (bVer[i].cnt > 0) { dVer.push({ x: i * vLagDist, y: bVer[i].sq / (2 * bVer[i].cnt), cnt: bVer[i].cnt }); }
        }

        let smartSill = vVar, smartNugget = 0, smartRange = hMaxLags * hLagDist * 0.5;
        if (dVer.length > 0) { dVer.sort((a, b) => a.x - b.x); smartNugget = dVer[0].y * 0.75; }
        let dHorizontal = dMaj.length > 0 ? dMaj : (dMin.length > 0 ? dMin : dVer);
        if (dHorizontal.length > 0) {
            dHorizontal.sort((a, b) => a.x - b.x);
            smartRange = dHorizontal[dHorizontal.length - 1].x * 0.5;
            for (let pt of dHorizontal) { if (pt.y >= vVar * 0.85) { smartRange = pt.x; break; } }
        }

        const stat = state.edaStats ? (state.edaStats.find(s => s.Domain === dom) || {}) : {};
        let cN = stat[`${el}_Nugget`] !== undefined ? parseFloat(stat[`${el}_Nugget`]) : smartNugget;
        let cS = stat[`${el}_Sill`] !== undefined ? parseFloat(stat[`${el}_Sill`]) : smartSill;
        let cR = stat[`${el}_Range`] !== undefined ? parseFloat(stat[`${el}_Range`]) : smartRange;

        if(document.getElementById('vario-nugget')) document.getElementById('vario-nugget').value = cN.toFixed(2);
        if(document.getElementById('vario-nugget-val')) document.getElementById('vario-nugget-val').value = cN.toFixed(2);
        if(document.getElementById('vario-sill')) document.getElementById('vario-sill').value = cS.toFixed(2);
        if(document.getElementById('vario-sill-val')) document.getElementById('vario-sill-val').value = cS.toFixed(2);
        if(document.getElementById('vario-range')) { document.getElementById('vario-range').max = hMaxLags * hLagDist; document.getElementById('vario-range').value = cR.toFixed(1); }
        if(document.getElementById('vario-range-val')) document.getElementById('vario-range-val').value = cR.toFixed(1);

        if (canvasContainer) {
            edaVarioInst = new Chart(canvasContainer, {
                type: 'scatter',
                data: {
                    datasets: [
                        { label: 'Major (Along Strike)', data: dMaj, backgroundColor: '#ef4444', pointStyle: 'rect', pointRadius: 5 },
                        { label: 'Minor (Cross Strike)', data: dMin, backgroundColor: '#3b82f6', pointStyle: 'triangle', pointRadius: 5 },
                        { label: 'Vertical (Downhole)', data: dVer, backgroundColor: '#10b981', pointStyle: 'circle', pointRadius: 4 },
                        { label: 'Theoretical Model', data: [], type: 'line', borderColor: '#d946ef', borderWidth: 3, pointRadius: 0, fill: false },
                        { label: 'Variance Global', data: [{ x: 0, y: vVar }, { x: hMaxLags * hLagDist, y: vVar }], type: 'line', borderColor: '#94a3b8', borderDash: [5, 5], pointRadius: 0, borderWidth: 1 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 9, weight: 'bold' } } } },
                    scales: { x: { min: 0, max: hMaxLags * hLagDist, grid: { color: '#f8fafc' } }, y: { min: 0, grid: { color: '#f8fafc' } } }
                }
            });
        }

        updateVarioCurve();
        renderContourVarioMap(varioMapGrid, hMaxLags, hLagDist, targetAzimuth, vVar);
        runDiagnostics(cN, cS, totalPairs, dom);
        
        worker.terminate();
    };
}

// ============================================================================
// FUNGSI 1: PETA KONTUR FAN MAP (VISUALISASI)
// ============================================================================
function renderContourVarioMap(gridData, maxLags, lagDist, currentAzimuth, globalVariance) {
    const mapContainer = document.getElementById('variogram-map-plot');
    if (!mapContainer || typeof Plotly === 'undefined') return;

    Plotly.purge(mapContainer);

    const safeVar = (isNaN(globalVariance) || globalVariance <= 0) ? 1.0 : globalVariance;
    const maxRadius = maxLags * lagDist;

    let polarVals = {};
    for (let a = 0; a < 360; a += 15) {
        polarVals[a] = {};
        let mA = (a + 180) % 360;
        for (let l = 1; l <= maxLags; l++) {
            let bin = gridData[a]?.[l] || {sq:0, cnt:0};
            let mBin = gridData[mA]?.[l] || {sq:0, cnt:0};
            let totalSq = bin.sq + mBin.sq;
            let totalCnt = bin.cnt + mBin.cnt;
            polarVals[a][l] = totalCnt > 0 ? (totalSq / (2 * totalCnt)) : null;
        }
    }

    for (let a = 0; a < 360; a += 15) {
        for (let l = 1; l <= maxLags; l++) {
            if (polarVals[a][l] === null) {
                let prev = null, next = null;
                for (let step = 1; step <= maxLags; step++) {
                    if (prev === null && l - step > 0 && polarVals[a][l - step] !== null) prev = polarVals[a][l - step];
                    if (next === null && l + step <= maxLags && polarVals[a][l + step] !== null) next = polarVals[a][l + step];
                }
                polarVals[a][l] = (prev !== null && next !== null) ? (prev + next) / 2 : 
                                  (prev !== null ? prev + (safeVar * 0.05) : safeVar);
            }
        }
    }

    const resolution = 100;
    const step = (maxRadius * 2) / (resolution - 1);
    let xArr = [], yArr = [], zMatrix = [];
    
    for(let i=0; i<resolution; i++) yArr.push(maxRadius - i * step);
    for(let j=0; j<resolution; j++) xArr.push(-maxRadius + j * step);
    
    for (let i = 0; i < resolution; i++) {
        let row = [];
        let y = yArr[i];
        for (let j = 0; j < resolution; j++) {
            let x = xArr[j];
            let r = Math.sqrt(x*x + y*y);
            
            if (r > maxRadius) {
                row.push(null); 
            } else {
                let azi = Math.atan2(x, y) * 180 / Math.PI; 
                if (azi < 0) azi += 360;
                
                let lIdx = Math.max(1, Math.min(maxLags, Math.round(r / lagDist)));
                let aIdx = Math.round(azi / 15) * 15;
                if (aIdx === 360) aIdx = 0;
                
                row.push(polarVals[aIdx][lIdx]);
            }
        }
        zMatrix.push(row);
    }

    const contourTrace = {
        type: 'contour',
        x: xArr, y: yArr, z: zMatrix,
        colorscale: [
            ['0.0', '#00008b'], ['0.2', '#0000ff'], ['0.4', '#00ffff'], 
            ['0.6', '#ffff00'], ['0.8', '#ff0000'], ['1.0', '#8b0000']
        ],
        contours: { coloring: 'heatmap', showlines: false },
        connectgaps: false,
        zmin: 0, zmax: safeVar * 1.5,
        colorbar: { thickness: 15, len: 0.8, title: { text: 'Variance γ(h)', font: { size: 10, weight: 'bold' } }, tickfont: { size: 9, weight: 'bold' } },
        hoverinfo: 'none'
    };

    const radMaj = currentAzimuth * Math.PI / 180;
    const xMaj = maxRadius * Math.sin(radMaj);
    const yMaj = maxRadius * Math.cos(radMaj);
    
    const majorOutline = { x: [-xMaj, xMaj], y: [-yMaj, yMaj], mode: 'lines', line: { color: '#ffffff', width: 6 }, hoverinfo: 'skip' };
    const majorLine = { x: [-xMaj, xMaj], y: [-yMaj, yMaj], mode: 'lines', line: { color: '#ef4444', width: 3 }, hoverinfo: 'skip' };

    const radMin = (currentAzimuth + 90) * Math.PI / 180;
    const xMin = maxRadius * Math.sin(radMin);
    const yMin = maxRadius * Math.cos(radMin);
    
    const minorOutline = { x: [-xMin, xMin], y: [-yMin, yMin], mode: 'lines', line: { color: '#ffffff', width: 5 }, hoverinfo: 'skip' };
    const minorLine = { x: [-xMin, xMin], y: [-yMin, yMin], mode: 'lines', line: { color: '#3b82f6', width: 2, dash: 'dash' }, hoverinfo: 'skip' };

    let circleShapes = [];
    for (let l = 1; l <= maxLags; l++) {
        let r = l * lagDist;
        circleShapes.push({ type: 'circle', xref: 'x', yref: 'y', x0: -r, y0: -r, x1: r, y1: r, line: { color: 'rgba(255,255,255,0.3)', width: 1 } });
    }
    circleShapes.push({ type: 'line', x0: -maxRadius, y0: 0, x1: maxRadius, y1: 0, line: { color: 'rgba(255,255,255,0.4)', width: 1 }});
    circleShapes.push({ type: 'line', x0: 0, y0: -maxRadius, x1: 0, y1: maxRadius, line: { color: 'rgba(255,255,255,0.4)', width: 1 }});

    const layout = {
        margin: { l: 40, r: 40, b: 40, t: 40 },
        xaxis: { title: 'Easting Offset (m)', zeroline: false, showgrid: false, range: [-maxRadius*1.1, maxRadius*1.1] },
        yaxis: { title: 'Northing Offset (m)', zeroline: false, showgrid: false, scaleanchor: 'x', scaleratio: 1, range: [-maxRadius*1.1, maxRadius*1.1] },
        shapes: circleShapes,
        showlegend: false,
        plot_bgcolor: '#f8fafc',
        paper_bgcolor: 'rgba(0,0,0,0)',
        annotations: [
            { x: 0, y: maxRadius * 1.05, text: 'N', showarrow: false, font: {weight: 'bold', size: 12} },
            { x: maxRadius * 1.05, y: 0, text: 'E', showarrow: false, font: {weight: 'bold', size: 12} },
            { x: 0, y: -maxRadius * 1.05, text: 'S', showarrow: false, font: {weight: 'bold', size: 12} },
            { x: -maxRadius * 1.05, y: 0, text: 'W', showarrow: false, font: {weight: 'bold', size: 12} }
        ]
    };

    Plotly.newPlot(mapContainer, [contourTrace, majorOutline, majorLine, minorOutline, minorLine], layout, { responsive: true, displayModeBar: false });
}

// ============================================================================
// FUNGSI 2: THE PERFECT CORE CONTINUITY AUTO-DETECT
// Fokus HANYA pada inti lembah terdalam, mengabaikan Edge Noise.
// ============================================================================
function autoFitOrientation() {
    if (!window.lastVarioMapGrid) {
        if(typeof showToast === 'function') showToast("Please wait for Fan Map to finish rendering first.", "warning");
        return;
    }

    const grid = window.lastVarioMapGrid;
    const maxLags = window.lastVarioMaxLags || 6;
    const globalVar = window.lastVarioGlobalVar || 1.0;

    let raw = {};
    for (let a = 0; a < 180; a += 15) {
        raw[a] = [];
        let mirror = a + 180;
        
        for (let l = 1; l <= maxLags; l++) {
            let bin = grid[a]?.[l] || {sq:0, cnt:0};
            let mBin = grid[mirror]?.[l] || {sq:0, cnt:0};
            let totSq = bin.sq + mBin.sq;
            let totCnt = bin.cnt + mBin.cnt;
            
            raw[a][l] = totCnt > 0 ? (totSq / (2 * totCnt)) : null;
        }
    }

    // FASE 1: RADIAL GAP FILLING 
    let filled = {};
    for (let a = 0; a < 180; a += 15) {
        filled[a] = [];
        for (let l = 1; l <= maxLags; l++) {
            if (raw[a][l] !== null) {
                filled[a][l] = raw[a][l];
            } else {
                let prev = null, next = null;
                for (let step = 1; step <= maxLags; step++) {
                    if (prev === null && l - step > 0 && raw[a][l - step] !== null) prev = raw[a][l - step];
                    if (next === null && l + step <= maxLags && raw[a][l + step] !== null) next = raw[a][l + step];
                }
                
                if (prev !== null && next !== null) {
                    filled[a][l] = (prev + next) / 2; 
                } else if (prev !== null) {
                    filled[a][l] = prev + (globalVar * 0.05); 
                } else if (next !== null) {
                    filled[a][l] = next * 0.8; 
                } else {
                    filled[a][l] = globalVar; 
                }
            }
        }
    }

    // FASE 2: ANGULAR SMOOTHING
    let smoothed = {};
    for (let a = 0; a < 180; a += 15) {
        smoothed[a] = [];
        let prevA = (a === 0) ? 165 : a - 15;
        let nextA = (a === 165) ? 0 : a + 15;

        for (let l = 1; l <= maxLags; l++) {
            smoothed[a][l] = (0.25 * filled[prevA][l]) + (0.50 * filled[a][l]) + (0.25 * filled[nextA][l]);
        }
    }

    // FASE 3: CORE CONTINUITY SCORING (SOLUSI FINAL)
    let bestAzimuth = -1; 
    let minScore = Infinity;
    let maxScore = -Infinity;

    let coreLags = Math.max(2, Math.ceil(maxLags * 0.5)); 

    for (let a = 0; a < 180; a += 15) {
        let score = 0;
        for (let l = 1; l <= coreLags; l++) {
            score += smoothed[a][l];
        }

        if (score < minScore) {
            minScore = score;
            bestAzimuth = a;
        }
        if (score > maxScore) {
            maxScore = score;
        }
    }

    if (bestAzimuth === -1) bestAzimuth = 0;

    let anisotropyRatio = maxScore / minScore;
    let isIsotropic = anisotropyRatio <= 1.15;

    // FASE 4: UPDATE UI
    if(document.getElementById('fan-azimuth')) document.getElementById('fan-azimuth').value = bestAzimuth;
    if(document.getElementById('fan-azimuth-val')) document.getElementById('fan-azimuth-val').value = bestAzimuth;
    if(document.getElementById('vario-azimuth')) document.getElementById('vario-azimuth').value = bestAzimuth;
    if(document.getElementById('vario-azimuth-val')) document.getElementById('vario-azimuth-val').value = bestAzimuth;
    if(document.getElementById('vario-dip')) document.getElementById('vario-dip').value = 0;
    if(document.getElementById('vario-dip-val')) document.getElementById('vario-dip-val').value = 0;
    if(document.getElementById('vario-plunge')) document.getElementById('vario-plunge').value = 0;
    if(document.getElementById('vario-plunge-val')) document.getElementById('vario-plunge-val').value = 0;

    updateKrigingEllipsoid();
    
    const lagDist = parseFloat(document.getElementById('vario-hop-lag')?.value) || 25;
    renderContourVarioMap(window.lastVarioMapGrid, maxLags, lagDist, bestAzimuth, globalVar);

    if (typeof showToast === 'function') {
        if (isIsotropic) {
            showToast(`Warning: Isotropic Deposit. Weak Anisotropy Ratio (${anisotropyRatio.toFixed(2)}).`, "warning");
        } else {
            showToast(`Perfect Detection: Azimuth ${bestAzimuth}°. Anisotropy Ratio: ${anisotropyRatio.toFixed(2)}.`, "success");
        }
    }
}

// ============================================================================
// 5. THEORETICAL CURVE & 3D ELLIPSOID
// ============================================================================
function updateVarioCurve() {
    if (!edaVarioInst) return;
    const n = parseFloat(document.getElementById('vario-nugget-val')?.value) || 0;
    const s = parseFloat(document.getElementById('vario-sill-val')?.value) || 0;
    const r = parseFloat(document.getElementById('vario-range-val')?.value) || 1;
    const modelType = document.getElementById('vario-model')?.value || 'spherical';

    // PERBAIKAN 2: Maksa sinkronisasi dengan Y-Axis (Sill terbesar)
    const maxD = edaVarioInst.scales.x.max || 150;
    const maxY = Math.max(s * 1.5, window.lastVarioGlobalVar * 1.5);
    edaVarioInst.options.scales.y.max = maxY;

    const c = s - n;
    let modelCurve = [];

    for (let h = 0; h <= maxD; h += (maxD / 60)) {
        let gamma = 0;
        if (h === 0) gamma = 0;
        else {
            if (modelType === 'spherical') gamma = (h <= r) ? n + c * ((1.5 * (h / r)) - (0.5 * Math.pow(h / r, 3))) : n + c;
            else if (modelType === 'exponential') gamma = n + c * (1 - Math.exp(-3 * h / r));
            else if (modelType === 'gaussian') gamma = n + c * (1 - Math.exp(-3 * Math.pow(h / r, 2)));
        }
        modelCurve.push({ x: h, y: gamma });
    }

    if (edaVarioInst.data.datasets[3]) { edaVarioInst.data.datasets[3].data = modelCurve; }
    edaVarioInst.update(); // Ganti update('none') jadi update() standar agar animasi sumbu Y berjalan
    updateKrigingEllipsoid();
}

function initKrigingEllipsoid() {
    const container = document.getElementById('kriging-ellipsoid-3d');
    if (!container || typeof THREE === 'undefined') return;
    
    // Safety check - pastikan tidak ada render ganda
    if (krigingRenderer) {
        if (container.children.length === 0) {
            container.appendChild(krigingRenderer.domElement);
        }
        return;
    }

    krigingScene = new THREE.Scene(); krigingScene.background = new THREE.Color('#020617');
    krigingCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    krigingCamera.position.set(50, 35, 50);

    krigingRenderer = new THREE.WebGLRenderer({ antialias: true });
    krigingRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(krigingRenderer.domElement);

    const controls = new THREE.OrbitControls(krigingCamera, krigingRenderer.domElement);
    controls.enableDamping = true;

    krigingScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const light = new THREE.DirectionalLight(0xffffff, 0.4); light.position.set(40, 80, 40); krigingScene.add(light);
    krigingScene.add(new THREE.GridHelper(120, 12, 0x334155, 0x1e293b));

    const sphereGeom = new THREE.SphereGeometry(1, 32, 32);
    const meshMat = new THREE.MeshPhongMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.5, shininess: 60 });
    krigingMesh = new THREE.Mesh(sphereGeom, meshMat);

    const wireMat = new THREE.LineBasicMaterial({ color: 0xa78bfa, linewidth: 1 });
    krigingMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(sphereGeom), wireMat));
    krigingMesh.add(new THREE.AxesHelper(35));
    krigingScene.add(krigingMesh);

    function animate() {
        krigingAnimationId = requestAnimationFrame(animate);
        controls.update(); krigingRenderer.render(krigingScene, krigingCamera);
    }
    animate();
    updateKrigingEllipsoid();
}

function updateKrigingEllipsoid() {
    // PERBAIKAN: UI kita pakai id 'vario-range-val', tidak ada 'vario-range-maj-val'
    const rMaj = parseFloat(document.getElementById('vario-range-val')?.value) || 25;
    // Karena kita asumsi isotropik jika rMin tidak ada di UI, rMin disamakan rMaj
    const rMin = rMaj * 0.8; 
    const rVer = rMaj * 0.2; 

    if (krigingMesh) {
        krigingMesh.scale.set(rMaj, rVer, rMin);
        const azimuth = parseFloat(document.getElementById('vario-azimuth-val')?.value) || 0;
        const plunge = parseFloat(document.getElementById('vario-plunge-val')?.value) || 0;
        const dip = parseFloat(document.getElementById('vario-dip-val')?.value) || 0;

        krigingMesh.rotation.set(dip * (Math.PI/180), (-azimuth + 90) * (Math.PI/180), plunge * (Math.PI/180), 'YXZ');
        
        const dynamicCamDist = Math.max(rMaj * 1.6, 45);
        krigingCamera.position.set(dynamicCamDist, dynamicCamDist * 0.6, dynamicCamDist);
        krigingCamera.lookAt(0, 0, 0);
    }

    if (typeof window.updateFanMapLines === 'function') {
        window.updateFanMapLines();
    }
}

window.updateFanMapLines = function() {
    const mapContainer = document.getElementById('variogram-map-plot');
    if (!mapContainer || !mapContainer.data || mapContainer.data.length < 5) return;

    const currentAzimuth = parseFloat(document.getElementById('vario-azimuth-val')?.value) || 0;
    const hMaxLags = parseInt(document.getElementById('vario-hop-count')?.value) || 6;
    const hLagDist = parseFloat(document.getElementById('vario-hop-lag')?.value) || 25.0;
    const maxRadius = hMaxLags * hLagDist;

    const radMaj = currentAzimuth * Math.PI / 180;
    const xMaj = maxRadius * Math.sin(radMaj);
    const yMaj = maxRadius * Math.cos(radMaj);

    const radMin = (currentAzimuth + 90) * Math.PI / 180;
    const xMin = maxRadius * Math.sin(radMin);
    const yMin = maxRadius * Math.cos(radMin);

    Plotly.restyle(mapContainer, {
        x: [[-xMaj, xMaj], [-xMaj, xMaj], [-xMin, xMin], [-xMin, xMin]],
        y: [[-yMaj, yMaj], [-yMaj, yMaj], [-yMin, yMin], [-yMin, yMin]]
    }, [1, 2, 3, 4]);
};

function disposeKrigingEllipsoid() {
    if (!krigingRenderer) return;
    cancelAnimationFrame(krigingAnimationId);
    krigingScene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
    krigingRenderer.dispose();
    const container = document.getElementById('kriging-ellipsoid-3d');
    if (container) container.innerHTML = '';
    krigingRenderer = null; krigingScene = null; krigingCamera = null; krigingMesh = null;
}

// ============================================================================
// 6. UTILITIES & DIAGNOSTICS
// ============================================================================
function syncVariogramValue(type) {
    const el1 = document.getElementById(`vario-${type}-val`);
    const el2 = document.getElementById(`vario-${type}`);
    if(el1 && el2) el1.value = el2.value;
    if (['nugget', 'sill', 'range'].includes(type)) updateVarioCurve();
    else updateKrigingEllipsoid();
}

function syncVariogramSlider(type) {
    const el1 = document.getElementById(`vario-${type}`);
    const el2 = document.getElementById(`vario-${type}-val`);
    if(el1 && el2) el1.value = el2.value;
    if (['nugget', 'sill', 'range'].includes(type)) updateVarioCurve();
    else updateKrigingEllipsoid();
}

function autoFitVariogram() {
    const el = document.getElementById('vario-element')?.value;
    const dom = document.getElementById('vario-domain')?.value;
    if(!el || !dom) return;
    const stat = state.edaStats?.find(s => s.Domain === dom);
    if (stat) {
        delete stat[`${el}_Nugget`]; delete stat[`${el}_Sill`]; delete stat[`${el}_Range`];
        delete stat[`${el}_Azimuth`]; delete stat[`${el}_Dip`]; delete stat[`${el}_Plunge`];
    }
    renderVariogram();
    if(typeof showToast === 'function') showToast("Parameters reset to geostatistical auto-suggestions.", "success");
}

function lockVariogramParams() {
    const el = document.getElementById('vario-element')?.value;
    const dom = document.getElementById('vario-domain')?.value;
    if(!el || !dom) return;
    const stat = state.edaStats?.find(s => s.Domain === dom) || {};
    
    stat[`${el}_Nugget`] = parseFloat(document.getElementById('vario-nugget-val')?.value || 0);
    stat[`${el}_Sill`] = parseFloat(document.getElementById('vario-sill-val')?.value || 0);
    stat[`${el}_Range`] = parseFloat(document.getElementById('vario-range-val')?.value || 0);
    stat[`${el}_Azimuth`] = parseFloat(document.getElementById('vario-azimuth-val')?.value || 0);
    stat[`${el}_Plunge`] = parseFloat(document.getElementById('vario-plunge-val')?.value || 0);
    stat[`${el}_Dip`] = parseFloat(document.getElementById('vario-dip-val')?.value || 0);
    stat[`${el}_Model`] = document.getElementById('vario-model')?.value || 'spherical';

    stat[`${el}_LagDist`] = parseFloat(document.getElementById('vario-hop-lag')?.value || 0);
    stat[`${el}_LagCount`] = parseInt(document.getElementById('vario-hop-count')?.value || 0);

    if (!state.edaStats) state.edaStats = [];
    if (!state.edaStats.find(s => s.Domain === dom)) state.edaStats.push(stat);

    if(typeof showToast === 'function') showToast(`Audit Trail: Parameters Locked for ${el} (${dom}).`, "success");
}

function runDiagnostics(nugget, sill, totalPairs, domain) {
    const title = document.getElementById('diag-title');
    const desc = document.getElementById('diag-desc');
    const icon = document.getElementById('diag-icon');
    const container = document.getElementById('diag-icon-container');

    if (!title || !desc) return;

    let warnings = [];
    if (totalPairs < 50) warnings.push(`Low Sample Pairs (${totalPairs}). Variogram may be unreliable.`);
    if (nugget > (sill * 0.6)) warnings.push(`High Nugget Effect (>60%). Data is highly noisy or erratic.`);
    if (window.lastVarioGlobalVar < 0.01) warnings.push(`Extremely low variance. Data might be completely homogeneous.`);

    if (warnings.length > 0) {
        title.textContent = `Caution: ${domain} Domain Diagnostics`;
        title.className = "text-[11px] font-black uppercase tracking-widest text-amber-700";
        desc.textContent = warnings.join(' ');
        container.className = "p-2 rounded-full bg-amber-100";
        icon.className = "w-5 h-5 text-amber-600";
        if(typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        title.textContent = `Optimal: ${domain} Domain Diagnostics`;
        title.className = "text-[11px] font-black uppercase tracking-widest text-emerald-700";
        desc.textContent = `Sufficient pairs (${totalPairs}) and reasonable Nugget/Sill ratio. Ready for KNA.`;
        container.className = "p-2 rounded-full bg-emerald-100";
        icon.className = "w-5 h-5 text-emerald-600";
        icon.setAttribute('data-lucide', 'check-circle-2');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ============================================================================
// 7. KRIGING NEIGHBORHOOD ANALYSIS (KNA) & CROSS VALIDATION - ENTERPRISE FIX
// Includes Anisotropic 3D Search Ellipsoid & Multi-Iteration Optimization
// ============================================================================
window.runKrigingValidation = function() {
    const el = document.getElementById('vario-element')?.value;
    const dom = document.getElementById('vario-domain')?.value;
    if (!el || !dom || !state.compositedData) return;

    const dData = state.compositedData.filter(d => d.Geo_Domain === dom);
    if (dData.length < 5) return;

    document.getElementById('kna-empty-state').classList.add('hidden');
    document.getElementById('kna-results-container').classList.remove('hidden');
    document.getElementById('kna-results-container').classList.add('flex');

    if(typeof showLoader === 'function') showLoader("KNA Engine", "Running Multi-Iteration Cross Validation...");

    setTimeout(() => {
        const rMaj = parseFloat(document.getElementById('vario-range-val')?.value) || 25;
        const rMin = rMaj * 0.8; 
        const rVer = rMaj * 0.2; 
        
        const azimuth = parseFloat(document.getElementById('vario-azimuth-val')?.value) || 0;
        const targetAziRad = azimuth * (Math.PI / 180);

        const ratioMin = rMaj / Math.max(rMin, 0.1);
        const ratioVer = rMaj / Math.max(rVer, 0.1);

        const minSamples = parseInt(document.getElementById('kna-min-samples')?.value) || 3;
        const userMaxSamples = parseInt(document.getElementById('kna-max-samples')?.value) || 15;

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

        const holeCol = state.coreCols?.holeId || 'Hole_ID';
        const flatData = dData.map(d => {
            const holeId = d[holeCol] || d.Hole_ID || d.id;
            const rawCollar = state.rawData ? (state.rawData.find(r => r[holeCol] === holeId) || {}) : {};
            const midDepth = ((parseFloat(d[state.coreCols?.from] || 0) + parseFloat(d[state.coreCols?.to] || 0)) / 2);
            
            let val = parseFloat(d[el]); 
            if(isNaN(val)) val = parseFloat(d[String(el).toLowerCase()]);
            
            // TERAPKAN TOP-CUT SEBELUM CROSS-VALIDATION
            val = applyTopCut(val, el, dom);

            return {
                val: val,
                x: parseFloat(d[state.detectedCoords?.x] || d.X || rawCollar.X || 0),
                y: parseFloat(d[state.detectedCoords?.y] || d.Y || rawCollar.Y || 0),
                z: parseFloat(d[state.detectedCoords?.z] || d.Z || rawCollar.Z || 0) - midDepth
            };
        }).filter(d => !isNaN(d.val) && !isNaN(d.x));

        // TAHAP 1: PRECOMPUTE NEIGHBORS (Super efisien untuk mempercepat iterasi)
        let precomputed = [];
        for (let i = 0; i < flatData.length; i++) {
            let target = flatData[i];
            let neighbors = [];
            for (let j = 0; j < flatData.length; j++) {
                if (i === j) continue;
                let pt = flatData[j];
                let dx = pt.x - target.x, dy = pt.y - target.y, dz = pt.z - target.z;
                let horizDist = Math.sqrt(dx*dx + dy*dy);
                let deltaAngle = Math.atan2(dx, dy) - targetAziRad;
                let distMaj = horizDist * Math.cos(deltaAngle);
                let distMin = horizDist * Math.sin(deltaAngle);
                let eqDist = Math.sqrt(Math.pow(distMaj, 2) + Math.pow(distMin * ratioMin, 2) + Math.pow(dz * ratioVer, 2));
                if (eqDist <= rMaj) {
                    neighbors.push({ val: pt.val, dist: eqDist });
                }
            }
            neighbors.sort((a, b) => a.dist - b.dist);
            precomputed.push({ target: target, neighbors: neighbors });
        }

        // TAHAP 2: SIMULASI ITERASI (KNA OPTIMIZATION)
        // Kita tes skenario dari 4 sampel hingga 40 sampel maksimum
        let testMaxSamples = [4, 6, 8, 10, 12, 15, 20, 24, 30, 40];
        if (!testMaxSamples.includes(userMaxSamples)) {
            testMaxSamples.push(userMaxSamples);
            testMaxSamples.sort((a,b)=>a-b);
        }

        let optCurveData = { samples: [], ke: [], slope: [] };
        let finalTrueVals = [], finalEstVals = [], xCoords = [], yCoords = [], zCoords = [];
        let finalSlope = 0, finalKE = 0, finalMeanTrue = 0, finalMeanEst = 0;

        testMaxSamples.forEach(testMax => {
            let tVals = [], eVals = [];
            let sTrue = 0, sEst = 0;

            precomputed.forEach(item => {
                if (item.neighbors.length >= minSamples) {
                    let selected = item.neighbors.slice(0, testMax);
                    let wSum = 0, vwSum = 0;
                    selected.forEach(n => {
                        let w = 1 / Math.pow(Math.max(n.dist, 0.1), 2); // IDW weight based on Aniso Dist
                        wSum += w; vwSum += n.val * w;
                    });
                    let est = vwSum / wSum;
                    tVals.push(item.target.val);
                    eVals.push(est);
                    sTrue += item.target.val;
                    sEst += est;

                    // Jika ini adalah loop iterasi yang diketik user di UI, simpan untuk scatter/swath plot
                    if (testMax === userMaxSamples) {
                        finalTrueVals.push(item.target.val);
                        finalEstVals.push(est);
                        xCoords.push(item.target.x); yCoords.push(item.target.y); zCoords.push(item.target.z);
                    }
                }
            });

            if (tVals.length > 0) {
                const mTrue = sTrue / tVals.length;
                const mEst = sEst / eVals.length;
                let num = 0, den1 = 0, den2 = 0;
                for (let i = 0; i < tVals.length; i++) {
                    num += (tVals[i] - mTrue) * (eVals[i] - mEst);
                    den1 += Math.pow(tVals[i] - mTrue, 2);
                    den2 += Math.pow(eVals[i] - mEst, 2);
                }
                const slope = den2 === 0 ? 0 : num / den2;
                const ke = 100 * (1 - ((den1 - den2) / den1)); 

                optCurveData.samples.push(testMax);
                optCurveData.ke.push(ke);
                optCurveData.slope.push(slope);

                if (testMax === userMaxSamples) {
                    finalSlope = slope;
                    finalKE = ke;
                    finalMeanTrue = mTrue;
                    finalMeanEst = mEst;
                }
            }
        });

        if (finalTrueVals.length === 0) {
            if(typeof hideLoader === 'function') hideLoader();
            if(typeof showToast === 'function') showToast("Parameter pencarian terlalu ketat. Tidak ada blok yang berhasil diestimasi.", "error");
            return;
        }

        // TAHAP 3: UPDATE STATS UI
        document.getElementById('kna-mean-true').textContent = finalMeanTrue.toFixed(3);
        document.getElementById('kna-mean-krig').textContent = finalMeanEst.toFixed(3);
        document.getElementById('kna-slope').textContent = finalSlope.toFixed(2);
        document.getElementById('kna-slope').className = `text-xl font-black ${finalSlope >= 0.85 && finalSlope <= 1.15 ? 'text-teal-600' : 'text-rose-600'}`;
        document.getElementById('kna-ke').textContent = finalKE.toFixed(1) + '%';
        document.getElementById('kna-ke').className = `text-xl font-black ${finalKE > 0 ? 'text-teal-600' : 'text-rose-600'}`;

        window.knaResults = { trueVals: finalTrueVals, estVals: finalEstVals, xCoords, yCoords, zCoords };

        // TAHAP 4: RENDER OPTIMIZATION CURVE
        if (typeof Plotly !== 'undefined') {
            const traceKE = {
                x: optCurveData.samples, y: optCurveData.ke,
                name: 'Kriging Efficiency (%)', type: 'scatter', mode: 'lines+markers',
                line: {color: '#10b981', width: 3}, marker: {size: 6, color: '#10b981'}
            };
            const traceSlope = {
                x: optCurveData.samples, y: optCurveData.slope,
                name: 'Slope of Regression', type: 'scatter', mode: 'lines+markers',
                yaxis: 'y2', line: {color: '#f43f5e', width: 2, dash: 'dot'}, marker: {size: 5, color: '#f43f5e'}
            };
            const vLine = {
                x: [userMaxSamples, userMaxSamples], y: [Math.min(...optCurveData.ke)-5, 100],
                mode: 'lines', name: 'Selected Max Samples',
                line: {color: '#6366f1', width: 2, dash: 'dash'}
            };

            const layoutOpt = {
                margin: { l: 40, r: 40, t: 10, b: 30 },
                xaxis: { title: 'Number of Samples', gridcolor: '#f1f5f9', titlefont: {size: 9} },
                yaxis: { title: 'Kriging Efficiency (%)', titlefont: {color: '#10b981', size: 9}, tickfont: {color: '#10b981', size:9}, gridcolor: '#f1f5f9' },
                yaxis2: { title: 'Slope', titlefont: {color: '#f43f5e', size:9}, tickfont: {color: '#f43f5e', size:9}, overlaying: 'y', side: 'right', showgrid: false },
                legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: {size: 9} },
                plot_bgcolor: 'rgba(0,0,0,0)', paper_bgcolor: 'rgba(0,0,0,0)', hovermode: 'x unified'
            };
            Plotly.newPlot('kna-opt-curve', [traceKE, traceSlope, vLine], layoutOpt, { responsive: true, displayModeBar: false });

            // TAHAP 5: RENDER SCATTER
            const scatterData = [{
                x: finalTrueVals, y: finalEstVals,
                mode: 'markers', type: 'scatter',
                marker: { color: 'rgba(244, 63, 94, 0.6)', size: 5, line: { color: 'rgba(225, 29, 72, 1)', width: 0.5 } },
                name: 'Data'
            }, {
                x: [0, Math.max(...finalTrueVals)], y: [0, Math.max(...finalTrueVals)],
                mode: 'lines', type: 'scatter',
                line: { color: '#64748b', dash: 'dash' }, name: '1:1 Ideal'
            }];
            Plotly.newPlot('kna-scatter-plot', scatterData, {
                margin: { l: 40, r: 20, t: 20, b: 40 },
                xaxis: { title: 'True Grade', gridcolor: '#f1f5f9', titlefont:{size:9} }, yaxis: { title: 'Estimated Grade', gridcolor: '#f1f5f9', titlefont:{size:9} },
                showlegend: false, plot_bgcolor: 'rgba(0,0,0,0)', paper_bgcolor: 'rgba(0,0,0,0)'
            }, { responsive: true, displayModeBar: false });
        }

        renderKNASwathPlot();
        if(typeof hideLoader === 'function') hideLoader();

    }, 800);
}

window.renderKNASwathPlot = function() {
    if (!window.knaResults) return;
    const axis = document.getElementById('kna-swath-axis')?.value || 'X';
    const { trueVals, estVals, xCoords, yCoords, zCoords } = window.knaResults;

    let targetCoords = axis === 'X' ? xCoords : (axis === 'Y' ? yCoords : zCoords);
    let minC = Math.min(...targetCoords), maxC = Math.max(...targetCoords);
    let binSize = (maxC - minC) / 20; if (binSize === 0) binSize = 1;

    let bins = {}, labels = [], avgTrue = [], avgEst = [];
    for (let i = 0; i < targetCoords.length; i++) {
        let b = Math.floor((targetCoords[i] - minC) / binSize);
        if (!bins[b]) bins[b] = { tSum: 0, eSum: 0, cnt: 0 };
        bins[b].tSum += trueVals[i]; bins[b].eSum += estVals[i]; bins[b].cnt++;
    }

    Object.keys(bins).sort((a,b)=>parseInt(a)-parseInt(b)).forEach(k => {
        labels.push((minC + (k * binSize)).toFixed(0));
        avgTrue.push(bins[k].tSum / bins[k].cnt);
        avgEst.push(bins[k].eSum / bins[k].cnt);
    });

    const ctx = document.getElementById('kna-swath-chart');
    if (!ctx) return;
    if (knaSwathInst) knaSwathInst.destroy();

    knaSwathInst = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'True Mean', data: avgTrue, borderColor: '#0f172a', backgroundColor: '#0f172a', borderWidth: 2, pointRadius: 3 },
                { label: 'Kriged Mean', data: avgEst, borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 2, borderDash: [5,5], pointRadius: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 9, weight: 'bold' } } } },
            scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' } } }
        }
    });
}

window.syncFanAzimuth = function(val) {
    let v = parseFloat(val) || 0;
    if (v < 0) v = 0; if (v > 360) v = 360;
    
    if (document.getElementById('fan-azimuth')) document.getElementById('fan-azimuth').value = v;
    if (document.getElementById('fan-azimuth-val')) document.getElementById('fan-azimuth-val').value = v;
    if (document.getElementById('vario-azimuth')) document.getElementById('vario-azimuth').value = v;
    if (document.getElementById('vario-azimuth-val')) document.getElementById('vario-azimuth-val').value = v;
    
    if (typeof window.updateFanMapLines === 'function') window.updateFanMapLines();
    updateKrigingEllipsoid();
};