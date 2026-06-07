/**
 * Fetch LinkedIn email/phone/address via Voyager API using the user's session.
 * Injectable functions must be fully self-contained (no outer references).
 */

export interface LinkedInContact {
  email: string;
  phone: string;
  address: string;
}

const EMPTY_CONTACT: LinkedInContact = { email: "", phone: "", address: "" };

function formatAddressValue(addr: unknown): string {
  if (typeof addr === "string") return addr.trim();
  if (!addr || typeof addr !== "object") return "";

  const record = addr as Record<string, unknown>;
  const parts = [
    record.line1,
    record.line2,
    record.line3,
    record.city,
    record.geographicArea,
    record.postalCode,
    record.country,
    record.addressLocality,
    record.addressRegion,
    record.addressCountry,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return parts.join(", ");
}

function parsePhoneFromRecord(record: Record<string, unknown>): string {
  if (typeof record.number === "string" && record.number.trim()) {
    return record.number.trim();
  }

  if (record.phoneNumber && typeof record.phoneNumber === "object") {
    const nested = record.phoneNumber as Record<string, unknown>;
    if (typeof nested.number === "string" && nested.number.trim()) {
      return nested.number.trim();
    }
  }

  return "";
}

function parseContactPayload(data: unknown): LinkedInContact {
  let email = "";
  let phone = "";
  let address = "";

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }

    const record = obj as Record<string, unknown>;

    if (!email && typeof record.emailAddress === "string") email = record.emailAddress.trim();
    if (!email && typeof record.email === "string" && record.email.includes("@")) {
      email = record.email.trim();
    }

    if (Array.isArray(record.phoneNumbers)) {
      const phones = record.phoneNumbers as Array<Record<string, unknown>>;
      const preferred =
        phones.find((p) => p.type === "MOBILE" || p.phoneType === "MOBILE") ||
        phones.find((p) => p.type === "HOME" || p.phoneType === "HOME") ||
        phones[0];

      if (preferred && !phone) {
        phone = parsePhoneFromRecord(preferred);
      }
    }

    if (!phone && typeof record.phoneNumber === "string") phone = record.phoneNumber.trim();
    if (!phone) {
      const single = parsePhoneFromRecord(record);
      if (single) phone = single;
    }

    if (!address && typeof record.address === "string" && record.address.trim().length > 2) {
      address = record.address.trim();
    }
    if (!address && record.address) {
      const formatted = formatAddressValue(record.address);
      if (formatted) address = formatted;
    }
    if (!address && typeof record.fullAddress === "string") address = record.fullAddress.trim();
    if (!address && typeof record.geographicArea === "string") {
      address = record.geographicArea.trim();
    }

    Object.values(record).forEach(walk);
  }

  walk(data);
  return { email, phone, address };
}

/**
 * Read contact info from the open LinkedIn SDUI contact panel (2026 layout).
 * Phone: svg#phone-handset-small row → <p>Phone</p> + <p><span>number</span>(Mobile)</p>
 */
export function linkedInDomContactFetch(): LinkedInContact {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function extractPhoneFromText(text: string): string {
    const match = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
    return match ? trim(match[1]) : "";
  }

  function phoneFromRow(row: Element): string {
    const paragraphs = Array.from(row.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Phone") continue;

      const valueP = paragraphs[i + 1];
      if (!valueP) continue;

      const span = valueP.querySelector("span");
      if (span) {
        const spanText = trim(span.textContent || "");
        if (spanText && /\d/.test(spanText)) {
          return extractPhoneFromText(spanText) || spanText;
        }
      }

      const fromText = extractPhoneFromText(valueP.textContent || "");
      if (fromText) return fromText;
    }

    return "";
  }

  function emailFromRow(row: Element): string {
    const paragraphs = Array.from(row.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Email") continue;

      const valueP = paragraphs[i + 1];
      const mail = valueP?.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
      if (mail?.href) {
        return mail.href.replace(/^mailto:/i, "").split("?")[0];
      }
    }

    return "";
  }

  let email = "";
  let phone = "";
  let address = "";

  const contactSections = [
    ...document.querySelectorAll('[componentkey*="ContactInfoDetailSection"]'),
    document.querySelector("[data-view-name='profile-contact-info']"),
    document.querySelector("#contact-info"),
    document.querySelector(".artdeco-modal__content"),
    document.body,
  ].filter(Boolean) as Element[];

  for (const section of contactSections) {
    if (!email) {
      const mail = section.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
      if (mail?.href) email = mail.href.replace(/^mailto:/i, "").split("?")[0];
      if (!email) email = emailFromRow(section);
    }
  }

  const phoneIconSelectors = [
    'svg[id="phone-handset-small"]',
    'svg[id="phone-handset-medium"]',
    'svg[id^="phone-handset"]',
    '[data-test-icon="phone-handset-small"]',
    '[data-test-icon="phone-handset-medium"]',
  ];

  for (const selector of phoneIconSelectors) {
    if (phone) break;
    for (const icon of document.querySelectorAll(selector)) {
      const row = icon.closest("[componentkey]") || icon.parentElement;
      if (!row) continue;
      const found = phoneFromRow(row);
      if (found) {
        phone = found;
        break;
      }
    }
  }

  if (!phone) {
    for (const section of contactSections) {
      const found = phoneFromRow(section);
      if (found) {
        phone = found;
        break;
      }
    }
  }

  for (const section of contactSections) {
    if (address) break;
    const paragraphs = Array.from(section.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Address") continue;
      const value = trim(paragraphs[i + 1]?.textContent || "");
      if (value.length > 3 && value.length < 220) {
        address = value;
        break;
      }
    }
  }

  return { email, phone, address };
}

function domContactHasData(contact: LinkedInContact): boolean {
  return !!(contact.email || contact.phone || contact.address);
}

/**
 * Clicks LinkedIn "Contact info", waits for the SDUI panel, then reads contact fields.
 * Must be fully self-contained for chrome.scripting.executeScript (MAIN world).
 */
export async function linkedInAutoOpenContactAndFetch(): Promise<LinkedInContact> {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function extractPhoneFromText(text: string): string {
    const match = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
    return match ? trim(match[1]) : "";
  }

  function phoneFromRow(row: Element): string {
    const paragraphs = Array.from(row.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Phone") continue;

      const valueP = paragraphs[i + 1];
      if (!valueP) continue;

      const span = valueP.querySelector("span");
      if (span) {
        const spanText = trim(span.textContent || "");
        if (spanText && /\d/.test(spanText)) {
          return extractPhoneFromText(spanText) || spanText;
        }
      }

      const fromText = extractPhoneFromText(valueP.textContent || "");
      if (fromText) return fromText;
    }

    return "";
  }

  function emailFromRow(row: Element): string {
    const paragraphs = Array.from(row.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length; i++) {
      if (trim(paragraphs[i].textContent) !== "Email") continue;

      const valueP = paragraphs[i + 1];
      const mail = valueP?.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
      if (mail?.href) {
        return mail.href.replace(/^mailto:/i, "").split("?")[0];
      }
    }

    return "";
  }

  function parseDomContact(): LinkedInContact {
    let email = "";
    let phone = "";
    let address = "";

    const contactSections = [
      ...document.querySelectorAll('[componentkey*="ContactInfoDetailSection"]'),
      document.querySelector("[data-view-name='profile-contact-info']"),
      document.querySelector("#contact-info"),
      document.querySelector(".artdeco-modal__content"),
    ].filter(Boolean) as Element[];

    for (const section of contactSections) {
      if (!email) {
        const mail = section.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
        if (mail?.href) email = mail.href.replace(/^mailto:/i, "").split("?")[0];
        if (!email) email = emailFromRow(section);
      }
    }

    const phoneIconSelectors = [
      'svg[id="phone-handset-small"]',
      'svg[id="phone-handset-medium"]',
      'svg[id^="phone-handset"]',
      '[data-test-icon="phone-handset-small"]',
      '[data-test-icon="phone-handset-medium"]',
    ];

    for (const selector of phoneIconSelectors) {
      if (phone) break;
      for (const icon of document.querySelectorAll(selector)) {
        const row = icon.closest("[componentkey]") || icon.parentElement;
        if (!row) continue;
        const found = phoneFromRow(row);
        if (found) {
          phone = found;
          break;
        }
      }
    }

    if (!phone) {
      for (const section of contactSections) {
        const found = phoneFromRow(section);
        if (found) {
          phone = found;
          break;
        }
      }
    }

    for (const section of contactSections) {
      if (address) break;
      const paragraphs = Array.from(section.querySelectorAll("p"));
      for (let i = 0; i < paragraphs.length; i++) {
        if (trim(paragraphs[i].textContent) !== "Address") continue;
        const value = trim(paragraphs[i + 1]?.textContent || "");
        if (value.length > 3 && value.length < 220) {
          address = value;
          break;
        }
      }
    }

    return { email, phone, address };
  }

  function isContactPanelOpen(): boolean {
    if (document.querySelector('[componentkey*="ContactInfoDetailSection"]')) {
      return domContactHasData(parseDomContact());
    }

    return !!(
      document.querySelector("#contact-info a[href^='mailto:']") ||
      document.querySelector("#contact-info a[href^='tel:']") ||
      document.querySelector(".artdeco-modal__content a[href^='mailto:']")
    );
  }

  function findContactInfoTrigger(): HTMLElement | null {
    const selectors = [
      "a[href*='overlay/contact-info']",
      "a[href*='contact-info']",
    ];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (el.closest("header, nav, [role='navigation']")) continue;
        const text = trim(el.textContent || "");
        if (/contact info/i.test(text) || selector.includes("contact-info")) {
          return el as HTMLElement;
        }
      }
    }

    for (const el of document.querySelectorAll("a, button")) {
      if (el.closest("header, nav, [role='navigation']")) continue;
      const text = trim(el.textContent || "");
      const aria = trim(el.getAttribute("aria-label") || "");
      if (text === "Contact info" || aria.toLowerCase() === "contact info") {
        return el as HTMLElement;
      }
    }

    return null;
  }

  async function waitForContactPanel(maxMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (isContactPanelOpen()) return true;
      await sleep(250);
    }
    return isContactPanelOpen();
  }

  let contact = parseDomContact();
  if (domContactHasData(contact)) return contact;

  const trigger = findContactInfoTrigger();
  if (trigger) {
    trigger.click();
    await waitForContactPanel();
    contact = parseDomContact();
    if (domContactHasData(contact)) return contact;

    // LinkedIn SPA may need a second tick after overlay paint
    await sleep(600);
    contact = parseDomContact();
  }

  return contact;
}

export async function linkedInVoyagerContactFetch(): Promise<LinkedInContact> {
  const match = window.location.href.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return { ...EMPTY_CONTACT };

  const vanity = decodeURIComponent(match[1]);
  const csrf =
    document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1]?.replace(/"/g, "") || "";

  const paths = [
    `/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileContactInfo`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`https://www.linkedin.com${path}`, {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/vnd.linkedin.normalized+json+2.1",
          "csrf-token": csrf,
          "x-restli-protocol-version": "2.0.0",
          "x-li-lang": "en_US",
        },
      });
      if (!res.ok) continue;
      const contact = parseContactPayload(await res.json());
      if (contact.email || contact.phone || contact.address) return contact;
    } catch {
      /* try next */
    }
  }

  return { ...EMPTY_CONTACT };
}

function getVanityName(profileUrl: string): string | null {
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function mergeContacts(primary: LinkedInContact, secondary: LinkedInContact): LinkedInContact {
  return {
    email: primary.email || secondary.email,
    phone: primary.phone || secondary.phone,
    address: primary.address || secondary.address,
  };
}

export async function fetchLinkedInContactFromTab(
  tabId: number,
  tabUrl: string
): Promise<LinkedInContact> {
  if (!getVanityName(tabUrl)) return { ...EMPTY_CONTACT };

  let domContact = { ...EMPTY_CONTACT };

  // PRIMARY: auto-open Contact info panel, then read SDUI contact fields
  try {
    const [domResult] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: linkedInAutoOpenContactAndFetch,
    });
    domContact = (domResult?.result as LinkedInContact | undefined) ?? { ...EMPTY_CONTACT };
  } catch {
    /* fall through */
  }

  if (!domContactHasData(domContact)) {
    try {
      const [fallbackResult] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: linkedInDomContactFetch,
      });
      domContact = mergeContacts(
        domContact,
        (fallbackResult?.result as LinkedInContact | undefined) ?? { ...EMPTY_CONTACT }
      );
    } catch {
      /* fall through */
    }
  }

  let voyagerContact = { ...EMPTY_CONTACT };

  // SECONDARY: Voyager API
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: linkedInVoyagerContactFetch,
    });
    voyagerContact = (result?.result as LinkedInContact | undefined) ?? { ...EMPTY_CONTACT };
  } catch {
    /* fall through */
  }

  if (!voyagerContact.email && !voyagerContact.phone && !voyagerContact.address) {
    try {
      const vanity = getVanityName(tabUrl)!;
      const cookieMap = new Map<string, string>();
      for (const domain of ["linkedin.com", ".linkedin.com", "www.linkedin.com"]) {
        const list = await chrome.cookies.getAll({ domain });
        list.forEach((c) => cookieMap.set(c.name, c.value));
      }
      if (cookieMap.size) {
        const cookieHeader = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
        const csrfToken = (cookieMap.get("JSESSIONID") || "").replace(/"/g, "");
        const url = `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileContactInfo`;
        const response = await fetch(url, {
          headers: {
            accept: "application/vnd.linkedin.normalized+json+2.1",
            "csrf-token": csrfToken,
            "x-restli-protocol-version": "2.0.0",
            Cookie: cookieHeader,
          },
        });
        if (response.ok) {
          voyagerContact = parseContactPayload(await response.json());
        }
      }
    } catch {
      /* ignore */
    }
  }

  return mergeContacts(domContact, voyagerContact);
}
