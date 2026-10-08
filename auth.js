// =====================================
// AUTH.JS
// Learnova
// =====================================

// Current Session
window.currentUser =
    localStorage.getItem("user");

// Protect Route
const cloudSessionMissing = window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase" &&
    !localStorage.getItem("scorelytics_access_token");
if (!currentUser || cloudSessionMissing) {
    localStorage.removeItem("user");
    window.location.href = "/login";
}

// Welcome Text
function loadWelcome() {
    const welcome = document.getElementById("welcome");

    if (welcome) {
        welcome.textContent = `Welcome ${currentUser}`;
    }
    const importLink = document.getElementById("legacyImportLink");
    if (importLink && window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase") {
        importLink.style.display = "block";
    }
    const aiPrivacyNotice = document.getElementById("aiPrivacyNotice");
    if (aiPrivacyNotice && window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase") {
        aiPrivacyNotice.style.display = "block";
    }
}

// Logout
async function logout() {
    if (window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase") {
        try {
            await fetch("/logout", { method: "POST" });
        } catch (error) {
            console.error("Could not end the hosted Learnova session:", error);
        }
    }
    localStorage.removeItem("user");
    localStorage.removeItem("scorelytics_access_token");
    localStorage.removeItem("scorelytics_refresh_token");
    window.location.href = "/login";
}

// Profile Name
function loadProfile() {
    const profileName = document.getElementById("profileName");

    if (!profileName) return;

    profileName.textContent = currentUser;
}

// =========================
// Profile Picture
// =========================

function loadProfilePicture() {
    const profilePic = document.getElementById("profilePic");

    if (!profilePic) return;

    const savedPic = localStorage.getItem(
        `profilePic_${currentUser}`
    );

    if (savedPic) {
        profilePic.src = savedPic;
    }
}

function setupProfileUpload() {

    const imageInput =
        document.getElementById("profileImageInput");

    const profilePic =
        document.getElementById("profilePic");

    if (!imageInput || !profilePic) return;

    imageInput.addEventListener("change", function () {

        const file = this.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = function (e) {

            const imageData = e.target.result;

            profilePic.src = imageData;

            localStorage.setItem(
                `profilePic_${currentUser}`,
                imageData
            );
        };

        reader.readAsDataURL(file);
    });
}

// =========================
// Change Password
// =========================

async function changePassword(event) {

    event.preventDefault();

    const passwordInput =
        document.getElementById("newPassword");

    const newPassword = passwordInput.value.trim();

    if (!newPassword) {

        if (typeof showToast === "function") {
            showToast(
                "Please enter a password ❌",
                "error"
            );
        }

        return;
    }

    try {

        const response = await fetch(
            "http://localhost:8000/changePassword",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    username: currentUser,
                    newPassword
                })
            }
        );

        const data = await response.json();

        if (data.success) {

            if (typeof showToast === "function") {
                showToast(
                    "Password updated ✅",
                    "success"
                );
            }

            passwordInput.value = "";

        } else {

            if (typeof showToast === "function") {
                showToast(
                    "Update failed ❌",
                    "error"
                );
            }
        }

    } catch (err) {

        console.error(err);

        if (typeof showToast === "function") {
            showToast(
                "Server error ❌",
                "error"
            );
        }
    }
}

// =========================
// Event Registration
// =========================

function initializeAuth() {

    loadWelcome();

    loadProfile();

    loadProfilePicture();

    setupProfileUpload();

    const logoutBtn =
        document.getElementById("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener(
            "click",
            logout
        );
    }

    const passwordForm =
        document.querySelector(
            ".password-section"
        );

    if (passwordForm) {
        passwordForm.addEventListener(
            "submit",
            changePassword
        );
    }
}

// Boot
initializeAuth();