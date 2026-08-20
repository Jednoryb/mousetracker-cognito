import { enterFullscreen, setupFullscreenProtection, wasFullscreenInterrupted } from './fullscreen.js';
import { startTracking, stopTracking } from './tracker.js';
import { fetchActiveExperiment, initSession, saveTrialResult } from './db.js';

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
let experimentSettings = {}; // Przechowuje konfigurację tekstów i ikon

let isCalibrationPhase = true;
let calibrationTasks = [];
let currentCalibrationIndex = 0;

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

        // Zapisujemy ustawienia z bazy do zmiennej
        experimentSettings = currentExperiment.settings || {};
        stimuliList = currentExperiment.stimuli.sort((a, b) => a.order_index - b.order_index);
        currentSessionId = await initSession(currentExperiment.id, demographicsData);
        
        generateCalibrationSequence();
        prepareNextTrial();
        
    } catch (err) {
        console.error("Błąd podczas łączenia z bazą:", err);
    }
});

function prepareNextTrial() {
    nextTrialBtn.classList.remove('hidden');

    if (isCalibrationPhase) {
        // --- FAZA KALIBRACJI ---
        const expectedSide = calibrationTasks[currentCalibrationIndex];
        stimulusText.textContent = expectedSide === 'left' ? "Kliknij w lewą odpowiedź" : "Kliknij w prawą odpowiedź";
        
        // Zmieniamy teksty na przyciskach (bez ikon)
        targetLeft.innerHTML = 'Lewa odpowiedź';
        targetRight.innerHTML = 'Prawa odpowiedź';
    } else {
        // --- WŁAŚCIWE BADANIE ---
        const currentStimulus = stimuliList[currentTrialIndex];
        stimulusImage.src = currentStimulus.image_url;
        
        // Zmieniamy teksty i dodajemy ikony z konfiguracji bazy
        targetLeft.innerHTML = `
            <span>${experimentSettings.left_text || 'Opcja A'}</span>
            <span class="target-symbol">${experimentSettings.left_symbol || ''}</span>
        `;
        
        // Dla prawego przycisku dajemy ikonę z lewej strony, żeby było symetrycznie
        targetRight.innerHTML = `
            <span class="target-symbol">${experimentSettings.right_symbol || ''}</span>
            <span>${experimentSettings.right_text || 'Opcja B'}</span>
        `;
    }
}

nextTrialBtn.addEventListener('click', () => {
    nextTrialBtn.classList.add('hidden');
    
    if (isCalibrationPhase) {
        stimulusText.classList.remove('hidden');
    } else {
        stimulusImage.classList.remove('hidden');
    }
    
    startTracking();
});

async function handleResponse(chosenSide) {
    if (nextTrialBtn.classList.contains('hidden') === false) return; 

    const trackingData = stopTracking();
    stimulusImage.classList.add('hidden');
    stimulusText.classList.add('hidden');
    
    const responseTime = trackingData.t.length > 0 ? trackingData.t[trackingData.t.length - 1] : 0;

    if (isCalibrationPhase) {
        const expectedSide = calibrationTasks[currentCalibrationIndex];
        const trialData = {
            chosenSide: chosenSide,
            responseTime: responseTime,
            interrupted: wasFullscreenInterrupted,
            isCalibration: true,
            expectedAnswer: expectedSide
        };
        
        saveTrialResult(currentSessionId, null, trialData, trackingData);
        currentCalibrationIndex++;
        
        if (currentCalibrationIndex >= calibrationTasks.length) {
            isCalibrationPhase = false;
            currentTrialIndex = 0;
        }
        prepareNextTrial();
        
    } else {
        const currentStimulus = stimuliList[currentTrialIndex];
        const trialData = {
            chosenSide: chosenSide,
            responseTime: responseTime,
            interrupted: wasFullscreenInterrupted,
            isCalibration: false,
            expectedAnswer: currentStimulus.correct_answer
        };
        
        saveTrialResult(currentSessionId, currentStimulus.id, trialData, trackingData);
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