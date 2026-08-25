// app.js — routing + rendering + the Discover/Scan AI workflow.

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const HEADER_TITLES = {
  home: ["Crystal Palace FC", "Palace Cards"],
  collection: ["My Collection", "Collection"],
  wishlist: ["Cards I Want", "Wishlist"],
  discover: ["Crystal Palace Card Discovery", "Scout"],
  players: ["By Player", "Players"],
  sets: ["By Product / Set", "Products & Sets"],
  more: ["Palace Cards", "More"]
};

let state = {
  tab: "home",
  editingCardId: null,
  editingStatus: "collection",
  scanImage: null, // { base64, mediaType, dataUrl }
  scanResult: null,
  collectionFilter: "all",
  collectionSearch: "",
  wishlistFilter: "all"
};

// ---------------- Tab routing ----------------

function switchTab(tab) {
  if (!HEADER_TITLES[tab]) return;
  state.tab = tab;
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById("screen-" + tab).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  const [eyebrow, title] = HEADER_TITLES[tab];
  document.getElementById("header-eyebrow").textContent = eyebrow;
  document.getElementById("header-title").textContent = title;
  refreshCurrentTab();
}

document.querySelectorAll("[data-tab]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    switchTab(el.dataset.tab);
  });
});

document.getElementById("fab-scan").addEventListener("click", () => switchTab("discover"));
document.getElementById("open-settings").addEventListener("click", openSettings);

function refreshCurrentTab() {
  if (state.tab === "home") renderHome();
  if (state.tab === "collection") renderCollection();
  if (state.tab === "wishlist") renderWishlist();
  if (state.tab === "players") renderPlayers();
  if (state.tab === "sets") renderSets();
}

// ---------------- Helpers ----------------

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function isHit(card) {
  return !!(card.autograph || card.relic || (card.numbered && card.numbered.trim()));
}

function cardMetaLine(card) {
  return [card.season, card.manufacturer, card.product].filter(Boolean).join(" · ");
}

function cardBadges(card) {
  let html = "";
  if (card.autograph) html += `<span class="badge badge-gold">Auto</span>`;
  if (card.relic) html += `<span class="badge badge-gold">Relic</span>`;
  if (card.numbered) html += `<span class="badge badge-gold serial-tag">${esc(card.numbered)}</span>`;
  if (card.variant) html += `<span class="badge">${esc(card.variant)}</span>`;
  if (card.status === "wishlist" && card.priority) {
    const cls = card.priority === "High" ? "badge-red" : "";
    html += `<span class="badge ${cls}">${esc(card.priority)} priority</span>`;
  }
  return html;
}

function cardTileHTML(card) {
  const thumb = card.imageDataUrl
    ? `<img src="${card.imageDataUrl}" alt="" />`
    : "🎴";
  return `
    <div class="card-tile ${isHit(card) ? "is-hit" : ""}" data-id="${card.id}">
      <div class="card-thumb">${thumb}</div>
      <div class="card-info">
        <div class="player-name">${esc(card.player || "Unidentified card")}</div>
        <div class="card-meta">${esc(cardMetaLine(card)) || "No details yet"}</div>
        <div class="badge-row">${cardBadges(card)}</div>
      </div>
      <div class="card-chevron">›</div>
    </div>`;
}

function attachTileHandlers(container, list) {
  container.querySelectorAll(".card-tile").forEach((el) => {
    el.addEventListener("click", () => {
      const card = list.find((c) => c.id === el.dataset.id);
      if (card) openCardSheet(card, card.status);
    });
  });
}

// ---------------- Home ----------------

async function renderHome() {
  const all = await DB.allCards();
  const owned = all.filter((c) => c.status === "collection");
  const wanted = all.filter((c) => c.status === "wishlist");
  const hits = owned.filter(isHit);
  const totalValue = owned.reduce((sum, c) => sum + (Number(c.estimatedValue) || 0), 0);

  document.getElementById("stat-owned").textContent = owned.length;
  document.getElementById("stat-wishlist").textContent = wanted.length;
  document.getElementById("stat-value").textContent = "£" + totalValue.toLocaleString();
  document.getElementById("stat-hits").textContent = hits.length;

  const recent = [...owned].sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || "")).slice(0, 5);
  const recentEl = document.getElementById("home-recent");
  if (recent.length === 0) {
    recentEl.innerHTML = emptyState("🎴", "No cards yet", "Scan your first card or add one manually to get started.", "Scan a card", "discover");
    attachEmptyStateHandler(recentEl);
  } else {
    recentEl.innerHTML = recent.map(cardTileHTML).join("");
    attachTileHandlers(recentEl, owned);
  }
}

function emptyState(icon, title, body, ctaLabel, ctaTab) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      ${ctaLabel ? `<button class="btn btn-primary" data-goto="${ctaTab}">${esc(ctaLabel)}</button>` : ""}
    </div>`;
}

function attachEmptyStateHandler(container) {
  const btn = container.querySelector("[data-goto]");
  if (btn) btn.addEventListener("click", () => switchTab(btn.dataset.goto));
}

// ---------------- Collection ----------------

async function renderCollection() {
  const owned = await DB.byStatus("collection");
  const seasons = [...new Set(owned.map((c) => c.season).filter(Boolean))].sort().reverse();

  const filterEl = document.getElementById("collection-filters");
  const chips = ["all", ...seasons, "hits"];
  filterEl.innerHTML = chips.map((c) => {
    const label = c === "all" ? "All" : c === "hits" ? "Hits only" : c;
    return `<button class="chip ${state.collectionFilter === c ? "active" : ""}" data-filter="${esc(c)}">${esc(label)}</button>`;
  }).join("");
  filterEl.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.collectionFilter = chip.dataset.filter;
      renderCollection();
    });
  });

  let filtered = owned;
  if (state.collectionFilter === "hits") filtered = filtered.filter(isHit);
  else if (state.collectionFilter !== "all") filtered = filtered.filter((c) => c.season === state.collectionFilter);

  const q = state.collectionSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((c) =>
      [c.player, c.product, c.manufacturer, c.cardType, c.variant, c.season]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => (b.dateAdded || "").localeCompare(a.dateAdded || ""));

  const listEl = document.getElementById("collection-list");
  if (filtered.length === 0) {
    listEl.innerHTML = owned.length === 0
      ? emptyState("🎴", "No cards yet", "Scan your first card or add one manually.", "Scan a card", "discover")
      : emptyState("🔎", "No matches", "Try a different search or filter.", null, null);
    attachEmptyStateHandler(listEl);
  } else {
    listEl.innerHTML = filtered.map(cardTileHTML).join("");
    attachTileHandlers(listEl, filtered);
  }
}

document.getElementById("collection-search").addEventListener("input", (e) => {
  state.collectionSearch = e.target.value;
  renderCollection();
});

// ---------------- Wishlist ----------------

async function renderWishlist() {
  await renderSavedSearches();
  const wanted = await DB.byStatus("wishlist");

  const filterEl = document.getElementById("wishlist-filters");
  const chips = ["all", "High", "Medium", "Low"];
  filterEl.innerHTML = chips.map((c) =>
    `<button class="chip ${state.wishlistFilter === c ? "active" : ""}" data-filter="${esc(c)}">${c === "all" ? "All" : c}</button>`
  ).join("");
  filterEl.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.wishlistFilter = chip.dataset.filter;
      renderWishlist();
    });
  });

  let filtered = wanted;
  if (state.wishlistFilter !== "all") filtered = filtered.filter((c) => c.priority === state.wishlistFilter);
  filtered.sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  const listEl = document.getElementById("wishlist-list");
  if (filtered.length === 0) {
    listEl.innerHTML = wanted.length === 0
      ? emptyState("⭐", "Wishlist is empty", "Add cards you're chasing — set a priority and target price.", "Scan a card", "discover")
      : emptyState("🔎", "No matches", "Try a different filter.", null, null);
    attachEmptyStateHandler(listEl);
  } else {
    listEl.innerHTML = filtered.map((c) => cardTileHTML(c).replace(
      "</div>\n      <div class=\"card-chevron\">",
      c.targetPrice ? `<div style="font-size:12px;color:var(--text-dim);margin-top:5px">Target: £${esc(c.targetPrice)}</div></div>\n      <div class="card-chevron">` : `</div>\n      <div class="card-chevron">`
    )).join("");
    attachTileHandlers(listEl, filtered);
  }
}

// ---------------- Players ----------------

async function renderPlayers() {
  const all = await DB.allCards();
  const byPlayer = {};
  all.forEach((c) => {
    const name = (c.player || "Unknown player").trim();
    if (!byPlayer[name]) byPlayer[name] = { owned: 0, wanted: 0 };
    if (c.status === "collection") byPlayer[name].owned++;
    else byPlayer[name].wanted++;
  });
  const names = Object.keys(byPlayer).sort((a, b) => byPlayer[b].owned - byPlayer[a].owned);

  const el = document.getElementById("players-list");
  if (names.length === 0) {
    el.innerHTML = emptyState("👤", "No players yet", "Add cards to see your progress by player.", null, null);
    return;
  }
  el.innerHTML = names.map((name) => {
    const d = byPlayer[name];
    const total = d.owned + d.wanted;
    const pct = total ? Math.round((d.owned / total) * 100) : 0;
    return `
      <div class="summary-tile" style="display:block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="s-name">${esc(name)}</div>
            <div class="s-sub">${d.owned} owned${d.wanted ? ` · ${d.wanted} wanted` : ""}</div>
          </div>
          <div class="s-count">${d.owned}</div>
        </div>
        ${d.wanted ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` : ""}
      </div>`;
  }).join("");
}

// ---------------- Sets ----------------

async function renderSets() {
  const all = await DB.allCards();
  const owned = all.filter((c) => c.status === "collection");
  const bySet = {};
  owned.forEach((c) => {
    const key = [c.season, c.manufacturer, c.product].filter(Boolean).join(" ") || "Unsorted";
    if (!bySet[key]) bySet[key] = { count: 0, hits: 0 };
    bySet[key].count++;
    if (isHit(c)) bySet[key].hits++;
  });
  const keys = Object.keys(bySet).sort((a, b) => bySet[b].count - bySet[a].count);

  const el = document.getElementById("sets-list");
  if (keys.length === 0) {
    el.innerHTML = emptyState("📦", "No sets yet", "Add cards to see them grouped by product/set.", null, null);
    return;
  }
  el.innerHTML = keys.map((key) => {
    const d = bySet[key];
    return `
      <div class="summary-tile">
        <div>
          <div class="s-name">${esc(key)}</div>
          <div class="s-sub">${d.hits ? `${d.hits} hit${d.hits > 1 ? "s" : ""} · ` : ""}${d.count} card${d.count > 1 ? "s" : ""}</div>
        </div>
        <div class="s-count">${d.count}</div>
      </div>`;
  }).join("");
}

// ---------------- Card sheet (add / edit) ----------------

const cardSheet = document.getElementById("card-sheet");
const cardSheetBackdrop = document.getElementById("sheet-backdrop");

function openCardSheet(card, status) {
  state.editingCardId = card && card.id ? card.id : null;
  state.editingStatus = status || "collection";

  document.getElementById("card-sheet-title").textContent =
    state.editingCardId ? "Edit card" : (status === "wishlist" ? "Add to wishlist" : "Add card");

  const f = (id) => document.getElementById(id);
  f("f-player").value = card?.player || "";
  f("f-club").value = card?.club || "Crystal Palace";
  f("f-season").value = card?.season || "";
  f("f-manufacturer").value = card?.manufacturer || "";
  f("f-product").value = card?.product || "";
  f("f-cardtype").value = card?.cardType || "";
  f("f-cardnumber").value = card?.cardNumber || "";
  f("f-variant").value = card?.variant || "";
  f("f-numbered").value = card?.numbered || "";
  setSwitch("f-autograph", !!card?.autograph);
  setSwitch("f-relic", !!card?.relic);
  f("f-priority").value = card?.priority || "Medium";
  f("f-targetprice").value = card?.targetPrice ?? "";
  f("f-value").value = card?.estimatedValue ?? "";
  f("f-notes").value = card?.notes || "";

  document.getElementById("wishlist-only-fields").style.display = state.editingStatus === "wishlist" ? "block" : "none";
  document.getElementById("wishlist-price-row").style.display = state.editingStatus === "wishlist" ? "flex" : "none";
  document.getElementById("collection-value-field").style.display = state.editingStatus === "wishlist" ? "none" : "block";

  const imgWrap = document.getElementById("card-sheet-image-wrap");
  imgWrap.innerHTML = card?.imageDataUrl ? `<img src="${card.imageDataUrl}" class="scan-preview" style="max-height:200px" />` : "";

  document.getElementById("btn-delete-card").style.display = state.editingCardId ? "inline-flex" : "none";
  document.getElementById("btn-find-similar").style.display =
    (state.editingCardId && state.editingStatus === "wishlist") ? "block" : "none";

  cardSheet.classList.add("active");
  cardSheetBackdrop.classList.add("active");
}

function closeCardSheet() {
  cardSheet.classList.remove("active");
  cardSheetBackdrop.classList.remove("active");
  state.editingCardId = null;
}

function setSwitch(id, on) {
  const el = document.getElementById(id);
  el.classList.toggle("on", !!on);
  el.dataset.on = on ? "1" : "0";
}
document.querySelectorAll(".switch").forEach((el) => {
  el.addEventListener("click", () => setSwitch(el.id, el.dataset.on !== "1"));
});

document.getElementById("card-sheet-close").addEventListener("click", closeCardSheet);
cardSheetBackdrop.addEventListener("click", closeCardSheet);

document.getElementById("btn-save-card").addEventListener("click", async () => {
  const f = (id) => document.getElementById(id).value.trim();
  const existing = state.editingCardId ? await DB.getCard(state.editingCardId) : null;

  const card = {
    id: state.editingCardId || undefined,
    status: state.editingStatus,
    player: f("f-player"),
    club: f("f-club") || "Crystal Palace",
    season: f("f-season"),
    manufacturer: f("f-manufacturer"),
    product: f("f-product"),
    cardType: f("f-cardtype"),
    cardNumber: f("f-cardnumber"),
    variant: f("f-variant"),
    numbered: f("f-numbered"),
    autograph: document.getElementById("f-autograph").dataset.on === "1",
    relic: document.getElementById("f-relic").dataset.on === "1",
    priority: f("f-priority"),
    targetPrice: f("f-targetprice") ? Number(f("f-targetprice")) : null,
    estimatedValue: f("f-value") ? Number(f("f-value")) : null,
    notes: f("f-notes"),
    imageDataUrl: existing?.imageDataUrl || (state.scanImage ? state.scanImage.dataUrl : null),
    confidence: existing?.confidence ?? (state.scanResult ? state.scanResult.confidence : null),
    dateAdded: existing?.dateAdded
  };

  if (!card.player && !card.product && !card.cardNumber) {
    alert("Add at least a player name or a product/set before saving.");
    return;
  }

  await DB.saveCard(card);
  closeCardSheet();
  resetDiscoverScreen();
  switchTab(state.editingStatus === "wishlist" ? "wishlist" : "collection");
});

document.getElementById("btn-delete-card").addEventListener("click", async () => {
  if (!state.editingCardId) return;
  if (!confirm("Delete this card? This can't be undone.")) return;
  await DB.deleteCard(state.editingCardId);
  const status = state.editingStatus;
  closeCardSheet();
  switchTab(status === "wishlist" ? "wishlist" : "collection");
});

// ---------------- Find Similar (structure only — matching engine lives in scout-brain.js) ----------------

const findSimilarSheet = document.getElementById("find-similar-sheet");
const findSimilarBackdrop = document.getElementById("find-similar-backdrop");

async function openFindSimilar(card) {
  document.getElementById("find-similar-source").innerHTML = cardTileHTML(card);

  const fields = ScoutBrain.matchFields(card);
  const fieldsHtml = fields.length
    ? `<div class="result-grid" style="margin-top:0">${fields.map((f) => `
        <div class="result-item">
          <div class="r-label">${esc(f.label)}</div>
          <div class="r-value">${esc(f.value)}</div>
        </div>`).join("")}</div>`
    : "";

  const allCards = await DB.allCards();
  const tierResults = await ScoutBrain.findSimilar(card, allCards);

  document.getElementById("find-similar-tiers").innerHTML =
    `<div class="section-title" style="margin-top:18px">Matching on</div>${fieldsHtml}` +
    `<div class="note-box" style="margin-top:16px">Tier 1 now matches against your own collection and wishlist (same set/release, season and card type). The remaining tiers are still ready to receive real results, ranked most to least similar.</div>` +
    ScoutBrain.TIERS.map((tier, i) => {
      const result = tierResults.find((r) => r.tierId === tier.id);
      const cards = result ? result.cards : [];
      return `
        <div class="section-title" style="margin-top:20px">${i + 1}. ${esc(tier.label)}</div>
        <div style="font-size:12px;color:var(--text-dim);margin:-4px 0 8px">${esc(tier.description)}</div>
        ${cards.length
          ? cards.map(cardTileHTML).join("")
          : `<div class="empty-state" style="padding:18px 10px"><p style="margin:0">Not built yet</p></div>`}
      `;
    }).join("");

  closeCardSheet();
  findSimilarSheet.classList.add("active");
  findSimilarBackdrop.classList.add("active");
}

function closeFindSimilar() {
  findSimilarSheet.classList.remove("active");
  findSimilarBackdrop.classList.remove("active");
}
document.getElementById("find-similar-close").addEventListener("click", closeFindSimilar);
findSimilarBackdrop.addEventListener("click", closeFindSimilar);

document.getElementById("btn-find-similar").addEventListener("click", async () => {
  if (!state.editingCardId) return;
  const card = await DB.getCard(state.editingCardId);
  if (card) openFindSimilar(card);
});

// Quick "add manually" entry points
document.getElementById("home-recent").addEventListener("dblclick", () => openCardSheet(null, "collection"));

// ---------------- Discover / Scan ----------------

const fileInput = document.getElementById("scan-file-input");
const previewImg = document.getElementById("scan-preview-img");

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(",")[1];
  state.scanImage = { base64, mediaType: file.type || "image/jpeg", dataUrl };
  state.scanResult = null;

  document.getElementById("discover-idle").querySelector(".scan-drop").style.display = "none";
  previewImg.src = dataUrl;
  document.getElementById("discover-preview").style.display = "block";
  document.getElementById("discover-analyze-row").style.display = "block";
  document.getElementById("discover-result").style.display = "none";
  document.getElementById("discover-error").style.display = "none";
});

document.getElementById("btn-rescan-photo").addEventListener("click", () => {
  fileInput.value = "";
  resetDiscoverScreen();
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resetDiscoverScreen() {
  state.scanImage = null;
  state.scanResult = null;
  fileInput.value = "";
  document.getElementById("discover-idle").querySelector(".scan-drop").style.display = "block";
  document.getElementById("scan-listing-text").value = "";
  document.getElementById("discover-preview").style.display = "none";
  document.getElementById("discover-analyze-row").style.display = "none";
  document.getElementById("discover-loading").style.display = "none";
  document.getElementById("discover-error").style.display = "none";
  document.getElementById("discover-result").style.display = "none";
}

document.getElementById("btn-analyze").addEventListener("click", async () => {
  if (!state.scanImage) return;
  const apiKey = await DB.getSetting("anthropicApiKey");

  document.getElementById("discover-analyze-row").style.display = "none";
  document.getElementById("discover-error").style.display = "none";
  document.getElementById("discover-result").style.display = "none";
  document.getElementById("discover-loading").style.display = "block";

  try {
    const result = await AI.recognizeCard({
      apiKey,
      imageBase64: state.scanImage.base64,
      mediaType: state.scanImage.mediaType,
      listingText: document.getElementById("scan-listing-text").value.trim()
    });
    state.scanResult = result;
    renderScanResult(result);
  } catch (err) {
    document.getElementById("discover-error").innerHTML =
      `<div class="error-box"><strong>Couldn't identify this card.</strong><br>${esc(err.message)}</div>`;
    document.getElementById("discover-error").style.display = "block";
    document.getElementById("discover-analyze-row").style.display = "block";
  } finally {
    document.getElementById("discover-loading").style.display = "none";
  }
});

function renderScanResult(r) {
  const conf = Math.max(0, Math.min(100, Number(r.confidence) || 0));
  const rows = [
    ["Player", r.player], ["Club", r.club], ["Season", r.season],
    ["Manufacturer", r.manufacturer], ["Product", r.product], ["Card #", r.cardNumber],
    ["Card type", r.cardType], ["Variant", r.variant], ["Numbered", r.numbered],
    ["Autograph", r.autograph === true ? "Yes" : r.autograph === false ? "No" : "Unknown"],
    ["Relic", r.relic === true ? "Yes" : r.relic === false ? "No" : "Unknown"]
  ];

  const el = document.getElementById("discover-result");
  el.innerHTML = `
    <div class="confidence-label"><span>Confidence</span><span>${conf}%</span></div>
    <div class="confidence-bar-track"><div class="confidence-bar-fill" style="width:${conf}%"></div></div>
    ${r.notes ? `<div class="note-box" style="margin-top:14px">${esc(r.notes)}</div>` : ""}
    <div class="result-grid">
      ${rows.map(([label, val]) => `
        <div class="result-item">
          <div class="r-label">${esc(label)}</div>
          <div class="r-value">${val === null || val === undefined || val === "" ? "—" : esc(val)}</div>
        </div>`).join("")}
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" id="btn-scan-edit">Edit</button>
      <button class="btn btn-ghost" id="btn-scan-ignore">Ignore</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary btn-block" id="btn-scan-wishlist">Add to wishlist</button>
      <button class="btn btn-primary btn-block" id="btn-scan-collection">Add to collection</button>
    </div>
  `;
  el.style.display = "block";

  const scanToCard = () => ({
    player: r.player, club: r.club || "Crystal Palace", season: r.season,
    manufacturer: r.manufacturer, product: r.product, cardType: r.cardType,
    cardNumber: r.cardNumber, variant: r.variant, numbered: r.numbered,
    autograph: !!r.autograph, relic: !!r.relic, notes: r.notes || ""
  });

  document.getElementById("btn-scan-edit").addEventListener("click", () => openCardSheet(scanToCard(), "collection"));
  document.getElementById("btn-scan-ignore").addEventListener("click", resetDiscoverScreen);
  document.getElementById("btn-scan-wishlist").addEventListener("click", () => openCardSheet(scanToCard(), "wishlist"));
  document.getElementById("btn-scan-collection").addEventListener("click", () => openCardSheet(scanToCard(), "collection"));
}

// ---------------- Settings ----------------

// ---------------- Scout: discovery method tiles ----------------

document.querySelectorAll("[data-scout-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.scoutAction;
    if (action === "scan") {
      document.querySelector('#discover-mode-toggle [data-mode="scan"]').click();
    } else {
      document.querySelector('#discover-mode-toggle [data-mode="search"]').click();
      ebaySearchInput.focus();
      ebaySearchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
});

// ---------------- Discover: mode toggle ----------------

document.querySelectorAll("#discover-mode-toggle .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#discover-mode-toggle .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const mode = chip.dataset.mode;
    document.getElementById("discover-search-mode").style.display = mode === "search" ? "block" : "none";
    document.getElementById("discover-scan-mode").style.display = mode === "scan" ? "block" : "none";
  });
});

// ---------------- Discover: eBay search ----------------

const ebaySearchInput = document.getElementById("ebay-search-input");

async function runEbaySearch(query) {
  query = (query || "").trim();
  if (!query) return;

  document.getElementById("search-error").style.display = "none";
  document.getElementById("search-results").innerHTML = "";
  document.getElementById("search-loading").style.display = "block";

  const otherLinksEl = document.getElementById("search-other-links");
  const fullQuery = /crystal palace/i.test(query) ? query : `Crystal Palace ${query}`;
  otherLinksEl.innerHTML = `
    <div class="btn-row" style="margin-top:0">
      <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${Ebay.vintedSearchUrl(fullQuery)}">Vinted ↗</a>
      <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${Ebay.depopSearchUrl(fullQuery)}">Depop ↗</a>
      <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="${Ebay.ebayWebSearchUrl(fullQuery)}">eBay ↗</a>
    </div>`;
  otherLinksEl.style.display = "block";

  try {
    const results = await Ebay.search(fullQuery, { sort: "newlyListed" });
    renderSearchResults(results, fullQuery);
  } catch (err) {
    document.getElementById("search-error").innerHTML =
      `<div class="error-box"><strong>Search didn't work.</strong><br>${esc(err.message)}</div>`;
    document.getElementById("search-error").style.display = "block";
  } finally {
    document.getElementById("search-loading").style.display = "none";
  }
}

function renderSearchResults(results, query, opts = {}) {
  const el = document.getElementById("search-results");
  if (results.length === 0) {
    el.innerHTML = emptyState("🔎", "No live results", "Try a broader search, or check the Vinted/eBay links above.", null, null);
    return;
  }
  const newIds = opts.newIds || null;
  el.innerHTML = `<div class="section-title" style="margin-top:18px">${results.length} result${results.length > 1 ? "s" : ""}${newIds ? ` · ${newIds.size} new since last check` : ""}</div>` +
    results.map((item) => `
      <div class="card-tile ${newIds && newIds.has(item.id) ? "is-hit" : ""}" data-item-id="${esc(item.id)}">
        <div class="card-thumb">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" />` : "🎴"}</div>
        <div class="card-info">
          <div class="player-name">${esc(item.title)}</div>
          <div class="card-meta">${esc(item.price || "Price n/a")}</div>
          <div class="badge-row">
            ${newIds && newIds.has(item.id) ? `<span class="badge badge-gold">New</span>` : ""}
            <button class="badge" data-action="view" data-url="${esc(item.itemWebUrl)}" style="cursor:pointer">View listing ↗</button>
            <button class="badge" data-action="identify" data-idx="${results.indexOf(item)}" style="cursor:pointer">✨ Identify</button>
            <button class="badge" data-action="want" data-idx="${results.indexOf(item)}" style="cursor:pointer">+ Wishlist</button>
          </div>
        </div>
      </div>`).join("");

  el.querySelectorAll('[data-action="view"]').forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); window.open(btn.dataset.url, "_blank", "noopener"); })
  );
  el.querySelectorAll('[data-action="want"]').forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = results[Number(btn.dataset.idx)];
      openCardSheet({ player: item.title, notes: item.itemWebUrl }, "wishlist");
    })
  );
  el.querySelectorAll('[data-action="identify"]').forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = results[Number(btn.dataset.idx)];
      await identifyFromListing(item);
    })
  );
}

async function identifyFromListing(item) {
  if (!item.imageUrl) {
    alert("This listing has no usable image — try Scan mode with a screenshot instead.");
    return;
  }
  const apiKey = await DB.getSetting("anthropicApiKey");
  if (!apiKey) {
    alert("Add your Anthropic API key in Settings first.");
    return;
  }
  try {
    const resp = await fetch(item.imageUrl);
    const blob = await resp.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    state.scanImage = { base64: dataUrl.split(",")[1], mediaType: blob.type || "image/jpeg", dataUrl };

    document.querySelector('#discover-mode-toggle [data-mode="scan"]').click();
    document.getElementById("discover-idle").querySelector(".scan-drop").style.display = "none";
    previewImg.src = dataUrl;
    document.getElementById("discover-preview").style.display = "block";
    document.getElementById("scan-listing-text").value = item.title;
    document.getElementById("discover-analyze-row").style.display = "block";
    document.getElementById("btn-analyze").click();
  } catch (err) {
    alert("Couldn't load that listing's image directly (the site may block it). Try a screenshot in Scan mode instead.");
  }
}

document.getElementById("btn-run-search").addEventListener("click", () => runEbaySearch(ebaySearchInput.value));
ebaySearchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runEbaySearch(ebaySearchInput.value); });

document.getElementById("btn-save-search").addEventListener("click", async () => {
  const q = ebaySearchInput.value.trim();
  if (!q) return;
  await DB.saveSearch({ query: q, seenIds: [] });
  document.getElementById("btn-save-search").textContent = "★ Saved";
  setTimeout(() => { document.getElementById("btn-save-search").textContent = "☆ Save"; }, 1500);
});

document.getElementById("btn-new-saved-search").addEventListener("click", () => {
  switchTab("discover");
  document.querySelector('#discover-mode-toggle [data-mode="search"]').click();
  ebaySearchInput.focus();
});

// ---------------- Saved searches (Wishlist tab) ----------------

async function renderSavedSearches() {
  const searches = await DB.allSearches();
  const el = document.getElementById("saved-searches-list");
  if (searches.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px 10px">
      <p style="margin:0">No saved searches yet. Search eBay in Scout, then tap ☆ Save to keep track of it here.</p>
    </div>`;
    return;
  }
  el.innerHTML = searches.map((s) => `
    <div class="summary-tile" style="display:block">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div class="s-name">${esc(s.query)}</div>
          <div class="s-sub">${s.lastCheckedAt ? "Last checked " + new Date(s.lastCheckedAt).toLocaleString() : "Never checked"}</div>
        </div>
        <button class="btn btn-secondary" data-check="${esc(s.id)}">Check now</button>
      </div>
      <div id="saved-search-result-${esc(s.id)}"></div>
    </div>`).join("");

  el.querySelectorAll("[data-check]").forEach((btn) => {
    btn.addEventListener("click", () => checkSavedSearch(btn.dataset.check));
  });
}

async function checkSavedSearch(id) {
  const searches = await DB.allSearches();
  const search = searches.find((s) => s.id === id);
  if (!search) return;
  const resultEl = document.getElementById(`saved-search-result-${id}`);
  resultEl.innerHTML = `<div class="spinner" style="margin:14px auto"></div>`;
  try {
    const results = await Ebay.search(search.query, { sort: "newlyListed", limit: 15 });
    const seen = new Set(search.seenIds || []);
    const newIds = new Set(results.map((r) => r.id).filter((id) => !seen.has(id)));

    resultEl.innerHTML = "";
    const tempContainer = document.createElement("div");
    resultEl.appendChild(tempContainer);
    const originalResultsEl = document.getElementById("search-results").innerHTML;
    // Render into this saved-search card using the same result renderer, then move it in.
    document.getElementById("search-results").innerHTML = "";
    renderSearchResults(results, search.query, { newIds });
    tempContainer.innerHTML = document.getElementById("search-results").innerHTML;
    document.getElementById("search-results").innerHTML = originalResultsEl;
    // Re-wire buttons inside the moved copy
    wireResultButtons(tempContainer, results);

    search.seenIds = results.map((r) => r.id);
    search.lastCheckedAt = new Date().toISOString();
    await DB.saveSearch(search);
  } catch (err) {
    resultEl.innerHTML = `<div class="error-box" style="margin-top:10px">${esc(err.message)}</div>`;
  }
}

function wireResultButtons(container, results) {
  container.querySelectorAll('[data-action="view"]').forEach((btn) =>
    btn.addEventListener("click", (e) => { e.stopPropagation(); window.open(btn.dataset.url, "_blank", "noopener"); })
  );
  container.querySelectorAll('[data-action="want"]').forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = results[Number(btn.dataset.idx)];
      openCardSheet({ player: item.title, notes: item.itemWebUrl }, "wishlist");
    })
  );
  container.querySelectorAll('[data-action="identify"]').forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = results[Number(btn.dataset.idx)];
      await identifyFromListing(item);
    })
  );
}

// ---------------- Settings ----------------

const settingsSheet = document.getElementById("settings-sheet");
const settingsBackdrop = document.getElementById("settings-backdrop");

async function openSettings() {
  const key = await DB.getSetting("anthropicApiKey");
  const ebayId = await DB.getSetting("ebayClientId");
  const ebaySecret = await DB.getSetting("ebayClientSecret");
  document.getElementById("f-apikey").value = key || "";
  document.getElementById("f-ebay-clientid").value = ebayId || "";
  document.getElementById("f-ebay-clientsecret").value = ebaySecret || "";
  document.getElementById("settings-msg").textContent = "";
  settingsSheet.classList.add("active");
  settingsBackdrop.classList.add("active");
}
function closeSettings() {
  settingsSheet.classList.remove("active");
  settingsBackdrop.classList.remove("active");
}
document.getElementById("settings-close").addEventListener("click", closeSettings);
settingsBackdrop.addEventListener("click", closeSettings);

document.getElementById("btn-save-key").addEventListener("click", async () => {
  const val = document.getElementById("f-apikey").value.trim();
  await DB.setSetting("anthropicApiKey", val);
  document.getElementById("settings-msg").textContent = "Saved.";
});

document.getElementById("btn-save-ebay").addEventListener("click", async () => {
  const id = document.getElementById("f-ebay-clientid").value.trim();
  const secret = document.getElementById("f-ebay-clientsecret").value.trim();
  await DB.setSetting("ebayClientId", id);
  await DB.setSetting("ebayClientSecret", secret);
  await DB.setSetting("ebayToken", "");
  await DB.setSetting("ebayTokenExpiry", "0");
  document.getElementById("settings-msg").textContent = "eBay credentials saved.";
});

document.getElementById("btn-export").addEventListener("click", async () => {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `palace-cards-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await DB.importAll(data);
    document.getElementById("settings-msg").textContent = `Imported ${data.cards?.length || 0} cards.`;
    refreshCurrentTab();
  } catch (err) {
    document.getElementById("settings-msg").textContent = "Import failed: " + err.message;
  }
  e.target.value = "";
});

// ---------------- Init ----------------

renderHome();
