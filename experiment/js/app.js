import { enterFullscreen, setupFullscreenProtection, wasFullscreenInterrupted } from './fullscreen.js';
import { startTracking, stopTracking } from './tracker.js';
import { fetchActiveExperiment, initSession, saveTrialResult, syncData } from './db.js';

// --- REJESTRACJA SERVICE WORKERA I SYNCHRONIZACJI ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker zarejestrowany.'))
        .catch(err => console.error('Błąd rejestracji SW:', err));
}

window.addEventListener('load', syncData);
window.addEventListener('online', () => {
    console.log("Połączenie przywrócone! Rozpoczynam synchronizację...");
    syncData();
});
// -----------------------------------------------------------

const welcomeScreen = document.getElementById('welcome-screen');
const experimentScreen = document.getElementById('experiment-screen');
const thankyouScreen = document.getElementById('thankyou-screen');
const demographicsForm = document.getElementById('demographics-form');
const fullscreenWarning = document.getElementById('fullscreen-warning');
const resumeBtn = document.getElementById('resume-btn');
const nextTrialBtn = document.getElementById('next-trial-btn');
const targetLeft = document.getElementById('target-left');
const targetRight = document.getElementById('target-right');
const stimulusImage = document.getElementById('stimulus-image');
const stimulusText = document.getElementById('stimulus-text');

let currentSessionId = null;
let stimuliList = [];
let currentTrialIndex = 0;
let experimentSettings = {}; 

let isCalibrationPhase = true;
let calibrationTasks = [];
let currentCalibrationIndex = 0;
let currentOptionsMapping = 'normal';

// NOWE ZMIENNE DLA ŚCIEŻKI POWROTNEJ
let isReturnPhase = false;
let initialTrackingData = null;
let pendingTrialData = null;
let pendingStimulusId = null;

setupFullscreenProtection(experimentScreen, fullscreenWarning, resumeBtn);

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function generateCalibrationSequence() {
    calibrationTasks = ['left', 'left', 'left', 'right', 'right', 'right'];
    shuffleArray(calibrationTasks);
    currentCalibrationIndex = 0;
    isCalibrationPhase = true;
}

demographicsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(demographicsForm);
    const demographicsData = Object.fromEntries(formData.entries());

    await enterFullscreen();
    welcomeScreen.classList.remove('active');
    experimentScreen.classList.add('active');
    
    try {
        const currentExperiment = await fetchActiveExperiment();
        if (!currentExperiment || currentExperiment.stimuli.length === 0) {
            alert("Brak aktywnych eksperymentów lub bodźców!");
            return;
        }

        experimentSettings = currentExperiment.settings || {};
        stimuliList = currentExperiment.stimuli.sort((a, b) => a.order_index - b.order_index);
        
        currentOptionsMapping = Math.random() > 0.5 ? 'normal' : 'reversed';
        currentSessionId = await initSession(currentExperiment.id, demographicsData, currentOptionsMapping);
        
        generateCalibrationSequence();
        prepareNextTrial();
        
    } catch (err) {
        console.error("Błąd podczas łączenia z bazą:", err);
    }
});

function prepareNextTrial() {
    // Chowamy przyciski docelowe, żeby badany nie uciekł na boki przed startem
    targetLeft.classList.add('hidden');
    targetRight.classList.add('hidden');
    
    nextTrialBtn.textContent = "Start";
    nextTrialBtn.classList.remove('hidden');

    if (isCalibrationPhase) {
        const expectedSide = calibrationTasks[currentCalibrationIndex];
        stimulusText.textContent = expectedSide === 'left' ? "Kliknij w lewą odpowiedź" : "Kliknij w prawą odpowiedź";
        targetLeft.innerHTML = 'Lewa odpowiedź';
        targetRight.innerHTML = 'Prawa odpowiedź';
    } else {
        const currentStimulus = stimuliList[currentTrialIndex];
        stimulusImage.src = currentStimulus.image_url;
        
        const useLocal = experimentSettings.use_local_options === true;
        const activeSettings = (useLocal && currentStimulus.settings) ? currentStimulus.settings : experimentSettings;

        let txtLeft = activeSettings.left_text || 'Opcja A';
        let symLeft = activeSettings.left_symbol || '';
        let txtRight = activeSettings.right_text || 'Opcja B';
        let symRight = activeSettings.right_symbol || '';

        if (currentOptionsMapping === 'reversed') {
            const tempTxt = txtLeft; const tempSym = symLeft;
            txtLeft = txtRight; symLeft = symRight;
            txtRight = tempTxt; symRight = tempSym;
        }
        
        targetLeft.innerHTML = `<span>${txtLeft}</span> <span class="target-symbol">${symLeft}</span>`;
        targetRight.innerHTML = `<span class="target-symbol">${symRight}</span> <span>${txtRight}</span>`;
    }
}

// LOGIKA STARTU I POWROTU NA JEDNYM PRZYCISKU
nextTrialBtn.addEventListener('click', () => {
    if (isReturnPhase) {
        // --- ZAKOŃCZENIE FAZY POWROTU ---
        const returnTrackingData = stopTracking();
        isReturnPhase = false;
        nextTrialBtn.classList.add('hidden');
        
        // Doklejamy dane powrotne do głównego obiektu
        initialTrackingData.return_x = returnTrackingData.x;
        initialTrackingData.return_y = returnTrackingData.y;
        initialTrackingData.return_t = returnTrackingData.t;
        
        // Zapisujemy i przechodzimy dalej
        finalizeTrialAndCheckNext();
    } else {
        // --- START ZWYKŁEJ PRÓBY ---
        nextTrialBtn.classList.add('hidden');
        targetLeft.classList.remove('hidden');
        targetRight.classList.remove('hidden');
        
        if (isCalibrationPhase) stimulusText.classList.remove('hidden');
        else stimulusImage.classList.remove('hidden');
        
        startTracking();
    }
});

async function handleResponse(chosenSide) {
    if (nextTrialBtn.classList.contains('hidden') === false && !isReturnPhase) return; 

    initialTrackingData = stopTracking();
    
    // Czyścimy ekran (ukrywamy nawet przyciski docelowe, żeby wymusić powrót na dół)
    stimulusImage.classList.add('hidden');
    stimulusText.classList.add('hidden');
    targetLeft.classList.add('hidden');
    targetRight.classList.add('hidden');
    
    const responseTime = initialTrackingData.t.length > 0 ? initialTrackingData.t[initialTrackingData.t.length - 1] : 0;

    // Przygotowanie meta-danych próby
    if (isCalibrationPhase) {
        const expectedSide = calibrationTasks[currentCalibrationIndex];
        pendingTrialData = {
            chosenSide: chosenSide, responseTime: responseTime,
            interrupted: wasFullscreenInterrupted, isCalibration: true,
            expectedAnswer: expectedSide
        };
        pendingStimulusId = null;
    } else {
        const currentStimulus = stimuliList[currentTrialIndex];
        let correctPhysically = currentStimulus.correct_answer;
        
        if (currentOptionsMapping === 'reversed' && correctPhysically) {
            correctPhysically = (correctPhysically === 'left') ? 'right' : 'left';
        }

        pendingTrialData = {
            chosenSide: chosenSide, responseTime: responseTime,
            interrupted: wasFullscreenInterrupted, isCalibration: false,
            expectedAnswer: correctPhysically 
        };
        pendingStimulusId = currentStimulus.id;
    }

    // SPRAWDZENIE: Czy badacz wymaga powrotu do bazy?
    if (experimentSettings.record_return_path) {
        isReturnPhase = true;
        nextTrialBtn.textContent = "Wróć tutaj"; // Pokazujemy przycisk na dole
        nextTrialBtn.classList.remove('hidden');
        startTracking(); // Uruchamiamy tracker ponownie!
    } else {
        // Jeśli nie, od razu zapisujemy
        finalizeTrialAndCheckNext();
    }
}

// Funkcja pomocnicza zapisująca dane i inkrementująca liczniki
function finalizeTrialAndCheckNext() {
    saveTrialResult(currentSessionId, pendingStimulusId, pendingTrialData, initialTrackingData);
    
    if (pendingTrialData.isCalibration) {
        currentCalibrationIndex++;
        if (currentCalibrationIndex >= calibrationTasks.length) {
            isCalibrationPhase = false;
            currentTrialIndex = 0;
        }
        prepareNextTrial();
    } else {
        currentTrialIndex++;
        if (currentTrialIndex < stimuliList.length) {
            prepareNextTrial();
        } else {
            finishExperiment();
        }
    }
}

targetLeft.addEventListener('click', () => handleResponse('left'));
targetRight.addEventListener('click', () => handleResponse('right'));

function finishExperiment() {
    experimentScreen.classList.remove('active');
    thankyouScreen.classList.add('active');
    if (document.fullscreenElement) document.exitFullscreen().catch(e => console.log(e));
}