// experiment/js/db.js
import { supabase } from '../../shared/config.js';

// Pobiera pierwszy aktywny eksperyment
export async function fetchActiveExperiment() {
    const { data, error } = await supabase
        .from('experiments')
        // ZMIANA: Dodano "settings" i "correct_answer" do zapytania
        .select('id, settings, stimuli(id, image_url, order_index, correct_answer)')
        .eq('is_active', true)
        .limit(1)
        .single();
        
    if (error) {
        console.error("Nie znaleziono aktywnego eksperymentu:", error);
        return null;
    }
    return data;
}

// Tworzy zanonimizowanego badanego i nową sesję
export async function initSession(experimentId, demographicsData) {
    const participantId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    // 1. Zapisujemy badanego z prawdziwymi danymi JSON!
    const { error: partErr } = await supabase
        .from('participants')
        .insert([{ 
            id: participantId, 
            demographics: demographicsData 
        }]);
    
    if (partErr) throw partErr;

    // 2. Zapisujemy sesję
    const { error: sessErr } = await supabase
        .from('sessions')
        .insert([{ 
            id: sessionId,
            participant_id: participantId, 
            experiment_id: experimentId,
            device_info: {
                width: window.innerWidth,
                height: window.innerHeight,
                userAgent: navigator.userAgent
            }
        }]);
        
    if (sessErr) throw sessErr;

    return sessionId;
}

// Zapisuje wyniki pojedynczej próby
export async function saveTrialResult(sessionId, stimulusId, trialData, trackingData) {
    const trialId = crypto.randomUUID();

    const { error: trialErr } = await supabase
        .from('trials')
        .insert([{
            id: trialId,
            session_id: sessionId,
            stimulus_id: stimulusId, // Może być null w trakcie kalibracji
            response_time_ms: trialData.responseTime,
            chosen_answer: trialData.chosenSide,
            is_calibration: trialData.isCalibration,
            expected_answer: trialData.expectedAnswer,
            fullscreen_interrupted: trialData.interrupted
        }]);

    if (trialErr) {
        console.error("Błąd zapisu próby:", trialErr);
        return;
    }

    const { error: trajErr } = await supabase
        .from('trajectories')
        .insert([{
            trial_id: trialId,
            tracking_data: trackingData
        }]);

    if (trajErr) {
        console.error("Błąd zapisu trajektorii:", trajErr);
    } else {
        console.log(`✅ Zapisano wynik (${trialData.isCalibration ? 'Kalibracja' : 'Badanie'})`);
    }
}