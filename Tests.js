// ======================================
// TESTS.JS - Learnova (Cleaned 1.2.1)
// ======================================
let allTests = [];
let currentTests = [];

// ======================================
// API INTEGRATION
// ======================================
async function getTests() {
    const response = await fetch("http://localhost:10000/getTests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser })
    });
    if (!response.ok) {
        throw new Error(`Could not load tests (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
        throw new Error("The server returned an invalid Tests list.");
    }
    return data;
}

async function loadTests() {
    try {
        const tests = await getTests();
        allTests = tests;
        currentTests = tests;
        
        renderTests(tests);
        if (typeof renderStats === "function") renderStats(tests);
        if (typeof renderInsight === "function") renderInsight(tests);
        if (typeof detectTestInsights === "function") detectTestInsights(tests);
        if (typeof detectStreak === "function") detectStreak(tests); 
        if (typeof renderSubjectRanking === "function") renderSubjectRanking(tests);
        if (typeof renderOverviewExtras === "function") renderOverviewExtras(tests);
        if (typeof loadProfile === "function") loadProfile();
        if (typeof renderProfileStats === "function") renderProfileStats(tests);
        if (typeof loadChatHistory === "function") loadChatHistory(); 
        return tests;
    } catch (e) {
        console.error("Initialization error:", e);
        return null;
    }
}

// ======================================
// WRITE CONFIGURATIONS
// ======================================
async function addTest(event) {
    event.preventDefault();
    const subjectEl = document.getElementById("subject");
    const scoreEl = document.getElementById("score");
    const totalEl = document.getElementById("total");

    const subject = subjectEl.value.trim();
    const score = Number(scoreEl.value);
    const total = Number(totalEl.value);

    if (!subject || total <= 0 || score < 0 || score > total) {
        showToast("Check that the score is not more than the total.", "error");
        return;
    }

    const test = { subject, score, total, date: new Date().toLocaleDateString() };

    try {
        const response = await fetch("http://localhost:10000/addTest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser, test })
        });
        const data = await response.json();
        if (data.success) {
            document.getElementById("testForm").reset();
            showToast("Test score saved ✅", "success");
            await loadTests();
        } else {
            showToast("Could not add this test. Please try again.", "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Could not connect. Please try again.", "error");
    }
}

window.editTest = async function(index) {
    console.log("✏️ Restoring Edit Modal tracking context index:", index);
    
    // Safely look up the tests array from your workspace variable scope
    const testsList = (typeof allTests !== 'undefined' && allTests.length > 0) ? allTests : currentTests;
    
    if (!testsList || !testsList[index]) {
        console.error("❌ Test matrix tracking mismatch at index alignment target.");
        return;
    }
    
    const test = testsList[index];
    window.editIndex = index; // Lock the active record slot globally

    // Binds directly to the input fields inside your index.html layout
    const subjectInput = document.getElementById("editSubject") || document.getElementById("subjectName");
    const scoreInput = document.getElementById("editScore") || document.getElementById("scoreObtained");
    const totalInput = document.getElementById("editTotal") || document.getElementById("totalMarks");
    const modalView = document.getElementById("editModal");

    if (subjectInput && scoreInput && totalInput && modalView) {
        subjectInput.value = test.subject;
        scoreInput.value = test.score;
        totalInput.value = test.total;
        modalView.style.display = "flex"; // Slide the dark editor overlay panel open!
    } else {
        // Safe interactive text overlay fallback if DOM nodes are clipping out
        const newSubject = prompt("Update Subject Target Name:", test.subject);
        const newScore = prompt("Update Score Result Metric:", test.score);
        const newTotal = prompt("Update Total Potential Marks:", test.total);
        if(newSubject && newScore && newTotal) {
            await executeDirectSaveUpdate(index, newSubject, Number(newScore), Number(newTotal), test.date);
        }
    }
}

window.closeEdit = function() {
    const modalView = document.getElementById("editModal");
    if (modalView) modalView.style.display = "none";
    window.editIndex = null;
}

window.saveEdit = async function() {
    if (window.editIndex === null || window.editIndex === undefined) return;
    
    const subjectInput = document.getElementById("editSubject") || document.getElementById("subjectName");
    const scoreInput = document.getElementById("editScore") || document.getElementById("scoreObtained");
    const totalInput = document.getElementById("editTotal") || document.getElementById("totalMarks");
    
    if (!subjectInput || !scoreInput || !totalInput) return;
    
    const testsList = (typeof allTests !== 'undefined' && allTests.length > 0) ? allTests : currentTests;
    const targetDate = testsList[window.editIndex] ? testsList[window.editIndex].date : new Date().toLocaleDateString();

    await executeDirectSaveUpdate(window.editIndex, subjectInput.value.trim(), Number(scoreInput.value), Number(totalInput.value), targetDate);
}

async function executeDirectSaveUpdate(index, subject, score, total, date) {
    const testsList = (typeof allTests !== 'undefined' && allTests.length > 0) ? allTests : currentTests;
    testsList[index] = { subject, score, total, date };

    try {
        const res = await fetch("http://localhost:10000/saveAllTests", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ username: localStorage.getItem("user") || "Yuvaan Tolnur", tests: testsList })
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === "function") showToast("Test score updated.", "edit");
            window.closeEdit();
            if (typeof loadTests === "function") loadTests(); // Rebuilds overview dashboards instantly
        }
    } catch (err) {
        console.error("Express data ledger write lock fault:", err);
    }
}

async function saveEdit() {
    if (editIndex === null) return;
    try {
        const tests = await getTests();
        tests[editIndex] = {
            subject: document.getElementById("editSubject").value.trim(),
            score: Number(document.getElementById("editScore").value),
            total: Number(document.getElementById("editTotal").value),
            date: tests[editIndex].date
        };

        // FIXED: Added absolute route URL mapping to port 10000
        const res = await fetch("http://localhost:10000/saveAllTests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser, tests })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Test details updated ✏️", "edit");
            if (typeof closeEdit === "function") closeEdit();
            await loadTests();
        }
    } catch (err) {
        console.error(err);
        showToast("Could not save your changes. Please try again.", "error");
    }
}

async function deleteTest(i) {
    try {
        const tests = await getTests();
        tests.splice(i, 1);

        // FIXED: Added absolute route URL mapping to port 10000
        const res = await fetch("http://localhost:10000/saveAllTests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser, tests })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Test score deleted.", "success");
            await loadTests();
        }
    } catch (err) {
        console.error(err);
        showToast("Could not delete this test. Please try again.", "error");
    }
}

// ======================================
// INTERFACE RENDERING
// ======================================
function renderTests(tests) {
    const list = document.getElementById("testList");
    if (!list) return;
    list.innerHTML = "";

    if (!Array.isArray(tests) || tests.length === 0) {
        list.innerHTML = "<li style='padding: 15px; opacity:0.6;'>🔎 No tests found. Try another search or add a test score.</li>";
        return;
    }

    tests.forEach((test, index) => {
        const percent = (test.score / test.total) * 100;
        let color = "#ef4444";
        if (percent >= 80) color = "#22c55e";
        else if (percent >= 50) color = "#facc15";

        const li = document.createElement("li");
        li.className = "test-card";
        li.innerHTML = `
            <div class="test-info">
                <div class="subject">${test.subject}</div>
                <div class="score" style="color:${color}">
                    ${test.score}/${test.total} (${percent.toFixed(0)}%)
                </div>
            </div>
            <div class="actions">
                <button onclick="editTest(${index})">✏️</button>
                <button onclick="openDeleteModal(${index})">❌</button>
            </div>
        `;
        list.appendChild(li);
    });
}

function filterTests() {
    const query = document.getElementById("searchTests").value.toLowerCase();
    const filtered = allTests.filter(test => test.subject.toLowerCase().includes(query));
    
    const countEl = document.getElementById("searchCount");
    if (countEl) countEl.textContent = `${filtered.length} tests found`;
    renderTests(filtered);
}

// Triggers the background python compiler and automatically opens the report card
async function triggerPDFReportCompilation() {
    if (!currentUser) return;
    
    showToast("Making your study plan…", "edit");
    
    try {
        const response = await fetch("http://localhost:10000/api/export-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: currentUser })
        });
        if (!response.ok) {
            throw new Error(`PDF export failed with HTTP ${response.status}.`);
        }

        const data = await response.json();
        
        if (data.success && data.filename) {
            const cloudMode = window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase";
            const downloadUrl = cloudMode
                ? `/api/download-pdf/${encodeURIComponent(data.filename)}`
                : `/${encodeURIComponent(data.filename)}`;
            const pdfResponse = await fetch(downloadUrl);
            if (!pdfResponse.ok) {
                throw new Error(`PDF download failed with HTTP ${pdfResponse.status}.`);
            }
            const pdfBlob = await pdfResponse.blob();
            const pdfLink = document.createElement("a");
            const objectUrl = URL.createObjectURL(pdfBlob);
            pdfLink.href = objectUrl;
            pdfLink.download = data.filename;
            document.body.appendChild(pdfLink);
            pdfLink.click();
            pdfLink.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            showToast("Report downloaded! 📊", "success");
        } else {
            throw new Error(data.message || "The server could not generate the PDF.");
        }
    } catch (connectionFault) {
        console.error("PDF export failed:", connectionFault);
        showToast("Could not make your study plan. Please try again.", "error");
    }
}

// ======================================
// SYSTEM BOOT ENTRY
// ======================================
function initializeTests() {
    loadTests();
    const testForm = document.getElementById("testForm");
    if (testForm) testForm.addEventListener("submit", addTest);

    const searchInput = document.getElementById("searchTests");
    if (searchInput) searchInput.addEventListener("input", filterTests);
}

document.addEventListener("DOMContentLoaded", initializeTests);
