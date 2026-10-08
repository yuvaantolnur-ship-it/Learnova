(function () {
  const config = window.SCORELYTICS_RUNTIME_CONFIG || {};
  const cloudMode = config.authMode === "supabase";
  const apiBaseUrl = (config.apiBaseUrl || window.location.origin).replace(/\/+$/, "");
  const nativeFetch = window.fetch.bind(window);

  function getTargetUrl(input) {
    const inputUrl = typeof input === "string" ? input : input.url;
    const target = new URL(inputUrl, window.location.href);
    if (cloudMode && target.origin === window.location.origin) {
      return new URL(`${apiBaseUrl}${target.pathname}${target.search}${target.hash}`);
    }
    if (cloudMode && target.origin === "http://localhost:8000") {
      return new URL(`${apiBaseUrl}${target.pathname}${target.search}${target.hash}`);
    }
    return target;
  }

  function addAccessToken(headers, url) {
    if (!cloudMode || url.origin !== new URL(apiBaseUrl).origin) return;
    if (url.pathname === "/login" || url.pathname === "/signup" || url.pathname === "/auth/refresh") return;
    const token = localStorage.getItem("scorelytics_access_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  async function refreshAccessToken() {
    const refreshToken = localStorage.getItem("scorelytics_refresh_token");
    if (!refreshToken) return false;
    try {
      const response = await nativeFetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!response.ok) return false;
      const session = await response.json();
      if (!session.access_token || !session.refresh_token) return false;
      localStorage.setItem("scorelytics_access_token", session.access_token);
      localStorage.setItem("scorelytics_refresh_token", session.refresh_token);
      return true;
    } catch (error) {
      console.error("Could not refresh the Learnova sign-in:", error);
      return false;
    }
  }

  window.fetch = async function (input, init = {}) {
    const url = getTargetUrl(input);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, name) => headers.set(name, value));
    addAccessToken(headers, url);

    const response = await nativeFetch(url.href, { ...init, headers });
    if (
      cloudMode &&
      response.status === 401 &&
      url.origin === new URL(apiBaseUrl).origin &&
      url.pathname !== "/login" &&
      url.pathname !== "/signup" &&
      url.pathname !== "/auth/refresh" &&
      await refreshAccessToken()
    ) {
      headers.set("Authorization", `Bearer ${localStorage.getItem("scorelytics_access_token")}`);
      return nativeFetch(url.href, { ...init, headers });
    }
    return response;
  };
})();
