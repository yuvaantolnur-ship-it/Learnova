// ==========================================================================
// STUDYBOT.JS - Learnova PySide6 NATIVE AI INTEGRATION
// ==========================================================================
let chatMsgWindow = null; 
let chatSessions = [];
let activeChatSessionId = null;
let cloudChatBusy = false;
const cloudChatEnabled = window.SCORELYTICS_RUNTIME_CONFIG?.authMode === "supabase";

function syncChatWindowDOM() {
    chatMsgWindow = document.getElementById("chatMessages") || 
                    document.getElementById("chatmessages") ||
                    document.querySelector(".chatMessages");
}

function saveChatToLocal() {
    if (!chatMsgWindow) syncChatWindowDOM();
    if (chatMsgWindow) {
        const currentUser = localStorage.getItem("user") || "Yuvaan Tolnur";
        localStorage.setItem(`scorelytics_chat_${currentUser}`, chatMsgWindow.innerHTML);
    }
}

function loadChatHistory() {
    if (!chatMsgWindow) syncChatWindowDOM();
    if (chatMsgWindow) {
        const currentUser = localStorage.getItem("user") || "Yuvaan Tolnur";
        const savedHTML = localStorage.getItem(`scorelytics_chat_${currentUser}`);
        
        if (savedHTML) {
            chatMsgWindow.innerHTML = savedHTML;
            chatMsgWindow.scrollTop = chatMsgWindow.scrollHeight; 
        } else {
            chatMsgWindow.innerHTML = `
                <div style="background: #161b26; border: 1px solid #242c3d; color: #a0aec0; padding: 12px 16px; border-radius: 8px; font-size: 13px; text-align: center;">
                    ✨ Welcome to Learnova StudyBot! Mention a subject to review performance or build a study calendar.
                </div>
            `;
        }
    }
}

function parseMarkdownToHTML(text) {
    if (!text) return "";
    let formattedText = text;
    formattedText = formattedText.replace(/\n/g, '<br>');
    formattedText = formattedText.replace(/###\s*(.*?)(?:<br>|\$)/g, '<h3 style="color: #60a5fa; margin: 10px 0 5px 0; font-size: 15px;">\$1</h3>');
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #ffffff;">\$1</strong>');
    formattedText = formattedText.replace(/\*(.*?)\*/g, '<em>\$1</em>');
    return formattedText;
}

// ✅ PYSIDE6 EXPRESS ROUTING CONFLICT SOLVER
window.sendMessage = async function() {
    if (cloudChatEnabled) {
        await sendCloudMessage();
        return;
    }

    const inputEl = document.getElementById("chatInput") || document.getElementById("studybot-input-field");
    if (!inputEl) return;
    
    const message = inputEl.value.trim();
    if (!message) return;

    if (!chatMsgWindow) syncChatWindowDOM();
    if (!chatMsgWindow) return;
    
    // 1. Render User speech bubbles cleanly onto UI layout grids
    chatMsgWindow.innerHTML += `
        <div style="background: #2563eb; color: #ffffff; padding: 12px 18px; margin: 4px 0; border-radius: 12px 12px 2px 12px; max-width: 75%; align-self: flex-end; font-size: 14px; line-height: 1.5; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);">
            ${message}
        </div>
    `;
    
    inputEl.value = ""; 
    chatMsgWindow.scrollTop = chatMsgWindow.scrollHeight;
    saveChatToLocal(); 

    try {
        const currentUser = localStorage.getItem("user") || "Yuvaan Tolnur";
        // Grab local test lists securely from runtime global variables or local API channels
        const testsPayload = typeof allTests !== 'undefined' ? allTests : [];

        // 2. Transmit prompt requirements down to local Express server endpoint port routers
        const response = await fetch("http://localhost:8000/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: currentUser,
                message: message,
                tests: testsPayload
            })
        });

        const data = await response.json();
        const cleanHTML = parseMarkdownToHTML(data.reply);

        // 3. Render the output text layout block cleanly onto the screen display
        chatMsgWindow.innerHTML += `
            <div style="background: #161b26; border: 1px solid #242c3d; color: #e2e8f0; padding: 16px 20px; margin: 4px 0; border-radius: 12px 12px 12px 2px; max-width: 85%; align-self: flex-start; font-size: 14px; line-height: 1.6; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);">
                <strong style="color: #60a5fa; display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
                    ✨ StudyBot AI Insight
                </strong>
                ${cleanHTML}
            </div>
        `;
        chatMsgWindow.scrollTop = chatMsgWindow.scrollHeight;
        saveChatToLocal(); 

    } catch (err) {
        console.error(err);
        chatMsgWindow.innerHTML += `
            <div style="color: #ef4444; font-size: 13px; align-self: flex-start; margin: 4px 0;">
                ⚠️ StudyBot is having trouble right now. Please try again in a moment.
            </div>
        `;
    }
}

function showCloudChatMessage(role, content) {
    if (!chatMsgWindow) syncChatWindowDOM();
    if (!chatMsgWindow) return;

    const message = document.createElement("div");
    message.textContent = content;
    message.style.cssText = role === "user"
        ? "background:#2563eb;color:#fff;padding:12px 18px;margin:4px 0;border-radius:12px 12px 2px 12px;max-width:75%;align-self:flex-end;font-size:14px;line-height:1.5;white-space:pre-wrap;"
        : "background:#161b26;border:1px solid #242c3d;color:#e2e8f0;padding:16px 20px;margin:4px 0;border-radius:12px 12px 12px 2px;max-width:85%;align-self:flex-start;font-size:14px;line-height:1.6;white-space:pre-wrap;";
    chatMsgWindow.appendChild(message);
    chatMsgWindow.scrollTop = chatMsgWindow.scrollHeight;
}

function showCloudChatWelcome() {
    if (!chatMsgWindow) syncChatWindowDOM();
    if (!chatMsgWindow) return;
    chatMsgWindow.replaceChildren();
    showCloudChatMessage(
        "assistant",
        "Welcome to StudyBot. Ask about your schoolwork, study strategies, or a study schedule. Start a new chat for a different topic."
    );
}

function showCloudChatError(message) {
    showCloudChatMessage("assistant", "StudyBot is having trouble right now. Please try again in a moment.");
}

async function readCloudResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || data.reply || `Request failed with HTTP ${response.status}.`);
    }
    return data;
}

function updateChatSessionControls() {
    const select = document.getElementById("chatSessionSelect");
    const deleteButton = document.getElementById("deleteChatBtn");
    const newButton = document.getElementById("newChatBtn");
    if (!select || !deleteButton) return;

    select.disabled = cloudChatBusy;
    if (newButton) newButton.disabled = cloudChatBusy;
    select.replaceChildren(new Option("New chat", ""));
    for (const session of chatSessions) {
        select.add(new Option(session.title, session.id));
    }
    select.value = activeChatSessionId || "";
    deleteButton.disabled = !activeChatSessionId || cloudChatBusy;
}

async function loadCloudChatSessions(preferredSessionId) {
    const response = await fetch("/api/chat-sessions");
    chatSessions = await readCloudResponse(response);

    const requestedSession = chatSessions.find(session => session.id === preferredSessionId);
    activeChatSessionId = requestedSession
        ? requestedSession.id
        : chatSessions[0]?.id || null;
    updateChatSessionControls();

    if (activeChatSessionId) {
        await loadCloudChatSession(activeChatSessionId);
    } else {
        showCloudChatWelcome();
    }
}

async function loadCloudChatSession(sessionId) {
    const response = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`);
    const messages = await readCloudResponse(response);
    chatMsgWindow.replaceChildren();
    if (!messages.length) {
        showCloudChatWelcome();
        return;
    }
    for (const message of messages) {
        showCloudChatMessage(message.role, message.content);
    }
}

function startNewCloudChat() {
    activeChatSessionId = null;
    updateChatSessionControls();
    showCloudChatWelcome();
    document.getElementById("chatInput")?.focus();
}

async function deleteCloudChat() {
    if (!activeChatSessionId || cloudChatBusy) return;
    if (!window.confirm("Delete this chat and its saved messages from your Learnova account?")) return;

    const sessionId = activeChatSessionId;
    const button = document.getElementById("deleteChatBtn");
    if (button) button.disabled = true;
    try {
        const response = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}`, {
            method: "DELETE"
        });
        await readCloudResponse(response);
        await loadCloudChatSessions();
    } catch (error) {
        console.error("Could not delete the saved StudyBot chat:", error);
        showCloudChatError(error.message);
        updateChatSessionControls();
    }
}

async function sendCloudMessage() {
    const input = document.getElementById("chatInput");
    const sendButton = document.getElementById("sendChatBtn");
    if (!input || !input.value.trim() || cloudChatBusy) return;

    const message = input.value.trim();
    cloudChatBusy = true;
    if (sendButton) sendButton.disabled = true;
    input.disabled = true;
    updateChatSessionControls();

    try {
        if (!activeChatSessionId) {
            const createResponse = await fetch("/api/chat-sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: message.slice(0, 80) || "New chat" })
            });
            const session = await readCloudResponse(createResponse);
            activeChatSessionId = session.id;
            chatSessions.unshift(session);
            chatSessions = chatSessions.slice(0, 50);
            updateChatSessionControls();
        }

        input.value = "";
        showCloudChatMessage("user", message);
        const sessionId = activeChatSessionId;
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, message })
        });
        const result = await readCloudResponse(response);
        showCloudChatMessage("assistant", result.reply);

        const selectedOption = document.getElementById("chatSessionSelect")?.selectedOptions[0];
        if (selectedOption && selectedOption.textContent === "New chat") {
            selectedOption.textContent = message.slice(0, 80);
        }
        const savedSession = chatSessions.find(session => session.id === activeChatSessionId);
        if (savedSession && savedSession.title === "New chat") {
            savedSession.title = message.slice(0, 80);
        }
    } catch (error) {
        console.error("StudyBot chat request failed:", error);
        showCloudChatError(error.message);
    } finally {
        cloudChatBusy = false;
        input.disabled = false;
        if (sendButton) sendButton.disabled = false;
        updateChatSessionControls();
    }
}

function bindChatEvents() {
    const sendBtn = document.getElementById("sendChatBtn") || document.getElementById("transmitChatBtn");
    if (sendBtn) {
        sendBtn.onclick = window.sendMessage;
    }

    const chatInput = document.getElementById("chatInput") || document.getElementById("studybot-input-field");
    if (chatInput) {
        chatInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") window.sendMessage();
        });
    }

    if (cloudChatEnabled) {
        const controls = document.getElementById("chatSessionControls");
        if (controls) controls.style.display = "flex";
        document.getElementById("newChatBtn")?.addEventListener("click", startNewCloudChat);
        document.getElementById("deleteChatBtn")?.addEventListener("click", deleteCloudChat);
        document.getElementById("chatSessionSelect")?.addEventListener("change", async event => {
            activeChatSessionId = event.target.value || null;
            updateChatSessionControls();
            try {
                if (activeChatSessionId) {
                    await loadCloudChatSession(activeChatSessionId);
                } else {
                    showCloudChatWelcome();
                }
            } catch (error) {
                console.error("Could not load the saved StudyBot chat:", error);
                showCloudChatError(error.message);
            }
        });
        loadCloudChatSessions().catch(error => {
            console.error("Could not load saved StudyBot chats:", error);
            showCloudChatError(error.message);
        });
    }
}

// Hook core components initialization safely onto page ready parameters
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        syncChatWindowDOM();
        if (!cloudChatEnabled) loadChatHistory();
        bindChatEvents();
    });
} else {
    syncChatWindowDOM();
    if (!cloudChatEnabled) loadChatHistory();
    bindChatEvents();
}
