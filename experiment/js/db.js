// experiment/js/db.js
import { supabase } from '../../shared/config.js';

import { saveToCache, getFromCache, addToQueue, getQueue, removeFromQueue } from './offline.js';

export async function fetchActiveExperiment() {
    if (navigator.onLine) {
        try {
            const { data, error } = await supabase
                .from('experiments')
                .select('id, settings, stimuli(id, image_url, order_index, correct_answer)')
                .eq('is_active', true)
                .limit(1)
                .single();
                
            if (data) {
                await saveToCache('active_experiment', data); // Zapisujemy na wypadek utraty sieci
                return data;
            }
        } catch (err) {
            console.warn("Błąd sieci, próba załadowania z pamięci lokalnej.");
        }
    }
    // Jeśli offline lub błąd serwera, ładujemy z pamięci przeglądarki
    return await getFromCache('active_experiment');
}

// Zmieniamy argumenty - dodajemy optionsMapping
export async function initSession(experimentId, demographicsData, optionsMapping = 'normal') {
    const participantId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    const participantData = { id: participantId, demographics: demographicsData };
    const sessionData = { 
        id: sessionId, 
        participant_id: participantId, 
        experiment_id: experimentId,
        options_mapping: optionsMapping, // ZAPISUJEMY WYLOSOWANY UKŁAD
        device_info: { width: window.innerWidth, height: window.innerHeight, userAgent: navigator.userAgent }
    };

    // ZAWSZE zapisujemy najpierw do lokalnej kolejki
    await addToQueue('participants', participantData);
    await addToQueue('sessions', sessionData);

    syncData(); // Próbujemy wysłać w tle
    return sessionId;
}

export async function saveTrialResult(sessionId, stimulusId, trialData, trackingData) {
    const trialId = crypto.randomUUID();

    const trialDBData = {
        id: trialId, session_id: sessionId, stimulus_id: stimulusId, 
        response_time_ms: trialData.responseTime, chosen_answer: trialData.chosenSide, 
        is_calibration: trialData.isCalibration, expected_answer: trialData.expectedAnswer, 
        fullscreen_interrupted: trialData.interrupted
    };
    
    const trajDBData = { trial_id: trialId, tracking_data: trackingData };

    await addToQueue('trials', trialDBData);
    await addToQueue('trajectories', trajDBData);

    syncData();
}

// Funkcja synchronizująca lokalną kolejkę z Supabase
export async function syncData() {
    if (!navigator.onLine) return; // Jeśli brak neta, przerywamy
    
    const queue = await getQueue();
    if (queue.length === 0) return;

    console.log(`📡 [Synchronizacja] Znaleziono ${queue.length} rekordów do wysłania...`);

    for (const item of queue) {
        try {
            const { error } = await supabase.from(item.table).insert([item.data]);

            // Kod 23505 oznacza "Duplikat" (tzn. rekord już jest w bazie)
            if (!error || error.code === '23505') {
                await removeFromQueue(item.id); // Usuwamy z lokalnej kolejki
            } else {
                console.error(`Błąd zapisu do ${item.table}:`, error);
                break; // Przerywamy pętlę, by zachować prawidłową kolejność (relacje)
            }
        } catch (err) {
            console.warn("Utracono połączenie podczas wysyłania.", err);
            break;
        }
    }
    
    const remaining = await getQueue();
    if (remaining.length === 0) console.log("✅ [Synchronizacja] Zakończona. Baza aktualna.");
}