// =====================================
// UI.JS
// Learnova
// =====================================

// Remove 'let' so it binds to the variable already created by your other script files
// === FILE: ui.js ===
// Safe mapping avoids crashing alongside tests.js variable scopes
editIndex = window.editIndex !== undefined ? window.editIndex : null;
pendingDeleteIndex = window.pendingDeleteIndex !== undefined ? window.pendingDeleteIndex : null;

function getCurrentUserContext() {
    return localStorage.getItem("user") || "Yuvaan Tolnur";
}

const availableAppThemes = new Set(["midnight", "cyberpunk", "matrix"]);

window.changeAppTheme = function() {
    const selector = document.getElementById("themeSelector");
    if (!selector || !availableAppThemes.has(selector.value)) return;

    const selectedTheme = selector.value;
    document.documentElement.setAttribute("data-theme", selectedTheme);

    const currentUser = localStorage.getItem("user") || "guest";
    localStorage.setItem(`scorelytics_theme_${currentUser}`, selectedTheme);
};

window.applySavedUserTheme = function() {
    const currentUser = localStorage.getItem("user") || "guest";
    const savedTheme = localStorage.getItem(`scorelytics_theme_${currentUser}`);
    const selectedTheme = availableAppThemes.has(savedTheme) ? savedTheme : "midnight";

    document.documentElement.setAttribute("data-theme", selectedTheme);

    const selector = document.getElementById("themeSelector");
    if (selector) selector.value = selectedTheme;
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.applySavedUserTheme, { once: true });
} else {
    window.applySavedUserTheme();
}

let leafletMapDeck = null;
let activeSchoolMarker = null;
let targetCoordinates = null;

function placeSchoolMarker(lat, lng) {
    targetCoordinates = { lat, lng };
    const position = L.latLng(lat, lng);
    if (activeSchoolMarker) activeSchoolMarker.setLatLng(position);
    else activeSchoolMarker = L.marker(position, { draggable: true }).addTo(leafletMapDeck);

    activeSchoolMarker.off("dragend");
    activeSchoolMarker.on("dragend", event => {
        const updatedCoordinates = event.target.getLatLng();
        targetCoordinates = { lat: updatedCoordinates.lat, lng: updatedCoordinates.lng };
    });
}

function showTab(tabName, event = null) {
    // Remove the active class from all existing tabs to let them fade out smoothly
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    // Append the active state class onto the chosen layout tab element instantly
    const selected = document.getElementById(tabName);
    if (selected) {
        selected.classList.add("active");
    }

    // Standard sidebar state tracking code
    document.querySelectorAll('.sidebar p[id^="tab-"]').forEach(item => {
        item.classList.remove("active");
    });

    if (event?.target) {
        event.target.classList.add("active");
    }

    // Trigger specific framework engines when required
    if (tabName === "profile") {
    setTimeout(() => {
        if (typeof leafletMapDeck !== 'undefined' && leafletMapDeck !== null) {
            leafletMapDeck.invalidateSize(); // 💥 Instantly squashes the blank gray block glitch!
            window.dispatchEvent(new Event('resize')); 
        } else if (typeof forceRebuildSchoolMap === 'function') {
            forceRebuildSchoolMap(); 
        }
    }, 150);
}
    if (tabName === "analytics" && typeof loadAnalytics === "function") { loadAnalytics(); }
    if (tabName === "overview" && typeof loadOverview === "function") { loadOverview(); }
}

// ==========================================================================
// 🗺️ LEAFLET.JS - CONTAINER SAFE ABSOLUTE VECTOR RESET ENGINE
// ==========================================================================
function forceRebuildSchoolMap() {
    const mapElement = document.getElementById('schoolMap');
    if (!mapElement) return;

    try {
        // 🚀 INJECT PySide6 CSS DIMENSION CHECKS
        let overrideStyle = document.getElementById("leaflet-webview-override");
        if (!overrideStyle) {
            overrideStyle = document.createElement("style");
            overrideStyle.id = "leaflet-webview-override";
            overrideStyle.innerHTML = `
                #schoolMap { height: 450px !important; min-height: 450px !important; width: 100% !important; display: block !important; position: relative !important; z-index: 10 !important; }
                #schoolMap img { max-width: none !important; max-height: none !important; display: inline !important; }
                .leaflet-container { background: #111827 !important; }
                .leaflet-tile-container img { visibility: visible !important; opacity: 1 !important; }
            `;
            document.head.appendChild(overrideStyle);
        }

        // If the server confirms saved metrics exist, dynamically re-paint the map anchor marker pins!
        if (typeof allTests !== 'undefined') {
            // Check if backend database entries contain location records
            console.log("🌍 Analyzing datastore files for historical campus maps...");
            // We can also request the lowdb user context directly from server.js endpoints
        }

        // 🚀 CLEAN RUNTIME DESTRUCTION OVERRIDE
        if (leafletMapDeck !== null) {
            leafletMapDeck.off();
            leafletMapDeck.remove();
            leafletMapDeck = null;
            activeSchoolMarker = null;
        }

        // 1. Initialize pristine map canvas targeted onto the active DOM viewport layout
        leafletMapDeck = L.map('schoolMap', { 
            fadeAnimation: false, 
            zoomAnimation: true,
            trackResize: true 
        }).setView([18.6276, 73.8011], 13);

        // 2. Load open-source street map texture tiles layers natively with HTTPS
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            maxZoom: 19, 
            attribution: '© OpenStreetMap contributors'
        }).addTo(leafletMapDeck);

        // 3. 🚀 THE CRITICAL HARDWARE RESET: Forces the container dimensions to synchronize perfectly
        leafletMapDeck.invalidateSize();
        setTimeout(() => {
            if (leafletMapDeck) {
                leafletMapDeck.invalidateSize();
                window.dispatchEvent(new Event('resize'));
            }
        }, 200);

        // 4. Anchor user interactive pin-drop map click listeners back into action tracks
        leafletMapDeck.on('click', function(e) {
            const { lat, lng } = e.latlng;
            placeSchoolMarker(lat, lng);
            activeSchoolMarker.bindPopup("<b style='color:#2563eb;'>School Anchored</b>").openPopup();
        });
        loadSavedSchoolLocation();

    } catch (error) {
        console.error("Critical mapping initialization runtime fault caught:", error);
    }
}

// ✅ LEAFLET INIT FUNCTION
function initializeSchoolMapEngine() {
    // If map is already drawn, just recalculate sizes safely and stop
    if (leafletMapDeck) {
        leafletMapDeck.invalidateSize();
        return;
    }

    // 1. Initialize map and target default local center track coordinates
    leafletMapDeck = L.map('schoolMap').setView([18.6276, 73.8011], 13);

    // 2. Load custom open-source street map texture tiles layers
    // Ensure your tile layer block inside ui.js looks like this:
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
    maxZoom: 19, 
    attribution: '© OpenStreetMap contributors'
}).addTo(leafletMapDeck);


    // 3. User Pin-Drop Interactive Click Event Handler
    leafletMapDeck.on('click', function(e) {
        const { lat, lng } = e.latlng;
        placeSchoolMarker(lat, lng);
        
        activeSchoolMarker.bindPopup("<b>My School Pin Location Dropped</b>").openPopup();
    });
    loadSavedSchoolLocation();
}

// =========================
// Loader
// =========================

function hideLoader() {

    const loader =
        document.getElementById("pageLoader");

    if (!loader) return;

    loader.style.display = "none";
}

function showLoader() {

    const loader =
        document.getElementById("pageLoader");

    if (!loader) return;

    loader.style.display = "flex";
}

// =========================
// Toasts
// =========================

function showToast(
    message,
    type = "default"
) {

    const toast =
        document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;

    toast.className = "toast";

    switch (type) {

        case "success":
            toast.classList.add(
                "toast-success"
            );
            break;

        case "error":
            toast.classList.add(
                "toast-error"
            );
            break;

        case "edit":
            toast.classList.add(
                "toast-edit"
            );
            break;
    }

    toast.classList.add("show");

    setTimeout(() => {

        toast.classList.remove(
            "show"
        );

    }, 2500);
}

// =========================
// Edit Modal
// =========================

function openEditModal(
    index,
    test
) {

    editIndex = index;

    document.getElementById(
        "editSubject"
    ).value = test.subject;

    document.getElementById(
        "editScore"
    ).value = test.score;

    document.getElementById(
        "editTotal"
    ).value = test.total;

    document.getElementById(
        "editModal"
    ).style.display = "flex";
}

function closeEdit() {

    document.getElementById(
        "editModal"
    ).style.display = "none";

    editIndex = null;
}

// =========================
// Delete Modal
// =========================

function openDeleteModal(index) {

    pendingDeleteIndex = index;

    document.getElementById(
        "deleteModal"
    ).style.display = "flex";
}

function closeDeleteModal() {

    document.getElementById(
        "deleteModal"
    ).style.display = "none";

    pendingDeleteIndex = null;
}

async function confirmDelete() {

    if (
        pendingDeleteIndex === null
    ) return;

    if (
        typeof deleteTest ===
        "function"
    ) {

        await deleteTest(
            pendingDeleteIndex
        );

    }

    closeDeleteModal();
}

// =========================
// Event Bindings
// =========================

function bindSidebarEvents() {

    const sidebarItems =
        document.querySelectorAll(
            '.sidebar p[id^="tab-"]'
        );

    sidebarItems.forEach(item => {

        item.addEventListener(
            "click",
            event => {

                const section =
                    item.id
                        .replace(
                            "tab-",
                            ""
                        );

                showTab(
                    section,
                    event
                );
            }
        );
    });
}

function bindModalEvents() {

    const cancelDelete =
        document.getElementById(
            "cancelDeleteBtn"
        );

    if (cancelDelete) {

        cancelDelete
            .addEventListener(
                "click",
                closeDeleteModal
            );
    }

    const closeEditBtn =
        document.getElementById(
            "closeEditBtn"
        );

    if (closeEditBtn) {

        closeEditBtn
            .addEventListener(
                "click",
                closeEdit
            );
    }

    const confirmDeleteBtn =
        document.getElementById(
            "confirmDeleteBtn"
        );

    if (confirmDeleteBtn) {

        confirmDeleteBtn
            .addEventListener(
                "click",
                confirmDelete
            );
    }
}

// =========================
// Startup
// =========================

function initializeUI() {

    bindSidebarEvents();

    bindModalEvents();

    hideLoader();

    const overviewButton =
        document.getElementById(
            "tab-overview"
        );

    if (overviewButton) {
    showTab("overview", {
        target: overviewButton
    });
}}

document.addEventListener("DOMContentLoaded", () => {
    const saveLocBtn = document.getElementById("saveLocationBtn");
    if (saveLocBtn) {
        saveLocBtn.addEventListener("click", saveSchoolLocationMetadata);
    }
});

async function loadSavedSchoolLocation() {
    try {
        const response = await fetch(`/api/location?username=${encodeURIComponent(getCurrentUserContext())}`);
        if (response.status === 404) return;
        if (!response.ok) {
            throw new Error(`Location request failed with HTTP ${response.status}.`);
        }

        const result = await response.json();
        if (!result.success || !result.location) return;

        const { region, schoolName, coordinates } = result.location;
        const regionInput = document.getElementById("globalRegionInput");
        const schoolNameInput = document.getElementById("schoolNameInput");
        const regionSelect = document.getElementById("regionSelect");
        if (regionInput && region) regionInput.value = region;
        if (schoolNameInput && schoolName) schoolNameInput.value = schoolName;
        if (regionSelect && region) regionSelect.value = region;

        const lat = Number(coordinates?.lat);
        const lng = Number(coordinates?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !leafletMapDeck) return;

        placeSchoolMarker(lat, lng);
        leafletMapDeck.setView([lat, lng], 13);
    } catch (error) {
        console.error("Could not load saved school location:", error);
    }
}

async function saveSchoolLocationMetadata() {
    const regionInput = document.getElementById("globalRegionInput");
    const regionSelect = document.getElementById("regionSelect");
    const selectedRegion = regionInput.value.trim() || regionSelect.value;
    const specifiedSchool = document.getElementById("schoolNameInput").value.trim();

    if (!selectedRegion || !specifiedSchool || !targetCoordinates) {
        if (typeof showToast === "function") {
            showToast("Please pick a region, type school name, and drop a pin! ❌", "error");
        }
        return;
    }

    try {
        const response = await fetch("/api/save-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: getCurrentUserContext(),
                region: selectedRegion,
                schoolName: specifiedSchool,
                coordinates: targetCoordinates
            })
        });
        if (!response.ok) {
            throw new Error(`Location save failed with HTTP ${response.status}.`);
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || "The server did not save the location.");
        }
        regionSelect.value = selectedRegion;
        if (typeof showToast === "function") {
            showToast("Global Campus Profile Saved! 🌍", "success");
        }
    } catch (error) {
        console.error("Could not save school location:", error);
        if (typeof showToast === "function") {
            showToast("Could not save location ❌", "error");
        }
    }
}

// ✅ PURE JAVASCRIPT GLOBAL SEARCH UTILITY
async function searchGlobalRegion() {
    const targetQuery = document.getElementById("globalRegionInput").value.trim();
    
    if (!targetQuery) {
        if (typeof showToast === "function") showToast("Please type a location parameter first! ❌", "error");
        return;
    }

    if (!leafletMapDeck) {
        console.error("Mapping framework workspace context has not initialized yet.");
        return;
    }

    try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(targetQuery)}`);
        if (!response.ok) {
            throw new Error(`Geocoding request failed with HTTP ${response.status}.`);
        }
        const matchingData = await response.json();

        if (matchingData && matchingData.length > 0) {
            const latitude = parseFloat(matchingData[0].lat);
            const longitude = parseFloat(matchingData[0].lon);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                throw new Error("Geocoding service returned invalid coordinates.");
            }

            // Fly the camera view directly to the user's searched coordinates anywhere on earth!
            leafletMapDeck.flyTo([latitude, longitude], 13, {
                animate: true,
                duration: 1.5
            });

            if (typeof showToast === "function") {
                showToast(`Located: ${matchingData[0].display_name.split(',')[0]} ✈️`, "success");
            }
            placeSchoolMarker(latitude, longitude);
        } else {
            if (typeof showToast === "function") showToast("Location pattern not found globally 🗺️", "error");
        }
    } catch (fault) {
        console.error("Geocoding connection dropped:", fault);
        if (typeof showToast === "function") showToast("Failed to link with global map servers ❌", "error");
    }
}

// ==========================================================================
// ⚙️ RESTORED MASTER UI SYNCHRONIZATION & INITIALIZATION MOTOR
// ==========================================================================
window.runSynchronizedBootSequence = function() {
    console.log("🔒 Learnova native UI sync online.");

    // 1. Safely bind click event listeners to your sidebar options
    document.querySelectorAll('.sidebar p[id^="tab-"]').forEach(item => {
        // Prevent duplicate listener stacking by removing old click tracks first
        item.replaceWith(item.cloneNode(true));
    });
    
    // Re-fetch targets to bind fresh, clean click channels
    document.querySelectorAll('.sidebar p[id^="tab-"]').forEach(item => {
        item.addEventListener("click", event => { 
            const tabTarget = item.id.replace("tab-", "");
            showTab(tabTarget, event); 
        });
    });
    
    // 2. Safe Modal button listener bindings (wrapped so they never crash the login screen)
    const cancelDel = document.getElementById("cancelDeleteBtn");
    if (cancelDel) cancelDel.onclick = window.closeDeleteModal;

    const closeEd = document.getElementById("closeEditBtn");
    if (closeEd) closeEd.onclick = window.closeEdit;

    const confirmDel = document.getElementById("confirmDeleteBtn");
    if (confirmDel) confirmDel.onclick = window.confirmDelete;
    
    // 3. Re-load active data profiles into metrics tracking charts
    if (typeof loadTests === "function") {
        try {
            loadTests();
        } catch (err) {
            console.error("Dashboard calculation load exception caught safely:", err);
        }
    }
    
    // 4. 🔥 THE CRITICAL FIX FOR THE SPINNER: Crush the loading block instantly!
    const loader = document.getElementById("pageLoader") || 
                   document.getElementById("loader") || 
                   document.querySelector(".loader");
    if (loader) {
        loader.style.display = "none";
        console.log("✨ Spinner disabled. Layout active.");
    }

    // Default target pane workspace route focus placement
    showTab("overview");
}

// Global lifecycle auto-trigger fallback
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.runSynchronizedBootSequence);
} else {
    // If the document is already loaded when the script parses, run immediately
    setTimeout(() => { window.runSynchronizedBootSequence(); }, 50);
}

// Upgraded boot layout handshake hook handles profile tracking cleanly
window.addEventListener("DOMContentLoaded", async () => {
    // If the active local layout session user indicator is blank, set a solid default profile track context
    if (!localStorage.getItem("user")) {
        localStorage.setItem("user"); // Safe session anchor fallback
    }
    // Set up standard sidebar view channels
    runSynchronizedBootSequence();
});


initializeUI();