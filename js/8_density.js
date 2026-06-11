// ==========================================
// 8_DENSITY.JS (ENTERPRISE DENSITY ENGINE)
// Handles Caliper & Archimedes Methods with Smart Mapper
// ==========================================

// --- STATE MANAGEMENT ---
const densityState = {
    rawData: [], 
    processedData: [],
    colMapping: {},
    waxDensity: 0.9, 
    config: { rulePhys: true, ruleMc: true, mcLimit: 70 },
    stats: { total: 0, avgSgDry: 0, avgSgWet: 0, avgMc: 0, anomalies: 0 },
    charts: { hist: null, box: null, scatter: null, depth: null, rel: null, control: null }
};

let tempDensityImportData = { headers: [], data: [] };

// --- DOM INJECTION (CLEAN PROFESSIONAL UI) ---
function injectDensityUI() {
    const qaqcBtn = document.getElementById('btn-qaqclab') || document.getElementById('btn-qaqc');
    
    if (qaqcBtn && !document.getElementById('btn-density')) {
        let baseClasses = qaqcBtn.getAttribute('class') || '';
        baseClasses = baseClasses.replace(/active-left-nav|bg-white|shadow-[a-z]+|bg-[a-zA-Z]+-[0-9]+|text-[a-zA-Z]+-700/g, ' ').replace(/\s+/g, ' ').trim();
        if (!baseClasses.includes('px-')) baseClasses = "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-50 hover:text-teal-600 transition-colors";

        qaqcBtn.insertAdjacentHTML('afterend', `
            <button id="btn-density" onclick="switchSubTab('density')" class="${baseClasses} hidden disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <i data-lucide="weight" class="w-4 h-4 shrink-0"></i> 
                <span class="text-left flex-grow">Density / SG</span>
            </button>
        `);
    }

    const mainWrapper = document.querySelector('.tab-content')?.parentNode;
    if (mainWrapper && !document.getElementById('tab-density')) {
        const densityTab = document.createElement('div');
        densityTab.id = 'tab-density';
        densityTab.className = 'tab-content hidden h-full flex-col animate-fade-in w-full pb-10';
        
        densityTab.innerHTML = `
            <div id="density-empty-state" class="flex flex-col items-center justify-center flex-grow bg-white rounded-xl border border-slate-200 p-10 shadow-sm w-full min-h-[400px] mb-6">
                <div class="bg-slate-50 p-5 rounded-full shadow-inner mb-4 border border-slate-100">
                    <i data-lucide="weight" class="w-16 h-16 text-slate-300 drop-shadow-sm"></i>
                </div>
                <h3 class="text-xl font-black text-slate-600 mb-2 tracking-tight uppercase">Density & SG Validation</h3>
                <p class="text-sm font-medium text-slate-400 text-center max-w-md">
                    No density lab data loaded. Please import a CSV/XLSX file from the Action Panel to calculate Specific Gravity and Moisture Content.
                </p>
            </div>

            <div id="density-dashboard-content" class="hidden flex-col w-full">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-start relative overflow-hidden">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Samples</span>
                        <span class="text-3xl font-black text-slate-800" id="den-stat-total">0</span>
                        <i data-lucide="layers" class="absolute right-4 bottom-4 w-10 h-10 text-slate-100"></i>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-start relative overflow-hidden">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mean SG (Dry)</span>
                        <span class="text-3xl font-black text-slate-800" id="den-stat-sgdry">-</span>
                        <i data-lucide="box" class="absolute right-4 bottom-4 w-10 h-10 text-slate-100"></i>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-start relative overflow-hidden">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mean Moisture (%)</span>
                        <span class="text-3xl font-black text-slate-800" id="den-stat-mc">-</span>
                        <i data-lucide="droplet" class="absolute right-4 bottom-4 w-10 h-10 text-slate-100"></i>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-center items-start relative overflow-hidden">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Anomalies Detected</span>
                        <span class="text-3xl font-black text-rose-600" id="den-stat-anomalies">0</span>
                        <i data-lucide="alert-triangle" class="absolute right-4 bottom-4 w-10 h-10 text-rose-50"></i>
                    </div>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6 items-stretch">
                     <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
                         <div class="bg-slate-50 border-b border-slate-200 p-3 text-slate-700 font-bold text-xs uppercase tracking-widest flex items-center gap-2 shrink-0">Global Summary Statistics</div>
                         <div class="overflow-x-auto flex-grow"><table class="w-full text-xs text-left whitespace-nowrap"><thead class="bg-slate-100/50 border-b border-slate-200 text-slate-500"><tr><th class="p-3 font-bold">Metric</th><th class="p-3 font-bold">SG (Dry)</th><th class="p-3 font-bold">SG (Wet)</th><th class="p-3 font-bold">MC (%)</th></tr></thead><tbody id="den-basic-stats-body" class="divide-y divide-slate-100 text-slate-700"></tbody></table></div>
                     </div>
                     <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
                         <div class="bg-slate-50 border-b border-slate-200 p-3 text-slate-700 font-bold text-xs uppercase tracking-widest flex items-center gap-2 shrink-0">Domain Group Statistics</div>
                         <div class="overflow-x-auto flex-grow"><table class="w-full text-xs text-left whitespace-nowrap"><thead class="bg-slate-100/50 border-b border-slate-200 text-slate-500"><tr><th class="p-3 font-bold">Domain</th><th class="p-3 font-bold">Count</th><th class="p-3 font-bold">Mean SG</th><th class="p-3 font-bold">Mean MC%</th><th class="p-3 font-bold">CV</th></tr></thead><tbody id="den-group-stats-body" class="divide-y divide-slate-100 text-slate-700"></tbody></table></div>
                     </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">SG Distribution</h4><div class="relative flex-grow w-full"><canvas id="den-chart-hist"></canvas></div></div>
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">Domain Boxplot</h4><div class="relative flex-grow w-full h-full min-h-0"><div id="den-chart-box" class="absolute inset-0"></div></div></div>
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">SG Dry vs SG Wet</h4><div class="relative flex-grow w-full"><canvas id="den-chart-scatter"></canvas></div></div>
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">Downhole Density Trend</h4><div class="relative flex-grow w-full"><canvas id="den-chart-depth"></canvas></div></div>
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">Absolute Difference</h4><div class="relative flex-grow w-full"><canvas id="den-chart-rel"></canvas></div></div>
                    <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col h-[340px] overflow-hidden"><h4 class="font-bold text-[10px] text-slate-500 uppercase mb-3 text-center tracking-widest shrink-0">Quality Control (Z-Score)</h4><div class="relative flex-grow w-full"><canvas id="den-chart-control"></canvas></div></div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-grow flex flex-col min-h-[300px]">
                    <div class="bg-slate-50 border-b border-slate-200 p-3 text-slate-700 font-bold text-xs uppercase tracking-widest shrink-0">Validated Dataset</div>
                    <div class="overflow-auto custom-scrollbar flex-grow">
                        <table class="w-full text-[11px] text-left whitespace-nowrap">
                            <thead class="bg-slate-100/50 text-slate-500 sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">Status</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">Hole ID</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">From</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">To</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">Lithology</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">Method</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">SG (Dry)</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">SG (Wet)</th>
                                    <th class="px-4 py-3 font-bold border-r border-slate-200">MC (%)</th>
                                    <th class="px-4 py-3 font-bold w-[250px]">Remarks</th>
                                </tr>
                            </thead>
                            <tbody id="densityTableBody" class="divide-y divide-slate-100 bg-white text-slate-700">
                                <tr><td colspan="10" class="py-10 text-center text-slate-400 font-medium italic">Please import density lab data.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        mainWrapper.appendChild(densityTab);
    }

    const actionsWrapper = document.querySelector('.action-panel')?.parentNode || document.querySelector('[id^="actions-"]')?.parentNode;
    if (actionsWrapper && !document.getElementById('actions-density')) {
        const densityAction = document.createElement('div');
        densityAction.id = 'actions-density';
        densityAction.className = 'action-panel hidden flex-col gap-3 animate-fade-in w-full h-full';
        
        densityAction.innerHTML = `
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="upload" class="w-3.5 h-3.5 text-slate-500"></i> Import Dataset</h4>
                <input type="file" id="densityCsvFile" accept=".csv, .xlsx" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-xs bg-slate-50 cursor-pointer mb-3 text-slate-600 outline-none focus:border-teal-500">
                <button onclick="processDensityFile()" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all shadow-sm"><i data-lucide="play" class="w-3.5 h-3.5"></i> Parse File</button>
            </div>
            
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <h4 class="text-[10px] font-black uppercase text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-1.5"><i data-lucide="sliders-horizontal" class="w-3.5 h-3.5 text-slate-500"></i> Validation Parameters</h4>
                
                <label class="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Wax Density Base</label>
                <div class="flex items-center gap-2 mb-4">
                    <input type="number" id="waxDensityVal" value="0.90" step="0.01" class="w-full border border-slate-300 px-3 py-2 rounded-lg text-sm font-bold outline-none focus:border-teal-500 text-slate-700">
                    <span class="text-[10px] font-bold text-slate-400">g/cm³</span>
                </div>
                
                <label class="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Integrity Rules</label>
                <div class="space-y-2">
                     <label class="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-slate-50 rounded transition-colors border border-transparent hover:border-slate-200"><input type="checkbox" id="den-rule-phys" class="w-3.5 h-3.5 text-teal-600 rounded-sm" checked><span class="text-[11px] font-semibold text-slate-700">Flag SG Dry > SG Wet</span></label>
                     <div class="flex items-center justify-between gap-2 p-1.5 hover:bg-slate-50 rounded transition-colors border border-transparent hover:border-slate-200">
                         <label class="flex items-center gap-2 cursor-pointer">
                             <input type="checkbox" id="den-rule-mc" class="w-3.5 h-3.5 text-teal-600 rounded-sm" checked>
                             <span class="text-[11px] font-semibold text-slate-700">Flag Moisture > </span>
                         </label>
                         <div class="flex items-center gap-1 bg-white border border-slate-300 rounded shadow-sm overflow-hidden">
                             <input type="number" id="mcLimitVal" value="70" class="w-12 py-1 text-[11px] font-bold text-center outline-none text-slate-700">
                             <span class="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 border-l border-slate-200 py-1">%</span>
                         </div>
                     </div>
                </div>
            </div>
            
            <button onclick="generateDensityPdf()" id="den-btn-pdf" class="hidden w-full bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 font-bold py-3 rounded-lg shadow-sm text-sm flex items-center justify-center gap-2 transition-all"><i data-lucide="file-text" class="w-4 h-4"></i> Export PDF Report</button>
            <div class="mt-auto pb-4">
                <button onclick="mergeDensityToDatabase()" id="den-btn-inject" class="hidden w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"><i data-lucide="database" class="w-4 h-4"></i> Inject to Database</button>
            </div>
        `;
        actionsWrapper.appendChild(densityAction);
    }

    injectDensityMapperModal();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // =====================================
    // REAL-TIME DEBOUNCE LISTENERS
    // =====================================
    const setupRealTimeListener = (id, eventType, isText = false) => {
        const el = document.getElementById(id);
        if (el) {
            let timer;
            el.addEventListener(eventType, () => {
                clearTimeout(timer);
                timer = setTimeout(() => { window.recalculateDensity(true); }, isText ? 300 : 50);
            });
        }
    };

    setupRealTimeListener('waxDensityVal', 'input', true);
    setupRealTimeListener('mcLimitVal', 'input', true);
    setupRealTimeListener('den-rule-phys', 'change', false);
    setupRealTimeListener('den-rule-mc', 'change', false);

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.getAttribute('onclick')?.includes("'density'")) {
            setTimeout(() => {
                syncDensityUIParams(); 
                if (densityState.processedData && densityState.processedData.length > 0) {
                    document.getElementById('den-btn-pdf')?.classList.remove('hidden');
                    document.getElementById('den-btn-inject')?.classList.remove('hidden');
                    Object.values(densityState.charts).forEach(c => { if(c) c.resize(); });
                    const box = document.getElementById('den-chart-box');
                    if (box && typeof Plotly !== 'undefined' && box.data) Plotly.Plots.resize(box);
                }
            }, 100);
        }
    });

    setInterval(() => {
        const qaqcBtn = document.getElementById('btn-qaqclab') || document.getElementById('btn-qaqc');
        const denBtn = document.getElementById('btn-density');
        if (qaqcBtn && !qaqcBtn.disabled && denBtn && denBtn.classList.contains('hidden')) {
            denBtn.classList.remove('hidden'); denBtn.disabled = false;
        }
    }, 1500);

    renderDensityDashboard();
}

function syncDensityUIParams() {
    if (densityState.waxDensity) {
        const waxInput = document.getElementById('waxDensityVal');
        if (waxInput) waxInput.value = densityState.waxDensity;
    }
    if (densityState.config) {
        const mcInput = document.getElementById('mcLimitVal');
        const physChk = document.getElementById('den-rule-phys');
        const mcChk = document.getElementById('den-rule-mc');
        if (mcInput && densityState.config.mcLimit !== undefined) mcInput.value = densityState.config.mcLimit;
        if (physChk && densityState.config.rulePhys !== undefined) physChk.checked = densityState.config.rulePhys;
        if (mcChk && densityState.config.ruleMc !== undefined) mcChk.checked = densityState.config.ruleMc;
    }
}

function injectDensityMapperModal() {
    if (document.getElementById('modal-den-mapper')) return;
    const modal = document.createElement('div');
    modal.id = 'modal-den-mapper';
    modal.className = 'fixed inset-0 bg-slate-900/90 hidden z-[110] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-fade-in border border-slate-700">
            <div class="p-4 border-b border-slate-200 bg-slate-800 flex justify-between items-center shrink-0">
                <div class="flex items-center gap-3">
                    <div class="bg-white/20 p-2 rounded-lg"><i data-lucide="weight" class="w-5 h-5 text-teal-300"></i></div>
                    <div>
                        <h3 class="text-white font-black text-sm tracking-widest uppercase">Density Import Wizard</h3>
                        <p class="text-[10px] text-slate-300 font-medium mt-0.5">Map your Caliper and Archimedes parameters.</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span id="den-mapper-row-count" class="bg-slate-700 text-white text-[10px] font-black px-3 py-1 rounded shadow-inner border border-slate-600">0 ROWS DETECTED</span>
                    <button onclick="document.getElementById('modal-den-mapper').classList.add('hidden')" class="text-slate-400 hover:text-white transition-colors"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-100">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    
                    <div class="space-y-6">
                        <div class="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
                            <div class="bg-rose-50 border-b border-rose-100 p-2.5 flex items-center gap-2 shrink-0">
                                <i data-lucide="tag" class="w-4 h-4 text-rose-600"></i>
                                <h4 class="text-[11px] font-black text-rose-800 uppercase tracking-widest">1. Identifiers (Required)</h4>
                            </div>
                            <div class="overflow-x-auto w-full"><table class="w-full text-left text-[10px] whitespace-nowrap"><tbody id="den-map-id-body" class="divide-y divide-slate-100"></tbody></table></div>
                        </div>

                        <div class="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
                            <div class="bg-amber-50 border-b border-amber-100 p-2.5 flex items-center gap-2 shrink-0">
                                <i data-lucide="scale" class="w-4 h-4 text-amber-600"></i>
                                <h4 class="text-[11px] font-black text-amber-800 uppercase tracking-widest">2. Basic Weights (Required)</h4>
                            </div>
                            <div class="overflow-x-auto w-full"><table class="w-full text-left text-[10px] whitespace-nowrap"><tbody id="den-map-weight-body" class="divide-y divide-slate-100"></tbody></table></div>
                        </div>
                    </div>

                    <div class="space-y-6">
                        <div class="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
                            <div class="bg-blue-50 border-b border-blue-100 p-2.5 flex items-center gap-2 shrink-0">
                                <i data-lucide="droplet" class="w-4 h-4 text-blue-600"></i>
                                <h4 class="text-[11px] font-black text-blue-800 uppercase tracking-widest">3. Archimedes Params (Optional)</h4>
                            </div>
                            <div class="overflow-x-auto w-full"><table class="w-full text-left text-[10px] whitespace-nowrap"><tbody id="den-map-arc-body" class="divide-y divide-slate-100"></tbody></table></div>
                        </div>

                        <div class="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden flex flex-col">
                            <div class="bg-emerald-50 border-b border-emerald-100 p-2.5 flex items-center gap-2 shrink-0">
                                <i data-lucide="ruler" class="w-4 h-4 text-emerald-600"></i>
                                <h4 class="text-[11px] font-black text-emerald-800 uppercase tracking-widest">4. Caliper Params (Optional)</h4>
                            </div>
                            <p class="text-[9px] text-slate-500 px-3 pt-2 italic">Map the available Diameter (D) and Length (L) columns.</p>
                            <div class="overflow-x-auto w-full"><table class="w-full text-left text-[10px] whitespace-nowrap"><tbody id="den-map-caliper-body" class="divide-y divide-slate-100"></tbody></table></div>
                        </div>
                    </div>

                </div>
            </div>

            <div class="p-4 border-t border-slate-200 bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
                <p class="text-[11px] text-slate-500 font-bold italic" id="den-mapper-status">Mapping requirements...</p>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('modal-den-mapper').classList.add('hidden')" class="px-5 py-2 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded border border-transparent transition-colors">Cancel</button>
                    <button id="btn-exec-den-import" onclick="executeDensityImport()" class="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded font-black text-sm shadow-md transition-all flex items-center gap-2 opacity-50 cursor-not-allowed" disabled>
                        <i data-lucide="check-circle" class="w-4 h-4"></i> EXECUTE CALCULATION
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// --- CORE ENGINE ---
window.processDensityFile = function() {
    const fileInput = document.getElementById('densityCsvFile');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) return typeof showToast === 'function' ? showToast('Please select a CSV/XLSX file first.', 'warning') : null;
    if (typeof showLoader === 'function') showLoader("Reading File", "Extracting headers...");

    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        Papa.parse(file, { 
            header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim().replace(/^"|"$/g, ''), 
            complete: res => {
                if (!res.data.length) { hideLoader(); return showToast('Empty CSV data!', 'error'); }
                tempDensityImportData.headers = res.meta.fields;
                tempDensityImportData.data = res.data;
                hideLoader();
                openDensityMapperWizard();
            }
        });
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(worksheet, {raw: false, defval: ""});
                if (json.length === 0) throw new Error("Empty Excel Data");
                
                tempDensityImportData.headers = Object.keys(json[0]);
                tempDensityImportData.data = json;
                hideLoader();
                openDensityMapperWizard();
            } catch(e) {
                hideLoader(); showToast("Error reading Excel file.", "error");
            }
        };
        reader.readAsArrayBuffer(file); 
    }
};

window.openDensityMapperWizard = function() {
    document.getElementById('den-mapper-row-count').textContent = `${tempDensityImportData.data.length.toLocaleString()} ROWS DETECTED`;
    const headers = tempDensityImportData.headers;
    const sampleRows = tempDensityImportData.data.slice(0, 2);
    let usedHeaders = new Set();

    const createRow = (sysId, sysLabel, keywords, groupClass) => {
        let options = `<option value="">-- Select Column --</option>`;
        let autoSelected = "";
        headers.forEach(h => {
            let match = keywords.some(kw => h.toLowerCase() === kw || h.toLowerCase().includes(kw));
            let selected = "";
            if (match && !usedHeaders.has(h) && autoSelected === "") {
                selected = "selected"; autoSelected = h; usedHeaders.add(h);
            }
            options += `<option value="${h}" ${selected}>${h}</option>`;
        });
        const previewText = autoSelected ? sampleRows.map(r => String(r[autoSelected]).substring(0,10) || '-').join(' | ') : '-';
        return `
            <tr class="den-mapper-row bg-white hover:bg-slate-50 transition-colors" data-sys="${sysId}" data-group="${groupClass}">
                <td class="p-2 border-r border-slate-200 font-bold text-slate-700 w-1/3">${sysLabel}</td>
                <td class="p-2 border-r border-slate-200 w-1/3">
                    <select class="w-full border border-slate-300 rounded p-1.5 text-[10px] font-bold text-slate-700 outline-none focus:border-teal-500 bg-white" onchange="window.updateDenPreview(this)">
                        ${options}
                    </select>
                </td>
                <td class="p-2 font-mono text-slate-500 den-preview-cell truncate max-w-[100px]" title="${previewText}">${previewText}</td>
            </tr>
        `;
    };

    const grp1 = [
        { id: '_sys_id', label: 'Hole/Sample ID *', kw: ['hole', 'id', 'sample', 'no'] },
        { id: '_sys_from', label: 'From *', kw: ['from', 'mulai'] },
        { id: '_sys_to', label: 'To *', kw: ['to', 'sampai'] },
        { id: '_sys_lito', label: 'Lithology *', kw: ['litho', 'lito', 'rock', 'domain'] }
    ];
    const grp2 = [
        { id: '_sys_wet', label: 'Wet Weight *', kw: ['wet'] },
        { id: '_sys_dry', label: 'Dry Weight *', kw: ['dry', 'air'] }
    ];
    const grp3 = [
        { id: '_sys_wax', label: 'Weight Wax', kw: ['wax', 'coated'] },
        { id: '_sys_water', label: 'Weight Water', kw: ['water', 'celup'] }
    ];
    const grp4 = [
        { id: '_sys_d1', label: 'Diameter 1 (D1)', kw: ['d1'] }, { id: '_sys_d2', label: 'Diameter 2 (D2)', kw: ['d2'] },
        { id: '_sys_d3', label: 'Diameter 3 (D3)', kw: ['d3'] }, { id: '_sys_d4', label: 'Diameter 4 (D4)', kw: ['d4'] },
        { id: '_sys_l1', label: 'Length 1 (L1)', kw: ['l1'] }, { id: '_sys_l2', label: 'Length 2 (L2)', kw: ['l2'] },
        { id: '_sys_l3', label: 'Length 3 (L3)', kw: ['l3'] }, { id: '_sys_l4', label: 'Length 4 (L4)', kw: ['l4'] }
    ];

    document.getElementById('den-map-id-body').innerHTML = grp1.map(r => createRow(r.id, r.label, r.kw, 'mandatory')).join('');
    document.getElementById('den-map-weight-body').innerHTML = grp2.map(r => createRow(r.id, r.label, r.kw, 'mandatory')).join('');
    document.getElementById('den-map-arc-body').innerHTML = grp3.map(r => createRow(r.id, r.label, r.kw, 'arc')).join('');
    document.getElementById('den-map-caliper-body').innerHTML = grp4.map(r => createRow(r.id, r.label, r.kw, 'cal')).join('');

    document.getElementById('modal-den-mapper').classList.remove('hidden');
    window.validateDensityMapping();
    if(typeof lucide !== 'undefined') lucide.createIcons();
};

window.updateDenPreview = function(sel) {
    const val = sel.value;
    const tr = sel.closest('tr');
    const preview = tr.querySelector('.den-preview-cell');
    if (val) {
        const txt = tempDensityImportData.data.slice(0, 2).map(r => String(r[val]).substring(0,10) || '-').join(' | ');
        preview.textContent = txt; preview.title = txt;
        tr.classList.add('bg-blue-50/30');
    } else {
        preview.textContent = '-'; tr.classList.remove('bg-blue-50/30');
    }
    window.validateDensityMapping();
};

window.validateDensityMapping = function() {
    const getVal = (sysId) => document.querySelector(`.den-mapper-row[data-sys="${sysId}"] select`).value;
    
    let isMandatoryOk = true;
    document.querySelectorAll('.den-mapper-row[data-group="mandatory"] select').forEach(s => { if(!s.value) isMandatoryOk = false; });

    let hasArc = getVal('_sys_wax') && getVal('_sys_water');
    let hasCal = (getVal('_sys_d1') || getVal('_sys_d2') || getVal('_sys_d3') || getVal('_sys_d4')) && 
                 (getVal('_sys_l1') || getVal('_sys_l2') || getVal('_sys_l3') || getVal('_sys_l4'));

    const btn = document.getElementById('btn-exec-den-import');
    const status = document.getElementById('den-mapper-status');

    if (isMandatoryOk && (hasArc || hasCal)) {
        btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed');
        status.textContent = "Ready to execute Calculation!";
        status.className = "text-[11px] text-teal-600 font-black tracking-wide";
    } else {
        btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed');
        if (!isMandatoryOk) {
            status.textContent = "Missing mandatory identifiers/weights (*)";
            status.className = "text-[11px] text-rose-500 font-bold italic";
        } else {
            status.textContent = "Require at least Archimedes (Wax+Water) OR Caliper (D+L) params.";
            status.className = "text-[11px] text-amber-600 font-bold italic";
        }
    }
};

window.executeDensityImport = function() {
    document.getElementById('modal-den-mapper').classList.add('hidden');
    showLoader("Processing Data", "Normalizing schema and caching raw measurements...");

    setTimeout(() => {
        const mapDict = {};
        document.querySelectorAll('.den-mapper-row').forEach(tr => {
            const sysId = tr.getAttribute('data-sys');
            const sourceCol = tr.querySelector('select').value;
            if (sourceCol) mapDict[sysId] = sourceCol;
        });

        const baseData = tempDensityImportData.data.map((r, idx) => {
            let dVals = [], lVals = [];
            for(let i=1; i<=4; i++) {
                if(mapDict[`_sys_d${i}`]) {
                    let v = parseCleanNumber(r[mapDict[`_sys_d${i}`]]);
                    if(!isNaN(v) && v > 0) dVals.push(v);
                }
                if(mapDict[`_sys_l${i}`]) {
                    let v = parseCleanNumber(r[mapDict[`_sys_l${i}`]]);
                    if(!isNaN(v) && v > 0) lVals.push(v);
                }
            }
            let caliperVol = NaN;
            if (dVals.length > 0 && lVals.length > 0) {
                let dAvg = dVals.reduce((a,b)=>a+b,0) / dVals.length;
                let lAvg = lVals.reduce((a,b)=>a+b,0) / lVals.length;
                caliperVol = Math.PI * Math.pow(dAvg / 2.0, 2) * lAvg;
            }

            return {
                id: r[mapDict['_sys_id']] || `S-${idx+1}`, 
                from: parseCleanNumber(r[mapDict['_sys_from']]), 
                to: parseCleanNumber(r[mapDict['_sys_to']]), 
                litho: (r[mapDict['_sys_lito']] || 'UNKNOWN').toUpperCase(), 
                rawWet: parseCleanNumber(r[mapDict['_sys_wet']]),
                rawDry: parseCleanNumber(r[mapDict['_sys_dry']]),
                rawWax: mapDict['_sys_wax'] ? parseCleanNumber(r[mapDict['_sys_wax']]) : NaN,
                rawWater: mapDict['_sys_water'] ? parseCleanNumber(r[mapDict['_sys_water']]) : NaN,
                rawCaliperVol: caliperVol,
                origNote: r['Remarks'] || r['Description'] || ''
            };
        });

        densityState.processedData = baseData;
        tempDensityImportData = { headers: [], data: [] }; // Clear RAM
        
        window.recalculateDensity();
    }, 500);
};

window.recalculateDensity = function(disableAnim = false) {
    if (!densityState.processedData || densityState.processedData.length === 0) return;

    // Deteksi apakah ini data dari .hsn lama
    const isLegacy = densityState.processedData[0].rawWet === undefined;

    const waxDensity = parseFloat(document.getElementById('waxDensityVal')?.value) || 0.90;
    const mcLimit = parseFloat(document.getElementById('mcLimitVal')?.value) || 70;
    const rulePhys = document.getElementById('den-rule-phys')?.checked;
    const ruleMc = document.getElementById('den-rule-mc')?.checked;

    densityState.waxDensity = waxDensity;
    densityState.config = { rulePhys, ruleMc, mcLimit };

    let anomalies = 0, validCount = 0, sumDry = 0, sumWet = 0, sumMc = 0, mcCount = 0;

    densityState.processedData.forEach(d => {
        let status = 'PASS', sysMsg = '';
        
        // PENGAMANAN DATA LAMA VS BARU
        let method = isLegacy ? d.method : 'N/A';
        let vol = isLegacy ? d.vol : NaN;
        let sgDry = isLegacy ? d.sgDry : NaN;
        let sgWet = isLegacy ? d.sgWet : NaN;
        let mc = isLegacy ? d.mc : NaN;
        let wet = isLegacy ? d.wet : d.rawWet;
        let dry = isLegacy ? d.dry : d.rawDry;

        // KALKULASI ULANG VOLUME HANYA JIKA BUKAN DATA LAMA
        if (!isLegacy) {
            if (wet > 0 && dry > 0) mc = ((wet - dry) / wet) * 100;
            if (!isNaN(d.rawWax) && !isNaN(d.rawWater)) {
                method = 'Archimedes';
                if (!isNaN(dry)) vol = (d.rawWax - d.rawWater) - ((d.rawWax - dry) / waxDensity);
            } else if (!isNaN(d.rawCaliperVol)) {
                method = 'Caliper'; vol = d.rawCaliperVol;
            } else {
                status = 'ERROR'; sysMsg = "Missing Volumetric Data";
            }
            if (vol > 0) { sgDry = dry / vol; sgWet = wet / vol; }
        } else {
            // Evaluasi ulang data lama untuk keperluan rule checking
            if (isNaN(sgDry)) { status = 'ERROR'; sysMsg = "Missing Volumetric Data"; }
        }

        // EVALUASI RULES (Berlaku untuk data baru DAN data lama)
        if (status !== 'ERROR') {
            if (isNaN(sgDry) || sgDry < 0.5 || sgDry > 4.5) { status = 'ERROR'; sysMsg = "Extreme SG / Invalid Calc"; anomalies++; }
            else if (rulePhys && sgDry > sgWet) { status = 'ERROR'; sysMsg = "Dry > Wet SG"; anomalies++; }
            else if (ruleMc && mc > mcLimit) { status = 'WARNING'; sysMsg = `MC > ${mcLimit}%`; anomalies++;}
            else { validCount++; sumDry += sgDry; if(!isNaN(sgWet)) sumWet += sgWet; if(!isNaN(mc)) { sumMc += mc; mcCount++; } }
        } else {
            anomalies++;
        }

        let combinedNote = sysMsg ? `<span class="text-rose-600 font-bold block leading-tight mb-1">${sysMsg}</span>` : "";
        if (d.origNote) combinedNote += `<span class="text-slate-500 italic block leading-tight">${d.origNote}</span>`;

        d.method = method; d.wet = wet; d.dry = dry; d.vol = vol; d.sgDry = sgDry; d.sgWet = sgWet; d.mc = mc; d.status = status; d.msg = combinedNote || "-";
    });

    densityState.stats = { total: densityState.processedData.length, avgSgDry: validCount ? sumDry/validCount : 0, avgSgWet: validCount ? sumWet/validCount : 0, avgMc: mcCount ? sumMc/mcCount : 0, anomalies };
    
    renderDensityDashboard(disableAnim);
    
    document.getElementById('den-btn-pdf')?.classList.remove('hidden');
    document.getElementById('den-btn-inject')?.classList.remove('hidden');
    if(typeof hideLoader === 'function') hideLoader();
};

function renderDensityDashboard(disableAnim = false) {
    const emptyState = document.getElementById('density-empty-state');
    const dashboard = document.getElementById('density-dashboard-content');

    if (!densityState.processedData || densityState.processedData.length === 0) {
        if (emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
        if (dashboard) { dashboard.classList.add('hidden'); dashboard.classList.remove('flex'); }
        return;
    } else {
        if (emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
        if (dashboard) { dashboard.classList.remove('hidden'); dashboard.classList.add('flex'); }
    }

    document.getElementById('den-stat-total').textContent = densityState.stats.total;
    document.getElementById('den-stat-sgdry').textContent = densityState.stats.avgSgDry ? densityState.stats.avgSgDry.toFixed(2) : '-';
    document.getElementById('den-stat-mc').textContent = densityState.stats.avgMc ? densityState.stats.avgMc.toFixed(1) + '%' : '-';
    document.getElementById('den-stat-anomalies').textContent = densityState.stats.anomalies;

    const valid = densityState.processedData.filter(d => d.status !== 'ERROR' && !isNaN(d.sgDry));
    renderBasicStatsTable(valid);
    renderGroupStatsTable(valid);
    renderDensityCharts(valid, disableAnim);

    const tbody = document.getElementById('densityTableBody');
    if (tbody) {
        tbody.innerHTML = densityState.processedData.map(d => {
            let rowCls = 'hover:bg-slate-50', badgeCls = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
            if (d.status === 'ERROR') { rowCls = 'bg-rose-50/50 hover:bg-rose-50'; badgeCls = 'bg-rose-100 text-rose-700 border border-rose-200'; }
            else if (d.status === 'WARNING') { rowCls = 'bg-amber-50/50 hover:bg-amber-50'; badgeCls = 'bg-amber-100 text-amber-700 border border-amber-200'; }

            // FIX BUGS: Atasi masalah nilai 'null' menjadi strip '-'
            const showFrom = (d.from === null || isNaN(d.from)) ? '-' : d.from;
            const showTo = (d.to === null || isNaN(d.to)) ? '-' : d.to;

            return `<tr class="${rowCls} transition-colors border-b border-slate-100 text-slate-700">
                <td class="px-4 py-2"><span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badgeCls}">${d.status}</span></td>
                <td class="px-4 py-2 font-bold text-slate-800">${d.id}</td>
                <td class="px-4 py-2 font-mono text-slate-500">${showFrom}</td>
                <td class="px-4 py-2 font-mono text-slate-500">${showTo}</td>
                <td class="px-4 py-2 font-semibold text-slate-600">${d.litho}</td>
                <td class="px-4 py-2 text-[10px] uppercase font-bold text-slate-500">${d.method}</td>
                <td class="px-4 py-2 font-bold font-mono text-slate-800">${isNaN(d.sgDry) ? '-' : d.sgDry.toFixed(3)}</td>
                <td class="px-4 py-2 font-mono text-slate-600">${isNaN(d.sgWet) ? '-' : d.sgWet.toFixed(3)}</td>
                <td class="px-4 py-2 font-mono text-slate-600">${isNaN(d.mc) ? '-' : d.mc.toFixed(2)}</td>
                <td class="px-4 py-2 text-[10px] text-left leading-relaxed whitespace-normal max-w-[250px]">${d.msg ? d.msg : '-'}</td>
            </tr>`;
        }).join('');
    }
}

function renderBasicStatsTable(validData) {
    const metrics = ['Count', 'Mean', 'Median', 'Min', 'Max', 'Stdev'];
    const cols = ['sgDry', 'sgWet', 'mc'];
    const body = document.getElementById('den-basic-stats-body');
    if(!body) return;
    body.innerHTML = metrics.map(m => {
        let h = `<tr><td class="p-3 font-bold bg-slate-50/50 border-r border-slate-100">${m}</td>`;
        cols.forEach(c => {
            const vals = validData.map(d => d[c]).filter(v => !isNaN(v)).sort((a,b)=>a-b);
            let val = '-';
            if (vals.length > 0) {
                if(m === 'Count') val = vals.length;
                else if(m === 'Mean') val = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3);
                else if(m === 'Median') val = vals[Math.floor(vals.length/2)]?.toFixed(3);
                else if(m === 'Min') val = vals[0]?.toFixed(3);
                else if(m === 'Max') val = vals[vals.length-1]?.toFixed(3);
                else if(m === 'Stdev') {
                    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
                    val = Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/vals.length).toFixed(3);
                }
            }
            h += `<td class="p-3 font-mono border-r border-slate-100">${val}</td>`;
        });
        return h + '</tr>';
    }).join('');
}

function renderGroupStatsTable(validData) {
    const groups = {}; validData.forEach(d => { if(!groups[d.litho]) groups[d.litho] = []; groups[d.litho].push(d); });
    const body = document.getElementById('den-group-stats-body');
    if(!body) return;
    body.innerHTML = Object.entries(groups).map(([litho, arr]) => {
        const count = arr.length, mSg = arr.reduce((s, d) => s + d.sgDry, 0) / count;
        const cv = (Math.sqrt(arr.reduce((s,d)=>s+Math.pow(d.sgDry-mSg,2),0)/count) / mSg).toFixed(3);
        const cvWarning = cv > 0.1 ? 'text-amber-600 font-bold' : 'text-slate-600';
        return `<tr><td class="p-3 font-bold border-r border-slate-100 text-slate-800">${litho}</td><td class="p-3 border-r border-slate-100 font-mono text-slate-600">${count}</td><td class="p-3 font-bold font-mono text-slate-800 border-r border-slate-100">${mSg.toFixed(3)}</td><td class="p-3 border-r border-slate-100 font-mono text-slate-600">${(arr.reduce((s,d)=>s+d.mc,0)/count).toFixed(2)}%</td><td class="p-3 font-mono ${cvWarning}">${cv}</td></tr>`;
    }).join('');
}

function renderDensityCharts(validData, disableAnim) {
    if (typeof Chart === 'undefined') return;

    const palette = ['#0f766e', '#0369a1', '#be123c', '#b45309', '#4338ca', '#4d7c0f', '#a21caf', '#334155'];
    const domains = [...new Set(validData.map(d => d.litho))];
    const getColor = (index) => palette[index % palette.length];

    const sgDry = validData.map(d => d.sgDry);
    const labels = validData.map(d => d.id);
    
    const chartFont = { family: "'Inter', sans-serif", size: 10, color: '#64748b' };
    const gridStyle = { color: '#f1f5f9' };
    const updateMode = disableAnim ? 'none' : 'default';

    const groupedOptions = { 
        responsive: true, maintainAspectRatio: false, animation: disableAnim ? false : {duration: 500},
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 8, font: { size: 10, family: "'Inter', sans-serif" }, padding: 15, color: '#475569' } }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 10, cornerRadius: 4 } }, 
        layout: { padding: 10 } 
    };
    const commonNoLegend = { ...groupedOptions, plugins: { ...groupedOptions.plugins, legend: { display: false } } };

    // 1. Histogram
    const ctxHist = document.getElementById('den-chart-hist')?.getContext('2d');
    if(ctxHist) {
        const bins = 15; const min = Math.min(...sgDry) || 0, max = Math.max(...sgDry) || 1;
        const step = (max - min) / bins;
        const histData = Array(bins).fill(0);
        sgDry.forEach(v => { let b = Math.min(Math.floor((v - min) / step), bins - 1); histData[b]++; });
        const histLabels = Array(bins).fill(0).map((_,i)=>(min+(i*step)).toFixed(2));
        
        let exHist = Chart.getChart('den-chart-hist');
        if(exHist) {
            exHist.data.labels = histLabels; exHist.data.datasets[0].data = histData; exHist.update(updateMode);
        } else {
            densityState.charts.hist = new Chart(ctxHist, { type: 'bar', data: { labels: histLabels, datasets: [{ data: histData, backgroundColor: '#94a3b8', borderRadius: 2 }] }, options: { ...commonNoLegend, scales: { x: { grid: {display: false}, ticks: { font: chartFont } }, y: { grid: gridStyle, ticks: { font: chartFont } } } } });
        }
    }

    // 2. Boxplot (Plotly React)
    const boxDiv = document.getElementById('den-chart-box');
    if(boxDiv && typeof Plotly !== 'undefined') {
        const traces = domains.map((dom, index) => ({ 
            y: validData.filter(d => d.litho === dom).map(d => d.sgDry), 
            name: dom, type: 'box', boxpoints: 'all', jitter: 0.3, 
            marker: { size: 3, color: getColor(index) }, line: { width: 1.5 } 
        }));
        const layout = { margin: { t: 10, b: 40, l: 40, r: 10 }, autosize: true, plot_bgcolor: 'transparent', paper_bgcolor: 'transparent', xaxis: { tickfont: { size: 10, color: '#64748b' }, tickangle: -25, automargin: true, showgrid: false }, yaxis: { tickfont: { size: 10, color: '#64748b' }, automargin: true, gridcolor: '#f1f5f9' }, showlegend: false };
        Plotly.react(boxDiv, traces, layout, { responsive: true, displayModeBar: false });
    }

    // 3. Scatter
    const scatterCtx = document.getElementById('den-chart-scatter')?.getContext('2d');
    if(scatterCtx) {
        const datasets = domains.map((dom, i) => ({
            label: dom, data: validData.filter(d => d.litho === dom).map(d => ({x: d.sgDry, y: d.sgWet})),
            backgroundColor: getColor(i), pointRadius: 3.5, pointHoverRadius: 5
        }));
        let exScat = Chart.getChart('den-chart-scatter');
        if(exScat) { exScat.data.datasets = datasets; exScat.update(updateMode); }
        else { densityState.charts.scatter = new Chart(scatterCtx, { type: 'scatter', data: { datasets: datasets }, options: { ...groupedOptions, scales: { x: { grid: gridStyle, title: { display: true, text: 'SG Dry', font: chartFont, color: '#475569' }, ticks: {font: chartFont} }, y: { grid: gridStyle, title: { display: true, text: 'SG Wet', font: chartFont, color: '#475569' }, ticks: {font: chartFont} } } } }); }
    }

    // 4. Depth
    const depCtx = document.getElementById('den-chart-depth')?.getContext('2d');
    if(depCtx) {
        const datasets = domains.map((dom, i) => ({
            label: dom, data: validData.filter(d => d.litho === dom).map(d => ({ x: d.sgDry, y: (!isNaN(d.from) && !isNaN(d.to)) ? (d.from + d.to)/2 : 0 })),
            backgroundColor: getColor(i), pointRadius: 3.5, pointHoverRadius: 5
        }));
        let exDep = Chart.getChart('den-chart-depth');
        if(exDep) { exDep.data.datasets = datasets; exDep.update(updateMode); }
        else { densityState.charts.depth = new Chart(depCtx, { type: 'scatter', data: { datasets: datasets }, options: { ...groupedOptions, scales: { x: { grid: gridStyle, title: { display: true, text: 'SG Dry', font: chartFont, color: '#475569' }, ticks: {font: chartFont} }, y: { reverse: true, grid: gridStyle, title: { display: true, text: 'Depth (m)', font: chartFont, color: '#475569' }, ticks: {font: chartFont} } } } }); }
    }

    // 5. Rel Diff
    const relCtx = document.getElementById('den-chart-rel')?.getContext('2d');
    if(relCtx) {
        let counter = 0;
        const datasets = domains.map((dom, i) => {
            const mappedData = validData.filter(d => d.litho === dom).map(d => { const pt = { x: counter, y: d.wet - d.dry }; counter++; return pt; });
            return { label: dom, data: mappedData, backgroundColor: getColor(i), pointRadius: 3.5, pointHoverRadius: 5 };
        });
        let exRel = Chart.getChart('den-chart-rel');
        if(exRel) { exRel.data.datasets = datasets; exRel.update(updateMode); }
        else { densityState.charts.rel = new Chart(relCtx, { type: 'scatter', data: { datasets: datasets }, options: { ...groupedOptions, scales: { x: { display: false }, y: { grid: gridStyle, title: { display: true, text: 'Absolute Difference (g)', font: chartFont, color: '#475569' }, ticks: {font: chartFont} } } } }); }
    }

    // 6. Control Chart
    const ctxCtrl = document.getElementById('den-chart-control')?.getContext('2d');
    if(ctxCtrl) {
        const mean = sgDry.reduce((a,b)=>a+b,0)/(sgDry.length || 1);
        const std = Math.sqrt(sgDry.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(sgDry.length || 1)) || 1;
        const zScores = sgDry.map(v => (v - mean) / std);
        let exCtrl = Chart.getChart('den-chart-control');
        const ds = [ 
            { label: 'Z-Score', data: zScores, borderColor: '#64748b', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 1.5, pointHoverRadius: 4, fill: false }, 
            { label: '+3 SD', data: Array(labels.length).fill(3), borderColor: '#e11d48', backgroundColor: 'transparent', borderDash: [4,4], borderWidth: 1, pointRadius: 0, fill: false }, 
            { label: '-3 SD', data: Array(labels.length).fill(-3), borderColor: '#e11d48', backgroundColor: 'transparent', borderDash: [4,4], borderWidth: 1, pointRadius: 0, fill: false } 
        ];
        if(exCtrl) { exCtrl.data.labels = labels; exCtrl.data.datasets = ds; exCtrl.update(updateMode); }
        else { densityState.charts.control = new Chart(ctxCtrl, { type: 'line', data: { labels: labels, datasets: ds }, options: { ...commonNoLegend, scales: { y: { grid: gridStyle, min: -4, max: 4, title: { display: true, text: 'Z-Score (SD)', font: chartFont, color: '#475569' }, ticks: {font: chartFont} }, x: { display: false } } } }); }
    }
}

// --- INTEGRATION & PDF ---
window.mergeDensityToDatabase = function() {
    if (!densityState.processedData.length || !state.rawData.length) return;
    
    let count = 0;
    const domainSums = { LIM: { sum: 0, count: 0 }, SAP: { sum: 0, count: 0 }, BRK: { sum: 0, count: 0 } };

    densityState.processedData.forEach(d => {
        if (d.status === 'ERROR') return;
        
        const target = state.rawData.find(r => 
            String(r[state.coreCols.holeId]).trim().toUpperCase() === String(d.id).trim().toUpperCase() && 
            Math.abs(parseFloat(r[state.coreCols.from]) - d.from) < 0.01
        );
        
        if (target) { 
            target['SG'] = d.sgDry.toFixed(3); 
            target['MC_pct'] = isNaN(d.mc) ? '' : d.mc.toFixed(2); 
            count++; 
        }

        let stdDom = 'UNKNOWN';
        const rawLitho = String(d.litho).toUpperCase();
        
        if (rawLitho.includes('LIM')) stdDom = 'LIM';
        else if (rawLitho.includes('SAP')) stdDom = 'SAP';
        else if (rawLitho.includes('BRK') || rawLitho.includes('BED') || rawLitho.includes('ROCK')) stdDom = 'BRK';

        if (domainSums[stdDom]) {
            domainSums[stdDom].sum += d.sgDry;
            domainSums[stdDom].count++;
        }
    });

    ['LIM', 'SAP', 'BRK'].forEach(dom => {
        const avg = domainSums[dom].count > 0 ? (domainSums[dom].sum / domainSums[dom].count) : null;
        const inputEl = document.getElementById(`sg-${dom.toLowerCase()}`);
        
        if (avg) {
            const finalAvg = parseFloat(avg.toFixed(2));
            if (typeof state !== 'undefined' && state.sgParams) {
                state.sgParams[dom] = finalAvg;
            }
            if (inputEl) {
                inputEl.value = finalAvg;
                inputEl.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700');
                inputEl.title = "Updated from Density Lab Data (Validated)";
            }
        }
    });

    if(typeof showToast === 'function') showToast(`Successfully injected ${count} records and updated Domain averages!`, "success");
    if(typeof renderData === 'function') renderData();
}

async function generateDensityPdf() {
    if(typeof showLoader === 'function') showLoader("Preparing PDF", "Rendering High-Resolution Dashboard...");
    try {
        const dashboard = document.getElementById('tab-density');
        const origStyle = dashboard.getAttribute('style') || '';
        
        dashboard.style.width = '1200px'; 
        dashboard.style.height = 'max-content'; 
        dashboard.style.overflow = 'visible';
        dashboard.style.position = 'fixed'; 
        dashboard.style.top = '0'; 
        dashboard.style.left = '0'; 
        dashboard.style.zIndex = '9999'; 
        dashboard.style.backgroundColor = '#ffffff'; 
        dashboard.classList.remove('hidden');
        
        Object.values(densityState.charts).forEach(c => { if(c) c.resize(); });
        const box = document.getElementById('den-chart-box'); if (box && typeof Plotly !== 'undefined') Plotly.Plots.resize(box);
        
        await new Promise(r => setTimeout(r, 800));
        
        const canvas = await html2canvas(dashboard, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
        
        dashboard.setAttribute('style', origStyle);
        if (!document.getElementById('btn-density').classList.contains('active-left-nav')) dashboard.classList.add('hidden');
        
        const jsPDFClass = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        const tempPdf = new jsPDFClass('p', 'mm', 'a4');
        const pageWidth = tempPdf.internal.pageSize.getWidth();
        const pageHeight = tempPdf.internal.pageSize.getHeight();
        
        const imgW = pageWidth - 20;
        const imgH = (canvas.height * imgW) / canvas.width;
        
        let pdf;
        if (imgH > pageHeight - 30) {
            pdf = new jsPDFClass('p', 'mm', [210, imgH + 40]);
        } else {
            pdf = tempPdf;
        }

        pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); 
        pdf.text("Density & Specific Gravity Validation Report", 105, 15, { align: 'center' });
        pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 10, 25, imgW, imgH);
        
        pdf.save('Density_Validation_Report.pdf');
        if(typeof showToast === 'function') showToast("Report successfully downloaded.", "success");
    } catch(e) { 
        console.error(e); 
        if(typeof showToast === 'function') showToast("Failed to generate PDF.", "error");
    } finally { 
        if(typeof hideLoader === 'function') hideLoader(); 
    }
}

function parseCleanNumber(v) { 
    if (v === undefined || v === null || v === '') return NaN; 
    const p = parseFloat(v.toString().replace(/,/g, '.'));
    return isNaN(p) ? NaN : p;
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', injectDensityUI); } else { injectDensityUI(); }