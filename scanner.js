// =====================================
// SCANNER.JS - Scorelytics V2 (Streaming Build 1.2.1)
// =====================================

let activeVideoStream = null;
let liveScanInterval = null;
let isScanThrottled = false;

// =====================================
// 📷 1. NATIVE CANVAS FRAME CAPTURE DECK
// =====================================
function captureFrame() {
    const video = document.getElementById("webcamView");
    const canvas = document.getElementById("captureCanvas");

    if (!video || !canvas) {
        return null;
    }

    const ctx = canvas.getContext("2d");
    
    // Ensure canvas dimensions exactly mirror the live video feed stream metadata
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the active video frame pixels directly onto the 2D canvas workspace context
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert pixel matrix straight into a base64 PNG data URL string
    return canvas.toDataURL("image/png");
}

// =====================================
// 🟢 2. START CAMERA INTERFACE STREAM
// =====================================
async function startScorelyticsCamera() {
    const videoEl = document.getElementById("webcamView");
    const statusEl = document.getElementById("scannerStatus");
    
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera capture is unavailable in this browser context.");
        }

        // Natively request access to video device array lanes
        activeVideoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                facingMode: "user"
            }
        });

        videoEl.srcObject = activeVideoStream;
        await videoEl.play();

        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#22c55e";
            statusEl.textContent = "🟢 Scanner Engine Active & Armed";
        }

        // Fire up the high-speed background streaming logic thread automatically
        startLiveAutoScanningLoop();

    } catch (error) {
        console.error("Camera Hardware Stream Initialization Fault:", error);
        if (videoEl) videoEl.srcObject = null;
        if (activeVideoStream) {
            activeVideoStream.getTracks().forEach(track => track.stop());
            activeVideoStream = null;
        }
        if (statusEl) {
            statusEl.style.display = "block";
            statusEl.style.color = "#ef4444";
            const errorName = error && error.name ? `${error.name}: ` : "";
            statusEl.textContent = `Camera failed: ${errorName}${error.message || "Unknown camera error"}`;
        }
    }
}

// =====================================
// 🛑 3. STOP CAMERA SYSTEMS & HARDWARE
// =====================================
function stopScorelyticsCamera() {
    if (liveScanInterval) {
        clearInterval(liveScanInterval);
        liveScanInterval = null;
    }

    if (activeVideoStream) {
        activeVideoStream.getTracks().forEach(track => track.stop());
        activeVideoStream = null;
    }

    isScanThrottled = false;

    const statusEl = document.getElementById("scannerStatus");
    if (statusEl) {
        statusEl.style.color = "#f59e0b";
        statusEl.textContent = "Camera Stopped";
    }
}

// =====================================
// 🎯 4. BACKGROUND CONTINUOUS SCANNER LOOP
// =====================================
function startLiveAutoScanningLoop() {
    if (liveScanInterval) clearInterval(liveScanInterval);
    
    // Snaps and processes quiet background frames without dragging dashboard interface latency
    liveScanInterval = setInterval(async () => {
        // If a processing lock is active or the device is closed, stall out the cycle execution
        if (isScanThrottled || !activeVideoStream) return;
        isScanThrottled = true;

        const imageBase64String = captureFrame();
        if (!imageBase64String) {
            isScanThrottled = false;
            return;
        }

        let reviewPending = false;
        try {
            const response = await fetch("http://localhost:8000/api/auto-upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: currentUser,
                    imageBase64: imageBase64String
                })
            });
            if (!response.ok) {
                throw new Error(`Scanner request failed with HTTP ${response.status}.`);
            }

            const result = await response.json();

            // THE MOMENT THE HYBRID OCR FINDS VALID STRINGS, INTERCEPT THE LIFECYCLE!
            if (result.success && result.data && !result.data.error) {
                if (typeof showToast === "function") {
                    showToast("Score Isolated! ✅", "success");
                }
                
                // Hydrate variables and open your gorgeous modal dashboard layout panel automatically
                await reviewScan(result.data);
                const editModal = document.getElementById("editModal");
                reviewPending = Boolean(editModal && editModal.style.display === "flex");
            }
        } catch (err) {
            console.error("Background scanner request failed:", err);
        } finally {
            if (!reviewPending) isScanThrottled = false;
        }
    }, 2000);
}

// =====================================
// 🎯 5. CONSOLE & HARDWARE INTERFACE RESET TRIGGERS
// =====================================
function rearmScannerEngine() {
    isScanThrottled = false;
    const statusEl = document.getElementById("scannerStatus");
    if (statusEl) {
        statusEl.style.color = "#22c55e";
        statusEl.textContent = "🟢 Scanner Engine Active & Armed";
    }
}

// =====================================
// 📝 6. HYDRATE NATIVE MODAL FIELDS WITH OCR
// =====================================
async function reviewScan(data) {
    const editModal = document.getElementById("editModal");
    const editSubjectInput = document.getElementById("editSubject");
    const editScoreInput = document.getElementById("editScore");
    const editTotalInput = document.getElementById("editTotal");

    if (!editModal || !editSubjectInput || !editScoreInput || !editTotalInput) {
        console.error("Layout Alert: Core UI editor forms are missing from HTML template.");
        return;
    }

    // Bind values dynamically
    editSubjectInput.value = data.subject || "Unknown Subject";
    editScoreInput.value = data.score !== undefined ? data.score : "";
    editTotalInput.value = data.total !== undefined ? data.total : "";

    // Launch the dark-themed view panel overlay using your custom CSS blur matrix rules
    editModal.style.display = "flex";

    const saveBtn = editModal.querySelector("button[onclick='saveEdit()']") || 
                    document.getElementById("saveEditBtn");
                    
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.addEventListener("click", async function() {
            const confirmedSubject = editSubjectInput.value.trim();
            const confirmedScore = Number(editScoreInput.value);
            const confirmedTotal = Number(editTotalInput.value);

            if (!confirmedSubject || confirmedTotal <= 0 || confirmedScore < 0 || confirmedScore > confirmedTotal) {
                if (typeof showToast === "function") showToast("Invalid verified data input parameters ❌", "error");
                return;
            }

            // Execute lowdb database log call
            await saveConfirmedScore({
                subject: confirmedSubject,
                score: confirmedScore,
                total: confirmedTotal
            });

            editModal.style.display = "none";
            rearmScannerEngine(); // Reset the background scanner loop for the next paper!
        });
    }
}

async function saveConfirmedScore(result) {
    try {
        const response = await fetch("http://localhost:8000/api/save-confirmed-score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                subject: result.subject,
                score: result.score,
                total: result.total
            })
        });

        const data = await response.json();
        if (data.success) {
            if (typeof showToast === "function") showToast("Test Logged to lowdb ✅", "success");
            if (typeof loadTests === "function") await loadTests();
        } else {
            if (typeof showToast === "function") showToast("Database log write failed ❌", "error");
        }
    } catch (error) {
        console.error("Server Save Error:", error);
    }
}

// =====================================
// 🎯 MANUAL SNAPSHOT EVENT OVERRIDE
// =====================================
async function captureAndParseScore() {
    // If the scanner loop is currently locked or camera is off, reject manual spams
    if (isScanThrottled || !activeVideoStream) {
        if (typeof showToast === "function") showToast("Camera system is unready or locked! 📷", "error");
        return;
    }

    const statusEl = document.getElementById("scannerStatus");
    if (statusEl) {
        statusEl.style.color = "#60a5fa";
        statusEl.textContent = "⚡ Forcing Instant AI Extraction Pass...";
    }

    isScanThrottled = true; // Lock background engine instantly

    const imageBase64String = captureFrame();
    if (!imageBase64String) {
        isScanThrottled = false;
        return;
    }

    try {
        const response = await fetch("http://localhost:8000/api/auto-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                imageBase64: imageBase64String
            })
        });

        const result = await response.json();

        if (result.success && result.data && !result.data.error) {
            if (typeof showToast === "function") showToast("Score Isolated! ✅", "success");
            await reviewScan(result.data);
        } else {
            // If the manual scan failed to find text, reset the gate so background streaming resumes
            isScanThrottled = false;
            if (typeof showToast === "function") showToast("Scan clear. No score pattern found 🔎", "error");
            rearmScannerEngine();
        }
    } catch (err) {
        console.error("Manual scan channel fault:", err);
        isScanThrottled = false;
        rearmScannerEngine();
    }
}


// =====================================
// 📦 7. COMPONENT LAYOUT EVENTS BINDING
// =====================================
function initializeScanner() {
    const cameraBtn = document.getElementById("cameraBtn");
    if (cameraBtn) {
        cameraBtn.addEventListener("click", startScorelyticsCamera);
    }
}

document.addEventListener("DOMContentLoaded", initializeScanner);
