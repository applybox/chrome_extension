// content-scripts/vincere.js — legacy fallback; primary extraction uses page-extractors via executeScript.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchCandidate") {
    sendResponse({ candidate: extractVincereData() });
  }
  return true;
});

function extractVincereData() {
  try {
    function trim(value) {
      return (value || "").replace(/\s+/g, " ").trim();
    }

    const nameEl =
      document.querySelector("h1, [class*='candidate-name'], [class*='contact-name']") || null;
    const fullName = trim(nameEl?.textContent);
    const parts = fullName.split(" ").filter(Boolean);
    const emailEl = document.querySelector("a[href^='mailto:']");
    const phoneEl = document.querySelector("a[href^='tel:']");

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email: emailEl?.href?.replace(/^mailto:/i, "").split("?")[0] || trim(emailEl?.textContent),
      phone: phoneEl?.href?.replace(/^tel:/i, "") || trim(phoneEl?.textContent),
      jobTitle: trim(document.querySelector("[class*='job-title'], [class*='position']")?.textContent),
      location: trim(document.querySelector("[class*='location'], [class*='address']")?.textContent),
      profileUrl: window.location.href.split("?")[0].split("#")[0],
      migrationSource: "vincere",
      migrationNote: "Imported from previous CRM during migration",
    };
  } catch (e) {
    return null;
  }
}
