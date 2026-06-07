// content-scripts/cvlibrary.js — legacy fallback; primary extraction uses page-extractors via executeScript.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchCandidate") {
    sendResponse({ candidate: extractCVLibraryData() });
  }
  return true;
});

function extractCVLibraryData() {
  try {
    function trim(value) {
      return (value || "").replace(/\s+/g, " ").trim();
    }

    function valueFromRow(labelEl) {
      const next = labelEl.nextElementSibling;
      if (next) {
        const text = trim(next.textContent);
        if (text && text.length < 500) return text;
      }
      const parent = labelEl.parentElement;
      if (parent) {
        const combined = trim(parent.textContent);
        const labelText = trim(labelEl.textContent);
        if (combined.startsWith(labelText)) {
          return trim(combined.slice(labelText.length).replace(/^[:–—-]\s*/, ""));
        }
      }
      return "";
    }

    function findLabelValue(labels) {
      for (const el of document.querySelectorAll("dt, th, label, span, p, div, li, strong, b")) {
        const text = trim(el.textContent);
        if (!text || text.length > 80) continue;
        for (const label of labels) {
          if (new RegExp("^" + label + "\\s*:?\\s*$", "i").test(text)) {
            const value = valueFromRow(el);
            if (value) return value;
          }
        }
      }
      return "";
    }

    const nameEl =
      document.querySelector(".candidate-name, h1.name, h1, [data-testid='candidate-name']") ||
      document.querySelector("main h1, h2");
    const fullName = trim(nameEl?.textContent);
    const parts = fullName.split(" ").filter(Boolean);

    function findViewCvValue(labels) {
      const pattern = new RegExp("^(" + labels.join("|") + ")\\s*:?\\s*$", "i");
      for (const row of document.querySelectorAll(".vcvdp-div")) {
        const left = row.querySelector(".vcvdp-left, .vcvdj-left");
        const right = row.querySelector(".vcvdp-right, .vcvdj-right");
        if (!left || !right || right.querySelector(".not-available")) continue;
        if (!pattern.test(trim(left.textContent))) continue;
        const mail = right.querySelector("a[href^='mailto:']");
        if (mail && mail.href) {
          try {
            return decodeURIComponent(mail.href.replace(/^mailto:/i, "").split("?")[0]);
          } catch (e) {
            return mail.href.replace(/^mailto:/i, "").split("?")[0];
          }
        }
        const tel = right.querySelector("a[href^='tel:']");
        if (tel && tel.href) return tel.href.replace(/^tel:/i, "");
        const text = trim(right.textContent);
        if (text && !/^n\/a$/i.test(text)) return text;
      }
      return "";
    }

    const emailLink = document.querySelector(
      ".cv-candidate-details a[href^='mailto:'], a[href^='mailto:']"
    );
    const phoneFromRow = findViewCvValue(["Main Phone", "Mobile", "Telephone", "Phone", "Tel"]);
    const phoneLink = document.querySelector("a[href^='tel:']");

    const headshotEl =
      document.querySelector(
        ".candidate-photo img, .profile-image img, img[class*='avatar'], img[class*='photo']"
      ) || document.querySelector('meta[property="og:image"]');

    const headshotUrl =
      headshotEl instanceof HTMLImageElement
        ? headshotEl.src
        : headshotEl?.getAttribute("content") || "";

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email:
        findViewCvValue(["Email", "E-mail"]) ||
        trim(emailLink?.textContent) ||
        (function () {
          if (!emailLink?.href) return "";
          try {
            return decodeURIComponent(emailLink.href.replace(/^mailto:/i, "").split("?")[0]);
          } catch (e) {
            return emailLink.href.replace(/^mailto:/i, "").split("?")[0];
          }
        })() ||
        findLabelValue(["Email", "E-mail"]) ||
        "",
      phone:
        phoneFromRow ||
        trim(phoneLink?.textContent) ||
        phoneLink?.href?.replace(/^tel:/i, "") ||
        findLabelValue(["Main Phone", "Telephone", "Phone", "Mobile"]) ||
        "",
      jobTitle:
        findLabelValue(["Desired job title", "Current job title", "Job title"]) ||
        trim(
          document.querySelector("[class*='job-title'], [class*='desired-role'], .headline")
            ?.textContent
        ) ||
        "",
      location:
        findLabelValue(["Town", "City", "Location", "County"]) ||
        trim(document.querySelector("[class*='location'], [data-field='location']")?.textContent) ||
        "",
      summary:
        findLabelValue(["Personal statement", "Summary", "Profile"]) ||
        trim(
          document.querySelector("[class*='summary'], [class*='about'], [class*='profile-summary']")
            ?.textContent
        ) ||
        "",
      experience: trim(
        document.querySelector("[class*='experience'], [class*='employment'], [class*='work-history']")
          ?.textContent
      ).slice(0, 8000),
      headshotUrl: headshotUrl.startsWith("http") ? headshotUrl : "",
      cvUrl: (function () {
        const link =
          document.querySelector(
            "a[href*='cvdownload'], a[href*='/cv/'], a[href*='.pdf'], a[href*='cvview']"
          )?.href || "";
        if (link) return link;
        const match =
          window.location.href.match(/cv-library\.co\.uk\/candidate\/(\d+)/i) ||
          window.location.href.match(/cv-library\.co\.uk\/(?:cvview|recruiter\/candidate)\/(\d+)/i);
        if (match) {
          return window.location.origin + "/cgi-bin/cvdownload.cgi?cand_id=" + match[1];
        }
        return "";
      })(),
      profileUrl: window.location.href.split("?")[0],
    };
  } catch (e) {
    return null;
  }
}
