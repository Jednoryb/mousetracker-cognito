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

// --- 2. BUDOWANIE DRZEWKA (Z przyciskiem CSV) ---
async function buildTree() {
    treeContainer.innerHTML = '<p>Pobieranie eksperymentów...</p>';
    
    const { data: experiments, error } = await supabase
        .from('experiments')
        .select(`
            id, name, settings,
            sessions ( id, participant_id, started_at,
                trials ( id, response_time_ms, chosen_answer, is_calibration, expected_answer, stimuli (image_url) )
            )
        `);

    if (error) return treeContainer.innerHTML = 'Błąd ładowania danych: ' + error.message;
    treeContainer.innerHTML = '';

    experiments.forEach(exp => {
        // ZMIANA: Zamiast zwykłego createTreeNode, tworzymy dedykowany wiersz z przyciskiem eksportu CSV
        const expWrapper = document.createElement('div');
        expWrapper.className = 'tree-node';
        
        const expItem = document.createElement('div');
        expItem.className = 'tree-item';
        expItem.innerHTML = `
            <span style="flex:1; font-weight: bold;">📁 ${exp.name}</span>
            <button class="compare-btn" title="Pobierz wyniki CSV" style="background: #28a745; color: white; padding: 4px 8px;">💾 CSV</button>
        `;
        
        // Rozwijanie po kliknięciu w tekst
        expItem.querySelector('span').addEventListener('click', (e) => {
            e.stopPropagation(); 
            toggleNode(expWrapper);
        });

        // Pobieranie CSV po kliknięciu w przycisk
        const exportBtn = expItem.querySelector('button');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportToCSV(exp.id, exp.name, exportBtn);
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
                <span style="flex:1;">👤 Uczestnik ${sIdx + 1} (${dateStr})</span>
                <button class="compare-btn" title="Pokaż wszystkie trasy">👁️</button>
            `;
            
            sessItem.querySelector('span').addEventListener('click', (e) => {
                e.stopPropagation(); toggleNode(sessWrapper);
            });
            
            sessItem.querySelector('.compare-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active-node'));
                sessItem.classList.add('active-node');
                loadSessionDetails(session, exp.settings); 
            });
            
            sessWrapper.appendChild(sessItem);
            const sessChildren = createChildrenContainer();

            session.trials.forEach((trial, tIdx) => {
                const label = trial.is_calibration ? `🔧 Kalibracja ${tIdx+1}` : `🖼️ Pytanie ${tIdx+1}`;
                const trialNode = createTreeNode(label, () => loadTrialDetails(trial, session.id, exp.settings), true);
                sessChildren.appendChild(trialNode);
            });

            sessWrapper.appendChild(sessChildren);
            expChildren.appendChild(sessWrapper);
        });

        expWrapper.appendChild(expChildren);
        treeContainer.appendChild(expWrapper);
    });
}

function createTreeNode(text, onClick, isLeaf = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    const item = document.createElement('div');
    item.className = 'tree-item';
    item.innerHTML = `<span>${text}</span>`;
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active-node'));
        if(isLeaf) item.classList.add('active-node');
        onClick();
    });
    wrapper.appendChild(item);
    return wrapper;
}
function createChildrenContainer() {
    const div = document.createElement('div'); div.className = 'tree-children'; return div;
}
function toggleNode(node) {
    const children = node.querySelector('.tree-children'); if (children) children.classList.toggle('open');
}

// --- 3. WYŚWIETLANIE WYNIKÓW I TŁA BADANIA ---
function setupBackground(trial, settings, showCenter = true) {
    const btnLeft = document.getElementById('canvas-target-left');
    const btnRight = document.getElementById('canvas-target-right');
    const stimImg = document.getElementById('canvas-stimulus-image');
    const stimTxt = document.getElementById('canvas-stimulus-text');

    btnLeft.classList.remove('hidden');
    btnRight.classList.remove('hidden');

    if (trial.is_calibration) {
        btnLeft.innerHTML = 'Lewa odpowiedź';
        btnRight.innerHTML = 'Prawa odpowiedź';
        stimImg.classList.add('hidden');
        
        if (showCenter) {
            stimTxt.classList.remove('hidden');
            stimTxt.textContent = trial.expected_answer === 'left' ? "Kliknij w lewą odpowiedź" : "Kliknij w prawą odpowiedź";
        } else {
            stimTxt.classList.add('hidden');
        }
    } else {
        btnLeft.innerHTML = `<span>${settings?.left_text || 'Opcja A'}</span><span style="font-size: 1.5em;">${settings?.left_symbol || ''}</span>`;
        btnRight.innerHTML = `<span style="font-size: 1.5em;">${settings?.right_symbol || ''}</span><span>${settings?.right_text || 'Opcja B'}</span>`;
        stimTxt.classList.add('hidden');
        
        if (showCenter && trial.stimuli && trial.stimuli.image_url) {
            stimImg.src = trial.stimuli.image_url;
            stimImg.classList.remove('hidden');
        } else {
            stimImg.classList.add('hidden');
        }
    }
}

async function loadTrialDetails(trial, sessionId, settings) {
    emptyState.classList.add('hidden');
    detailsPanel.classList.remove('hidden');
    canvasPanel.classList.remove('hidden');
    
    detailsContent.innerHTML = `
        <div class="detail-item"><strong>ID Sesji:</strong> ${sessionId.substring(0,8)}...</div>
        <div class="detail-item"><strong>Typ Próby:</strong> ${trial.is_calibration ? 'Kalibracja' : 'Eksperyment'}</div>
        <div class="detail-item"><strong>Czas reakcji:</strong> ${trial.response_time_ms} ms</div>
        <div class="detail-item"><strong>Wybrana Odpowiedź:</strong> ${trial.chosen_answer.toUpperCase()}</div>
        <div class="detail-item"><strong>Poprawna Odpowiedź:</strong> ${trial.expected_answer ? trial.expected_answer.toUpperCase() : 'Brak'}</div>
    `;

    setupBackground(trial, settings, true);
    const { data: trajData } = await supabase.from('trajectories').select('tracking_data').eq('trial_id', trial.id).single();
    clearCanvas();

    if (trajData && trajData.tracking_data) {
        drawTrajectory(trajData.tracking_data, trial);
    } else {
        ctx.fillStyle = '#fff';
        ctx.fillText("Brak zapisanej trajektorii", canvas.width/2 - 50, canvas.height/2);
    }
}

async function loadSessionDetails(session, settings) {
    emptyState.classList.add('hidden');
    detailsPanel.classList.remove('hidden');
    canvasPanel.classList.remove('hidden');
    
    const trialIds = session.trials.map(t => t.id);
    
    detailsContent.innerHTML = `
        <div class="detail-item"><strong>ID Sesji:</strong> ${session.id.substring(0,8)}...</div>
        <div class="detail-item"><strong>Wykres zbiorczy:</strong> ${session.trials.length} prób.</div>
        <div class="detail-item"><strong>Legenda:</strong> <span style="color:#888;">Szary(Kalib.)</span>, <span style="color:#28a745;">Zielony(Okej)</span>, <span style="color:#dc3545;">Czerwony(Błąd)</span></div>
    `;

    if (session.trials.length > 0) {
        setupBackground(session.trials[session.trials.length-1], settings, false);
    }

    clearCanvas();
    ctx.fillStyle = '#fff';
    ctx.fillText("Pobieranie wielu ścieżek z bazy...", canvas.width/2 - 70, canvas.height/2);

    const { data: trajectoriesArray } = await supabase.from('trajectories').select('trial_id, tracking_data').in('trial_id', trialIds);
    clearCanvas();

    if (trajectoriesArray && trajectoriesArray.length > 0) {
        session.trials.forEach(trial => {
            const trajRow = trajectoriesArray.find(t => t.trial_id === trial.id);
            if (trajRow && trajRow.tracking_data) drawTrajectory(trajRow.tracking_data, trial, true);
        });
    }
}

// --- 4. MATEMATYKA I RYSOWANIE NA PŁÓTNIE ---
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawTrajectory(data, trialMeta, isAggregated = false) {
    if (!data.x || data.x.length === 0) return;
    
    const w = canvas.width;
    const h = canvas.height;
    let alpha = isAggregated ? 0.6 : 1.0;
    let lineColor = `rgba(0, 123, 255, ${alpha})`;
    
    if (trialMeta.is_calibration) {
        lineColor = `rgba(170, 170, 170, ${alpha})`;
    } else if (trialMeta.expected_answer) {
        lineColor = (trialMeta.chosen_answer === trialMeta.expected_answer) ? `rgba(40, 167, 69, ${alpha})` : `rgba(220, 53, 69, ${alpha})`;
    }

    ctx.beginPath();
    for (let i = 0; i < data.x.length; i++) {
        const px = ((data.x[i] + 1) / 2) * w;
        const py = ((-data.y[i] + 1) / 2) * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(((data.x[0] + 1) / 2) * w, ((-data.y[0] + 1) / 2) * h, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 193, 7, ${alpha})`;
    ctx.fill();
}

// ==========================================
// 5. OBSŁUGA KREATORA BADANIA I NAWIGACJI
// ==========================================
const navDashboard = document.getElementById('nav-dashboard');
const navCreate = document.getElementById('nav-create');
const viewDashboard = document.getElementById('view-dashboard');
const viewCreate = document.getElementById('view-create');
const stimuliListContainer = document.getElementById('stimuli-list');
const addStimulusBtn = document.getElementById('add-stimulus-btn');
const createExperimentForm = document.getElementById('create-experiment-form');
const saveBtn = document.getElementById('save-experiment-btn');

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

function addStimulusRow() {
    const row = document.createElement('div');
    row.className = 'stimulus-row';
    row.innerHTML = `
        <input type="file" accept="image/*" required>
        <select required>
            <option value="" disabled selected>Poprawna strona...</option>
            <option value="left">Lewa</option>
            <option value="right">Prawa</option>
        </select>
        <button type="button" class="remove-row-btn">X</button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    stimuliListContainer.appendChild(row);
}

addStimulusBtn.addEventListener('click', addStimulusRow);
addStimulusRow();

createExperimentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = Array.from(stimuliListContainer.querySelectorAll('.stimulus-row'));
    if (rows.length === 0) return alert('Dodaj co najmniej jeden obrazek!');
    saveBtn.disabled = true; saveBtn.textContent = 'Przetwarzanie... to potrwa chwilę.';

    try {
        const settings = {
            left_text: document.getElementById('exp-left-text').value,
            left_symbol: document.getElementById('exp-left-symbol').value,
            right_text: document.getElementById('exp-right-text').value,
            right_symbol: document.getElementById('exp-right-symbol').value
        };

        const { data: expData, error: expErr } = await supabase
            .from('experiments')
            .insert([{ name: document.getElementById('exp-name').value, settings: settings, is_active: false }])
            .select().single();

        if (expErr) throw expErr;
        const newExperimentId = expData.id;

        for (let i = 0; i < rows.length; i++) {
            const fileInput = rows[i].querySelector('input[type="file"]');
            const selectTarget = rows[i].querySelector('select').value;
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const uniqueFileName = `${crypto.randomUUID()}.${fileExt}`;
            
            const { error: uploadErr } = await supabase.storage.from('stimuli').upload(uniqueFileName, file);
            if (uploadErr) throw uploadErr;

            const { data: publicUrlData } = supabase.storage.from('stimuli').getPublicUrl(uniqueFileName);

            await supabase.from('stimuli').insert([{
                experiment_id: newExperimentId, image_url: publicUrlData.publicUrl,
                correct_answer: selectTarget, order_index: i + 1
            }]);
        }

        alert('Suckes! Badanie zostało utworzone.');
        createExperimentForm.reset(); stimuliListContainer.innerHTML = ''; addStimulusRow();
    } catch (error) {
        console.error(error); alert('Błąd podczas zapisywania: ' + error.message);
    } finally {
        saveBtn.disabled = false; saveBtn.textContent = 'Zapisz i Utwórz Badanie';
    }
});

// ==========================================
// 6. GENEROWANIE I EKSPORT CSV (Wersja rozszerzona i bezpieczna)
// ==========================================
async function exportToCSV(experimentId, experimentName, buttonElement) {
    const originalText = buttonElement.innerHTML;
    buttonElement.innerHTML = "⏳ Pobieram...";
    buttonElement.disabled = true;

    try {
        // 1. Pobieramy sesje, ankiety, próby i obrazki (BEZ ciężkich trajektorii)
        const { data: sessions, error } = await supabase
            .from('sessions')
            .select(`
                id, started_at, device_info,
                participants ( demographics ),
                trials (
                    id, is_calibration, expected_answer, chosen_answer, response_time_ms,
                    stimuli ( image_url )
                )
            `)
            .eq('experiment_id', experimentId);

        if (error) throw error;
        if (!sessions || sessions.length === 0) {
            alert("Brak danych do wyeksportowania dla tego badania.");
            return;
        }

        // 2. Wyciągamy ID wszystkich prób, aby bezpiecznie pobrać z nich trajektorie
        let trialIds = [];
        sessions.forEach(s => s.trials.forEach(t => trialIds.push(t.id)));

        // 3. Pobieramy trajektorie "w paczkach" po 200 sztuk (omija to limity przepustowości Supabase)
        let allTrajectories = [];
        const chunkSize = 200;
        for (let i = 0; i < trialIds.length; i += chunkSize) {
            const chunk = trialIds.slice(i, i + chunkSize);
            const { data: trajChunk } = await supabase
                .from('trajectories')
                .select('trial_id, tracking_data')
                .in('trial_id', chunk);
            
            if (trajChunk) allTrajectories.push(...trajChunk);
        }

        // 4. Rozszerzone nagłówki z nazwą eksperymentu i obrazkiem
        const headers = [
            "Nazwa_Eksperymentu", "ID_Sesji", "Data_Badania", 
            "Wiek", "Plec", "Miejsce_Zamieszkania", "Recznosc", "Wzrok",
            "Szerokosc_Ekranu", "Wysokosc_Ekranu",
            "ID_Proby", "Czy_Kalibracja", "Obrazek_URL",
            "Oczekiwana_Odp", "Wybrana_Odp", "Czy_Poprawna", 
            "Czas_Reakcji_ms",
            "Trajektoria_X", "Trajektoria_Y", "Trajektoria_Czas_ms"
        ];

        let csvContent = headers.join(";") + "\n";

        // 5. Parowanie danych
        sessions.forEach(session => {
            const date = new Date(session.started_at).toLocaleString('pl-PL');
            const demo = session.participants?.demographics || {};
            const device = session.device_info || {};

            const sessionData = [
                experimentName, session.id, date,
                demo.age || "brak", demo.gender || "brak", demo.residence || "brak", demo.handedness || "brak", demo.vision || "brak",
                device.width || "brak", device.height || "brak"
            ];

            session.trials.forEach(trial => {
                const isCorrect = (trial.chosen_answer === trial.expected_answer) ? 1 : 0;
                const imgUrl = trial.stimuli?.image_url || "brak_obrazka"; // Adres zbadanego obrazka
                
                // Odnajdujemy pasującą trajektorię
                const trajRow = allTrajectories.find(t => t.trial_id === trial.id);
                let trajX = "[]", trajY = "[]", trajT = "[]";
                
                if (trajRow && trajRow.tracking_data) {
                    const tData = trajRow.tracking_data;
                    // Upewniamy się, że tablica nie jest pusta, zanim ją sformatujemy
                    if (tData.x && tData.x.length > 0) {
                        trajX = `"[${tData.x.join(',')}]"`;
                        trajY = `"[${tData.y.join(',')}]"`;
                        trajT = `"[${tData.t.join(',')}]"`;
                    }
                }

                const trialData = [
                    trial.id, trial.is_calibration ? 1 : 0, imgUrl,
                    trial.expected_answer || "brak", trial.chosen_answer || "brak",
                    isCorrect, trial.response_time_ms,
                    trajX, trajY, trajT
                ];

                const row = [...sessionData, ...trialData];
                csvContent += row.join(";") + "\n";
            });
        });

        // 6. Pobieranie z formatowaniem UTF-8 BOM
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        const safeName = experimentName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.setAttribute("href", url);
        link.setAttribute("download", `wyniki_${safeName}_${new Date().toISOString().slice(0,10)}.csv`);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Błąd eksportu CSV:", err);
        alert("Wystąpił błąd podczas generowania pliku: " + err.message);
    } finally {
        buttonElement.innerHTML = originalText;
        buttonElement.disabled = false;
    }
}