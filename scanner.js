// =====================================
// SCANNER.JS - Learnova (Streaming Build 1.2.1)
// =====================================

let activeVideoStream = null;
let isScanThrottled = false;
let cameraStartPromise = null;
let activeScanPromise = null;
let cameraRequestId = 0;
let scanGeneration = 0;
let lastScannerStatus = "";
let pendingScanConfirmation = false;
let pendingManualScoreEntry = false;

function setScannerStatus(message, color, channel = "SCANNER") {
    if (message === lastScannerStatus) return;
    lastScannerStatus = message;
    console.info(`[${channel}] ${message}`);

    const statusEl = document.getElementById("scannerStatus");
    if (statusEl) {
        statusEl.style.display = "block";
        statusEl.style.color = color;
        statusEl.textContent = message;
    }
}

function hasLiveVideoTrack(stream) {
    return Boolean(stream && stream.getVideoTracks().some(track => track.readyState === "live"));
}

function isCameraReady(video, stream = activeVideoStream) {
    return Boolean(
        video &&
        stream &&
        stream === activeVideoStream &&
        video.srcObject === stream &&
        hasLiveVideoTrack(stream) &&
        video.readyState >= video.HAVE_ENOUGH_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
    );
}

function hasVisibleVideoFrame(video, stream = activeVideoStream) {
    return Boolean(
        video &&
        stream &&
        stream === activeVideoStream &&
        video.srcObject === stream &&
        hasLiveVideoTrack(stream) &&
        video.readyState >= video.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
    );
}

function isValidScoreResult(data) {
    if (!data || typeof data !== "object") return false;
    const scoreValue = data.score;
    const totalValue = data.total;
    if (
        (typeof scoreValue !== "number" && typeof scoreValue !== "string") ||
        (typeof totalValue !== "number" && typeof totalValue !== "string") ||
        String(scoreValue).trim() === "" ||
        String(totalValue).trim() === ""
    ) return false;
    const score = Number(scoreValue);
    const total = Number(totalValue);
    return Number.isFinite(score) && Number.isFinite(total) &&
        total > 0 && score >= 0 && score <= total;
}

async function waitForCameraReady(video, stream, requestId, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (requestId !== cameraRequestId || stream !== activeVideoStream) return false;
        if (isCameraReady(video, stream)) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return isCameraReady(video, stream);
}

// =====================================
// 📷 1. NATIVE CANVAS FRAME CAPTURE DECK
// =====================================
function captureFrame() {
    const video = document.getElementById("webcamView");
    const canvas = document.getElementById("captureCanvas");

    if (!video || !canvas || !isCameraReady(video)) {
        console.info("[CAMERA] Frame capture skipped: video is not ready to provide a complete frame.");
        return null;
    }

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

// =====================================
// 🟢 2. START CAMERA INTERFACE STREAM
// =====================================
async function startCameraStream() {
    const videoEl = document.getElementById("webcamView");
    let requestId = cameraRequestId;

    try {
        if (!videoEl) throw new Error("Camera preview is unavailable.");
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera capture is unavailable in this browser context.");
        }
        if (activeVideoStream) {
            if (hasVisibleVideoFrame(videoEl)) {
                setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
                console.info("[CAMERA] Existing preview is visible; waiting for a complete decoded frame.");
                const existingStream = activeVideoStream;
                const existingRequestId = cameraRequestId;
                if (await waitForCameraReady(videoEl, existingStream, existingRequestId)) {
                    setScannerStatus("Camera Ready", "#22c55e", "CAMERA");
                    return true;
                }
                if (hasVisibleVideoFrame(videoEl, existingStream)) {
                    console.info("[CAMERA] Kept the visible stream; it has not reported HAVE_ENOUGH_DATA yet.");
                    return false;
                }
            }
            activeVideoStream.getTracks().forEach(track => track.stop());
            activeVideoStream = null;
            videoEl.srcObject = null;
        }

        requestId = ++cameraRequestId;
        setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
        console.info("[CAMERA] Requesting camera stream.");
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: { ideal: "environment" }
            }
        });

        if (requestId !== cameraRequestId) {
            stream.getTracks().forEach(track => track.stop());
            console.info("[CAMERA] Discarded a stream returned after the camera was stopped.");
            return false;
        }

        activeVideoStream = stream;
        stream.getVideoTracks().forEach(track => {
            track.addEventListener("ended", () => {
                if (activeVideoStream !== stream) return;
                console.warn("[CAMERA] Video track ended.");
                setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
            });
        });
        videoEl.srcObject = stream;
        console.info("[CAMERA] Stream attached; waiting for metadata and decoded frames.");
        try {
            await videoEl.play();
        } catch (playError) {
            console.warn("[CAMERA] video.play() did not resolve immediately:", playError);
        }

        const ready = await waitForCameraReady(videoEl, stream, requestId);
        if (!ready) {
            if (hasVisibleVideoFrame(videoEl, stream)) {
                console.warn("[CAMERA] Preview has dimensions and decoded frames; waiting for HAVE_ENOUGH_DATA.");
                setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
                return false;
            }
            throw new Error("The camera stream opened but video frames are not ready yet.");
        }

        setScannerStatus("Camera Ready", "#22c55e", "CAMERA");
        return true;

    } catch (error) {
        if (requestId !== cameraRequestId) return false;
        if (isCameraReady(videoEl) || hasVisibleVideoFrame(videoEl)) {
            console.warn("[CAMERA] Suppressed camera startup error because a live preview is rendering:", error);
            setScannerStatus("Camera Ready", "#22c55e", "CAMERA");
            return true;
        }
        console.error("[CAMERA] Camera startup error:", error);
        setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
        if (typeof showToast === "function") {
            showToast(`Camera unavailable: ${error.message || "Check camera permission and try again."}`, "error");
        }
        const failedStream = activeVideoStream;
        if (videoEl && videoEl.srcObject === failedStream) videoEl.srcObject = null;
        if (failedStream) {
            failedStream.getTracks().forEach(track => track.stop());
            if (activeVideoStream === failedStream) activeVideoStream = null;
        }
        return false;
    }
}

async function startLearnovaCamera() {
    if (cameraStartPromise) return cameraStartPromise;
    if (isCameraReady(document.getElementById("webcamView"))) {
        setScannerStatus("Camera Ready", "#22c55e", "CAMERA");
        return true;
    }

    const startPromise = startCameraStream();
    cameraStartPromise = startPromise;
    try {
        return await startPromise;
    } finally {
        if (cameraStartPromise === startPromise) cameraStartPromise = null;
    }
}

// =====================================
// 🛑 3. STOP CAMERA SYSTEMS & HARDWARE
// =====================================
function stopLearnovaCamera() {
    cameraRequestId += 1;
    scanGeneration += 1;

    const videoEl = document.getElementById("webcamView");
    if (activeVideoStream) {
        activeVideoStream.getTracks().forEach(track => track.stop());
        activeVideoStream = null;
    }
    if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
    }

    isScanThrottled = false;
    activeScanPromise = null;
    setScannerStatus("Camera stopped.", "#64748b", "CAMERA");
}

function isReviewModalOpen() {
    const editModal = document.getElementById("editModal");
    return Boolean(editModal && editModal.style.display === "flex");
}

// =====================================
// 🎯 5. CONSOLE & HARDWARE INTERFACE RESET TRIGGERS
// =====================================
function rearmScannerEngine() {
    isScanThrottled = false;
    const cameraReady = isCameraReady(document.getElementById("webcamView"));
    setScannerStatus(
        cameraReady ? "Camera Ready" : "Camera Starting...",
        cameraReady ? "#22c55e" : "#f59e0b",
        "SCANNER"
    );
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
    if (!isValidScoreResult(data)) {
        console.warn("[OCR] Refusing to show invalid score result:", data);
        setScannerStatus("Scan Complete", "#f59e0b", "OCR");
        return;
    }

    // Bind values dynamically
    editSubjectInput.value = data.subject || "Unknown Subject";
    editScoreInput.value = data.score !== undefined ? data.score : "";
    editTotalInput.value = data.total !== undefined ? data.total : "";

    pendingScanConfirmation = true;
    pendingManualScoreEntry = false;
    setScanReviewCopy("scan");
    editModal.style.display = "flex";
    console.info("[SCANNER] Showing OCR result for user verification before adding it to Tests.");
}

function openManualScoreEntry() {
    const editModal = document.getElementById("editModal");
    const editSubjectInput = document.getElementById("editSubject");
    const editScoreInput = document.getElementById("editScore");
    const editTotalInput = document.getElementById("editTotal");
    if (!editModal || !editSubjectInput || !editScoreInput || !editTotalInput) {
        console.error("[SCANNER] Cannot show manual score entry: score form is unavailable.");
        return false;
    }

    editSubjectInput.value = "";
    editScoreInput.value = "";
    editTotalInput.value = "";
    pendingScanConfirmation = true;
    pendingManualScoreEntry = true;
    setScanReviewCopy("manual");
    editModal.style.display = "flex";
    console.info("[SCANNER] Showing manual score entry after OCR did not return a valid score.");
    return true;
}

async function confirmScannedResult() {
    if (!pendingScanConfirmation) return false;

    const manualEntry = pendingManualScoreEntry;
    const subject = document.getElementById("editSubject").value.trim();
    const score = Number(document.getElementById("editScore").value);
    const total = Number(document.getElementById("editTotal").value);
    if (!subject || !isValidScoreResult({ score, total })) {
        if (typeof showToast === "function") showToast("Check the subject, score, and total before saving.", "error");
        return false;
    }

    const saved = await saveConfirmedScore({ subject, score, total });
    if (!saved) return false;

    if (typeof showToast === "function") {
        showToast(
            manualEntry ? "Score added to Tests ✅" : "Verified score added to Tests ✅",
            "success"
        );
    }
    pendingScanConfirmation = false;
    pendingManualScoreEntry = false;
    const editModal = document.getElementById("editModal");
    if (editModal) editModal.style.display = "none";
    setScanReviewCopy(false);
    isScanThrottled = false;
    rearmScannerEngine();
    if (typeof showTab === "function") showTab("tests");
    return true;
}

function setScanReviewCopy(isScanReview) {
    const title = document.getElementById("editModalTitle");
    const help = document.getElementById("editModalHelp");
    const saveButton = document.getElementById("saveEditBtn");
    if (title) {
        title.textContent = isScanReview === "manual"
            ? "Enter Score Manually"
            : isScanReview
                ? "Review Scanned Score"
                : "Edit Test Details";
    }
    if (help) {
        help.textContent = isScanReview === "manual"
            ? "The scan could not read a score. Enter the subject, score, and total below to add it to Tests."
            : isScanReview
                ? "Confirm the subject and score below. Nothing is added to Tests until you verify and save."
                : "Update the subject and score for this test.";
    }
    if (saveButton) {
        saveButton.textContent = isScanReview === "manual"
            ? "Add Score to Tests"
            : isScanReview
                ? "Verify & Add to Tests"
                : "Save Details";
    }
}

function cancelScannedResultReview() {
    const editModal = document.getElementById("editModal");
    if (editModal) editModal.style.display = "none";
    if (!pendingScanConfirmation) {
        setScanReviewCopy(false);
        return;
    }
    pendingScanConfirmation = false;
    pendingManualScoreEntry = false;
    isScanThrottled = false;
    setScanReviewCopy(false);
    console.info("[SCANNER] User cancelled OCR result confirmation; no test was saved.");
    rearmScannerEngine();
}

async function saveConfirmedScore(result) {
    if (!isValidScoreResult(result) || !String(result.subject || "").trim()) {
        console.error("[SCANNER] Refusing to save an invalid confirmed score:", result);
        if (typeof showToast === "function") showToast("Enter a valid score and total before saving.", "error");
        return false;
    }
    let saved = false;
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

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Save failed with HTTP ${response.status}.`);
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.message || "The server did not save this test.");
        saved = true;

        if (typeof loadTests !== "function") {
            throw new Error("The score was saved, but the Tests list could not be refreshed.");
        }
        const refreshedTests = await loadTests();
        if (!Array.isArray(refreshedTests)) {
            throw new Error("The score was saved, but the Tests list could not be refreshed. Reopen Tests to reload it.");
        }
        return true;
    } catch (error) {
        console.error("[SCANNER] Could not save or refresh the confirmed test:", error);
        if (typeof showToast === "function") {
            showToast(
                saved
                    ? "Score saved, but Tests did not refresh. Reopen Tests to reload it."
                    : error.message || "Could not save the verified score.",
                "error"
            );
        }
        return saved;
    }
}

async function processCapturedFrame(imageBase64String, origin) {
    setScannerStatus("Processing...", "#3b82f6", "OCR");
    console.info(`[OCR] ${origin} frame sent to the score parser.`);
    const requestGeneration = scanGeneration;

    const request = (async () => {
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
        return response.json();
    })();
    activeScanPromise = request;

    try {
        const result = await request;
        if (requestGeneration !== scanGeneration) {
            console.info("[OCR] Discarded a response from a scan cancelled by stopping the camera.");
            return false;
        }
        if (result.success && isValidScoreResult(result.data)) {
            console.info("[OCR] Score extraction completed successfully.", result.data);
            setScannerStatus("Scan Complete", "#22c55e", "OCR");
            if (typeof showToast === "function") showToast("Score detected. Review the result.", "success");
            await reviewScan(result.data);
            return true;
        }

        console.info("[OCR] Processing completed without a valid score.", result.message || result.data);
        setScannerStatus("Scan Complete", "#f59e0b", "OCR");
        if (origin === "manual" && typeof showToast === "function") {
            const detail = String(result.message || "");
            const noScoreDetected = /unable to detect|no readable text|no score/i.test(detail);
            if (openManualScoreEntry()) {
                showToast(
                    noScoreDetected
                        ? "Couldn't read the score. Enter it here, or cancel and capture a closer, sharper image."
                        : detail
                            ? `Scanner issue: ${detail} You can enter the score manually.`
                            : "No score was returned. Enter it manually or cancel and try another capture.",
                    noScoreDetected ? "edit" : "error"
                );
            }
        }
        return false;
    } catch (error) {
        if (requestGeneration !== scanGeneration) {
            console.info("[OCR] Ignored an error from a scan cancelled by stopping the camera.");
            return false;
        }
        console.error("[OCR] Request did not complete successfully:", error);
        setScannerStatus("Scan Complete", "#f59e0b", "OCR");
        if (origin === "manual" && openManualScoreEntry() && typeof showToast === "function") {
            showToast("Automatic scanning is unavailable. Enter the score manually, or cancel and try again later.", "error");
        }
        return false;
    } finally {
        if (activeScanPromise === request) activeScanPromise = null;
    }
}

// =====================================
// 🎯 MANUAL SNAPSHOT EVENT OVERRIDE
// =====================================
async function captureAndParseScore() {
    while (isScanThrottled) {
        if (isReviewModalOpen()) {
            console.info("[SCANNER] Capture skipped because a result review is already open.");
            return;
        }
        if (activeScanPromise) {
            setScannerStatus("Processing...", "#3b82f6", "SCANNER");
            console.info("[SCANNER] Manual capture is waiting for the current capture to finish.");
            try {
                await activeScanPromise;
            } catch (error) {
                console.info("[OCR] Previous capture ended with an error; allowing a fresh manual capture.", error);
            }
        } else {
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }

    if (isReviewModalOpen()) {
        console.info("[SCANNER] Capture skipped because a result review is already open.");
        return;
    }

    if (!isCameraReady(document.getElementById("webcamView"))) {
        setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
        const cameraReady = await startLearnovaCamera();
        if (!cameraReady) return;
    }

    const video = document.getElementById("webcamView");
    const ready = await waitForCameraReady(video, activeVideoStream, cameraRequestId);
    if (!ready) {
        if (hasVisibleVideoFrame(video)) {
            console.info("[CAMERA] Preview is visible; waiting for a complete frame before capture.");
            setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
        } else {
            console.warn("[CAMERA] Capture is waiting for video readiness.");
            setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
        }
        return;
    }

    isScanThrottled = true;
    const operationGeneration = scanGeneration;
    setScannerStatus("Capturing...", "#3b82f6", "SCANNER");
    const imageBase64String = captureFrame();
    if (!imageBase64String) {
        isScanThrottled = false;
        const cameraReady = isCameraReady(video);
        setScannerStatus(
            cameraReady ? "Camera Ready" : "Camera Starting...",
            cameraReady ? "#22c55e" : "#f59e0b",
            "CAMERA"
        );
        return;
    }

    try {
        await processCapturedFrame(imageBase64String, "manual");
    } finally {
        if (operationGeneration === scanGeneration && !isReviewModalOpen()) {
            isScanThrottled = false;
        }
    }
}


// =====================================
// 📦 7. COMPONENT LAYOUT EVENTS BINDING
// =====================================
function initializeScanner() {
    setScannerStatus("Camera Starting...", "#f59e0b", "CAMERA");
    const cameraBtn = document.getElementById("cameraBtn");
    if (cameraBtn) {
        cameraBtn.addEventListener("click", startLearnovaCamera);
    }

    const video = document.getElementById("webcamView");
    if (video) {
        video.addEventListener("loadedmetadata", () => {
            console.info(`[CAMERA] Metadata loaded: ${video.videoWidth}x${video.videoHeight}.`);
        });
        video.addEventListener("canplay", () => {
            console.info(`[CAMERA] Video can play; readyState=${video.readyState}.`);
        });
        video.addEventListener("playing", () => {
            console.info("[CAMERA] Live video playback started.");
        });
    }

    const saveButton = document.getElementById("saveEditBtn");
    if (saveButton) {
        saveButton.removeAttribute("onclick");
        saveButton.addEventListener("click", async event => {
            if (pendingScanConfirmation) {
                event.preventDefault();
                await confirmScannedResult();
                return;
            }
            if (typeof window.saveEdit === "function") {
                setScanReviewCopy(false);
                await window.saveEdit();
            }
        });
    }

    const cancelButton = document.getElementById("closeEditBtn");
    if (cancelButton) cancelButton.addEventListener("click", cancelScannedResultReview);
}

document.addEventListener("DOMContentLoaded", initializeScanner);
