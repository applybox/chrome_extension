/**
 * Standalone page extractors injected via chrome.scripting.executeScript.
 * Each function must be fully self-contained — no imports or outer references.
 */

export function extractLinkedInProfile(): Record<string, string> {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function metaContent(selector: string): string {
    const el = document.querySelector(selector);
    return trim(el?.getAttribute("content") || "");
  }

  function queryDeep(selector: string, root: Document | ShadowRoot = document): Element[] {
    const found: Element[] = [];
    try {
      found.push(...Array.from(root.querySelectorAll(selector)));
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) found.push(...queryDeep(selector, el.shadowRoot));
      });
    } catch {
      /* ignore */
    }
    return found;
  }

  function parseName(fullName: string): { firstName: string; lastName: string } {
    const clean = trim(fullName.replace(/['']s$/i, ""));
    if (!clean) return { firstName: "", lastName: "" };
    const parts = clean.split(" ").filter(Boolean);
    return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
  }

  function cleanLinkedInTitle(raw: string): string {
    return trim(raw.replace(/^\(\d+\)\s*/, "").replace(/\s*[|\-–—]\s*LinkedIn.*$/i, ""));
  }

  function parseFromJsonLd(): {
    firstName: string;
    lastName: string;
    jobTitle: string;
    location: string;
  } | null {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "");
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (!item || (item["@type"] !== "Person" && item["@type"] !== "ProfilePage")) continue;
          const person = item["@type"] === "ProfilePage" ? item.mainEntity || item : item;
          if (!person) continue;

          const name = trim(person.name || "");
          const { firstName, lastName } = parseName(name);
          const jobTitle = trim(person.jobTitle || person.description || "");
          let location = "";
          if (person.address) {
            if (typeof person.address === "string") {
              location = trim(person.address);
            } else {
              location = trim(
                [
                  person.address.addressLocality,
                  person.address.addressRegion,
                  person.address.addressCountry,
                ]
                  .filter(Boolean)
                  .join(", ")
              );
            }
          }
          if (firstName || lastName || jobTitle || location) {
            return { firstName, lastName, jobTitle, location };
          }
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function parseFromEmbeddedJson(): {
    firstName: string;
    lastName: string;
    jobTitle: string;
    location: string;
    email: string;
    phone: string;
  } | null {
    const blobs: string[] = [];
    document.querySelectorAll("script, code").forEach((el) => {
      const text = el.textContent || "";
      if (
        text.length > 50 &&
        (text.includes("firstName") ||
          text.includes("headline") ||
          text.includes("emailAddress") ||
          text.includes("phoneNumber"))
      ) {
        blobs.push(text);
      }
    });

    let firstName = "";
    let lastName = "";
    let jobTitle = "";
    let location = "";
    let email = "";
    let phone = "";

    for (const blob of blobs) {
      if (!firstName) {
        const m = blob.match(/"firstName"\s*:\s*"([^"\\]+)"/);
        if (m) firstName = trim(m[1]);
      }
      if (!lastName) {
        const m = blob.match(/"lastName"\s*:\s*"([^"\\]+)"/);
        if (m) lastName = trim(m[1]);
      }
      if (!jobTitle) {
        const m =
          blob.match(/"headline"\s*:\s*"((?:\\.|[^"\\])*)"/) ||
          blob.match(/"occupation"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (m) {
          jobTitle = trim(
            m[1].replace(/\\u([0-9a-f]{4})/gi, (_, code) =>
              String.fromCharCode(parseInt(code, 16))
            )
          );
        }
      }
      if (!location) {
        const m =
          blob.match(/"geoLocationName"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"locationName"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"geographicArea"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"fullAddress"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"address"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"city"\s*:\s*"([^"\\]+)"/);
        if (m) location = trim(m[1]);
      }
      if (!email) {
        const m =
          blob.match(/"emailAddress"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"email"\s*:\s*"([^"@\\]+@[^"\\]+)"/);
        if (m) email = trim(m[1]);
      }
      if (!phone) {
        const m =
          blob.match(/"phoneNumber"\s*:\s*\{[^}]*"number"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"phoneNumbers"\s*:\s*\[[^\]]*"number"\s*:\s*"([^"\\]+)"/) ||
          blob.match(/"number"\s*:\s*"(\+?[0-9][0-9\s\-().]{6,})"/);
        if (m) phone = trim(m[1]);
      }
    }

    if (firstName || lastName || jobTitle || location || email || phone) {
      return { firstName, lastName, jobTitle, location, email, phone };
    }
    return null;
  }

  function parseFromMeta(): {
    firstName: string;
    lastName: string;
    jobTitle: string;
    location: string;
  } | null {
    const ogTitle = metaContent('meta[property="og:title"]');
    const twitterTitle = metaContent('meta[name="twitter:title"]');
    const titleRaw = ogTitle || twitterTitle || cleanLinkedInTitle(document.title);

    let fullName = "";
    let jobTitle = "";

    if (titleRaw) {
      // "Jane Doe - Software Engineer" or "Jane Doe | LinkedIn"
      const dashSplit = titleRaw.split(/\s+[\-–—]\s+/);
      if (dashSplit.length >= 2 && !/linkedin/i.test(dashSplit[1])) {
        fullName = trim(dashSplit[0]);
        jobTitle = trim(dashSplit.slice(1).join(" - ").replace(/\s*[|\-–—]\s*LinkedIn.*$/i, ""));
      } else {
        fullName = cleanLinkedInTitle(titleRaw);
      }
    }

    if (!jobTitle) {
      jobTitle =
        metaContent('meta[property="og:description"]') ||
        metaContent('meta[name="description"]') ||
        metaContent('meta[name="twitter:description"]');
      jobTitle = jobTitle
        .replace(/^View\s+.+'s\s+profile\s+on\s+LinkedIn[.,\s]*/i, "")
        .replace(/\s*[\|·]\s*LinkedIn.*$/i, "")
        .trim();
      // Description often starts with headline then " · " or " | "
      if (jobTitle.includes(" · ")) {
        const parts = jobTitle.split(" · ");
        if (!fullName && parts[0]) fullName = trim(parts[0]);
        jobTitle = trim(parts[1] || parts[0]);
      }
    }

    const { firstName, lastName } = parseName(fullName);
    if (firstName || lastName || jobTitle) {
      return { firstName, lastName, jobTitle, location: "" };
    }
    return null;
  }

  function nameFromProfileImage(): string {
    const imgs = queryDeep("img");
    for (const img of imgs) {
      const alt = trim(img.getAttribute("alt") || "");
      if (!alt) continue;
      const match = alt.match(/^(.+?)(?:['']s)?\s*(?:profile|photo|picture)/i);
      if (match && match[1].length < 60) return trim(match[1]);
    }
    return "";
  }

  function findNameFromDom(): string {
    const selectors = [
      "a[href*='/in/'] h2",
      "a[href*='/in/'] h1",
      "h2.text-heading-xlarge",
      "h1.text-heading-xlarge",
      "h1.inline.t-24",
      "h1.t-24",
      "[data-view-name='profile-card'] h2",
      "[data-view-name='profile-card'] h1",
      "section.artdeco-card h2",
      "section.artdeco-card h1",
      "main h2",
      "main h1",
      "h2",
      "h1",
    ];
    for (const sel of selectors) {
      for (const el of queryDeep(sel)) {
        const text = trim(el.textContent || "");
        if (text && text.length > 1 && text.length < 80 && !/linkedin|experience|education/i.test(text)) {
          return text;
        }
      }
    }
    return nameFromProfileImage();
  }

  function isConnectionBadge(text: string): boolean {
    return (
      /^[·•]\s*$/.test(text) ||
      /^[·•]\s*\d+(?:st|nd|rd|th)?$/i.test(text) ||
      /^[·•]\s*\d+\+?$/.test(text)
    );
  }

  function isValidHeadline(text: string, name: string): boolean {
    if (!text || text.length < 2 || text.length > 320) return false;
    if (text === name) return false;
    if (isConnectionBadge(text)) return false;
    if (/^contact info$|^connections$|^followers$/i.test(text)) return false;
    if (/contact info/i.test(text)) return false;
    if (/\d+\+?\s+connections?|linkedin member|mutual connection/i.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return false;
    return true;
  }

  function isValidLocation(text: string): boolean {
    if (!text || text.length < 4 || text.length > 120) return false;
    if (isConnectionBadge(text)) return false;
    if (/^contact info$/i.test(text)) return false;
    if (/contact info/i.test(text)) return false;
    if (/linkedin\.com/i.test(text)) return false;
    if (text.includes(",")) return true;
    if (/\b(united kingdom|england|scotland|wales|area|region|county|metropolitan)\b/i.test(text)) {
      return true;
    }
    return false;
  }

  function headlineTextFromElement(el: Element, name: string): string {
    if (el.closest("header, nav, [role='navigation'], [role='banner'], button")) return "";

    const ariaSpans = el.querySelectorAll("span[aria-hidden='true']");
    for (const span of ariaSpans) {
      const t = trim(span.textContent || "");
      if (isValidHeadline(t, name) && t.length < 220) return t;
    }

    const shallowSpans = el.querySelectorAll(":scope > span, :scope > div > span");
    for (const span of shallowSpans) {
      const t = trim(span.textContent || "");
      if (isValidHeadline(t, name) && t.length < 220) return t;
    }

    const direct = trim(el.textContent || "");
    if (!isValidHeadline(direct, name)) return "";

    // Skip large containers that wrap the whole top card
    if (el.children.length > 6 && direct.length > 280) return "";

    return direct;
  }

  function findProfileTopCard(): Element | null {
    return (
      document.querySelector("[data-view-name='profile-card']") ||
      document.querySelector("main section.artdeco-card") ||
      document.querySelector("main section") ||
      document.querySelector("main")
    );
  }

  function findProfileNameElement(card: Element): HTMLHeadingElement | null {
    const preferred = [
      "a[href*='/in/'] h2",
      "a[href*='/in/'] h1",
      "[data-view-name='profile-card'] h2",
      "[data-view-name='profile-card'] h1",
      "h2.text-heading-xlarge",
      "h1.text-heading-xlarge",
      "h2",
      "h1",
    ];
    for (const sel of preferred) {
      for (const heading of queryDeep(sel, card)) {
        if (heading.closest("header, nav, [role='navigation'], [role='banner']")) continue;
        const text = trim(heading.textContent || "");
        if (text && text.length < 80 && !/linkedin|experience|education/i.test(text)) {
          return heading as HTMLHeadingElement;
        }
      }
    }
    return null;
  }

  /**
   * LinkedIn 2026 top card: h2 name, then <p> headline, company, <p> location.
   * Example: "Head of Engineering | AI Agents" then "Milton Keynes, England, United Kingdom"
   */
  function findTopCardDetails(
    card: Element | null,
    profileName: string,
    nameEl: Element | null
  ): { headline: string; location: string } {
    if (!card || !nameEl) return { headline: "", location: "" };

    const nameRect = nameEl.getBoundingClientRect();
    if (!nameRect.height) return { headline: "", location: "" };

    const items: { text: string; top: number }[] = [];

    for (const p of queryDeep("p", card)) {
      if (p.closest("#about, #experience, button, nav, header, [role='navigation']")) continue;
      if (p.querySelector("a[href*='contact-info'], a[href*='overlay/contact-info']")) continue;
      if (nameEl.contains(p)) continue;

      const rect = p.getBoundingClientRect();
      if (rect.top < nameRect.bottom - 8) continue;
      if (rect.top > nameRect.bottom + 340) continue;

      const text = trim(p.textContent || "");
      if (!text) continue;

      items.push({ text, top: rect.top });
    }

    items.sort((a, b) => a.top - b.top);

    let headline = "";
    let location = "";

    for (const { text } of items) {
      if (isConnectionBadge(text)) continue;
      if (!headline && isValidHeadline(text, profileName)) {
        headline = text;
        continue;
      }
      if (headline && !location && isValidLocation(text)) {
        location = text;
        break;
      }
    }

    return { headline, location };
  }

  function extractHeadlineFromSubtree(root: Element, profileName: string): string {
    const direct = headlineTextFromElement(root, profileName);
    if (direct) return direct;

    const candidates: string[] = [];
    const queue: Element[] = Array.from(root.children);

    for (let depth = 0; depth < 6 && queue.length; depth++) {
      const next: Element[] = [];
      for (const el of queue) {
        const text = headlineTextFromElement(el, profileName);
        if (text && text.length < 220) candidates.push(text);
        next.push(...Array.from(el.children));
      }
      queue.length = 0;
      queue.push(...next);
    }

    candidates.sort((a, b) => a.length - b.length);
    for (const text of candidates) {
      if (isValidHeadline(text, profileName)) return text;
    }

    return "";
  }

  function findHeadlineNearElement(anchor: Element, profileName: string): string {
    let node: Element | null = anchor;
    for (let depth = 0; depth < 10 && node; depth++) {
      let sibling = node.nextElementSibling;
      while (sibling) {
        const text = extractHeadlineFromSubtree(sibling, profileName);
        if (text) return text;
        sibling = sibling.nextElementSibling;
      }
      node = node.parentElement;
    }
    return "";
  }

  function hasLinkedInHashedClasses(el: Element | null): boolean {
    if (!el) return false;
    const hashed = Array.from(el.classList).filter((cls) => /^_[a-f0-9]{6,}$/i.test(cls));
    return hashed.length >= 2;
  }

  function headlineTextFromBlock(el: Element, profileName: string): string {
    const tag = el.tagName;
    if (tag !== "P" && tag !== "DIV") return "";
    if (el.closest("button, nav, header, [role='navigation'], [role='banner']")) return "";

    for (const span of el.querySelectorAll("span[aria-hidden='true']")) {
      const text = trim(span.textContent || "");
      if (isValidHeadline(text, profileName)) return text;
    }

    const direct = trim(el.textContent || "");
    return isValidHeadline(direct, profileName) ? direct : "";
  }

  /** LinkedIn 2026: headline is a <p> (or parent <div>) with hashed CSS-in-JS classes below the name. */
  function findHeadlineFromHashedBlocks(
    card: Element,
    profileName: string,
    nameEl: Element | null
  ): string {
    const nameRect = nameEl?.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    const candidates: { text: string; top: number; hashed: number; domIndex: number }[] = [];
    const blocks = queryDeep("p, div", card);

    blocks.forEach((el, domIndex) => {
      if (
        el.closest(
          "button, nav, header, [role='navigation'], #about, #experience, [data-view-name='profile-card-about'], [data-view-name='profile-card-experience']"
        )
      ) {
        return;
      }
      if (nameEl && (el.contains(nameEl) || nameEl.contains(el))) return;
      if (el.querySelector("h1, h2, h3")) return;

      const text = headlineTextFromBlock(el, profileName);
      if (!text || text.length > 240) return;

      const rect = el.getBoundingClientRect();
      if (!rect.height) return;
      if (rect.top > cardRect.top + 520) return;
      if (nameRect && rect.top < nameRect.bottom - 8) return;

      const hashed = hasLinkedInHashedClasses(el)
        ? 0
        : hasLinkedInHashedClasses(el.parentElement)
          ? 1
          : el.tagName === "P"
            ? 2
            : 3;

      candidates.push({ text, top: rect.top, hashed, domIndex });
    });

    candidates.sort((a, b) => a.hashed - b.hashed || a.top - b.top || a.domIndex - b.domIndex);
    return candidates[0]?.text || "";
  }

  /** Read the line immediately after the profile name from visible page text. */
  function findHeadlineFromInnerText(profileName: string): string {
    const roots = [
      document.querySelector("[data-view-name='profile-card']"),
      document.querySelector("main section"),
      document.querySelector("main"),
    ].filter(Boolean) as HTMLElement[];

    for (const root of roots) {
      const lines = (root.innerText || "")
        .split("\n")
        .map((line) => trim(line))
        .filter(Boolean);

      const nameHeading = root.querySelector("a[href*='/in/'] h2, a[href*='/in/'] h1, h2, h1");
      const nameText = trim(nameHeading?.textContent || "");

      let nameIdx = -1;
      if (profileName) {
        nameIdx = lines.findIndex((line) => line === profileName);
      }
      if (nameIdx < 0 && nameText) {
        nameIdx = lines.findIndex((line) => line === nameText || line.startsWith(nameText));
      }

      if (nameIdx >= 0) {
        for (let i = nameIdx + 1; i < Math.min(nameIdx + 12, lines.length); i++) {
          const line = lines[i];
          if (isConnectionBadge(line)) continue;
          if (isValidHeadline(line, profileName || nameText)) return line;
        }
      }
    }

    return "";
  }

  function findHeadlineFromAriaSpans(card: Element, profileName: string, nameEl: Element | null): string {
    if (!nameEl) return "";

    const nameRect = nameEl.getBoundingClientRect();
    if (!nameRect.height) return "";

    const candidates: { text: string; top: number; len: number }[] = [];

    for (const span of queryDeep("span[aria-hidden='true']", card)) {
      if (span.closest("button, nav, header, [role='navigation']")) continue;
      const text = trim(span.textContent || "");
      if (!isValidHeadline(text, profileName)) continue;

      const rect = span.getBoundingClientRect();
      if (rect.top < nameRect.bottom - 8) continue;
      if (rect.top > nameRect.bottom + 240) continue;

      candidates.push({ text, top: rect.top, len: text.length });
    }

    candidates.sort((a, b) => a.top - b.top || a.len - b.len);
    return candidates[0]?.text || "";
  }

  function findHeadlineFromDom(name: string): string {
    const card = findProfileTopCard();
    const nameEl = card ? findProfileNameElement(card) : null;

    const topCard = findTopCardDetails(card, name, nameEl);
    if (topCard.headline) return topCard.headline;

    // Fallback: visible text line after profile name
    const fromText = findHeadlineFromInnerText(name);
    if (fromText) return fromText;

    // Secondary: <p>/<div> with LinkedIn hashed classes below the profile name
    const searchRoots = [card, document.querySelector("main")].filter(Boolean) as Element[];
    for (const root of searchRoots) {
      const anchor = nameEl || findProfileNameElement(root);
      const fromBlock = findHeadlineFromHashedBlocks(root, name, anchor);
      if (fromBlock) return fromBlock;
    }

    const legacySelectors = [
      ".text-body-medium.break-words",
      "div.text-body-medium",
      ".pv-text-details__left-panel .text-body-medium",
      "[data-generated-suggestion-target]",
      ".top-card-layout__headline",
    ];
    for (const sel of legacySelectors) {
      const text = trim(document.querySelector(sel)?.textContent || "");
      if (isValidHeadline(text, name)) return text;
    }

    if (!card) return "";
    if (!nameEl) return "";

    // LinkedIn 2026: name is often inside <a><h1>…</h1></a>; headline is a sibling of the link
    const near = findHeadlineNearElement(nameEl, name);
    if (near) return near;

    const byAria = findHeadlineFromAriaSpans(card, name, nameEl);
    if (byAria) return byAria;

    // First valid text block after name in document order within the profile card
    const nodes = card.querySelectorAll("div, p, span");
    let pastName = false;
    for (const node of nodes) {
      if (node === nameEl || node.contains(nameEl)) {
        pastName = true;
        continue;
      }
      if (!pastName) continue;
      if (node.tagName === "H1" || node.id === "about" || node.id === "experience") break;
      if (node.querySelector("h1")) continue;

      const text = headlineTextFromElement(node, name);
      if (text && text.length < 220) return text;
    }

    return "";
  }

  function findHeadlineFromEmbedded(name: string): string {
    const blobs: string[] = [];
    document.querySelectorAll("script, code").forEach((el) => {
      const text = el.textContent || "";
      if (text.length > 50 && text.includes("headline")) blobs.push(text);
    });

    const firstName = name.split(/\s+/)[0]?.toLowerCase() || "";

    for (const blob of blobs) {
      const patterns = [
        /"headline"\s*:\s*"([^"\\]+)"/,
        /"occupation"\s*:\s*"([^"\\]+)"/,
        /"multiLocaleHeadline"\s*:\s*"([^"\\]+)"/,
        /"headline"\s*:\s*\{\s*"text"\s*:\s*"([^"\\]+)"/,
      ];
      for (const pattern of patterns) {
        const match = blob.match(pattern);
        if (match && isValidHeadline(trim(match[1]), name)) return trim(match[1]);
      }
      if (firstName && blob.toLowerCase().includes(firstName)) {
        const match = blob.match(/"headline"\s*:\s*"([^"\\]+)"/);
        if (match && isValidHeadline(trim(match[1]), name)) return trim(match[1]);
      }
    }

    return "";
  }

  function cleanSummaryText(raw: string): string {
    return trim(raw)
      .replace(/^about\s*/i, "")
      .replace(/\s*…\s*more\s*$/i, "")
      .replace(/\s*\.\.\.\s*more\s*$/i, "")
      .replace(/\s*see more\s*$/i, "")
      .replace(/\s*show more\s*$/i, "");
  }

  function summaryFromExpandable(el: Element | null): string {
    if (!el) return "";
    const text = cleanSummaryText(el.textContent || "");
    if (text.length > 20 && text.length < 8000) return text;
    return "";
  }

  function findSummaryFromDom(): string {
    // LinkedIn 2026: About section uses h2 + span[data-testid='expandable-text-box']
    for (const h2 of queryDeep("h2")) {
      if (trim(h2.textContent) !== "About") continue;
      if (h2.closest("header, nav, [role='navigation']")) continue;

      let root: Element | null = h2.parentElement;
      while (root && root !== document.body) {
        const expandable = root.querySelector('[data-testid="expandable-text-box"]');
        const fromExpandable = summaryFromExpandable(expandable);
        if (fromExpandable) return fromExpandable;

        let sibling = root.nextElementSibling;
        while (sibling) {
          const inSibling = summaryFromExpandable(
            sibling.querySelector('[data-testid="expandable-text-box"]')
          );
          if (inSibling) return inSibling;
          sibling = sibling.nextElementSibling;
        }

        root = root.parentElement;
      }
    }

    const roots = [
      document.querySelector("section[data-view-name='profile-card-about']"),
      document.querySelector("#about")?.closest("section"),
      document.querySelector(".pv-about-section"),
      document.querySelector("#about"),
    ].filter(Boolean) as Element[];

    for (const root of roots) {
      const fromExpandable = summaryFromExpandable(
        root.querySelector('[data-testid="expandable-text-box"]')
      );
      if (fromExpandable) return fromExpandable;

      const selectors = [
        ".inline-show-more-text",
        ".pv-shared-text-with-see-more span[aria-hidden='true']",
        ".pv-about__summary-text",
        ".display-flex.full-width span[aria-hidden='true']",
      ];
      for (const sel of selectors) {
        const text = cleanSummaryText(root.querySelector(sel)?.textContent || "");
        if (text.length > 20 && text.length < 8000) return text;
      }
      const fallback = cleanSummaryText(root.textContent || "");
      if (fallback.length > 20 && fallback.length < 8000) return fallback;
    }

    return "";
  }

  function findExperienceFromDom(): string {
    const section =
      document.querySelector("section[data-view-name='profile-card-experience']") ||
      document.querySelector("#experience")?.closest("section") ||
      document.querySelector("#experience");

    if (!section) return "";

    const items = section.querySelectorAll(
      "li.artdeco-list__item, .pvs-list__paged-list-item, [data-view-name='profile-component-entity']"
    );

    const entries: string[] = [];

    items.forEach((item) => {
      const title = trim(
        item.querySelector(".mr1 span[aria-hidden='true']")?.textContent ||
          item.querySelector(".t-bold span[aria-hidden='true']")?.textContent ||
          item.querySelector(".hoverable-link-text span")?.textContent ||
          ""
      );
      const company = trim(
        item.querySelector(".t-14.t-normal span[aria-hidden='true']")?.textContent ||
          item.querySelector(".pv-entity__secondary-title")?.textContent ||
          ""
      );
      const dates = trim(
        item.querySelector(".pvs-entity__caption-wrapper span[aria-hidden='true']")?.textContent ||
          item.querySelector(".pv-entity__bullet-item-v2")?.textContent ||
          ""
      );
      const description = trim(item.querySelector(".inline-show-more-text")?.textContent || "");

      const lines = [title, company, dates, description].filter(Boolean);
      if (lines.length) entries.push(lines.join("\n"));
    });

    return entries.join("\n\n").slice(0, 8000);
  }

  function findLocationFromDom(profileName: string): string {
    const card = findProfileTopCard();
    const nameEl = card ? findProfileNameElement(card) : null;
    const topCard = findTopCardDetails(card, profileName, nameEl);
    if (topCard.location) return topCard.location;

    const roots = [card, document.querySelector("main")].filter(Boolean) as HTMLElement[];
    for (const root of roots) {
      const nameHeading = root.querySelector("a[href*='/in/'] h2, a[href*='/in/'] h1, h2, h1");
      const nameText = trim(nameHeading?.textContent || "");
      const lines = (root.innerText || "")
        .split("\n")
        .map((line) => trim(line))
        .filter(Boolean);

      let nameIdx = profileName ? lines.findIndex((line) => line === profileName) : -1;
      if (nameIdx < 0 && nameText) nameIdx = lines.findIndex((line) => line === nameText);

      if (nameIdx >= 0) {
        for (let i = nameIdx + 1; i < Math.min(nameIdx + 14, lines.length); i++) {
          if (isValidLocation(lines[i])) return lines[i];
        }
      }
    }

    const selectors = [
      ".text-body-small.inline.t-black--light.break-words",
      "span.text-body-small.inline",
      ".pv-text-details__left-panel .text-body-small",
      ".top-card-layout__first-subline",
      "[data-view-name='profile-card'] .text-body-small",
    ];
    for (const sel of selectors) {
      const text = trim(document.querySelector(sel)?.textContent || "");
      if (isValidLocation(text)) return text;
    }
    return "";
  }

  function extractPhoneFromText(text: string): string {
    const match = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
    return match ? trim(match[1]) : "";
  }

  function phoneFromSduiRow(row: Element): string {
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

  function findPhoneFromSduiContact(): string {
    const iconSelectors = [
      'svg[id="phone-handset-small"]',
      'svg[id="phone-handset-medium"]',
      'svg[id^="phone-handset"]',
      '[data-test-icon="phone-handset-small"]',
      '[data-test-icon="phone-handset-medium"]',
    ];

    for (const selector of iconSelectors) {
      for (const icon of queryDeep(selector)) {
        const row = icon.closest("[componentkey]") || icon.parentElement;
        if (!row) continue;
        const found = phoneFromSduiRow(row);
        if (found) return found;
      }
    }

    for (const section of queryDeep('[componentkey*="ContactInfoDetailSection"]')) {
      const found = phoneFromSduiRow(section);
      if (found) return found;
    }

    return "";
  }

  function extractAddressFromText(text: string): string {
    const cleaned = trim(text.replace(/^address\s*/i, ""));
    if (cleaned.length < 4 || cleaned.length > 220) return "";
    if (/^phone$|^email$|^website$|^birthday$/i.test(cleaned)) return "";
    return cleaned;
  }

  function findContact(): { email: string; phone: string; address: string } {
    let email = "";
    let phone = findPhoneFromSduiContact();
    let address = "";

    for (const a of queryDeep("a[href^='mailto:']")) {
      const href = (a as HTMLAnchorElement).href?.replace(/^mailto:/i, "").split("?")[0] || "";
      if (href && href.includes("@")) {
        email = href;
        break;
      }
    }

    for (const a of queryDeep("a[href^='tel:']")) {
      const href = (a as HTMLAnchorElement).href?.replace(/^tel:/i, "") || "";
      if (href) {
        phone = href;
        break;
      }
    }

    const contactRoots = [
      ...document.querySelectorAll('[componentkey*="ContactInfoDetailSection"]'),
      document.querySelector("#contact-info"),
      document.querySelector("section.pv-contact-info"),
      document.querySelector("[class*='contact-info']"),
      document.querySelector("[data-view-name='profile-contact-info']"),
      document.querySelector(".artdeco-modal__content"),
    ].filter(Boolean) as Element[];

    for (const root of contactRoots) {
      if (!email) {
        const mail = root.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
        if (mail?.href) email = mail.href.replace(/^mailto:/i, "").split("?")[0];
      }
      if (!phone) {
        const tel = root.querySelector("a[href^='tel:']") as HTMLAnchorElement | null;
        if (tel?.href) phone = tel.href.replace(/^tel:/i, "");
      }

      for (const icon of queryDeep(
        '[data-test-icon="phone-handset-medium"], [data-test-icon="phone-handset-small"]',
        root
      )) {
        if (phone) break;
        const container = icon.closest("li") || icon.closest("div");
        if (!container) continue;
        const tel = container.querySelector("a[href^='tel:']") as HTMLAnchorElement | null;
        if (tel?.href) {
          phone = tel.href.replace(/^tel:/i, "");
          break;
        }
        const fromText = extractPhoneFromText(container.textContent || "");
        if (fromText) phone = fromText;
      }

      for (const icon of queryDeep(
        '[data-test-icon="location-marker-medium"], [data-test-icon="location-marker-small"]',
        root
      )) {
        if (address) break;
        const container = icon.closest("li") || icon.closest("div");
        if (!container) continue;
        const fromText = extractAddressFromText(container.textContent || "");
        if (fromText) address = fromText;
      }

      if (!email || !phone || !address) {
        const text = root.textContent || "";
        if (!email) {
          const em = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
          if (em) email = em[0];
        }
        if (!phone) {
          const fromText = extractPhoneFromText(text);
          if (fromText) phone = fromText;
        }
        if (!address) {
          const lines = text.split("\n").map((line) => trim(line));
          const addressIndex = lines.findIndex((line) => /^address$/i.test(line));
          if (addressIndex >= 0 && lines[addressIndex + 1]) {
            address = extractAddressFromText(lines[addressIndex + 1]);
          }
        }
      }
    }

    return { email, phone, address };
  }

  function isNavOrHeaderImage(img: Element): boolean {
    return !!img.closest(
      "header, nav, [role='banner'], .global-nav, #global-nav, .global-nav__nav, .feed-identity-module"
    );
  }

  function isProfilePhotoSrc(src: string): boolean {
    return (
      src.includes("profile-displayphoto") ||
      src.includes("profile-framedphoto") ||
      src.includes("profile-displaybackground")
    );
  }

  function findHeadshotInRoot(root: ParentNode): string {
    const selectors = [
      "img.pv-top-card-profile-picture__image",
      "button.pv-top-card-profile-picture img",
      "[data-view-name='profile-top-card-member-photo'] img",
      ".pv-top-card-profile-picture__container img",
      ".pv-top-card__photo img",
      "img.profile-photo-edit__preview",
    ];

    for (const sel of selectors) {
      const img = root.querySelector(sel) as HTMLImageElement | null;
      if (img?.src?.startsWith("http") && !isNavOrHeaderImage(img)) return img.src;
    }

    return "";
  }

  function findHeadshotByName(profileName: string): string {
    const nameParts = profileName
      .toLowerCase()
      .split(/\s+/)
      .filter((part) => part.length > 1);

    if (!nameParts.length) return "";

    for (const img of queryDeep("img")) {
      if (isNavOrHeaderImage(img)) continue;
      if (
        !img.closest(
          "main, [data-view-name='profile-card'], .pv-top-card, section.artdeco-card, .scaffold-layout__main"
        )
      ) {
        continue;
      }

      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const src = (img as HTMLImageElement).src || "";
      if (!src.startsWith("http")) continue;

      const nameMatches = nameParts.every((part) => alt.includes(part));
      if (
        nameMatches &&
        (alt.includes("profile") || alt.includes("photo") || alt.includes("picture"))
      ) {
        return src;
      }
    }

    return "";
  }

  function findHeadshotFromEmbedded(profileName: string): string {
    const blobs: string[] = [];
    document.querySelectorAll("script, code").forEach((el) => {
      const text = el.textContent || "";
      if (text.includes("profile-displayphoto") || text.includes("displayImage")) {
        blobs.push(text);
      }
    });

    const firstName = profileName.split(/\s+/)[0]?.toLowerCase() || "";

    for (const blob of blobs) {
      const urls = blob.match(
        /https:\\?\/\\?\/media\.licdn\.com\/dms\/image\/[^"'\\]+profile-displayphoto[^"'\\]+/g
      );
      if (!urls?.length) continue;

      if (!firstName || blob.toLowerCase().includes(firstName)) {
        return urls[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      }
    }

    return "";
  }

  function findHeadshotUrl(profileName: string): string {
    const profileRoots = [
      document.querySelector("[data-view-name='profile-card']"),
      document.querySelector("main .pv-top-card"),
      document.querySelector("main section.artdeco-card"),
      document.querySelector("main"),
    ].filter(Boolean) as Element[];

    for (const root of profileRoots) {
      const url = findHeadshotInRoot(root);
      if (url) return url;
    }

    const byName = findHeadshotByName(profileName);
    if (byName) return byName;

    const embedded = findHeadshotFromEmbedded(profileName);
    if (embedded) return embedded;

    const og = metaContent('meta[property="og:image"]');
    if (og && og.startsWith("http") && isProfilePhotoSrc(og)) return og;

    return "";
  }

  function mergeLocation(profileLocation: string, contactAddress: string): string {
    const profile = trim(profileLocation);
    const contact = trim(contactAddress);
    if (!contact) return profile;
    if (!profile) return contact;
    if (profile === contact) return profile;
    if (contact.includes(profile)) return contact;
    if (profile.includes(contact)) return profile;
    return contact;
  }

  const profileUrl = window.location.href.split("?")[0].split("#")[0];

  // Priority: JSON-LD → embedded JSON → meta tags → DOM
  const jsonLd = parseFromJsonLd();
  const embedded = parseFromEmbeddedJson();
  const meta = parseFromMeta();

  let firstName = jsonLd?.firstName || embedded?.firstName || meta?.firstName || "";
  let lastName = jsonLd?.lastName || embedded?.lastName || meta?.lastName || "";
  let jobTitle = embedded?.jobTitle || jsonLd?.jobTitle || "";
  let summary = "";
  let experience = "";
  let location = jsonLd?.location || embedded?.location || meta?.location || "";

  if (!firstName && !lastName) {
    const domName = findNameFromDom();
    const parsed = parseName(domName);
    firstName = parsed.firstName;
    lastName = parsed.lastName;
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (!jobTitle) jobTitle = findHeadlineFromDom(fullName);
  if (!jobTitle) jobTitle = meta?.jobTitle || "";
  if (!jobTitle) jobTitle = findHeadlineFromEmbedded(fullName);
  if (!location) location = findLocationFromDom(fullName);
  summary = findSummaryFromDom();
  experience = findExperienceFromDom();

  const contact = findContact();

  return {
    firstName,
    lastName,
    email: embedded?.email || contact.email,
    phone: embedded?.phone || contact.phone,
    jobTitle,
    summary,
    experience,
    location: mergeLocation(location, contact.address),
    profileUrl,
    headshotUrl: findHeadshotUrl(fullName),
  };
}

export function extractCVLibraryProfile(): Record<string, string> {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function metaContent(selector: string): string {
    return trim(document.querySelector(selector)?.getAttribute("content") || "");
  }

  function parseName(fullName: string): { firstName: string; lastName: string } {
    const clean = trim(fullName.replace(/\s*[-|–—]\s*CV-?Library.*$/i, ""));
    if (!clean) return { firstName: "", lastName: "" };
    const parts = clean.split(" ").filter(Boolean);
    return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
  }

  function cleanCvLibraryTitle(raw: string): string {
    return trim(raw.replace(/^\(\d+\)\s*/, "").replace(/\s*[-|–—]\s*CV-?Library.*$/i, ""));
  }

  function valueFromRow(labelEl: Element): string {
    const next = labelEl.nextElementSibling;
    if (next) {
      const text = trim(next.textContent || "");
      if (text && text.length < 500) return text;
    }

    const parent = labelEl.parentElement;
    if (parent) {
      const cells = parent.querySelectorAll("td, dd, span, p, div");
      let seenLabel = false;
      for (const cell of cells) {
        if (cell === labelEl) {
          seenLabel = true;
          continue;
        }
        if (!seenLabel) continue;
        const text = trim(cell.textContent || "");
        if (text && text.length < 500) return text;
      }
      const combined = trim(parent.textContent || "");
      const labelText = trim(labelEl.textContent || "");
      if (combined.startsWith(labelText)) {
        const rest = trim(combined.slice(labelText.length).replace(/^[:–—-]\s*/, ""));
        if (rest && rest.length < 500) return rest;
      }
    }

    return "";
  }

  function findLabelValue(labels: string[]): string {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(`^(${labelPattern})\\s*:?\\s*$`, "i");

    for (const el of document.querySelectorAll(
      "dt, th, label, span, p, div, li, strong, b, h2, h3, h4"
    )) {
      const text = trim(el.textContent || "");
      if (!text || text.length > 80) continue;
      if (!re.test(text)) continue;

      const value = valueFromRow(el);
      if (value) return value;
    }

    return "";
  }

  /** CV-Library view-cv layout: .vcvdp-div rows with .vcvdp-left / .vcvdp-right (or vcvdj-*). */
  function findViewCvDetailValue(labels: string[]): string {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(`^(${labelPattern})\\s*:?\\s*$`, "i");

    const roots = [
      ...document.querySelectorAll(".cv-candidate-details, .view-cv-details-personal, .view-cv-details-job"),
      document.body,
    ];

    for (const root of roots) {
      for (const row of root.querySelectorAll(".vcvdp-div")) {
        const left = row.querySelector(".vcvdp-left, .vcvdj-left");
        const right = row.querySelector(".vcvdp-right, .vcvdj-right");
        if (!left || !right) continue;

        const labelText = trim(left.textContent || "");
        if (!labelText || !re.test(labelText)) continue;
        if (right.querySelector(".not-available")) continue;

        const mailLink = right.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
        if (mailLink?.href) {
          const raw = mailLink.href.replace(/^mailto:/i, "").split("?")[0];
          try {
            const decoded = trim(decodeURIComponent(raw));
            if (decoded.includes("@")) return decoded;
          } catch {
            if (raw.includes("@")) return trim(raw);
          }
        }

        const telLink = right.querySelector("a[href^='tel:']") as HTMLAnchorElement | null;
        if (telLink?.href) {
          return trim(telLink.href.replace(/^tel:/i, ""));
        }

        const text = trim(right.textContent || "");
        if (text && !/^n\/a$/i.test(text) && /\S/.test(text)) return text;
      }
    }

    return "";
  }

  function parseEmbeddedJson(): Record<string, string> {
    const out: Record<string, string> = {};
    const blobs: string[] = [];

    document.querySelectorAll("script, code").forEach((el) => {
      const text = el.textContent || "";
      if (
        text.length > 40 &&
        (text.includes("first_name") ||
          text.includes("firstName") ||
          text.includes("current_job_title") ||
          text.includes("desired_job_title") ||
          text.includes("telephone"))
      ) {
        blobs.push(text);
      }
    });

    const pick = (patterns: RegExp[]): string => {
      for (const blob of blobs) {
        for (const pattern of patterns) {
          const match = blob.match(pattern);
          if (match?.[1]) return trim(match[1].replace(/\\u0026/g, "&"));
        }
      }
      return "";
    };

    out.firstName = pick([/"first_name"\s*:\s*"([^"\\]+)"/, /"firstName"\s*:\s*"([^"\\]+)"/]);
    out.lastName = pick([/"last_name"\s*:\s*"([^"\\]+)"/, /"lastName"\s*:\s*"([^"\\]+)"/]);
    out.email = pick([/"email"\s*:\s*"([^"\\]+)"/, /"emailAddress"\s*:\s*"([^"\\]+)"/]);
    out.phone = pick([
      /"telephone"\s*:\s*"([^"\\]+)"/,
      /"optional_telephone"\s*:\s*"([^"\\]+)"/,
      /"mobile"\s*:\s*"([^"\\]+)"/,
      /"phone"\s*:\s*"([^"\\]+)"/,
    ]);
    out.jobTitle = pick([
      /"desired_job_title"\s*:\s*"([^"\\]+)"/,
      /"current_job_title"\s*:\s*"([^"\\]+)"/,
      /"jobTitle"\s*:\s*"([^"\\]+)"/,
    ]);
    out.location = pick([/"town"\s*:\s*"([^"\\]+)"/, /"county"\s*:\s*"([^"\\]+)"/]);
    out.summary = pick([/"cover_letter"\s*:\s*"([^"\\]+)"/, /"personal_statement"\s*:\s*"([^"\\]+)"/]);

    if (!out.location) {
      const town = pick([/"town"\s*:\s*"([^"\\]+)"/]);
      const county = pick([/"county"\s*:\s*"([^"\\]+)"/]);
      out.location = [town, county].filter(Boolean).join(", ");
    }

    return out;
  }

  function findNameFromDom(): { firstName: string; lastName: string } {
    const selectors = [
      ".candidate-name",
      "h1.name",
      "[data-testid='candidate-name']",
      "[data-candidate-name]",
      ".profile-name",
      ".cv-name",
      "#candidate-name",
      "main h1",
      "h1",
      "h2",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const fullName = trim(el?.textContent || "");
      if (fullName && fullName.length > 1 && fullName.length < 80 && !/search results/i.test(fullName)) {
        return parseName(fullName);
      }
    }

    const ogTitle = metaContent('meta[property="og:title"]');
    if (ogTitle) return parseName(cleanCvLibraryTitle(ogTitle));

    const title = cleanCvLibraryTitle(document.title || "");
    if (title && !/search|login|cv-library home/i.test(title)) return parseName(title);

    return { firstName: "", lastName: "" };
  }

  function normalizeImgUrl(url: string): string {
    const trimmed = trim(url);
    if (!trimmed) return "";
    if (trimmed.startsWith("data:image/")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${window.location.origin}${trimmed}`;
    return trimmed;
  }

  function resolveImgSrc(img: HTMLImageElement): string {
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
    ].filter(Boolean) as string[];

    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const parts = srcset
        .split(",")
        .map((part) => trim(part.split(/\s+/)[0]))
        .filter(Boolean);
      if (parts.length) candidates.push(parts[parts.length - 1]);
    }

    for (const candidate of candidates) {
      const normalized = normalizeImgUrl(candidate);
      if (normalized && !/logo|icon|sprite|placeholder/i.test(normalized)) {
        return normalized;
      }
    }
    return "";
  }

  function upgradeCvLibraryPhotoUrl(url: string): string {
    return url.replace(/candidate-photo-\d+x\d+/i, "candidate-photo-480x480");
  }

  function findCvLibraryPhotoUrl(): string {
    const prioritySelectors = [
      "#imageModal img",
      ".cand-image-modal img",
      ".image-modal img",
      ".cvl-modal.image-modal img",
      'img[src*="photo.cvlibrary.co.uk"]',
      'img[src*="candidate-photo"]',
    ];

    for (const selector of prioritySelectors) {
      const img = document.querySelector(selector) as HTMLImageElement | null;
      if (!img) continue;
      const src = resolveImgSrc(img);
      if (
        src &&
        (src.includes("photo.cvlibrary.co.uk") || src.includes("candidate-photo"))
      ) {
        return upgradeCvLibraryPhotoUrl(src);
      }
    }

    const html = document.documentElement.innerHTML;
    const embedded = html.match(
      /https?:\/\/photo\.cvlibrary\.co\.uk\/candidate-photo[^"'\\s<]+/i
    );
    if (embedded?.[0]) return upgradeCvLibraryPhotoUrl(embedded[0]);

    return "";
  }

  function findHeadshotUrl(): string {
    const cvPhoto = findCvLibraryPhotoUrl();
    if (cvPhoto) return cvPhoto;

    const selectors = [
      ".candidate-photo img",
      ".profile-image img",
      ".cv-photo img",
      "img[class*='avatar']",
      "img[class*='photo']",
      "img[class*='profile']",
      "img[class*='headshot']",
      "[data-testid='candidate-photo'] img",
      "picture img",
    ];

    for (const selector of selectors) {
      const img = document.querySelector(selector) as HTMLImageElement | null;
      if (!img) continue;
      const src = resolveImgSrc(img);
      if (src) return src;
    }

    const ogImage = normalizeImgUrl(metaContent('meta[property="og:image"]'));
    return ogImage || "";
  }

  function findSummary(): string {
    const fromLabel = findLabelValue([
      "Personal statement",
      "Profile summary",
      "Summary",
      "About",
      "Profile",
      "Cover letter",
    ]);
    if (fromLabel) return fromLabel.slice(0, 10000);

    const selectors = [
      "[class*='personal-statement']",
      "[class*='profile-summary']",
      "[class*='candidate-summary']",
      "[class*='summary']",
      "[class*='about']",
      "[data-field='summary']",
      "#personal-statement",
    ];

    for (const selector of selectors) {
      const text = trim(document.querySelector(selector)?.textContent || "");
      if (text.length > 30) return text.slice(0, 10000);
    }

    return "";
  }

  function findExperience(): string {
    const headings = ["Experience", "Employment history", "Work history", "Career history"];
    for (const heading of headings) {
      for (const el of document.querySelectorAll("h2, h3, h4, strong, b")) {
        if (!new RegExp(`^${heading}$`, "i").test(trim(el.textContent || ""))) continue;

        const section =
          el.closest("section, article, div")?.parentElement || el.parentElement?.parentElement;
        const text = trim(section?.textContent || el.parentElement?.textContent || "");
        if (text.length > 40) return text.slice(0, 8000);
      }
    }

    const experienceEl = document.querySelector(
      "[class*='experience'], [class*='employment'], [class*='work-history'], [data-field='experience']"
    );
    return trim(experienceEl?.textContent || "").slice(0, 8000);
  }

  function findJobTitle(): string {
    const desired = findViewCvDetailValue(["Desired Job Title", "Desired job title", "Desired role"]);
    const current = findViewCvDetailValue(["Current Job Title", "Current job title", "Current role"]);
    if (desired && !/^n\/a$/i.test(desired)) return desired;
    if (current && !/^n\/a$/i.test(current)) return current;

    const fromLabel = findLabelValue([
      "Desired job title",
      "Desired role",
      "Current job title",
      "Current role",
      "Job title",
      "Headline",
    ]);
    if (fromLabel && !/^n\/a$/i.test(fromLabel)) return fromLabel;

    const selectors = [
      "[class*='desired-role']",
      "[class*='desired-job']",
      "[class*='current-role']",
      "[class*='job-title']",
      ".headline",
      "[data-field='job-title']",
    ];

    for (const selector of selectors) {
      const text = trim(document.querySelector(selector)?.textContent || "");
      if (text && text.length < 200) return text;
    }

    return trim(metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]'));
  }

  function findLocation(): string {
    const town =
      findViewCvDetailValue(["Town", "City", "Location"]) || findLabelValue(["Town", "City", "Location"]);
    const county =
      findViewCvDetailValue(["County", "Region"]) || findLabelValue(["County", "Region"]);
    const combined = [town, county].filter((part) => part && !/^n\/a$/i.test(part)).join(", ");
    if (combined) return combined;

    return trim(
      document.querySelector("[class*='location'], [data-field='location'], .candidate-location")
        ?.textContent || ""
    );
  }

  function findEmail(): string {
    const fromViewCv = findViewCvDetailValue(["Email", "E-mail"]);
    if (fromViewCv && /@/.test(fromViewCv)) return fromViewCv;

    const scopedMailLink = document.querySelector(
      ".cv-candidate-details a[href^='mailto:'], .view-cv-details-personal a[href^='mailto:']"
    ) as HTMLAnchorElement | null;
    if (scopedMailLink?.href) {
      const raw = scopedMailLink.href.replace(/^mailto:/i, "").split("?")[0];
      try {
        const decoded = trim(decodeURIComponent(raw));
        if (decoded.includes("@")) return decoded;
      } catch {
        if (raw.includes("@")) return trim(raw);
      }
    }

    const mailLink = document.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
    if (mailLink?.href) {
      const raw = mailLink.href.replace(/^mailto:/i, "").split("?")[0];
      try {
        return trim(decodeURIComponent(raw));
      } catch {
        return trim(raw);
      }
    }

    const fromLabel = findLabelValue(["Email", "E-mail"]);
    if (fromLabel && /@/.test(fromLabel)) return fromLabel;

    const emailEl = document.querySelector("[class*='email'], [data-field='email']");
    const text = trim(emailEl?.textContent || "");
    if (/@/.test(text)) return text;

    return "";
  }

  function findPhone(): string {
    const fromViewCv =
      findViewCvDetailValue(["Main Phone", "Mobile", "Telephone", "Phone", "Tel", "Optional Phone"]) ||
      "";
    if (fromViewCv && /\d/.test(fromViewCv)) return fromViewCv;

    const scopedTelLink = document.querySelector(
      ".cv-candidate-details a[href^='tel:'], .view-cv-details-personal a[href^='tel:']"
    ) as HTMLAnchorElement | null;
    if (scopedTelLink?.href) return trim(scopedTelLink.href.replace(/^tel:/i, ""));

    const telLink = document.querySelector("a[href^='tel:']") as HTMLAnchorElement | null;
    if (telLink?.href) return trim(telLink.href.replace(/^tel:/i, ""));

    const fromLabel = findLabelValue([
      "Main Phone",
      "Mobile",
      "Telephone",
      "Phone",
      "Tel",
      "Optional Phone",
    ]);
    if (fromLabel && /\d/.test(fromLabel)) return fromLabel;

    const phoneEl = document.querySelector("[class*='phone'], [class*='telephone'], [data-field='phone']");
    const text = trim(phoneEl?.textContent || "");
    if (/\d/.test(text)) return text;

    return "";
  }

  const embedded = parseEmbeddedJson();
  const domName = findNameFromDom();

  const firstName = embedded.firstName || domName.firstName;
  const lastName = embedded.lastName || domName.lastName;
  const email = embedded.email || findEmail();
  const phone = embedded.phone || findPhone();
  const jobTitle = embedded.jobTitle || findJobTitle();
  const location = embedded.location || findLocation();
  const summary = embedded.summary || findSummary();
  const experience = findExperience();
  const headshotUrl = findHeadshotUrl();

  function findCvDownloadLink(): string {
    function isCvHref(href: string): boolean {
      const lower = href.toLowerCase();
      if (/logo|icon|help|privacy/i.test(lower)) return false;
      return (
        /cgi-bin\/cvdownload/i.test(lower) ||
        /\/cv\//i.test(lower) ||
        /cvdownload|downloadcv|getcv|viewcv/i.test(lower) ||
        /\.(pdf|docx?|rtf)(\?|$)/i.test(lower) ||
        (/download/i.test(lower) && /cv|cand|resume/i.test(lower))
      );
    }

    for (const el of document.querySelectorAll(
      "a[href], button[data-href], [data-download-url], form[action]"
    )) {
      const href =
        (el as HTMLAnchorElement).href ||
        el.getAttribute("data-href") ||
        el.getAttribute("data-download-url") ||
        el.getAttribute("action") ||
        "";
      if (!href) continue;
      if (isCvHref(href)) {
        return href.startsWith("/") ? `${window.location.origin}${href}` : href;
      }
      const text = trim(el.textContent || "").toLowerCase();
      if (/download\s*cv|download cv|view cv|get cv|original cv/i.test(text) && href.startsWith("http")) {
        return href;
      }
    }

    const pageUrl = window.location.href;
    const idMatch =
      pageUrl.match(/cv-library\.co\.uk\/candidate\/(\d+)/i) ||
      pageUrl.match(/cv-library\.co\.uk\/(?:cvview|recruiter\/candidate)\/(\d+)/i) ||
      pageUrl.match(/[?&](?:cand(?:idate)?_?id|candidate_id)=(\d+)/i);
    if (idMatch?.[1]) {
      return `${window.location.origin}/cgi-bin/cvdownload.cgi?cand_id=${idMatch[1]}`;
    }

    return "";
  }

  const cvLink = findCvDownloadLink();

  return {
    firstName,
    lastName,
    email,
    phone,
    jobTitle,
    location,
    profileUrl: window.location.href.split("#")[0].split("?")[0],
    cvUrl: cvLink,
    headshotUrl,
    summary,
    experience,
  };
}

export function extractIndeedProfile(): Record<string, string> {
  // employers.indeed.com/candidates/view — the employer-side applicant review page.
  // A different app to the jobseeker resume pages below: name/location come from a
  // structured React nameplate, but email/phone/experience only exist inside the
  // candidate's CV, which Indeed renders client-side via react-pdf (canvas + a
  // `.textLayer` of positioned text spans). We read that rendered text layer rather
  // than fetching the PDF ourselves — the CV file itself is fetched separately (see
  // indeed-cv.ts) from the "Download CV" link, which is a page-local blob: URL.
  //
  // NOTE: this must stay a function declared *inside* extractIndeedProfile (not a
  // sibling top-level function) — chrome.scripting.executeScript({ func }) serializes
  // only that one function's source and injects it standalone, so a call out to a
  // separate top-level helper throws "not defined" and silently kills extraction.
  function extractIndeedEmployerProfile(): Record<string, string> {
    function trim(value: string | null | undefined): string {
      return (value || "").replace(/\s+/g, " ").trim();
    }

    const namePlate = document.querySelector('[data-testid="namePlate"]');
    const fullName = trim(namePlate?.querySelector("h2")?.textContent || "");
    const parts = fullName.split(" ").filter(Boolean);

    const location = trim(
      namePlate?.querySelector('[data-testid="name-plate-item"]')?.textContent || ""
    );

    const appliedToLink = document.querySelector("a[href*='/jobs/view']");
    const jobTitle = trim(appliedToLink?.textContent || "").split(/\s*•\s*/)[0] || "";

    // react-pdf's text layer renders one <span> per line separated by <br>s, with no
    // whitespace of its own between them — .textContent alone runs lines together
    // (e.g. "...gmail.com" + "LinkedIn: ..." becomes one glued token), which corrupts
    // regex matches like the email below. Rebuild line breaks from the <br>s first.
    function textLayerText(layer: Element): string {
      let text = "";
      for (const node of Array.from(layer.childNodes)) {
        text +=
          node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR"
            ? "\n"
            : node.textContent || "";
      }
      return text;
    }

    const cvText = Array.from(document.querySelectorAll(".textLayer"))
      .map(textLayerText)
      .join("\n");

    const emailMatch = cvText.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = cvText.match(/(\+?\d[\d\s().-]{8,}\d)/);

    const downloadCvLink = Array.from(document.querySelectorAll("a")).find(
      (a) => a.href.startsWith("blob:") && /download cv/i.test(a.textContent || "")
    ) as HTMLAnchorElement | undefined;

    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || "",
      email: emailMatch?.[0] || "",
      phone: trim(phoneMatch?.[1] || ""),
      jobTitle,
      location,
      profileUrl: window.location.href.split("#")[0],
      cvUrl: downloadCvLink?.href || "",
      summary: "",
      experience: trim(cvText).slice(0, 8000),
    };
  }

  if (/(?:^|\.)employers\.indeed\.com$/i.test(window.location.hostname)) {
    return extractIndeedEmployerProfile();
  }

  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  const nameEl =
    document.querySelector("[class*='applicant-name']") ||
    document.querySelector("[class*='candidate-name']") ||
    document.querySelector("h1");
  const fullName = trim(nameEl?.textContent || "");
  const parts = fullName.split(" ").filter(Boolean);

  const emailEl = document.querySelector(
    "a[href^='mailto:'], [class*='email'], [data-testid*='email']"
  );
  const phoneEl = document.querySelector(
    "a[href^='tel:'], [class*='phone'], [data-testid*='phone']"
  );

  function isIndeedGenericImage(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      /share-image|indeed-share|logo|icon|sprite|placeholder|default-avatar/i.test(lower) ||
      /contentstack\.io\/.*share/i.test(lower)
    );
  }

  function findIndeedHeadshotUrl(): string {
    const selectors = [
      'img[data-testid*="profile"]',
      'img[data-testid*="avatar"]',
      'img[data-testid*="headshot"]',
      'img[data-testid*="photo"]',
      "[class*='resume-photo'] img",
      "[class*='applicant-photo'] img",
      "[class*='profile-photo'] img",
      "[class*='profile-picture'] img",
      "[class*='avatar'] img",
      "[class*='photo'] img",
    ];

    for (const selector of selectors) {
      const img = document.querySelector(selector);
      if (!(img instanceof HTMLImageElement)) continue;
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (src.startsWith("http") && !isIndeedGenericImage(src)) return src;
    }

    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
    if (ogImage.startsWith("http") && !isIndeedGenericImage(ogImage)) return ogImage;

    return "";
  }

  const headshotUrl = findIndeedHeadshotUrl();

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
    email:
      trim(emailEl?.textContent || "") ||
      (emailEl as HTMLAnchorElement)?.href?.replace(/^mailto:/i, "") ||
      "",
    phone:
      trim(phoneEl?.textContent || "") ||
      (phoneEl as HTMLAnchorElement)?.href?.replace(/^tel:/i, "") ||
      "",
    jobTitle: trim(
      document.querySelector("[class*='headline'], [class*='job-title'], [class*='desiredTitle']")
        ?.textContent || ""
    ),
    location: trim(
      document.querySelector("[class*='location'], [data-testid*='location']")?.textContent || ""
    ),
    profileUrl: window.location.href.split("?")[0],
    cvUrl:
      (document.querySelector("a[href*='resume'], a[href*='.pdf']") as HTMLAnchorElement)?.href ||
      window.location.href,
    headshotUrl: headshotUrl.startsWith("http") ? headshotUrl : "",
    summary: trim(
      document.querySelector("[class*='summary'], [class*='about'], [class*='resume-summary']")
        ?.textContent || ""
    ),
    experience: trim(
      document.querySelector("[class*='experience'], [class*='work-history']")?.textContent || ""
    ).slice(0, 8000),
  };
}

/**
 * Self-contained — extracts candidate data from Edun or Vincere recruiter CRM pages.
 * Used for CRM → Applybox migration while the user is logged into their old system.
 */
export function extractCrmMigrationProfile(crmSource: string): Record<string, string> {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function decodeEmail(raw: string): string {
    try {
      return trim(decodeURIComponent(raw.replace(/^mailto:/i, "").split("?")[0]));
    } catch {
      return trim(raw.replace(/^mailto:/i, "").split("?")[0]);
    }
  }

  function valueFromRow(labelEl: Element): string {
    const next = labelEl.nextElementSibling;
    if (next) {
      const text = trim(next.textContent || "");
      if (text && text.length < 500) return text;
    }
    const parent = labelEl.parentElement;
    if (parent) {
      const combined = trim(parent.textContent || "");
      const labelText = trim(labelEl.textContent || "");
      if (combined.startsWith(labelText)) {
        return trim(combined.slice(labelText.length).replace(/^[:–—-]\s*/, ""));
      }
    }
    return "";
  }

  function findLabelValue(labels: string[]): string {
    const labelPattern = labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(`^(${labelPattern})\\s*:?\\s*$`, "i");

    for (const el of document.querySelectorAll(
      "dt, th, label, span, p, div, li, strong, b, [class*='label'], [class*='field-label']"
    )) {
      const text = trim(el.textContent || "");
      if (!text || text.length > 80 || !re.test(text)) continue;
      const value = valueFromRow(el);
      if (value && !/^n\/a$/i.test(value)) return value;
    }

    for (const row of document.querySelectorAll(
      "[class*='detail-row'], [class*='field-row'], [class*='info-row'], .vcvdp-div, tr"
    )) {
      const left = row.querySelector(
        "[class*='left'], [class*='label'], th, dt, label, [class*='field-label']"
      );
      const right = row.querySelector(
        "[class*='right'], [class*='value'], td, dd, [class*='field-value']"
      );
      if (!left || !right) continue;
      const labelText = trim(left.textContent || "");
      if (!re.test(labelText)) continue;
      const mail = right.querySelector("a[href^='mailto:']") as HTMLAnchorElement | null;
      if (mail?.href) return decodeEmail(mail.href);
      const tel = right.querySelector("a[href^='tel:']") as HTMLAnchorElement | null;
      if (tel?.href) return trim(tel.href.replace(/^tel:/i, ""));
      const text = trim(right.textContent || "");
      if (text && !/^n\/a$/i.test(text)) return text;
    }

    return "";
  }

  function findEmail(): string {
    for (const mail of document.querySelectorAll("a[href^='mailto:']")) {
      const href = (mail as HTMLAnchorElement).href;
      const decoded = decodeEmail(href);
      if (decoded.includes("@")) return decoded;
    }
    const fromLabel = findLabelValue(["Email", "E-mail", "Email address", "Primary email"]);
    if (fromLabel.includes("@")) return fromLabel;
    const input = document.querySelector(
      "input[type='email'], input[name*='email' i]"
    ) as HTMLInputElement | null;
    return trim(input?.value || "");
  }

  function findPhone(): string {
    for (const tel of document.querySelectorAll("a[href^='tel:']")) {
      const phone = trim((tel as HTMLAnchorElement).href.replace(/^tel:/i, ""));
      if (/\d/.test(phone)) return phone;
    }
    const fromLabel = findLabelValue([
      "Phone",
      "Mobile",
      "Telephone",
      "Main Phone",
      "Cell",
      "Contact number",
    ]);
    if (fromLabel && /\d/.test(fromLabel)) return fromLabel;
    const input = document.querySelector(
      "input[type='tel'], input[name*='phone' i], input[name*='mobile' i]"
    ) as HTMLInputElement | null;
    return trim(input?.value || "");
  }

  function findName(): { firstName: string; lastName: string } {
    const selectors = [
      "h1",
      "[class*='candidate-name']",
      "[class*='applicant-name']",
      "[class*='profile-name']",
      "[class*='contact-name']",
      "[data-testid*='candidate-name']",
      "[data-testid*='name']",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const fullName = trim(el?.textContent || "");
      if (fullName && fullName.length > 1 && fullName.length < 80 && !/sign in|login|dashboard/i.test(fullName)) {
        const parts = fullName.split(" ").filter(Boolean);
        return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
      }
    }
    const first = findLabelValue(["First name", "First Name", "Given name"]);
    const last = findLabelValue(["Last name", "Last Name", "Surname", "Family name"]);
    if (first || last) return { firstName: first, lastName: last };
    return { firstName: "", lastName: "" };
  }

  const crm = (crmSource || "").toLowerCase();
  const { firstName, lastName } = findName();
  const email = findEmail();
  const phone = findPhone();
  const jobTitle = findLabelValue([
    "Job title",
    "Current job title",
    "Desired job title",
    "Position",
    "Role",
    "Headline",
    "Occupation",
  ]);
  const city = findLabelValue(["City", "Town", "Suburb"]);
  const region = findLabelValue(["County", "State", "Region", "Country"]);
  const location = [city, region].filter(Boolean).join(", ");

  const summary = findLabelValue([
    "Summary",
    "Profile",
    "About",
    "Personal statement",
    "Overview",
    "Bio",
  ]) || trim(
    document.querySelector(
      "[class*='summary'], [class*='about'], [class*='profile-summary'], [class*='personal-statement']"
    )?.textContent || ""
  ).slice(0, 10000);

  const experience = trim(
    document.querySelector(
      "[class*='experience'], [class*='employment'], [class*='work-history'], [class*='career']"
    )?.textContent || ""
  ).slice(0, 8000);

  const headshotEl =
    document.querySelector(
      "[class*='avatar'] img, [class*='profile-picture'] img, [class*='photo'] img, [class*='headshot'] img"
    ) || document.querySelector('meta[property="og:image"]');
  const headshotUrl =
    headshotEl instanceof HTMLImageElement
      ? headshotEl.currentSrc || headshotEl.src || ""
      : headshotEl?.getAttribute("content") || "";

  const cvLink =
    (document.querySelector(
      "a[href*='.pdf'], a[href*='.doc'], a[href*='resume'], a[href*='cv'], a[href*='download']"
    ) as HTMLAnchorElement | null)?.href || "";

  return {
    firstName,
    lastName,
    email,
    phone,
    jobTitle,
    location,
    summary,
    experience,
    profileUrl: window.location.href.split("#")[0].split("?")[0],
    cvUrl: cvLink,
    headshotUrl: headshotUrl.startsWith("http") ? headshotUrl : "",
    migrationSource: crm,
    migrationNote: "Imported from previous CRM during migration",
  };
}

export const PAGE_EXTRACTORS = {
  linkedin: extractLinkedInProfile,
  cvlibrary: extractCVLibraryProfile,
  indeed: extractIndeedProfile,
  vincere: extractVincereProfile,
  edun: extractEdunProfile,
} as const;

function extractVincereProfile(): Record<string, string> {
  return extractCrmMigrationProfile("vincere");
}

function extractEdunProfile(): Record<string, string> {
  return extractCrmMigrationProfile("edun");
}
