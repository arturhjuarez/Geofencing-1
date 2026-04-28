const socket = io();

const map = L.map("map", { zoomControl: false }).setView([19.4326, -99.1332], 13);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; CARTO",
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

const ui = {
    toastRegion: document.getElementById("toast-region"),
    menuToggle: document.getElementById("menu-toggle"),
    sidebar: document.getElementById("sidebar"),
    appStatus: document.getElementById("app-status"),
    alertBox: document.getElementById("alert-box"),
    alertTitle: document.getElementById("alert-title"),
    alertMessage: document.getElementById("alert-message"),
    searchInput: document.getElementById("map-search"),
    searchButton: document.getElementById("search-action-btn"),
    mapNameInput: document.getElementById("map-name-input"),
    saveMapButton: document.getElementById("btn-save-map"),
    drawButton: document.getElementById("btn-main-draw"),
    drawDropdownButton: document.getElementById("btn-draw-dropdown"),
    drawDropdownMenu: document.getElementById("draw-dropdown-menu"),
    drawCoordsButton: document.getElementById("btn-draw-coords"),
    geoPanel: document.getElementById("geo-panel"),
    geoPanelHeader: document.getElementById("geo-panel-header"),
    geoPanelContent: document.getElementById("geo-panel-content"),
    geoPanelArrow: document.getElementById("geo-panel-arrow"),
    geoPanelName: document.getElementById("geo-panel-name"),
    geoPointSummary: document.getElementById("geo-point-summary"),
    geoCoordList: document.getElementById("geo-coord-list"),
    geoCancelButton: document.getElementById("btn-geo-cancel"),
    geoConfirmButton: document.getElementById("btn-geo-confirm"),
    geoSaveButton: document.getElementById("btn-geo-save"),
    coordModal: document.getElementById("coordModal"),
    coordCancelButton: document.getElementById("coord-cancel"),
    coordSubmitButton: document.getElementById("coord-submit"),
    coordInputs: ["p1", "p2", "p3", "p4"].map((id) => document.getElementById(id)),
    navDrawButton: document.getElementById("nav-draw-zone"),
    navCoordsButton: document.getElementById("nav-open-coords"),
    navSimulateButton: document.getElementById("nav-simulate-route"),
    navStopButton: document.getElementById("nav-stop-sim"),
    navProfileButton: document.getElementById("nav-profile"),
    navLogoutButton: document.getElementById("nav-logout"),
};

const state = {
    currentMode: "IDLE",
    drawnPoints: [],
    tempMarkers: [],
    tempPolygon: null,
    hoverPolyline: null,
    previewShape: null,
    customPolygonsLayer: L.layerGroup().addTo(map),
    markers: {},
    searchMarker: null,
    currentMapId: null,
    simStart: null,
    simEnd: null,
    simMarkerStart: null,
    simPolyline: null,
    simInterval: null,
};

const iconMarkup = {
    trash: `
        <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16"></path>
            <path d="M9 7V4h6v3"></path>
            <path d="M7 7l1 12h8l1-12"></path>
        </svg>
    `,
};

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function showToast(message, tone = "info", title) {
    if (!ui.toastRegion) return;

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.tone = tone;
    toast.innerHTML = `
        <div class="toast-copy">
            <span class="toast-title">${escapeHtml(title || tone)}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        </div>
    `;

    ui.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
}

async function apiRequest(url, options = {}) {
    const requestOptions = {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    };

    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json()
        : { message: "La respuesta del servidor no es válida." };

    if (!response.ok) {
        throw new Error(data.message || "No se pudo completar la solicitud.");
    }

    return data;
}

function setButtonBusy(button, isBusy, busyLabel = "Procesando") {
    if (!button) return;

    const label = button.querySelector("span");
    if (!button.dataset.defaultLabel && label) {
        button.dataset.defaultLabel = label.textContent.trim();
    }

    button.disabled = isBusy;
    if (label) {
        label.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
    }
}

function setSidebarStatus(message) {
    ui.appStatus.textContent = message;
}

function setAlertState(status, message) {
    const normalized = status === "DANGER" ? "danger" : status === "WARNING" ? "warning" : "safe";
    const titles = {
        safe: "Sistema seguro",
        warning: "Zona de precaución",
        danger: "Alerta activa",
    };

    ui.alertBox.dataset.status = normalized;
    ui.alertTitle.textContent = titles[normalized];
    ui.alertMessage.textContent = message;
}

function setActiveSidebarButton(activeButton) {
    [
        ui.navDrawButton,
        ui.navCoordsButton,
        ui.navSimulateButton,
        ui.navStopButton,
    ].forEach((button) => {
        if (button) button.classList.toggle("active", button === activeButton);
    });
}

function closeMenu() {
    ui.sidebar.classList.remove("active");
}

function toggleMenu() {
    ui.sidebar.classList.toggle("active");
}

function openCoordModal() {
    closeMenu();
    ui.coordModal.style.display = "flex";
}

function closeCoordModal() {
    ui.coordModal.style.display = "none";
}

function createBadgeMarker(label, extraClass = "") {
    return L.divIcon({
        className: `map-badge-marker ${extraClass}`.trim(),
        html: `<span>${escapeHtml(label)}</span>`,
    });
}

function resetPreviewShape() {
    if (state.previewShape) {
        map.removeLayer(state.previewShape);
        state.previewShape = null;
    }
}

function clearHoverLine() {
    if (state.hoverPolyline) {
        map.removeLayer(state.hoverPolyline);
        state.hoverPolyline = null;
    }
}

function syncGeoSaveState() {
    const hasShape = state.drawnPoints.length >= 3;
    const hasName = ui.geoPanelName.value.trim().length > 0;
    ui.geoSaveButton.disabled = !(hasShape && hasName);
    ui.geoConfirmButton.disabled = !hasShape;
}

function updatePointSummary() {
    const pointCount = state.drawnPoints.length;
    if (pointCount === 0) {
        ui.geoPointSummary.textContent = "Aún no hay puntos trazados.";
    } else if (pointCount < 3) {
        ui.geoPointSummary.textContent = `Hay ${pointCount} punto(s). Faltan ${3 - pointCount} para cerrar una forma válida.`;
    } else {
        ui.geoPointSummary.textContent = `${pointCount} puntos listos. Ya puedes nombrar y guardar la geocerca.`;
    }
}

function resetTempDrawing() {
    state.drawnPoints = [];
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.tempPolygon) {
        map.removeLayer(state.tempPolygon);
        state.tempPolygon = null;
    }

    clearHoverLine();
    resetPreviewShape();
    ui.geoCoordList.innerHTML = "";
    updatePointSummary();
    syncGeoSaveState();
}

function renderDrawnGeometry() {
    state.tempMarkers.forEach((marker) => map.removeLayer(marker));
    state.tempMarkers = [];

    if (state.tempPolygon) {
        map.removeLayer(state.tempPolygon);
        state.tempPolygon = null;
    }

    ui.geoCoordList.innerHTML = "";

    state.drawnPoints.forEach((point, index) => {
        const marker = L.circleMarker([point.lat, point.lng], {
            color: "#6ca7ff",
            fillColor: "#6ca7ff",
            radius: 5,
            fillOpacity: 0.85,
            weight: 2,
        }).addTo(map);
        state.tempMarkers.push(marker);

        const item = document.createElement("li");
        item.innerHTML = `
            <div class="point-copy">
                <span class="point-label">P${index + 1}</span>
                <span class="point-value">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</span>
            </div>
            <button class="btn-delete-point" type="button" title="Eliminar punto">
                ${iconMarkup.trash}
            </button>
        `;

        const deleteButton = item.querySelector(".btn-delete-point");
        deleteButton.addEventListener("click", () => {
            state.drawnPoints.splice(index, 1);
            clearHoverLine();
            renderDrawnGeometry();
        });

        deleteButton.addEventListener("mouseenter", () => {
            marker.setStyle({ color: "#ef6767", fillColor: "#ef6767", radius: 6 });
            if (state.drawnPoints.length > 1) {
                const prev = (index - 1 + state.drawnPoints.length) % state.drawnPoints.length;
                const next = (index + 1) % state.drawnPoints.length;
                const coords = state.drawnPoints.length === 2
                    ? [
                        [state.drawnPoints[0].lat, state.drawnPoints[0].lng],
                        [state.drawnPoints[1].lat, state.drawnPoints[1].lng],
                    ]
                    : [
                        [state.drawnPoints[prev].lat, state.drawnPoints[prev].lng],
                        [state.drawnPoints[index].lat, state.drawnPoints[index].lng],
                        [state.drawnPoints[next].lat, state.drawnPoints[next].lng],
                    ];

                state.hoverPolyline = L.polyline(coords, {
                    color: "#ef6767",
                    weight: 4,
                    opacity: 0.8,
                }).addTo(map);
            }
        });

        deleteButton.addEventListener("mouseleave", () => {
            marker.setStyle({ color: "#6ca7ff", fillColor: "#6ca7ff", radius: 5 });
            clearHoverLine();
        });

        ui.geoCoordList.prepend(item);
    });

    if (state.drawnPoints.length >= 3) {
        state.tempPolygon = L.polygon(
            state.drawnPoints.map((point) => [point.lat, point.lng]),
            {
                color: "#6ca7ff",
                fillColor: "#6ca7ff",
                fillOpacity: 0.18,
                weight: 2,
            },
        ).addTo(map);
    }

    updatePointSummary();
    syncGeoSaveState();
}

function renderSavedPolygon(points, name, options = {}) {
    const polygon = L.polygon(
        points.map((point) => [point.lat, point.lng]),
        {
            color: options.color || "#8eb7ff",
            fillColor: options.fillColor || "#6ca7ff",
            fillOpacity: options.fillOpacity || 0.18,
            weight: options.weight || 2,
        },
    ).addTo(state.customPolygonsLayer);

    if (name) {
        polygon.bindPopup(`<strong>${escapeHtml(name)}</strong>`);
    }

    return polygon;
}

function startDrawing() {
    stopSimulation();
    resetTempDrawing();
    ui.geoPanelName.value = "";
    ui.geoPanel.style.display = "block";
    ui.geoPanelContent.classList.remove("collapsed");
    ui.geoPanelArrow.classList.remove("arrow-up");
    state.currentMode = "DRAWING";
    map.getContainer().style.cursor = "crosshair";
    closeMenu();
    setActiveSidebarButton(ui.navDrawButton);
    setSidebarStatus("Modo dibujo activo. Marca al menos tres puntos.");
    syncGeoSaveState();
}

function cancelDrawing() {
    resetTempDrawing();
    ui.geoPanelName.value = "";
    ui.geoPanel.style.display = "none";
    state.currentMode = "IDLE";
    map.getContainer().style.cursor = "grab";
    setActiveSidebarButton(null);
    setSidebarStatus("Edición cancelada.");
}

function validateCurrentShape() {
    if (state.drawnPoints.length < 3) {
        showToast("Necesitas al menos tres puntos para formar una geocerca.", "warning", "Forma incompleta");
        return;
    }

    ui.geoPanelName.focus();
    setSidebarStatus("Forma válida. Asigna un nombre y guarda.");
    showToast("La forma es válida. Ya puedes guardarla.", "success", "Geocerca lista");
}

function stopSimulation() {
    if (state.simInterval) {
        window.clearInterval(state.simInterval);
        state.simInterval = null;
    }

    if (state.simPolyline) {
        map.removeLayer(state.simPolyline);
        state.simPolyline = null;
    }

    if (state.simMarkerStart) {
        map.removeLayer(state.simMarkerStart);
        state.simMarkerStart = null;
    }

    state.simStart = null;
    state.simEnd = null;

    if (state.currentMode === "SIMULATING") {
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
    }
}

function startSimulationSetup() {
    cancelDrawing();
    stopSimulation();
    closeMenu();
    setActiveSidebarButton(ui.navSimulateButton);
    state.currentMode = "SIMULATING";
    map.getContainer().style.cursor = "crosshair";
    setSidebarStatus("Selecciona el punto inicial de la ruta.");
}

async function sendFakeLocation(lat, lng) {
    try {
        await apiRequest("/api/update_location", {
            method: "POST",
            body: JSON.stringify({
                lat,
                lng,
                device_id: "simulador_bot",
                alias: "Bot controlado",
            }),
        });
    } catch (error) {
        showToast(error.message, "error", "Ruta detenida");
        stopSimulation();
    }
}

function runSimulation() {
    if (!state.simStart || !state.simEnd) return;

    const steps = 200;
    const duration = 40000;
    const stepTime = duration / steps;
    let currentStep = 0;

    const latStep = (state.simEnd.lat - state.simStart.lat) / steps;
    const lngStep = (state.simEnd.lng - state.simStart.lng) / steps;

    setSidebarStatus("Simulación en curso. Se está enviando ubicación en tiempo real.");

    state.simInterval = window.setInterval(() => {
        currentStep += 1;

        const newLat = state.simStart.lat + latStep * currentStep;
        const newLng = state.simStart.lng + lngStep * currentStep;
        sendFakeLocation(newLat, newLng);

        if (currentStep >= steps) {
            window.clearInterval(state.simInterval);
            state.simInterval = null;
            setSidebarStatus("Simulación completada.");
            setActiveSidebarButton(null);
        }
    }, stepTime);
}

function parseCoordinateInput(input) {
    const parts = input.split(",").map((value) => Number.parseFloat(value.trim()));
    if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
        throw new Error("Usa el formato latitud, longitud. Ejemplo: 19.33, -99.11");
    }

    return { lat: parts[0], lng: parts[1] };
}

function processCoordinates() {
    try {
        const points = ui.coordInputs.map((input) => parseCoordinateInput(input.value));
        state.drawnPoints = points;
        ui.geoPanel.style.display = "block";
        closeCoordModal();
        renderDrawnGeometry();
        state.currentMode = "DRAWING";
        map.getContainer().style.cursor = "crosshair";
        setActiveSidebarButton(ui.navCoordsButton);
        setSidebarStatus("Área base creada. Revisa los puntos y asigna un nombre.");

        if (state.tempPolygon) {
            map.fitBounds(state.tempPolygon.getBounds(), { padding: [32, 32] });
        }
    } catch (error) {
        showToast(error.message, "warning", "Coordenadas inválidas");
    }
}

function handleMapClick(event) {
    if (state.currentMode === "DRAWING") {
        state.drawnPoints.push({ lat: event.latlng.lat, lng: event.latlng.lng });
        resetPreviewShape();
        renderDrawnGeometry();
        return;
    }

    if (state.currentMode === "SIMULATING") {
        if (!state.simStart) {
            state.simStart = event.latlng;
            state.simMarkerStart = L.marker(state.simStart, {
                icon: createBadgeMarker("A", "route-start"),
            }).addTo(map);
            setSidebarStatus("Inicio fijado. Selecciona el destino.");
            return;
        }

        state.simEnd = event.latlng;
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
        state.simPolyline = L.polyline([state.simStart, state.simEnd], {
            color: "#6ca7ff",
            dashArray: "8 10",
            weight: 3,
        }).addTo(map);
        runSimulation();
    }
}

function handleMapMouseMove(event) {
    if (state.currentMode !== "DRAWING" || state.drawnPoints.length === 0) {
        return;
    }

    const cursorPoint = [event.latlng.lat, event.latlng.lng];
    const firstPoint = [state.drawnPoints[0].lat, state.drawnPoints[0].lng];
    const lastPoint = [
        state.drawnPoints[state.drawnPoints.length - 1].lat,
        state.drawnPoints[state.drawnPoints.length - 1].lng,
    ];

    resetPreviewShape();

    if (state.drawnPoints.length === 1) {
        state.previewShape = L.polyline([firstPoint, cursorPoint], {
            color: "#43be83",
            weight: 2,
            dashArray: "4 10",
        }).addTo(map);
        return;
    }

    state.previewShape = L.polygon([firstPoint, cursorPoint, lastPoint], {
        color: "#43be83",
        fillColor: "#43be83",
        fillOpacity: 0.1,
        weight: 2,
        dashArray: "4 10",
        interactive: false,
    }).addTo(map);
}

socket.on("new_location", (data) => {
    const lat = Number.parseFloat(data.lat);
    const lng = Number.parseFloat(data.lng);
    const deviceId = data.device_id || "dispositivo";
    const alias = data.alias || deviceId;
    const markerKey = alias;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return;
    }

    if (state.markers[markerKey]) {
        state.markers[markerKey].setLatLng([lat, lng]).bindPopup(escapeHtml(alias));
        return;
    }

    if (deviceId === "simulador_bot") {
        state.markers[markerKey] = L.marker([lat, lng], {
            icon: createBadgeMarker("BOT", "device-bot"),
        }).addTo(map).bindPopup("Bot controlado");
        return;
    }

    state.markers[markerKey] = L.marker([lat, lng]).addTo(map).bindPopup(escapeHtml(alias));
});

socket.on("geofence_event", (data) => {
    setAlertState(data.status, data.message);
    if (data.status === "DANGER") {
        showToast(data.message, "error", "Alerta");
    } else if (data.status === "WARNING") {
        showToast(data.message, "warning", "Precaución");
    }
});

async function saveZone() {
    const name = ui.geoPanelName.value.trim();
    if (state.drawnPoints.length < 3) {
        showToast("Necesitas al menos tres puntos para guardar la geocerca.", "warning", "Faltan puntos");
        return;
    }

    if (!name) {
        showToast("Asigna un nombre a la geocerca antes de guardarla.", "warning", "Nombre requerido");
        ui.geoPanelName.focus();
        return;
    }

    setButtonBusy(ui.geoSaveButton, true, "Guardando");

    try {
        await apiRequest("/api/add_zone", {
            method: "POST",
            body: JSON.stringify({
                name,
                points: state.drawnPoints,
                map_id: state.currentMapId,
            }),
        });

        renderSavedPolygon(state.drawnPoints, name, {
            color: "#8eb7ff",
            fillColor: "#6ca7ff",
            fillOpacity: 0.15,
        });

        showToast(`La geocerca "${name}" se guardó correctamente.`, "success", "Guardado");
        setSidebarStatus(`Geocerca "${name}" guardada.`);
        ui.geoPanelName.value = "";
        ui.geoPanel.style.display = "none";
        state.currentMode = "IDLE";
        map.getContainer().style.cursor = "grab";
        resetTempDrawing();
        setActiveSidebarButton(null);
    } catch (error) {
        showToast(error.message, "error", "Error al guardar");
    } finally {
        setButtonBusy(ui.geoSaveButton, false);
    }
}

async function saveMap() {
    const mapName = ui.mapNameInput.value.trim();
    if (!mapName) {
        showToast("El mapa debe tener un nombre.", "warning", "Nombre requerido");
        return;
    }

    setButtonBusy(ui.saveMapButton, true, "Guardando");

    try {
        const data = await apiRequest("/api/save_map", {
            method: "POST",
            body: JSON.stringify({
                map_id: state.currentMapId,
                name: mapName,
            }),
        });

        if (!state.currentMapId) {
            state.currentMapId = data.new_map_id;
        }

        setSidebarStatus(`Mapa "${mapName}" guardado.`);
        showToast(`El mapa "${mapName}" quedó guardado.`, "success", "Mapa actualizado");
    } catch (error) {
        showToast(error.message, "error", "Error del mapa");
    } finally {
        setButtonBusy(ui.saveMapButton, false);
    }
}

async function loadMapContext() {
    const params = new URLSearchParams(window.location.search);
    const mapId = params.get("map_id");

    if (mapId) {
        try {
            const data = await apiRequest(`/api/get_map_zones/${mapId}`, { method: "GET" });
            state.currentMapId = mapId;
            ui.mapNameInput.value = data.nombre_mapa;

            data.zonas.forEach((zone) => {
                renderSavedPolygon(zone.puntos, zone.nombre, {
                    color: "#8eb7ff",
                    fillColor: "#6ca7ff",
                    fillOpacity: 0.14,
                });
            });

            if (state.customPolygonsLayer.getLayers().length > 0) {
                map.fitBounds(state.customPolygonsLayer.getBounds(), { padding: [32, 32] });
            }

            setSidebarStatus(`Mapa "${data.nombre_mapa}" cargado.`);
            return;
        } catch (error) {
            showToast(error.message, "error", "No se pudo cargar el mapa");
        }
    }

    try {
        const data = await apiRequest("/api/get_next_map_name", { method: "GET" });
        if (data.nextName) {
            ui.mapNameInput.value = data.nextName;
        }
    } catch (error) {
        showToast(error.message, "warning", "Nombre automático no disponible");
    }
}

function restoreZoneFromProfile() {
    const storedZone = localStorage.getItem("zonaParaDibujar");
    if (!storedZone) return;

    try {
        const points = JSON.parse(storedZone);
        if (!Array.isArray(points) || points.length === 0) return;

        const polygon = renderSavedPolygon(points, "Geocerca seleccionada", {
            color: "#43be83",
            fillColor: "#43be83",
            fillOpacity: 0.12,
        });
        map.fitBounds(polygon.getBounds(), { padding: [32, 32] });
    } catch (error) {
        showToast("No se pudo restaurar la geocerca seleccionada.", "warning", "Vista incompleta");
    } finally {
        localStorage.removeItem("zonaParaDibujar");
    }
}

async function searchPlace() {
    const query = ui.searchInput.value.trim();
    if (!query) return;

    setButtonBusy(ui.searchButton, true, "Buscando");

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`,
        );
        const results = await response.json();

        if (!results || results.length === 0) {
            showToast("No se encontró ninguna coincidencia para esa búsqueda.", "warning", "Sin resultados");
            return;
        }

        const result = results[0];
        const lat = Number.parseFloat(result.lat);
        const lng = Number.parseFloat(result.lon);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            throw new Error("La ubicación encontrada no tiene coordenadas válidas.");
        }

        map.flyTo([lat, lng], 15);

        if (state.searchMarker) {
            map.removeLayer(state.searchMarker);
        }

        state.searchMarker = L.marker([lat, lng]).addTo(map);
        state.searchMarker.bindPopup(`<strong>Resultado</strong><br>${escapeHtml(result.display_name)}`).openPopup();
    } catch (error) {
        showToast(error.message || "Hubo un problema al buscar el lugar.", "error", "Búsqueda fallida");
    } finally {
        setButtonBusy(ui.searchButton, false);
    }
}

function bindEvents() {
    ui.menuToggle.addEventListener("click", toggleMenu);
    ui.drawButton.addEventListener("click", startDrawing);
    ui.drawDropdownButton.addEventListener("click", (event) => {
        event.stopPropagation();
        ui.drawDropdownMenu.classList.toggle("show");
    });
    ui.drawCoordsButton.addEventListener("click", () => {
        ui.drawDropdownMenu.classList.remove("show");
        openCoordModal();
    });

    ui.geoPanelHeader.addEventListener("click", () => {
        ui.geoPanelContent.classList.toggle("collapsed");
        ui.geoPanelArrow.classList.toggle("arrow-up");
    });
    ui.geoPanelName.addEventListener("input", syncGeoSaveState);
    ui.geoCancelButton.addEventListener("click", cancelDrawing);
    ui.geoConfirmButton.addEventListener("click", validateCurrentShape);
    ui.geoSaveButton.addEventListener("click", saveZone);

    ui.coordCancelButton.addEventListener("click", closeCoordModal);
    ui.coordSubmitButton.addEventListener("click", processCoordinates);

    ui.navDrawButton.addEventListener("click", startDrawing);
    ui.navCoordsButton.addEventListener("click", openCoordModal);
    ui.navSimulateButton.addEventListener("click", startSimulationSetup);
    ui.navStopButton.addEventListener("click", () => {
        stopSimulation();
        setActiveSidebarButton(null);
        setSidebarStatus("Simulación detenida.");
    });
    ui.navProfileButton.addEventListener("click", () => {
        window.location.href = "/profile";
    });
    ui.navLogoutButton.addEventListener("click", () => {
        window.location.href = "/logout";
    });

    ui.saveMapButton.addEventListener("click", saveMap);
    ui.searchButton.addEventListener("click", searchPlace);
    ui.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchPlace();
        }
    });

    document.addEventListener("click", (event) => {
        if (ui.drawDropdownMenu.classList.contains("show") &&
            !ui.drawDropdownMenu.contains(event.target) &&
            !ui.drawDropdownButton.contains(event.target)) {
            ui.drawDropdownMenu.classList.remove("show");
        }

        if (ui.sidebar.classList.contains("active") &&
            !ui.sidebar.contains(event.target) &&
            !ui.menuToggle.contains(event.target)) {
            closeMenu();
        }
    });

    map.on("click", handleMapClick);
    map.on("mousemove", handleMapMouseMove);
}

async function init() {
    bindEvents();
    updatePointSummary();
    syncGeoSaveState();
    setAlertState("SAFE", "Monitoreo activo.");
    setSidebarStatus("En espera de interacción.");
    await loadMapContext();
    restoreZoneFromProfile();
}

init();
