(function () {
  const fileInput = document.getElementById("legacyFile");
  const accountSelect = document.getElementById("legacyAccount");
  const importButton = document.getElementById("importButton");
  const status = document.getElementById("importStatus");
  let legacyUsers = [];

  if (window.SCORELYTICS_RUNTIME_CONFIG?.authMode !== "supabase") {
    status.textContent = "This feature is available in the online version of Learnova.";
    return;
  }
  if (!localStorage.getItem("scorelytics_access_token")) {
    window.location.replace("/login");
    return;
  }

  fileInput.addEventListener("change", async () => {
    accountSelect.replaceChildren(new Option("Loading accounts…", ""));
    accountSelect.disabled = true;
    importButton.disabled = true;
    legacyUsers = [];

    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      status.textContent = "That file is too large. Choose a smaller backup file.";
      return;
    }

    try {
      const database = JSON.parse(await file.text());
      if (!database || !Array.isArray(database.users)) {
        throw new Error("The file does not contain a users array.");
      }
      legacyUsers = database.users.filter(user =>
        user &&
        typeof user.username === "string" &&
        user.username.trim() &&
        Array.isArray(user.tests)
      );
      accountSelect.replaceChildren(new Option("Choose your old account", ""));
      for (const user of legacyUsers) {
        accountSelect.add(new Option(user.username, user.username));
      }
      accountSelect.disabled = legacyUsers.length === 0;
      importButton.disabled = legacyUsers.length === 0;
      status.textContent = legacyUsers.length
        ? `${legacyUsers.length} account(s) found. Choose your own account.`
        : "We couldn’t find any test scores in that file.";
    } catch (error) {
      console.error("Could not read the backup file:", error);
      accountSelect.replaceChildren(new Option("Could not read this file", ""));
      status.textContent = "We couldn’t open that file. Choose a Learnova backup and try again.";
    }
  });

  accountSelect.addEventListener("change", () => {
    importButton.disabled = !accountSelect.value;
  });

  importButton.addEventListener("click", async () => {
    const selectedUser = legacyUsers.find(user => user.username === accountSelect.value);
    if (!selectedUser) {
      status.textContent = "Choose your account first.";
      return;
    }

    const tests = selectedUser.tests.map(test => ({
      subject: test.subject,
      score: test.score,
      total: test.total,
      date: test.date
    }));
    const coordinates = selectedUser.school_coordinates;
    const location = selectedUser.region &&
      selectedUser.school_name &&
      coordinates &&
      Number.isFinite(Number(coordinates.lat)) &&
      Number.isFinite(Number(coordinates.lng))
      ? {
          region: selectedUser.region,
          school_name: selectedUser.school_name,
          latitude: Number(coordinates.lat),
          longitude: Number(coordinates.lng)
        }
      : null;

    importButton.disabled = true;
    status.textContent = "Adding your scores…";
    try {
      const response = await fetch("/api/import-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legacyUsername: selectedUser.username,
          tests,
          location
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || `Import failed with HTTP ${response.status}.`);
      }
      status.textContent = `Your scores${location ? " and school" : ""} were added.`;
    } catch (error) {
      console.error("Could not add the backup:", error);
      status.textContent = "We couldn’t add your backup. Please try again.";
      importButton.disabled = false;
    }
  });
})();
