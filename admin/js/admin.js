import { supabase } from '../../shared/config.js';

const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const treeContainer = document.getElementById('tree-container');
const detailsPanel = document.getElementById('details-panel');
const canvasPanel = document.getElementById('canvas-panel');
const detailsContent = document.getElementById('details-content');
const emptyState = document.getElementById('empty-state');
const canvas = document.getElementById('trajectory-canvas');
const ctx = canvas.getContext('2d');
const compareSelectedBtn = document.getElementById('compare-selected-btn');

// Zmienne dla Modułu Analitycznego
const analysisControls = document.getElementById('analysis-controls');
const smoothingSlider = document.getElementById('smoothing-slider');
const thresholdSlider = document.getElementById('threshold-slider');
const smoothValLabel = document.getElementById('smooth-val');
const threshValLabel = document.getElementById('thresh-val');

let currentActiveData = null; 
let currentActiveMeta = null;
let currentSessionIdStr = null;
let currentSessionBaseMD = { left: 0, right: 0 }; 
let globalTrialsMap = {};

// --- 1. LOGOWANIE ---
async function checkInitialSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) showDashboard(); else showLogin();
}
checkInitialSession();

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) showDashboard(); else alert(error.message);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLogin();
});

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    buildTree();
}
function showLogin() {
    dashboardScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}

// --- 2. BUDOWANIE DRZEWKA (Z checkboxami, kaskadowym zaznaczaniem i usuwaniem) ---
async function buildTree() {
    treeContainer.innerHTML = '<p>Pobieranie eksperymentów...</p>';
    globalTrialsMap = {}; 
    
    const { data: experiments, error } = await supabase
        .from('experiments')
        .select(`
            id, name, settings,
            sessions ( id, participant_id, started_at, device_info, options_mapping,
                participants ( demographics ),
                trials ( id, response_time_ms, chosen_answer, is_calibration, expected_answer, stimuli (image_url) )
            )
        `);

    if (error) return treeContainer.innerHTML = 'Błąd ładowania danych: ' + error.message;
    treeContainer.innerHTML = '';

    experiments.forEach(exp => {
        const expWrapper = document.createElement('div');
        expWrapper.className = 'tree-node';
        
        const expItem = document.createElement('div');
        expItem.className = 'tree-item';
        expItem.innerHTML = `
            <input type="checkbox" class="tree-checkbox">
            <span style="flex:1; font-weight: bold;">📁 ${exp.name}</span>
            <button class="export-csv-btn compare-btn" title="Pobierz wyniki CSV" style="background: #28a745; color: white; padding: 4px 8px; margin-right: 5px;">💾 CSV</button>
            <button class="delete-exp-btn compare-btn" title="Usuń cały eksperyment" style="background: #dc3545; color: white; padding: 4px 8px;">🗑️</button>
        `;
        
        expItem.querySelector('span').addEventListener('click', (e) => {
            e.stopPropagation(); toggleNode(expWrapper);
        });

        expItem.querySelector('.export-csv-btn').addEventListener('click', (e) => {
            e.stopPropagation(); exportToCSV(exp.id, exp.name, e.target);
        });

        expItem.querySelector('.delete-exp-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const msg = `⚠️ UWAGA! Czy na pewno chcesz trwale usunąć badanie "${exp.name}"?\nZnikną wszystkie sesje, trasy myszy i ustawienia. Tej akcji NIE MOŻNA COFNĄĆ!`;
            if (confirm(msg)) {
                const { error } = await supabase.from('experiments').delete().eq('id', exp.id);
                if (error) alert("Błąd usuwania: " + error.message);
                else buildTree(); 
            }
        });
        
        expWrapper.appendChild(expItem);
        const expChildren = createChildrenContainer();

        exp.sessions.forEach((session, sIdx) => {
            const dateStr = new Date(session.started_at).toLocaleDateString('pl-PL', { hour: '2-digit', minute: '2-digit' });
            const sessWrapper = document.createElement('div');
            sessWrapper.className = 'tree-node';
            
            const sessItem = document.createElement('div');
            sessItem.className = 'tree-item';
            sessItem.innerHTML = `
                <input type="checkbox" class="tree-checkbox">
                <span style="flex:1;">👤 Uczestnik ${sIdx + 1} (${dateStr})</span>
                <button class="compare-btn view-sess-btn" title="Pokaż wszystkie trasy uczestnika" style="margin-right: 5px;">👁️</button>
                <button class="compare-btn delete-sess-btn" title="Usuń uczestnika" style="background: #dc3545; color: white; padding: 4px 8px;">🗑️</button>
            `;
            
            sessItem.querySelector('span').addEventListener('click', (e) => {
                e.stopPropagation(); 
                toggleNode(sessWrapper); // Rozwija drzewko w dół
                
                // Zaznacza wizualnie uczestnika na niebiesko
                document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active-node'));
                sessItem.classList.add('active-node');
                
                // Wczytuje jego nową kartę z podsumowaniem!
                loadParticipantSummary(session);
            });
            
            sessItem.querySelector('.view-sess-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active-node'));
                sessItem.classList.add('active-node');
                loadSessionDetails(session, exp.settings); 
            });

            sessItem.querySelector('.delete-sess-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Czy na pewno chcesz usunąć wyniki tego uczestnika?`)) {
                    const { error } = await supabase.from('sessions').delete().eq('id', session.id);
                    if (error) alert("Błąd usuwania: " + error.message);
                    else buildTree(); 
                }
            });
            
            sessWrapper.appendChild(sessItem);
            const sessChildren = createChildrenContainer();

            session.trials.forEach((trial, tIdx) => {
                globalTrialsMap[trial.id] = { trial: trial, session: session, settings: exp.settings };
                const label = trial.is_calibration ? `🔧 Kalibracja ${tIdx+1}` : `🖼️ Pytanie ${tIdx+1}`;
                
                const trialWrapper = document.createElement('div');
                trialWrapper.className = 'tree-node';
                
                const trialItem = document.createElement('div');
                trialItem.className = 'tree-item';
                trialItem.innerHTML = `
                    <input type="checkbox" class="tree-checkbox trial-cb" value="${trial.id}">
                    <span style="flex:1;">${label}</span>
                `;
                
                trialItem.querySelector('span').addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active-node'));
                    trialItem.classList.add('active-node');
                    loadTrialDetails(trial, session.id, exp.settings);
                });

                trialWrapper.appendChild(trialItem);
                sessChildren.appendChild(trialWrapper);
            });

            sessWrapper.appendChild(sessChildren);
            expChildren.appendChild(sessWrapper);
        });

        expWrapper.appendChild(expChildren);
        treeContainer.appendChild(expWrapper);
    });
}

// Logika kaskadowa dla Checkboxów
treeContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('tree-checkbox')) {
        const isChecked = e.target.checked;
        const parentNode = e.target.closest('.tree-node');
        
        if (parentNode) {
            const childCbs = parentNode.querySelectorAll('.tree-checkbox');
            childCbs.forEach(cb => cb.checked = isChecked);
        }
        
        if (!isChecked) {
            let current = e.target.closest('.tree-node').parentElement.closest('.tree-node');
            while (current) {
                const parentCb = current.querySelector(':scope > .tree-item > .tree-checkbox');
                if (parentCb) parentCb.checked = false;
                current = current.parentElement.closest('.tree-node');
            }
        }
    }
});

function createChildrenContainer() {
    const div = document.createElement('div'); div.className = 'tree-children'; return div;
}
function toggleNode(node) {
    const children = node.querySelector('.tree-children'); if (children) children.classList.toggle('open');
}

// --- 3. MATEMATYKA (Mousetracking Algorithms) ---
smoothingSlider.addEventListener('input', (e) => {
    smoothValLabel.textContent = e.target.value === "1" ? "Brak (Surowe dane)" : e.target.value;
    if (currentActiveData) redrawActiveData();
});
thresholdSlider.addEventListener('input', (e) => {
    threshValLabel.textContent = (e.target.value / 100).toFixed(2);
    if (currentActiveData) redrawActiveData();
});

function calculateMaxDeviation(data) {
    if (!data.x || data.x.length < 2) return 0;
    const startX = data.x[0], startY = data.y[0];
    const endX = data.x[data.x.length-1], endY = data.y[data.y.length-1];

    let maxDev = 0;
    for (let i = 0; i < data.x.length; i++) {
        const x0 = data.x[i], y0 = data.y[i];
        const numerator = Math.abs((endY - startY)*x0 - (endX - startX)*y0 + endX*startY - endY*startX);
        const denominator = Math.sqrt(Math.pow(endY - startY, 2) + Math.pow(endX - startX, 2));
        const dev = denominator === 0 ? 0 : numerator / denominator;
        if (dev > maxDev) maxDev = dev;
    }
    return maxDev; // <--- Zmiana z dev na maxDev
}

function smoothTrajectory(data, windowSize) {
    if (windowSize <= 1 || !data.x) return data;
    const smoothed = { x: [], y: [], t: data.t };
    const half = Math.floor(windowSize / 2);
    
    for (let i = 0; i < data.x.length; i++) {
        let start = Math.max(0, i - half);
        let end = Math.min(data.x.length - 1, i + half);
        let sumX = 0, sumY = 0, count = 0;
        for (let j = start; j <= end; j++) {
            sumX += data.x[j]; sumY += data.y[j]; count++;
        }
        smoothed.x.push(sumX / count);
        smoothed.y.push(sumY / count);
    }
    return smoothed;
}

async function calculateSessionBaseline(session) {
    const calibTrials = session.trials.filter(t => t.is_calibration);
    if (calibTrials.length === 0) return { left: 0, right: 0 };

    const { data: calibData } = await supabase.from('trajectories')
        .select('trial_id, tracking_data')
        .in('trial_id', calibTrials.map(t => t.id));

    let leftSum = 0, leftCount = 0;
    let rightSum = 0, rightCount = 0;

    calibData.forEach(traj => {
        const trial = calibTrials.find(t => t.id === traj.trial_id);
        const md = parseFloat(calculateMaxDeviation(traj.tracking_data));
        if (trial.expected_answer === 'left') { leftSum += md; leftCount++; }
        else { rightSum += md; rightCount++; }
    });

    return {
        left: leftCount ? (leftSum / leftCount) : 0,
        right: rightCount ? (rightSum / rightCount) : 0
    };
}

// --- 4. WIZUALIZACJA I OBSŁUGA PORÓWNAŃ ---
function setupBackground(trial, settings, showCenter = true) {
    const btnLeft = document.getElementById('canvas-target-left');
    const btnRight = document.getElementById('canvas-target-right');
    const stimImg = document.getElementById('canvas-stimulus-image');
    const stimTxt = document.getElementById('canvas-stimulus-text');

    btnLeft.classList.remove('hidden'); btnRight.classList.remove('hidden');

    if (trial.is_calibration) {
        btnLeft.innerHTML = 'Lewa odpowiedź'; btnRight.innerHTML = 'Prawa odpowiedź';
        stimImg.classList.add('hidden');
        if (showCenter) {
            stimTxt.classList.remove('hidden');
            stimTxt.textContent = trial.expected_answer === 'left' ? "Kliknij w lewą odpowiedź" : "Kliknij w prawą odpowiedź";
        } else stimTxt.classList.add('hidden');
    } else {
        btnLeft.innerHTML = `<span>${settings?.left_text || 'Opcja A'}</span><span style="font-size: 1.5em;">${settings?.left_symbol || ''}</span>`;
        btnRight.innerHTML = `<span style="font-size: 1.5em;">${settings?.right_symbol || ''}</span><span>${settings?.right_text || 'Opcja B'}</span>`;
        stimTxt.classList.add('hidden');
        if (showCenter && trial.stimuli && trial.stimuli.image_url) {
            stimImg.src = trial.stimuli.image_url; stimImg.classList.remove('hidden');
        } else stimImg.classList.add('hidden');
    }
}

async function loadTrialDetails(trial, sessionId, settings) {
    emptyState.classList.add('hidden'); 
    
    // Upewniamy się, że kontrolki analizy są widoczne
    if(analysisControls) analysisControls.classList.remove('hidden');
    
    detailsPanel.classList.remove('hidden'); 
    canvasPanel.classList.remove('hidden');
    
    currentSessionIdStr = sessionId;
    
    const session = globalTrialsMap[trial.id].session;
    currentSessionBaseMD = await calculateSessionBaseline(session);

    setupBackground(trial, settings, true);
    const { data: trajData } = await supabase.from('trajectories').select('tracking_data').eq('trial_id', trial.id).single();
    
    if (trajData && trajData.tracking_data) {
        currentActiveData = trajData.tracking_data;
        currentActiveMeta = trial;
        redrawActiveData();
    } else {
        currentActiveData = null;
        clearCanvas(); 
        ctx.fillStyle = '#fff'; ctx.fillText("Brak zapisanej trajektorii", canvas.width/2 - 50, canvas.height/2);
    }
}

// Odtworzona funkcja dla przycisku "Oczko" (Wykres zbiorczy wszystkich prób z jednej sesji)
async function loadSessionDetails(session, settings) {
    emptyState.classList.add('hidden');
    // Ukrywamy suwaki, bo do wykresów zbiorczych używamy tylko surowych danych
    if (analysisControls) analysisControls.classList.add('hidden');
    detailsPanel.classList.remove('hidden');
    canvasPanel.classList.remove('hidden');
    
    const trialIds = session.trials.map(t => t.id);
    
    detailsContent.innerHTML = `
        <div class="detail-item" style="grid-column: span 3; background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <h3 style="margin-bottom: 5px;">👁️ Zbiorczy podgląd sesji</h3>
            <p style="font-size: 13px; color: #666;">Wyświetlanie nakładających się ścieżek z <strong>${session.trials.length}</strong> prób.</p>
        </div>
        <div class="detail-item" style="grid-column: span 3;">
            <strong>Legenda:</strong> <span style="color:#888;">Szary (Kalibracja)</span>, <span style="color:#28a745;">Zielony (Poprawne)</span>, <span style="color:#dc3545;">Czerwony (Błędne)</span>
        </div>
    `;

    if (session.trials.length > 0) {
        setupBackground(session.trials[session.trials.length-1], settings, false);
    }

    clearCanvas();
    ctx.fillStyle = '#fff';
    ctx.fillText("Pobieranie ścieżek z bazy (to może chwilę potrwać)...", canvas.width/2 - 120, canvas.height/2);

    // Omijamy limit zapytań pobierając partiami, tak jak w nowym eksporcie CSV
    let allTrajectories = [];
    for (let i = 0; i < trialIds.length; i += 200) {
        const chunk = trialIds.slice(i, i + 200);
        const { data } = await supabase.from('trajectories').select('trial_id, tracking_data').in('trial_id', chunk);
        if (data) allTrajectories.push(...data);
    }
    
    clearCanvas();

    if (allTrajectories && allTrajectories.length > 0) {
        session.trials.forEach(trial => {
            const trajRow = allTrajectories.find(t => t.trial_id === trial.id);
            // Zwróć uwagę na "true" na końcu - sprawia, że linie są półprzezroczyste i lepiej widać gęstość
            if (trajRow && trajRow.tracking_data) drawTrajectory(trajRow.tracking_data, trial, true);
        });
    } else {
        ctx.fillStyle = '#fff'; 
        ctx.fillText("Brak zapisanych trajektorii dla tej sesji.", canvas.width/2 - 90, canvas.height/2);
    }
}

function redrawActiveData() {
    if (!currentActiveData) return;
    
    const smoothLvl = parseInt(smoothingSlider.value);
    const threshold = parseInt(thresholdSlider.value) / 100;
    
    const processedData = smoothTrajectory(currentActiveData, smoothLvl);
    const rawMD = parseFloat(calculateMaxDeviation(processedData));
    
    const baseline = currentActiveMeta.expected_answer === 'left' ? currentSessionBaseMD.left : currentSessionBaseMD.right;
    const deviationFromNorm = rawMD - baseline;
    const isAnomaly = rawMD > threshold;

    detailsContent.innerHTML = `
        <div class="detail-item"><strong>ID Sesji:</strong> ${currentSessionIdStr.substring(0,8)}...</div>
        <div class="detail-item"><strong>Typ Próby:</strong> ${currentActiveMeta.is_calibration ? 'Kalibracja' : 'Eksperyment'}</div>
        <div class="detail-item"><strong>Czas reakcji:</strong> ${currentActiveMeta.response_time_ms} ms</div>
        <div class="detail-item"><strong>Wybrana Odpowiedź:</strong> ${currentActiveMeta.chosen_answer.toUpperCase()}</div>
        <div class="detail-item"><strong>Poprawna Odpowiedź:</strong> ${currentActiveMeta.expected_answer ? currentActiveMeta.expected_answer.toUpperCase() : 'Brak'}</div>
        <div class="detail-item"><strong>Max Odchylenie (MD):</strong> ${rawMD.toFixed(3)} j.</div>
        <div class="detail-item" style="background: ${isAnomaly ? '#ffebee' : '#e8f5e9'}; padding: 5px; border-radius: 4px; grid-column: span 3;">
            <strong>Anomalia motoryczna:</strong> 
            ${deviationFromNorm > 0 ? '+' : ''}${deviationFromNorm.toFixed(3)} j. 
            ${isAnomaly ? '⚠️ DUŻE ZAWAHANIE' : '✅ w normie'}
        </div>
    `;

    clearCanvas();
    drawTrajectory(processedData, currentActiveMeta, false, isAnomaly);
}

// Funkcja do renderowania zaznaczonych z Checkboxów
compareSelectedBtn.addEventListener('click', async () => {
    const checkedCbs = document.querySelectorAll('.trial-cb:checked');
    if (checkedCbs.length === 0) return alert("Najpierw zaznacz checkboxy przy próbach (lub całych osobach/badaniach), które chcesz porównać.");

    const trialIds = Array.from(checkedCbs).map(cb => cb.value);

    emptyState.classList.add('hidden'); 
    if(analysisControls) analysisControls.classList.add('hidden'); // Ukrywamy suwaki dla widoku zbiorczego
    detailsPanel.classList.remove('hidden'); 
    canvasPanel.classList.remove('hidden');
    
    detailsContent.innerHTML = `
        <div class="detail-item" style="grid-column: span 3;">
            <strong>Analiza systemowa:</strong> Porównywanie <strong>${trialIds.length}</strong> zaznaczonych prób.
        </div>
        <div class="detail-item" style="grid-column: span 3;">
            <strong>Legenda:</strong> <span style="color:#888;">Szary(Kalib.)</span>, <span style="color:#28a745;">Zielony(Poprawne)</span>, <span style="color:#dc3545;">Czerwony(Błędne)</span>
        </div>
    `;

    const firstSelected = globalTrialsMap[trialIds[0]];
    setupBackground(firstSelected.trial, firstSelected.settings, false);

    clearCanvas();
    ctx.fillStyle = '#fff'; ctx.fillText(`Pobieranie ${trialIds.length} ścieżek z bazy...`, canvas.width/2 - 90, canvas.height/2);

    let allTrajectories = [];
    for (let i = 0; i < trialIds.length; i += 200) {
        const chunk = trialIds.slice(i, i + 200);
        const { data } = await supabase.from('trajectories').select('trial_id, tracking_data').in('trial_id', chunk);
        if (data) allTrajectories.push(...data);
    }

    clearCanvas();
    if (allTrajectories.length > 0) {
        trialIds.forEach(id => {
            const trajRow = allTrajectories.find(t => t.trial_id === id);
            if (trajRow && trajRow.tracking_data) {
                drawTrajectory(trajRow.tracking_data, globalTrialsMap[id].trial, true);
            }
        });
    } else {
        ctx.fillStyle = '#fff'; ctx.fillText("Brak danych trajektorii dla wybranego zestawu.", canvas.width/2 - 70, canvas.height/2);
    }
});


function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

function drawTrajectory(data, trialMeta, isAggregated = false, isAnomaly = false) {
    if (!data.x || data.x.length === 0) return;
    const w = canvas.width; const h = canvas.height;
    let alpha = isAggregated ? 0.6 : 1.0;
    
    // Sprawdzamy czy włączona jest mapa ciepła (tylko dla pojedynczych prób, przy zbiorczych to wyłączamy by nie robić chaosu)
    const heatmapCb = document.getElementById('show-heatmap');
    const useHeatmap = heatmapCb && heatmapCb.checked && !isAggregated && data.t && data.t.length > 1;

    let defaultColor = `rgba(0, 123, 255, ${alpha})`;
    if (trialMeta.is_calibration) defaultColor = `rgba(170, 170, 170, ${alpha})`;
    else if (trialMeta.expected_answer) defaultColor = (trialMeta.chosen_answer === trialMeta.expected_answer) ? `rgba(40, 167, 69, ${alpha})` : `rgba(220, 53, 69, ${alpha})`;
    
    let defaultWidth = isAnomaly && !isAggregated ? 5 : 2;

    if (isAnomaly && !isAggregated && !useHeatmap) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = defaultColor;
    } else {
        ctx.shadowBlur = 0;
    }

    // --- RYSOWANIE ŚCIEŻKI GŁÓWNEJ ---
    if (useHeatmap) {
        // Logika Mapy Ciepła
        // 1. Wyliczamy prędkości dla wszystkich segmentów, żeby znaleźć prędkość maksymalną (do normalizacji)
        let speeds = [];
        for (let i = 1; i < data.x.length; i++) {
            const dx = data.x[i] - data.x[i-1];
            const dy = data.y[i] - data.y[i-1];
            const dt = data.t[i] - data.t[i-1];
            const speed = dt > 0 ? Math.sqrt(dx*dx + dy*dy) / dt : 0;
            speeds.push(speed);
        }
        const maxSpeed = Math.max(...speeds, 0.0001); // Zabezpieczenie przed dzieleniem przez 0

        // 2. Rysujemy odcinek po odcinku
        for (let i = 1; i < data.x.length; i++) {
            const normalizedSpeed = speeds[i-1] / maxSpeed; // od 0.0 (stoi) do 1.0 (bardzo szybko)
            
            // Konwersja prędkości na kolor HSL (0 = Czerwony, 240 = Niebieski)
            // Zwalnianie -> kolor spada w kierunku zera (czerwieni)
            const hue = normalizedSpeed * 240; 
            ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
            
            // Grubość: im wolniej, tym grubsza linia (tzw. zastoje/wahania są pogrubione)
            ctx.lineWidth = 2 + (1 - normalizedSpeed) * 6;

            ctx.beginPath();
            const px1 = ((data.x[i-1] + 1) / 2) * w;
            const py1 = ((-data.y[i-1] + 1) / 2) * h;
            const px2 = ((data.x[i] + 1) / 2) * w;
            const py2 = ((-data.y[i] + 1) / 2) * h;
            ctx.moveTo(px1, py1);
            ctx.lineTo(px2, py2);
            ctx.stroke();
        }
    } else {
        // Standardowe rysowanie linii
        ctx.beginPath();
        for (let i = 0; i < data.x.length; i++) {
            const px = ((data.x[i] + 1) / 2) * w; const py = ((-data.y[i] + 1) / 2) * h;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = defaultColor; ctx.lineWidth = defaultWidth; ctx.lineJoin = 'round'; ctx.stroke();
    }
    
    // Punkt startowy
    ctx.beginPath(); ctx.arc(((data.x[0] + 1) / 2) * w, ((-data.y[0] + 1) / 2) * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 193, 7, ${alpha})`; ctx.fill();
    ctx.shadowBlur = 0;

    // --- RYSOWANIE ŚCIEŻKI POWROTNEJ ---
    const showReturnCb = document.getElementById('show-return-path');
    if (showReturnCb && showReturnCb.checked && data.return_x && data.return_x.length > 0) {
        ctx.beginPath();
        for (let i = 0; i < data.return_x.length; i++) {
            const px = ((data.return_x[i] + 1) / 2) * w; 
            const py = ((-data.return_y[i] + 1) / 2) * h;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(156, 39, 176, ${alpha})`; 
        ctx.lineWidth = 1.5; 
        ctx.lineDashOffset = 0;
        ctx.setLineDash([5, 5]); 
        ctx.stroke();
        ctx.setLineDash([]); 
    }
}

// Podpinamy nasłuchiwanie na przyciski by wyzwalać przerysowanie
const showHeatmapCb = document.getElementById('show-heatmap');
if (showHeatmapCb) showHeatmapCb.addEventListener('change', redrawActiveData);

const showReturnPathCb = document.getElementById('show-return-path');
if (showReturnPathCb) showReturnPathCb.addEventListener('change', redrawActiveData);

// NOWOŚĆ: Karta Uczestnika (Ankieta + Profil Motoryczny)
async function loadParticipantSummary(session) {
    emptyState.classList.add('hidden');
    if(analysisControls) analysisControls.classList.add('hidden'); // Suwaki tu nie są potrzebne
    detailsPanel.classList.remove('hidden');
    canvasPanel.classList.remove('hidden');

    detailsContent.innerHTML = `<p>Ładowanie profilu uczestnika...</p>`;
    clearCanvas();
    ctx.fillStyle = '#fff';
    ctx.fillText("Obliczanie profilu na podstawie kalibracji...", canvas.width/2 - 120, canvas.height/2);

    // Wyliczamy normę z kalibracji
    const baseMD = await calculateSessionBaseline(session);
    
    const demo = session.participants?.demographics || {};
    const device = session.device_info || {};
    
    // Renderujemy Kartę z danymi ankietowymi i wnioskami z kalibracji
    detailsContent.innerHTML = `
        <div class="detail-item" style="grid-column: span 3; background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <h3 style="margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">📋 Karta Uczestnika</h3>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                <div><strong>Wiek:</strong> ${demo.age || 'Brak'}</div>
                <div><strong>Płeć:</strong> ${demo.gender || 'Brak'}</div>
                <div><strong>Ręczność:</strong> ${demo.handedness || 'Brak'}</div>
                <div><strong>Wzrok:</strong> ${demo.vision || 'Brak'}</div>
                <div><strong>Zamieszkanie:</strong> ${demo.residence || 'Brak'}</div>
                <div><strong>Układ opcji:</strong> ${session.options_mapping === 'reversed' ? 'Odwrócony 🔄' : 'Normalny'}</div>
                <div style="grid-column: span 2;"><strong>Rozdzielczość (UX):</strong> ${device.width || '?'}x${device.height || '?'}</div>
            </div>
        </div>
        <div class="detail-item" style="grid-column: span 3; background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 10px;">
            <h3 style="margin-bottom: 15px; border-bottom: 1px solid #b3e5fc; padding-bottom: 5px;">🎯 Profil Motoryczny (Baza Kalibracyjna)</h3>
            <p style="margin-bottom: 10px;">Średnie wygięcie łuku (MD) traktowane u tego badanego jako <strong>naturalna norma</strong>:</p>
            <div style="display: flex; gap: 20px;">
                <div style="flex:1; background: #fff; padding: 15px; border-radius: 4px; text-align: center; border: 1px solid #90caf9;">
                    <span style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Ruch do LEWEGO rogu</span>
                    <span style="color: #1976d2; font-size: 20px; font-weight: bold;">${baseMD.left.toFixed(3)} j.</span>
                </div>
                <div style="flex:1; background: #fff; padding: 15px; border-radius: 4px; text-align: center; border: 1px solid #90caf9;">
                    <span style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Ruch do PRAWEGO rogu</span>
                    <span style="color: #1976d2; font-size: 20px; font-weight: bold;">${baseMD.right.toFixed(3)} j.</span>
                </div>
            </div>
        </div>
    `;

    // Na koniec rysujemy wszystkie jego próby kalibracyjne zbiorczo
    const calibTrials = session.trials.filter(t => t.is_calibration);
    const { data: calibData } = await supabase.from('trajectories')
        .select('trial_id, tracking_data')
        .in('trial_id', calibTrials.map(t => t.id));

    setupBackground({is_calibration: true, expected_answer: 'left'}, {}, false);
    const stimTxt = document.getElementById('canvas-stimulus-text');
    if (stimTxt) stimTxt.classList.add('hidden'); // Ukrywamy środkowy napis dla czytelności

    clearCanvas();
    if (calibData && calibData.length > 0) {
        calibData.forEach(traj => {
            const trial = calibTrials.find(t => t.id === traj.trial_id);
            drawTrajectory(traj.tracking_data, trial, true);
        });
    } else {
        ctx.fillStyle = '#fff'; ctx.fillText("Brak danych kalibracji.", canvas.width/2 - 70, canvas.height/2);
    }
}


// ==========================================
// 5. OBSŁUGA KREATORA BADANIA I BIBLIOTEKI OBRAZKÓW
// ==========================================
const navDashboard = document.getElementById('nav-dashboard');
const navCreate = document.getElementById('nav-create');
const viewDashboard = document.getElementById('view-dashboard');
const viewCreate = document.getElementById('view-create');
const stimuliListContainer = document.getElementById('stimuli-list');
const addStimulusBtn = document.getElementById('add-stimulus-btn');
const createExperimentForm = document.getElementById('create-experiment-form');
const saveBtn = document.getElementById('save-experiment-btn');
const useLocalOptionsCb = document.getElementById('use-local-options');
const globalOptionsContainer = document.getElementById('global-options-container');

const imageLibraryModal = document.getElementById('image-library-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const libraryGrid = document.getElementById('library-grid');
let activeRowForLibrary = null; 

useLocalOptionsCb.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    globalOptionsContainer.style.opacity = isChecked ? '0.4' : '1';
    
    document.querySelectorAll('.local-options-container').forEach(el => {
        if (isChecked) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
});

navDashboard.addEventListener('click', () => {
    navDashboard.classList.add('active'); navCreate.classList.remove('active');
    viewDashboard.classList.remove('hidden'); viewDashboard.classList.add('active'); 
    viewCreate.classList.remove('active'); viewCreate.classList.add('hidden');
    buildTree();
});
navCreate.addEventListener('click', () => {
    navCreate.classList.add('active'); navDashboard.classList.remove('active');
    viewCreate.classList.remove('hidden'); viewCreate.classList.add('active'); 
    viewDashboard.classList.remove('active'); viewDashboard.classList.add('hidden');
});

closeModalBtn.addEventListener('click', () => imageLibraryModal.classList.add('hidden'));

async function openImageLibrary(rowElement) {
    activeRowForLibrary = rowElement;
    imageLibraryModal.classList.remove('hidden');
    libraryGrid.innerHTML = '<p>Pobieranie obrazków z bazy...</p>';

    const { data: files, error } = await supabase.storage.from('stimuli').list();

    if (error) {
        return libraryGrid.innerHTML = '<p style="color:red;">Błąd łączenia z bazą.</p>';
    }

    const validFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder');
    
    if (validFiles.length === 0) {
        return libraryGrid.innerHTML = '<p>Biblioteka jest pusta. Wgraj pierwsze pliki z dysku w kreatorze.</p>';
    }

    libraryGrid.innerHTML = '';
    
    validFiles.forEach(file => {
        const { data: urlData } = supabase.storage.from('stimuli').getPublicUrl(file.name);
        const imgUrl = urlData.publicUrl;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'library-item';
        itemDiv.innerHTML = `<img src="${imgUrl}" title="${file.name}">`;
        
        itemDiv.addEventListener('click', () => {
            activeRowForLibrary.dataset.sourceType = 'url';
            activeRowForLibrary.dataset.imageUrl = imgUrl;
            activeRowForLibrary.querySelector('.row-preview').src = imgUrl;
            activeRowForLibrary.querySelector('.file-input').value = ''; 
            imageLibraryModal.classList.add('hidden');
        });
        
        libraryGrid.appendChild(itemDiv);
    });
}

function addStimulusRow() {
    const row = document.createElement('div'); 
    row.className = 'stimulus-row';
    row.dataset.sourceType = 'none'; 
    row.dataset.imageUrl = '';

    const isLocalEnabled = useLocalOptionsCb.checked;

    row.innerHTML = `
        <div class="row-main">
            <img class="row-preview" src="https://dummyimage.com/60x60/eee/999&text=?" alt="Podgląd">
            <div class="row-actions">
                <button type="button" class="btn-secondary select-library-btn" style="padding: 6px; font-size: 12px; border-radius: 4px;">📂 Z bazy</button>
                <input type="file" accept="image/*" class="file-input">
            </div>
            <select class="target-select" required>
                <option value="" disabled selected>Poprawna strona...</option>
                <option value="left">Lewa</option>
                <option value="right">Prawa</option>
            </select>
            <button type="button" class="remove-row-btn" style="border:none; border-radius:4px; padding: 10px;">🗑️</button>
        </div>
        
        <div class="local-options-container ${isLocalEnabled ? '' : 'hidden'}">
            <div class="local-col">
                <label style="font-size: 11px; color:#666; font-weight:bold;">Opcja LEWA (dla tego obrazka)</label>
                <input type="text" class="loc-l-txt" placeholder="Tekst odpowiedzi (np. Słodkie)">
                <input type="text" class="loc-l-sym" placeholder="Znak (opcjonalnie)">
            </div>
            <div class="local-col">
                <label style="font-size: 11px; color:#666; font-weight:bold;">Opcja PRAWA (dla tego obrazka)</label>
                <input type="text" class="loc-r-txt" placeholder="Tekst odpowiedzi (np. Słone)">
                <input type="text" class="loc-r-sym" placeholder="Znak (opcjonalnie)">
            </div>
        </div>
    `;

    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    row.querySelector('.select-library-btn').addEventListener('click', () => openImageLibrary(row));
    row.querySelector('.file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            row.dataset.sourceType = 'file';
            row.querySelector('.row-preview').src = URL.createObjectURL(file);
        }
    });

    stimuliListContainer.appendChild(row);
}
addStimulusBtn.addEventListener('click', addStimulusRow); addStimulusRow();

createExperimentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = Array.from(stimuliListContainer.querySelectorAll('.stimulus-row'));
    if (rows.length === 0) return alert('Dodaj co najmniej jeden obrazek!');
    
    for (let r of rows) {
        if (r.dataset.sourceType === 'none') return alert('Błąd: Jedno z pytań nie ma wybranego obrazka!');
    }

    saveBtn.disabled = true; saveBtn.textContent = 'Przetwarzanie... to potrwa chwilę.';

    try {
        const useLocal = useLocalOptionsCb.checked;

        const settings = {
            left_text: document.getElementById('exp-left-text').value, 
            left_symbol: document.getElementById('exp-left-symbol').value,
            right_text: document.getElementById('exp-right-text').value, 
            right_symbol: document.getElementById('exp-right-symbol').value,
            use_local_options: useLocal,
            record_return_path: document.getElementById('record-return-path').checked // <-- NOWE
        };

        const { data: expData, error: expErr } = await supabase.from('experiments').insert([{ name: document.getElementById('exp-name').value, settings: settings, is_active: false }]).select().single();
        if (expErr) throw expErr;
        const newExperimentId = expData.id;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const selectTarget = row.querySelector('.target-select').value;
            const sourceType = row.dataset.sourceType;
            let finalImageUrl = "";

            if (sourceType === 'file') {
                const fileInput = row.querySelector('.file-input');
                const file = fileInput.files[0]; 
                const fileExt = file.name.split('.').pop(); 
                const uniqueFileName = `${crypto.randomUUID()}.${fileExt}`;
                const { error: uploadErr } = await supabase.storage.from('stimuli').upload(uniqueFileName, file);
                if (uploadErr) throw uploadErr;
                const { data: publicUrlData } = supabase.storage.from('stimuli').getPublicUrl(uniqueFileName);
                finalImageUrl = publicUrlData.publicUrl;
            } else if (sourceType === 'url') {
                finalImageUrl = row.dataset.imageUrl;
            }

            let localSettings = null;
            if (useLocal) {
                localSettings = {
                    left_text: row.querySelector('.loc-l-txt').value,
                    left_symbol: row.querySelector('.loc-l-sym').value,
                    right_text: row.querySelector('.loc-r-txt').value,
                    right_symbol: row.querySelector('.loc-r-sym').value,
                };
            }

            await supabase.from('stimuli').insert([{ 
                experiment_id: newExperimentId, 
                image_url: finalImageUrl, 
                correct_answer: selectTarget, 
                order_index: i + 1,
                settings: localSettings
            }]);
        }

        alert('Suckes! Badanie zostało utworzone.'); 
        createExperimentForm.reset(); 
        useLocalOptionsCb.checked = false; 
        globalOptionsContainer.style.opacity = '1';
        stimuliListContainer.innerHTML = ''; 
        addStimulusRow();
    } catch (error) {
        console.error(error); alert('Błąd podczas zapisywania: ' + error.message);
    } finally {
        saveBtn.disabled = false; saveBtn.textContent = 'Zapisz i Utwórz Badanie';
    }
});

// ==========================================
// 6. GENEROWANIE I EKSPORT CSV
// ==========================================
async function exportToCSV(experimentId, experimentName, buttonElement) {
    const originalText = buttonElement.innerHTML; buttonElement.innerHTML = "⏳ Pobieram..."; buttonElement.disabled = true;
    try {
        const { data: sessions, error } = await supabase
            .from('sessions')
            .select(`
                id, started_at, device_info, options_mapping,
                participants ( demographics ),
                trials (
                    id, is_calibration, expected_answer, chosen_answer, response_time_ms,
                    stimuli ( image_url )
                )
            `)
            .eq('experiment_id', experimentId);

        if (error) throw error;
        if (!sessions || sessions.length === 0) { alert("Brak danych do wyeksportowania."); return; }

        let trialIds = []; sessions.forEach(s => s.trials.forEach(t => trialIds.push(t.id)));
        let allTrajectories = [];
        for (let i = 0; i < trialIds.length; i += 200) {
            const chunk = trialIds.slice(i, i + 200);
            const { data: trajChunk } = await supabase.from('trajectories').select('trial_id, tracking_data').in('trial_id', chunk);
            if (trajChunk) allTrajectories.push(...trajChunk);
        }

        const headers = [
            "Nazwa_Eksperymentu", "ID_Sesji", "Data_Badania", "Uklad_Opcji", 
            "Wiek", "Plec", "Miejsce_Zamieszkania", "Recznosc", "Wzrok",
            "Szerokosc_Ekranu", "Wysokosc_Ekranu",
            "ID_Proby", "Czy_Kalibracja", "Obrazek_URL",
            "Oczekiwana_Odp", "Wybrana_Odp", "Czy_Poprawna", 
            "Czas_Reakcji_ms",
            "Trajektoria_X", "Trajektoria_Y", "Trajektoria_Czas_ms",
            "Powrot_X", "Powrot_Y", "Powrot_Czas_ms" // <-- NOWE
        ];
        let csvContent = headers.join(";") + "\n";

        sessions.forEach(session => {
            const date = new Date(session.started_at).toLocaleString('pl-PL'); const demo = session.participants?.demographics || {}; const device = session.device_info || {};
            const sessionData = [
                experimentName, session.id, date, 
                session.options_mapping || "normal", 
                demo.age || "brak", demo.gender || "brak", demo.residence || "brak", demo.handedness || "brak", demo.vision || "brak",
                device.width || "brak", device.height || "brak"
            ];

            session.trials.forEach(trial => {
                const isCorrect = (trial.chosen_answer === trial.expected_answer) ? 1 : 0;
                const imgUrl = trial.stimuli?.image_url || "brak_obrazka";
                const trajRow = allTrajectories.find(t => t.trial_id === trial.id);
                let trajX = "[]", trajY = "[]", trajT = "[]";
                let retX = "[]", retY = "[]", retT = "[]"; // <-- NOWE
                
                if (trajRow && trajRow.tracking_data && trajRow.tracking_data.x && trajRow.tracking_data.x.length > 0) {
                    trajX = `"[${trajRow.tracking_data.x.join(',')}]"`; 
                    trajY = `"[${trajRow.tracking_data.y.join(',')}]"`; 
                    trajT = `"[${trajRow.tracking_data.t.join(',')}]"`;
                    
                    // Ekstrakcja danych powrotnych
                    if (trajRow.tracking_data.return_x) {
                        retX = `"[${trajRow.tracking_data.return_x.join(',')}]"`;
                        retY = `"[${trajRow.tracking_data.return_y.join(',')}]"`;
                        retT = `"[${trajRow.tracking_data.return_t.join(',')}]"`;
                    }
                }
                const trialData = [ trial.id, trial.is_calibration ? 1 : 0, imgUrl, trial.expected_answer || "brak", trial.chosen_answer || "brak", isCorrect, trial.response_time_ms, trajX, trajY, trajT, retX, retY, retT ]; // Zaktualizowana tablica
                csvContent += [...sessionData, ...trialData].join(";") + "\n";
            });
        });

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); const safeName = experimentName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.setAttribute("href", url); link.setAttribute("download", `wyniki_${safeName}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) {
        console.error(error); alert("Wystąpił błąd podczas generowania pliku: " + err.message);
    } finally {
        buttonElement.innerHTML = originalText; buttonElement.disabled = false;
    }
}