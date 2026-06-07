// Notifies the extension when SPA navigation changes the profile URL.
(function () {
  function normalizedHref() {
    return window.location.href.split("?")[0].split("#")[0];
  }

  var lastHref = normalizedHref();
  var debounceTimer = null;
  var pollTimer = null;
  var stopped = false;

  var pushState = history.pushState;
  var replaceState = history.replaceState;

  function isExtensionContextValid() {
    try {
      return typeof chrome !== "undefined" && !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function stopMonitoring() {
    if (stopped) return;
    stopped = true;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    history.pushState = pushState;
    history.replaceState = replaceState;
  }

  function notify() {
    if (stopped) return;
    if (!isExtensionContextValid()) {
      stopMonitoring();
      return;
    }

    var href = normalizedHref();
    if (href === lastHref) return;
    lastHref = href;

    try {
      chrome.runtime
        .sendMessage({ action: "pageUrlChanged", tabUrl: window.location.href })
        .catch(function () {});
    } catch {
      stopMonitoring();
    }
  }

  function scheduleNotify() {
    if (stopped) return;
    if (!isExtensionContextValid()) {
      stopMonitoring();
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(notify, 400);
  }

  history.pushState = function () {
    var result = pushState.apply(this, arguments);
    scheduleNotify();
    return result;
  };

  history.replaceState = function () {
    var result = replaceState.apply(this, arguments);
    scheduleNotify();
    return result;
  };

  window.addEventListener("popstate", scheduleNotify);
  window.addEventListener("hashchange", scheduleNotify);

  // Fallback for frameworks that mutate location without history events.
  pollTimer = setInterval(scheduleNotify, 1500);
})();
