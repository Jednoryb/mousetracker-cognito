// experiment/js/fullscreen.js

export let wasFullscreenInterrupted = false;

export async function enterFullscreen() {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) {
        console.error("Błąd trybu pełnoekranowego:", err);
        alert("Wymagany tryb pełnoekranowy do przeprowadzenia badania.");
    }
}

export function setupFullscreenProtection(experimentScreenElement, warningElement, resumeButton) {
    document.addEventListener('fullscreenchange', () => {
        // Jeśli wyszliśmy z fullscreena, a ekran badania jest aktywny
        if (!document.fullscreenElement && experimentScreenElement.classList.contains('active')) {
            console.warn("Przerwano tryb pełnoekranowy - zatrzymywanie próby!");
            wasFullscreenInterrupted = true;
            warningElement.classList.remove('hidden');
            
            // TODO: Wywołanie funkcji z tracker.js zatrzymującej nagrywanie
        }
    });

    resumeButton.addEventListener('click', async () => {
        await enterFullscreen();
        warningElement.classList.add('hidden');
    });
}