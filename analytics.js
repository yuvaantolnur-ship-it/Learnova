// === FILE: analytics.js ===
let chart = null;

// =====================================
// Overview Cards
// =====================================
function renderStats(tests) {
    const avgEl = document.getElementById("average");
    const perfEl = document.getElementById("performance");
    if (!tests || tests.length === 0) {
        avgEl.textContent = "Take a test to see your average";
        perfEl.textContent = "-";
        return;
    }
    let earned = 0;
    let possible = 0;
    tests.forEach(test => {
        earned += test.score;
        possible += test.total;
    });
    const average = ((earned / possible) * 100).toFixed(1);
    avgEl.textContent = `${average}%`;

    if (average >= 90) perfEl.textContent = "🔥 Excellent";
    else if (average >= 75) perfEl.textContent = "✅ Good";
    else if (average >= 50) perfEl.textContent = "⚠️ Needs Work";
    else perfEl.textContent = "❌ Poor";
}

// =====================================
// Extra Overview Cards
// =====================================
function renderOverviewExtras(tests) {
    const totalEl = document.getElementById("totalTests");
    const latestEl = document.getElementById("latestScore");
    const consistencyEl = document.getElementById("consistency");

    if (!tests.length) {
        totalEl.textContent = "0";
        latestEl.textContent = "-";
        consistencyEl.textContent = "-";
        return;
    }
    totalEl.textContent = tests.length;
    const latest = tests[tests.length - 1];
    latestEl.textContent = (latest.score / latest.total * 100).toFixed(0) + "%";

    const values = tests.map(t => t.score / t.total);
    const variance = values.reduce((sum, value) => sum + Math.abs(value - values[0]), 0) / values.length;

    if (variance < 0.10) consistencyEl.textContent = "Very steady ✅";
    else if (variance < 0.20) consistencyEl.textContent = "Mostly steady ⚖️";
    else consistencyEl.textContent = "Changing often ⚠️";
}

// =====================================
// Profile Stats
// =====================================
function renderProfileStats(tests) {
    const testsEl = document.getElementById("profileTests");
    const avgEl = document.getElementById("profileAverage");
    const consistencyEl = document.getElementById("profileConsistency");

    if (!tests.length) {
        testsEl.textContent = "0";
        avgEl.textContent = "-";
        consistencyEl.textContent = "-";
        return;
    }
    let score = 0;
    let total = 0;
    tests.forEach(test => {
        score += test.score;
        total += test.total;
    });
    const average = ((score / total) * 100).toFixed(1);
    testsEl.textContent = tests.length;
    avgEl.textContent = average + "%";
    consistencyEl.textContent = calculateConsistency(tests);
}

function calculateConsistency(tests) {
    const values = tests.map(test => test.score / test.total);
    const variance = values.reduce((sum, value) => sum + Math.abs(value - values[0]), 0) / values.length;
    if (variance < 0.10) return "Very steady ✅";
    if (variance < 0.20) return "Mostly steady ⚖️";
    return "Changing often ⚠️";
}

// =====================================
// Insight Engine
// =====================================
function renderInsight(tests) {
    const insight = document.getElementById("insight");
    if (!insight) return;

    if (!tests || tests.length < 3) {
        insight.textContent = "📈 Add at least 3 test scores to see how your results are changing.";
        return;
    }
    const firstAvg = tests[0].score / tests[0].total * 100;
    const lastAvg = tests[tests.length - 1].score / tests[tests.length - 1].total * 100;
    const overallChange = lastAvg - firstAvg;

    const recent = tests.slice(-3);
    let recentVelocity = 0;
    for (let i = 1; i < recent.length; i++) {
        const prevPct = (recent[i-1].score / recent[i-1].total) * 100;
        const currPct = (recent[i].score / recent[i].total) * 100;
        recentVelocity += (currPct - prevPct);
    }
    const avgVelocity = recentVelocity / (recent.length - 1);

    let statusText = "";
    if (avgVelocity > 2) {
        statusText = `🚀 <strong>You’re improving!</strong> Your score has gone up by about ${avgVelocity.toFixed(1)}% on recent tests.`;
    } else if (avgVelocity < -2) {
        statusText = `⚠️ <strong>Your recent scores have gone down.</strong> Try practising a subject that feels tricky.`;
    } else {
        statusText = `⚖️ <strong>Your scores are staying steady.</strong> Keep practising to build on your progress.`;
    }
    insight.innerHTML = `${statusText} <br><span style="font-size: 12px; opacity: 0.7;">Change since your first test: ${overallChange >= 0 ? '+' : ''}${overallChange.toFixed(1)}%</span>`;
}

// =====================================
// Main Chart
// =====================================
function renderChart(tests) {
    const canvas = document.getElementById("chart");
    if (!canvas) return;
    if (chart) chart.destroy();
    if (!tests.length) return;

    chart = new Chart(canvas, {
        type: "line",
        data: {
            labels: tests.map(test => test.date),
            datasets: [{
                label: "Score %",
                data: tests.map(test => (test.score / test.total) * 100),
                borderColor: "#60a5fa",
                tension: 0.4
            }]
        }
    });
}

function renderSubjectCharts(tests) {
    const container = document.getElementById("subjectCharts");
    if (!container || !Array.isArray(tests)) return;

    container.innerHTML = "";

    if (tests.length === 0) {
        container.innerHTML = "<p style='padding:15px; opacity:0.6;'>Add a test score to see your results by subject.</p>";
        return;
    }

    // ✅ FIXED: Normalize malformed dates before passing values down to Chart.js!
    const normalizedTests = tests.map(t => {
        let cleanDate = t.date;
        // Transform loose numeric Excel-style time stamps to readable dates
        if (typeof t.date === 'number' || !isNaN(t.date)) {
            cleanDate = new Date(t.date).toLocaleDateString() || "Recent Evaluation";
        } else if (t.date === "Today") {
            cleanDate = new Date().toLocaleDateString();
        }
        return {
            subject: t.subject || "Other",
            score: Number(t.score) || 0,
            total: Number(t.total) || 10,
            date: cleanDate
        };
    });

    // Grouping routines now parse correctly using clean dataset values
    const map = {};
    normalizedTests.forEach(t => {
        if (!map[t.subject]) map[t.subject] = [];
        map[t.subject].push(t);
    });

    let bestSubjects = [];
    let worstSubjects = [];
    let bestAvg = 0;
    let worstAvg = 100;

    for (const subject in map) {
        const avg = map[subject].reduce((s, t) => s + (t.score / t.total * 100), 0) / map[subject].length;
        if (avg > bestAvg) { bestAvg = avg; bestSubjects = [subject]; }
        else if (avg === bestAvg) { bestSubjects.push(subject); }
        if (avg < worstAvg) { worstAvg = avg; worstSubjects = [subject]; }
        else if (avg === worstAvg) { worstSubjects.push(subject); }
    }

    const subjectColors = ["#60a5fa","#22c55e","#facc15","#ef4444","#a78bfa","#f472b6","#34d399","#fb923c"];
    let index = 0;

    for (const subject in map) {
        let color = subjectColors[index % subjectColors.length];
        index++;
        if (bestSubjects.includes(subject)) color = "#22c55e";
        else if (worstSubjects.includes(subject)) color = "#ef4444";

        const canvas = document.createElement("canvas");
        canvas.style.marginBottom = "25px";
        container.appendChild(canvas);

        new Chart(canvas, {
            type: "line",
            data: {
                labels: map[subject].map(t => t.date),
                datasets: [{
                    label: subject + " (%)",
                    data: map[subject].map(t => (t.score / t.total) * 100),
                    borderColor: color,
                    backgroundColor: color + "33",
                    fill: true,
                    borderWidth: bestSubjects.includes(subject) ? 4 : 2,
                    pointRadius: bestSubjects.includes(subject) ? 6 : 4,
                    tension: 0.4
                }]
            },
            options: { scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }
}

function renderSubjectRanking(tests) {
    const container = document.getElementById("subjectRanking");
    if (!container) return;
    container.innerHTML = "";
    const map = {};

    tests.forEach(test => {
        if (!map[test.subject]) { map[test.subject] = { score: 0, total: 0 }; }
        map[test.subject].score += test.score;
        map[test.subject].total += test.total;
    });

    const subjects = Object.entries(map).map(([name, data]) => {
        return { subject: name, average: (data.score / data.total) * 100 };
    }).sort((a, b) => b.average - a.average);

    subjects.forEach((subject, index) => {
        container.innerHTML += `
            <div class="ranking-item">
                <span>#${index + 1} ${subject.subject}</span>
                <span>${subject.average.toFixed(1)}%</span>
            </div>
        `;
    });
}

async function loadAnalytics() {
    const tests = await getTests();
    renderStats(tests);
    renderOverviewExtras(tests);
    renderProfileStats(tests);
    renderInsight(tests);
    renderChart(tests);
    renderSubjectCharts(tests);
    renderSubjectRanking(tests);
}
