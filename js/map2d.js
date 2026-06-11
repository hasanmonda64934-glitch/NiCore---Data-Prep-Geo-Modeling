// ==========================================
// 2D MAP & ISOPACH ESTIMATION MODULE (LEAFLET WEBGIS)
// PROFESSIONAL ENGLISH VERSION - JORC STANDARD
// Mathematical Fix: DMT-Weighted Sumproduct & Smart Boundary
// ==========================================

let leafletMapInstance = null;
let mapMarkersLayer = null;

function initMap2D() {
    const mapEmpty = document.getElementById('map2d-empty');
    const mapContent = document.getElementById('map2d-content');
    if(mapEmpty) mapEmpty.classList.add('hidden');
    if(mapContent) mapContent.classList.remove('hidden');

    if(!state.compositedData || !Array.isArray(state.compositedData) || state.compositedData.length === 0) {
        renderMap2D(); 
        return;
    }

    if(!state.detectedCoords || !state.detectedCoords.x || !state.detectedCoords.y) {
        showToast("X/Y coordinates not automatically detected. Searching manually...", "info");
    }

    const domSelect = document.getElementById('map2d-domain-select');
    const uniqueDomains = [...new Set(state.compositedData.map(d => d.Geo_Domain))];
    
    let defaultDom = uniqueDomains[0];
    if(uniqueDomains.includes('SAP')) defaultDom = 'SAP';
    else if(uniqueDomains.includes('LIM')) defaultDom = 'LIM';

    if (domSelect) {
        domSelect.innerHTML = uniqueDomains.map(d => `<option value="${d}">${d}</option>`).join('');
        domSelect.value = defaultDom;
    }

    const sizeSelect = document.getElementById('map2d-size-select');
    if (sizeSelect && state.headers && state.headers.length > 0) {
        const structuralDataCols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to, 'Length', 'Geo_Domain', '_id', '_comp_id', 'Lithology', 'SG', 'Ore_Class'];
        const assayCols = state.headers.filter(h => !structuralDataCols.includes(h) && !['X','Y','Z','Easting','Northing','Elevation'].includes(h));
        
        const currentVal = sizeSelect.value;
        sizeSelect.innerHTML = `<option value="thickness">Thickness / Isopach (m)</option>` + 
            assayCols.map(c => `<option value="${c}">${c} Grade</option>`).join('');
            
        if (currentVal && (currentVal === 'thickness' || assayCols.includes(currentVal))) {
            sizeSelect.value = currentVal;
        }
    }

    prepareMap2DData();

    const autoSpacing = detectDominantSpacing();
    const inputX = document.getElementById('map2d-grid-x');
    const inputY = document.getElementById('map2d-grid-y');
    
    if (inputX) inputX.value = autoSpacing;
    if (inputY) inputY.value = autoSpacing;

    renderMap2D(); 
}

window.applyMap2DParams = function() {
    // Karena SG & MC sudah di-inject dari Modul Density, tombol ini hanya trigger ulang grid
    renderMap2D();
    if(typeof showToast === 'function') showToast("Grid Spacing and Evaluation Parameters updated.", "info");
};

function prepareMap2DData() {
    let mapData = [];
    const groupedComp = groupDataByHole(state.compositedData, state.coreCols.holeId);
    const groupedRaw = groupDataByHole(state.rawData, state.coreCols.holeId);
    
    const structuralDataCols = [state.coreCols.holeId, state.coreCols.from, state.coreCols.to, 'Length', 'Geo_Domain', '_id', '_comp_id', 'Lithology', 'SG', 'Ore_Class'];
    const dynamicAssayCols = state.headers.filter(h => !structuralDataCols.includes(h) && !['X','Y','Z','Easting','Northing','Elevation'].includes(h));

    let colX = state.detectedCoords.x;
    let colY = state.detectedCoords.y;
    
    if (!colX || !colY) {
        if(!colX) colX = state.headers.find(h => h.toLowerCase() === 'x' || h.toLowerCase().includes('east'));
        if(!colY) colY = state.headers.find(h => h.toLowerCase() === 'y' || h.toLowerCase().includes('north'));
        state.detectedCoords.x = colX;
        state.detectedCoords.y = colY;
    }

    if (!colX || !colY) return;

    // --- HELPER: FUNGSI SENSOR TOP-CUT ---
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

    groupedComp.forEach((compRows, hole) => {
        const rawRows = groupedRaw.get(hole);
        if(!rawRows || rawRows.length === 0) return;
        
        const rawX = rawRows[0][colX];
        const rawY = rawRows[0][colY];
        if (rawX === undefined || rawY === undefined) return;
        
        const x = parseFloat(rawX);
        const y = parseFloat(rawY);
        if(isNaN(x) || isNaN(y)) return;

        const domMap = new Map();
        compRows.forEach(row => {
            const dom = row.Geo_Domain || 'UNKNOWN';
            if(!domMap.has(dom)) {
                let initObj = { len: 0 };
                dynamicAssayCols.forEach(col => initObj[col] = 0);
                domMap.set(dom, initObj);
            }
            
            const l = parseFloat(row.Length) || 0;
            const d = domMap.get(dom);
            d.len += l;
            
            // SUMPRODUCT TAHAP 1: (Capped Grade * Length)
            dynamicAssayCols.forEach(col => {
                let rawVal = parseFloat(row[col]) || 0;
                let cappedVal = applyTopCut(rawVal, col, dom); // Terapkan pemotongan outlier
                d[col] += cappedVal * l;
            });
        });

        domMap.forEach((data, dom) => {
            if(data.len > 0) {
                let rowObj = { hole: hole, x: x, y: y, domain: dom, thickness: data.len, sg: state.sgParams[dom] || 1.0 };
                // PEMBAGIAN SUMPRODUCT: Total / Sum(Length)
                dynamicAssayCols.forEach(col => {
                    rowObj[col] = data[col] / data.len; 
                });
                mapData.push(rowObj);
            }
        });
    });

    state.map2dData = mapData;
}

function renderMap2D() {
    const mapContainer = document.getElementById('map2d-map');
    if (!mapContainer) return;

    mapContainer.style.minHeight = "600px";
    mapContainer.style.height = "100%";
    mapContainer.style.width = "100%";
    mapContainer.style.display = "block";

    let areaBadge = document.getElementById('map2d-area-badge');
    if (areaBadge) areaBadge.style.display = 'none'; 

    if (!leafletMapInstance) {
        const satLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Satellite' });
        const topoLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, attribution: '© Google Terrain' });
        const blankLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '© CartoDB' });

        leafletMapInstance = L.map('map2d-map', {
            minZoom: 2, maxZoom: 20,
            zoomControl: false, attributionControl: false,
            layers: [satLayer],
            preferCanvas: true 
        }).setView([-2.5489, 118.0148], 5);

        const baseMaps = { "🛰️ Satellite (Google)": satLayer, "⛰️ Topography (Terrain)": topoLayer, "📄 Canvas (Blueprint)": blankLayer };
        L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(leafletMapInstance);
        L.control.zoom({ position: 'bottomright' }).addTo(leafletMapInstance);
        L.control.scale({ metric: true, imperial: false, position: 'bottomright', maxWidth: 150 }).addTo(leafletMapInstance);
        
        mapMarkersLayer = L.layerGroup().addTo(leafletMapInstance);
        leafletMapInstance.idwLayer = null;
        leafletMapInstance.voronoiLayer = null;
        leafletMapInstance.customLegendControl = null; 
        
        leafletMapInstance.boundaryLayer = L.featureGroup().addTo(leafletMapInstance);
        leafletMapInstance.sectionLineLayer = L.featureGroup().addTo(leafletMapInstance);
        leafletMapInstance.projectedHolesCache = []; 

        const UTMControl = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function() {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                container.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                container.style.backdropFilter = 'blur(8px)'; 
                container.style.padding = '10px 12px';
                container.style.borderRadius = '8px';
                container.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.08)';
                container.style.border = '1px solid rgba(255, 255, 255, 0.5)';
                container.style.fontFamily = 'Inter, sans-serif';
                container.style.width = '210px'; 
                L.DomEvent.disableClickPropagation(container);

                const currentMode = state.mapVisualMode || 'bubble';
                const idwDisplay = currentMode === 'idw' ? 'block' : 'none';

                container.innerHTML = `
                    <div style="font-weight: 800; font-size: 10px; color: #334155; margin-bottom: 8px; display: flex; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                        <i data-lucide="layers" style="width: 12px; height: 12px; margin-right: 4px; color: #0d9488;"></i> VISUAL CONTROL
                    </div>
                    <div style="margin-bottom: 8px;">
                        <select id="map-visual-mode" style="width: 100%; padding: 4px 6px; font-size: 10px; font-weight: 700; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; color: #0f172a; cursor: pointer;">
                            <option value="collar" ${currentMode === 'collar' ? 'selected' : ''}>📍 Drill Holes (Base Collar)</option>
                            <option value="bubble" ${currentMode === 'bubble' ? 'selected' : ''}>🫧 Grade/Thickness (Bubble Plot)</option>
                            <option value="idw" ${currentMode === 'idw' ? 'selected' : ''}>🗺️ Grade Heatmap (IDW Interpolation)</option>
                        </select>
                    </div>

                    <div id="idw-settings" style="display: ${idwDisplay}; margin-bottom: 8px; padding-top: 6px; border-top: 1px dashed #cbd5e1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <label style="font-size: 9px; color: #64748b; font-weight: 800; letter-spacing: 0.5px;">GRADE CLASSIFICATION</label>
                            <button id="btn-reset-idw" style="background: none; border: none; color: #ef4444; font-size: 9px; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline;">AUTO RESET</button>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <input type="number" id="map-idw-min" placeholder="Min" value="${state.idwMin !== undefined ? state.idwMin : ''}" step="0.1" style="width: 100%; padding: 4px; font-size: 10px; font-weight: 600; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; text-align: center;">
                            <input type="number" id="map-idw-max" placeholder="Max" value="${state.idwMax !== undefined ? state.idwMax : ''}" step="0.1" style="width: 100%; padding: 4px; font-size: 10px; font-weight: 600; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; text-align: center;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 6px; margin-bottom: 8px; margin-top: 8px;">
                        <div style="flex: 1;">
                            <input type="text" id="map-utm-zone" placeholder="ZONE (e.g. 51S)" value="${state.utmZone || ''}" style="width: 100%; padding: 4px 6px; font-size: 10px; font-weight: 700; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; color: #0f172a; box-sizing: border-box; text-align: center;">
                        </div>
                        <div style="flex: 1;">
                            <select id="map-utm-datum" style="width: 100%; padding: 4px 6px; font-size: 10px; font-weight: 700; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; outline: none; color: #0f172a; box-sizing: border-box;">
                                <option value="WGS84" ${state.utmDatum === 'WGS84' ? 'selected' : ''}>WGS 84</option>
                                <option value="DGN95" ${state.utmDatum === 'DGN95' ? 'selected' : ''}>DGN 95</option>
                            </select>
                        </div>
                    </div>
                    <button id="btn-apply-utm" style="width: 100%; background-color: #0f172a; color: #5eead4; border: none; padding: 6px; font-size: 10px; font-weight: 800; border-radius: 4px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.2s;">
                        APPLY SETTINGS
                    </button>
                `;
                return container;
            }
        });
        leafletMapInstance.addControl(new UTMControl());

        if (leafletMapInstance.pm) {
            leafletMapInstance.pm.addControls({
                position: 'topleft', 
                drawMarker: false, drawCircleMarker: false, 
                drawPolyline: true, drawRectangle: false, drawCircle: false, drawText: false,
                drawPolygon: true, editMode: true, dragMode: true, cutPolygon: false, removalMode: true,
            });

            leafletMapInstance.pm.setPathOptions({ color: '#f43f5e', weight: 2, dashArray: '5, 5', fillColor: '#f43f5e', fillOpacity: 0.1 });
            leafletMapInstance.pm.setGlobalOptions({ layerGroup: leafletMapInstance.boundaryLayer });

            leafletMapInstance.on('pm:create', (e) => {
                if (e.shape === 'Polygon') {
                    leafletMapInstance.boundaryLayer.clearLayers();
                    leafletMapInstance.boundaryLayer.addLayer(e.layer);
                    const latlngs = e.layer.getLatLngs()[0];
                    state.activeBoundary = latlngs.map(ll => [ll.lat, ll.lng]);
                    renderMap2D(); 
                } else if (e.shape === 'Line' || e.shape === 'Polyline') {
                    leafletMapInstance.sectionLineLayer.clearLayers();
                    e.layer.setStyle({ color: '#facc15', weight: 4, dashArray: 'none' });
                    leafletMapInstance.sectionLineLayer.addLayer(e.layer);
                    triggerCrossSectionCalculation(e.layer);
                }
            });

            leafletMapInstance.on('pm:remove', (e) => {
                if (e.layer instanceof L.Polygon) {
                    state.activeBoundary = null;
                    renderMap2D();
                } else if (e.layer instanceof L.Polyline) {
                    const csPanel = document.getElementById('cross-section-panel');
                    if (csPanel) csPanel.style.display = 'none';
                }
            });

            leafletMapInstance.boundaryLayer.on('pm:edit', (e) => {
                if(e.layer instanceof L.Polygon) {
                    const latlngs = e.layer.getLatLngs()[0];
                    state.activeBoundary = latlngs.map(ll => [ll.lat, ll.lng]);
                    renderMap2D();
                }
            });
            leafletMapInstance.sectionLineLayer.on('pm:edit', (e) => {
                if(e.layer instanceof L.Polyline) triggerCrossSectionCalculation(e.layer);
            });
        }

        const coordControl = L.control({ position: 'bottomleft' });
        coordControl.onAdd = function() {
            this._div = L.DomUtil.create('div', 'coord-tracker');
            this._div.style.backgroundColor = 'rgba(15, 23, 42, 0.85)'; 
            this._div.style.backdropFilter = 'blur(6px)'; 
            this._div.style.color = '#f8fafc';
            this._div.style.padding = '8px 18px'; 
            this._div.style.borderRadius = '24px'; 
            this._div.style.fontSize = '12px'; 
            this._div.style.fontFamily = 'monospace';
            this._div.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            this._div.style.border = '1px solid rgba(255,255,255,0.15)';
            this._div.style.marginBottom = '12px'; 
            this._div.style.marginLeft = '12px';
            this._div.innerHTML = "<span style='opacity:0.5;'>Waiting for Coordinates...</span>";
            return this._div;
        };
        coordControl.addTo(leafletMapInstance);

        leafletMapInstance.on('mousemove', function(e) {
            const trackerDiv = document.querySelector('.coord-tracker');
            if (!trackerDiv) return;
            const zoneStr = state.utmZone ? state.utmZone : '51s'; 
            const zoneMatch = zoneStr.match(/\d+/);
            const utmZ = zoneMatch ? zoneMatch[0] : '51';
            const isSouth = zoneStr.toUpperCase().includes('N') ? '' : '+south';
            try {
                const utmProjString = `+proj=utm +zone=${utmZ} ${isSouth} +datum=WGS84 +units=m +no_defs`;
                const [x, y] = proj4(utmProjString).forward([e.latlng.lng, e.latlng.lat]);
                trackerDiv.innerHTML = `<span style="color:#2dd4bf; font-weight:900;">UTM ${zoneStr.toUpperCase()}</span> <span style="margin:0 8px; color:#64748b;">|</span> <span style="color:#cbd5e1;">X:</span> <span style="font-size:13.5px; font-weight:bold; color:#fff;">${x.toFixed(0)}</span> <span style="margin:0 6px; color:#64748b;">,</span> <span style="color:#cbd5e1;">Y:</span> <span style="font-size:13.5px; font-weight:bold; color:#fff;">${y.toFixed(0)}</span>`;
            } catch (err) {
                trackerDiv.innerHTML = `<span style="color:#94a3b8; font-weight:bold;">GPS</span> <span style="margin:0 6px; color:#475569;">|</span> <span style="color:#cbd5e1;">Lat:</span> <span style="font-size:13px;">${e.latlng.lat.toFixed(5)}</span> <span style="margin:0 6px; color:#475569;">,</span> <span style="color:#cbd5e1;">Lng:</span> <span style="font-size:13px;">${e.latlng.lng.toFixed(5)}</span>`;
            }
        });

        setTimeout(() => {
            if(typeof lucide !== 'undefined') lucide.createIcons();
            
            const visMode = document.getElementById('map-visual-mode');
            const idwSettings = document.getElementById('idw-settings');
            if (visMode && idwSettings) {
                visMode.addEventListener('change', (e) => {
                    state.mapVisualMode = e.target.value;
                    idwSettings.style.display = e.target.value === 'idw' ? 'block' : 'none';
                    renderMap2D(); 
                });
            }

            const btnResetIdw = document.getElementById('btn-reset-idw');
            if (btnResetIdw) {
                btnResetIdw.addEventListener('click', () => {
                    state.idwMin = undefined; state.idwMax = undefined;
                    document.getElementById('map-idw-min').value = '';
                    document.getElementById('map-idw-max').value = '';
                    renderMap2D();
                });
            }

            const btnApply = document.getElementById('btn-apply-utm');
            if (btnApply) {
                btnApply.addEventListener('click', () => {
                    const zone = document.getElementById('map-utm-zone').value.trim();
                    if (!zone) return showToast("Please enter UTM Zone first.", "warning");
                    state.utmZone = zone;
                    state.utmDatum = document.getElementById('map-utm-datum').value;
                    
                    const minVal = document.getElementById('map-idw-min').value;
                    const maxVal = document.getElementById('map-idw-max').value;
                    state.idwMin = minVal !== "" ? parseFloat(minVal) : undefined; 
                    state.idwMax = maxVal !== "" ? parseFloat(maxVal) : undefined; 

                    showToast(`Re-rendering Map...`, "success");
                    renderMap2D(); 
                });
            }
        }, 150);

        const resizeObserver = new ResizeObserver(() => {
            if (leafletMapInstance) leafletMapInstance.invalidateSize();
        });
        resizeObserver.observe(mapContainer);
    }

    if (state.activeBoundary && state.activeBoundary.length > 2 && leafletMapInstance.boundaryLayer.getLayers().length === 0) {
        const poly = L.polygon(state.activeBoundary, { color: '#0ea5e9', weight: 3, dashArray: 'none', fillColor: '#0ea5e9', fillOpacity: 0.1 });
        leafletMapInstance.boundaryLayer.addLayer(poly);
        poly.on('pm:edit', (e) => {
            const latlngs = e.target.getLatLngs()[0];
            state.activeBoundary = latlngs.map(ll => [ll.lat, ll.lng]);
            renderMap2D();
        });
    }

    const originalMapData = state.map2dData;
    if (!originalMapData || originalMapData.length === 0) {
        setTimeout(() => { if (leafletMapInstance) leafletMapInstance.invalidateSize(); }, 250);
        return; 
    }
    
    const estMethodElement = document.getElementById('map2d-est-method');
    const estMethod = estMethodElement ? estMethodElement.value : 'grid';
    
    const gridParamsContainer = document.getElementById('map2d-grid-params');
    if (gridParamsContainer) {
        gridParamsContainer.style.display = estMethod === 'grid' ? 'grid' : 'none';
    }

    if (mapMarkersLayer) mapMarkersLayer.clearLayers();
    if (leafletMapInstance.idwLayer) { leafletMapInstance.removeLayer(leafletMapInstance.idwLayer); leafletMapInstance.idwLayer = null; }
    if (leafletMapInstance.voronoiLayer) { leafletMapInstance.removeLayer(leafletMapInstance.voronoiLayer); leafletMapInstance.voronoiLayer = null; }
    if (leafletMapInstance.customLegendControl) { leafletMapInstance.removeControl(leafletMapInstance.customLegendControl); leafletMapInstance.customLegendControl = null; }

    const domSelect = document.getElementById('map2d-domain-select');
    const selectedDomain = domSelect ? domSelect.value : '';
    
    const existingSizeSelect = document.getElementById('map2d-size-select');
    let sizeAttr = existingSizeSelect ? existingSizeSelect.value : (state.lastMapSizeAttr || 'thickness');
    
    if (state.lastMapDomain !== undefined && (state.lastMapDomain !== selectedDomain || state.lastMapSizeAttr !== sizeAttr)) {
        state.idwMin = undefined; state.idwMax = undefined;
        const inputMin = document.getElementById('map-idw-min');
        const inputMax = document.getElementById('map-idw-max');
        if (inputMin) inputMin.value = '';
        if (inputMax) inputMax.value = '';
    }
    state.lastMapDomain = selectedDomain;
    state.lastMapSizeAttr = sizeAttr;

    const spacingX = parseFloat(document.getElementById('map2d-grid-x').value) || 50;
    const spacingY = parseFloat(document.getElementById('map2d-grid-y').value) || 50;
    const aoi = spacingX * spacingY;
    const cogNi = parseFloat(document.getElementById('map2d-cog-ni').value) || 0;

    const utmProjString = `+proj=utm +zone=${(state.utmZone || '51s').match(/\d+/)[0]} ${(state.utmZone || '51s').toUpperCase().includes('N') ? '' : '+south'} +datum=WGS84 +units=m +no_defs`;

    const uniqueHolesMap = new Map();
    originalMapData.forEach(d => {
        const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        if (!uniqueHolesMap.has(spatialKey)) {
            try {
                const [lng, lat] = proj4(utmProjString).inverse([d.x, d.y]);
                uniqueHolesMap.set(spatialKey, { hole: d.hole, x: d.x, y: d.y, lng: lng, lat: lat });
            } catch(e) {}
        }
    });

    let uniqueTurfPoints = [];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;

    uniqueHolesMap.forEach((h, key) => {
        if (h.lat < minLat) minLat = h.lat; if (h.lat > maxLat) maxLat = h.lat;
        if (h.lng < minLng) minLng = h.lng; if (h.lng > maxLng) maxLng = h.lng;
        uniqueTurfPoints.push(turf.point([h.lng, h.lat], { hole: h.hole, spatialKey: key }));
    });

    const fcUnique = turf.featureCollection(uniqueTurfPoints);

    let turfBoundary = null;
    let isAutoBoundary = false;
    let areaHa = 0; 

    if (state.activeBoundary && state.activeBoundary.length > 2) {
        let coords = state.activeBoundary.map(ll => [ll[1], ll[0]]);
        if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
            coords.push([...coords[0]]); 
        }
        turfBoundary = turf.polygon([coords]);
    } else if (uniqueTurfPoints.length > 2 && typeof turf !== 'undefined') {
        const hull = turf.convex(fcUnique);
        if (hull) {
            // PERBAIKAN: Jarak Buffer disamakan 100% dengan Drill Spacing agar ujung tidak terpotong
            const bufferDistKm = (Math.max(spacingX, spacingY) || 50) / 1000;
            turfBoundary = turf.buffer(hull, bufferDistKm, {units: 'kilometers'});
            isAutoBoundary = true;
        }
    }

    if (turfBoundary) areaHa = turf.area(turfBoundary) / 10000;

    let insideUniquePoints = [];
    fcUnique.features.forEach(pt => {
        const isInside = turfBoundary ? turf.booleanPointInPolygon(pt, turfBoundary) : true;
        if (isInside) insideUniquePoints.push(pt);
    });

    const fcInsideUnique = turf.featureCollection(insideUniquePoints);
    let voronoiAreaMap = null; 
    const domColor = getDomainColor(selectedDomain);

    const niCol = Object.keys(originalMapData[0] || {}).find(k => k.toLowerCase() === 'ni') || 'Ni';
    const feCol = Object.keys(originalMapData[0] || {}).find(k => k.toLowerCase() === 'fe') || 'Fe';

    let visualVoronoiFeatures = [];
    if (estMethod === 'voronoi' && insideUniquePoints.length > 2 && typeof turf !== 'undefined') {
        voronoiAreaMap = {};
        try {
            const bbox = [minLng - 0.005, minLat - 0.005, maxLng + 0.005, maxLat + 0.005];
            const voronoiPolygons = turf.voronoi(fcInsideUnique, {bbox: bbox});
            
            voronoiPolygons.features.forEach((poly, i) => {
                if (!poly) return;
                let finalPoly = poly;
                
                if (turfBoundary) {
                    try { finalPoly = turf.intersect(poly, turfBoundary); } catch(err) { finalPoly = null; }
                }
                
                if (finalPoly) {
                    const areaSqMeters = turf.area(finalPoly);
                    const sKey = fcInsideUnique.features[i].properties.spatialKey;
                    const holeId = fcInsideUnique.features[i].properties.hole;
                    voronoiAreaMap[sKey] = areaSqMeters;
                    
                    const domData = originalMapData.find(d => d.hole === holeId && d.domain === selectedDomain);
                    if (domData) {
                        finalPoly.properties = { ...domData };
                        visualVoronoiFeatures.push(finalPoly);
                    }
                }
            });

            leafletMapInstance.voronoiLayer = L.geoJSON(turf.featureCollection(visualVoronoiFeatures), {
                style: function(feature) {
                    const isOre = (feature.properties[niCol] || 0) >= cogNi;
                    return { color: '#ffffff', weight: 2, opacity: 1, fillColor: isOre ? domColor : '#cbd5e1', fillOpacity: isOre ? 0.45 : 0.15 };
                }
            }).addTo(leafletMapInstance);
            
            leafletMapInstance.voronoiLayer.bringToBack(); 
        } catch(e) { console.error("Voronoi render failed:", e); }
    }

    const allSelectedDomainData = originalMapData.filter(d => d.domain === selectedDomain);
    let insideDomainData = [];
    
    allSelectedDomainData.forEach(d => {
        const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        const hInfo = uniqueHolesMap.get(spatialKey);
        if (!hInfo) return;
        const pt = turf.point([hInfo.lng, hInfo.lat]);
        const isInside = turfBoundary ? turf.booleanPointInPolygon(pt, turfBoundary) : true;
        if (isInside) insideDomainData.push(d);
    });

    const vals = insideDomainData.map(p => p[sizeAttr] || 0);
    const dataMaxVal = vals.length > 0 ? Math.max(...vals, 0.001) : 0.001;

    const cMin = state.idwMin !== undefined ? state.idwMin : 0;
    const cMax = state.idwMax !== undefined ? state.idwMax : dataMaxVal;
    const cRange = cMax - cMin;

    let bounds = [];
    leafletMapInstance.projectedHolesCache = []; 

    allSelectedDomainData.forEach(d => {
        const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        const hInfo = uniqueHolesMap.get(spatialKey);
        if (!hInfo) return;

        const latLng = [hInfo.lat, hInfo.lng]; 
        bounds.push(latLng); 
        
        const pt = turf.point([hInfo.lng, hInfo.lat]);
        const isInside = turfBoundary ? turf.booleanPointInPolygon(pt, turfBoundary) : true;

        const radiusPx = Math.max(5, ((d[sizeAttr] || 0) / dataMaxVal) * 20);
        const isOre = (d[niCol] || 0) >= cogNi;
        
        // AMBIL MC DARI MEMORI DENSITY 
        const mc = state.mcParams && state.mcParams[d.domain] !== undefined ? state.mcParams[d.domain] : 35;
        
        const thickness = parseFloat(d.thickness) || 0;
        const sg = parseFloat(d.sg) || 1;
        
        const holeArea = voronoiAreaMap ? (voronoiAreaMap[spatialKey] || 0) : aoi;
        const holeVol = thickness * holeArea; 
        const dmt = holeVol * sg * (1 - (mc / 100)); // DMT Calculation

        const niVal = (d[niCol] || 0);
        const feVal = (d[feCol] || 0);

        const popupContent = `
            <div style="width: 260px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; color: #334155;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px; padding-right: 24px; padding-top: 4px;">
                    <span style="color: #0f766e; font-size: 13px; font-weight: bold; letter-spacing: 0.025em;">${d.hole} ${isInside ? '' : '<span style="font-size: 9px; color: #ef4444; margin-left: 4px;">(Outside Area)</span>'}</span> 
                    <span style="color: #94a3b8; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 9px;">UTM: ${d.x.toFixed(0)}, ${d.y.toFixed(0)}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Domain:</span> 
                        <span style="font-weight: bold; color: ${isInside ? domColor : '#94a3b8'};">${d.domain} <span style="font-size: 9px; margin-left: 4px;">(${isOre?'ORE':'WASTE'})</span></span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Thickness:</span> 
                        <span style="color: #1e293b; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600;">${thickness.toFixed(2)} m</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Ni Grade:</span> 
                        <span style="color: #0d9488; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: bold;">${niVal.toFixed(2)}%</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Fe Grade:</span> 
                        <span style="color: #dc2626; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: bold;">${feVal.toFixed(2)}%</span>
                    </div>
                </div>
                <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Area (AoI):</span> 
                        <span style="color: #1e293b; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600;">${holeArea.toLocaleString('en-US', {maximumFractionDigits: 0})} m²</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">Volume:</span> 
                        <span style="color: #1e293b; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600;">${holeVol.toLocaleString('en-US', {maximumFractionDigits: 0})} BCM</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #64748b; font-weight: 500;">DMT (MC ${mc}%):</span> 
                        <span style="color: #047857; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: bold;">${dmt.toLocaleString('en-US', {maximumFractionDigits: 0})} t</span>
                    </div>
                </div>
            </div>
        `;

        if (isInside) {
            leafletMapInstance.projectedHolesCache.push({ hole: d.hole, latLng: L.latLng(hInfo.lat, hInfo.lng), val: (d[sizeAttr] || 0) });

            if (state.mapVisualMode === 'idw') {
                L.circleMarker(latLng, { radius: 3, color: '#ffffff', weight: 1.5, fillColor: '#0f172a', fillOpacity: 1, pmIgnore: true }).bindPopup(popupContent).addTo(mapMarkersLayer);
            } else if (state.mapVisualMode === 'collar') {
                L.circleMarker(latLng, { radius: 4, color: '#334155', weight: 1.5, fillColor: '#f8fafc', fillOpacity: 0.9, pmIgnore: true }).bindPopup(popupContent).addTo(mapMarkersLayer);
            } else {
                L.circleMarker(latLng, { radius: radiusPx, color: isOre ? domColor : '#94a3b8', weight: isOre ? 2 : 1, fillColor: isOre ? domColor : domColor, fillOpacity: isOre ? 0.75 : 0.25, pmIgnore: true }).bindPopup(popupContent).addTo(mapMarkersLayer);
            }
        } else {
            L.circleMarker(latLng, { radius: 3, color: '#cbd5e1', weight: 1, fillColor: '#f8fafc', fillOpacity: 0.3, pmIgnore: true }).bindPopup(popupContent).addTo(mapMarkersLayer);
        }
    });

    if (!state.mapVisualMode) state.mapVisualMode = 'bubble';

    if (state.mapVisualMode === 'idw' && leafletMapInstance.projectedHolesCache.length > 2) {
        const pts = leafletMapInstance.projectedHolesCache;
        
        let dMinLat = minLat, dMaxLat = maxLat, dMinLng = minLng, dMaxLng = maxLng;
        if (turfBoundary) {
            const bbox = turf.bbox(turfBoundary); 
            dMinLng = bbox[0]; dMinLat = bbox[1]; dMaxLng = bbox[2]; dMaxLat = bbox[3];
        }

        const latPad = (dMaxLat - dMinLat) * 0.15;
        const lngPad = (dMaxLng - dMinLng) * 0.15;
        const cMinLat = dMinLat - latPad, cMaxLat = dMaxLat + latPad, cMinLng = dMinLng - lngPad, cMaxLng = dMaxLng + lngPad;

        const idwBounds = [[cMinLat, cMinLng], [cMaxLat, cMaxLng]];
        const canvas = document.createElement('canvas');
        const gridW = 120; 
        const aspect = (cMaxLat - cMinLat) / (cMaxLng - cMinLng);
        const gridH = Math.round(gridW * aspect);
        canvas.width = gridW; canvas.height = gridH;
        const ctx = canvas.getContext('2d');
        const maxDist = (cMaxLng - cMinLng) * 0.18; 

        for (let x = 0; x < gridW; x++) {
            for (let y = 0; y < gridH; y++) {
                const pLng = cMinLng + (x / gridW) * (cMaxLng - cMinLng);
                const pLat = cMaxLat - (y / gridH) * (cMaxLat - cMinLat); 

                if (turfBoundary) {
                    const pt = turf.point([pLng, pLat]);
                    if (!turf.booleanPointInPolygon(pt, turfBoundary)) { 
                        ctx.fillStyle = 'rgba(0,0,0,0)'; 
                        ctx.fillRect(x, y, 1, 1); 
                        continue; 
                    }
                }

                let num = 0, den = 0, minDist = Infinity;
                for (let p of pts) {
                    const dx = pLng - p.latLng.lng; const dy = pLat - p.latLng.lat;
                    const distSq = dx*dx + dy*dy;
                    if (distSq < minDist) minDist = distSq;
                    if (distSq === 0) { num = p.val; den = 1; break; }
                    const w = 1 / distSq; 
                    num += p.val * w; den += w;
                }

                if (Math.sqrt(minDist) > maxDist) { ctx.fillStyle = 'rgba(0,0,0,0)'; } 
                else {
                    const val = num / den;
                    const norm = cRange === 0 ? 0 : Math.max(0, Math.min(1, (val - cMin) / cRange));
                    const hue = (1 - norm) * 240; 
                    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                }
                ctx.fillRect(x, y, 1, 1);
            }
        }
        
        leafletMapInstance.idwLayer = L.imageOverlay(canvas.toDataURL(), idwBounds, { opacity: 0.65, interactive: false }).addTo(leafletMapInstance);
        leafletMapInstance.idwLayer.bringToBack();
    }

    const allowedElements = ['Ni', 'Fe', 'MgO', 'SiO2', 'Co', 'Al2O3', 'MnO', 'Cr2O3', 'Fe2O3'];
    const assayCols = (state.headers || []).filter(h => allowedElements.includes(h));
    
    let optionsHtml = `<option value="thickness" ${sizeAttr === 'thickness' ? 'selected' : ''}>Thickness / Isopach (m)</option>`;
    assayCols.forEach(c => {
        optionsHtml += `<option value="${c}" ${sizeAttr === c ? 'selected' : ''}>${c} Grade (%)</option>`;
    });

    if (assayCols.length === 0) {
        optionsHtml += `<option value="Ni">Ni Grade (%)</option><option value="Fe">Fe Grade (%)</option>`;
    }

    const LegendControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.backgroundColor = 'rgba(255, 255, 255, 0.95)'; 
            container.style.backdropFilter = 'blur(8px)';
            container.style.padding = '10px 16px'; 
            container.style.borderRadius = '8px'; 
            container.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)'; 
            container.style.border = '1px solid rgba(255, 255, 255, 0.5)';
            L.DomEvent.disableClickPropagation(container);

            const headerHtml = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px; gap: 12px;">
                    <span style="font-weight: 900; color: #0f172a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">COLOR SCALE</span>
                    <select id="map2d-size-select" style="font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 4px; border: 1px solid #cbd5e1; outline: none; background: #f8fafc; color: #334155; cursor: pointer; transition: all 0.2s;">
                        ${optionsHtml}
                    </select>
                </div>
            `;

            if (state.mapVisualMode === 'idw') {
                const q1 = (cMin + cRange * 0.25).toFixed(2); const mid = (cMin + cRange * 0.5).toFixed(2); const q3 = (cMin + cRange * 0.75).toFixed(2);
                container.innerHTML = `
                    <div style="min-width: 280px;">
                        ${headerHtml}
                        <div style="width: 100%; height: 12px; border-radius: 4px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); border: 1px solid rgba(0,0,0,0.1); background: linear-gradient(to right, hsl(240, 100%, 50%), hsl(180, 100%, 50%), hsl(120, 100%, 50%), hsl(60, 100%, 50%), hsl(0, 100%, 50%));"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #334155; font-family: monospace; font-weight: bold; margin-top: 6px;">
                            <span>${cMin.toFixed(2)}</span><span>${q1}</span><span>${mid}</span><span>${q3}</span><span>${cMax.toFixed(2)}</span>
                        </div>
                    </div>`;
            } else if (state.mapVisualMode === 'collar') {
                container.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #334155;">
                        <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid #334155; background-color: #f8fafc;"></div> 
                        <span>Active Drill Collars</span>
                    </div>`;
            } else {
                container.innerHTML = `
                    <div style="min-width: 300px;">
                        ${headerHtml}
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 600; color: #334155;">
                            <div style="display: flex; gap: 12px;">
                                <span style="display: flex; align-items: center; gap: 6px;"><div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid ${domColor}; background-color: ${domColor};"></div> Ore (&ge;${cogNi}%)</span>
                                <span style="display: flex; align-items: center; gap: 6px;"><div style="width: 14px; height: 14px; border-radius: 50%; border: 1px solid #cbd5e1; background-color: ${domColor}33;"></div> Waste (<${cogNi}%)</span>
                            </div>
                            <span style="padding-left: 12px; border-left: 1px solid #cbd5e1; font-weight: 800; color: #0f172a;">Max: ${dataMaxVal.toFixed(2)}</span>
                        </div>
                    </div>`;
            }

            setTimeout(() => {
                const selectEl = document.getElementById('map2d-size-select');
                if (selectEl) {
                    selectEl.addEventListener('change', (e) => {
                        state.lastMapSizeAttr = e.target.value; 
                        state.idwMin = undefined; 
                        state.idwMax = undefined;
                        const inputMin = document.getElementById('map-idw-min');
                        const inputMax = document.getElementById('map-idw-max');
                        if (inputMin) inputMin.value = '';
                        if (inputMax) inputMax.value = '';
                        renderMap2D(); 
                    });
                }
            }, 100);

            return container;
        }
    });
    
    leafletMapInstance.customLegendControl = new LegendControl();
    leafletMapInstance.addControl(leafletMapInstance.customLegendControl);

    const useClassToggle = document.getElementById('map2d-use-class');
    const useClass = useClassToggle ? useClassToggle.checked : false;
    const distMeas = parseFloat(document.getElementById('map2d-class-meas')?.value) || 25;
    const distInd = parseFloat(document.getElementById('map2d-class-ind')?.value) || 50;

    if (leafletMapInstance.classLayer) {
        leafletMapInstance.removeLayer(leafletMapInstance.classLayer);
    }
    leafletMapInstance.classLayer = L.featureGroup().addTo(leafletMapInstance);
    state.resourcePolygons = []; 

    let allInsideData = [];
    let classBuffers = { 'MEASURED': [], 'INDICATED': [], 'INFERRED': [] };

    let uniqueInsideHoles = [];
    uniqueHolesMap.forEach((hInfo, spatialKey) => {
        const pt = turf.point([hInfo.lng, hInfo.lat], { spatialKey: spatialKey, x: hInfo.x, y: hInfo.y });
        const isInside = turfBoundary ? turf.booleanPointInPolygon(pt, turfBoundary) : true;
        if (isInside) uniqueInsideHoles.push(pt);
    });

    let holeClassMap = {}; 
    
    uniqueInsideHoles.forEach(pt => {
        let resClass = 'INFERRED';
        
        if (useClass && uniqueInsideHoles.length > 1) {
            let minDist = Infinity;
            uniqueInsideHoles.forEach(otherPt => {
                if (pt.properties.spatialKey !== otherPt.properties.spatialKey) {
                    const dist = Math.sqrt(Math.pow(pt.properties.x - otherPt.properties.x, 2) + Math.pow(pt.properties.y - otherPt.properties.y, 2));
                    if (dist < minDist) minDist = dist;
                }
            });

            if (minDist <= distMeas) resClass = 'MEASURED';
            else if (minDist <= distInd) resClass = 'INDICATED';
        }
        
        holeClassMap[pt.properties.spatialKey] = resClass;

        if (useClass) {
            const radius = (resClass === 'MEASURED' ? distMeas : (resClass === 'INDICATED' ? distInd : distInd * 1.5)) / 2;
            classBuffers[resClass].push(turf.buffer(pt, radius, { units: 'meters', steps: 8 }));
        }
    });

    originalMapData.forEach(d => {
        const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        if (holeClassMap[spatialKey]) {
            d.resClass = holeClassMap[spatialKey];
            allInsideData.push(d);
        }
    });

    if (useClass) {
        const classStyles = { 
            'MEASURED': { color: '#10b981', label: 'Measured' }, 
            'INDICATED': { color: '#f59e0b', label: 'Indicated' }, 
            'INFERRED': { color: '#ef4444', label: 'Inferred' } 
        };

        for (const [cls, buffers] of Object.entries(classBuffers)) {
            if (buffers.length === 0) continue;
            
            let mergedPolygon;
            try {
                buffers.forEach(b => b.properties = { class: cls });
                const fc = turf.featureCollection(buffers);
                mergedPolygon = turf.dissolve(fc); 
            } catch (err) {
                mergedPolygon = turf.featureCollection(buffers);
            }

            if (turfBoundary) {
                try {
                    let intersectedFeatures = [];
                    turf.flatten(mergedPolygon).features.forEach(feat => {
                        let cut = turf.intersect(feat, turfBoundary);
                        if (cut) intersectedFeatures.push(cut);
                    });
                    if (intersectedFeatures.length > 0) {
                        mergedPolygon = turf.featureCollection(intersectedFeatures);
                    }
                } catch (e) {
                    console.warn("JORC intersection failed, skipping boundary clipping.");
                }
            }

            if (mergedPolygon) {
                L.geoJSON(mergedPolygon, {
                    style: { color: classStyles[cls].color, weight: 2, fillOpacity: 0.15, dashArray: 'none', interactive: false }
                }).addTo(leafletMapInstance.classLayer);
                
                turf.flatten(mergedPolygon).features.forEach(f => {
                    f.properties = { class: cls };
                    state.resourcePolygons.push(f);
                });
            }
        }
        leafletMapInstance.classLayer.bringToFront();
    }
    
    renderMap2DEstimation(allInsideData, aoi, cogNi, voronoiAreaMap, areaHa, isAutoBoundary, useClass);

    setTimeout(() => {
        leafletMapInstance.invalidateSize();
        if (bounds.length > 0 && (!state.activeBoundary || state.activeBoundary.length === 0)) {
            leafletMapInstance.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1.0 });
        }
    }, 250);
}

// ========================================================
// ESTIMATION & GRADE-TONNAGE CURVE RENDERER
// DMT-WEIGHTED CALCULATION FIX 
// ========================================================

function renderMap2DEstimation(dataArray, aoi, cogNi, voronoiAreaMap = null, pitAreaHa = 0, isAutoBoundary = false, useClass = false) {
    const summary = {};
    const estMethodElement = document.getElementById('map2d-est-method');
    const estMethod = estMethodElement ? estMethodElement.value : 'grid';

    state.lastEstimationData = { dataArray, aoi, voronoiAreaMap, discountFactor: 1.0 }; // Discount dihapus dari 2D agar murni JORC In-Situ

    const aoiDisplay = document.getElementById('map2d-aoi-display');
    if (aoiDisplay) {
        if (!document.getElementById('btn-gt-curve')) {
            const btn = document.createElement('button');
            btn.id = 'btn-gt-curve';
            btn.className = "bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-[11px] font-bold shadow-sm transition-all flex items-center gap-1.5 mr-3 uppercase tracking-wider";
            btn.innerHTML = `<i data-lucide="line-chart" class="w-3.5 h-3.5"></i> GRADE-TONNAGE CURVE`;
            btn.onclick = showGradeTonnageCurve;
            aoiDisplay.parentNode.insertBefore(btn, aoiDisplay);
        }

        const pitText = pitAreaHa > 0 ? ` | Pit Area: ${pitAreaHa.toFixed(2)} Ha (${isAutoBoundary ? 'Auto' : 'Manual'})` : '';
        if (estMethod === 'voronoi') {
            aoiDisplay.innerHTML = `<i data-lucide="network" class="w-3.5 h-3.5 inline mr-1"></i>AoI: Dynamic Voronoi Polygons${pitText}`;
            aoiDisplay.className = "text-[11px] bg-slate-800 border border-slate-600 px-2.5 py-1.5 rounded text-teal-400 font-mono tracking-wide";
        } else {
            aoiDisplay.innerHTML = `<i data-lucide="grid" class="w-3.5 h-3.5 inline mr-1"></i>AoI: Static Grid (${aoi.toLocaleString()} m²/hole)${pitText}`;
            aoiDisplay.className = "text-[11px] bg-slate-800 border border-slate-600 px-2.5 py-1.5 rounded text-teal-400 font-mono tracking-wide";
        }
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }

    let classTotals = {
        'MEASURED':  { vol: 0, ton: 0, dmt: 0, ni_ton: 0, fe_ton: 0 },
        'INDICATED': { vol: 0, ton: 0, dmt: 0, ni_ton: 0, fe_ton: 0 },
        'INFERRED':  { vol: 0, ton: 0, dmt: 0, ni_ton: 0, fe_ton: 0 }
    };

    dataArray.forEach(d => {
        const niKey = Object.keys(d).find(k => k.toLowerCase() === 'ni');
        const feKey = Object.keys(d).find(k => k.toLowerCase() === 'fe');
        
        const niVal = niKey ? (parseFloat(d[niKey]) || 0) : 0;
        const feVal = feKey ? (parseFloat(d[feKey]) || 0) : 0;                
        const isOre = niVal >= cogNi;
        const cls = isOre ? 'ORE' : 'WASTE';
        const key = d.domain + '_' + cls;

        if(!summary[key]) summary[key] = { domain: d.domain, cls: cls, holes: 0, thick: 0, ni_ton: 0, fe_ton: 0, ton: 0, vol: 0, dmt: 0 };
        
        const s = summary[key];
        
        // Cerdas: Menarik Moisture Content dari Memori Global Tab 8
        const mc = state.mcParams && state.mcParams[d.domain] !== undefined ? state.mcParams[d.domain] : 35;
        
        const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        const holeArea = voronoiAreaMap ? (voronoiAreaMap[spatialKey] || 0) : aoi;
        
        const vol = (d.thickness * holeArea); 
        const ton = vol * (d.sg || 1); // WMT
        const rowDmt = ton * (1 - (mc / 100)); // DMT
        
        s.holes++; s.thick += d.thickness; s.vol += vol; s.ton += ton; s.dmt += rowDmt;
        
        // PERBAIKAN KRITIS: Sumproduct menggunakan DMT!
        s.ni_ton += (niVal * rowDmt); 
        s.fe_ton += (feVal * rowDmt);

        if (isOre && d.resClass) {
            classTotals[d.resClass].vol += vol;
            classTotals[d.resClass].ton += ton;
            classTotals[d.resClass].dmt += rowDmt;
            classTotals[d.resClass].ni_ton += (niVal * rowDmt);
            classTotals[d.resClass].fe_ton += (feVal * rowDmt);
        }
    });

    const tbody = document.getElementById('map2d-summary-tbody');
    if(!tbody) return; 

    if(Object.keys(summary).length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-slate-500 font-medium">No estimation data to display. Ensure boundary intersects drill holes.</td></tr>`;
        return;
    }

    const order = ['RED_LIM', 'YEL_LIM', 'LIM', 'SOFT_SAP', 'ROCKY_SAP', 'SAP', 'BRK'];
    let domainsPresent = [...new Set(Object.values(summary).map(s => s.domain))].sort((a, b) => {
        let iA = order.indexOf(a); let iB = order.indexOf(b);
        if (iA === -1) iA = 99; if (iB === -1) iB = 99;
        return iA - iB;
    });

    let gtOreVol = 0, gtOreTon = 0, gtOreDmt = 0, gtOreNiTon = 0, gtOreFeTon = 0;
    let html = '';

    domainsPresent.forEach(dom => {
        const oreKey = dom + '_ORE';
        const wstKey = dom + '_WASTE';
        
        [oreKey, wstKey].forEach(key => {
            if(summary[key]) {
                const s = summary[key];
                const avgThick = s.thick / s.holes;
                const avgNi = s.dmt > 0 ? (s.ni_ton / s.dmt) : 0; // Dibagi DMT
                const avgFe = s.dmt > 0 ? (s.fe_ton / s.dmt) : 0; // Dibagi DMT

                if (s.cls === 'ORE') {
                    gtOreVol += s.vol; gtOreTon += s.ton; gtOreDmt += s.dmt; gtOreNiTon += s.ni_ton; gtOreFeTon += s.fe_ton;
                }

                const badgeClass = s.cls === 'ORE' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600';
                const textClass = s.cls === 'ORE' ? 'text-slate-800' : 'text-slate-400';
                const wmtClass = s.cls === 'ORE' ? 'text-amber-800 bg-amber-50/50' : 'text-slate-400';
                const dmtClass = s.cls === 'ORE' ? 'text-emerald-800 bg-emerald-50/50' : 'text-slate-400';
                const niClass = s.cls === 'ORE' ? 'text-teal-700' : 'text-slate-400';
                const feClass = s.cls === 'ORE' ? 'text-red-700' : 'text-slate-400';

                html += `
                    <tr class="hover:bg-teal-50/50 transition-colors">
                        <td class="p-3 border-r border-slate-100 flex items-center gap-2">
                            <span class="px-2 py-1 rounded text-[10px] uppercase font-bold shadow-sm ${getDomainBadgeClass(dom)}">${dom}</span>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-black ${badgeClass}">${s.cls}</span>
                        </td>
                        <td class="p-3 border-r border-slate-100 font-mono text-center ${textClass}">${s.holes}</td>
                        <td class="p-3 border-r border-slate-100 font-mono text-right ${textClass}">${avgThick.toFixed(2)}</td>
                        <td class="p-3 border-r border-slate-100 font-mono text-right ${textClass}">${s.vol.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                        <td class="p-3 border-r border-slate-100 font-mono text-right font-bold ${wmtClass}">${s.ton.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                        <td class="p-3 border-r border-slate-100 font-mono text-right font-bold ${dmtClass}">${s.dmt.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                        <td class="p-3 border-r border-slate-100 font-mono text-right font-bold ${niClass}">${avgNi.toFixed(2)}</td>
                        <td class="p-3 font-mono text-right font-semibold ${feClass}">${avgFe.toFixed(2)}</td>
                    </tr>
                `;
            }
        });
    });

    const gtOreAvgNi = gtOreDmt > 0 ? (gtOreNiTon / gtOreDmt) : 0;
    const gtOreAvgFe = gtOreDmt > 0 ? (gtOreFeTon / gtOreDmt) : 0;

    const totalHtml = `
        <tr class="bg-slate-800 text-white font-bold border-t-2 border-slate-900">
            <td class="p-3 uppercase tracking-widest text-xs border-r border-slate-700">TOTAL ORE (\u2265${cogNi}%) <span class="text-[9px] text-amber-400 block font-normal">Dry Basis Interpolation</span></td>
            <td class="p-3 border-r border-slate-700 font-mono text-center">-</td>
            <td class="p-3 border-r border-slate-700 font-mono text-right">-</td>
            <td class="p-3 border-r border-slate-700 font-mono text-right">${gtOreVol.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
            <td class="p-3 border-r border-slate-700 font-mono text-right text-amber-400">${gtOreTon.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
            <td class="p-3 border-r border-slate-700 font-mono text-right text-emerald-400">${gtOreDmt.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
            <td class="p-3 border-r border-slate-700 font-mono text-right text-teal-400">${gtOreAvgNi.toFixed(2)}</td>
            <td class="p-3 font-mono text-right text-red-400">${gtOreAvgFe.toFixed(2)}</td>
        </tr>
    `;

    let classHtml = '';
    if (useClass) {
        const renderSubRow = (label, colorClass, data) => {
            if (data.ton === 0) return '';
            const avgNi = data.dmt > 0 ? (data.ni_ton / data.dmt) : 0;
            const avgFe = data.dmt > 0 ? (data.fe_ton / data.dmt) : 0;
            return `
            <tr class="bg-${colorClass}-50 text-${colorClass}-900 font-bold border-t border-${colorClass}-200">
                <td class="p-3 uppercase tracking-widest text-[10px] border-r border-${colorClass}-200 pl-6">&#x2514; ${label}</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-center">-</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-right">-</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-right">${data.vol.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-right">${data.ton.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-right text-${colorClass}-700">${data.dmt.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                <td class="p-3 border-r border-${colorClass}-200 font-mono text-right">${avgNi.toFixed(2)}</td>
                <td class="p-3 font-mono text-right">${avgFe.toFixed(2)}</td>
            </tr>`;
        };

        classHtml += renderSubRow('MEASURED', 'emerald', classTotals['MEASURED']);
        classHtml += renderSubRow('INDICATED', 'amber', classTotals['INDICATED']);
        classHtml += renderSubRow('INFERRED', 'rose', classTotals['INFERRED']);
    }

    tbody.innerHTML = html + totalHtml + classHtml;
}

// ========================================================
// GRADE-TONNAGE CURVE ENGINE
// ========================================================
let gtChartInstance = null;
function showGradeTonnageCurve() {
    if (!state.lastEstimationData || !state.lastEstimationData.dataArray || state.lastEstimationData.dataArray.length === 0) {
        showToast("Perform Area & Tonnage calculation first.", "warning"); return;
    }

    const { dataArray, aoi, voronoiAreaMap, discountFactor } = state.lastEstimationData;
    const niKey = Object.keys(dataArray[0] || {}).find(k => k.toLowerCase() === 'ni');
    const feKey = Object.keys(dataArray[0] || {}).find(k => k.toLowerCase() === 'fe');

    if (!niKey) return;

    let minNi = Infinity, maxNi = -Infinity;
    dataArray.forEach(d => {
        let val = parseFloat(d[niKey]);
        if (!isNaN(val)) { if (val < minNi) minNi = val; if (val > maxNi) maxNi = val; }
    });

    if (minNi === Infinity) { minNi = 0.5; maxNi = 2.0; }
    let startCog = Math.max(0, Math.floor(minNi * 10) / 10);
    let endCog = Math.ceil(maxNi * 10) / 10;
    
    let step = 0.1;
    if ((endCog - startCog) / step > 25) step = 0.2; 

    const cogSteps = [], tonnages = [], niGrades = [], feGrades = [];
    for (let i = startCog; i <= endCog + 0.01; i += step) cogSteps.push(Number(i.toFixed(2)));

    cogSteps.forEach(cog => {
        let totalDMT = 0, totalWMT = 0, sumNiTon = 0, sumFeTon = 0;
        dataArray.forEach(d => {
            const niVal = parseFloat(d[niKey]) || 0;
            const feVal = feKey ? (parseFloat(d[feKey]) || 0) : 0;
            if (niVal >= cog) {
                const mc = state.mcParams && state.mcParams[d.domain] !== undefined ? state.mcParams[d.domain] : 35;
                const spatialKey = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
                const holeArea = voronoiAreaMap ? (voronoiAreaMap[spatialKey] || 0) : aoi;
                
                const vol = (d.thickness * holeArea) * discountFactor; 
                const wmt = vol * (d.sg || 1); 
                const dmt = wmt * (1 - (mc / 100)); 
                
                totalDMT += dmt; totalWMT += wmt;
                // BUG FIX: Grade x DMT
                sumNiTon += (niVal * dmt); sumFeTon += (feVal * dmt);
            }
        });

        const avgNi = totalDMT > 0 ? (sumNiTon / totalDMT) : 0;
        const avgFe = totalDMT > 0 ? (sumFeTon / totalDMT) : 0;

        tonnages.push(Number(totalDMT.toFixed(0)));
        niGrades.push(Number(avgNi.toFixed(2)));
        feGrades.push(Number(avgFe.toFixed(2)));
    });

    const modalId = 'gt-curve-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-fade-in-up p-4 overflow-y-auto';
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl flex flex-col border border-slate-700 my-auto">
            <div class="bg-[#0f172a] px-6 py-4 flex justify-between items-center shadow-md shrink-0">
                <h3 class="text-white font-black text-lg flex items-center gap-3 tracking-wide">
                    <i data-lucide="line-chart" class="w-6 h-6 text-teal-400"></i> ECONOMIC EVALUATION CURVE (GRADE VS TONNAGE)
                </h3>
                <button onclick="document.getElementById('${modalId}').remove()" class="text-rose-200 hover:text-white bg-rose-500/20 hover:bg-rose-500 rounded p-1.5 transition-all">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <div class="p-6 bg-white relative w-full h-[65vh] min-h-[500px]">
                <canvas id="gt-curve-canvas"></canvas>
            </div>
            <div class="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center rounded-b-xl shrink-0">
                <p class="text-xs text-slate-500 font-medium">*X-Axis (COG) automatically adjusted based on Ni min (${startCog}%) to max (${endCog}%).</p>
                <div class="flex gap-3">
                    <button onclick="downloadGTCurve()" class="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2 uppercase tracking-widest transition-transform transform active:scale-95">
                        <i data-lucide="download" class="w-4 h-4"></i> DOWNLOAD HD IMAGE (.PNG)
                    </button>
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-5 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shadow-sm">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if(typeof lucide !== 'undefined') lucide.createIcons();

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

    const ctx = document.getElementById('gt-curve-canvas').getContext('2d');
    if (gtChartInstance) gtChartInstance.destroy();

    gtChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: cogSteps,
            datasets: [
                { label: 'DMT Tonnage (Ton)', data: tonnages, type: 'bar', backgroundColor: '#3949ab', borderRadius: 4, yAxisID: 'y', order: 2 },
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
                y: { type: 'linear', position: 'left', title: { display: true, text: 'DMT TONNAGE', color: '#3949ab' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Ni GRADE (%)', color: '#047857' }, grid: { drawOnChartArea: false } },
                y2: { type: 'linear', position: 'right', title: { display: true, text: 'Fe GRADE (%)', color: '#b91c1c' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function downloadGTCurve() {
    if (!gtChartInstance) return;
    const link = document.createElement('a');
    link.download = `NiCore_Grade_Tonnage_Curve_${new Date().getTime()}.png`;
    link.href = gtChartInstance.toBase64Image('image/png', 1.0);
    link.click();
    showToast("HD Curve image downloaded successfully!", "success");
}

function toggleMapFullscreen() {
    const panel = document.getElementById('map2d-chart-panel');
    if (!document.fullscreenElement) { if (panel.requestFullscreen) panel.requestFullscreen(); } 
    else { if (document.exitFullscreen) document.exitFullscreen(); }
}

document.addEventListener('fullscreenchange', () => {
    const icon = document.getElementById('map2d-fs-icon');
    const panel = document.getElementById('map2d-chart-panel');
    if (document.fullscreenElement) {
        if(icon) icon.setAttribute('data-lucide', 'minimize');
        panel.classList.replace('p-4', 'p-8');
    } else {
        if(icon) icon.setAttribute('data-lucide', 'maximize');
        panel.classList.replace('p-8', 'p-4'); 
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
    setTimeout(() => { if (leafletMapInstance) leafletMapInstance.invalidateSize(); }, 350);
});

// ========================================================
// STRATIGRAPHIC SECTION & EXPORT ENGINE
// ========================================================
function triggerCrossSectionCalculation(polylineLayer) {
    if (!leafletMapInstance.projectedHolesCache || leafletMapInstance.projectedHolesCache.length === 0) return;
    const lineLatLngs = polylineLayer.getLatLngs();
    if (!lineLatLngs || lineLatLngs.length < 2) return;

    const selectedHolesInfo = [];
    const bufferPx = 15; 
    leafletMapInstance.projectedHolesCache.forEach(hole => {
        const hp = leafletMapInstance.latLngToLayerPoint(hole.latLng);
        let isHit = false, bestDistAlongLine = 0, cumulativeDistMeters = 0;

        for (let i = 0; i < lineLatLngs.length - 1; i++) {
            const ll1 = lineLatLngs[i], ll2 = lineLatLngs[i+1];
            const lp1 = leafletMapInstance.latLngToLayerPoint(ll1), lp2 = leafletMapInstance.latLngToLayerPoint(ll2);
            const l2 = Math.pow(lp1.x - lp2.x, 2) + Math.pow(lp1.y - lp2.y, 2);
            let t = l2 === 0 ? 0 : ((hp.x - lp1.x) * (lp2.x - lp1.x) + (hp.y - lp1.y) * (lp2.y - lp1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = lp1.x + t * (lp2.x - lp1.x), projY = lp1.y + t * (lp2.y - lp1.y);
            const distPx = Math.sqrt(Math.pow(hp.x - projX, 2) + Math.pow(hp.y - projY, 2));
            const segDistMeters = leafletMapInstance.distance(ll1, ll2); 

            if (distPx <= bufferPx) {
                isHit = true; bestDistAlongLine = cumulativeDistMeters + (t * segDistMeters); break;
            }
            cumulativeDistMeters += segDistMeters;
        }

        if (isHit) selectedHolesInfo.push({ holeId: hole.hole, distAlongSection: bestDistAlongLine });
    });

    if (selectedHolesInfo.length > 0) {
        selectedHolesInfo.sort((a, b) => a.distAlongSection - b.distAlongSection);
        polylineLayer.sectionDataInfo = selectedHolesInfo;
        polylineLayer.off('click');
        polylineLayer.on('click', function() { renderCrossSectionUI(this.sectionDataInfo); });
        renderCrossSectionUI(selectedHolesInfo);
    } else {
        const panel = document.getElementById('cross-section-panel');
        if (panel) panel.style.display = 'none';
    }
}

function renderCrossSectionUI(selectedHolesInfo) {
    const mapContainer = document.getElementById('map2d-map');
    let panel = document.getElementById('cross-section-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'cross-section-panel';
        panel.style.cssText = 'position:absolute; bottom:24px; left:50%; transform:translateX(-50%); width:95%; max-width:1200px; max-height:65vh; background:rgba(255,255,255,0.95); backdrop-filter:blur(12px); border:1px solid rgba(203,213,225,0.8); padding:16px 20px; border-radius:12px; box-shadow:0 -4px 25px rgba(0,0,0,0.2); z-index:1000; display:flex; flex-direction:column;';
        mapContainer.appendChild(panel);
        L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
    }
    panel.style.display = 'flex';

    const sectionData = [];
    let globalMaxZ = -Infinity, globalMinZ = Infinity, maxCollarZ = -Infinity, minCollarZ = Infinity, maxDistX = 0;
    const zCol = state.headers.find(h => ['z', 'elev', 'elevation'].includes(h.toLowerCase())) || null;
    const allKeys = Object.keys(state.compositedData[0] || {});
    const niCol = allKeys.find(k => k.toLowerCase() === 'ni') || 'Ni';
    const feCol = allKeys.find(k => k.toLowerCase() === 'fe') || 'Fe';

    selectedHolesInfo.forEach(info => {
        const hId = info.holeId;
        const holeRows = state.compositedData.filter(d => d[state.coreCols.holeId] === hId);
        if (holeRows.length === 0) return;

        let collarZ = 0;
        if (zCol) {
            const rawRow = state.rawData.find(d => d[state.coreCols.holeId] === hId);
            if (rawRow && rawRow[zCol]) collarZ = parseFloat(rawRow[zCol]);
        }

        const stratigraphy = []; let maxHoleDepth = 0;
        holeRows.forEach(row => {
            const from = parseFloat(row[state.coreCols.from]) || 0;
            const to = parseFloat(row[state.coreCols.to]) || 0;
            if (to > maxHoleDepth) maxHoleDepth = to;
            stratigraphy.push({ domain: row.Geo_Domain || 'UNKNOWN', from: from, to: to, length: parseFloat(row.Length) || (to - from), ni: parseFloat(row[niCol]) || 0, fe: parseFloat(row[feCol]) || 0 });
        });

        const holeBottomZ = collarZ - maxHoleDepth;
        if (collarZ > globalMaxZ) globalMaxZ = collarZ;
        if (holeBottomZ < globalMinZ) globalMinZ = holeBottomZ;
        if (collarZ > maxCollarZ) maxCollarZ = collarZ;
        if (collarZ < minCollarZ) minCollarZ = collarZ;
        if (info.distAlongSection > maxDistX) maxDistX = info.distAlongSection;

        sectionData.push({ holeId: hId, xDist: info.distAlongSection, zCollar: collarZ, strat: stratigraphy, td: maxHoleDepth });
    });

    if (sectionData.length === 0) return;

    const scalePxPerM = Math.max(5, 800 / (maxDistX || 1)); 
    sectionData.forEach(d => { d.leftPx = 60 + (d.xDist * scalePxPerM); });
    for (let i = 1; i < sectionData.length; i++) {
        let prev = sectionData[i-1], curr = sectionData[i];
        if (curr.leftPx - prev.leftPx < 70) curr.leftPx = prev.leftPx + 70;
    }

    const canvasWidth = Math.max(1000, sectionData[sectionData.length - 1].leftPx + 100);
    const zPadding = (globalMaxZ - globalMinZ) * 0.1;
    const topRenderZ = globalMaxZ + (zPadding === 0 ? 5 : zPadding);
    const bottomRenderZ = globalMinZ - (zPadding === 0 ? 5 : zPadding);
    const zRange = topRenderZ - bottomRenderZ || 10;

    let gridStep = zRange > 200 ? 50 : (zRange > 100 ? 20 : (zRange > 50 ? 10 : (zRange > 20 ? 5 : 2)));
    const startZ = Math.ceil(bottomRenderZ / gridStep) * gridStep;
    let yAxisLabelsHtml = '', gridLinesHtml = '';

    for (let z = startZ; z <= topRenderZ; z += gridStep) {
        const topPct = ((topRenderZ - z) / zRange) * 100;
        yAxisLabelsHtml += `<div class="cs-y-label" style="position: absolute; top: ${topPct}%; right: 6px; transform: translateY(-50%); font-size: 9px; font-weight: 800; color: #64748b;">${z}</div>`;
        gridLinesHtml += `<div style="position: absolute; top: ${topPct}%; left: 0; right: 0; height: 1px; border-top: 1px dashed #cbd5e1; z-index: 1;"></div>`;
    }

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; flex-shrink: 0;">
            <div style="font-weight: 800; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                <i data-lucide="split-square-horizontal" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; color: #0d9488; margin-right: 6px;"></i> 
                STRATIGRAPHIC CROSS-SECTION (${sectionData.length} Holes | Span: ${maxDistX.toFixed(0)}m | Elevation Range: ${minCollarZ.toFixed(1)}m - ${maxCollarZ.toFixed(1)}m)
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 10px; color: #64748b; font-weight: bold; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <i data-lucide="mouse-pointer-2" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> Scroll: Zoom | Drag: Pan
                </span>
                <button onclick="document.getElementById('cross-section-panel').style.display='none'" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: #334155; font-weight: bold;"><i data-lucide="x" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Close</button>
            </div>
        </div>
        <div id="cs-viewport-wrapper" style="display: flex; width: 100%; flex-grow: 1; min-height: 400px; background: linear-gradient(to bottom, #f8fafc, #e2e8f0); border: 1px dashed #94a3b8; border-radius: 8px; overflow: hidden; position: relative; user-select: none;">
            <div style="position: relative; width: 45px; flex-shrink: 0; background: rgba(255,255,255,0.95); box-shadow: 2px 0 5px rgba(0,0,0,0.05); border-right: 1px solid #cbd5e1; z-index: 20; overflow: hidden;">
                <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%) rotate(-90deg); transform-origin: left center; font-size: 9px; font-weight: 800; color: #94a3b8; letter-spacing: 2px; white-space: nowrap;">ELEVATION (Z)</div>
                <div id="cs-y-axis" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: 0 0; will-change: transform;">${yAxisLabelsHtml}</div>
            </div>
            <div id="cs-viewport" style="position: relative; flex-grow: 1; overflow: hidden; cursor: grab;">
                <div id="cs-content" style="position: absolute; top: 0; left: 0; width: ${canvasWidth}px; height: 100%; transform-origin: 0 0; will-change: transform;">${gridLinesHtml}
    `;

    sectionData.forEach(hole => {
        const topPct = ((topRenderZ - hole.zCollar) / zRange) * 100;
        const holeHeightPct = (hole.td / zRange) * 100;

        html += `<div style="position: absolute; left: ${hole.leftPx}px; top: ${topPct}%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; width: 36px; height: ${holeHeightPct}%; z-index: 10;">
            <div style="position: absolute; top: -24px; font-weight: 800; font-size: 10px; color: #0f172a; background: #fff; padding: 2px 5px; border: 1px solid #94a3b8; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 15;">${hole.holeId}</div>
            <div style="width: 26px; height: 100%; background-color: #cbd5e1; border-radius: 2px; overflow: hidden; box-shadow: 2px 2px 5px rgba(0,0,0,0.25); position: relative;">`;

        hole.strat.forEach(layer => {
            const layerTopPct = (layer.from / hole.td) * 100;
            const layerHeightPct = (layer.length / hole.td) * 100;
            const color = getDomainColor(layer.domain);
            const trueElev = (hole.zCollar - layer.from).toFixed(1);
            const titleInfo = `Hole: ${hole.holeId}\nDomain: ${layer.domain}\nElev Z: ${trueElev}m\nInterval: ${layer.from}m - ${layer.to}m\nNi: ${layer.ni.toFixed(2)}%`;
            html += `<div title="${titleInfo}" style="position: absolute; top: ${layerTopPct}%; height: ${layerHeightPct}%; width: 100%; background-color: ${color}; border-bottom: 1px solid rgba(0,0,0,0.15); cursor: crosshair; transition: filter 0.2s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='brightness(1)'"></div>`;
        });

        html += `</div><div style="position: absolute; bottom: -18px; font-weight: 700; font-size: 9px; color: #475569; background: rgba(255,255,255,0.85); border-radius: 2px; padding: 1px 3px; border: 1px solid #cbd5e1; white-space: nowrap;">TD: ${hole.td.toFixed(1)}m</div></div>`;
    });

    html += `</div></div></div>`;
    panel.innerHTML = html;
    if(typeof lucide !== 'undefined') lucide.createIcons();

    const viewport = document.getElementById('cs-viewport');
    const content = document.getElementById('cs-content');
    const yAxis = document.getElementById('cs-y-axis');
    const yLabels = document.querySelectorAll('.cs-y-label');
    let scale = 1, translateX = 0, translateY = 0, isDragging = false, startX, startY;

    function updateTransform() {
        content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        yAxis.style.transform = `translate(0px, ${translateY}px) scaleY(${scale})`;
        yLabels.forEach(l => { l.style.transform = `translateY(-50%) scaleY(${1 / scale})`; });
    }

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault(); 
        const delta = -e.deltaY * 0.0015;
        let newScale = Math.max(0.3, Math.min(scale * Math.exp(delta), 4.0)); 
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        translateX = mouseX - (mouseX - translateX) * (newScale / scale);
        translateY = mouseY - (mouseY - translateY) * (newScale / scale);
        scale = newScale; updateTransform();
    });

    viewport.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX - translateX; startY = e.clientY - translateY; viewport.style.cursor = 'grabbing'; });
    viewport.addEventListener('mousemove', (e) => { if (!isDragging) return; translateX = e.clientX - startX; translateY = e.clientY - startY; updateTransform(); });
    viewport.addEventListener('mouseup', () => { isDragging = false; viewport.style.cursor = 'grab'; });
    viewport.addEventListener('mouseleave', () => { isDragging = false; viewport.style.cursor = 'grab'; });
}

function exportMap2DShapefile() {
    if (typeof shpwrite === 'undefined') { showToast("Shapefile library not loaded properly.", "error"); return; }
    if (!state.map2dData || state.map2dData.length === 0) { showToast("No data available for export.", "warning"); return; }
    
    const uniqueDomains = [...new Set(state.map2dData.map(d => d.domain))].sort();
    const structuralCols = ['hole','x','y','z','domain','thickness','sg','lat','lng'];
    const availableElements = Object.keys(state.map2dData[0]).filter(k => !structuralCols.includes(k));

    const modalId = 'export-shp-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm';
    
    let domainCheckboxes = uniqueDomains.map(dom => `<label class="flex items-center gap-2 p-2 border border-slate-200 bg-slate-50 rounded hover:bg-emerald-50 cursor-pointer"><input type="checkbox" name="shp-domain-cb" value="${dom}" checked class="w-4 h-4 text-emerald-600 rounded"><span class="text-[11px] font-bold text-slate-700">${dom}</span></label>`).join('');
    let attributeCheckboxes = availableElements.map(el => `<label class="flex items-center gap-2 p-2 border border-slate-200 bg-slate-50 rounded hover:bg-blue-50 cursor-pointer"><input type="checkbox" name="shp-attr-cb" value="${el}" checked class="w-4 h-4 text-blue-600 rounded"><span class="text-[11px] font-bold text-slate-700">${el}</span></label>`).join('');

    modal.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up"><div class="bg-[#0f172a] px-5 py-4 flex justify-between items-center"><h3 class="text-white font-black text-xs flex items-center gap-2 tracking-widest uppercase"><i data-lucide="download" class="w-4 h-4 text-teal-400"></i> SHAPEFILE EXPORT CONFIG</h3><button onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-white transition-all"><i data-lucide="x" class="w-5 h-5"></i></button></div><div class="p-6 space-y-5"><div><label class="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-tighter">1. Select Geological Domains</label><div class="grid grid-cols-3 gap-2">${domainCheckboxes}</div></div><div><label class="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-tighter">2. Select Additional Attributes</label><p class="text-[9px] text-slate-400 mb-2 italic">*Hole_ID, Thickness, and UTM coordinates are automatically included.</p><div class="grid grid-cols-3 gap-2">${attributeCheckboxes}</div></div></div><div class="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end gap-3"><button onclick="document.getElementById('${modalId}').remove()" class="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button><button onclick="executeShapefileExport()" class="px-6 py-2.5 text-xs font-black text-white bg-teal-600 rounded-md hover:bg-teal-700 shadow-lg flex items-center gap-2 uppercase tracking-widest"><i data-lucide="file-archive" class="w-4 h-4"></i> PROCESS ZIP</button></div></div>`;
    document.body.appendChild(modal);
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function executeShapefileExport() {
    const domCbs = document.querySelectorAll('input[name="shp-domain-cb"]:checked');
    const attrCbs = document.querySelectorAll('input[name="shp-attr-cb"]:checked');
    const selectedDomains = Array.from(domCbs).map(cb => cb.value);
    const selectedAttrs = Array.from(attrCbs).map(cb => cb.value);
    
    if (selectedDomains.length === 0) { showToast("Select at least 1 domain!", "warning"); return; }
    document.getElementById('export-shp-modal').remove();
    showToast("Compressing Shapefile to ZIP... Please wait.", "info");

    const exportData = state.map2dData.filter(d => selectedDomains.includes(d.domain));
    let features = [];
    const utmProjString = `+proj=utm +zone=${(state.utmZone || '51s').match(/\d+/)[0]} ${(state.utmZone || '51s').toUpperCase().includes('N') ? '' : '+south'} +datum=WGS84 +units=m +no_defs`;
    
    exportData.forEach(d => {
        try {
            const [lng, lat] = proj4(utmProjString).inverse([d.x, d.y]);
            let props = { 
                "Hole_ID": String(d.hole || "UNKNOWN"), 
                "Domain": String(d.domain || "UNKNOWN"), 
                "Thickness": isNaN(parseFloat(d.thickness)) ? 0 : Number(parseFloat(d.thickness).toFixed(2)), 
                "Area_m2": 0,
                "X_UTM": isNaN(parseFloat(d.x)) ? 0 : Number(parseFloat(d.x).toFixed(2)), 
                "Y_UTM": isNaN(parseFloat(d.y)) ? 0 : Number(parseFloat(d.y).toFixed(2)) 
            };
            selectedAttrs.forEach(attr => {
                let safeName = attr.substring(0, 10).replace(/[^a-zA-Z0-9_]/g, '_'); 
                let val = parseFloat(d[attr]);
                props[safeName] = isNaN(val) ? 0 : Number(val.toFixed(3));
            });
            features.push({ "type": "Feature", "geometry": { "type": "Point", "coordinates": [lng, lat] }, "properties": props });
        } catch(e){}
    });

    if (state.activeBoundary && state.activeBoundary.length > 2) {
        let coords = state.activeBoundary.map(ll => [ll[1], ll[0]]);
        if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]); 
        
        const poly = turf.polygon([coords]);
        const areaM2 = turf.area(poly);

        let boundaryProps = { "Hole_ID": "PIT_LIMIT", "Domain": "BOUNDARY", "Thickness": 0, "Area_m2": Number(areaM2.toFixed(2)), "X_UTM": 0, "Y_UTM": 0 };
        selectedAttrs.forEach(attr => { let safeName = attr.substring(0, 10).replace(/[^a-zA-Z0-9_]/g, '_'); boundaryProps[safeName] = 0; });
        features.push({ "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [coords] }, "properties": boundaryProps });
    }

    if (state.resourcePolygons && state.resourcePolygons.length > 0) {
        state.resourcePolygons.forEach(poly => {
            const areaM2 = turf.area(poly);
            let classProps = { "Hole_ID": "RES_CLASS", "Domain": poly.properties.class, "Thickness": 0, "Area_m2": Number(areaM2.toFixed(2)), "X_UTM": 0, "Y_UTM": 0 };
            selectedAttrs.forEach(attr => { let safeName = attr.substring(0, 10).replace(/[^a-zA-Z0-9_]/g, '_'); classProps[safeName] = 0; });
            features.push({ "type": "Feature", "geometry": poly.geometry, "properties": classProps });
        });
    }

    if (leafletMapInstance && leafletMapInstance.voronoiLayer) {
        const voronoiGeoJSON = leafletMapInstance.voronoiLayer.toGeoJSON();
        voronoiGeoJSON.features.forEach(feat => {
            if (selectedDomains.includes(feat.properties.domain)) {
                const areaM2 = turf.area(feat);
                let vProps = {
                    "Hole_ID": String(feat.properties.hole || "VORONOI"),
                    "Domain": String(feat.properties.domain || "UNKNOWN"),
                    "Thickness": isNaN(parseFloat(feat.properties.thickness)) ? 0 : Number(parseFloat(feat.properties.thickness).toFixed(2)),
                    "Area_m2": Number(areaM2.toFixed(2)),
                    "X_UTM": isNaN(parseFloat(feat.properties.x)) ? 0 : Number(parseFloat(feat.properties.x).toFixed(2)),
                    "Y_UTM": isNaN(parseFloat(feat.properties.y)) ? 0 : Number(parseFloat(feat.properties.y).toFixed(2))
                };
                selectedAttrs.forEach(attr => {
                    let safeName = attr.substring(0, 10).replace(/[^a-zA-Z0-9_]/g, '_'); 
                    let val = parseFloat(feat.properties[attr]);
                    vProps[safeName] = isNaN(val) ? 0 : Number(val.toFixed(3));
                });
                features.push({ "type": "Feature", "geometry": feat.geometry, "properties": vProps });
            }
        });
    }

    const today = new Date();
    const dateStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
    const domainLabel = selectedDomains.length > 1 ? 'Multi' : selectedDomains[0];
    
    const options = { folder: `NiCore_SHP_${domainLabel}_${dateStr}`, types: { point: `DrillHoles_Data`, polygon: `Polygons_Data` } };

    try {
        shpwrite.zip({ "type": "FeatureCollection", "features": features }, options).then(function(content) {
            let blob;
            if (typeof content === 'string') {
                const byteCharacters = atob(content); const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
                blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/zip" });
            } else { blob = new Blob([content], { type: "application/zip" }); }

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none"; a.href = url; a.download = `NiCore_SHP_${domainLabel}_${dateStr}.zip`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            showToast("Shapefile ZIP downloaded successfully!", "success");
        }).catch(function(err) { console.error(err); showToast("Failed to process ZIP. Check console.", "error"); });
    } catch(e) { console.error(e); showToast("System failed to trigger Shapefile export.", "error"); }
}

let kmlOverlays = []; 

function handleKMLUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    showToast(`Processing KML file: ${file.name}...`, "info");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const xmlStr = e.target.result; 
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
            const geoJson = toGeoJSON.kml(xmlDoc);
            
            if (!geoJson || !geoJson.features || geoJson.features.length === 0) { 
                showToast("KML file empty or invalid.", "warning"); 
                return; 
            }

            const kmlLayer = L.geoJSON(geoJson, {
                style: function (f) { 
                    return { color: '#6366f1', weight: 2.5, opacity: 0.9, fillColor: '#8b5cf6', fillOpacity: 0.1, dashArray: '6, 6' }; 
                },
                pmIgnore: true 
            });

            kmlLayer.bindPopup(function (layer) {
                const props = layer.feature.properties;
                const title = props.name || 'KML Data';
                
                const descKey = Object.keys(props).find(k => k.toLowerCase() === 'description');
                let rawDesc = descKey ? props[descKey] : "";

                if (rawDesc && typeof rawDesc === 'object') {
                    rawDesc = rawDesc.value || rawDesc.textContent || rawDesc.text || "";
                }

                let contentHtml = "";

                if (rawDesc && String(rawDesc).trim().length > 0) {
                    let cleanDesc = String(rawDesc)
                        .replace(/<table[^>]*>/gi, '<div style="display: flex; flex-direction: column; gap: 4px;">')
                        .replace(/<\/table>/gi, '</div>')
                        .replace(/<tr[^>]*>/gi, '<div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 8px;">')
                        .replace(/<\/tr>/gi, '</div>')
                        .replace(/<td[^>]*>/gi, '<div style="display: block; word-break: break-word; font-size: 11px;">') 
                        .replace(/<\/td>/gi, '</div>');
                    
                    contentHtml = `<div class="kml-desc-block" style="color: #334155;">${cleanDesc}</div>`;
                } else {
                    const ignoredKeys = ['name', 'styleurl', 'styleid', 'stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity', 'description'];
                    let rows = [];
                    for (const key in props) {
                        if (ignoredKeys.includes(key.toLowerCase())) continue;
                        rows.push(`
                            <div style="margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
                                <div style="font-weight: 800; color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px;">${key.replace(/_/g, ' ')}</div>
                                <div style="color: #1e293b; font-size: 11px; margin-top: 2px; font-weight: 600;">${props[key]}</div>
                            </div>
                        `);
                    }
                    contentHtml = rows.join('');
                }

                return `
                <div style="min-width: 280px; max-width: 350px; font-family: 'Inter', sans-serif;">
                    <div style="background: #f8fafc; margin: -10px -10px 10px -10px; padding: 12px; border-bottom: 2px solid #e2e8f0; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 8px;">
                        <div style="width: 8px; height: 8px; border-radius: 2px; background: #6366f1;"></div>
                        <h4 style="margin: 0; color: #0f172a; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">
                            ${title}
                        </h4>
                    </div>
                    <div style="max-height: 300px; overflow-y: auto; padding: 10px 5px 5px 0;" class="custom-scrollbar">
                        ${contentHtml || '<span style="color:#94a3b8; font-style:italic; font-size:11px;">Atribut data tidak ditemukan.</span>'}
                    </div>
                </div>
                `;
            });

            const id = 'kml_' + new Date().getTime(); 
            kmlOverlays.push({ id: id, name: file.name, layer: kmlLayer, visible: true });

            if (leafletMapInstance) {
                kmlLayer.addTo(leafletMapInstance);
                leafletMapInstance.fitBounds(kmlLayer.getBounds(), { padding: [50, 50], animate: true });
            }
            renderKMLListUI(); 
            showToast(`KML ${file.name} berhasil diunggah.`, "success");
        } catch (err) { 
            console.error("KML Error:", err);
            showToast("Gagal memproses file KML.", "error"); 
        } finally { 
            event.target.value = ''; 
        }
    };
    reader.readAsText(file);
}

function renderKMLListUI() {
    const container = document.getElementById('kml-list-container');
    if (!container) return; 
    
    if (kmlOverlays.length === 0) { 
        container.innerHTML = ``; 
        return; 
    }

    let html = '';
    kmlOverlays.forEach(kml => {
        const eyeIcon = kml.visible ? 'eye' : 'eye-off';
        const textColor = kml.visible ? 'text-indigo-700 font-bold' : 'text-slate-400 font-medium line-through';
        const bgColor = kml.visible ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200';
        
        html += `
        <div class="flex justify-between items-center p-2 border ${bgColor} rounded-md transition-all mb-1.5">
            <div class="flex items-center gap-2 overflow-hidden">
                <button onclick="toggleKML('${kml.id}')" class="text-indigo-500 hover:text-indigo-700 focus:outline-none" title="Hide/Show KML">
                    <i data-lucide="${eyeIcon}" class="w-4 h-4"></i>
                </button>
                <span class="text-[10px] ${textColor} truncate" style="max-width: 140px;" title="${kml.name}">
                    ${kml.name}
                </span>
            </div>
            <button onclick="deleteKML('${kml.id}')" class="text-rose-400 hover:text-rose-600 focus:outline-none" title="Delete KML">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        </div>`;
    });
    container.innerHTML = html;
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleKML(id) {
    const kml = kmlOverlays.find(k => k.id === id);
    if (!kml || !leafletMapInstance) return;
    
    if (kml.visible) { 
        leafletMapInstance.removeLayer(kml.layer); 
        kml.visible = false; 
    } else { 
        kml.layer.addTo(leafletMapInstance); 
        kml.visible = true; 
    }
    renderKMLListUI();
}

function deleteKML(id) {
    const idx = kmlOverlays.findIndex(k => k.id === id);
    if (idx === -1) return;
    
    if (leafletMapInstance && kmlOverlays[idx].visible) {
        leafletMapInstance.removeLayer(kmlOverlays[idx].layer);
    }
    kmlOverlays.splice(idx, 1);
    renderKMLListUI();
}

function generateAutoResourceBoundaries() {
    if (!state.map2dData || state.map2dData.length < 3) {
        if(typeof showToast === 'function') showToast("Minimum 3 drill holes required.", "warning");
        return;
    }

    if(typeof showToast === 'function') showToast("Generating clean solid boundary...", "info");

    const spacingX = parseFloat(document.getElementById('map2d-grid-x')?.value) || 50;
    const spacingY = parseFloat(document.getElementById('map2d-grid-y')?.value) || 50;

    const expandX = spacingX * 0.70; 
    const expandY = spacingY * 0.70; 

    const utmProjString = `+proj=utm +zone=${(state.utmZone || '51s').match(/\d+/)[0]} ${(state.utmZone || '51s').toUpperCase().includes('N') ? '' : '+south'} +datum=WGS84 +units=m +no_defs`;

    const uniquePointsMap = new Map();
    state.map2dData.forEach(d => {
        const key = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        if (!uniquePointsMap.has(key)) {
            try {
                const [lng, lat] = proj4(utmProjString).inverse([d.x, d.y]);
                uniquePointsMap.set(key, [lng, lat]);
            } catch(e) {}
        }
    });

    const points = Array.from(uniquePointsMap.values());
    if (points.length < 3) return;

    let bufferedFeatures = [];
    points.forEach(coords => {
        const latOffset = expandY / 111320;
        const lngOffset = expandX / (111320 * Math.cos(coords[1] * Math.PI / 180));

        const box = turf.polygon([[
            [coords[0] - lngOffset, coords[1] - latOffset],
            [coords[0] + lngOffset, coords[1] - latOffset],
            [coords[0] + lngOffset, coords[1] + latOffset],
            [coords[0] - lngOffset, coords[1] + latOffset],
            [coords[0] - lngOffset, coords[1] - latOffset]
        ]]);
        bufferedFeatures.push(box);
    });

    let mergedBoundary = null;
    try {
        mergedBoundary = turf.dissolve(turf.featureCollection(bufferedFeatures));
    } catch (err) {
        mergedBoundary = bufferedFeatures[0];
        for (let i = 1; i < bufferedFeatures.length; i++) {
            try { mergedBoundary = turf.union(mergedBoundary, bufferedFeatures[i]); } catch (e) {}
        }
    }

    if (!mergedBoundary || !mergedBoundary.features || mergedBoundary.features.length === 0) {
        if(typeof showToast === 'function') showToast("Gagal memproses batas geometri.", "error");
        return;
    }

    let coordsLatLng = [];
    let maxArea = -1;

    const processPolygon = (coords) => {
        let solidPoly = turf.polygon([coords[0]]);
        solidPoly = turf.simplify(solidPoly, { tolerance: 0.0001, highQuality: true, mutate: true });
        
        const a = turf.area(solidPoly);
        if (a > maxArea) {
            maxArea = a;
            coordsLatLng = solidPoly.geometry.coordinates[0].map(ll => [ll[1], ll[0]]);
        }
    };

    const finalFeature = mergedBoundary.features[0];
    if (finalFeature.geometry.type === 'Polygon') {
        processPolygon(finalFeature.geometry.coordinates);
    } else if (finalFeature.geometry.type === 'MultiPolygon') {
        finalFeature.geometry.coordinates.forEach(polyCoords => processPolygon(polyCoords));
    }

    if (coordsLatLng.length > 0) {
        if (coordsLatLng[0][0] !== coordsLatLng[coordsLatLng.length-1][0] ||
            coordsLatLng[0][1] !== coordsLatLng[coordsLatLng.length-1][1]) {
            coordsLatLng.push([...coordsLatLng[0]]);
        }

        state.activeBoundary = coordsLatLng;

        leafletMapInstance.boundaryLayer.clearLayers();
        const polyLayer = L.polygon(coordsLatLng, {
            color: '#0ea5e9', 
            weight: 3, 
            dashArray: 'none',
            fillColor: '#0ea5e9', 
            fillOpacity: 0.1
        });
        leafletMapInstance.boundaryLayer.addLayer(polyLayer);

        polyLayer.on('pm:edit', (e) => {
            const latlngs = e.target.getLatLngs()[0];
            state.activeBoundary = latlngs.map(ll => [ll.lat, ll.lng]);
            renderMap2D(); 
        });

        renderMap2D();
        if(typeof showToast === 'function') showToast(`Smart Boundary berhasil ditarik!`, "success");
    }
}

function toggleEstimationPanelMap2D() {
    const tableContainer = document.getElementById('map2d-estimation-table-container');
    const icon = document.getElementById('icon-toggle-map2d-est');
    
    if (tableContainer.classList.contains('hidden')) {
        tableContainer.classList.remove('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-down');
    } else {
        tableContainer.classList.add('hidden');
        if (icon) icon.setAttribute('data-lucide', 'chevron-up');
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    setTimeout(() => {
        if (leafletMapInstance) {
            leafletMapInstance.invalidateSize({ animate: true });
        }
    }, 150); 
}

function detectDominantSpacing() {
    if (!state.map2dData || state.map2dData.length < 2) return 50; 

    const uniquePointsMap = new Map();
    state.map2dData.forEach(d => {
        const key = `${parseFloat(d.x).toFixed(2)}_${parseFloat(d.y).toFixed(2)}`;
        if (!uniquePointsMap.has(key)) {
            uniquePointsMap.set(key, { x: parseFloat(d.x), y: parseFloat(d.y) });
        }
    });

    const points = Array.from(uniquePointsMap.values());
    if (points.length < 2) return 50;

    const standardGrids = [12.5, 25, 50, 100, 200, 400];
    let snappedDistances = [];

    points.forEach((p1, i) => {
        let minDist = Infinity;
        points.forEach((p2, j) => {
            if (i === j) return;
            const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            if (dist < minDist) minDist = dist;
        });
        
        if (minDist !== Infinity && minDist > 0) {
            let bestSnap = standardGrids[0];
            let minDiff = Math.abs(minDist - standardGrids[0]);
            
            for (let k = 1; k < standardGrids.length; k++) {
                let diff = Math.abs(minDist - standardGrids[k]);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestSnap = standardGrids[k];
                }
            }
            snappedDistances.push(bestSnap);
        }
    });

    if (snappedDistances.length === 0) return 50;

    const frequency = {};
    let maxFreq = 0;
    let dominantSpacing = 50;

    snappedDistances.forEach(d => {
        frequency[d] = (frequency[d] || 0) + 1;
        if (frequency[d] > maxFreq) {
            maxFreq = frequency[d];
            dominantSpacing = d;
        }
    });

    return dominantSpacing;
}