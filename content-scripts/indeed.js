// content-scripts/indeed.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchCandidate") { sendResponse({ candidate: extractIndeedData() }); }
  return true;
});
function extractIndeedData() {
  try {
    const nameEl = document.querySelector("[class*='applicant-name'], [class*='candidate-name'], h1");
    const fullName = nameEl?.innerText?.trim() || "";
    const parts = fullName.split(" ");
    const firstName = parts[0] || ""; const lastName = parts.slice(1).join(" ") || "";
    const emailEl = document.querySelector("a[href^='mailto:'], [class*='email'], [data-testid*='email']");
    const email = emailEl?.innerText?.trim() || emailEl?.href?.replace("mailto:", "").trim() || "";
    const phoneEl = document.querySelector("a[href^='tel:'], [class*='phone'], [data-testid*='phone']");
    const phone = phoneEl?.innerText?.trim() || phoneEl?.href?.replace("tel:", "").trim() || "";
    const jobTitle = document.querySelector("[class*='headline'], [class*='job-title'], [class*='desiredTitle']")?.innerText?.trim() || "";
    const location = document.querySelector("[class*='location'], [data-testid*='location']")?.innerText?.trim() || "";
    const cvUrl = document.querySelector("a[href*='resume'], a[href*='.pdf']")?.href || window.location.href;
    return { firstName, lastName, email, phone, jobTitle, location, cvUrl, profileUrl: window.location.href };
  } catch(e) { return null; }
}