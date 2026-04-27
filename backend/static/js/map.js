const socket = io();

const map = L.map('map', {
    zoomControl: false 
}).setView([19.4326, -99.1332], 13); 

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
let hoverPolyline = null;
let previewLines = null;
let previewShape = null;

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
//-------------------------------------------------------------------------------MAP.ON
map.on('click', function(e) {
    
    if (currentMode === 'DRAWING') {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        drawnPoints.push({lat, lng});
        
        if (previewShape) {
            map.removeLayer(previewShape);
            previewShape = null;
        }
        
        updateDrawingUI();
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

map.on('mousemove', function(e) {
    if (currentMode === 'DRAWING' && drawnPoints.length > 0) {
        const mouseCoords = [e.latlng.lat, e.latlng.lng];
        const first = [drawnPoints[0].lat, drawnPoints[0].lng];
        const last = [drawnPoints[drawnPoints.length - 1].lat, drawnPoints[drawnPoints.length - 1].lng];

        if (previewShape) map.removeLayer(previewShape);

        if (drawnPoints.length === 1) {
            previewShape = L.polyline([first, mouseCoords], {
                color: '#28a745',
                weight: 2,
                dashArray: '5, 10'
            }).addTo(map);
        } else {
            previewShape = L.polygon([first, mouseCoords, last], {
                color: '#28a745',
                weight: 2,
                dashArray: '5, 10',
                fillColor: '#28a745',
                fillOpacity: 0.3,
                interactive: false
            }).addTo(map);
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

    // --- NUEVO: Mostrar y resetear el panel ---
    geoPanel.style.display = 'block';
    geoCoordList.innerHTML = ''; // Limpia la lista de puntos viejos
    geoPanelName.value = ''; // Limpia el texto del nombre
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
    
    if (previewShape) {
        map.removeLayer(previewShape);
        previewShape = null;
    }

    document.getElementById('btn-save').style.display = 'none';
    if (typeof geoCoordList !== 'undefined') geoCoordList.innerHTML = '';
}

// MODIFICAR DIBUJO 
const btnGeoSave = document.getElementById('btn-geo-save');

function updateDrawingUI() {
    tempMarkers.forEach(m => map.removeLayer(m));
    tempMarkers = [];
    if (tempPolygon) map.removeLayer(tempPolygon);
    tempPolygon = null;

    geoCoordList.innerHTML = '';

    drawnPoints.forEach((pto, index) => {
        const marker = L.circleMarker([pto.lat, pto.lng], {color: '#d05ce3', radius: 4, fillOpacity: 0.8}).addTo(map);
        tempMarkers.push(marker);

        const li = document.createElement('li');
        li.innerHTML = `
            <div><span>Pto ${index + 1}:</span> ${pto.lat.toFixed(5)}, ${pto.lng.toFixed(5)}</div>
            <button class="btn-delete-point" title="Borrar punto">🗑️</button>
        `;

        const btnBorrar = li.querySelector('.btn-delete-point');
        btnBorrar.addEventListener('click', () => {
            drawnPoints.splice(index, 1);
            if (typeof hoverPolyline !== 'undefined' && hoverPolyline) map.removeLayer(hoverPolyline);
            updateDrawingUI();
        });

        btnBorrar.addEventListener('mouseenter', () => {
            marker.setStyle({color: 'red', fillColor: 'red', radius: 7});
            if (drawnPoints.length > 1) {
                const prev = (index - 1 + drawnPoints.length) % drawnPoints.length;
                const next = (index + 1) % drawnPoints.length;
                let coords = (drawnPoints.length === 2) ? 
                    [[drawnPoints[0].lat, drawnPoints[0].lng], [drawnPoints[1].lat, drawnPoints[1].lng]] :
                    [[drawnPoints[prev].lat, drawnPoints[prev].lng], [drawnPoints[index].lat, drawnPoints[index].lng], [drawnPoints[next].lat, drawnPoints[next].lng]];
                hoverPolyline = L.polyline(coords, {color: 'red', weight: 5, opacity: 0.8}).addTo(map);
            }
        });

        btnBorrar.addEventListener('mouseleave', () => {
            marker.setStyle({color: '#d05ce3', fillColor: '#d05ce3', radius: 4});
            if (typeof hoverPolyline !== 'undefined' && hoverPolyline) { map.removeLayer(hoverPolyline); hoverPolyline = null; }
        });

        geoCoordList.insertBefore(li, geoCoordList.firstChild);
    });

    if (drawnPoints.length > 2) {
        tempPolygon = L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {
            color: '#d05ce3', 
            fillColor: '#d05ce3',
            fillOpacity: 0.4
        }).addTo(map);
    }
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

window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mapIdFromUrl = urlParams.get('map_id');

    if (mapIdFromUrl) {
        // --- CASO A: VIENE DE "MIS MAPAS" (Cargamos el existente) ---
        try {
            const response = await fetch(`/api/get_map_zones/${mapIdFromUrl}`);
            if (response.ok) {
                const data = await response.json();
                
                // Ponemos el nombre real (ej: "Mapa 2") y guardamos el ID
                if (typeof mapNameInput !== 'undefined' && mapNameInput) {
                    mapNameInput.value = data.nombre_mapa;
                }
                currentMapId = mapIdFromUrl; 

                data.zonas.forEach(zona => {
                    const latlngs = zona.puntos.map(p => [p.lat, p.lng]);
                    const polygon = L.polygon(latlngs, {
                        color: '#9c27b0', 
                        fillOpacity: 0.4
                    }).addTo(customPolygonsLayer);
                    
                    polygon.bindPopup(`<b>${zona.nombre}</b>`);
                });

                if (data.zonas.length > 0) {
                    map.fitBounds(customPolygonsLayer.getBounds());
                }
                
                if (typeof updateStatus === 'function') {
                    updateStatus(`Mapa '${data.nombre_mapa}' cargado.`);
                }
            }
        } catch (error) {
            console.error("Error al cargar mapa guardado:", error);
        }
    } else {
        // --- CASO B: MAPA NUEVO (Pedimos el siguiente nombre: Mapa 3, 4...) ---
        try {
            const response = await fetch('/api/get_next_map_name');
            if (response.ok) {
                const data = await response.json();
                if (data.nextName && typeof mapNameInput !== 'undefined' && mapNameInput) {
                    mapNameInput.value = data.nextName; 
                }
            }
        } catch (error) {
            console.error("Error al obtener nombre automático:", error);
        }
    }

    // Lógica para zonas desde el perfil (si existe)
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



//Presionar fuera de la barra deslizante para salir 
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');

document.addEventListener('click', function(evento) {
    const menuAbierto = sidebar.classList.contains('active');
    const clicFueraDelMenu = !sidebar.contains(evento.target);
    const clicNoFueEnBoton = !menuToggle.contains(evento.target);

    if (menuAbierto && clicFueraDelMenu && clicNoFueEnBoton) {
        sidebar.classList.remove('active');
    }
});

// Agregamos el zoom en la esquina inferior derecha
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

//Buscar lugar
const searchInput = document.getElementById('map-search');
const searchBtn = document.getElementById('search-action-btn');
let searchMarker = null;

async function buscarLugarEnMapa() {
    const textoBuscado = searchInput.value.trim();
    
    if (textoBuscado === "") return; 

    try {
        searchBtn.textContent = "⏳";

        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(textoBuscado)}`);
        const datos = await response.json();

        searchBtn.textContent = "🔍";

        if (datos && datos.length > 0) {
            const resultado = datos[0];
            const lat = parseFloat(resultado.lat);
            const lng = parseFloat(resultado.lon);

            map.flyTo([lat, lng], 15);

            if (searchMarker !== null) {
                map.removeLayer(searchMarker);
            }

            searchMarker = L.marker([lat, lng]).addTo(map);
            searchMarker.bindPopup(`<b>Lugar encontrado:</b><br>${resultado.display_name}`).openPopup();
            
        } else {
            alert("No se encontró ningún lugar con ese nombre.");
        }
    } catch (error) {
        console.error(error);
        searchBtn.textContent = "🔍";
        alert("Hubo un error de conexión al buscar el lugar.");
    }
}

searchBtn.addEventListener('click', buscarLugarEnMapa);

searchInput.addEventListener('keypress', function(evento) {
    if (evento.key === 'Enter') {
        buscarLugarEnMapa();
    }
});

const btnDrawDropdown = document.getElementById('btn-draw-dropdown');
const drawDropdownMenu = document.getElementById('draw-dropdown-menu');
const btnMainDraw = document.getElementById('btn-main-draw');

// Mostrar u ocultar el menú con la flecha
btnDrawDropdown.addEventListener('click', function(event) {
    event.stopPropagation();
    drawDropdownMenu.classList.toggle('show');
});

// Cerrar el menú si das clic en cualquier otra parte de la pantalla
document.addEventListener('click', function(event) {
    if (!drawDropdownMenu.contains(event.target) && !btnDrawDropdown.contains(event.target)) {
        drawDropdownMenu.classList.remove('show');
    }
});

// Acción principal: Dibujar (Vincula esto a tu función de trazar polígono)
btnMainDraw.addEventListener('click', function() {
    startDrawing();
});

// Opción 1: Circular
document.getElementById('btn-draw-circle').addEventListener('click', function() {
    console.log("Activando dibujo circular...");
    drawDropdownMenu.classList.remove('show');
});

// Opción 2: Coordenadas
document.getElementById('btn-draw-coords').addEventListener('click', function() {
    openCoordModal();
    drawDropdownMenu.classList.remove('show');
});

/* ==========================================
   PANEL DE CREACIÓN DE GEOCERCA (Top Right)
   ========================================== */
const geoPanel = document.getElementById('geo-panel');
const geoPanelHeader = document.getElementById('geo-panel-header');
const geoPanelContent = document.getElementById('geo-panel-content');
const geoPanelArrow = document.getElementById('geo-panel-arrow');
const geoCoordList = document.getElementById('geo-coord-list');
const btnGeoCancel = document.getElementById('btn-geo-cancel');
const btnGeoConfirm = document.getElementById('btn-geo-confirm');
const geoPanelName = document.getElementById('geo-panel-name');

// 1. Desplegar/Ocultar menú con la flecha
geoPanelHeader.addEventListener('click', () => {
    geoPanelContent.classList.toggle('collapsed');
    geoPanelArrow.classList.toggle('arrow-up');
});

// 2. Botón Cancelar del panel
btnGeoCancel.addEventListener('click', () => {
    resetTempDrawing();
    geoPanel.style.display = 'none'; // Ocultamos el panel
    currentMode = 'IDLE';
    map.getContainer().style.cursor = 'grab';
    updateStatus("Dibujo cancelado.");
});

// 3. Botón Confirmar del panel (Reemplaza tu función saveCurrentZone)
// Declaramos el nuevo botón Guardar


// --- NUEVA FUNCIÓN PARA EL BOTÓN GUARDAR ---
btnGeoSave.addEventListener('click', async () => {
    const name = geoPanelName.value.trim();
    
    if (drawnPoints.length < 3) {
        alert("Necesitas marcar al menos 3 puntos en el mapa.");
        return;
    }
    if (!name) {
        alert("Por favor, ingresa un nombre para la geocerca.");
        return;
    }

    try {
        const response = await fetch('/api/add_zone', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                name: name, 
                points: drawnPoints,
                map_id: currentMapId // <--- AGREGAMOS ESTA LÍNEA
            })
        });

        if (response.ok) {
            L.polygon(drawnPoints.map(p => [p.lat, p.lng]), {color: '#9c27b0', fillOpacity: 0.4}).addTo(customPolygonsLayer);
            resetTempDrawing();
            currentMode = 'IDLE';
            map.getContainer().style.cursor = 'grab';
            geoPanel.style.display = 'none'; // Ocultamos el panel
            
            updateStatus("Geocerca guardada con éxito.");
            alert(`✅ La geocerca '${name}' se guardó correctamente.`);
        } else {
            const err = await response.json(); 
            alert("Error al guardar: " + err.message);
        }
    } catch (error) { 
        console.error(error);
        alert("Error de conexión con el servidor."); 
    }
});

// --- FUNCIÓN TEMPORAL PARA EL BOTÓN CONFIRMAR ------------------------------------------------------------------------AGREGAR
// Por ahora solo lo dejamos vacío para que no cause conflictos
btnGeoConfirm.addEventListener('click', () => {
    console.log("Botón Confirmar presionado. Preparado para el siguiente paso.");
});

let currentMapId = null; 
const mapNameInput = document.getElementById('map-name-input');
const btnSaveMap = document.getElementById('btn-save-map');

btnSaveMap.addEventListener('click', async () => {
    const mapName = mapNameInput.value.trim();
    
    if (!mapName) {
        alert("El mapa debe tener un nombre.");
        return;
    }

    btnSaveMap.textContent = "⏳"; 

    try {
        const payload = {
            map_id: currentMapId, 
            name: mapName
        };

        const response = await fetch('/api/save_map', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            
            if (!currentMapId) {
                currentMapId = data.new_map_id; 
            }
            
            updateStatus(`Mapa '${mapName}' guardado/actualizado.`);
            alert(`✅ El mapa '${mapName}' y sus zonas se guardaron correctamente.`);
        } else {
            alert("Error al guardar el mapa.");
        }
    } catch (error) {
        console.error(error);
        alert("Error de conexión al guardar el mapa.");
    } finally {
        btnSaveMap.textContent = "💾"; 
    }
});
