// ============================================================================
// 9_GLOBAL_MODALS.JS - Context-Aware Help, Settings, & About Engine
// Developed by: Muhammad Hasan, Development Geology
// Optimized with Real LocalStorage Integration & Advanced Geological Theory
// ============================================================================

// --- 1. SETTINGS & ABOUT MODAL LOGIC ---

// Mengambil pengaturan dari LocalStorage saat sistem pertama kali dimuat
document.addEventListener('DOMContentLoaded', () => {
    const savedAutoSave = localStorage.getItem('nicore_autosave');
    const savedZone = localStorage.getItem('nicore_utm_zone');
    const savedHemi = localStorage.getItem('nicore_utm_hemi');

    if (savedAutoSave !== null) {
        const autoSaveEl = document.getElementById('set-autosave');
        if (autoSaveEl) autoSaveEl.checked = savedAutoSave === 'true';
    }

    // Auto-generate dropdown options untuk Zona 1-60
    const zoneSelect = document.getElementById('setting-utm-zone');
    if (zoneSelect) {
        let optionsHtml = '';
        const defaultZone = savedZone !== null ? parseInt(savedZone) : 51;
        for (let i = 1; i <= 60; i++) {
            let isSelected = (i === defaultZone) ? 'selected' : '';
            optionsHtml += `<option value="${i}" ${isSelected}>Zone ${i}</option>`;
        }
        zoneSelect.innerHTML = optionsHtml;
    }

    // Set Hemisphere
    if (savedHemi !== null) {
        const hemiSelect = document.getElementById('setting-utm-hemi');
        if (hemiSelect) hemiSelect.value = savedHemi;
    }
});

window.openSettingsModal = function() {
    document.getElementById('modal-global-settings').classList.remove('hidden');
};

window.closeSettingsModal = function() {
    document.getElementById('modal-global-settings').classList.add('hidden');
};

window.saveGlobalSettings = function() {
    const autoSaveEl = document.getElementById('set-autosave');
    const zoneSelect = document.getElementById('setting-utm-zone');
    const hemiSelect = document.getElementById('setting-utm-hemi');

    let epsgCode = "EPSG:32751"; // Default fallback
    let utmString = "51S";

    if (autoSaveEl) {
        localStorage.setItem('nicore_autosave', autoSaveEl.checked);
    }
    
    if (zoneSelect && hemiSelect) {
        const zoneNum = zoneSelect.value;
        const hemi = hemiSelect.value;
        
        utmString = zoneNum + hemi;
        const epsgPrefix = hemi === 'N' ? 32600 : 32700;
        epsgCode = `EPSG:${epsgPrefix + parseInt(zoneNum)}`;
        
        localStorage.setItem('nicore_utm_zone', zoneNum);
        localStorage.setItem('nicore_utm_hemi', hemi);
        localStorage.setItem('nicore_epsg', epsgCode);

        if (typeof state !== 'undefined') {
            state.utmZone = utmString;
            state.epsgCode = epsgCode;
        }
    }

    if(typeof showToast === 'function') {
        showToast(`Global Settings saved. Map projected to ${utmString} (${epsgCode}).`, "success");
    }
    closeSettingsModal();
};

window.openAboutModal = function() {
    document.getElementById('modal-about').classList.remove('hidden');
};
window.closeAboutModal = function() {
    document.getElementById('modal-about').classList.add('hidden');
};

// --- 2. BILINGUAL HELP & GUIDE ENGINE ---
let currentHelpLang = 'ID'; // Default Bahasa Indonesia

// Kamus Pengetahuan Geologi JORC per Modul (Software Engineering Edition)
const helpDictionary = {
    'upload': {
        title: { 
            ID: "Modul 1: Data Parsing & Workspace Initialization", 
            EN: "Module 1: Data Parsing & Workspace Initialization" 
        },
        steps: {
            ID: [
                "Klik 'New Project' pada panel Workspace untuk menginisialisasi lingkungan kerja (<i>runtime environment</i>) baru yang terisolasi.",
                "Isi parameter metadata (Nama Perusahaan, Klien, Lokasi, dan Geologist) yang akan digunakan sebagai <i>header</i> global pada seluruh laporan PDF dan Excel.",
                "Unggah file CSV database master melalui tombol <i>Input File</i>. Mesin akan menjalankan <i>stream reader</i> asinkron untuk mem-<i>parsing</i> matriks tabular Collar, Survey, Lithology, dan Assay secara bersamaan.",
                "Pantau <i>Engine Monitor</i> (Indikator RAM dan Data Rows) untuk memverifikasi alokasi memori <i>JS Heap</i> berjalan tanpa <i>memory leak</i>.",
                "Gunakan fungsi <b>Save Project</b> secara rutin untuk mem-<i>bundle</i> seluruh progress dan komputasi (State, DTM, dan Charts) ke dalam file tunggal <b>.hsn</b> tanpa membutuhkan server eksternal."
            ],
            EN: [
                "Click 'New Project' on the Workspace panel to initialize a new, isolated runtime environment.",
                "Input metadata parameters (Company, Client, Location, and Geologist) which will be strictly compiled as global headers across all PDF and Excel reports.",
                "Upload the master database CSV via the <i>Input File</i> button. The engine triggers an asynchronous stream reader to seamlessly parse Collar, Survey, Lithology, and Assay tabular matrices.",
                "Audit the <i>Engine Monitor</i> (RAM and Data Rows indicators) to verify JavaScript Heap memory allocation operates flawlessly without data leakage.",
                "Utilize the <b>Save Project</b> function periodically to encapsulate all computational progress (States, DTMs, and Charts) into a singular <b>.hsn</b> blob payload, deprecating the need for external server dependencies."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Zero-Server Processing Architecture</h5>
                    <p class="text-sm text-slate-600">NiCore Studio bukan sekadar website konvensional. Sistem ini direkayasa menggunakan arsitektur <i>Pure Client-Side Computing</i>. Begitu halaman ini dimuat, 100% dari keseluruhan komputasi geostatistik yang berat dieksekusi murni di dalam <i>JavaScript Heap Memory</i> browser komputer lokal Anda. Tidak ada satu pun baris kode (API calls) yang mengirimkan muatan data ke cloud atau server. Ini menjamin protokol keamanan data absolut yang 100% offline dan anti sadap.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Relational Data Auto-Mapping</h5>
                    <p class="text-sm text-slate-600">Modul upload menanamkan mesin leksikal (<i>Lexical Auto-Mapping</i>) yang secara dinamis memindai header (judul kolom) data CSV Anda. Ia cerdas dalam menemukan kolom Primary Key (contoh: <code>Hole_ID</code> atau <code>BH_ID</code>), koordinat dimensi absolut (<code>Easting</code>, <code>Northing</code>, <code>RL</code>), serta indeks rentang vertikal spasial (<code>From</code>, <code>To</code>) tanpa mengharuskan Anda menggunakan format template CSV yang kaku.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Object State Rehydration (.HSN Encapsulation)</h5>
                    <p class="text-sm text-slate-600">Menghindari resiko hilangnya data saat browser memuat ulang secara tak sengaja, arsitektur State Management NiCore memungkinkan Anda membungkus (<i>serialize</i>) seluruh komputasi RAM aktif—termasuk render 3D, pengaturan variogram, dan parameter KNA—menjadi satu paket biner <b>.hsn</b>. Ketika di-load ulang, fungsi Rehydration akan membongkar file tersebut dan merekonstruksi seluruh state memori kembali ke detik persis saat Anda meninggalkannya.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Zero-Server Processing Architecture</h5>
                    <p class="text-sm text-slate-600">NiCore Studio transcends conventional web applications. It is engineered upon a <i>Pure Client-Side Computing</i> framework. Upon loading, 100% of intensive geostatistical computations are executed strictly within the local machine's <i>JavaScript Heap Memory</i> interface. Zero API calls are scripted to transmit data payloads to remote cloud servers, mathematically verifying an absolute, 100% offline data security protocol.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Relational Data Auto-Mapping</h5>
                    <p class="text-sm text-slate-600">The upload daemon injects a <i>Lexical Auto-Mapping</i> compiler that dynamically scans array headers within your CSV payload. It autonomously isolates Primary Keys (e.g., <code>Hole_ID</code> or <code>BH_ID</code>), absolute spatial dimension coordinates (<code>Easting</code>, <code>Northing</code>, <code>RL</code>), and vertical stratigraphic indices (<code>From</code>, <code>To</code>) without enforcing a rigid, predefined CSV template constraint.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Object State Rehydration (.HSN Encapsulation)</h5>
                    <p class="text-sm text-slate-600">To mitigate catastrophic data loss from accidental browser termination, NiCore's State Management architecture enables the complete serialization of active RAM computations—encompassing 3D rendering buffers, variogram vectors, and KNA matrices—into a singular <b>.hsn</b> binary blob. Upon reloading, the Rehydration protocol deserializes the payload, reconstructing the entire memory state flawlessly to the exact microsecond of its prior termination.</p>
                 </div>`
        }
    },
    'qaqc': {
        title: { 
            ID: "Modul 2A: Database Integrity & Sanitization", 
            EN: "Module 2A: Database Integrity & Sanitization" 
        },
        steps: {
            ID: [
                "Buka antarmuka <i>Database Validation</i> pada panel utama.",
                "Konfigurasi <i>Validation Rules</i> pada panel kanan (Blank, Negative, Zero/BDL, dan pendeteksi Spikes).",
                "Klik <i>Apply Filters</i> untuk memicu <i>Auto-Scan Pipeline</i> mencari anomali skalar dan tumpang-tindih kedalaman (Depth Overlap/Gap).",
                "Gunakan tombol <i>Auto-Fix BDL</i> untuk mengonversi teks limit deteksi (contoh: '<0.1') menjadi nilai absolut numerik secara presisi.",
                "Gunakan antarmuka <i>Edit Data</i> (UI Spreadsheet) untuk mengoreksi galat secara langsung pada memori."
            ],
            EN: [
                "Open the <i>Database Validation</i> interface on the main panel.",
                "Configure <i>Validation Rules</i> on the right panel (Blank, Negative, Zero/BDL, and Spike detection).",
                "Click <i>Apply Filters</i> to trigger the <i>Auto-Scan Pipeline</i> to identify scalar anomalies and depth Overlaps/Gaps.",
                "Use the <i>Auto-Fix BDL</i> action to mathematically convert text-based detection limits (e.g., '<0.1') into absolute numeric values.",
                "Utilize the <i>Data Editor</i> (Spreadsheet UI) to manually override critical anomalies directly in the active memory."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Algorithmic Depth Validation</h5>
                    <p class="text-sm text-slate-600">Mesin memindai logika interval kedalaman secara berurutan. Jika terdeteksi kalkulasi <code>To[i] &gt; From[i+1]</code>, status <i>Critical Error</i> (Overlap) memicu bendera merah karena duplikasi spasial dapat merusak integritas volume matriks Kriging.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Spike Heuristics</h5>
                    <p class="text-sm text-slate-600">Algoritma memonitor variansi lompatan skalar ekstrem (&gt; 100%) relatif dari interval atas dan bawahnya. Pendeteksian ini memfilter potensi anomali <i>floating-point</i> atau typo laboratorium ekspor CSV.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. BDL (Below Detection Limit) Parsing</h5>
                    <p class="text-sm text-slate-600">Mematuhi protokol pelaporan JORC mutlak, nilai batas deteksi bawah bertanda teks string seperti <code>&lt;</code> secara otomatis dikonversi menjadi rasio pecahan $x/2$ (contoh: input <code>&lt;0.02</code> dinormalisasi menjadi <code>0.01</code>) untuk menetralisir galat (NaN) pada fungsi variogram geostatistik.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Algorithmic Depth Validation</h5>
                    <p class="text-sm text-slate-600">The engine evaluates interval logic matrices sequentially. A <code>To[i] &gt; From[i+1]</code> boolean return triggers a Critical Error (Overlap) flag, preemptively preventing spatial volumetric duplication in the block model matrix.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Spike Heuristics</h5>
                    <p class="text-sm text-slate-600">The algorithm autonomously monitors for scalar leaps &gt; 100% relative to vertically adjacent intervals, isolating potential floating-point decimal laboratory export typos.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. BDL (Below Detection Limit) Parsing</h5>
                    <p class="text-sm text-slate-600">Adhering to absolute JORC reporting protocols, string-based Below Detection Limit arrays prefixed with <code>&lt;</code> are parsed down into fractional $x/2$ variables (e.g., <code>&lt;0.02</code> mutates to <code>0.01</code>) to mathematically sanitize Kriging interpolation routines from NaN exceptions.</p>
                 </div>`
        }
    },
    'qaqclab': {
        title: { 
            ID: "Modul 2B: Laboratory QA/QC Analytics", 
            EN: "Module 2B: Laboratory QA/QC Analytics" 
        },
        steps: {
            ID: [
                "Beralih ke antarmuka <i>Lab QA/QC</i> melalui navigasi tab.",
                "Pilih tipe kalibrasi uji laboratorium yang ingin dijalankan: <i>Blank</i>, <i>Duplicate</i>, atau <i>Standard (CRM)</i>.",
                "Unggah file dataset khusus laboratorium (CSV/XLSX) yang berisi penanda kolom <i>Remarks/Type</i>.",
                "Sesuaikan parameter analitik di panel kanan (contoh: Target Value CRM, Tolerance Limit, atau elemen unsur uji).",
                "Periksa hasil komputasi Z-Score dan presisi melalui grafik interaktif, lalu cetak laporan dengan tombol <i>Export PDF Report</i>."
            ],
            EN: [
                "Switch to the <i>Lab QA/QC</i> interface via the tab navigation.",
                "Select the laboratory calibration test module: <i>Blank</i>, <i>Duplicate</i>, or <i>Standard (CRM)</i>.",
                "Upload the specific laboratory dataset (CSV/XLSX) containing the <i>Remarks/Type</i> column string identifiers.",
                "Configure analytical parameters in the right panel (e.g., CRM Target Value, Tolerance Limit, or test elements).",
                "Audit the Z-Score and precision computations via interactive charts, then output the compilation utilizing the <i>Export PDF Report</i> button."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Blank Sample Diagnostics</h5>
                    <p class="text-sm text-slate-600">Memvalidasi tingkat kontaminasi preparasi sampel dari Lab. Threshold evaluasi kelulusan (Pass/Fail) dievaluasi murni berdasar batas toleransi skalar absolut (limit) per elemen mineral dari data yang bersih dari noise tekstual.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Duplicate (Precision) Matrix</h5>
                    <p class="text-sm text-slate-600">Membandingkan korelasi presisi nilai Original (ORI) vs Duplicate (DPL) menggunakan evaluasi Relative Difference: $\\frac{|O - D|}{(O + D) / 2} \\times 100$. Rasio persentase di bawah limit presisi sistem akan dinyatakan PASS. Secara spesifik, data bernilai sangat kecil (di bawah margin 5x Detection Limit) akan difilter untuk meredam bias asimtotik desimal ekstrem.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. CRM Standard (Accuracy)</h5>
                    <p class="text-sm text-slate-600">Mengevaluasi tingkat penyimpangan akurasi lab menggunakan komputasi deviasi standar berskala: $Z = \\frac{Lab - Target}{SD}$. Algoritma menerapkan aturan hukum kontrol batas kelulusan: <b>PASS</b> $(|Z| \\le 2)$, <b>WARNING</b> $(2 &lt; |Z| \\le 3)$, dan <b>FAIL</b> $(|Z| &gt; 3)$.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Blank Sample Diagnostics</h5>
                    <p class="text-sm text-slate-600">Validates laboratory preparation cross-contamination thresholds. Pass/Fail evaluation arrays are strictly processed against defined scalar tolerance limits per targeted element vector.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Duplicate (Precision) Matrix</h5>
                    <p class="text-sm text-slate-600">Evaluates Original (ORI) vs Duplicate (DPL) assay precision utilizing the Relative Difference formula: $\\frac{|O - D|}{(O + D) / 2} \\times 100$. Arrays falling below the designated precision limits return a PASS. Specifically, nodes evaluated below the 5x Detection Limit (DL) boundary are computationally excluded to suppress extreme asymptotic decimal bias.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. CRM Standard (Accuracy)</h5>
                    <p class="text-sm text-slate-600">Evaluates laboratory bias deviations by compiling scaled Standard Deviation metrics: $Z = \\frac{Lab - Target}{SD}$. The algorithm strictly adheres to control tolerance boundaries: <b>PASS</b> $(|Z| \\le 2)$, <b>WARNING</b> $(2 &lt; |Z| \\le 3)$, and <b>FAIL</b> $(|Z| &gt; 3)$.</p>
                 </div>`
        }
    },
    'topo': {
        title: { 
            ID: "Modul 3: Topography Validation & Spatial Interpolation", 
            EN: "Module 3: Topography Validation & Spatial Interpolation" 
        },
        steps: {
            ID: [
                "Unggah file dataset survei topografi (CSV/XLSX) melalui panel <i>Import Survey Dataset</i>.",
                "Set parameter <i>Vertical Tolerance (Z)</i> dalam meter untuk menentukan ambang batas deviasi elevasi timbunan (FILL) atau galian (CUT).",
                "Klik eksekusi untuk menjalankan fungsi pencarian jarak terdekat spasial (Nearest Neighbor) dan interpolasi nilai Z permukaan.",
                "Evaluasi tingkat korelasi (R² Confidence Score) pada grafik Scatter Plot sebelum dan sesudah koreksi.",
                "Mesin secara otomatis menerapkan elevasi baru (Corrected Z) ke database memori lubang bor dan memicu ulang eksekusi komputasi geologi selanjutnya."
            ],
            EN: [
                "Upload the topography survey dataset (CSV/XLSX) via the <i>Import Survey Dataset</i> panel.",
                "Set the <i>Vertical Tolerance (Z)</i> parameter in meters to define the threshold limits for overburden (FILL) or excavation (CUT) deviations.",
                "Execute the engine to run the Nearest Neighbor spatial search and surface Z-elevation interpolation.",
                "Evaluate the correlation variance (R² Confidence Score) on the Before and After Scatter Plots.",
                "The engine autonomously overwrites the collar database with the new elevation (Corrected Z) and triggers a refresh of downstream geological computations."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Inverse Distance Weighting (IDW) Interpolation</h5>
                    <p class="text-sm text-slate-600">Mesin spasial mencari 3 titik survei topografi terdekat dari koordinat X dan Y lubang bor aktual. Jika tidak ada titik yang persis bertumpukan secara spasial, sistem memicu komputasi IDW. Bobot elevasi dihitung berbanding terbalik dengan kuadrat jarak: $W = \\frac{1}{d^2}$.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Analisis Deviasi Vertikal (Fill/Cut)</h5>
                    <p class="text-sm text-slate-600">Algoritma mengevaluasi selisih antara elevasi bor orisinal melawan permukaan topografi yang diinterpolasi ($Diff = Drill_Z - Topo_Z$). Jika selisih positif melampaui toleransi, lokasi tersebut diklasifikasikan sebagai area timbunan (<b>FILL</b>). Sebaliknya, selisih negatif mengindikasikan area galian (<b>CUT</b>).</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Pearson Correlation Coefficient ($R^2$)</h5>
                    <p class="text-sm text-slate-600">Renderer grafik memvalidasi linieritas (goodness of fit) koordinat Z collar awal terhadap survei permukaan dengan mengkalkulasi regresi kuadrat terkecil matriks. Nilai $R^2 \\ge 0.90$ memverifikasi validitas Excellent.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Inverse Distance Weighting (IDW) Interpolation</h5>
                    <p class="text-sm text-slate-600">The spatial engine locates the 3 nearest topography nodes relative to the drill hole's absolute X, Y coordinates. If an exact overlapping node does not exist, the system triggers an IDW computation. The elevation weight is strictly inversely proportional to the squared distance: $W = \\frac{1}{d^2}$.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Vertical Deviation Analytics (Fill/Cut)</h5>
                    <p class="text-sm text-slate-600">The algorithmic compiler evaluates the delta between the raw drill collar elevation and the calculated interpolated surface ($Diff = Drill_Z - Topo_Z$). A positive scalar delta exceeding the tolerance indicates an overburden zone (<b>FILL</b>). A negative scalar dictates an excavated zone (<b>CUT</b>).</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Pearson Correlation Coefficient ($R^2$)</h5>
                    <p class="text-sm text-slate-600">The chart renderer validates the linearity (goodness of fit) of the original Z-collar coordinates against the surface survey by computing the least squares regression matrix. An $R^2 \\ge 0.90$ securely verifies Excellent validity.</p>
                 </div>`
        }
    },
    'domain': {
        title: { 
            ID: "Modul 4: Algorithmic Domaining & Geochemical Reconciliation", 
            EN: "Module 4: Algorithmic Domaining & Geochemical Reconciliation" 
        },
        steps: {
            ID: [
                "Tinjau panel <i>Pre-Domaining EDA</i> untuk melihat statistik global, peringatan Hanging Holes, dan anomali geokimia awal.",
                "Pilih algoritma klasifikasi: <i>Univariate</i> (Auto-Fit Percentiles) atau <i>Multivariate</i> (Run K-Means Clustering).",
                "Aktifkan opsi <i>Sub-Domain</i> jika Anda ingin memecah zona utama menjadi tipe material spesifik (contoh: Red Limonite, Rocky Saprolite).",
                "Klik <i>Cut & Classify</i> untuk mengeksekusi parameter dan menimpa klasifikasi domain ke dalam database aktif.",
                "Validasi hasil klasifikasi melalui Scatter Plot (dengan 95% Confidence Ellipse) dan periksa tabel <i>Parameter Selection Rationale</i> di bagian bawah untuk mengevaluasi rentang persentil atau nilai rata-rata centroid."
            ],
            EN: [
                "Review the <i>Pre-Domaining EDA</i> panel to audit global statistics, Hanging Holes warnings, and baseline geochemical anomalies.",
                "Select a classification algorithm: <i>Univariate</i> (Auto-Fit Percentiles) or <i>Multivariate</i> (Run K-Means Clustering).",
                "Toggle <i>Sub-Domain</i> parameters if aggressive categorization into specific material types is required (e.g., Red Limonite, Rocky Saprolite).",
                "Click <i>Cut & Classify</i> to execute the thresholds and override domain classifications within the active memory database.",
                "Validate classification outputs via Scatter Plots (featuring 95% Confidence Ellipses) and audit the <i>Parameter Selection Rationale</i> table to evaluate domain percentiles or centroid averages."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Algoritma Klasifikasi (Univariate vs Multivariate)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Univariate (Percentiles):</b> Mesin memindai distribusi skalar tunggal dan memotong probabilitas menggunakan batas persentil empiris (P70, P40, P80) untuk mendefinisikan batas statis.</li>
                        <li><b>Multivariate (K-Means):</b> Algoritma Unsupervised Machine Learning mengeksekusi komputasi Jarak Matriks Euclidean 3D terhadap array Fe, Ni, dan MgO yang dinormalisasi dengan Z-Score. Algoritma menggeser <i>Centroid</i> secara iteratif hingga menemukan batas patahan kimiawi alami.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Advanced Facies Sub-Domaining</h5>
                    <p class="text-sm text-slate-600">Sistem mengizinkan pemecahan (*splitting*) zona primer ke dalam sub-fasies pelapukan: <b>Red Limonite</b> (Fe sangat tinggi &gt; 45%), <b>Yellow Limonite</b>, <b>Soft Saprolite</b> (kaya Mg-Silicate), dan <b>Rocky Saprolite</b> (transisi menuju protolith dengan retensi MgO &ge; 20%). Fitur ini sangat penting untuk penentuan rasio <i>Slag</i> di pabrik (Smelter).</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Variansi & Parameter Rationale</h5>
                    <p class="text-sm text-slate-600">Setelah domain terbentuk, sistem memproyeksikan matriks Covariance menjadi <b>95% Confidence Ellipse</b> pada <i>Scatter Plot</i> untuk memastikan pemisahan data tidak saling tumpang tindih. Sistem juga merender tabel <b>Parameter Selection Rationale</b> secara dinamis, menampilkan distribusi persentil (Univariate) atau titik koordinat rata-rata klaster (Multivariate) sebagai landasan justifikasi teknis (JORC reporting).</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Classification Algorithms (Univariate vs Multivariate)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Univariate (Percentiles):</b> The engine scans single-scalar distributions and truncates probabilities using empirical percentile thresholds (P70, P40, P80) to define static boundaries.</li>
                        <li><b>Multivariate (K-Means):</b> The Unsupervised Machine Learning algorithm executes 3D Euclidean Matrix Distance computations across Z-Score normalized Fe, Ni, and MgO arrays. The algorithm iteratively shifts Centroids until it isolates the most natural chemical fracture bounds.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Advanced Facies Sub-Domaining</h5>
                    <p class="text-sm text-slate-600">The system permits secondary splitting of primary zones into specific weathering facies: <b>Red Limonite</b> (ultra-high Fe &gt; 45%), <b>Yellow Limonite</b>, <b>Soft Saprolite</b>, and <b>Rocky Saprolite</b> (transition protolith with MgO retention &ge; 20%). This granularity is critical for downstream metallurgical Slag ratio predictions.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Variance & Parameter Rationale</h5>
                    <p class="text-sm text-slate-600">Post-domaining, the engine projects Covariance matrices into <b>95% Confidence Ellipses</b> on the Scatter Plot to mathematically verify that data stratifications are structurally isolated. The system additionally renders a dynamic <b>Parameter Selection Rationale</b> table, outputting either percentile distributions (Univariate) or geometric cluster centroids (Multivariate) to serve as analytical justification for JORC reporting.</p>
                 </div>`
        }
    },
    'composite': {
        title: { 
            ID: "Modul 5: Downhole Compositing & Mass Balance", 
            EN: "Module 5: Downhole Compositing & Mass Balance" 
        },
        steps: {
            ID: [
                "Analisis <i>Smart Boundary</i> untuk menentukan rekomendasi parametrik: Hard Boundary (batas tegas) atau Soft Boundary (transisi/blend).",
                "Set parameter <i>Target Length</i> (resolusi dimensi vektor, standar: 1.0 meter) dan ambang batas minimum residu (%).",
                "Pilih <i>Action Method</i> (Distribute, Merge, Discard, Keep) untuk penanganan array sisa (residual tails).",
                "Eksekusi komputasi untuk menormalisasi panjang sampel menggunakan pembobotan massa (SG-Weighted Average).",
                "Validasi integritas <i>Mass Balance</i> pada tabel (pastikan Bias Mean &le; 1.5% dan Variance menurun), lalu ekspor 3D Modeler Excel Pack."
            ],
            EN: [
                "Analyze the <i>Smart Boundary</i> to retrieve algorithmic recommendations: Hard Boundary (strict limits) or Soft Boundary (transitional blending).",
                "Set the <i>Target Length</i> parameter (vector dimension resolution, standard: 1.0 meter) and minimum residual thresholds (%).",
                "Select an <i>Action Method</i> (Distribute, Merge, Discard, Keep) to handle residual array tails.",
                "Execute the computation to normalize sample lengths utilizing mass-weighting (SG-Weighted Average).",
                "Validate <i>Mass Balance</i> integrity on the table (ensuring Mean Bias &le; 1.5% and Variance drops), then export the 3D Modeler Excel Pack."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. SG-Weighted Equal Volume Support</h5>
                    <p class="text-sm text-slate-600">Mesin geostatistik mengasumsikan input data memiliki dimensi dan bobot massa yang seragam. Compositing adalah algoritma normalisasi data. Tidak seperti komposit konvensional, modul ini menerapkan pembobotan massa absolut (Volume × SG). Formula: $Grade_{comp} = \\frac{\\sum (Grade \\times Length \\times SG)}{\\sum (Length \\times SG)}$. Hal ini mutlak diperlukan pada nikel laterit karena perbedaan densitas yang drastis antar zona.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Boundary Modes (Hard vs Soft)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Hard Boundary:</b> Memaksa sub-sampling berhenti tepat saat menyentuh batas perubahan geologi (domain). Digunakan jika perubahan kadar antar litologi sangat kontras (gradien tajam).</li>
                        <li><b>Soft Boundary:</b> Mengabaikan batas kontak domain geologi dan terus melakukan blending interval. Dipakai jika terjadi gradasi kadar yang perlahan/transisional.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Residual Treatment (Garbage Collection)</h5>
                    <p class="text-sm text-slate-600">Penerapan <i>Hard Boundary</i> akan menyisakan sisa pecahan interval (*residual tails*) di ujung batas. Sistem menanganinya dengan 4 opsi <i>Action Method</i>:</p>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Merge:</b> Menggabungkan residu kecil ke dalam interval di atasnya (ideal untuk mencegah *micro-samples*).</li>
                        <li><b>Distribute:</b> Membagi rata ukuran sampel ke seluruh interval di dalam domain agar panjangnya konsisten tanpa ada sisa sedikit pun.</li>
                        <li><b>Discard:</b> Membuang (menghapus) residu jika ukurannya di bawah limit toleransi minimum (berpotensi *data loss*).</li>
                        <li><b>Keep:</b> Mempertahankan residu apa adanya sebagai sampel pendek.</li>
                    </ul>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. SG-Weighted Equal Volume Support</h5>
                    <p class="text-sm text-slate-600">Geostatistical solvers assume input data arrays possess uniform spatial dimensions and mass weights. Compositing is a data normalization algorithm. Unlike conventional routines, this engine enforces absolute mass-weighting (Volume × SG). Formula: $Grade_{comp} = \\frac{\\sum (Grade \\times Length \\times SG)}{\\sum (Length \\times SG)}$. This is an absolute prerequisite in laterite profiles due to severe inter-zonal density fluctuations.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Boundary Modes (Hard vs Soft)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Hard Boundary:</b> Aggressively terminates the sub-sampling loop the instant it encounters a geological contact. Deployed when chemical gradients between facies are extremely sharp.</li>
                        <li><b>Soft Boundary:</b> Ignores geological domains and forces continuous interval blending. Prescribed for gradual or transitional grade dispersions.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Residual Treatment (Garbage Collection)</h5>
                    <p class="text-sm text-slate-600">Enforcing a <i>Hard Boundary</i> inherently generates fractional interval remainders (residual tails) at boundary limits. The engine resolves this via 4 Action Methods:</p>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Merge:</b> Stitches tiny residuals directly into the preceding upper interval (ideal for preventing variance-skewing micro-samples).</li>
                        <li><b>Distribute:</b> Mathematically disperses the total interval length evenly across the bounded domain, resulting in zero remainders.</li>
                        <li><b>Discard:</b> Purges the residual if its length falls below the specified tolerance limit (risks localized data loss).</li>
                        <li><b>Keep:</b> Preserves the residual verbatim as an intentionally shortened sample.</li>
                    </ul>
                 </div>`
        }
    },
    'eda': {
        title: { 
            ID: "Modul 6: Advanced Exploratory Data Analysis (EDA)", 
            EN: "Module 6: Advanced Exploratory Data Analysis (EDA)" 
        },
        steps: {
            ID: [
                "Tinjau tabel <i>Univariate Statistics</i> untuk mengevaluasi parameter Declustered Mean, Coefficient of Variation (CV), dan Top-Cut 98%.",
                "Gunakan <i>Log-Probability Plot</i> untuk menginspeksi sebaran data dan ekor anomali (outliers tails). Jika perlu, terapkan batasan Manual Top-Cut.",
                "Evaluasi hubungan antar-unsur (misal: Fe vs Ni) menggunakan Correlation Heatmap dan Scatter Plots.",
                "Buka <i>Ternary Plot</i> untuk mengklasifikasikan fase pelapukan laterit atau pengayaan bijih menggunakan komposisi 3 unsur (misal: Fe-Ni-MgO).",
                "Analisis <i>Contact Analysis</i> antar dua domain (misal: LIM vs SAP) untuk menentukan sifat batas kontak (Hard/Soft), lalu gunakan Swath Plot untuk memverifikasi tren kadar secara spasial (X/Y/Z)."
            ],
            EN: [
                "Review the <i>Univariate Statistics</i> table to evaluate Declustered Mean, Coefficient of Variation (CV), and Top-Cut 98% parameters.",
                "Utilize the <i>Log-Probability Plot</i> to inspect data distribution and outlier tails. If necessary, apply a Manual Top-Cut constraint.",
                "Evaluate multi-element relationships (e.g., Fe vs Ni) utilizing the Correlation Heatmap and Scatter Plots.",
                "Access the <i>Ternary Plot</i> to classify lateritic weathering phases or ore enrichment utilizing 3-element compositions (e.g., Fe-Ni-MgO).",
                "Audit the <i>Contact Analysis</i> between two domains (e.g., LIM vs SAP) to determine boundary physics (Hard/Soft), then execute the Swath Plot to spatially verify grade trends across (X/Y/Z) axes."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Spatial Declustering & Outlier Truncation (Top-Cut)</h5>
                    <p class="text-sm text-slate-600">Sampel lubang bor pada area prospek tinggi seringkali sangat padat (clustered), memicu overestimation pada rata-rata aritmatika konvensional. Sistem mengatasi ini dengan membangun matriks poligon pembobotan spasial untuk merender <b>Declustered Mean</b> yang representatif secara volumetrik. Selanjutnya, anomali nilai desimal ekstrem akan merusak interpolasi. Sistem otomatis mengeksekusi algoritma pemotongan pada persentil 98 (Top-Cut 98%) untuk memangkas lonjakan data (spikes) dan meredam angka Coefficient of Variation (CV).</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Ternary Phase Geochemistry</h5>
                    <p class="text-sm text-slate-600">Diagram Ternary memetakan korelasi 3 sumbu unsur mineralogi untuk memvalidasi proses pembentukan bijih. Pada profil nikel laterit, diagram ini melacak trajektori unsur immobile vs mobile (contoh: Mg & Si yang tercuci vs Fe & Al yang tertinggal) untuk mendiagnosis zona Oxide Laterite, Clay Silicate, dan Hydrosilicate secara absolut berdasarkan komposisi kimianya.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Boundary Contact & Swath Analytics</h5>
                    <p class="text-sm text-slate-600"><b>Contact Analysis</b> merender perubahan kadar unsur pada jarak absolut saat melewati batas dua domain geologi. Gradien yang curam memvalidasi sifat patahan tegas (Hard Boundary), sedangkan gradien landai menandakan zona transisi (Soft Boundary). <b>Swath Plot</b> mengiris model blok secara orthogonal untuk memvalidasi bahwa tren distribusi kadar searah dengan sumbu kartesius tidak mengalami distorsi spasial berlebihan.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Spatial Declustering & Outlier Truncation (Top-Cut)</h5>
                    <p class="text-sm text-slate-600">Drill hole spatial nodes within high-grade prospect zones routinely cluster, triggering severe overestimations in conventional arithmetic means. The engine resolves this by compiling a spatial weighting polygon matrix to render a volumetrically true <b>Declustered Mean</b>. Furthermore, extreme decimal anomalies mathematically corrupt interpolation routines. The system autonomously executes a 98th-percentile truncation algorithm (Top-Cut 98%) to clamp data spikes and dampen the Coefficient of Variation (CV) matrices.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Ternary Phase Geochemistry</h5>
                    <p class="text-sm text-slate-600">Ternary diagrams plot 3-axis mineralogical correlations to mathematically validate ore genesis. In laterite profiles, this module tracks the trajectory of immobile vs mobile elements (e.g., leached Mg & Si vs residual Fe & Al) to absolutely diagnose Oxide Laterite, Clay Silicate, and Hydrosilicate zones strictly based on chemical footprints.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Boundary Contact & Swath Analytics</h5>
                    <p class="text-sm text-slate-600"><b>Contact Analysis</b> renders elemental grade shifts at absolute distances crossing binary geological domains. Sharp gradients mandate strict Hard Boundary parameters, while gradual slopes indicate a Soft Boundary transition. <b>Swath Plots</b> slice the matrix orthogonally to spatially validate that grade distribution trends along Cartesian axes suffer zero severe geometric distortion.</p>
                 </div>`
        }
    },
    'variography': {
        title: { 
            ID: "Modul 7A: Spatial Variography & KNA Optimization", 
            EN: "Module 7A: Spatial Variography & KNA Optimization" 
        },
        steps: {
            ID: [
                "Buka tab <i>Fan Map</i>. Klik <b>Auto-Detect Core Continuity</b> untuk mengeksekusi komputasi rotasi 360° yang akan mendeteksi arah Azimuth optimal.",
                "Beralih ke tab <i>Directional Model</i> untuk melakukan Curve Fitting. Sesuaikan parameter Nugget, Sill, dan Range agar garis teori (Theoretical Model) mengikuti tren distribusi varians.",
                "Perhatikan visualisasi <i>3D Search Ellipsoid</i>. Rotasikan ellipsoid tersebut dan sesuaikan Dip dan Plunge agar selaras dengan orientasi badan bijih (orebody).",
                "Beralih ke tab <i>KNA Validation</i> dan klik <b>Run Multi-Iteration CV</b> untuk menguji keakuratan pembobotan. Pastikan Kriging Efficiency bernilai positif dan Slope mendekati angka 1.0.",
                "Klik <b>Lock & Commit Parameters</b> untuk menyimpan konfigurasi spasial (Search Space) ke dalam profil memori domain sebelum menjalankan estimasi Block Model."
            ],
            EN: [
                "Navigate to the <i>Fan Map</i> tab. Click <b>Auto-Detect Core Continuity</b> to execute a 360° rotational computation that isolates the optimal principal Azimuth.",
                "Switch to the <i>Directional Model</i> tab to execute Curve Fitting. Adjust the Nugget, Sill, and Range scalars to align the Theoretical Model curve against the empirical variance distribution points.",
                "Inspect the interactive <i>3D Search Ellipsoid</i>. Rotate the ellipsoid and calibrate the Dip and Plunge scalars to parallel the spatial orientation of the orebody.",
                "Switch to the <i>KNA Validation</i> tab and trigger <b>Run Multi-Iteration CV</b> to test weighting accuracy. Verify that the Kriging Efficiency is positive and the Slope approximates 1.0.",
                "Click <b>Lock & Commit Parameters</b> to commit the spatial configuration (Search Space) into the active domain memory profile prior to executing Block Model estimations."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1">A. 360° Omnidirectional Fan Sweep</h5>
                    <p class="text-sm text-slate-600">Sistem mengeksekusi pemindaian variansi secara radial. Vektor jarak dihitung berdasarkan rasio beda kuadrat nilai sampel (sqDiff) pada koordinat XYZ. Algoritma <b>Auto-Detect</b> menjalankan Angular Smoothing untuk mengidentifikasi nilai variansi minimum, yang secara matematis menjadi sumbu kontinuitas utama (Major Axis / Azimuth Utama) dari endapan.</p>

                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1 mt-4">B. Semi-Variogram Analytics</h5>
                    <p class="text-sm text-slate-600">Pemodelan struktural anisotropi (Curve Fitting). <b>Nugget (C0)</b> merepresentasikan baseline error jarak-nol. <b>Sill (C0 + C1)</b> adalah batas asimtotik di mana varians sampel kehilangan korelasi spasial (idealnya mendekati Variance Global data). <b>Range</b> adalah jarak absolut dari origin menuju Sill, yang dikompilasi secara asinkron menjadi dimensi jari-jari <b>3D Search Ellipsoid</b>.</p>

                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1 mt-4">C. Kriging Neighborhood Analysis (KNA)</h5>
                    <p class="text-sm text-slate-600">Sistem merender iterasi LOOCV (<i>Leave-One-Out Cross Validation</i>) secara multi-threading. Parameter pencarian dievaluasi terhadap komputasi Kriging Efficiency (KE) dan Slope of Regression. KE positif menyatakan bahwa variansi pembobotan Kriging lebih stabil dibanding sekadar merata-rata data global. Slope $\\approx 1.0$ membuktikan ketiadaan bias kondisional. Analisis <b>Swath Plot</b> mengkonfirmasi deviasi estimasi (Kriged Mean) secara spasial di sepanjang sumbu absolut (X/Y/Z) tanpa distorsi.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1">A. 360° Omnidirectional Fan Sweep</h5>
                    <p class="text-sm text-slate-600">The engine executes a radial variance scan. Distance vectors are computationally mapped by tracking the squared difference ratios (sqDiff) across absolute XYZ coordinates. The <b>Auto-Detect</b> algorithm deploys an Angular Smoothing matrix to isolate the minimum variance corridor, mathematically deriving the primary geological continuity vector (Major Axis / Principal Azimuth).</p>

                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1 mt-4">B. Semi-Variogram Analytics</h5>
                    <p class="text-sm text-slate-600">Structural anisotropic modeling (Curve Fitting). The <b>Nugget (C0)</b> represents the zero-distance baseline error/micro-variance. The <b>Sill (C0 + C1)</b> indicates the asymptotic boundary where spatial variance reaches statistical independence (ideally converging on the Global Variance). The <b>Range</b> defines the absolute distance from origin to Sill, which is asynchronously compiled into the volumetric radiuses of the <b>3D Search Ellipsoid</b>.</p>

                    <h5 class="font-bold text-purple-700 border-b border-purple-100 pb-1 mt-4">C. Kriging Neighborhood Analysis (KNA)</h5>
                    <p class="text-sm text-slate-600">The daemon triggers a multi-threaded LOOCV (Leave-One-Out Cross Validation) matrix loop. The search parameters are fundamentally verified against the Kriging Efficiency (KE) and Slope of Regression. A positive KE mathematically proves the Kriging variance is superior to global data averaging. A Slope converging at $\\approx 1.0$ verifies the absolute absence of conditional bias. The <b>Swath Plot</b> analytics spatially validate the accuracy of the estimated (Kriged) Mean against true arrays across Cartesian (X/Y/Z) axes without geometric distortion.</p>
                 </div>`
        }
    },
    'wireframe': {
        title: { 
            ID: "Modul 7B: WebGL Surface & 3D Wireframe Generation", 
            EN: "Module 7B: WebGL Surface & 3D Wireframe Generation" 
        },
        steps: {
            ID: [
                "Eksekusi <i>Build Topography (DTM)</i> untuk merender permukaan tanah asli berdasarkan elevasi bor dan batas area (Boundary) dari Map2D.",
                "Pilih Target Domain geologi pada panel kontrol (contoh: LIM, SAP, atau BRK).",
                "Centang komponen Mesh yang ingin dibangun (Roof, Floor, atau Closed Solid) lalu klik <b>Build Domain Solid</b>.",
                "Gunakan <i>3D Slicer Tool</i> di sudut layar untuk memotong model secara ortogonal (Sumbu X/Y/Z) dan menginspeksi profil di bawah permukaan.",
                "Klik <b>Export DXF</b> untuk mengunduh model 3D ke dalam format standar ASCII 3DFACE yang kompatibel dengan perangkat lunak tambang eksternal."
            ],
            EN: [
                "Execute <i>Build Topography (DTM)</i> to render the original ground surface based on drill collar elevations and Map2D boundaries.",
                "Select the geological Target Domain on the control panel (e.g., LIM, SAP, or BRK).",
                "Toggle the desired Mesh components (Roof, Floor, or Closed Solid) and click <b>Build Domain Solid</b>.",
                "Utilize the <i>3D Slicer Tool</i> to orthogonally clip the model (X/Y/Z Axes) and inspect subsurface profiling.",
                "Click <b>Export DXF</b> to download the 3D models in standard ASCII 3DFACE format, compatible with external mine planning software."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. DTM & Inverse Distance Weighting</h5>
                    <p class="text-sm text-slate-600">Modul memproyeksikan elevasi (Z) menggunakan interpolator <b>IDW (Inverse Distance Weighting)</b> dengan pangkat kubik ($w = \\frac{1}{d^3}$) untuk menjamin akurasi snapping absolut pada titik bor.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Laplacian Smoothing Algorithm</h5>
                    <p class="text-sm text-slate-600">Karena interpolasi spasial dasar seringkali menghasilkan geometri yang bersudut tajam (*spiky artifacts*), sistem mengimplementasikan filter <b>Laplacian Smoothing</b>. Algoritma ini secara iteratif merelaksasi setiap titik vertex (*node*) pada mesh dengan menghitung nilai rata-rata dari titik-titik tetangga terdekatnya. Proses ini meniru gaya alam (*weathering*), menghasilkan lengkungan geomorfologi yang mulus tanpa merusak integritas batas data aslinya.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Watertight Solid Engine & Topo Clipping</h5>
                    <p class="text-sm text-slate-600">Mesin membangun batas atas (Roof) dan batas bawah (Floor) dari zona mineral. Titik-titik tepi (peripheral nodes) kemudian dijahit secara otomatis (<b>Polygon Stitching</b>) untuk membentuk Watertight Solid (objek tertutup sempurna). Sistem dilengkapi fungsi <b>Topographic Raycast Clipping</b> yang secara otonom memangkas atap domain yang menembus elevasi DTM, mencegah galat perhitungan volume di udara kosong.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">D. Anti-Jitter Origin Shift & DXF Translation</h5>
                    <p class="text-sm text-slate-600">Karena angka koordinat spasial UTM (jutaan meter) melampaui batas presisi memori WebGL Floating-Point (menyebabkan model bergetar/jitter), mesin menerapkan fungsi <b>Local Origin Shift</b>. Seluruh koordinat direlokasi sementara ke origin lokal saat dirender di GPU, dan ditranslasikan kembali ke sistem Cartesian UTM absolut secara presisi hanya pada saat diekspor ke dalam file <b>DXF (ASCII 3DFACE)</b>.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. DTM & Inverse Distance Weighting</h5>
                    <p class="text-sm text-slate-600">The module projects elevations (Z) utilizing a cubic <b>Inverse Distance Weighting (IDW)</b> interpolator ($w = \\frac{1}{d^3}$) to enforce absolute node snapping at drill collars.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Laplacian Smoothing Algorithm</h5>
                    <p class="text-sm text-slate-600">Because base spatial interpolation frequently generates spiky geometric artifacts, the system deploys a <b>Laplacian Smoothing</b> filter. This algorithm iteratively relaxes each mesh vertex by computing the centroid of its immediate neighboring nodes. This simulates natural geological weathering, yielding a geomorphologically smooth surface while rigorously preserving core data boundary integrity.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Watertight Solid Engine & Topo Clipping</h5>
                    <p class="text-sm text-slate-600">The compiler extracts the domain's upper (Roof) and lower (Floor) bounds. Peripheral nodes undergo automated algorithmic edge-loop stitching (<b>Polygon Stitching</b>) to generate a mathematically sound Watertight Solid. The system integrates a <b>Topographic Raycast Clipping</b> failsafe, autonomously suppressing domain roofs from protruding above the DTM surface, thereby preventing volumetric air-space errors.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">D. Anti-Jitter Origin Shift & DXF Translation</h5>
                    <p class="text-sm text-slate-600">Because absolute UTM coordinates (millions of meters) violently exceed WebGL Floating-Point Precision thresholds (causing graphic jitter), the engine deploys a <b>Local Origin Shift</b> protocol. Arrays are temporarily translated to a pseudo-local origin during GPU rendering, and rigorously translated back to True Cartesian UTM coordinates exclusively during <b>DXF (ASCII 3DFACE)</b> file export.</p>
                 </div>`
        }
    },
    'density': {
        title: { 
            ID: "Modul 8A: Enterprise Density Engine & SG Injection", 
            EN: "Module 8A: Enterprise Density Engine & SG Injection" 
        },
        steps: {
            ID: [
                "Unggah file laboratorium densitas (CSV/XLSX) melalui panel <i>Import Dataset</i>.",
                "Tentukan nilai <i>Wax Density Base</i> (standar 0.90 g/cm³) dan batas anomali Moisture Content (MC).",
                "Sistem akan mem-parsing data dan memilih metode Archimedes atau Caliper secara otonom berdasarkan keberadaan kolom data (lilin/air vs radius/tebal).",
                "Lakukan inspeksi visual anomali melalui dasbor analitik dan grafik Z-Score, lalu ekspor PDF.",
                "Klik <b>Inject to Database</b> agar sistem mengkomputasi rata-rata SG bersih tiap litologi dan menimpanya ke parameter Block Model utama secara otomatis."
            ],
            EN: [
                "Upload the density laboratory arrays (CSV/XLSX) via the <i>Import Dataset</i> panel.",
                "Configure the <i>Wax Density Base</i> constant (default 0.90 g/cm³) and Moisture Content (MC) anomaly thresholds.",
                "The engine parses the arrays and autonomously selects the Archimedes or Caliper method based on column presence (wax/water vs radius/thickness).",
                "Visually audit anomalies via the analytical dashboard and Z-Score charts, then execute a PDF export.",
                "Click <b>Inject to Database</b> to command the engine to compile clean SG averages per lithology and aggressively overwrite the primary Block Model parameters."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Algoritma Kalkulasi Volume (Metode Ganda)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Metode Archimedes:</b> Dieksekusi jika mendeteksi parameter berat berlapis lilin (Wax) dan berat dalam air (Water). Mesin mengkomputasi volume aktual via: $Volume = (W_{wax} - W_{water}) - \\frac{W_{wax} - W_{dry}}{\\rho_{wax}}$.</li>
                        <li><b>Metode Caliper:</b> Jika input menggunakan dimensi silinder sampel inti bor (Radius & Tebal), mesin mem-parsing volume spasial via: $Volume = \\pi \\times r^2 \\times t$.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Validasi Integritas Fisik</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li>Mendeteksi galat absolut pada rentang Specific Gravity (ditolak otomatis jika nilai berada di luar batas 0.5 hingga 4.5).</li>
                        <li><b>Hukum Fisika Fluida:</b> Memaksa munculnya bendera ERROR jika kalkulasi murni SG Kering (Dry) secara matematis melebihi besaran SG Basah (Wet).</li>
                        <li>Mengisolasi anomali Moisture Content (MC) yang melampaui limit wajar (Standar limit toleransi: 70%).</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Smart Injection & Data Mapping</h5>
                    <p class="text-sm text-slate-600">Tidak hanya sekadar dasbor analitik statis, modul ini difungsikan sebagai injektor memori global. Algoritma <i>Smart Mapper</i> secara leksikal menerjemahkan string kelompok litologi (contoh: 'LIM', 'SAP', 'BEDROCK'), mengkomputasi nilai rata-rata SG yang bersih dari galat, dan menyuntikkannya secara instan ke struktur memori Domaining utama tanpa membutuhkan ketikan manual.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Volume Calculation Algorithms (Dual Methods)</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Archimedes Method:</b> Executed when wax-coated and submerged water weights are detected. The engine computes actual volume via: $Volume = (W_{wax} - W_{water}) - \\frac{W_{wax} - W_{dry}}{\\rho_{wax}}$.</li>
                        <li><b>Caliper Method:</b> When inputs consist of core cylinder dimensions (Radius & Thickness), the engine parses volumetric space via: $Volume = \\pi \\times r^2 \\times t$.</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Physical Integrity Validation</h5>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li>Detects absolute Specific Gravity range anomalies (computationally rejected if outside 0.5 to 4.5 bounds).</li>
                        <li><b>Fluid Dynamics Law:</b> Enforces an ERROR flag if Dry SG magnitudes mathematically exceed Wet SG values.</li>
                        <li>Isolates Moisture Content (MC) anomalies exceeding logical physics thresholds (Default limit: 70%).</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Smart Injection & Data Mapping</h5>
                    <p class="text-sm text-slate-600">Beyond static analytical dashboards, this module operates as a global memory injector. The <i>Smart Mapper</i> algorithm lexically translates lithological category strings (e.g., 'LIM', 'SAP', 'BEDROCK'), compiles error-free SG averages, and instantly injects the optimized matrices directly into the primary Domaining memory architecture, deprecating manual transcription.</p>
                 </div>`
        }
    },
    'block': {
        title: { ID: "Modul 8B: Voxelization & Kriging Solver", EN: "Module 8B: Voxelization & Kriging Solver" },
        steps: {
            ID: [
                "Input variabel arsitektur Block XYZ (Default resolusi: 12.5 x 12.5 x 2m).",
                "Definisikan radius parameter pencarian (Search Space Array) sesuai analisis output KNA.",
                "Set <i>Discretization Matrix</i> (misalnya 2x2x1 node calculation) untuk Kriging Engine.",
                "Toggle 'Dynamic Anisotropy' atau 'Clip Topo' sesuai kebutuhan pemodelan struktural.",
                "Eksekusi <i>RUN ENGINE</i>. Mesin akan melakukan estimasi blok secara asinkron lalu tinjau <i>Resource Inventory</i>.",
                "Klik tombol <b>GRADE-TONNAGE CURVE</b> pada panel aksi untuk mengevaluasi kelayakan tonase (DMT) terhadap berbagai skenario Cut-Off Grade."
            ],
            EN: [
                "Input the XYZ Block architecture variables (Default resolution: 12.5 x 12.5 x 2m).",
                "Define the Search Space Array radii based on KNA output analytics.",
                "Set the <i>Discretization Matrix</i> (e.g., 2x2x1 node calculation) for the Kriging Engine.",
                "Toggle 'Dynamic Anisotropy' or 'Clip Topo' according to structural modeling requirements.",
                "Execute <i>RUN ENGINE</i>. The daemon will estimate blocks asynchronously; subsequently, review the <i>Resource Inventory</i>.",
                "Click the <b>GRADE-TONNAGE CURVE</b> button in the action panel to evaluate tonnage (DMT) viability across various Cut-Off Grade scenarios."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Geostatistical Interpolation Solver</h5>
                    <p class="text-sm text-slate-600"><b>1. Ordinary Kriging (OK):</b> Gold Standard Algorithm JORC. OK menghitung matriks probabilitas berdasarkan model spasial (Variogram) untuk menetapkan bobot vektor secara optimum pada elemen utama (Ni). Menggunakan <i>Block Kriging Discretization</i> (misal $2 \\times 2 \\times 1$) untuk melakukan sub-sampling point demi menetralisir eror data clustering.</p>
                    <p class="text-sm text-slate-600"><b>2. Multi-Element Co-Interpolation:</b> Untuk menjaga efisiensi memori <i>Thread Worker</i> browser, sementara Ni dihitung menggunakan OK, unsur sekunder (Fe, MgO, SiO2, Co) diinterpolasi secara simultan menggunakan <b>Inverse Distance Weighting (IDW)</b> dengan komputasi asinkron yang sangat efisien.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Engine Architectural Directives</h5>
                    <p class="text-sm text-slate-600"><b>True Sub-Celling & Hard Data Snapping:</b> Engine memberlakukan hukum larangan untuk merender Parent Block Array di batas tepi Solid. Voxel akan didestruksi dan dirakit ulang menjadi <b>Sub-Cells Dinamis</b> secara persis di batas wireframe. Fitur <i>Hard Data Snapping</i> secara absolut memaksa sistem untuk merender blok jika secara fisik ia mengandung titik sampel bor, mencegah hilangnya data berharga (*data loss*) di area ujung interpolasi.</p>
                    <p class="text-sm text-slate-600"><b>Dynamic Transformation Matrix (Drape):</b> Mengevaluasi node DTM dan menerapkan Trigonometri Kalkulus per-Voxel, memutar sudut Pitch/Roll/Yaw (Dip/Azimuth) dari Search Ellipsoid sehingga menyesuaikan dengan tingkat kemiringan topografi secara *real-time*.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Output Metrics Execution</h5>
                    <p class="text-sm text-slate-600">Ekstraksi nilai Wet/Dry Reserve Economics murni didapatkan dari resolusi dimensi Voxel: $WMT = \\text{Volume} \\times SG$. Nilai pelaporan bersih JORC dievaluasi secara statik dengan memanggil index relasi konstan Moisture Content (Limonit $\\approx 35\\%$, Saprolit $\\approx 25\\%$), terdistribusi sebagai: $DMT = WMT \\times (1 - \\frac{MC}{100})$.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">D. Grade-Tonnage (G-T) Curve Analytics</h5>
                    <p class="text-sm text-slate-600">Fitur kurva G-T secara dinamis melakukan iterasi kalkulasi Sumproduct terhadap jutaan array Voxel berdasarkan metode interpolasi yang sedang aktif (OK/IDW/NN). Grafik ini melacak rasio penyusutan tonase (DMT) terhadap peningkatan kadar rata-rata (Ni & Fe) seiring dinaikkannya ambang batas Cut-Off Grade (COG), memberikan landasan justifikasi visual absolut untuk evaluasi kelayakan keekonomian tambang.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Geostatistical Interpolation Solver</h5>
                    <p class="text-sm text-slate-600"><b>1. Ordinary Kriging (OK):</b> The JORC Gold Standard Algorithm. OK integrates spatial probability matrices sourced from the Variogram to allocate optimal vector weights for the primary element (Ni). Utilizing <i>Block Kriging Discretization</i> nodes (e.g., $2 \\times 2 \\times 1$) for point sub-sampling, it mathematically neutralizes Data Clustering anomalies.</p>
                    <p class="text-sm text-slate-600"><b>2. Multi-Element Co-Interpolation:</b> To rigorously optimize browser <i>Thread Worker</i> memory cycles, while Ni is estimated via OK, accessory elements (Fe, MgO, SiO2, Co) are simultaneously interpolated utilizing <b>Inverse Distance Weighting (IDW)</b> through highly efficient asynchronous computations.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. Engine Architectural Directives</h5>
                    <p class="text-sm text-slate-600"><b>True Sub-Celling & Hard Data Snapping:</b> The compiler enforces prohibition laws against rendering Parent Blocks at solid boundary extents, destroying and dynamically rebuilding them into fractional <b>Sub-Cells</b>. The <i>Hard Data Snapping</i> algorithm aggressively mandates voxel rendering if it physically encapsulates a drill hole node, preemptively preventing localized data loss at interpolation extremities.</p>
                    <p class="text-sm text-slate-600"><b>Dynamic Transformation Matrix (Drape):</b> Evaluates DTM nodes, compiling per-Voxel Calculus Trigonometry to uniquely apply local Pitch/Roll/Yaw (Dip/Azimuth) rotations to the Search Ellipsoid matrix, precisely mapping it parallel against the topological hull gradient.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Output Metrics Execution</h5>
                    <p class="text-sm text-slate-600">The Reserve Economics Wet/Dry values are fundamentally compiled from the localized Voxel geometric resolution: $WMT = \\text{Volume} \\times SG$. Clean JORC reporting metrics are statically evaluated by querying the domain's inherent Moisture Content constant arrays (Limonite $\\approx 35\\%$, Saprolite $\\approx 25\\%$), distributed as: $DMT = WMT \\times (1 - \\frac{MC}{100})$.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">D. Grade-Tonnage (G-T) Curve Analytics</h5>
                    <p class="text-sm text-slate-600">The G-T curve feature dynamically iterates Sumproduct calculations across millions of Voxel arrays based on the active interpolation method (OK/IDW/NN). This chart tracks the attrition ratio of tonnage (DMT) against the inflation of average grades (Ni & Fe) as the Cut-Off Grade (COG) threshold escalates, providing an absolute visual justification for mining economic viability evaluations.</p>
                 </div>`
        }
    },
    'map2d': {
        title: { 
            ID: "Modul 9: 2D Spatial Projection, AoI Tonnage & Cross-Section", 
            EN: "Module 9: 2D Spatial Projection, AoI Tonnage & Cross-Section" 
        },
        steps: {
            ID: [
                "Gunakan Visual Control untuk beralih antara tampilan Bubble Plot, IDW Heatmap, atau sebaran Collar dasar.",
                "Tarik garis poligon area evaluasi menggunakan Lasso Tool di peta, atau klik <b>Auto-Generate Boundary</b> untuk batas Convex Hull otomatis.",
                "Di panel parameter, tentukan Estimation Method (Static Grid atau Dynamic Voronoi) dan resolusi spasi grid.",
                "Aktifkan opsi Resource Classification (Measured/Indicated/Inferred) untuk melihat radius area pengaruh, lalu periksa Grade-Tonnage Curve.",
                "Gunakan Line Tool untuk memotong peta dan merender Stratigraphic Cross-Section vertikal, lalu ekspor hasil ke <b>Shapefile (SHP)</b>."
            ],
            EN: [
                "Utilize the Visual Control to toggle between Bubble Plot, IDW Heatmap, or base Collar point distributions.",
                "Draw an evaluation polygon utilizing the Lasso Tool, or click <b>Auto-Generate Boundary</b> for an autonomous Convex Hull limit.",
                "In the parameter panel, define the Estimation Method (Static Grid or Dynamic Voronoi) and grid spacing resolution.",
                "Toggle the Resource Classification (Measured/Indicated/Inferred) to render influence radii, then audit the Grade-Tonnage Curve.",
                "Deploy the Line Tool to bisect the map and render a vertical Stratigraphic Cross-Section, then export the geometry to a <b>Shapefile (SHP)</b>."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Area of Influence (AoI) Tessellation</h5>
                    <p class="text-sm text-slate-600">Modul mengeksekusi proyeksi geospasial menggunakan library Leaflet WebGIS yang secara real-time ditranslasikan secara matematis ke proyeksi UTM via <code>proj4js</code>. Kalkulasi luas penampang komputasional (AoI) dirender menggunakan <b>Voronoi Polygonization</b> (luas pengaruh dinamis per titik) atau <b>Static Grid Spacing</b> yang dipotong tepat pada batas area (Boundary Clipping).</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. JORC DMT-Weighted Estimation & Classification</h5>
                    <p class="text-sm text-slate-600">Untuk mencegah bias volume konvensional, mesin memberlakukan kalkulasi Sumproduct mutlak berbasis tonase kering (DMT). Pipeline menghitung $WMT = Area \\times Thickness \\times SG$ dan mengekstrak matriks kelembapan: $DMT = WMT \\times (1 - \\frac{MC}{100})$. Nilai pelaporan kadar rata-rata dievaluasi via: $Grade_{avg} = \\frac{\\sum (Grade \\times DMT)}{\\sum DMT}$. Sistem juga memproyeksikan klasifikasi sumber daya geologi secara spasial berdasarkan limit jarak absolut (Measured/Indicated/Inferred).</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Cross-Section & Spatial Export Matrix</h5>
                    <p class="text-sm text-slate-600">Mendukung raycasting interaktif di mana penarikan garis pada 2D Map memicu Thread Worker untuk mencari titik lubang bor terdekat dan merender <b>Stratigraphic Cross-Section</b> vertikal. Seluruh matriks geometri, atribut kadar, dan poligon klasifikasi dapat dibungkus (compiled) ke dalam format standar spasial <b>Shapefile (.shp/.dbf)</b> untuk integrasi langsung ke piranti lunak tambang pihak ketiga.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Area of Influence (AoI) Tessellation</h5>
                    <p class="text-sm text-slate-600">The module executes geospatial projections utilizing the Leaflet WebGIS library, mathematically translating Web Mercator to Cartesian UTM in real-time via <code>proj4js</code>. Cross-sectional evaluation areas (AoI) are compiled via <b>Voronoi Polygonization</b> (dynamic spatial node influence) or <b>Static Grid Spacing</b>, strictly clipped to the defined boundary limits.</p>
                    
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. JORC DMT-Weighted Estimation & Classification</h5>
                    <p class="text-sm text-slate-600">To aggressively neutralize conventional volumetric bias, the engine enforces strict Dry Metric Tonnes (DMT) Sumproduct calculus. The pipeline evaluates $WMT = Area \\times Thickness \\times SG$ and parses moisture variables: $DMT = WMT \\times (1 - \\frac{MC}{100})$. Average reporting grades are compiled via: $Grade_{avg} = \\frac{\\sum (Grade \\times DMT)}{\\sum DMT}$. The system additionally projects geological resource classifications spatially based on absolute distance radii (Measured/Indicated/Inferred).</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Cross-Section & Spatial Export Matrix</h5>
                    <p class="text-sm text-slate-600">Features interactive raycasting where drawing a polyline across the 2D Map triggers a background daemon to isolate proximal nodes, rendering a vertical <b>Stratigraphic Cross-Section</b>. The entire geometrical matrix, assay attributes, and classification polygons can be compiled and encapsulated into industry-standard <b>Shapefile (.shp/.dbf)</b> formats for immediate tertiary mine planning software integration.</p>
                 </div>`
        }
    },
    'downhole': {
        title: { 
            ID: "Modul 10: Downhole Log Rendering & Data Management", 
            EN: "Module 10: Downhole Log Rendering & Data Management" 
        },
        steps: {
            ID: [
                "Pilih <i>Data Pipeline Source</i> (Raw, Domained, atau Composited) lalu tentukan Hole ID untuk me-render log sumur.",
                "Gunakan antarmuka <i>Data Management</i> untuk melakukan modifikasi data sel tabular ala Excel (mendukung batch copy-paste, undo/redo, dan navigasi keyboard).",
                "Akses <i>Style Manager</i> untuk mengustomisasi warna palet elemen dan injeksi pola SVG (Lithology Patterns) pada kolom grafik stratigrafi.",
                "Ubah pengaturan Paper Orientation untuk memicu algoritma Smart Auto-Scale, atau masukkan resolusi kedalaman (CM/M) secara manual.",
                "Klik <b>Batch PDF Export</b> untuk menyeleksi banyak sumur sekaligus dan memicu background worker merender laporan halaman PDF resolusi tinggi."
            ],
            EN: [
                "Select the <i>Data Pipeline Source</i> (Raw, Domained, or Composited) and specify a Hole ID to render the well log.",
                "Utilize the <i>Data Management</i> interface for Excel-tier tabular cell modifications (supports batch copy-paste, undo/redo, and directional keyboard navigation).",
                "Access the <i>Style Manager</i> to customize elemental color palettes and inject SVG patterns (Lithology Patterns) into the stratigraphic column.",
                "Adjust the Paper Orientation setting to trigger the Smart Auto-Scale algorithm, or manually override the depth resolution (CM/M).",
                "Click <b>Batch PDF Export</b> to select multiple holes and trigger the background worker to render high-fidelity paginated PDF reports."
            ]
        },
        theory: {
            ID: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Excel-like Memory Spreadsheet Engine</h5>
                    <p class="text-sm text-slate-600">Mengintegrasikan antarmuka state-management reaktif untuk pengeditan matriks data tabular secara langsung. Modul ini dibekali dengan interupsi keyboard DOM secara bawaan, memungkinkan Anda melakukan aksi layaknya Microsoft Excel:</p>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Ctrl+C / Ctrl+X:</b> Salin (Copy) atau potong (Cut) baris data.</li>
                        <li><b>Ctrl+V:</b> Tempel (Paste) blok data dalam jumlah besar langsung dari Excel ke NiCore Studio.</li>
                        <li><b>Delete / Backspace:</b> Menghapus (Clear) konten pada sel yang diblok.</li>
                        <li><b>Ctrl+Z / Ctrl+Y:</b> Tumpukan memori histori (Undo & Redo).</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. DOM-Based Stratigraphic Rendering & Smart Scale</h5>
                    <p class="text-sm text-slate-600">Modul ini secara dinamis memetakan batas kedalaman numerik (From-To) menjadi geometri DOM HTML/CSS aktual. Modul dilengkapi algoritma <b>Smart Auto-Scale</b> yang mengevaluasi orientasi kertas dan mengkalkulasi rasio cetak optimal via: $Scale_{optimal} = \\frac{Height_{target}}{Depth_{max}}$ untuk memastikan log termuat rapi di halaman cetak.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Asynchronous Batch PDF Pagination</h5>
                    <p class="text-sm text-slate-600">Mesin merender laporan log pengeboran menggunakan teknik komputasi Off-screen DOM Cloning dan <code>html2canvas</code> untuk rasterization skala 2x lipat. Algoritma kemudian melacak titik potong absolut matriks Y (dynamic Y-axis cut-points) pada batas setiap baris tabel. Hal ini menjamin proses pemotongan halaman (pagination) memotong tepat di batas interval dan tidak pernah membelah teks matriks di tengah.</p>
                 </div>`,
            EN: `<div class="space-y-4">
                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1">A. Excel-like Memory Spreadsheet Engine</h5>
                    <p class="text-sm text-slate-600">Integrates a reactive state-management interface for instantaneous tabular matrix editing. This module is equipped with native DOM keyboard interrupts, empowering you to perform actions exactly like Microsoft Excel:</p>
                    <ul class="list-disc pl-4 space-y-1 text-sm text-slate-600">
                        <li><b>Ctrl+C / Ctrl+X:</b> Copy or Cut data rows.</li>
                        <li><b>Ctrl+V:</b> Batch paste massive blocks of data directly from Excel into NiCore Studio.</li>
                        <li><b>Delete / Backspace:</b> Clear contents of selected cells.</li>
                        <li><b>Ctrl+Z / Ctrl+Y:</b> Absolute history memory stack (Undo & Redo).</li>
                    </ul>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">B. DOM-Based Stratigraphic Rendering & Smart Scale</h5>
                    <p class="text-sm text-slate-600">The module dynamically maps numerical depth limits (From-To) into physical HTML/CSS DOM geometry. It integrates a <b>Smart Auto-Scale</b> algorithm that evaluates paper orientation constraints and computes the optimal rendering ratio via: $Scale_{optimal} = \\frac{Height_{target}}{Depth_{max}}$ to ensure pristine print pagination.</p>

                    <h5 class="font-bold text-teal-700 border-b border-teal-100 pb-1 mt-4">C. Asynchronous Batch PDF Pagination</h5>
                    <p class="text-sm text-slate-600">The engine renders drill log reports utilizing Off-screen DOM Cloning computation and <code>html2canvas</code> for 2x scale rasterization. The algorithm autonomously tracks absolute Y-matrix cut-points across physical table row boundaries, mathematically guaranteeing that pagination slicing occurs strictly at interval nodes without bisecting active text matrices.</p>
                 </div>`
        }
    },
    'default': {
        title: { ID: "Modul: Algoritma Inspeksi Umum & Komponen UI", EN: "Module: General Inspection Algorithms & UI Components" },
        steps: {
            ID: ["1. Pindai argumen parameter handler (UI Panel kanan).", "2. Tetapkan array threshold rules.", "3. Triger algoritma komputasi UI."],
            EN: ["1. Scan the parameter handler arguments (Right UI Panel).", "2. Declare array threshold rules.", "3. Trigger UI computational algorithms."]
        },
        theory: {
            ID: `<div class="space-y-3">
                    <p class="text-sm text-slate-600">Arsitektur sistem ini dirakit menggunakan algoritma otomatis (auto-executed logic nodes) untuk mengeksekusi utilitas inspeksi tambang Anda agar sinkron secara empiris dengan standar validasi dan pelaporan spasial global (JORC / KCMI).</p>
                    <p class="text-sm text-slate-600">Fungsikan direktori parameter input (GUI Panel sebelah kanan) untuk merelasikan dan mematangkan variabel pemrograman geostatistika Anda.</p>
                 </div>`,
            EN: `<div class="space-y-3">
                    <p class="text-sm text-slate-600">This system architecture is integrated utilizing auto-executed logic nodes to automate computational utilities for your mining validation workflows, syncing empirically to global spatial reporting standards (JORC / KCMI).</p>
                    <p class="text-sm text-slate-600">Leverage the parameter input directory (right-side GUI Panel) to correlate and refine your underlying geostatistical programming variables.</p>
                 </div>`
        }
    }
};

// Fungsi cerdas untuk mencari tahu tab mana yang sedang aktif (tidak hidden)
window.getActiveModuleName = function() {
    const tabs = document.querySelectorAll('.tab-content');
    for (let i = 0; i < tabs.length; i++) {
        if (!tabs[i].classList.contains('hidden')) {
            return tabs[i].id.replace('tab-', ''); 
        }
    }
    return 'default';
};

window.openHelpModal = function() {
    const activeModule = window.getActiveModuleName();
    let data = helpDictionary[activeModule] || helpDictionary['default'];
    window.renderHelpContent(data);
    const el = document.getElementById('modal-help-guide');
    if (el) el.classList.remove('hidden');
};

window.closeHelpModal = function() {
    const el = document.getElementById('modal-help-guide');
    if (el) el.classList.add('hidden');
};

window.setHelpLanguage = function(lang) {
    currentHelpLang = lang;
    
    const btnID = document.getElementById('btn-lang-id');
    const btnEN = document.getElementById('btn-lang-en');
    
    if(lang === 'ID') {
        if (btnID) btnID.className = "px-3 py-1 rounded text-[10px] font-black tracking-widest bg-teal-600 text-white shadow-sm transition-all";
        if (btnEN) btnEN.className = "px-3 py-1 rounded text-[10px] font-black tracking-widest text-slate-400 hover:text-white transition-all";
    } else {
        if (btnEN) btnEN.className = "px-3 py-1 rounded text-[10px] font-black tracking-widest bg-teal-600 text-white shadow-sm transition-all";
        if (btnID) btnID.className = "px-3 py-1 rounded text-[10px] font-black tracking-widest text-slate-400 hover:text-white transition-all";
    }
    
    const activeModule = window.getActiveModuleName();
    let data = helpDictionary[activeModule] || helpDictionary['default'];
    window.renderHelpContent(data);
};

window.renderHelpContent = function(data) {
    const lang = currentHelpLang;
    
    const subtitleEl = document.getElementById('help-module-subtitle');
    if (subtitleEl) subtitleEl.innerText = data.title[lang];
    
    const stepsList = document.getElementById('help-steps-list');
    if (stepsList) {
        let stepsHtml = '';
        data.steps[lang].forEach(step => {
            stepsHtml += `<li class="flex items-start gap-2"><i data-lucide="check-circle" class="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0"></i> <span class="leading-relaxed text-slate-700">${step}</span></li>`;
        });
        stepsList.innerHTML = stepsHtml;
    }
    
    const theoryContent = document.getElementById('help-theory-content');
    if (theoryContent) {
        theoryContent.innerHTML = data.theory[lang];
    }
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
};