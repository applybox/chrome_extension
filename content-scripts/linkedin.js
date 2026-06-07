// content-scripts/linkedin.js — fallback listener; primary extraction uses injected page-extractors
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "fetchCandidate") {
    sendResponse({ candidate: extractLinkedInData() });
  }
  return true;
});

function extractLinkedInData() {
  function trim(v) {
    return (v || "").replace(/\s+/g, " ").trim();
  }

  function phoneFromText(text) {
    var match = (text || "").match(/(\+?\d[\d\s().-]{8,}\d)/);
    return match ? trim(match[1]) : "";
  }

  function addressFromText(text) {
    var cleaned = trim((text || "").replace(/^address\s*/i, ""));
    if (cleaned.length < 4 || cleaned.length > 220) return "";
    return cleaned;
  }

  function nameFromTitle() {
    var m = (document.title || "").match(/^(.+?)\s*[\|\-–—]\s*LinkedIn/i);
    return m ? trim(m[1]) : "";
  }

  function isConnectionBadge(text) {
    return (
      /^[·•]\s*$/.test(text) ||
      /^[·•]\s*\d+(?:st|nd|rd|th)?$/i.test(text) ||
      /^[·•]\s*\d+\+?$/.test(text)
    );
  }

  function isValidHeadline(text, profileName) {
    if (!text || text.length < 2 || text.length > 320) return false;
    if (text === profileName) return false;
    if (isConnectionBadge(text)) return false;
    if (/contact info/i.test(text)) return false;
    if (/\d+\+?\s+connections?|linkedin member/i.test(text)) return false;
    return true;
  }

  function isValidLocation(text) {
    if (!text || text.length < 4 || text.length > 120) return false;
    if (isConnectionBadge(text)) return false;
    if (/contact info/i.test(text)) return false;
    if (text.indexOf(",") >= 0) return true;
    if (/\b(united kingdom|england|scotland|wales|area|region)\b/i.test(text)) return true;
    return false;
  }

  function findTopCardDetails(card, profileName, nameEl) {
    if (!card || !nameEl) return { headline: "", location: "" };

    var nameRect = nameEl.getBoundingClientRect();
    var items = [];

    card.querySelectorAll("p").forEach(function (p) {
      if (p.closest("#about, #experience, button, nav, header")) return;
      if (p.querySelector("a[href*='contact-info'], a[href*='overlay/contact-info']")) return;
      if (nameEl.contains(p)) return;

      var rect = p.getBoundingClientRect();
      if (rect.top < nameRect.bottom - 8) return;
      if (rect.top > nameRect.bottom + 340) return;

      var text = trim(p.textContent);
      if (text) items.push({ text: text, top: rect.top });
    });

    items.sort(function (a, b) {
      return a.top - b.top;
    });

    var headline = "";
    var location = "";
    items.forEach(function (item) {
      if (isConnectionBadge(item.text)) return;
      if (!headline && isValidHeadline(item.text, profileName)) {
        headline = item.text;
        return;
      }
      if (headline && !location && isValidLocation(item.text)) {
        location = item.text;
      }
    });

    return { headline: headline, location: location };
  }

  function phoneFromSduiRow(row) {
    var paragraphs = row.querySelectorAll("p");
    for (var i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Phone") continue;
      var valueP = paragraphs[i + 1];
      if (!valueP) continue;
      var span = valueP.querySelector("span");
      if (span) {
        var spanText = trim(span.textContent);
        if (spanText && /\d/.test(spanText)) return phoneFromText(spanText) || spanText;
      }
      var fromText = phoneFromText(valueP.textContent || "");
      if (fromText) return fromText;
    }
    return "";
  }

  function findPhoneFromSdui() {
    var selectors = [
      'svg[id="phone-handset-small"]',
      'svg[id="phone-handset-medium"]',
      'svg[id^="phone-handset"]',
    ];
    for (var s = 0; s < selectors.length; s++) {
      var icons = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < icons.length; i++) {
        var row = icons[i].closest("[componentkey]") || icons[i].parentElement;
        if (!row) continue;
        var found = phoneFromSduiRow(row);
        if (found) return found;
      }
    }
    return "";
  }

  var card =
    document.querySelector("[data-view-name='profile-card']") ||
    document.querySelector("main section") ||
    document.querySelector("main");

  var nameEl =
    (card && card.querySelector("a[href*='/in/'] h2")) ||
    (card && card.querySelector("a[href*='/in/'] h1")) ||
    document.querySelector("a[href*='/in/'] h2") ||
    document.querySelector("a[href*='/in/'] h1") ||
    document.querySelector("h2") ||
    document.querySelector("h1");

  var fullName = trim(nameEl && nameEl.textContent) || nameFromTitle();
  var parts = fullName.split(" ").filter(Boolean);
  var profileName = parts.join(" ");

  var topCard = findTopCardDetails(card, profileName, nameEl);
  var jobTitle = topCard.headline;
  var location = topCard.location;

  var profileUrl = window.location.href.split("?")[0].split("#")[0];
  var email = "";
  var phone = findPhoneFromSdui();
  var address = "";

  var mail = document.querySelector("a[href^='mailto:']");
  if (mail) email = mail.href.replace(/^mailto:/i, "").split("?")[0];

  if (!phone) {
    var tel = document.querySelector("a[href^='tel:']");
    if (tel) phone = tel.href.replace(/^tel:/i, "");
  }

  var contactRoots = [
    document.querySelector('[componentkey*="ContactInfoDetailSection"]'),
    document.querySelector("#contact-info"),
    document.querySelector("section.pv-contact-info"),
    document.querySelector("[data-view-name='profile-contact-info']"),
    document.querySelector(".artdeco-modal__content"),
  ].filter(Boolean);

  contactRoots.forEach(function (root) {
    if (!email) {
      var mailInRoot = root.querySelector("a[href^='mailto:']");
      if (mailInRoot) email = mailInRoot.href.replace(/^mailto:/i, "").split("?")[0];
    }
    if (!phone) {
      var sduiPhone = phoneFromSduiRow(root);
      if (sduiPhone) phone = sduiPhone;
      if (!phone) {
        var telInRoot = root.querySelector("a[href^='tel:']");
        if (telInRoot) phone = telInRoot.href.replace(/^tel:/i, "");
      }
      if (!phone) phone = phoneFromText(root.textContent || "");
    }
    if (!address) {
      var icons = root.querySelectorAll(
        '[data-test-icon="location-marker-medium"], [data-test-icon="location-marker-small"]'
      );
      icons.forEach(function (icon) {
        if (address) return;
        var container = icon.closest("li") || icon.closest("div");
        if (!container) return;
        var value = addressFromText(container.textContent || "");
        if (value) address = value;
      });
    }
  });

  if (address && (!location || address.length >= location.length)) {
    location = address;
  }

  function cleanSummaryText(raw) {
    return trim(raw)
      .replace(/^about\s*/i, "")
      .replace(/\s*…\s*more\s*$/i, "")
      .replace(/\s*\.\.\.\s*more\s*$/i, "")
      .replace(/\s*see more\s*$/i, "");
  }

  function findSummary() {
    var h2s = document.querySelectorAll("h2");
    for (var i = 0; i < h2s.length; i++) {
      if (trim(h2s[i].textContent) !== "About") continue;
      if (h2s[i].closest("header, nav")) continue;

      var root = h2s[i].parentElement;
      while (root && root !== document.body) {
        var expandable = root.querySelector('[data-testid="expandable-text-box"]');
        if (expandable) {
          var text = cleanSummaryText(expandable.textContent || "");
          if (text.length > 20 && text.length < 8000) return text;
        }
        root = root.parentElement;
      }
    }
    return "";
  }

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
    email: email,
    phone: phone,
    jobTitle: jobTitle,
    summary: findSummary(),
    location: location,
    profileUrl: profileUrl,
  };
}
