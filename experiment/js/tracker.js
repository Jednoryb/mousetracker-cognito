// experiment/js/tracker.js

let trackingData = { x: [], y: [], t: [] };
let isTracking = false;
let startTime = 0;

export function startTracking() {
    console.log("Rozpoczynam rejestrowanie ruchu myszy...");
    
    // Resetujemy dane dla nowej próby
    trackingData = { x: [], y: [], t: [] };
    isTracking = true;
    
    // Zapisujemy idealny moment startu (sub-milisekundy)
    startTime = performance.now(); 
    
    // Zaczynamy nasłuchiwać każdy ruch myszy
    document.addEventListener('mousemove', recordMousePosition);
}

export function stopTracking() {
    console.log("Zatrzymuję rejestrowanie...");
    isTracking = false;
    
    // Przestajemy nasłuchiwać, żeby oszczędzać zasoby
    document.removeEventListener('mousemove', recordMousePosition);
    
    return trackingData;
}

function recordMousePosition(event) {
    if (!isTracking) return;

    // Czas trwania od momentu startu próby w milisekundach
    const timestamp = performance.now() - startTime;

    // Pobieramy aktualne wymiary okna (żeby działało na każdym monitorze)
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Przeliczanie osi X: lewa -1, środek 0, prawa 1
    const normX = (event.clientX / width) * 2 - 1;

    // Przeliczanie osi Y: dół -1, środek 0, góra 1 (przeglądarki liczą Y w dół, więc odwracamy)
    const normY = -((event.clientY / height) * 2 - 1);

    // Zapisujemy wyniki do tablic (zaokrąglone dla oszczędności miejsca w bazie)
    // 4 miejsca po przecinku dla pozycji to precyzja do ułamka piksela
    trackingData.x.push(parseFloat(normX.toFixed(4)));
    trackingData.y.push(parseFloat(normY.toFixed(4)));
    trackingData.t.push(parseFloat(timestamp.toFixed(1)));
}