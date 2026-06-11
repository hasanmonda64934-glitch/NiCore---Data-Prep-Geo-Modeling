// ============================================================================
// BLOCK.JS - INDEPENDENT ENGINE (PRO STYLE)
// Features: Strict Solid Constraint, Hard Boundary Kriging, True Sub-Celling, 
// Auto KNA Sync, DMT-Weighted Resource Reporting, and Dynamic Anisotropy
// ============================================================================

window.blockState = {
    isInitialized: false, rawBlocks: [], blocks: [],       
    params: { sizeX: 12.5, sizeY: 12.5, sizeZ: 2, meas: 25, ind: 50, inf: 100 },
    viewMode: 'grade', reportMode: 'resource',
    blockInstancesData: [] 
};

let blkScene, blkCamera, blkRenderer, blkControls, blkMesh;
let blkRaycaster = new THREE.Raycaster();
let blkMouse = new Vector2();
let blkHoveredId = null;

// Mock THREE.Vector2 for safe init before THREE loads
function Vector2(x, y) { this.x = x || 0; this.y = y || 0; }

function getSafeState() {
    if (typeof state !== 'undefined') return state;
    if (typeof window.state !== 'undefined') return window.state;
    return {};
}

function getConvexHull(points) {
    if (points.length <= 3) return points;
    const hull = []; let l = 0;
    for (let i = 1; i < points.length; i++) { 
        let currentX = points[i].x !== undefined ? points[i].x : points[i].x_abs;
        let lowestX = points[l].x !== undefined ? points[l].x : points[l].x_abs;
        if (currentX < lowestX) l = i; 
    }
    let p = l, q, count = 0;
    do {
        hull.push(points[p]); q = (p + 1) % points.length;
        for (let i = 0; i < points.length; i++) {
            let px = points[p].x !== undefined ? points[p].x : points[p].x_abs;
            let py = points[p].y !== undefined ? points[p].y : points[p].y_abs;
            let qx = points[q].x !== undefined ? points[q].x : points[q].x_abs;
            let qy = points[q].y !== undefined ? points[q].y : points[q].y_abs;
            let ix = points[i].x !== undefined ? points[i].x : points[i].x_abs;
            let iy = points[i].y !== undefined ? points[i].y : points[i].y_abs;
            
            const orientation = (qy - py) * (ix - qx) - (qx - px) * (iy - qy);
            if (orientation < 0) q = i;
        }
        p = q; if(count++ > points.length) break; 
    } while (p !== l);
    return hull;
}

function isPointInPolygon(px, py, polygon) {
    if (!polygon || polygon.length === 0) return true;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x !== undefined ? polygon[i].x : polygon[i].x_abs;
        let yi = polygon[i].y !== undefined ? polygon[i].y : polygon[i].y_abs;
        let xj = polygon[j].x !== undefined ? polygon[j].x : polygon[j].x_abs;
        let yj = polygon[j].y !== undefined ? polygon[j].y : polygon[j].y_abs;
        let intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

function getOrCreateTooltip() {
    let tt = document.getElementById('three-tooltip');
    if (!tt) {
        tt = document.createElement('div'); tt.id = 'three-tooltip';
        tt.className = 'fixed z-[9999] bg-[#0f172a]/95 text-white p-3 rounded-lg shadow-2xl backdrop-blur-md border border-slate-600 pointer-events-none hidden transition-opacity';
        document.body.appendChild(tt);
    }
    return tt;
}

function getAutoBlockSize() {
    const state = getSafeState();
    if (!state.compositedData || state.compositedData.length < 2) return 12.5;
    const uniqueMap = new Map();
    state.compositedData.forEach(d => {
        const x = parseFloat(d.X || d.Easting); const y = parseFloat(d.Y || d.Northing);
        if (!isNaN(x) && !isNaN(y)) uniqueMap.set(`${x.toFixed(1)}_${y.toFixed(1)}`, { x, y });
    });
    const points = Array.from(uniqueMap.values());
    if (points.length < 2) return 12.5;

    let snappedDistances = [];
    points.forEach((p1, i) => {
        let minDist = Infinity;
        points.forEach((p2, j) => { if (i !== j) { const d = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2); if(d < minDist) minDist = d; } });
        if (minDist !== Infinity && minDist > 0) snappedDistances.push([12.5, 25, 50, 100, 200].reduce((a,b) => Math.abs(b - minDist) < Math.abs(a - minDist) ? b : a));
    });

    if (snappedDistances.length === 0) return 12.5;
    const frequency = {}; let maxFreq = 0, dom = 25;
    snappedDistances.forEach(d => { frequency[d] = (frequency[d] || 0) + 1; if (frequency[d] > maxFreq) { maxFreq = frequency[d]; dom = d; } });
    return dom / 2; 
}

window.toggleAlgorithmParams = function() {
    const method = document.getElementById('blk-method')?.value || 'ok';
    const searchWrap = document.getElementById('blk-meas')?.closest('.grid')?.parentElement;
    const advWrap = document.getElementById('blk-max-hole')?.closest('.bg-slate-50'); 
    const discWrap = document.getElementById('blk-disc-x')?.closest('.grid')?.parentElement; 
    
    if (method === 'nn') {
        if(searchWrap) searchWrap.style.display = 'none';
        if(advWrap) advWrap.style.display = 'none';
    } else if (method === 'idw') {
        if(searchWrap) searchWrap.style.display = 'block';
        if(advWrap) advWrap.style.display = 'block';
        if(discWrap) discWrap.style.display = 'none';
    } else {
        if(searchWrap) searchWrap.style.display = 'block';
        if(advWrap) advWrap.style.display = 'block';
        if(discWrap) discWrap.style.display = 'block';
    }
};

window.updateTierUI = function() {
    const count = parseInt(document.getElementById('blk-tier-count')?.value) || 3;
    for(let i = 1; i <= 5; i++) {
        const row = document.querySelector(`.tier-row[data-tier="${i}"]`);
        const opLbl = document.getElementById(`lbl-op-tier${i}`);
        const valInp = document.getElementById(`val-tier${i}`);
        
        if (row) {
            if (i < count) {
                row.classList.remove('hidden');
                if(valInp) valInp.classList.remove('invisible');
                if(opLbl) {
                    opLbl.innerHTML = 'Ni &lt;';
                    opLbl.className = "text-[9px] font-bold text-slate-500 w-5 text-center shrink-0";
                }
            } else if (i === count) {
                row.classList.remove('hidden');
                if(valInp) valInp.classList.add('invisible');
                if(opLbl) {
                    opLbl.innerHTML = 'Ni &ge;';
                    opLbl.className = "text-[9px] font-black text-rose-600 w-5 text-center shrink-0";
                }
            } else {
                row.classList.add('hidden');
            }
        }
    }
};

window.initBlockUI = function() {
    const state = getSafeState();
    
    // Auto-sync dari Variography (KNA)
    if (state.edaStats && state.edaStats.length > 0) {
        const el = document.getElementById('vario-element')?.value || 'Ni';
        let bestRange = 25; 
        
        const validStat = state.edaStats.find(s => s[`${el}_Range`] !== undefined);
        if (validStat) bestRange = parseFloat(validStat[`${el}_Range`]);
        else if (document.getElementById('vario-range-val')) {
            bestRange = parseFloat(document.getElementById('vario-range-val').value) || 25;
        }

        if (document.getElementById('blk-meas')) document.getElementById('blk-meas').value = bestRange.toFixed(1);
        if (document.getElementById('blk-ind')) document.getElementById('blk-ind').value = (bestRange * 2).toFixed(1);
        if (document.getElementById('blk-inf')) document.getElementById('blk-inf').value = (bestRange * 4).toFixed(1);
    }

    const knaMax = document.getElementById('kna-max-samples')?.value;
    if (knaMax && document.getElementById('blk-max-samples')) {
        document.getElementById('blk-max-samples').value = knaMax;
    }

    if (state.compositedData && state.compositedData.length > 0) {
        const autoSize = getAutoBlockSize();
        if (document.getElementById('blk-x')) document.getElementById('blk-x').value = autoSize; 
        if (document.getElementById('blk-y')) document.getElementById('blk-y').value = autoSize;
    }
    
    window.updateTierUI(); 
    if(window.toggleAlgorithmParams) window.toggleAlgorithmParams(); 
    
    if (!window.blockState.isInitialized) {
        initThreeJSBlock(); window.blockState.isInitialized = true;
    }
    if (window.blockState.blocks.length > 0 && (!blkMesh || !blkScene.children.includes(blkMesh))) {
        render3DBlocks();
    }
};

function initThreeJSBlock() {
    if (typeof THREE === 'undefined') return;
    const container = document.getElementById('block-canvas-container');
    if (!container) return; container.innerHTML = '';
    
    blkMouse = new THREE.Vector2();
    blkScene = new THREE.Scene();
    blkScene.background = new THREE.Color('#0f172a'); 
    blkCamera = new THREE.PerspectiveCamera(45, (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight), 1, 500000);
    blkCamera.up.set(0, 0, 1);
    
    blkRenderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    // --- TAMBAHKAN BARIS INI UNTUK MENGHIDUPKAN SLICER ---
    blkRenderer.localClippingEnabled = true; 
    // ---------------------------------------------------
    blkRenderer.setPixelRatio(window.devicePixelRatio);
    blkRenderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    container.appendChild(blkRenderer.domElement);
    
    blkControls = new THREE.OrbitControls(blkCamera, blkRenderer.domElement);
    blkControls.enableDamping = true;
    
    blkScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5000, 5000, 10000); blkScene.add(dirLight);

    const grid = new THREE.GridHelper(5000, 50, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2; blkScene.add(grid);
    blkCamera.position.set(0, -1000, 1000);
    
    container.addEventListener('click', window.onBlockClick);
    animateBlock();
}

function animateBlock() {
    requestAnimationFrame(animateBlock);
    if (blkControls) blkControls.update();
    const container = document.getElementById('block-canvas-container');
    if (blkRenderer && blkScene && blkCamera && container && container.clientWidth > 0) {
        blkRenderer.render(blkScene, blkCamera);
    }
}

window.onBlockClick = function(event) {
    const container = document.getElementById('block-canvas-container');
    let tooltip = document.getElementById('three-tooltip');
    
    if (!tooltip) {
        tooltip = document.createElement('div'); tooltip.id = 'three-tooltip';
        tooltip.className = 'fixed z-[9999] bg-[#0f172a]/95 text-white p-3 rounded-lg shadow-2xl backdrop-blur-md border border-slate-600 pointer-events-none hidden transition-opacity';
        document.body.appendChild(tooltip);
    }
    
    if (!container || !blkCamera) return;

    const rect = container.getBoundingClientRect();
    blkMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    blkMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    blkRaycaster.setFromCamera(blkMouse, blkCamera);
    
    let clickedHole = false;

    // --- 1. SENSOR KLIK UNTUK LUBANG BOR (HOLES OVERLAY) ---
    if (typeof blkHolesOverlay !== 'undefined' && blkHolesOverlay) {
        const holeIntersects = blkRaycaster.intersectObjects(blkHolesOverlay.children, true);
        if (holeIntersects.length > 0) {
            const offset = getSceneOffset();
            const hitX = holeIntersects[0].point.x + offset.x;
            const hitY = holeIntersects[0].point.y + offset.y;
            const hitZ = holeIntersects[0].point.z;

            let closestDist = Infinity;
            let closestData = null;

            // CARI DATA ASLI DARI COMPOSITED DATA (Bukan dari array Block Model)
            const state = getSafeState();
            if (state && state.compositedData && state.compositedData.length > 0) {
                const keys = Object.keys(state.compositedData[0] || {});
                const getExactCol = (arr, el) => arr.find(k => {
                    const u = k.toUpperCase().trim();
                    return u === el || u.startsWith(`${el}_`) || u.startsWith(`${el} `) || u.startsWith(`${el}(`);
                }) || el;

                const niCol = getExactCol(keys, 'NI');
                const feCol = getExactCol(keys, 'FE');
                const mgoCol = getExactCol(keys, 'MGO');
                const holeCol = state.coreCols?.holeId || 'Hole_ID';
                const colX = state.detectedCoords?.x || 'X'; 
                const colY = state.detectedCoords?.y || 'Y';
                
                const rawGrp = new Map();
                if (state.rawData) state.rawData.forEach(r => { if (!rawGrp.has(r[holeCol])) rawGrp.set(r[holeCol], r); });
                
                const zColOptions = ['z_corrected', 'topo_z', 'elev_corrected', 'elevation', 'elev', 'z', 'rl'];
                let zCol = null;
                const headers = state.headers || keys;
                for (let opt of zColOptions) { zCol = headers.find(h => h.toLowerCase() === opt); if (zCol) break; }
                if (!zCol) zCol = state.detectedCoords?.z || 'Z';

                state.compositedData.forEach((d, idx) => {
                    const holeId = d[holeCol] || d.HOLEID || d.id || `UNKNOWN_${idx}`;
                    const rawHole = rawGrp.get(holeId);
                    const x = parseFloat(d[colX] || d.X || d.Easting || (rawHole ? rawHole[colX] : NaN));
                    const y = parseFloat(d[colY] || d.Y || d.Northing || (rawHole ? rawHole[colY] : NaN));
                    let zCollar = NaN;
                    if (rawHole) { zCollar = parseFloat(rawHole[zCol] || rawHole.Z || rawHole.Elevation || rawHole.elev); }
                    if (isNaN(zCollar)) zCollar = parseFloat(d[zCol] || d.Z || d.Elevation);
                    
                    const from = parseFloat(d[state.coreCols?.from || 'From']) || 0;
                    const to = parseFloat(d[state.coreCols?.to || 'To']) || 0;
                    let z = zCollar - ((from + to) / 2); 
                    
                    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                        const dist = Math.sqrt((x - hitX)**2 + (y - hitY)**2 + (z - hitZ)**2);
                        if (dist < closestDist) {
                            closestDist = dist;
                            closestData = {
                                hole: holeId, z: z, dom: d.Geo_Domain || d.Base_Domain || 'BRK',
                                ni: parseFloat(d[niCol]) || 0, fe: parseFloat(d[feCol]) || 0, mgo: parseFloat(d[mgoCol]) || 0
                            };
                        }
                    }
                });
            }

            if (closestData && closestDist < 10) { 
                tooltip.innerHTML = `
                    <div class="font-black text-white border-b border-slate-600 pb-1.5 mb-1.5 tracking-widest uppercase flex justify-between items-center">
                        <span class="text-teal-400 flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Drill Hole Node</span>
                        <span class="px-1.5 py-0.5 rounded text-[8px] bg-slate-700 text-teal-300 shadow-inner border border-slate-600">COMPOSITED DATA</span>
                    </div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] min-w-[200px]">
                        <span class="text-slate-400">Hole ID:</span> <span class="font-bold text-right text-white">${closestData.hole}</span>
                        <span class="text-slate-400">Elevation (Z):</span> <span class="font-mono font-bold text-right text-slate-200">${closestData.z.toFixed(2)}</span>
                        <span class="text-slate-400">Domain:</span> <span class="font-bold text-right text-amber-400">${closestData.dom}</span>
                        <span class="text-slate-400">Ni Grade:</span> <span class="font-mono font-black text-right text-emerald-400">${closestData.ni.toFixed(2)}%</span>
                        <span class="text-slate-400 border-t border-slate-700 pt-1 mt-0.5">Fe:</span> <span class="font-mono font-bold text-right text-rose-400 border-t border-slate-700 pt-1 mt-0.5">${closestData.fe.toFixed(2)}%</span>
                        <span class="text-slate-400">MgO:</span> <span class="font-mono font-bold text-right text-blue-400">${closestData.mgo.toFixed(2)}%</span>
                    </div>`;
                clickedHole = true;
            }
        }
    }

    // --- 2. SENSOR KLIK UNTUK BLOCK MODEL ---
    if (!clickedHole && blkMesh) {
        const intersects = blkRaycaster.intersectObject(blkMesh);
        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId;
            const data = window.blockState.blockInstancesData[instanceId];
            if (data) {
                const state = getSafeState();
                const p = window.blockState.params;
                const blkVol = (p.sizeX * data.scaleX) * (p.sizeY * data.scaleY) * (p.sizeZ * data.scaleZ);
                
                const sg = state.sgParams?.[data.dom] || 1.5;
                let mc = 0;
                if (state.mcParams && state.mcParams[data.dom] !== undefined) { mc = state.mcParams[data.dom]; } 
                else { const dStr = String(data.dom).toUpperCase(); if (dStr.includes('LIM')) mc = 35; else if (dStr.includes('SAP')) mc = 25; else mc = 5; }
                
                const wmt = blkVol * sg;
                const dmt = wmt * (1 - (mc / 100));
                
                const mode = window.blockState.reportMode || 'resource';
                let displayCatLabel = 'JORC Class';
                let displayCatValue = data.cls;
                let displayColorClass = data.cls === 'Measured' ? 'text-emerald-400' : (data.cls === 'Indicated' ? 'text-amber-400' : 'text-rose-400');
                let colorInlineStyle = '';
                
                let secondRowLabel = 'Domain';
                let secondRowValue = data.dom;

                if (mode === 'classify') {
                    displayCatLabel = 'Grade Class';
                    displayCatValue = data.niClass;
                    displayColorClass = ''; 
                    colorInlineStyle = `color: ${data.color};`; 
                } else if (mode === 'domain') {
                    displayCatLabel = 'Domain';
                    displayCatValue = data.dom;
                    displayColorClass = 'text-amber-400';
                    secondRowLabel = 'JORC Class';
                    secondRowValue = data.cls;
                }

                tooltip.innerHTML = `
                    <div class="font-black text-white border-b border-slate-600 pb-1.5 mb-1.5 tracking-widest uppercase flex justify-between items-center">
                        <span class="text-amber-400">Block Details</span>
                        <span class="px-1.5 py-0.5 rounded text-[8px] bg-white text-slate-800">${data.material}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] min-w-[200px]">
                        <span class="text-slate-400">${displayCatLabel}:</span> <span class="font-bold text-right ${displayColorClass}" style="${colorInlineStyle}">${displayCatValue}</span>
                        <span class="text-slate-400">${secondRowLabel}:</span> <span class="font-bold text-right text-slate-200">${secondRowValue}</span>
                        <span class="text-slate-400">Ni Grade:</span> <span class="font-mono font-bold text-right text-emerald-400">${data.ni.toFixed(2)}%</span>
                        <span class="text-slate-400 border-t border-slate-700 pt-1 mt-0.5">Cell Type:</span> <span class="font-bold text-slate-200 text-right border-t border-slate-700 pt-1 mt-0.5">${data.isSubBlock ? 'Sub-Cell' : 'Parent'}</span>
                        <span class="text-slate-400">Volume:</span> <span class="font-bold text-slate-200 text-right">${blkVol.toFixed(1)} m&sup3;</span>
                        <span class="text-slate-400">WMT (SG ${sg.toFixed(1)}):</span> <span class="font-bold text-slate-200 text-right">${wmt.toFixed(0)} Ton</span>
                        <span class="text-slate-400">DMT (MC ${mc}%):</span> <span class="font-black text-teal-400 text-right">${dmt.toFixed(0)} Ton</span>
                    </div>`;
            }
        } else {
            tooltip.classList.add('hidden');
            return;
        }
    } else if (!clickedHole) {
        tooltip.classList.add('hidden');
        return;
    }

    tooltip.classList.remove('hidden'); 
    if (typeof lucide !== 'undefined') lucide.createIcons({root: tooltip});
    
    const rectTT = tooltip.getBoundingClientRect();
    const ttWidth = rectTT.width || 220, ttHeight = rectTT.height || 150;
    let posX = event.clientX + 15, posY = event.clientY + 15;
    
    if (posX + ttWidth > window.innerWidth) posX = event.clientX - ttWidth - 10;
    if (posY + ttHeight > window.innerHeight) posY = event.clientY - ttHeight - 10;
    
    tooltip.style.left = posX + 'px'; 
    tooltip.style.top = posY + 'px'; 
};

function getSceneOffset() {
    const state = getSafeState();
    if (!state || !state.compositedData || state.compositedData.length === 0) return {x:0, y:0};
    const holeCol = state.coreCols?.holeId || 'Hole_ID';
    const colX = state.detectedCoords?.x || 'X'; const colY = state.detectedCoords?.y || 'Y';
    const rawGrp = new Map();
    if(state.rawData) state.rawData.forEach(r => { if(!rawGrp.has(r[holeCol])) rawGrp.set(r[holeCol], r); });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.compositedData.forEach(d => {
        const rawHole = rawGrp.get(d[holeCol]);
        const x = parseFloat(d[colX] || (rawHole ? rawHole[colX] : NaN));
        const y = parseFloat(d[colY] || (rawHole ? rawHole[colY] : NaN));
        if (!isNaN(x) && !isNaN(y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    });
    if (minX === Infinity) return {x:0, y:0};
    return { x: minX + (maxX - minX)/2, y: minY + (maxY - minY)/2 };
}

window.calculateLocalDipAndAzimuth = function(blockX, blockY, searchRadius = 25) {
    const state = getSafeState();
    if (!state.topoData || state.topoData.length < 3) return { dip: 0, azimuth: 0 };
    let localPoints = [];
    
    for (let i = 0; i < state.topoData.length; i++) {
        let p = state.topoData[i];
        let dx = p.x - blockX; let dy = p.y - blockY;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist <= searchRadius) localPoints.push(p);
    }
    
    if (localPoints.length < 3) {
        for (let i = 0; i < state.topoData.length; i++) {
            let p = state.topoData[i];
            let dist = Math.sqrt(Math.pow(p.x - blockX, 2) + Math.pow(p.y - blockY, 2));
            if (dist <= searchRadius * 2) localPoints.push(p);
        }
    }

    if (localPoints.length < 3) return { dip: 0, azimuth: 0 }; 

    let sumX = 0, sumY = 0, sumZ = 0;
    let sumXX = 0, sumYY = 0, sumXY = 0;
    let sumXZ = 0, sumYZ = 0;
    let n = localPoints.length;

    localPoints.forEach(p => {
        sumX += p.x; sumY += p.y; sumZ += p.z;
        sumXX += p.x * p.x; sumYY += p.y * p.y; sumXY += p.x * p.y;
        sumXZ += p.x * p.z; sumYZ += p.y * p.z;
    });

    let D = (sumXX * sumYY - sumXY * sumXY) * n 
          - (sumX * sumX * sumYY) 
          - (sumY * sumY * sumXX) 
          + 2 * (sumX * sumY * sumXY);

    if (Math.abs(D) < 1e-10) return { dip: 0, azimuth: 0 }; 

    let A = ( (sumXZ * sumYY - sumYZ * sumXY) * n 
            - (sumX * sumZ * sumYY) 
            + (sumY * sumZ * sumXY) 
            + (sumX * sumY * sumYZ) 
            - (sumXX * sumY * sumZ) ) / D;

    let B = ( (sumXX * sumYZ - sumXY * sumXZ) * n 
            - (sumY * sumZ * sumXX) 
            + (sumX * sumZ * sumXY) 
            + (sumX * sumY * sumXZ) 
            - (sumYY * sumX * sumZ) ) / D;

    let dipRad = Math.acos(1 / Math.sqrt(A*A + B*B + 1));
    let dipDeg = dipRad * (180 / Math.PI);
    let azRad = Math.atan2(A, B); 
    let azDeg = azRad * (180 / Math.PI);
    if (azDeg < 0) azDeg += 360;

    return { dip: dipDeg, azimuth: azDeg };
};

window.runBlockModel = function() {
    const state = getSafeState();
    if (!state.compositedData || state.compositedData.length === 0) return alert("Workspace is empty. Please load data first!");
    const domainGrids = window.wireframeState?.domainGrids;
    
    if (!domainGrids || Object.keys(domainGrids).length === 0) {
        if (typeof hideLoader === 'function') hideLoader();
        return alert("STRICT CONSTRAINT: Solid Wireframe is Mandatory. Please execute 'Domain Solid Engine' in the Wireframe tab first. The Block Model will only be built inside generated solids.");
    }
    
    const topoGrid = window.wireframeState?.topoGrid; 
    const clipToTopo = document.getElementById('blk-clip-topo')?.checked;
    if (clipToTopo && !topoGrid) {
        if (typeof hideLoader === 'function') hideLoader();
        return alert("Topography DTM not found! Please build topography in Wireframe tab or uncheck 'Clip Block to Topo'.");
    }
    
    const wfBoundary = window.wireframeState?.boundaryXY;
    
    if (!blkScene) initThreeJSBlock();
    if (typeof showLoader === 'function') showLoader("Kriging Engine", "Generating Constrained Sub-Celled Blocks...");
    
    const p = window.blockState.params;
    p.sizeX = parseFloat(document.getElementById('blk-x')?.value) || 12.5; p.sizeY = parseFloat(document.getElementById('blk-y')?.value) || 12.5; p.sizeZ = parseFloat(document.getElementById('blk-z')?.value) || 2.0;
    p.meas = parseFloat(document.getElementById('blk-meas')?.value) || 25; p.ind = parseFloat(document.getElementById('blk-ind')?.value) || 50; p.inf = parseFloat(document.getElementById('blk-inf')?.value) || 100;
    p.maxHole = parseInt(document.getElementById('blk-max-hole')?.value) || 3; p.maxSamples = parseInt(document.getElementById('blk-max-samples')?.value) || 15;
    p.discX = parseInt(document.getElementById('blk-disc-x')?.value) || 2; p.discY = parseInt(document.getElementById('blk-disc-y')?.value) || 2; p.discZ = parseInt(document.getElementById('blk-disc-z')?.value) || 1;
    
    const method = document.getElementById('blk-method')?.value || 'ok';
    // CEK STATUS DYNAMIC ANISOTROPY
    const useDynamicAniso = document.getElementById('blk-dynamic-aniso')?.checked || false;

    const data = state.compositedData; 
    const keys = Object.keys(data[0] || {});
    
    // Fungsi pencari cerdas presisi tinggi agar tidak salah mendeteksi singkatan kata
    const getExactCol = (arr, el) => arr.find(k => {
        const u = k.toUpperCase().trim();
        return u === el || u.startsWith(`${el}_`) || u.startsWith(`${el} `) || u.startsWith(`${el}(`);
    }) || el;

    const niCol = getExactCol(keys, 'NI');
    const feCol = getExactCol(keys, 'FE');
    const mgoCol = getExactCol(keys, 'MGO');
    const sio2Col = getExactCol(keys, 'SIO2');
    const coCol = getExactCol(keys, 'CO');
    
    const domCol = 'Geo_Domain'; const holeCol = state.coreCols?.holeId || 'Hole_ID'; 
    const colX = state.detectedCoords?.x || 'X'; const colY = state.detectedCoords?.y || 'Y';
    const zColOptions = ['z_corrected', 'topo_z', 'elev_corrected', 'elevation', 'elev', 'z', 'rl'];
    let zCol = null;
    const headers = state.headers || Object.keys(state.compositedData[0] || {});
    for (let opt of zColOptions) { zCol = headers.find(h => h.toLowerCase() === opt); if (zCol) break; }
    if (!zCol) zCol = state.detectedCoords?.z || 'Z';
    
    const rawGrp = new Map();
    if (state.rawData) state.rawData.forEach(r => { if (!rawGrp.has(r[holeCol])) rawGrp.set(r[holeCol], r); });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const points = [];
    
    if (wfBoundary && wfBoundary.length > 0) {
        wfBoundary.forEach(pt => { 
            let px = pt.x !== undefined ? pt.x : pt.x_abs;
            let py = pt.y !== undefined ? pt.y : pt.y_abs;
            minX = Math.min(minX, px); maxX = Math.max(maxX, px); 
            minY = Math.min(minY, py); maxY = Math.max(maxY, py); 
        });
    }
    
    data.forEach((d, idx) => {
        const holeId = d[holeCol] || d.HOLEID || d.id || `UNKNOWN_${idx}`;
        const rawHole = rawGrp.get(holeId);
        const x = parseFloat(d[colX] || d.X || d.Easting || (rawHole ? rawHole[colX] : NaN));
        const y = parseFloat(d[colY] || d.Y || d.Northing || (rawHole ? rawHole[colY] : NaN));
        let zCollar = NaN;
        if (rawHole) { zCollar = parseFloat(rawHole[zCol] || rawHole.Z || rawHole.Elevation || rawHole.elev); }
        if (isNaN(zCollar)) zCollar = parseFloat(d[zCol] || d.Z || d.Elevation);
        const from = parseFloat(d[state.coreCols?.from || 'From']) || 0;
        const to = parseFloat(d[state.coreCols?.to || 'To']) || 0;
        let z = zCollar - ((from + to) / 2); 
        const ni = parseFloat(d[niCol]) || 0;
        const fe = parseFloat(d[feCol]) || 0;
        const mgo = parseFloat(d[mgoCol]) || 0;
        const sio2 = parseFloat(d[sio2Col]) || 0;
        const co = parseFloat(d[coCol]) || 0;

        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            if (!wfBoundary) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            points.push({ x, y, z, ni, fe, mgo, sio2, co, dom: d[domCol] || 'BRK', hole: holeId, zCollar });
        }
    });
    
    if(points.length === 0) { if (typeof hideLoader === 'function') hideLoader(); return alert("No valid coordinates found."); }
    
    const hullPoints = points.map(p => ({ x: p.x, y: p.y }));
    const boundaryPolygon = wfBoundary || getConvexHull(hullPoints);
    
    const domainParams = {};
    [...new Set(points.map(pt => pt.dom))].forEach(dom => {
        const ds = (state.edaStats || []).find(s => s.Domain === dom) || {};
        const rMaj = ds[`${niCol}_Range`] || p.inf;
        domainParams[dom] = {
            n: ds[`${niCol}_Nugget`] || 0.05, s: ds[`${niCol}_Sill`] || 0.15, rMaj: rMaj,
            a: ds[`${niCol}_Azimuth`] || 0, dp: ds[`${niCol}_Dip`] || 0, pg: ds[`${niCol}_Plunge`] || 0,
            model: ds[`${niCol}_Model`] || 'spherical',
            ratioMin: rMaj / Math.max(ds[`${niCol}_RangeMin`] || (rMaj * 0.8), 0.1),
            ratioVer: rMaj / Math.max(ds[`${niCol}_RangeVer`] || (rMaj * 0.2), 0.1),
            topCut: ds[`${niCol}_TopCut98`] !== undefined ? parseFloat(ds[`${niCol}_TopCut98`]) : Infinity // <-- TAMBAHAN: Masukkan Top-Cut ke memori
        };
    });

    // PRA-HITUNG LOCAL TOPO ORIENTATION (Agar worker tidak usah hitung ini)
    let precalcTopoOrientations = {};
    if (useDynamicAniso) {
        let xSteps = Math.ceil((maxX - minX) / p.sizeX) + 2;
        let ySteps = Math.ceil((maxY - minY) / p.sizeY) + 2;
        for (let i = 0; i <= xSteps; i++) {
            for (let j = 0; j <= ySteps; j++) {
                let bx = minX - p.sizeX + (i * p.sizeX);
                let by = minY - p.sizeY + (j * p.sizeY);
                // Kita pre-hitung matriks grid ini
                let orient = calculateLocalDipAndAzimuth(bx, by, p.meas);
                precalcTopoOrientations[`${Math.floor(bx)}_${Math.floor(by)}`] = orient;
            }
        }
    }

    const workerCode = `
        function applyTopCut(val, elName, domName, params) {
            if (isNaN(val)) return val;
            // Kita perlu mengirimkan info TopCut ke Worker. 
            // Modifikasi objek domainParams agar menyertakan info 'topCut'
            let cutVal = params[domName]?.topCuts?.[elName] || Infinity;
            return Math.min(val, cutVal);
        }      

        function isPointInPolygon(px, py, polygon) {
            if(!polygon || polygon.length === 0) return true;
            let isInside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                let xi = polygon[i].x !== undefined ? polygon[i].x : polygon[i].x_abs;
                let yi = polygon[i].y !== undefined ? polygon[i].y : polygon[i].y_abs;
                let xj = polygon[j].x !== undefined ? polygon[j].x : polygon[j].x_abs;
                let yj = polygon[j].y !== undefined ? polygon[j].y : polygon[j].y_abs;
                let intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) isInside = !isInside;
            }
            return isInside;
        }

        function solveOK(samples, target, nug, sill, range, azi, dip, plunge, ratioMin, ratioVer, modelType, p) {
            try {
                const n = samples.length; if (n === 0) return 0;
                const size = n + 1; const A = Array.from({ length: size }, () => new Float64Array(size)); const B = new Float64Array(size);
                const getCov = (d) => { if (d === 0) return sill + nug; if (d > range && modelType !== 'exponential' && modelType !== 'gaussian') return 0; if (modelType === 'exponential') return sill * Math.exp(-3 * d / range); else if (modelType === 'gaussian') return sill * Math.exp(-3 * Math.pow(d / range, 2)); else return d > range ? 0 : sill * (1 - (1.5 * (d / range) - 0.5 * Math.pow(d / range, 3))); };
                const rA = azi * (Math.PI / 180), rD = dip * (Math.PI / 180), rP = plunge * (Math.PI / 180);
                const getAnisoDist = (p1, p2) => { let dx = p1.x - p2.x, dy = p1.y - p2.y, dz = p1.z - p2.z; let x1 = dx * Math.cos(rA) - dy * Math.sin(rA), y1 = dx * Math.sin(rA) + dy * Math.cos(rA), z1 = dz; let x2 = x1, y2 = y1 * Math.cos(rD) - z1 * Math.sin(rD), z2 = y1 * Math.sin(rD) + z1 * Math.cos(rD); let x3 = x2 * Math.cos(rP) + z2 * Math.sin(rP), y3 = y2, z3 = -x2 * Math.sin(rP) + z2 * Math.cos(rP); return Math.sqrt(x3*x3 + Math.pow(y3 * ratioMin, 2) + Math.pow(z3 * ratioVer, 2)); };
                let discPts = []; let stepX = p.sizeX / Math.max(1, p.discX); let stepY = p.sizeY / Math.max(1, p.discY); let stepZ = p.sizeZ / Math.max(1, p.discZ);
                let startX = target.x - (p.sizeX/2) + (stepX/2), startY = target.y - (p.sizeY/2) + (stepY/2), startZ = target.z - (p.sizeZ/2) + (stepZ/2);
                for(let ix=0; ix<Math.max(1, p.discX); ix++) { for(let iy=0; iy<Math.max(1, p.discY); iy++) { for(let iz=0; iz<Math.max(1, p.discZ); iz++) { discPts.push({ x: startX + ix*stepX, y: startY + iy*stepY, z: startZ + iz*stepZ }); } } }
                const totalDisc = discPts.length;
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) { A[i][j] = getCov(getAnisoDist(samples[i], samples[j])); if (i === j) A[i][j] += 0.0001; }
                    A[i][n] = 1; A[n][i] = 1; let sumCovBlock = 0; for(let d=0; d<totalDisc; d++) { sumCovBlock += getCov(getAnisoDist(samples[i], discPts[d])); } B[i] = sumCovBlock / totalDisc;
                }
                A[n][n] = 0; B[n] = 1;
                for (let i = 0; i < size; i++) {
                    let maxEl = Math.abs(A[i][i]), maxRow = i;
                    for (let k = i + 1; k < size; k++) { if (Math.abs(A[k][i]) > maxEl) { maxEl = Math.abs(A[k][i]); maxRow = k; } }
                    if (maxRow !== i) { let temp = A[maxRow]; A[maxRow] = A[i]; A[i] = temp; let t = B[maxRow]; B[maxRow] = B[i]; B[i] = t; }
                    let pivot = A[i][i]; if (Math.abs(pivot) < 1e-12) return 0; 
                    for (let j = i + 1; j < size; j++) { const factor = A[j][i] / pivot; B[j] -= factor * B[i]; for (let k = i; k < size; k++) A[j][k] -= factor * A[i][k]; }
                }
                const w = new Float64Array(size);
                for (let i = size - 1; i >= 0; i--) { let s = 0; for (let j = i + 1; j < size; j++) s += A[i][j] * w[j]; w[i] = (B[i] - s) / A[i][i]; }
                let est = 0; for (let i = 0; i < n; i++) est += w[i] * samples[i].ni; return isNaN(est) ? 0 : Math.max(0, est);
            } catch (e) { return 0; }
        }

        self.onmessage = function(e) {
            const { points, p, method, domainParams, minX, maxX, minY, maxY, minZ, maxZ, domainGrids, topoGrid, boundaryPolygon, clipToTopo, useDynamicAniso, precalcTopoOrientations } = e.data;
            const cellSize = p.inf; const spatialGrid = new Map();
            points.forEach(pt => { const key = Math.floor(pt.x / cellSize) + "_" + Math.floor(pt.y / cellSize); if (!spatialGrid.has(key)) spatialGrid.set(key, []); spatialGrid.get(key).push(pt); });
            let calculatedBlocks = [];
            
            const subDiv = 4, subScale = 1.0 / subDiv, subSizeX = p.sizeX * subScale, subSizeY = p.sizeY * subScale;
            for (let bx = minX - p.sizeX; bx <= maxX + p.sizeX; bx += p.sizeX) {
                for (let by = minY - p.sizeY; by <= maxY + p.sizeY; by += p.sizeY) {
                    if (!isPointInPolygon(bx, by, boundaryPolygon)) continue; 
                    
                    const cx = Math.floor(bx / cellSize), cy = Math.floor(by / cellSize); let localPts = [];
                    for(let i=-1; i<=1; i++) { for(let j=-1; j<=1; j++) { const k = (cx+i) + "_" + (cy+j); if(spatialGrid.has(k)) localPts.push(...spatialGrid.get(k)); } }
                    if (localPts.length === 0) continue;
                    
                    let minLocalZ = Infinity; localPts.forEach(pt => { if (pt.z < minLocalZ) minLocalZ = pt.z; });
                    
                    let parentMinTopo = Infinity, parentMaxTopo = -Infinity;
                    const pts5 = [{x:bx, y:by}, {x:bx-(p.sizeX/2), y:by-(p.sizeY/2)}, {x:bx+(p.sizeX/2), y:by-(p.sizeY/2)}, {x:bx-(p.sizeX/2), y:by+(p.sizeY/2)}, {x:bx+(p.sizeX/2), y:by+(p.sizeY/2)}];
                    if (topoGrid) {
                        for(let pt of pts5) {
                            const tX = Math.round((pt.x - topoGrid.minX) / topoGrid.resX), tY = Math.round((pt.y - topoGrid.minY) / topoGrid.resY);
                            if (tX >= 0 && tX < topoGrid.cols && tY >= 0 && tY < topoGrid.rows && topoGrid.mask[tY * topoGrid.cols + tX] === 1) {
                                let zt = topoGrid.top[tY * topoGrid.cols + tX]; if(zt < parentMinTopo) parentMinTopo = zt; if(zt > parentMaxTopo) parentMaxTopo = zt;
                            }
                        }
                    }

                    for (let bz = minZ - p.sizeZ; bz <= maxZ + p.sizeZ; bz += p.sizeZ) {
                        let bt = bz + (p.sizeZ / 2), bb = bz - (p.sizeZ / 2);
                        
                        if (bz < minLocalZ - (p.sizeZ * 2.0)) continue;
                        
                        let blockDom = null, isInsideAnySolid = false;
                        let dTopParent = Infinity, dBotParent = -Infinity;

                        // 1. CEK WIREFRAME CONSTRAINT
                        if (domainGrids) {
                            let maxOverlap = 0, bestOverlapDom = null;
                            for (let domName in domainGrids) {
                                const dg = domainGrids[domName], cX = Math.round((bx - dg.minX) / dg.resX), cY = Math.round((by - dg.minY) / dg.resY);
                                if (cX >= 0 && cX < dg.cols && cY >= 0 && cY < dg.rows && dg.mask[cY * dg.cols + cX] === 1) {
                                    let dTop = dg.top[cY * dg.cols + cX], dBot = dg.bot[cY * dg.cols + cX];
                                    let oTop = Math.min(bt, dTop), oBot = Math.max(bb, dBot);
                                    if (oTop > oBot) { 
                                        isInsideAnySolid = true; 
                                        if ((oTop - oBot) > maxOverlap) { 
                                            maxOverlap = oTop - oBot; bestOverlapDom = domName; 
                                            dTopParent = dTop; dBotParent = dBot; 
                                        } 
                                    }
                                }
                            }
                            blockDom = bestOverlapDom;
                        }

                        // 2. SMART DATA SNAPPING (Menyelamatkan Data Bor di Ujung Wireframe)
                        let samplesInBlock = [];
                        localPts.forEach(pt => {
                            if (pt.x >= bx - p.sizeX/2 && pt.x <= bx + p.sizeX/2 &&
                                pt.y >= by - p.sizeY/2 && pt.y <= by + p.sizeY/2 &&
                                pt.z >= bz - p.sizeZ/2 && pt.z <= bz + p.sizeZ/2) {
                                samplesInBlock.push(pt);
                            }
                        });

                        // Jika ada sampel bor di dalam koordinat blok ini, PAKSA blok mengikuti domain sampel
                        if (samplesInBlock.length > 0) {
                            isInsideAnySolid = true;
                            blockDom = samplesInBlock[0].dom; // Ambil domain dari data bor
                            
                            // Regangkan batas virtual Wireframe agar blok ini tidak dibuang oleh sistem
                            let sMinZ = Math.min(...samplesInBlock.map(s => s.z));
                            let sMaxZ = Math.max(...samplesInBlock.map(s => s.z));
                            dBotParent = Math.min(dBotParent !== -Infinity ? dBotParent : Infinity, sMinZ - 0.1);
                            dTopParent = Math.max(dTopParent !== Infinity ? dTopParent : -Infinity, sMaxZ + 0.1);
                        }

                        if (!isInsideAnySolid) continue;

                        let isBoundaryBlock = false;
                        if (clipToTopo && parentMaxTopo !== -Infinity) {
                            if (bb >= parentMaxTopo) continue; 
                            if (bt >= parentMinTopo && bb <= parentMaxTopo) isBoundaryBlock = true;
                        }
                        if (bt > dTopParent || bb < dBotParent) isBoundaryBlock = true;

                        let minDistEucFinal = Infinity; 
                        localPts.forEach(pt => { 
                            if(pt.dom === blockDom) {
                                const dEuc = Math.sqrt((pt.x - bx)**2 + (pt.y - by)**2 + (pt.z - bz)**2); 
                                if (dEuc < minDistEucFinal) { minDistEucFinal = dEuc; } 
                            }
                        });
                        
                        if (minDistEucFinal > p.inf) continue;

                        let dP = JSON.parse(JSON.stringify(domainParams[blockDom] || domainParams[Object.keys(domainParams)[0]]));
                        
                        if (useDynamicAniso) {
                            let locOrient = precalcTopoOrientations[Math.floor(bx) + "_" + Math.floor(by)];
                            if (locOrient) {
                                dP.a = locOrient.azimuth; 
                                dP.dp = locOrient.dip; 
                                dP.ratioMin = 1.0; 
                                dP.ratioVer = 3.0; 
                            }
                        }

                        let rawSamples = [];
                        const rA = dP.a * (Math.PI / 180), rD = dP.dp * (Math.PI / 180), rP = dP.pg * (Math.PI / 180);
                        const vertSearchMax = Math.max(20, p.inf / Math.max(1, dP.ratioVer) * 1.5);
                        
                        localPts.forEach(pt => {
                            if (pt.dom !== blockDom) return;
                            let dx = pt.x - bx, dy = pt.y - by, dz = pt.z - bz; 
                            if (!useDynamicAniso && Math.abs(dz) > vertSearchMax) return;
                            
                            let x1 = dx * Math.cos(rA) - dy * Math.sin(rA), y1 = dx * Math.sin(rA) + dy * Math.cos(rA), z1 = dz;
                            let x2 = x1, y2 = y1 * Math.cos(rD) - z1 * Math.sin(rD), z2 = y1 * Math.sin(rD) + z1 * Math.cos(rD);
                            let x3 = x2 * Math.cos(rP) + z2 * Math.sin(rP), y3 = y2, z3 = -x2 * Math.sin(rP) + z2 * Math.cos(rP);
                            let dAni = Math.sqrt(x3*x3 + Math.pow(y3 * dP.ratioMin, 2) + Math.pow(z3 * Math.min(5, Math.max(1, dP.ratioVer)), 2));
                            
                            if (dAni <= p.inf) {
                                let cappedNi = Math.min(pt.ni, dP.topCut || Infinity); 
                                rawSamples.push({ x: pt.x, y: pt.y, z: pt.z, ni: cappedNi, fe: pt.fe, mgo: pt.mgo, sio2: pt.sio2, co: pt.co, dAni: dAni, hole: pt.hole });
                            }
                        });
                        
                        if (rawSamples.length === 0) continue;
                        
                        let estNi = 0, estFe = 0, estMgo = 0, estSio2 = 0, estCo = 0;
                        let finalSamples = [], holeTally = {}; 
                        let sumW = 0, sumNi = 0, sumFe = 0, sumMgo = 0, sumSio2 = 0, sumCo = 0;
                        
                        rawSamples.sort((a,b) => a.dAni - b.dAni);
                        
                        if (method === 'nn') {
                            estNi = rawSamples[0].ni; estFe = rawSamples[0].fe; estMgo = rawSamples[0].mgo; estSio2 = rawSamples[0].sio2; estCo = rawSamples[0].co;
                        } else {
                            for(let s of rawSamples) { 
                                holeTally[s.hole] = (holeTally[s.hole] || 0) + 1; 
                                if(holeTally[s.hole] <= p.maxHole) { 
                                    finalSamples.push(s); 
                                    const w = 1 / (s.dAni**2 + 1e-6); 
                                    sumW += w; sumNi += s.ni * w; sumFe += s.fe * w; sumMgo += s.mgo * w; sumSio2 += s.sio2 * w; sumCo += s.co * w;
                                } 
                                if(finalSamples.length >= p.maxSamples) break; 
                            }
                            if (finalSamples.length > 0) {
                                estFe = sumFe / sumW; estMgo = sumMgo / sumW; estSio2 = sumSio2 / sumW; estCo = sumCo / sumW;
                                
                                if (method === 'ok' && finalSamples.length > 2) { 
                                    estNi = solveOK(finalSamples, {x:bx, y:by, z:bz}, dP.n, dP.s, dP.rMaj, dP.a, dP.dp, dP.pg, dP.ratioMin, dP.ratioVer, dP.model, p); 
                                    if (estNi === 0 && finalSamples[0].ni > 0) estNi = sumNi / sumW; 
                                } 
                                else { estNi = sumNi / sumW; }
                            }
                        }

                        if (isBoundaryBlock) {
                            let startX = bx - (p.sizeX / 2) + (subSizeX / 2), startY = by - (p.sizeY / 2) + (subSizeY / 2);
                            for(let i=0; i<subDiv; i++) {
                                for(let j=0; j<subDiv; j++) {
                                    let sbx = startX + (i * subSizeX), sby = startY + (j * subSizeY);
                                    
                                    let sDTop = dTopParent, sDBot = dBotParent;
                                    if (domainGrids && domainGrids[blockDom]) {
                                        const dg = domainGrids[blockDom];
                                        const sCX = Math.round((sbx - dg.minX) / dg.resX), sCY = Math.round((sby - dg.minY) / dg.resY);
                                        if (sCX >= 0 && sCX < dg.cols && sCY >= 0 && sCY < dg.rows && dg.mask[sCY * dg.cols + sCX] === 1) {
                                            sDTop = dg.top[sCY * dg.cols + sCX];
                                            sDBot = dg.bot[sCY * dg.cols + sCX];
                                        } else if (samplesInBlock.length === 0) { continue; } 
                                    }
                                    
                                    if (samplesInBlock.length > 0) {
                                        sDTop = Math.max(sDTop, bt);
                                        sDBot = Math.min(sDBot, bb);
                                    }
                                    
                                    let sbTop = Math.min(bt, sDTop);
                                    let sbBot = Math.max(bb, sDBot);
                                    if (sbTop <= sbBot) continue; 
                                    
                                    let sTopoZ = Infinity;
                                    if (topoGrid) {
                                        const tX = Math.round((sbx - topoGrid.minX) / topoGrid.resX), tY = Math.round((sby - topoGrid.minY) / topoGrid.resY);
                                        if (tX >= 0 && tX < topoGrid.cols && tY >= 0 && tY < topoGrid.rows && topoGrid.mask[tY * topoGrid.cols + tX] === 1) sTopoZ = topoGrid.top[tY * topoGrid.cols + tX];
                                    }
                                    if (clipToTopo && sTopoZ !== Infinity) { 
                                        if (sbBot >= sTopoZ) continue; 
                                        if (sbTop > sTopoZ) sbTop = sTopoZ; 
                                    }
                                    
                                    let newSizeZ = sbTop - sbBot; 
                                    if (newSizeZ <= 0.05) continue; 

                                    calculatedBlocks.push({ 
                                        x: sbx, y: sby, z: sbBot + (newSizeZ/2), 
                                        scaleX: subScale, scaleY: subScale, scaleZ: newSizeZ/p.sizeZ, 
                                        isSubBlock: true, 
                                        ni: estNi || 0, fe: estFe || 0, mgo: estMgo || 0, sio2: estSio2 || 0, co: estCo || 0, 
                                        dom: blockDom, dist: minDistEucFinal 
                                    });
                                }
                            }
                        } else {
                            calculatedBlocks.push({ 
                                x: bx, y: by, z: bz, 
                                scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0, 
                                isSubBlock: false, 
                                ni: estNi || 0, fe: estFe || 0, mgo: estMgo || 0, sio2: estSio2 || 0, co: estCo || 0, 
                                dom: blockDom, dist: minDistEucFinal 
                            });
                        }
                    }
                }
            }
            self.postMessage({ status: 'success', blocks: calculatedBlocks });
        };
    `;

    try {
        const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
        worker.postMessage({ points, p, method, domainParams, minX, maxX, minY, maxY, minZ, maxZ, domainGrids, topoGrid, boundaryPolygon, clipToTopo, useDynamicAniso, precalcTopoOrientations });
        worker.onmessage = function(e) {
            if (e.data.status === 'success') {
                window.blockState.rawBlocks = e.data.blocks;
                if (typeof hideLoader === 'function') hideLoader(); 
                if (typeof showToast === 'function') showToast("Block Model Generated strictly within boundaries!", "success");
                window.applyBlockConstraints(); 
            }
            worker.terminate(); 
        };
        worker.onerror = function(error) { if (typeof hideLoader === 'function') hideLoader(); alert("Worker Error: " + error.message); worker.terminate(); };
    } catch (err) { if (typeof hideLoader === 'function') hideLoader(); alert("Error: " + err.message); }
};

window.applyBlockConstraints = function() {
    if (!window.blockState.rawBlocks || window.blockState.rawBlocks.length === 0) return;
    const cog = parseFloat(document.getElementById('blk-cog')?.value) || 1.0;
    const count = parseInt(document.getElementById('blk-tier-count')?.value) || 3;
    let tiers = [];
    
    for(let i = 1; i <= count; i++) {
        let customName = document.getElementById(`name-tier${i}`)?.value;
        if (!customName) {
            const oldLabel = document.getElementById(`lbl-tier${i}`)?.innerText;
            customName = oldLabel ? oldLabel.replace(/Ni <|Ni ≥/g, '').trim() : `Class ${i}`;
        }
        
        tiers.push({ 
            limit: (i === count) ? Infinity : (parseFloat(document.getElementById(`val-tier${i}`)?.value) || 0), 
            color: document.getElementById(`color-tier${i}`)?.value || "#cccccc", 
            name: customName 
        });
    }
    
    const p = window.blockState.params; window.blockState.blocks = [];
    const mode = window.blockState.reportMode || 'resource';
    const state = getSafeState(); // <-- Panggil state global
    
    window.blockState.rawBlocks.forEach(rb => {
        // --- MENGAMBIL DAN MENERAPKAN TOP-CUT ---
        const stat = state.edaStats?.find(s => s.Domain === rb.dom);
        const topCut = stat && stat['Ni_TopCut98'] !== undefined ? parseFloat(stat['Ni_TopCut98']) : Infinity;
        const cappedNi = Math.min(rb.ni, topCut); 
        // ----------------------------------------
        
        const cls = rb.dist <= p.meas ? 'Measured' : (rb.dist <= p.ind ? 'Indicated' : 'Inferred');
        let mat = "Waste", niCls = "Waste", col = "#cccccc";
        
        if (cappedNi >= cog) { // <-- GUNAKAN cappedNi UNTUK KLASIFIKASI ORE/WASTE
            mat = "Ore";
            let assignedTier = tiers[tiers.length - 1]; 
            for(let i = 0; i < tiers.length; i++) { if (cappedNi < tiers[i].limit) { assignedTier = tiers[i]; break; } }
            col = assignedTier.color; niCls = assignedTier.name; 
        }
        
        if (mode === 'resource') { col = cls === 'Measured' ? "#10b981" : (cls === 'Indicated' ? "#f59e0b" : "#ef4444"); } 
        else if (mode === 'domain') { const d = String(rb.dom).toUpperCase(); col = d.includes('LIM') ? "#b45309" : (d.includes('SAP') ? "#10b981" : "#1e293b"); } 
        
        // Timpa rb.ni dengan cappedNi agar laporan Volume & Tooltip akurat
        window.blockState.blocks.push({ ...rb, ni: cappedNi, cls, material: mat, niClass: niCls, color: col });
    });
    render3DBlocks(); updateReportUI();
};

function render3DBlocks() {
    if (!blkScene) return;
    if (blkMesh) { blkScene.remove(blkMesh); blkMesh.geometry.dispose(); blkMesh.material.dispose(); blkMesh = null; }
    const visibleBlocks = window.blockState.blocks.filter(b => b.material === "Ore");
    if (visibleBlocks.length === 0) return;
    
    const p = window.blockState.params;
    const geometry = new THREE.BoxGeometry(p.sizeX * 0.95, p.sizeY * 0.95, p.sizeZ * 0.95); 
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    blkMesh = new THREE.InstancedMesh(geometry, material, visibleBlocks.length);
    blkMesh.frustumCulled = false;
    window.blockState.blockInstancesData = [];
    
    const dummy = new THREE.Object3D(), color = new THREE.Color(), offset = getSceneOffset();
    const zExag = window.wireframeState?.zExag || 1;
    blkScene.scale.set(1, 1, zExag);
    
    let minZ = Infinity;
    visibleBlocks.forEach((b, i) => {
        if(b.z < minZ) minZ = b.z;
        
        let renderZ = b.z;
        let renderScaleZ = b.scaleZ;
        
        // --- SMART VISUAL OFFSET (ESTETIKA) ---
        // Deteksi: Jika ini adalah sub-blok dan terpotong oleh Topografi (scaleZ < 1.0)
        if (b.isSubBlock && b.scaleZ < 0.99) {
            // Kita hitung kompensasi kemiringan lereng.
            // Semakin lebar bloknya, semakin butuh offset besar agar sudutnya tidak tembus.
            const subWidth = p.sizeX * b.scaleX;
            let nudge = subWidth * 0.15; // Turunkan atap sekitar 15% dari lebar sub-blok
            
            // Safety check: Jangan sampai atap ditekan terlalu ke bawah (maksimal 40% dari tinggi)
            const currentHeight = p.sizeZ * b.scaleZ;
            if (nudge >= currentHeight) nudge = currentHeight * 0.4; 
            
            renderScaleZ = b.scaleZ - (nudge / p.sizeZ);
            
            // Turunkan titik tengah (Z) sebesar setengah 'nudge'
            // Ini memastikan dasar (bottom) blok tetap berada di koordinat elevasi aslinya!
            renderZ = b.z - (nudge / 2);
        }
        // --------------------------------------

        dummy.position.set(b.x - offset.x, b.y - offset.y, renderZ);
        dummy.scale.set(b.scaleX, b.scaleY, renderScaleZ);
        dummy.updateMatrix(); 
        
        blkMesh.setMatrixAt(i, dummy.matrix); 
        blkMesh.setColorAt(i, color.set(b.color));
        
        // Penting: Kita simpan blok 'b' yang asli (sebelum dimodifikasi visualnya) 
        // ke dalam InstancesData, sehingga jika tooltip diklik atau Tonase dihitung,
        // ukurannya menggunakan volume asli yang sah secara JORC.
        window.blockState.blockInstancesData[i] = b;
    });
    
    const grid = blkScene.children.find(c => c.type === 'GridHelper');
    if (grid && minZ !== Infinity) {
        grid.position.z = minZ - (p.sizeZ * 2);
    }
    
    blkMesh.instanceMatrix.needsUpdate = true;
    if (blkMesh.instanceColor) blkMesh.instanceColor.needsUpdate = true;
    blkScene.add(blkMesh);

    // --- TAMBAHKAN 1 BARIS INI ---
    if (typeof window.toggleBlockOverlays === 'function') window.toggleBlockOverlays();
    if (typeof window.calcSlicerBounds === 'function') window.calcSlicerBounds();
}

let blkTopoOverlay = null, blkHolesOverlay = null;

window.toggleBlockOverlays = function() {
    if (!blkScene) return;
    
    const showTopo = document.getElementById('blk-show-topo')?.checked;
    const showHoles = document.getElementById('blk-show-holes')?.checked;
    
    // --- 1. CLONE TOPO DARI WIREFRAME ---
    if (showTopo) {
        // Hapus clone lama agar selalu mendapat bentuk Topo yang paling update
        if (blkTopoOverlay) { blkScene.remove(blkTopoOverlay); }
        
        const topoLayer = window.wireframeState?.layers['TOPO'];
        if (topoLayer && topoLayer.group) { 
            blkTopoOverlay = topoLayer.group.clone(); 
            blkScene.add(blkTopoOverlay); 
        }
    } else if (blkTopoOverlay) { 
        blkScene.remove(blkTopoOverlay); 
    }

    // --- 2. CLONE HOLES DARI WIREFRAME ---
    if (showHoles) {
        // Hapus clone lama agar selalu mendapat data bor yang paling update
        if (blkHolesOverlay) { blkScene.remove(blkHolesOverlay); }
        
        if (typeof wfHolesGroup !== 'undefined' && wfHolesGroup.children.length > 0) { 
            blkHolesOverlay = wfHolesGroup.clone(); 
            blkScene.add(blkHolesOverlay); 
        }
    } else if (blkHolesOverlay) { 
        blkScene.remove(blkHolesOverlay); 
    }
};

window.changeReportMode = function(mode) { window.blockState.reportMode = mode; window.applyBlockConstraints(); };

function updateReportUI() {
    const state = getSafeState(), mode = window.blockState.reportMode || 'resource';
    const vol = window.blockState.params.sizeX * window.blockState.params.sizeY * window.blockState.params.sizeZ; 
    let rowsHtml = '', tW = 0, tD = 0, tN = 0, tFe = 0, tMgo = 0, tSio2 = 0, tCo = 0;
    
    const getMC = (dom) => {
        if (state.mcParams && state.mcParams[dom] !== undefined) return state.mcParams[dom];
        const d = String(dom).toUpperCase();
        if (d.includes('LIM')) return 35;
        if (d.includes('SAP')) return 25;
        return 5;
    };

    const initSumObj = (color) => ({ wmt:0, dmt:0, ni:0, fe:0, mgo:0, sio2:0, co:0, c:0, color: color });

    let sum = {};
    if (mode === 'resource') {
        sum = { Measured: initSumObj("#10b981"), Indicated: initSumObj("#f59e0b"), Inferred: initSumObj("#ef4444") };
    }

    window.blockState.blocks.filter(b => b.material === "Ore").forEach(b => {
        const sg = state.sgParams?.[b.dom] || 1.5;
        const mc = getMC(b.dom);
        const wmt = vol * sg * (b.scaleX * b.scaleY * b.scaleZ); 
        const dmt = wmt * (1 - (mc/100));
        
        let key = b.cls;
        if (mode === 'classify') {
            key = b.niClass || "Unknown";
            if(!sum[key]) sum[key] = initSumObj(b.color);
        } else if (mode === 'domain') {
            key = b.dom;
            if(!sum[key]) sum[key] = initSumObj(String(b.dom).toUpperCase().includes('LIM') ? "#b45309" : (String(b.dom).toUpperCase().includes('SAP') ? "#10b981" : "#1e293b"));
        }

        if(sum[key]) {
            sum[key].wmt += wmt; sum[key].dmt += dmt; 
            sum[key].ni += (b.ni || 0) * dmt; 
            sum[key].fe += (b.fe || 0) * dmt; 
            sum[key].mgo += (b.mgo || 0) * dmt; 
            sum[key].sio2 += (b.sio2 || 0) * dmt; 
            sum[key].co += (b.co || 0) * dmt; 
            sum[key].c++;
        }
    });

    let keysToRender = Object.keys(sum);
    if (mode === 'resource') keysToRender = ['Measured','Indicated','Inferred'];
    else if (mode === 'domain') keysToRender.sort();

    keysToRender.forEach(k => {
        if (sum[k] && sum[k].c > 0) { 
            tW += sum[k].wmt; tD += sum[k].dmt; 
            tN += sum[k].ni; tFe += sum[k].fe; tMgo += sum[k].mgo; tSio2 += sum[k].sio2; tCo += sum[k].co;
            
            // PERBAIKAN: Menambahkan kolom Fe, MgO, SiO2, Co ke semua mode tabel!
            rowsHtml += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="p-2 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap"><span class="w-2.5 h-2.5 rounded-full shadow-sm inline-block shrink-0" style="background-color: ${sum[k].color}"></span>${k}</td>
                <td class="p-2 text-right font-mono">${sum[k].wmt.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td class="p-2 text-right font-mono text-emerald-600 font-bold bg-emerald-50/30">${sum[k].dmt.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                <td class="p-2 text-right font-mono">${(sum[k].ni / sum[k].dmt).toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-rose-600">${(sum[k].fe / sum[k].dmt).toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-blue-600">${(sum[k].mgo / sum[k].dmt).toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-slate-500">${(sum[k].sio2 / sum[k].dmt).toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-purple-600">${(sum[k].co / sum[k].dmt).toFixed(3)}</td>
            </tr>`; 
        }
    });
    
    // Perbaikan CSS Overflow: Tambahkan max-w-full dan hilangkan absolute width agar tabel bisa di-scroll horizontal jika terlalu panjang.
    let html = `<div class="mb-3 border-b border-slate-100 pb-2"><select onchange="window.changeReportMode(this.value)" class="w-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-bold rounded p-1.5 outline-none focus:border-teal-500 cursor-pointer shadow-sm"><option value="resource" ${mode==='resource'?'selected':''}>1. By Resource Class (JORC)</option><option value="classify" ${mode==='classify'?'selected':''}>2. By Grade Class</option><option value="domain" ${mode==='domain'?'selected':''}>3. By Geological Domain</option></select></div>
    <div class="overflow-x-auto custom-scrollbar max-w-full pb-2">
        <table class="w-full min-w-max text-[10px] text-left border-collapse whitespace-nowrap">
            <thead class="bg-[#0f172a] text-slate-200 uppercase tracking-wider text-[9px] sticky top-0">
                <tr>
                    <th class="p-2.5 border-r border-slate-600 font-bold">Category</th>
                    <th class="p-2.5 border-r border-slate-600 text-right">WMT</th>
                    <th class="p-2.5 border-r border-slate-600 text-right text-emerald-400 font-bold">DMT</th>
                    <th class="p-2.5 border-r border-slate-600 text-right text-teal-300">Ni (%)</th>
                    <th class="p-2.5 border-r border-slate-600 text-right text-rose-300">Fe (%)</th>
                    <th class="p-2.5 border-r border-slate-600 text-right text-blue-300">MgO (%)</th>
                    <th class="p-2.5 border-r border-slate-600 text-right">SiO2 (%)</th>
                    <th class="p-2.5 text-right text-purple-300">Co (%)</th>
                </tr>
            </thead>
            <tbody class="text-slate-700 font-medium">
                ${rowsHtml}`;
    
    if (tW > 0) {
        html += `<tr class="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-300">
            <td class="p-2 text-right uppercase tracking-widest">TOTAL</td>
            <td class="p-2 text-right font-mono">${tW.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
            <td class="p-2 text-right font-mono text-emerald-700 font-black bg-emerald-100/50">${tD.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
            <td class="p-2 text-right font-mono text-teal-700">${(tN/tD).toFixed(2)}</td>
            <td class="p-2 text-right font-mono text-rose-700">${(tFe/tD).toFixed(2)}</td>
            <td class="p-2 text-right font-mono text-blue-700">${(tMgo/tD).toFixed(2)}</td>
            <td class="p-2 text-right font-mono text-slate-600">${(tSio2/tD).toFixed(2)}</td>
            <td class="p-2 text-right font-mono text-purple-700">${(tCo/tD).toFixed(3)}</td>
        </tr>`;
    } else {
        html += `<tr><td colspan="8" class="p-4 text-center text-slate-400 italic font-bold">0 Blocks Calculated.</td></tr>`;
    }
    
    html += `</tbody></table></div>`;

    const container = document.getElementById('block-report-area');
    if(container) container.innerHTML = html;
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.exportBlockCSV = function() {
    let csv = "X,Y,Z,Nickel,Domain,JORC_Class,NI_CLASS,ORETYPE,VOLUME_M3,WMT_TON,DMT_TON\n";
    const p = window.blockState.params;
    const state = getSafeState();
    
    window.blockState.blocks.forEach(b => { 
        let volM3 = (p.sizeX * b.scaleX) * (p.sizeY * b.scaleY) * (p.sizeZ * b.scaleZ);
        const sg = state.sgParams?.[b.dom] || 1.5;
        let mc = 0;
        if (state.mcParams && state.mcParams[b.dom] !== undefined) { mc = state.mcParams[b.dom]; } 
        else { const dStr = String(b.dom).toUpperCase(); if (dStr.includes('LIM')) mc = 35; else if (dStr.includes('SAP')) mc = 25; else mc = 5; }
        
        const wmt = volM3 * sg;
        const dmt = wmt * (1 - (mc / 100));

        csv += `${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(2)},${b.ni.toFixed(3)},${b.dom},${b.cls},${b.niClass},${b.material},${volM3.toFixed(1)},${wmt.toFixed(1)},${dmt.toFixed(1)}\n`; 
    });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `BlockModel_Export.csv`; a.click();
};

window.updateBlockColors = function() { window.applyBlockConstraints(); };

window.addEventListener('resize', () => { 
    if(blkRenderer && blkCamera) {
        const container = document.getElementById('block-canvas-container');
        if(container && container.clientWidth > 0) {
            blkRenderer.setSize(container.clientWidth, container.clientHeight, false);
            blkCamera.aspect = container.clientWidth / container.clientHeight;
            blkCamera.updateProjectionMatrix();
        }
    }
});

// ============================================================================
// 🚀 INTERACTIVE 3D SLICER (CROSS-SECTION ENGINE)
// ============================================================================
window.slicerState = {
    isActive: false,
    axis: 'y', // 'x' (E-W), 'y' (N-S), 'z' (Plan)
    thickness: 25,
    position: 0,
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    planeFront: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    planeBack: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
};

window.initSlicerUI = function() {
    const toggle = document.getElementById('slicer-toggle');
    const axisSel = document.getElementById('slicer-axis');
    const thickInp = document.getElementById('slicer-thickness');
    const posSlider = document.getElementById('slicer-position');
    const btnCam = document.getElementById('btn-slicer-cam');

    if(toggle) toggle.addEventListener('change', (e) => { window.slicerState.isActive = e.target.checked; window.applySlicerToMaterials(); });
    if(axisSel) axisSel.addEventListener('change', (e) => { window.slicerState.axis = e.target.value; window.calcSlicerBounds(); });
    if(thickInp) thickInp.addEventListener('input', (e) => { window.slicerState.thickness = parseFloat(e.target.value) || 25; window.updateSlicerPlanes(); });
    if(posSlider) posSlider.addEventListener('input', (e) => { window.slicerState.position = parseFloat(e.target.value); window.updateSlicerPlanes(); });
    if(btnCam) btnCam.addEventListener('click', window.snapSlicerCamera);
};

window.calcSlicerBounds = function() {
    const blocks = window.blockState?.blocks || [];
    if(blocks.length === 0) return;
    
    // Kalkulasi batas terluar dari Block Model
    let b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const offset = getSceneOffset(); 

    blocks.forEach(blk => {
        let cx = blk.x - offset.x, cy = blk.y - offset.y, cz = blk.z;
        if(cx < b.minX) b.minX = cx; if(cx > b.maxX) b.maxX = cx;
        if(cy < b.minY) b.minY = cy; if(cy > b.maxY) b.maxY = cy;
        if(cz < b.minZ) b.minZ = cz; if(cz > b.maxZ) b.maxZ = cz;
    });
    
    window.slicerState.bounds = b;
    
    // Sesuaikan min/max dari Slider HTML agar rentangnya pas sebesar model
    const slider = document.getElementById('slicer-position');
    if(slider) {
        let min = 0, max = 100, start = 0;
        if(window.slicerState.axis === 'x') { min = b.minX; max = b.maxX; start = (b.minX+b.maxX)/2; }
        if(window.slicerState.axis === 'y') { min = b.minY; max = b.maxY; start = (b.minY+b.maxY)/2; }
        if(window.slicerState.axis === 'z') { min = b.minZ; max = b.maxZ; start = (b.minZ+b.maxZ)/2; }
        
        slider.min = min; slider.max = max; slider.step = 1; 
        slider.value = start; window.slicerState.position = start;
    }
    window.updateSlicerPlanes();
};

window.updateSlicerPlanes = function() {
    const st = window.slicerState;
    const pos = st.position;
    const halfT = st.thickness / 2;
    
    // Aljabar GPU: Bidang memotong piksel yang nilai Dot Product-nya negatif.
    if(st.axis === 'x') {
        st.planeFront.normal.set(-1, 0, 0); st.planeFront.constant = pos + halfT;
        st.planeBack.normal.set(1, 0, 0);   st.planeBack.constant = -(pos - halfT);
    } else if(st.axis === 'y') {
        st.planeFront.normal.set(0, -1, 0); st.planeFront.constant = pos + halfT;
        st.planeBack.normal.set(0, 1, 0);   st.planeBack.constant = -(pos - halfT);
    } else if(st.axis === 'z') {
        st.planeFront.normal.set(0, 0, -1); st.planeFront.constant = pos + halfT;
        st.planeBack.normal.set(0, 0, 1);   st.planeBack.constant = -(pos - halfT);
    }

    const lbl = document.getElementById('slicer-pos-val');
    if(lbl) lbl.innerText = pos.toFixed(1) + ' m';
    
    window.applySlicerToMaterials();
};

window.applySlicerToMaterials = function() {
    const planes = window.slicerState.isActive ? [window.slicerState.planeFront, window.slicerState.planeBack] : [];
    
    // 1. Potong Block Model
    if(blkMesh && blkMesh.material) {
        blkMesh.material.clippingPlanes = planes;
        blkMesh.material.needsUpdate = true;
    }
    // 2. Potong Topo Overlay
    if(typeof blkTopoOverlay !== 'undefined' && blkTopoOverlay) {
        blkTopoOverlay.traverse(child => {
            if(child.isMesh && child.material) { child.material.clippingPlanes = planes; child.material.needsUpdate = true; }
        });
    }
    // 3. Potong Holes Overlay
    if(typeof blkHolesOverlay !== 'undefined' && blkHolesOverlay) {
        blkHolesOverlay.traverse(child => {
            if(child.isMesh && child.material) { child.material.clippingPlanes = planes; child.material.needsUpdate = true; }
        });
    }
};

window.snapSlicerCamera = function() {
    if(!blkCamera || !blkControls) return;
    const st = window.slicerState;
    const pos = st.position;
    const b = st.bounds;
    
    let cx = (b.minX + b.maxX)/2;
    let cy = (b.minY + b.maxY)/2;
    let cz = (b.minZ + b.maxZ)/2;
    let dist = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) * 1.5;

    // Reset kamera agar horizon rata
    blkCamera.up.set(0,0,1);

    if(st.axis === 'x') {
        // E-W Slice (Kamera diletakkan di Timur menghadap ke Barat/posisi irisan)
        blkCamera.position.set(pos + dist, cy, cz);
        blkControls.target.set(pos, cy, cz);
    } else if(st.axis === 'y') {
        // N-S Slice (Kamera diletakkan di Selatan menghadap ke Utara)
        blkCamera.position.set(cx, pos - dist, cz);
        blkControls.target.set(cx, pos, cz);
    } else if(st.axis === 'z') {
        // Plan Slice (Kamera diletakkan di Atas menghadap ke Bawah)
        blkCamera.position.set(cx, cy, pos + dist);
        blkCamera.up.set(0,1,0); // Ubah kutub atas agar Utara tetap di atas layar
        blkControls.target.set(cx, cy, pos);
    }
    blkControls.update();
};

// Panggil inisialisasi Event Listener otomatis
setTimeout(() => { window.initSlicerUI(); }, 1000);

// ========================================================
// GRADE-TONNAGE CURVE (BLOCK MODEL OUTPUT)
// ========================================================
let blkGtChartInstance = null;

window.showBlockGradeTonnageCurve = function() {
    const blocks = window.blockState.blocks;
    if (!blocks || blocks.length === 0) {
        showToast("Run the Interpolation Engine first.", "warning"); return;
    }

    // Ekstraksi batas iterasi (min & max Ni) dari array voxel aktual
    let minNi = Infinity, maxNi = -Infinity;
    blocks.forEach(b => {
        if (b.ni < minNi) minNi = b.ni;
        if (b.ni > maxNi) maxNi = b.ni;
    });

    if (minNi === Infinity) { minNi = 0.5; maxNi = 2.0; }
    let startCog = Math.max(0, Math.floor(minNi * 10) / 10);
    let endCog = Math.ceil(maxNi * 10) / 10;
    
    // Penyesuaian rentang iterasi grafik dinamis
    let step = 0.1;
    if ((endCog - startCog) / step > 25) step = 0.2; 

    const cogSteps = [], tonnages = [], niGrades = [], feGrades = [];
    for (let i = startCog; i <= endCog + 0.01; i += step) cogSteps.push(Number(i.toFixed(2)));

    const p = window.blockState.params;
    const state = getSafeState();

    // --- ITERASI SUMPRODUCT UNTUK SETIAP TITIK COG ---
    cogSteps.forEach(cog => {
        let totalDMT = 0, sumNiTon = 0, sumFeTon = 0;
        
        blocks.forEach(b => {
            if (b.ni >= cog) {
                // Kalkulasi DMT Berbasis JORC (Sama seperti Inventory utama)
                let volM3 = (p.sizeX * b.scaleX) * (p.sizeY * b.scaleY) * (p.sizeZ * b.scaleZ);
                const sg = state.sgParams?.[b.dom] || 1.5;
                let mc = 0;
                
                if (state.mcParams && state.mcParams[b.dom] !== undefined) { 
                    mc = state.mcParams[b.dom]; 
                } else { 
                    const dStr = String(b.dom).toUpperCase(); 
                    if (dStr.includes('LIM')) mc = 35; else if (dStr.includes('SAP')) mc = 25; else mc = 5; 
                }
                
                const wmt = volM3 * sg; 
                const dmt = wmt * (1 - (mc / 100)); 
                
                totalDMT += dmt;
                sumNiTon += (b.ni * dmt); 
                sumFeTon += (b.fe * dmt);
            }
        });

        const avgNi = totalDMT > 0 ? (sumNiTon / totalDMT) : 0;
        const avgFe = totalDMT > 0 ? (sumFeTon / totalDMT) : 0;

        tonnages.push(Number(totalDMT.toFixed(0)));
        niGrades.push(Number(avgNi.toFixed(2)));
        feGrades.push(Number(avgFe.toFixed(2)));
    });

    // --- RENDER MODAL UI ---
    const modalId = 'blk-gt-curve-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const methodInput = document.getElementById('blk-method')?.value || 'ok';
    const methodText = methodInput === 'ok' ? 'Ordinary Kriging (OK)' : (methodInput === 'idw' ? 'Inverse Distance Weighting (IDW)' : 'Nearest Neighbour (NN)');

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-fade-in-up p-4 overflow-y-auto';
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col border border-slate-700 my-auto">
            <div class="bg-[#0f172a] px-6 py-4 flex justify-between items-center shadow-md shrink-0 rounded-t-xl">
                <div class="flex items-center gap-3">
                    <i data-lucide="bar-chart-3" class="w-6 h-6 text-indigo-400"></i> 
                    <div>
                        <h3 class="text-white font-black text-sm lg:text-lg tracking-wide leading-tight uppercase">BLOCK MODEL GRADE-TONNAGE CURVE</h3>
                        <p class="text-indigo-200 text-[9px] lg:text-[10px] tracking-widest uppercase mt-0.5">Interpolation Method: ${methodText}</p>
                    </div>
                </div>
                <button onclick="document.getElementById('${modalId}').remove()" class="text-rose-200 hover:text-white bg-rose-500/20 hover:bg-rose-500 rounded p-1.5 transition-all outline-none">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-6 bg-white relative w-full h-[65vh] min-h-[500px]">
                <canvas id="blk-gt-curve-canvas"></canvas>
            </div>
            <div class="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 rounded-b-xl shrink-0">
                <p class="text-[10px] text-slate-500 font-bold max-w-xl leading-tight">
                    *Tonnage matrix is computed volumetrically using Dry Basis (DMT) constraints across <span class="text-indigo-600">${blocks.length.toLocaleString()}</span> dynamic Sub-Celled voxel entities.
                </p>
                <div class="flex gap-3 shrink-0 w-full md:w-auto">
                    <button onclick="window.downloadBlockGTCurve()" class="flex-1 md:flex-none px-5 py-2.5 text-xs font-black text-white bg-teal-600 rounded-lg hover:bg-teal-700 shadow-md flex items-center justify-center gap-2 uppercase tracking-widest transition-transform transform active:scale-95 outline-none">
                        <i data-lucide="download" class="w-4 h-4"></i> EXPORT HD IMAGE
                    </button>
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-sm outline-none">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if(typeof lucide !== 'undefined') lucide.createIcons();

    // Plugin Chart.js agar hasil download PNG tidak transparan (memiliki background putih)
    const customBgPlugin = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart, args, options) => {
            const {ctx} = chart;
            ctx.save(); ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = options.color || '#ffffff';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    const ctx = document.getElementById('blk-gt-curve-canvas').getContext('2d');
    if (blkGtChartInstance) blkGtChartInstance.destroy();

    blkGtChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: cogSteps,
            datasets: [
                { label: 'DMT Tonnage (Tonnes)', data: tonnages, type: 'bar', backgroundColor: '#4f46e5', borderRadius: 4, yAxisID: 'y', order: 2 },
                { label: 'Average Ni Grade (%)', data: niGrades, type: 'line', borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 3, tension: 0.4, yAxisID: 'y1', order: 1 },
                { label: 'Average Fe Grade (%)', data: feGrades, type: 'line', borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 3, tension: 0.4, yAxisID: 'y2', order: 0 }
            ]
        },
        plugins: [customBgPlugin], 
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { customCanvasBackgroundColor: { color: '#f8fafc' }, legend: { position: 'top', align: 'end' } },
            scales: {
                x: { title: { display: true, text: 'NICKEL CUT-OFF GRADE (%)', font: {weight: '900', size: 12} } },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'DMT TONNAGE', color: '#4f46e5', font: {weight: 'bold'} } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Ni GRADE (%)', color: '#047857', font: {weight: 'bold'} }, grid: { drawOnChartArea: false } },
                y2: { type: 'linear', position: 'right', title: { display: true, text: 'Fe GRADE (%)', color: '#b91c1c', font: {weight: 'bold'} }, grid: { drawOnChartArea: false } }
            }
        }
    });
};

window.downloadBlockGTCurve = function() {
    if (!blkGtChartInstance) return;
    const link = document.createElement('a');
    link.download = `NiCore_BlockModel_GT_Curve_${new Date().getTime()}.png`;
    link.href = blkGtChartInstance.toBase64Image('image/png', 1.0);
    link.click();
    showToast("Block Model Curve image exported successfully!", "success");
};