// ============================================================================
// 8_WIREFRAME.JS - PURE GEOLOGICAL MODELING (EXPERT EDITION)
// Features: Anti-Jitter, 100x100 Mesh, Power-3 IDW Snapping, Watertight Solids
// Map2D Auto Pit Sync & True Cartesian Translation
// ============================================================================

window.wireframeState = {
    isInitialized: false, zExag: 1.0, colorBy: 'domain',
    layers: {}, holeInstancesData: [], boundaryXY: null
};

let wfScene, wfCamera, wfRenderer, wfControls;
let wfHolesGroup = new THREE.Group();
let wfRaycaster = new THREE.Raycaster();
let wfMouse = new THREE.Vector2();
let wfHoveredId = null;

// --- 1. SAFE STATE GETTER ---
function getSafeState() {
    if (typeof state !== 'undefined') return state;
    if (typeof window.state !== 'undefined') return window.state;
    return null;
}

function getColNames() {
    const st = getSafeState();
    if (!st || !st.compositedData || st.compositedData.length === 0) throw new Error("Data Compositing Kosong!");
    const headers = st.headers || Object.keys(st.compositedData[0]);
    const xCol = st.detectedCoords?.x || headers.find(h => h.toLowerCase() === 'x' || h.toLowerCase().includes('east')) || 'X'; 
    const yCol = st.detectedCoords?.y || headers.find(h => h.toLowerCase() === 'y' || h.toLowerCase().includes('north')) || 'Y';
    const zColOptions = ['z_corrected', 'topo_z', 'elev_corrected', 'elevation', 'elev', 'z'];
    const zCol = headers.find(h => zColOptions.includes(h.toLowerCase())) || st.detectedCoords?.z || 'Z';
    const holeCol = st.coreCols?.holeId || headers.find(h => h.toLowerCase().includes('hole')) || 'Hole_ID';
    const fromCol = st.coreCols?.from || headers.find(h => h.toLowerCase() === 'from') || 'From';
    const toCol = st.coreCols?.to || headers.find(h => h.toLowerCase() === 'to') || 'To';
    const domCol = headers.find(h => h.toLowerCase().includes('domain') || h.toLowerCase().includes('litho') || h.toLowerCase().includes('zone') || h.toLowerCase() === 'ore_class') || 'Geo_Domain';
    return { xCol, yCol, zCol, holeCol, fromCol, toCol, domCol, headers };
}

// --- ANTI-JITTER: LOCAL ORIGIN SHIFT ---
function getSceneOffset() {
    const st = getSafeState();
    if (!st || !st.compositedData || st.compositedData.length === 0) return {x:0, y:0};
    const { xCol, yCol, holeCol } = getColNames();
    const rawGrp = new Map();
    if(st.rawData) st.rawData.forEach(r => { if(!rawGrp.has(r[holeCol])) rawGrp.set(r[holeCol], r); });
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    st.compositedData.forEach(d => {
        const rawHole = rawGrp.get(d[holeCol]);
        const x = parseFloat(d[xCol] || (rawHole ? rawHole[xCol] : NaN));
        const y = parseFloat(d[yCol] || (rawHole ? rawHole[yCol] : NaN));
        if (!isNaN(x) && !isNaN(y)) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
    });
    
    if (minX === Infinity) return {x:0, y:0};
    return { x: minX + (maxX - minX)/2, y: minY + (maxY - minY)/2 };
}

// --- 2. AUTO-OBSERVER ---
setInterval(() => {
    const sel = document.getElementById('wf-target-domain');
    const st = getSafeState();
    
    // PERBAIKAN: Prioritaskan domainedData agar membaca hasil Sub-Domain terbaru
    const sourceData = (st && st.domainedData && st.domainedData.length > 0) ? st.domainedData : 
                       ((st && st.compositedData && st.compositedData.length > 0) ? st.compositedData : null);
    
    if (sel && sourceData) {
        // Ambil semua domain unik (termasuk sub-domain dari kolom Geo_Domain)
        const uniqueDomains = [...new Set(sourceData.map(d => String(d.Geo_Domain || d.Geo_Domain || d.Domain || 'UNKNOWN').trim().toUpperCase()))].filter(Boolean);
        
        // PERBAIKAN: Update dropdown JIKA jumlah opsinya berubah (bukan cuma saat kosong)
        if (sel.options.length !== uniqueDomains.length) {
            // Simpan pilihan user saat ini agar tidak ter-reset
            const currentSelection = sel.value; 
            
            let html = ''; 
            uniqueDomains.forEach(dom => { html += `<option value="${dom}">${dom}</option>`; });
            sel.innerHTML = html;
            
            // Kembalikan pilihan jika masih ada di daftar baru
            if (uniqueDomains.includes(currentSelection)) {
                sel.value = currentSelection;
            }
        }
    }
}, 500);

window.initWireframeUI = function() {
    if (!window.wireframeState.isInitialized) {
        initWireframe3D();
        window.wireframeState.isInitialized = true;
    }
    parseMap2DBoundary(); // Memicu konversi LatLng Map2D ke UTM
    if(window.renderWFHoles) window.renderWFHoles();
};

function initWireframe3D() {
    if (typeof THREE === 'undefined') return;
    const container = document.getElementById('wireframe-canvas-container');
    if (!container) return;
    container.innerHTML = '';
    
    wfScene = new THREE.Scene();
    wfScene.background = new THREE.Color('#0f172a'); 
    wfCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 500000);
    wfCamera.up.set(0, 0, 1);
    wfRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    wfRenderer.localClippingEnabled = true;
    wfRenderer.setPixelRatio(window.devicePixelRatio);
    wfRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(wfRenderer.domElement);
    
    wfControls = new THREE.OrbitControls(wfCamera, wfRenderer.domElement);
    wfControls.enableDamping = true; wfControls.dampingFactor = 0.05;
    
    wfScene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5000, 5000, 10000);
    wfScene.add(dirLight);
    
    const gridHelper = new THREE.GridHelper(5000, 50, 0x334155, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    wfScene.add(gridHelper);
    
    wfScene.add(wfHolesGroup);
    wfCamera.position.set(0, -1000, 1000);
    container.addEventListener('click', window.onWireframeClick);
    animateWireframe();
}

function animateWireframe() {
    requestAnimationFrame(animateWireframe);
    if (wfControls) wfControls.update();
    if (wfRenderer && wfScene && wfCamera) wfRenderer.render(wfScene, wfCamera);
}

// --- 3. BOUNDARY MATH ---
function parseMap2DBoundary() {
    window.wireframeState.boundaryXY = null;
    const st = getSafeState();
    
    // PERBAIKAN: Konversi dari Geografis (Lat/Lng) kembali ke UTM lokal
    if (st && st.activeBoundary && st.activeBoundary.length > 2 && typeof proj4 !== 'undefined') {
        try {
            const utmZ = (st.utmZone || '51s').match(/\d+/)?.[0] || '51';
            const isSouth = (st.utmZone || '51s').toUpperCase().includes('N') ? '' : '+south';
            const projStr = `+proj=utm +zone=${utmZ} ${isSouth} +datum=WGS84 +units=m +no_defs`;
            
            window.wireframeState.boundaryXY = st.activeBoundary.map(ll => {
                // Map2D (Leaflet) nyimpan sebagai [Lat, Lng].
                // proj4.forward butuh input [Lng, Lat] dan mengembalikan [Easting, Northing]
                const [x, y] = proj4(projStr).forward([ll[1], ll[0]]); 
                return { x, y };
            });
            
            // Tutup poligon
            if (window.wireframeState.boundaryXY[0].x !== window.wireframeState.boundaryXY[window.wireframeState.boundaryXY.length-1].x) {
                window.wireframeState.boundaryXY.push({...window.wireframeState.boundaryXY[0]});
            }
        } catch(e) {
            console.error("Gagal parse boundary dari Map2D", e);
        }
    }
}

function getConvexHull(points) {
    if (points.length <= 3) return points;
    const hull = []; let l = 0;
    for (let i = 1; i < points.length; i++) { if (points[i].x < points[l].x) l = i; }
    let p = l, q, count = 0;
    do {
        hull.push(points[p]); q = (p + 1) % points.length;
        for (let i = 0; i < points.length; i++) {
            const orientation = (points[q].y - points[p].y) * (points[i].x - points[q].x) - (points[q].x - points[p].x) * (points[i].y - points[q].y);
            if (orientation < 0) q = i;
        }
        p = q; if(count++ > points.length) break; 
    } while (p !== l);
    if (hull[0].x !== hull[hull.length-1].x || hull[0].y !== hull[hull.length-1].y) hull.push({...hull[0]}); 
    return hull;
}

function isPointInPolygon(px, py, polygon) {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y;
        let xj = polygon[j].x, yj = polygon[j].y;
        let intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

// ==========================================
// 4. TOPOGRAPHY DTM BUILDER
// ==========================================
window.buildTopography = function() {
    const st = getSafeState();
    if (!st || !st.compositedData) return alert("Workspace is empty. Please load data first");
    if (!wfScene) initWireframe3D();
    
    parseMap2DBoundary(); // Ambil batas terbaru

    if(typeof showLoader === 'function') showLoader("Topography Engine", "Interpolating DTM Surface...");

    setTimeout(() => {
        try {
            const res = parseFloat(document.getElementById('wf-res')?.value) || 12.5;
            const isSmooth = document.getElementById('wf-smooth-solid')?.checked;

            const { zCol, xCol, yCol, holeCol } = getColNames();
            const holeMap = new Map();
            st.compositedData.forEach(d => {
                const id = d[holeCol];
                if(!holeMap.has(id)) {
                    const raw = (st.rawData || []).find(r => r[holeCol] === id);
                    const x = parseFloat(d[xCol] || (raw ? raw[xCol] : NaN));
                    const y = parseFloat(d[yCol] || (raw ? raw[yCol] : NaN));
                    const z = parseFloat(d[zCol] || (raw ? raw[zCol] : 0));
                    if(!isNaN(x) && !isNaN(y) && !isNaN(z)) holeMap.set(id, {x, y, z});
                }
            });

            const points = Array.from(holeMap.values());
            if (points.length < 3) throw new Error("Requires a minimum of 3 drillholes.");

            let boundaryPts = window.wireframeState.boundaryXY;
            if (!boundaryPts || boundaryPts.length < 3) boundaryPts = getConvexHull(points);

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            boundaryPts.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
            const marginX = (maxX - minX) * 0.05; const marginY = (maxY - minY) * 0.05;
            minX -= marginX; maxX += marginX; minY -= marginY; maxY += marginY; 

            const cols = 100, rows = 100;
            const resX = (maxX - minX) / (cols - 1);
            const resY = (maxY - minY) / (rows - 1);
            const gridTop = new Float32Array(cols * rows);
            const mask = new Uint8Array(cols * rows);

            for(let i=0; i<cols; i++) {
                for(let j=0; j<rows; j++) {
                    const gx = minX + (i*resX), gy = minY + (j*resY), idx = j*cols+i;
                    
                    // POTONG TEPAT DI GARIS BOUNDARY
                    if (!isPointInPolygon(gx, gy, boundaryPts)) { mask[idx] = 0; continue; }
                    
                    let dists = points.map(p => ({ p, d: Math.sqrt(Math.pow(gx - p.x, 2) + Math.pow(gy - p.y, 2)) }));
                    dists.sort((a, b) => a.d - b.d);
                    const nearest = dists.slice(0, 12); 
                    
                    let minDist = nearest[0].d;
                    let collarPresence = Math.exp(-minDist / 200); 
                    if (collarPresence < 0.55) { mask[idx] = 0; continue; }

                    mask[idx] = 1;
                    let num = 0, den = 0;
                    nearest.forEach(item => {
                        const w = item.d < 0.5 ? 1e12 : 1 / Math.pow(item.d, 3); 
                        num += item.p.z * w; den += w;
                    });
                    if(den > 0) gridTop[idx] = num / den; else mask[idx] = 0;
                }
            }

            buildWFLayer('TOPO', cols, rows, resX, resY, minX, minY, gridTop, null, mask, 'ROOF');
            
            // SIMPAN TOPO KE MEMORI UNTUK KRIGING/BLOCK MODEL
            window.wireframeState.topoGrid = {
                minX: minX, minY: minY, resX: resX, resY: resY,
                cols: cols, rows: rows, top: gridTop, mask: mask
            };
            
            window.renderWFHoles();
            if(typeof showToast === 'function') showToast("DTM Topo generated exactly on Map2D Boundary!", "success");
        } catch(e) { console.error(e); alert(e.message); }
        if(typeof hideLoader === 'function') hideLoader();
    }, 100);
};

// ==========================================
// 5. EXACT DOMAIN SOLID BUILDER
// ==========================================
window.buildDomainSolid = function() {
    const st = getSafeState();
    if (!st || !st.compositedData) return alert("Data kosong");
    if (!wfScene) initWireframe3D();
    
    parseMap2DBoundary(); // Ambil batas Map2D

    const targetEl = document.getElementById('wf-target-domain');
    const target = targetEl ? String(targetEl.value).trim().toUpperCase() : null;
    if(!target) return typeof showToast === 'function' ? showToast("Please select a Target Domain first", "warning") : alert("Pilih Domain!");

    const buildRoof = document.getElementById('chk-roof')?.checked;
    const buildFloor = document.getElementById('chk-floor')?.checked;
    const buildSolid = document.getElementById('chk-solid')?.checked;
    if (!buildRoof && !buildFloor && !buildSolid) return typeof showToast === 'function' ? showToast("Please select at least one layer to generate", "error") : alert("Pilih layer.");

    if(typeof showLoader === 'function') showLoader("Solid Engine", `Building 100x100 precision mesh for ${target}...`);

    setTimeout(() => {
        try {
            const smoothEl = document.getElementById('wf-smooth-solid');
            const applySmooth = smoothEl ? smoothEl.checked : true;
            const { zCol, xCol, yCol, holeCol, fromCol, toCol, domCol } = getColNames();

            const allPointsMap = new Map();
            const validPointsMap = new Map();

            (st.rawData || st.compositedData).forEach(d => {
                const id = d[holeCol];
                if(!allPointsMap.has(id)) {
                    const x = parseFloat(d[xCol]); const y = parseFloat(d[yCol]); const z = parseFloat(d[zCol]);
                    if(!isNaN(x) && !isNaN(y)) allPointsMap.set(id, { id, x, y, zCollar: z });
                }
            });

            st.compositedData.forEach(d => {
                const rowDom = String(d[domCol] || d.Geo_Domain || d.Domain || d.DOMAIN).trim().toUpperCase();
                if(rowDom !== target) return;

                const id = d[holeCol];
                const rawHole = allPointsMap.get(id);
                if (!rawHole) return;

                const from = parseFloat(d[fromCol]) || 0;
                const to = parseFloat(d[toCol]) || 0;

                if(!validPointsMap.has(id)) {
                    validPointsMap.set(id, { x: rawHole.x, y: rawHole.y, zCollar: rawHole.zCollar, minFrom: from, maxTo: to });
                } else {
                    const h = validPointsMap.get(id);
                    if(from < h.minFrom) h.minFrom = from;
                    if(to > h.maxTo) h.maxTo = to;
                }
            });

            const points = Array.from(validPointsMap.values());
            if(points.length < 3) throw new Error(`Hanya ${points.length} bor terdeteksi untuk domain ini.`);

            const barrenHoles = [];
            allPointsMap.forEach((val, key) => { if(!validPointsMap.has(key)) barrenHoles.push(val); });

            let boundaryPts = window.wireframeState.boundaryXY;
            if (!boundaryPts || boundaryPts.length < 3) boundaryPts = getConvexHull(Array.from(allPointsMap.values()));

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            boundaryPts.forEach(p => { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
            const marginX = (maxX - minX) * 0.05; const marginY = (maxY - minY) * 0.05;
            minX -= marginX; maxX += marginX; minY -= marginY; maxY += marginY;

            const cols = 100, rows = 100;
            const resX = (maxX - minX) / (cols - 1);
            const resY = (maxY - minY) / (rows - 1);
            
            let gridTop = new Float32Array(cols * rows), gridBot = new Float32Array(cols * rows);
            const mask = new Uint8Array(cols * rows);

            for(let i=0; i<cols; i++) {
                for(let j=0; j<rows; j++) {
                    const gx = minX + (i*resX), gy = minY + (j*resY), idx = j*cols+i;
                    
                    // POTONG TEPAT DI GARIS BOUNDARY
                    if (!isPointInPolygon(gx, gy, boundaryPts)) { mask[idx] = 0; continue; }
                    
                    let minDistValid = Infinity;
                    points.forEach(p => { let d = Math.pow(gx - p.x, 2) + Math.pow(gy - p.y, 2); if(d < minDistValid) minDistValid = d; });
                    
                    // Nullify jika terlalu dekat dengan Blank Hole
                    if (barrenHoles.length > 0) {
                        let minDistBarren = Infinity;
                        barrenHoles.forEach(p => { let d = Math.pow(gx - p.x, 2) + Math.pow(gy - p.y, 2); if(d < minDistBarren) minDistBarren = d; });
                        if (minDistBarren < minDistValid) { mask[idx] = 0; continue; }
                        if (Math.sqrt(minDistValid) > 200) { mask[idx] = 0; continue; }
                    }
                    
                    mask[idx] = 1;
                    let dists = points.map(p => ({ p, d: Math.pow(gx - p.x, 2) + Math.pow(gy - p.y, 2) }));
                    dists.sort((a, b) => a.d - b.d);
                    const nearest = dists.slice(0, 12);

                    let numT = 0, numB = 0, den = 0;
                    nearest.forEach(item => {
                        const w = item.d < 0.5 ? 1e12 : 1 / Math.pow(item.d, 1.5); 
                        numT += (item.p.zCollar - item.p.minFrom) * w;
                        numB += (item.p.zCollar - item.p.maxTo) * w;
                        den += w;
                    });
                    
                    if (den > 0) {
                        gridTop[idx] = numT / den; gridBot[idx] = numB / den;

                        // --- FITUR BARU: TOPO CLIPPING ---
                        // Memaksa atap domain terpotong sejajar dengan Topografi
                        if (window.wireframeState.topoGrid) {
                            const tg = window.wireframeState.topoGrid;
                            let tx = Math.round((gx - tg.minX) / tg.resX);
                            let ty = Math.round((gy - tg.minY) / tg.resY);
                            if (tx >= 0 && tx < tg.cols && ty >= 0 && ty < tg.rows && tg.mask[ty * tg.cols + tx] === 1) {
                                let topoZ = tg.top[ty * tg.cols + tx];
                                if (gridTop[idx] > topoZ) gridTop[idx] = topoZ; 
                            }
                        }
                        // ---------------------------------

                        if(gridBot[idx] > gridTop[idx]) { let temp = gridTop[idx]; gridTop[idx] = gridBot[idx]; gridBot[idx] = temp; }
                    } else { mask[idx] = 0; }
                }
            }

            if (applySmooth) {
                gridTop = applyLaplacian(gridTop, cols, rows, mask, 1);
                gridBot = applyLaplacian(gridBot, cols, rows, mask, 1);
            }

            // Snap ke titik bor asli (Anti-Jitter)
            points.forEach(p => {
                const i = Math.round((p.x - minX) / resX);
                const j = Math.round((p.y - minY) / resY);
                if(i >= 0 && i < cols && j >= 0 && j < rows) {
                    const idx = j * cols + i;
                    if(mask[idx] === 1) {
                        let actualTop = p.zCollar - p.minFrom;
                        
                        // --- TOPO CLIPPING SAAT SNAPPING ---
                        if (window.wireframeState.topoGrid) {
                            const tg = window.wireframeState.topoGrid;
                            let tx = Math.round((p.x - tg.minX) / tg.resX);
                            let ty = Math.round((p.y - tg.minY) / tg.resY);
                            if (tx >= 0 && tx < tg.cols && ty >= 0 && ty < tg.rows && tg.mask[ty * tg.cols + tx] === 1) {
                                let topoZ = tg.top[ty * tg.cols + tx];
                                if (actualTop > topoZ) actualTop = topoZ;
                            }
                        }
                        // -----------------------------------

                        gridTop[idx] = actualTop;
                        gridBot[idx] = p.zCollar - p.maxTo;
                        
                        // Crossover Prevention (Pastikan lantai tidak melebihi atap akibat topo clip)
                        if(gridBot[idx] > gridTop[idx]) { gridBot[idx] = gridTop[idx] - 0.1; }
                    }
                }
            });

            if (buildRoof) buildWFLayer(target + '_ROOF', cols, rows, resX, resY, minX, minY, gridTop, gridBot, mask, 'ROOF');
            if (buildFloor) buildWFLayer(target + '_FLOOR', cols, rows, resX, resY, minX, minY, gridTop, gridBot, mask, 'FLOOR');
            if (buildSolid) buildWFLayer(target + '_SOLID', cols, rows, resX, resY, minX, minY, gridTop, gridBot, mask, 'SOLID');

            // --- SIMPAN KE DALAM DICTIONARY CANGKANG UNTUK BLOCK MODEL ---
            window.wireframeState.domainGrids = window.wireframeState.domainGrids || {};
            window.wireframeState.domainGrids[target] = {
                minX: minX, minY: minY, resX: resX, resY: resY,
                cols: cols, rows: rows, top: gridTop, bot: gridBot, mask: mask
            };
            // --------------------------------------------------------

            window.renderWFHoles();
            if(typeof showToast === 'function') showToast(`Domain Solid for ${target} generated!`, "success");
        } catch(e) { console.error(e); alert(e.message); }
        if(typeof hideLoader === 'function') hideLoader();
    }, 100);
};

// ... Sisa fungsi (Grid Laplacian, MESH BUILDER, OBJECT UI, EXCEL EXPORT, dll) sama persis seperti kode sebelumnya, karena fungsi matematika sisanya sudah solid ...

function buildGrid(points, boundaryXY, resX, resY, isSmooth) {
    if (points.length === 0) return null;
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    
    if (boundaryXY && boundaryXY.length > 2) {
        boundaryXY.forEach(p => { minX=Math.min(minX, p.x); maxX=Math.max(maxX, p.x); minY=Math.min(minY, p.y); maxY=Math.max(maxY, p.y); });
    } else {
        points.forEach(p => { minX=Math.min(minX, p.x); maxX=Math.max(maxX, p.x); minY=Math.min(minY, p.y); maxY=Math.max(maxY, p.y); });
    }

    minX -= resX*2; maxX += resX*2; minY -= resY*2; maxY += resY*2;
    const cols = Math.ceil((maxX - minX) / resX);
    const rows = Math.ceil((maxY - minY) / resY);
    
    let grid = new Float32Array(cols * rows).fill(NaN);
    let mask = new Uint8Array(cols * rows).fill(0);

    points.forEach(pt => {
        let c = Math.floor((pt.x - minX) / resX);
        let r = Math.floor((pt.y - minY) / resY);
        if(c>=0 && c<cols && r>=0 && r<rows) {
            grid[r*cols + c] = pt.z;
            mask[r*cols + c] = 1;
        }
    });

    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            let px = minX + c*resX + resX/2;
            let py = minY + r*resY + resY/2;
            
            if (boundaryXY && !isPointInPolygon(px, py, boundaryXY)) continue;
            
            mask[r*cols + c] = 1; 
            if (!isNaN(grid[r*cols + c])) continue; 

            let num=0, den=0;
            points.forEach(pt => {
                let distSq = (pt.x - px)**2 + (pt.y - py)**2;
                let w = 1 / Math.max(distSq, 1.0);
                num += pt.z * w; den += w;
            });
            if (den > 0) grid[r*cols + c] = num / den;
        }
    }

    if (isSmooth) {
        grid = applyLaplacian(grid, cols, rows, mask, 3);
    }

    return { grid, mask, cols, rows, minX, minY, resX, resY };
}

function createMeshFromGrid(gridObj, colorHex, opacity, isWireframe) {
    const { grid, mask, cols, rows, minX, minY, resX, resY } = gridObj;
    const geometry = new THREE.BufferGeometry();
    const vertices = [], indices = [];

    const offset = getSceneOffset();

    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            let z = grid[r*cols + c];
            if(isNaN(z) || mask[r*cols+c] === 0) z = 0; 
            vertices.push((minX + c*resX) - offset.x, (minY + r*resY) - offset.y, z);
        }
    }

    for(let r=0; r<rows-1; r++) {
        for(let c=0; c<cols-1; c++) {
            if(mask[r*cols+c] && mask[r*cols+c+1] && mask[(r+1)*cols+c] && mask[(r+1)*cols+c+1]) {
                let tl = r*cols+c, tr = r*cols+c+1, bl = (r+1)*cols+c, br = (r+1)*cols+c+1;
                indices.push(tl, bl, tr); indices.push(tr, bl, br);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ 
        color: colorHex, 
        transparent: opacity < 1.0, 
        opacity: opacity, 
        wireframe: isWireframe, 
        side: THREE.DoubleSide 
    });
    return new THREE.Mesh(geometry, mat);
}

function applyLaplacian(grid, cols, rows, mask, iterations = 1) {
    let currentGrid = new Float32Array(grid);
    for(let iter=0; iter<iterations; iter++) {
        const newGrid = new Float32Array(currentGrid.length);
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const idx = j * cols + i;
                if (mask[idx] === 0) continue;
                let sum = 0, count = 0;
                for(let di=-1; di<=1; di++) {
                    for(let dj=-1; dj<=1; dj++) {
                        const ni = i + di, nj = j + dj;
                        if(ni>=0 && ni<cols && nj>=0 && nj<rows) {
                            const nIdx = nj * cols + ni;
                            if(mask[nIdx] === 1) { sum += currentGrid[nIdx]; count++; }
                        }
                    }
                }
                newGrid[idx] = count > 0 ? sum / count : currentGrid[idx];
            }
        }
        currentGrid = newGrid;
    }
    return currentGrid;
}

function createStitchedSolid(topGridObj, botGridObj, colorHex) {
    const { grid: topG, mask, cols, rows, minX, minY, resX, resY } = topGridObj;
    const botG = botGridObj.grid;

    const geometry = new THREE.BufferGeometry();
    const vertices = [], indices = [];
    const offset = getSceneOffset();

    for(let i=0; i<2; i++) {
        const arr = i===0 ? topG : botG;
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                let z = arr[r*cols + c]; if(isNaN(z) || mask[r*cols+c]===0) z = 0;
                vertices.push((minX + c*resX) - offset.x, (minY + r*resY) - offset.y, z);
            }
        }
    }

    const nPts = cols * rows;
    
    // Roof Indices (CW)
    for(let r=0; r<rows-1; r++) {
        for(let c=0; c<cols-1; c++) {
            if(mask[r*cols+c] && mask[r*cols+c+1] && mask[(r+1)*cols+c] && mask[(r+1)*cols+c+1]) {
                let tl = r*cols+c, tr = r*cols+c+1, bl = (r+1)*cols+c, br = (r+1)*cols+c+1;
                indices.push(tl, bl, tr); indices.push(tr, bl, br);
            }
        }
    }

    // Floor Indices (CCW)
    for(let r=0; r<rows-1; r++) {
        for(let c=0; c<cols-1; c++) {
            if(mask[r*cols+c] && mask[r*cols+c+1] && mask[(r+1)*cols+c] && mask[(r+1)*cols+c+1]) {
                let tl = nPts + r*cols+c, tr = nPts + r*cols+c+1, bl = nPts + (r+1)*cols+c, br = nPts + (r+1)*cols+c+1;
                indices.push(tl, tr, bl); indices.push(tr, br, bl);
            }
        }
    }

    // Stitching Walls 
    for(let r=0; r<rows-1; r++) {
        for(let c=0; c<cols-1; c++) {
            let p1 = r*cols+c, p2 = r*cols+c+1, p3 = (r+1)*cols+c, p4 = (r+1)*cols+c+1;
            
            if(r===0 && mask[p1] && mask[p2]) { indices.push(p1, p2, p1+nPts); indices.push(p2, p2+nPts, p1+nPts); }
            if(r===rows-2 && mask[p3] && mask[p4]) { indices.push(p4, p3, p4+nPts); indices.push(p3, p3+nPts, p4+nPts); }
            if(c===0 && mask[p1] && mask[p3]) { indices.push(p3, p1, p3+nPts); indices.push(p1, p1+nPts, p3+nPts); }
            if(c===cols-2 && mask[p2] && mask[p4]) { indices.push(p2, p4, p2+nPts); indices.push(p4, p4+nPts, p2+nPts); }

            if(mask[p1] && mask[p2] && !mask[p3]) { indices.push(p1, p2, p1+nPts); indices.push(p2, p2+nPts, p1+nPts); }
            if(!mask[p1] && mask[p3] && mask[p4]) { indices.push(p4, p3, p4+nPts); indices.push(p3, p3+nPts, p4+nPts); }
            if(mask[p1] && mask[p3] && !mask[p2]) { indices.push(p3, p1, p3+nPts); indices.push(p1, p1+nPts, p3+nPts); }
            if(!mask[p1] && mask[p2] && mask[p4]) { indices.push(p2, p4, p2+nPts); indices.push(p4, p4+nPts, p2+nPts); }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, flatShading: false });
    return new THREE.Mesh(geometry, mat);
}

function buildWFLayer(id, cols, rows, resX, resY, minX, minY, gridTop, gridBot, mask, mode) {
    if (window.wireframeState.layers[id]) {
        wfScene.remove(window.wireframeState.layers[id].group);
        window.wireframeState.layers[id].group.children.forEach(c => {
            if(c.geometry) c.geometry.dispose(); if(c.material) c.material.dispose();
        });
    }

    const offset = getSceneOffset(); 
    const vertices = [], indices = [];
    const getVIdx = (i, j, isTop) => (j * cols + i) + (isTop ? 0 : cols * rows);
    const isSolid = mode === 'SOLID';

    for (let isTop of [true, false]) {
        const grid = isTop ? gridTop : gridBot;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const z = (mask[j * cols + i] === 1 && grid !== null ? grid[j * cols + i] : 0);
                vertices.push((minX + (i * resX)) - offset.x, (minY + (j * resY)) - offset.y, z);
            }
        }
    }

    const isQuadValid = (i, j) => {
        if(i<0 || i>=cols-1 || j<0 || j>=rows-1) return false;
        return mask[j*cols+i]===1 && mask[j*cols+i+1]===1 && mask[(j+1)*cols+i]===1 && mask[(j+1)*cols+i+1]===1;
    };

    for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
            if (isQuadValid(i, j)) {
                if (mode === 'ROOF' || isSolid || id === 'TOPO') {
                    const t1 = getVIdx(i,j,true), t2 = getVIdx(i+1,j,true), t3 = getVIdx(i,j+1,true), t4 = getVIdx(i+1,j+1,true);
                    indices.push(t1, t2, t3); indices.push(t2, t4, t3);
                }
                if (mode === 'FLOOR' || isSolid) {
                    const b1 = getVIdx(i,j,false), b2 = getVIdx(i+1,j,false), b3 = getVIdx(i,j+1,false), b4 = getVIdx(i+1,j+1,false);
                    indices.push(b1, b3, b2); indices.push(b2, b3, b4);
                }
                if (isSolid) {
                    const t1 = getVIdx(i,j,true), t2 = getVIdx(i+1,j,true), t3 = getVIdx(i,j+1,true), t4 = getVIdx(i+1,j+1,true);
                    const b1 = getVIdx(i,j,false), b2 = getVIdx(i+1,j,false), b3 = getVIdx(i,j+1,false), b4 = getVIdx(i+1,j+1,false);
                    
                    if (!isQuadValid(i, j-1)) { indices.push(t1, b1, t2); indices.push(b1, b2, t2); } 
                    if (!isQuadValid(i, j+1)) { indices.push(t3, t4, b3); indices.push(t4, b4, b3); } 
                    if (!isQuadValid(i-1, j)) { indices.push(t1, t3, b1); indices.push(t3, b3, b1); } 
                    if (!isQuadValid(i+1, j)) { indices.push(t2, b2, t4); indices.push(b2, b4, t4); } 
                }
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();

    let hexCol = 0x64748b; let defOpac = mode === 'SOLID' ? 0.7 : 0.9;
    if(id==='TOPO') { hexCol = 0x854d0e; defOpac = 0.5; } 
    else if(id.includes('ROOF')) { hexCol = 0x0ea5e9; } 
    else if(id.includes('FLOOR')) { hexCol = 0xf43f5e; }
    else if(id.toUpperCase().includes('LIM')) hexCol = 0xd97706; 
    else if(id.toUpperCase().includes('SAP')) hexCol = 0x059669;

    const group = new THREE.Group();
    const meshMat = new THREE.MeshStandardMaterial({ color: hexCol, transparent: true, opacity: defOpac, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, meshMat);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
    
    group.add(mesh); group.add(wire);
    wfScene.add(group);

    window.wireframeState.layers[id] = { id: id, group: group, mesh: mesh, color: '#' + hexCol.toString(16).padStart(6,'0'), opacity: defOpac, visible: true };
    renderObjectManagerUI();

    geometry.computeBoundingSphere();
    if (wfControls && wfCamera && id === 'TOPO') {
        wfControls.target.copy(geometry.boundingSphere.center);
        wfCamera.position.set(geometry.boundingSphere.center.x, geometry.boundingSphere.center.y - 1000, geometry.boundingSphere.center.z + 500);
        wfControls.update();
    }
}

function registerLayer(id, name, threeGroup) {
    if (window.wireframeState.layers[id] && window.wireframeState.layers[id].group) {
        wfScene.remove(window.wireframeState.layers[id].group);
    }
    window.wireframeState.layers[id] = { id, name, group: threeGroup, visible: true };
    wfScene.add(threeGroup);
    updateLayerListUI();
}

function updateLayerListUI() {
    const container = document.getElementById('wf-layer-list');
    if (!container) return;

    const layers = Object.values(window.wireframeState.layers);
    if (layers.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-slate-400 italic py-2">No 3D objects generated yet.</p>';
        return;
    }

    let html = '';
    layers.forEach(lyr => {
        const eye = lyr.visible ? 'eye' : 'eye-off';
        const color = lyr.visible ? 'text-teal-400' : 'text-slate-500';
        html += `
            <div class="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-700">
                <span class="text-[10px] font-bold text-slate-200 uppercase">${lyr.name}</span>
                <div class="flex gap-2">
                    <button onclick="window.toggleWFLayer('${lyr.id}')" class="${color} hover:text-white transition-colors"><i data-lucide="${eye}" class="w-3.5 h-3.5"></i></button>
                    <button onclick="window.deleteWFLayer('${lyr.id}')" class="text-rose-400 hover:text-rose-300 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderObjectManagerUI() {
    const container = document.getElementById('wf-layer-list');
    if(!container) return;
    const layers = Object.values(window.wireframeState.layers);
    if(layers.length === 0) { container.innerHTML = '<p class="text-[10px] text-slate-500 italic py-2">No 3D objects generated yet.</p>'; return; }

    let html = '';
    layers.forEach(l => {
        const eyeIcon = l.visible ? 'eye' : 'eye-off';
        const isSolid = l.id.includes('SOLID');
        const iconType = isSolid ? 'box' : 'mountain';
        const iconCol = isSolid ? 'text-amber-500' : 'text-emerald-400';

        html += `
        <div class="flex flex-col bg-[#0f172a] p-2.5 rounded-lg border border-slate-600 shadow-sm mb-1.5">
            <div class="flex justify-between items-center">
                <span class="text-[10px] font-black text-white uppercase flex items-center gap-1.5"><i data-lucide="${iconType}" class="w-3 h-3 ${iconCol}"></i> ${l.id}</span>
                <div class="flex gap-2 items-center">
                    <input type="color" value="${l.color}" onchange="window.changeWFColor('${l.id}', this.value)" class="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent">
                    <button onclick="window.toggleWFVis('${l.id}')" class="text-slate-400 hover:text-teal-400"><i data-lucide="${eyeIcon}" class="w-4 h-4"></i></button>
                    <button onclick="window.deleteWFLayer('${l.id}')" class="text-rose-400 hover:text-rose-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
            <div class="flex items-center gap-2 mt-2 border-t border-slate-700 pt-1">
                <span class="text-[8px] font-bold text-slate-400 uppercase w-10">Opacity</span>
                <input type="range" min="0.1" max="1" step="0.1" value="${l.opacity}" oninput="window.changeWFOpacity('${l.id}', this.value)" class="w-full h-1.5 bg-slate-600 accent-teal-500 rounded appearance-none cursor-pointer">
            </div>
        </div>`;
    });
    container.innerHTML = html;
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.toggleWFVis = function(id) { const l = window.wireframeState.layers[id]; if(!l) return; l.visible = !l.visible; l.group.visible = l.visible; renderObjectManagerUI(); };
window.deleteWFLayer = function(id) { const l = window.wireframeState.layers[id]; if(!l) return; wfScene.remove(l.group); delete window.wireframeState.layers[id]; renderObjectManagerUI(); };
window.changeWFColor = function(id, col) { const l = window.wireframeState.layers[id]; if(!l) return; l.color = col; l.mesh.material.color.set(col); };
window.changeWFOpacity = function(id, op) { const l = window.wireframeState.layers[id]; if(!l) return; l.opacity = op; l.mesh.material.opacity = op; };
window.updateWFScene = function() { 
    const el = document.getElementById('wf-z-exag');
    window.wireframeState.zExag = el ? parseFloat(el.value) : 1; 
    if (wfScene) { wfScene.scale.set(1, 1, window.wireframeState.zExag); wfScene.updateMatrixWorld(true); }
};
window.toggleWFLayer = function(id) {
    const lyr = window.wireframeState.layers[id];
    if (!lyr) return;
    lyr.visible = !lyr.visible;
    if (lyr.visible) wfScene.add(lyr.group);
    else wfScene.remove(lyr.group);
    updateLayerListUI();
};
window.toggleObjectManager = function() {
    const list = document.getElementById('wf-layer-list');
    const chevron = document.getElementById('wf-manager-chevron');
    if (list.style.maxHeight === '0px') {
        list.style.maxHeight = '500px'; list.style.opacity = '1';
        if(chevron) chevron.setAttribute('data-lucide', 'chevron-up');
    } else {
        list.style.maxHeight = '0px'; list.style.opacity = '0';
        if(chevron) chevron.setAttribute('data-lucide', 'chevron-down');
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

function getGradeColorHex(val, min, max) {
    if(isNaN(val)) return 0x94a3b8; 
    let pct = (val - min) / (max - min || 1);
    pct = Math.max(0, Math.min(1, pct));
    const hue = (1 - pct) * 240; return new THREE.Color(`hsl(${hue}, 100%, 50%)`).getHex();
}

function getDomainColorHex(dom) {
    const upDom = String(dom).trim().toUpperCase();
    if (upDom.includes('LIM')) return 0xb45309; if (upDom.includes('SAP')) return 0x10b981; 
    if (upDom.includes('BRK') || upDom.includes('BED')) return 0x1e293b; return 0x94a3b8; 
}

window.renderWFHoles = function() {
    const st = getSafeState();
    if (!wfScene || !st.compositedData) return;
    
    while(wfHolesGroup.children.length > 0) {
        const c = wfHolesGroup.children[0]; wfHolesGroup.remove(c);
        if (c.geometry) c.geometry.dispose(); 
        if (c.material) { if(c.material.map) c.material.map.dispose(); c.material.dispose(); }
    }

    const cByEl = document.getElementById('wf-color-by');
    const colorBy = cByEl ? cByEl.value : 'domain';
    const { xCol, yCol, zCol, holeCol, fromCol, toCol, domCol, headers } = getColNames();

    const compGrp = new Map();
    st.compositedData.forEach(d => { const id=d[holeCol]; if(id){ if(!compGrp.has(id)) compGrp.set(id,[]); compGrp.get(id).push(d); } });
    const rawGrp = new Map();
    if(st.rawData) st.rawData.forEach(r => { if(!rawGrp.has(r[holeCol])) rawGrp.set(r[holeCol], r); });

    // --- HELPER: FUNGSI SENSOR TOP-CUT ---
    const applyTopCut = (val, elName, domainName) => {
        if (isNaN(val)) return val;
        const statObj = st.edaStats ? st.edaStats.find(s => s.Domain === domainName) : null;
        if (statObj) {
            const cutKey = Object.keys(statObj).find(key => key.toLowerCase() === `${elName.toLowerCase()}_topcut98`);
            if (cutKey && statObj[cutKey]) {
                const limit = parseFloat(statObj[cutKey]);
                if (val > limit) return limit;
            }
        }
        return val;
    };

    // Hitung Min/Max Grade (Sudah memperhitungkan Top-Cut agar skala warna akurat)
    let minGrade = Infinity, maxGrade = -Infinity;
    let attrCol = '';
    if (colorBy !== 'domain') {
        // PERBAIKAN: Menggunakan pencarian eksak (===) bukan .includes() agar tidak salah mendeteksi kolom 'Finish Drilling'
        attrCol = headers.find(h => h.toLowerCase() === colorBy.toLowerCase()) || colorBy;
        st.compositedData.forEach(d => { 
            const dDomain = d[domCol] || d.Geo_Domain || 'UNKNOWN';
            let val = parseFloat(d[attrCol]); 
            if(!isNaN(val)) { 
                val = applyTopCut(val, attrCol, dDomain); // Terapkan Top-Cut
                minGrade=Math.min(minGrade,val); 
                maxGrade=Math.max(maxGrade,val); 
            } 
        });
    }

    let totalIntervals = 0; compGrp.forEach(arr => totalIntervals += arr.length);
    
    const cylGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.0, 8); 
    cylGeo.rotateX(Math.PI / 2); 
    cylGeo.translate(0, 0, -0.5); 
    cylGeo.computeVertexNormals();

    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
    const instMesh = new THREE.InstancedMesh(cylGeo, tubeMat, totalIntervals);
    instMesh.frustumCulled = false;
    
    const dummy = new THREE.Object3D(), colorObj = new THREE.Color();
    let idx = 0; window.wireframeState.holeInstancesData = [];

    const offset = getSceneOffset();

    compGrp.forEach((intervals, hId) => {
        const rawHole = rawGrp.get(hId);
        const x = parseFloat(intervals[0][xCol] || (rawHole ? rawHole[xCol] : NaN));
        const y = parseFloat(intervals[0][yCol] || (rawHole ? rawHole[yCol] : NaN));
        let zCollar = parseFloat(intervals[0][zCol] || (rawHole ? rawHole[zCol] : 0));

        if (isNaN(x) || isNaN(y)) return;

        intervals.forEach(layer => {
            const from = parseFloat(layer[fromCol]) || 0;
            const to = parseFloat(layer[toCol]) || 0;
            const dDomain = layer[domCol] || layer.Geo_Domain || layer.Domain || 'UNKNOWN';
            
            // Dapatkan nilai elemen dan terapkan Top-Cut
            let colorVal = 0;
            if (colorBy !== 'domain') {
                colorVal = applyTopCut(parseFloat(layer[attrCol]), attrCol, dDomain);
            }

            let hex = colorBy === 'domain' ? getDomainColorHex(dDomain) : getGradeColorHex(colorVal, minGrade, maxGrade);
            colorObj.setHex(hex);

            dummy.position.set(x - offset.x, y - offset.y, zCollar - from);
            dummy.scale.set(1, 1, Math.max(0.01, to - from));
            dummy.rotation.set(0, 0, 0); 
            dummy.updateMatrix();

            instMesh.setMatrixAt(idx, dummy.matrix);
            instMesh.setColorAt(idx, colorObj);

            // Simpan nilai yang SUDAH DI-CAP ke dalam Tooltip
            const cappedNi = applyTopCut(parseFloat(layer.Ni)||0, 'Ni', dDomain);
            const cappedFe = applyTopCut(parseFloat(layer.Fe)||0, 'Fe', dDomain);

            window.wireframeState.holeInstancesData[idx] = { 
                holeId: hId, 
                from, 
                to, 
                domain: dDomain, 
                ni: cappedNi, 
                fe: cappedFe 
            };
            idx++;
        });
    });

    if (idx > 0) {
        instMesh.instanceMatrix.needsUpdate = true;
        if(instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
        wfHolesGroup.add(instMesh);
    }
};

window.onWireframeClick = function(event) {
    const container = document.getElementById('wireframe-canvas-container');
    let tooltip = document.getElementById('three-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div'); tooltip.id = 'three-tooltip';
        tooltip.className = 'fixed z-[9999] bg-[#0f172a]/95 text-white p-3 rounded-lg shadow-2xl backdrop-blur-md border border-slate-600 pointer-events-none hidden transition-opacity';
        document.body.appendChild(tooltip);
    }
    if (!container || !wfCamera || !wfHolesGroup) return;

    const rect = container.getBoundingClientRect();
    wfMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; 
    wfMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    wfRaycaster.setFromCamera(wfMouse, wfCamera);
    
    let instMesh = wfHolesGroup.children.find(c => c.isInstancedMesh);
    if (instMesh) {
        const intersects = wfRaycaster.intersectObject(instMesh);
        if (intersects.length > 0) {
            const iId = intersects[0].instanceId;
            const data = window.wireframeState.holeInstancesData[iId];
            if (data) {
                tooltip.innerHTML = `<div class="font-bold text-teal-400 border-b border-slate-600 pb-1 mb-1 tracking-widest uppercase">${data.holeId}</div><div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]"><span class="text-slate-400">Depth:</span> <span class="font-mono text-right">${data.from.toFixed(1)} - ${data.to.toFixed(1)}m</span><span class="text-slate-400">Domain:</span> <span class="font-bold text-right text-emerald-400">${data.domain}</span><span class="text-slate-400">Ni:</span> <span class="font-mono font-bold text-right ${data.ni > 1.5 ? 'text-rose-400' : 'text-slate-200'}">${data.ni.toFixed(2)}%</span></div>`;
            }
            tooltip.classList.remove('hidden'); 
            tooltip.style.left = (event.clientX + 15) + 'px'; 
            tooltip.style.top = (event.clientY + 15) + 'px'; 
        } else { 
            // Sembunyikan jika klik di area kosong
            tooltip.classList.add('hidden'); 
        }
    }
};

// ==========================================
// DXF EXPORT ENGINE (ASCII 3DFACE)
// ==========================================

window.openDXFExportModal = function() {
    const layers = Object.values(window.wireframeState.layers);
    if (layers.length === 0) {
        if(typeof showToast === 'function') showToast("No 3D objects available to export.", "warning");
        else alert("No 3D objects available to export.");
        return;
    }

    const container = document.getElementById('dxf-layer-list');
    container.innerHTML = '';
    
    layers.forEach(l => {
        container.innerHTML += `
            <label class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-teal-50 transition-colors shadow-sm">
                <input type="checkbox" name="dxf-cb" value="${l.id}" checked class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500">
                <span class="text-xs font-bold text-slate-700 uppercase">${l.id}</span>
            </label>
        `;
    });

    document.getElementById('modal-export-dxf').classList.remove('hidden');
};

window.closeDXFExportModal = function() {
    document.getElementById('modal-export-dxf').classList.add('hidden');
};

window.exportSelectedDXF = function() {
    const checkboxes = document.querySelectorAll('input[name="dxf-cb"]:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one layer to export.");
        return;
    }

    let dxfContent = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    const offset = getSceneOffset();
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    selectedIds.forEach(id => {
        const layer = window.wireframeState.layers[id];
        if (!layer || !layer.mesh || !layer.mesh.geometry) return;

        const geometry = layer.mesh.geometry;
        const positions = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;

        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i] * 3, i2 = indices[i+1] * 3, i3 = indices[i+2] * 3;

                // MENGEMBALIKAN KE KOORDINAT ASLI (UTM REAL-WORLD)
                const x1 = positions[i1] + offset.x, y1 = positions[i1+1] + offset.y, z1 = positions[i1+2];
                const x2 = positions[i2] + offset.x, y2 = positions[i2+1] + offset.y, z2 = positions[i2+2];
                const x3 = positions[i3] + offset.x, y3 = positions[i3+1] + offset.y, z3 = positions[i3+2];

                dxfContent += `0\n3DFACE\n8\n${id}\n`;
                dxfContent += `10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n${z1.toFixed(3)}\n`;
                dxfContent += `11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n${z2.toFixed(3)}\n`;
                dxfContent += `12\n${x3.toFixed(3)}\n22\n${y3.toFixed(3)}\n32\n${z3.toFixed(3)}\n`;
                dxfContent += `13\n${x3.toFixed(3)}\n23\n${y3.toFixed(3)}\n33\n${z3.toFixed(3)}\n`; 
            }
        }
    });

    dxfContent += "0\nENDSEC\n0\nEOF\n";
    
    const blob = new Blob([dxfContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NiCore_Geomodel_${new Date().getTime()}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    window.closeDXFExportModal();
    if(typeof showToast === 'function') showToast("DXF Exported Successfully!", "success");
};

// ============================================================================
// FINAL DATA PACK EXPORT ENGINE (UPGRADED)
// ============================================================================

window.exportFinalDataPack = function() {
    const state = getSafeState();
    if (!state || !state.compositedData || state.compositedData.length === 0) {
        if (typeof showToast === 'function') showToast("No final data available to export.", "warning");
        return;
    }

    if (typeof showLoader === 'function') showLoader("Exporting Data", "Generating Smart Final Data Pack Excel...");

    try {
        const wb = XLSX.utils.book_new();
        const { zCol, xCol, yCol, holeCol, fromCol, toCol, domCol, headers } = getColNames();

        // 1. COLLAR
        const collarMap = new Map();
        (state.rawData || state.compositedData).forEach(d => {
            const hid = d[holeCol];
            if(!collarMap.has(hid)) {
                collarMap.set(hid, { Hole_ID: hid, Easting: parseFloat(d[xCol]||0), Northing: parseFloat(d[yCol]||0), Elevation: parseFloat(d[zCol]||0), Max_Depth: parseFloat(d[toCol]||0) });
            } else {
                const curr = collarMap.get(hid); const td = parseFloat(d[toCol] || 0);
                if(td > curr.Max_Depth) curr.Max_Depth = td; 
            }
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(collarMap.values())), "Collar");

        // 2. SURVEY
        const surveyData = Array.from(collarMap.values()).map(c => ({ Hole_ID: c.Hole_ID, Depth: 0, Dip: -90, Azimuth: 0 }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(surveyData), "Survey");

        // --- TAMBAHKAN HELPER INI DI ATAS BLOK GEOLOGY ---
        // Setup nama kolom yang pasti untuk Domain dan Lithology
        const domColName = 'Geo_Domain'; 
        const lithoColName = state.coreCols?.litho || headers.find(h => h.toLowerCase().includes('litho') || h.toLowerCase().includes('rock')) || 'Lithology';

        // Fungsi cerdas untuk melacak Lithology asli dari data lapangan (rawData)
        const getOriginalLitho = (hId, from, to) => {
            if (!state.rawData) return 'UNKNOWN';
            const mid = (from + to) / 2;
            const match = state.rawData.find(r => r[holeCol] === hId && parseFloat(r[fromCol]) <= mid && parseFloat(r[toCol]) > mid);
            return match && match[lithoColName] ? match[lithoColName] : 'UNKNOWN';
        };

        // 3. GEOLOGY (SMART MERGE - DIPERBARUI)
        const geoSummary = [];
        const holesMap = new Map();
        state.compositedData.forEach(d => { const hid = d[holeCol]; if(!holesMap.has(hid)) holesMap.set(hid, []); holesMap.get(hid).push(d); });

        holesMap.forEach((intervals, hid) => {
            intervals.sort((a, b) => parseFloat(a[fromCol] || 0) - parseFloat(b[fromCol] || 0));
            if(intervals.length === 0) return;

            let firstFrom = parseFloat(intervals[0][fromCol] || 0);
            let firstTo = parseFloat(intervals[0][toCol] || 0);
            let firstLitho = getOriginalLitho(hid, firstFrom, firstTo);
            let firstDom = intervals[0][domColName] || 'UNKNOWN';

            let currentStrat = { Hole_ID: hid, From: firstFrom, To: firstTo, Lithology: firstLitho, Domain: firstDom };

            for(let i = 1; i < intervals.length; i++) {
                let row = intervals[i];
                let rowFrom = parseFloat(row[fromCol] || 0), rowTo = parseFloat(row[toCol] || 0);
                let rowDom = row[domColName] || 'UNKNOWN';
                let rowLitho = getOriginalLitho(hid, rowFrom, rowTo);

                // Gabungkan jika Domain DAN Lithology sama, serta kedalaman bersentuhan
                if (rowDom === currentStrat.Domain && rowLitho === currentStrat.Lithology && Math.abs(rowFrom - currentStrat.To) <= 0.01) {
                    currentStrat.To = rowTo; 
                } else {
                    geoSummary.push({ Hole_ID: currentStrat.Hole_ID, From: currentStrat.From.toFixed(2), To: currentStrat.To.toFixed(2), Lithology: currentStrat.Lithology, Domain: currentStrat.Domain });
                    currentStrat = { Hole_ID: hid, From: rowFrom, To: rowTo, Lithology: rowLitho, Domain: rowDom };
                }
            }
            geoSummary.push({ Hole_ID: currentStrat.Hole_ID, From: currentStrat.From.toFixed(2), To: currentStrat.To.toFixed(2), Lithology: currentStrat.Lithology, Domain: currentStrat.Domain });
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(geoSummary), "Geology");

        // 4. ASSAY (DIPERBARUI DENGAN LITHO, DOMAIN & FILTER TOP-CUT)
        const assayData = state.compositedData.map(d => {
            let rFrom = parseFloat(d[fromCol] || 0);
            let rTo = parseFloat(d[toCol] || 0);
            let dDomain = d[domColName] || 'UNKNOWN';
            
            // Panggil memori statistik khusus untuk domain baris ini
            const statObj = state.edaStats ? state.edaStats.find(s => s.Domain === dDomain) : null;
            
            let row = { 
                Hole_ID: d[holeCol], 
                From: rFrom.toFixed(2), 
                To: rTo.toFixed(2),
                Lithology: getOriginalLitho(d[holeCol], rFrom, rTo),
                Domain: dDomain
            };
            
            Object.keys(d).forEach(k => {
                if (['ni', 'fe', 'mgo', 'sio2', 'co', 'al2o3', 'cr2o3'].includes(k.toLowerCase()) || k.toLowerCase().includes('grade')) {
                    let val = parseFloat(d[k]);
                    
                    if (!isNaN(val)) {
                        let finalVal = val;
                        
                        // Proses Top-Cut: Jika ada memori batas atas untuk elemen ini, potong nilainya
                        if (statObj) {
                            const cutKey = Object.keys(statObj).find(key => key.toLowerCase() === `${k.toLowerCase()}_topcut98`);
                            if (cutKey && statObj[cutKey]) {
                                const limit = parseFloat(statObj[cutKey]);
                                if (val > limit) finalVal = limit; // Capping terjadi di sini
                            }
                        }
                        
                        row[k] = parseFloat(finalVal.toFixed(3));
                    } else {
                        row[k] = d[k]; // Biarkan jika kosong / string
                    }
                }
            });
            return row;
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assayData), "Assay");

        // 5. KRIGING / VARIOGRAPHY PARAMS
        if (state.edaStats && state.edaStats.length > 0) {
            const krigingSheet = XLSX.utils.json_to_sheet(state.edaStats);
            XLSX.utils.book_append_sheet(wb, krigingSheet, "Kriging_Params");
        } else {
            const emptyKriging = [{ Status: "No variogram parameters locked. Please run Variography and click 'Save Lock'." }];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emptyKriging), "Kriging_Params");
        }

        XLSX.writeFile(wb, "NiCore_Final_Data_Pack.xlsx");

        if (typeof hideLoader === 'function') hideLoader();
        if (typeof showToast === 'function') showToast("Data Pack Exported Successfully!", "success");

    } catch (err) {
        if (typeof hideLoader === 'function') hideLoader();
        console.error("Export Error:", err);
    }
};

// ============================================================================
// 🚀 INTERACTIVE 3D SLICER FOR WIREFRAME & SURFACES
// ============================================================================
window.wfSlicerState = {
    isActive: false,
    axis: 'y', 
    thickness: 25,
    position: 0,
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    planeFront: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    planeBack: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
};

window.initWFSlicerUI = function() {
    const toggle = document.getElementById('wf-slicer-toggle');
    const axisSel = document.getElementById('wf-slicer-axis');
    const thickInp = document.getElementById('wf-slicer-thickness');
    const posSlider = document.getElementById('wf-slicer-position');
    const btnCam = document.getElementById('btn-wf-slicer-cam');

    if(toggle) toggle.addEventListener('change', (e) => { window.wfSlicerState.isActive = e.target.checked; window.calcWFSlicerBounds(); window.applyWFSlicerToMaterials(); });
    if(axisSel) axisSel.addEventListener('change', (e) => { window.wfSlicerState.axis = e.target.value; window.calcWFSlicerBounds(); });
    if(thickInp) thickInp.addEventListener('input', (e) => { window.wfSlicerState.thickness = parseFloat(e.target.value) || 25; window.updateWFSlicerPlanes(); });
    if(posSlider) posSlider.addEventListener('input', (e) => { window.wfSlicerState.position = parseFloat(e.target.value); window.updateWFSlicerPlanes(); });
    if(btnCam) btnCam.addEventListener('click', window.snapWFSlicerCamera);
};

window.calcWFSlicerBounds = function() {
    if(!window.wfSlicerState.isActive) return;

    let box = new THREE.Box3();
    let hasObj = false;
    
    // Hitung batas dari Topo & Solid
    for(let key in window.wireframeState.layers) {
        let grp = window.wireframeState.layers[key].group;
        if(grp && window.wireframeState.layers[key].visible) {
            let bbox = new THREE.Box3().setFromObject(grp);
            box.union(bbox);
            hasObj = true;
        }
    }
    
    // Hitung batas dari Drillholes
    if(wfHolesGroup && wfHolesGroup.children.length > 0) {
        let bbox = new THREE.Box3().setFromObject(wfHolesGroup);
        box.union(bbox);
        hasObj = true;
    }

    if(!hasObj) return;

    window.wfSlicerState.bounds = {
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z
    };

    const slider = document.getElementById('wf-slicer-position');
    if(slider) {
        let b = window.wfSlicerState.bounds;
        let min = 0, max = 100, start = 0;
        if(window.wfSlicerState.axis === 'x') { min = b.minX; max = b.maxX; start = (b.minX+b.maxX)/2; }
        if(window.wfSlicerState.axis === 'y') { min = b.minY; max = b.maxY; start = (b.minY+b.maxY)/2; }
        if(window.wfSlicerState.axis === 'z') { min = b.minZ; max = b.maxZ; start = (b.minZ+b.maxZ)/2; }
        
        slider.min = min; slider.max = max; slider.step = 1; 
        
        // Jangan timpa posisi jika slider sedang digeser manual
        if (!slider.dataset.initialized || slider.dataset.currentAxis !== window.wfSlicerState.axis) {
            slider.value = start; window.wfSlicerState.position = start;
            slider.dataset.initialized = "true";
            slider.dataset.currentAxis = window.wfSlicerState.axis;
        }
    }
    window.updateWFSlicerPlanes();
};

window.updateWFSlicerPlanes = function() {
    const st = window.wfSlicerState;
    const pos = st.position;
    const halfT = st.thickness / 2;
    
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

    const lbl = document.getElementById('wf-slicer-pos-val');
    if(lbl) lbl.innerText = pos.toFixed(1) + ' m';
    
    window.applyWFSlicerToMaterials();
};

window.applyWFSlicerToMaterials = function() {
    const planes = window.wfSlicerState.isActive ? [window.wfSlicerState.planeFront, window.wfSlicerState.planeBack] : [];
    
    // Potong Topo & Solids
    for(let key in window.wireframeState.layers) {
        let grp = window.wireframeState.layers[key].group;
        if(grp) {
            grp.traverse(child => {
                if(child.isMesh || child.isLineSegments) {
                    if(child.material) {
                        child.material.clippingPlanes = planes;
                        child.material.needsUpdate = true;
                    }
                }
            });
        }
    }
    
    // Potong Drillholes (Silinder Bor)
    if(wfHolesGroup) {
        wfHolesGroup.traverse(child => {
            if(child.isMesh || child.isInstancedMesh) {
                if(child.material) {
                    child.material.clippingPlanes = planes;
                    child.material.needsUpdate = true;
                }
            }
        });
    }
};

window.snapWFSlicerCamera = function() {
    if(!wfCamera || !wfControls) return;
    const st = window.wfSlicerState;
    const pos = st.position;
    const b = st.bounds;
    
    let cx = (b.minX + b.maxX)/2;
    let cy = (b.minY + b.maxY)/2;
    let cz = (b.minZ + b.maxZ)/2;
    let dist = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) * 1.5;

    wfCamera.up.set(0,0,1);

    if(st.axis === 'x') {
        wfCamera.position.set(pos + dist, cy, cz);
        wfControls.target.set(pos, cy, cz);
    } else if(st.axis === 'y') {
        wfCamera.position.set(cx, pos - dist, cz);
        wfControls.target.set(cx, pos, cz);
    } else if(st.axis === 'z') {
        wfCamera.position.set(cx, cy, pos + dist);
        wfCamera.up.set(0,1,0); 
        wfControls.target.set(cx, cy, pos);
    }
    wfControls.update();
};

// Panggil Inisialisasi Otomatis
setTimeout(() => { window.initWFSlicerUI(); }, 1000);