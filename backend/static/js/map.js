const socket = io();
const map = L.map('map').setView([19.4326, -99.1332], 13);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
}).addTo(map);

function toggleMenu() { document.getElementById('sidebar').classList.toggle('active'); }
function closeMenu() { document.getElementById('sidebar').classList.remove('active'); }
function updateStatus(msg) { document.getElementById('app-status').innerText = msg; }

// --- ZONAS FIJAS ---
//L.polygon([[19.4340, -99.1352], [19.4340, -99.1314], [19.4315, -99.1314], [19.4315, -99.1352]], {color: '#ff4444', fillOpacity: 0.15}).addTo(map).bindPopup("🚫 Zócalo");
//L.polygon([[19.3310, -99.1153], [19.3310, -99.1103], [19.3260, -99.1103], [19.3260, -99.1153]], {color: '#ffbb33', fillOpacity: 0.15}).addTo(map).bindPopup("🎓 ESIME");

// --- VARIABLES GLOBALES ---
let currentMode = 'IDLE'; 
let drawnPoints = [];
let tempMarkers = [];
let tempPolygon = null; 
let customPolygonsLayer = L.layerGroup().addTo(map);

// Variables de Simulación
let simStart = null;
let simEnd = null;
let simMarkerStart = null;
let simPolyline = null; // Línea visual de la ruta
let simInterval = null; // El "reloj" de la simulación

// --- LÓGICA DE SIMULACIÓN (AJUSTADA) ---

function startSimulationSetup() {
    stopSimulation(); // Limpiar cualquier simulación anterior
    currentMode = 'SIMULATING';
    closeMenu();
    updateStatus("SIMULADOR: Haz clic para marcar INICIO (A)");
    map.getContainer().style.cursor = 'crosshair';
}

function stopSimulation() {
    // 1. Detener el reloj
    if (simInterval) clearInterval(simInterval);
    
    // 2. Limpiar visuales
    if (simPolyline) map.removeLayer(simPolyline);
    if (simMarkerStart) map.removeLayer(simMarkerStart);
    
    // 3. Resetear variables
    simStart = null;
    simEnd = null;
    simPolyline = null;
    simMarkerStart = null;
    currentMode = 'IDLE';
    map.getContainer().style.cursor = 'grab';
    updateStatus("Simulación detenida.");
}

function runSimulation() {
    if (!simStart || !simEnd) return;

    // --- CONFIGURACIÓN DE VELOCIDAD ---
    const steps = 200;
    const duration = 40000; 
    const stepTime = duration / steps;
    
    let currentStep = 0;
    const latStep = (simEnd.lat - simStart.lat) / steps;
    const lngStep = (simEnd.lng - simStart.lng) / steps;

    updateStatus("Bot caminador en simulación...");

    if (simInterval) clearInterval(simInterval);

    simInterval = setInterval(() => {
        currentStep++;

        const newLat = simStart.lat + (latStep * currentStep);
        const newLng = simStart.lng + (lngStep * currentStep);

        // Enviar al servidor
        sendFakeLocation(newLat, newLng);

        if (currentStep >= steps) {
            clearInterval(simInterval);
            updateStatus("✅ Destino alcanzado.");
        }
    }, stepTime);
}

async function sendFakeLocation(lat, lng) {
    try {
        await fetch('/api/update_location', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                lat: lat,
                lng: lng,
                device_id: 'simulador_bot',
                alias: '🤖 Bot Lento'
            })
        });
    } catch (e) { console.error(e); }
}

map.on('click', function(e) {
    
    if (currentMode === 'DRAWING') {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        drawnPoints.push({lat, lng});
        const marker = L.circleMarker([lat, lng], {color: '#d05ce3', radius: 4}).addTo(map);
        tempMarkers.push(marker);

        if (drawnPoints.length > 2) {
            if (tempPolygon) map.removeLayer(tempPolygon);
            tempPolygon = L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {color: '#d05ce3', dashArray: '5, 5'}).addTo(map);
            document.getElementById('btn-save').style.display = 'block';
            document.getElementById('sidebar').classList.add('active'); 
            updateStatus("Zona cerrada. ¡Guárdala!");
        }
    }
    else if (currentMode === 'SIMULATING') {
        if (!simStart) {
            simStart = e.latlng;
            simMarkerStart = L.marker(simStart, {
                icon: L.divIcon({className: 'sim-icon', html: '🚩', iconSize: [30, 30]})
            }).addTo(map);
            updateStatus("Inicio marcado. Clic en DESTINO (B)");
        } else {
            simEnd = e.latlng;
            currentMode = 'IDLE'; 
            map.getContainer().style.cursor = 'grab';
            
            simPolyline = L.polyline([simStart, simEnd], {color: 'cyan', dashArray: '10, 10', weight: 3}).addTo(map);
            
            runSimulation();
        }
    }
});

// --- FUNCIONES DE DIBUJO ---
function startDrawing() {
    stopSimulation(); // Detener simulación si hay una activa
    resetTempDrawing();
    isDrawing = false; // Reset first
    currentMode = 'DRAWING';
    closeMenu();
    updateStatus("Modo Dibujo: Marca puntos...");
    map.getContainer().style.cursor = 'crosshair';
}

async function saveCurrentZone() {
    if (drawnPoints.length < 3) return;
    try {
        const response = await fetch('/api/add_zone', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ points: drawnPoints })
        });
        if (response.ok) {
            L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {color: '#9c27b0', fillOpacity: 0.4}).addTo(customPolygonsLayer);
            resetTempDrawing();
            currentMode = 'IDLE';
            updateStatus("Zona guardada con éxito.");
            document.getElementById('btn-save').style.display = 'none';
            map.getContainer().style.cursor = 'grab';
        }
    } catch (error) { alert("Error al guardar"); }
}

async function clearAllZones() {
    if(!confirm("¿Borrar zonas?")) return;
    await fetch('/api/clear_zones', {method: 'POST'});
    customPolygonsLayer.clearLayers();
    updateStatus("Zonas borradas.");
}

function resetTempDrawing() {
    drawnPoints = [];
    tempMarkers.forEach(m => map.removeLayer(m));
    tempMarkers = [];
    if (tempPolygon) map.removeLayer(tempPolygon);
    tempPolygon = null;
    document.getElementById('btn-save').style.display = 'none';
}

// --- RASTREO (SOCKETS) ---
let markers = {}; 

socket.on('new_location', (data) => {
    const { lat, lng, alias, device_id } = data;
    const id = alias || device_id;

    if (markers[id]) {
        markers[id].setLatLng([lat, lng]).bindPopup(id);
    } else {
        if (device_id === 'simulador_bot') {
                markers[id] = L.circleMarker([lat, lng], {
                color: '#00bcd4', radius: 8, fillOpacity: 1
            }).addTo(map).bindPopup("🤖 Bot Lento");
        } else {
            markers[id] = L.marker([lat, lng]).addTo(map).bindPopup(id);
        }
    }
});

socket.on('geofence_event', (data) => {
    const box = document.getElementById('alert-box');
    let icon = "🛡️";
    let color = "#28a745"; 

    if (data.status === 'DANGER') { color = "#dc3545"; icon = "🚨"; } 
    else if (data.status === 'WARNING') { color = "#ffc107"; icon = "⚠️"; }

    box.style.backgroundColor = color;
    box.style.color = data.status === 'WARNING' ? 'black' : 'white';
    box.innerHTML = `<span>${icon}</span> <span>${data.message}</span>`;
    
    if(data.status === 'DANGER') box.style.boxShadow = "0 0 20px rgba(220, 53, 69, 0.6)";
    else box.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
});

function openCoordModal() {
    closeMenu();
    document.getElementById('coordModal').style.display = 'flex';
}

function closeCoordModal() {
    document.getElementById('coordModal').style.display = 'none';
}

function processCoordinates() {
    const inputs = ['p1', 'p2', 'p3', 'p4'];
    let points = [];

    try {
        inputs.forEach(id => {
            const val = document.getElementById(id).value;
            const coords = val.split(',').map(n => parseFloat(n.trim()));
            if (coords.length !== 2 || isNaN(coords[0])) throw new Error();
            points.push(coords);
        });

        const manualPoly = L.polygon(points, {
            color: '#00bcd4', 
            fillOpacity: 0.3,
            weight: 3
        }).addTo(customPolygonsLayer);
        
        map.fitBounds(manualPoly.getBounds()); 
        
        drawnPoints = points.map(p => ({lat: p[0], lng: p[1]}));
        saveCurrentZone(); 

        closeCoordModal();
        updateStatus("Área creada manualmente.");
    } catch (e) {
        alert("Formato inválido. Usa: Latitud, Longitud (ej: 19.33, -99.11)");
    }
}

function highlightButton(element) {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(l => l.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }
}

function resetHighlights() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(l => l.classList.remove('active'));
}

//----- GUARDAR LAS GEOCERCAS ---------------------------------------
// Validar puntos
function saveCurrentZone() {
    if (drawnPoints.length < 3) {
        alert("Error: Se necesitan al menos 3 puntos para formar un área. Por favor, marca más puntos en el mapa.");
        return; 
    }
    document.getElementById('saveModal').style.display = 'flex';
}

function closeSaveModal() {
    document.getElementById('saveModal').style.display = 'none';
    document.getElementById('geoName').value = '';
}

async function confirmSave() {
    const name = document.getElementById('geoName').value.trim();
    
    if (!name) {
        alert("Error: Debes ingresar un nombre para la geocerca antes de continuar.");
        return; 
    }

    try {
        const response = await fetch('/api/add_zone', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                name: name,
                points: drawnPoints
            })
        });

        if (response.ok) {
            alert(`✅ La geocerca '${name}' se guardó correctamente.`);
            closeSaveModal();
            document.getElementById('geoName').value = '';
            resetTempDrawing();
        } else {
            const err = await response.json(); 
            alert("Detalle del error: " + err.message);
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}

window.addEventListener('load', () => {
    const zonaGuardada = localStorage.getItem('zonaParaDibujar');
    
    if (zonaGuardada) {
        const puntos = JSON.parse(zonaGuardada);
        
        const puntosLeaflet = puntos.map(p => [p.lat, p.lng]);
        
        const miGeocerca = L.polygon(puntosLeaflet, {
            color: '#00ffcc', 
            weight: 3,
            fillOpacity: 0.3
        }).addTo(map); 
        

        map.fitBounds(miGeocerca.getBounds());
        
        localStorage.removeItem('zonaParaDibujar');
    }
});