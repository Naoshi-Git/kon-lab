import {
  CAMPUSES,
  DATA_VERSION,
  SOURCE,
  STOPS
} from "../data/timetable-2026.mjs";
import {
  describeJourney,
  getServiceStatus,
  getTimetableRows,
  inferNearestCampus,
  searchJourneys,
  searchRoundTrips,
  toDateKey
} from "./search-engine.mjs";

const STORAGE = {
  defaultCampus: "ou-bus:default-campus",
  recentRoutes: "ou-bus:recent-routes",
  savedRoutes: "ou-bus:saved-routes"
};

const state = {
  currentCampus: localStorage.getItem(STORAGE.defaultCampus) || "suita",
  homeDestination: "toyonaka",
  searchMode: "depart",
  timetableDirection: "eastbound",
  currentSearch: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadList(key) {
  return safeParse(localStorage.getItem(key), []);
}

function saveList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nowInputParts() {
  const now = new Date();
  return {
    date: toDateKey(now),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  };
}

function dateLabel(dateKey, compact = false) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return compact
    ? `${month}/${day}(${weekday})`
    : `${year}年${month}月${day}日（${weekday}）`;
}

function routeLabel(origin, destination) {
  return `${CAMPUSES[origin].name} → ${CAMPUSES[destination].name}`;
}

function getAlternativeCampus(origin, preferred = null) {
  if (preferred && preferred !== origin) return preferred;
  if (origin === "suita") return "toyonaka";
  return "suita";
}

function serviceBanner() {
  const { date } = nowInputParts();
  const status = getServiceStatus(date);
  const banner = $("#service-banner");
  banner.classList.toggle("is-closed", !status.operating);

  if (status.operating) {
    banner.textContent = `${dateLabel(date)}：通常ダイヤで運行予定`;
    return;
  }

  const next = searchJourneys({
    origin: state.currentCampus,
    destination: getAlternativeCampus(state.currentCampus, state.homeDestination),
    date,
    time: "00:00",
    mode: "depart",
    limit: 1
  });

  banner.textContent = next.advancedToNextService
    ? `${dateLabel(date)}は運休（${status.reason}）。次の通常運行日は${dateLabel(next.effectiveDate, true)}です。`
    : `${dateLabel(date)}は運休です：${status.reason}`;
}

function setView(view) {
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
  $$(".bottom-nav button").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "timetable") renderTimetable();
  if (view === "settings") renderSettings();
}

function campusOptions() {
  const container = $("#campus-options");
  container.innerHTML = Object.values(CAMPUSES).map((campus) => `
    <button class="campus-option" type="submit" value="${campus.id}" data-campus-choice="${campus.id}">
      <strong>${campus.longName}</strong>
      <small>${campus.id === state.currentCampus ? "現在の設定" : "このキャンパスから次便を表示"}</small>
    </button>
  `).join("");

  $$('[data-campus-choice]', container).forEach((button) => {
    button.addEventListener("click", () => {
      state.currentCampus = button.dataset.campusChoice;
      state.homeDestination = getAlternativeCampus(state.currentCampus, state.homeDestination);
      localStorage.setItem(STORAGE.defaultCampus, state.currentCampus);
      $("#default-campus").value = state.currentCampus;
      renderHome();
    });
  });
}

function renderDestinationChips() {
  const container = $("#home-destination-chips");
  const options = Object.values(CAMPUSES).filter((campus) => campus.id !== state.currentCampus);

  if (!options.some((campus) => campus.id === state.homeDestination)) {
    state.homeDestination = options[0].id;
  }

  container.innerHTML = options.map((campus) => `
    <button class="chip ${campus.id === state.homeDestination ? "is-active" : ""}" type="button" data-home-destination="${campus.id}">
      ${campus.name}
    </button>
  `).join("");

  $$('[data-home-destination]', container).forEach((button) => {
    button.addEventListener("click", () => {
      state.homeDestination = button.dataset.homeDestination;
      renderHome();
    });
  });
}

function countdownLabel(journey) {
  const now = new Date();
  const delta = Math.round((journey.departureDateTime - now) / 60000);
  if (toDateKey(now) !== journey.serviceDate) return `${dateLabel(journey.serviceDate, true)}運行`;
  if (delta <= 0) return "まもなく出発";
  if (delta === 1) return "あと1分";
  return `あと${delta}分`;
}

function routeTypeLabel(journey) {
  const originCampus = STOPS[journey.originStopId].campusId;
  const destinationCampus = STOPS[journey.destinationStopId].campusId;
  if (journey.isViaMinoh) return "箕面経由";
  if (originCampus === "minoh" || destinationCampus === "minoh") return "乗換なし";
  return "直行";
}

function renderNextCard(search) {
  const card = $("#next-card-content");
  const type = $("#next-route-type");
  const journey = search.journeys[0];

  card.classList.remove("skeleton-block");

  if (!journey) {
    type.textContent = "便なし";
    card.innerHTML = `
      <div class="next-route">条件に合う便がありません</div>
      <p>日付・時刻または直行便条件を変更してください。</p>
    `;
    return;
  }

  const description = describeJourney(journey);
  type.textContent = routeTypeLabel(journey);
  card.innerHTML = `
    <div class="next-route">
      <span>${CAMPUSES[state.currentCampus].name}</span>
      <span class="arrow">→</span>
      <span>${CAMPUSES[state.homeDestination].name}</span>
    </div>
    <div class="next-times">
      <span>${journey.departureTime}</span><small>発</small>
      <span class="slash">/</span>
      <span>${journey.arrivalTime}</span><small>着</small>
    </div>
    <div class="next-meta">
      <span>${countdownLabel(journey)}</span>
      <span>${description.durationLabel}</span>
      <span>${STOPS[journey.originStopId].shortName}から</span>
    </div>
  `;
}

function journeyCard(journey, highlighted = false) {
  const description = describeJourney(journey);
  return `
    <article class="journey-card ${highlighted ? "is-highlighted" : ""}">
      <div class="journey-route">
        <span>${description.originName}</span>
        <span class="arrow">→</span>
        <span>${description.destinationName}</span>
      </div>
      <div class="journey-time">
        <strong>${journey.departureTime} → ${journey.arrivalTime}</strong>
        <small>${journey.durationMinutes}分</small>
      </div>
      <div class="journey-details">
        <span class="pill ${journey.isViaMinoh ? "pill-warning" : "pill-soft"}">${routeTypeLabel(journey)}</span>
        <span class="pill pill-soft">${journey.tripId}便</span>
        <span class="journey-date">${dateLabel(journey.serviceDate, true)}</span>
      </div>
    </article>
  `;
}

function renderUpcoming(search) {
  const list = $("#upcoming-list");
  if (!search.journeys.length) {
    list.innerHTML = `<div class="empty-state">この条件で利用できる便はありません。</div>`;
    return;
  }
  list.innerHTML = search.journeys.slice(0, 3).map((journey, index) => journeyCard(journey, index === 0)).join("");
}

function routeShortcut(route, source = "recent") {
  const direct = route.directOnly ? "直行のみ" : "すべての便";
  return `
    <button class="route-shortcut" type="button"
      data-route-origin="${route.origin}"
      data-route-destination="${route.destination}"
      data-route-direct="${Boolean(route.directOnly)}">
      <span>
        <strong>${routeLabel(route.origin, route.destination)}</strong>
        <small>${direct}${source === "saved" ? "・保存済み" : ""}</small>
      </span>
      <span>›</span>
    </button>
  `;
}

function bindRouteShortcuts(root) {
  $$('[data-route-origin]', root).forEach((button) => {
    button.addEventListener("click", () => {
      openSearch({
        origin: button.dataset.routeOrigin,
        destination: button.dataset.routeDestination,
        directOnly: button.dataset.routeDirect === "true"
      });
    });
  });
}

function renderRecentRoutes() {
  const recent = loadList(STORAGE.recentRoutes);
  const section = $("#recent-section");
  const container = $("#recent-routes");
  section.classList.toggle("is-hidden", recent.length === 0);
  container.innerHTML = recent.slice(0, 3).map((route) => routeShortcut(route)).join("");
  bindRouteShortcuts(container);
}

function renderHome() {
  $("#home-origin-label").textContent = CAMPUSES[state.currentCampus].longName;
  renderDestinationChips();
  serviceBanner();

  const now = nowInputParts();
  const search = searchJourneys({
    origin: state.currentCampus,
    destination: state.homeDestination,
    date: now.date,
    time: now.time,
    mode: "depart",
    limit: 4
  });

  renderNextCard(search);
  renderUpcoming(search);
  renderRecentRoutes();
  campusOptions();
}

function setSearchMode(mode) {
  state.searchMode = mode;
  $$('[data-mode]').forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
}

function updateSearchOptions() {
  const origin = $("#origin-campus").value;
  const destination = $("#destination-campus").value;

  $("#origin-stop-wrap").classList.toggle("is-hidden", origin !== "suita");
  $("#destination-stop-wrap").classList.toggle("is-hidden", destination !== "suita");

  const isToySuita =
    (origin === "toyonaka" && destination === "suita") ||
    (origin === "suita" && destination === "toyonaka");

  $("#direct-row").classList.toggle("is-hidden", !isToySuita);
  if (!isToySuita) $("#direct-only").checked = false;
  $("#stay-wrap").classList.toggle("is-hidden", !$("#round-trip").checked);
}

function openSearch({
  origin = state.currentCampus,
  destination = state.homeDestination,
  directOnly = false,
  mode = "depart",
  useNow = true
} = {}) {
  const parts = nowInputParts();
  $("#origin-campus").value = origin;
  $("#destination-campus").value = destination === origin ? getAlternativeCampus(origin) : destination;
  $("#direct-only").checked = directOnly;
  $("#search-date").value = parts.date;
  $("#search-time").value = parts.time;
  setSearchMode(mode);
  updateSearchOptions();
  setView("search");

  if (useNow) {
    window.setTimeout(() => $("#search-form").scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
}

function addRecentRoute(route) {
  const recent = loadList(STORAGE.recentRoutes)
    .filter((item) => !(item.origin === route.origin && item.destination === route.destination && item.directOnly === route.directOnly));

  recent.unshift({ ...route, usedAt: new Date().toISOString() });
  saveList(STORAGE.recentRoutes, recent.slice(0, 6));
}

function renderSearchMessage(result, mode) {
  const message = $("#search-message");
  const status = result.serviceStatus;

  if (result.error) {
    message.innerHTML = `<div class="message error">${result.error}</div>`;
    return;
  }

  if (result.advancedToNextService) {
    message.innerHTML = `
      <div class="message warning">
        指定日は${status.reason}のため、次の通常運行日 ${dateLabel(result.effectiveDate)} の便を表示しています。
      </div>
    `;
    return;
  }

  if (!status.operating) {
    message.innerHTML = `<div class="message warning">${dateLabel(result.requestedDate)}は運休です：${status.reason}</div>`;
    return;
  }

  if (!result.journeys?.length && mode === "arrive") {
    message.innerHTML = `<div class="message warning">指定時刻までに到着する便がありません。</div>`;
    return;
  }

  message.innerHTML = "";
}

function renderOneWayResults(result) {
  renderSearchMessage(result, state.searchMode);
  $("#search-results").innerHTML = result.journeys.length
    ? result.journeys.map((journey, index) => journeyCard(journey, index === 0)).join("")
    : `<div class="empty-state">条件に合う便がありません。時刻や検索条件を変更してください。</div>`;
}

function roundLeg(journey, label) {
  const description = describeJourney(journey);
  return `
    <div class="round-leg">
      <span class="round-leg-label">${label}</span>
      <div class="journey-route">
        <span>${description.originName}</span><span class="arrow">→</span><span>${description.destinationName}</span>
      </div>
      <div class="journey-time">
        <strong>${journey.departureTime} → ${journey.arrivalTime}</strong>
        <small>${dateLabel(journey.serviceDate, true)}・${routeTypeLabel(journey)}</small>
      </div>
    </div>
  `;
}

function renderRoundResults(result) {
  renderSearchMessage(result.outboundSearch, state.searchMode);
  $("#search-results").innerHTML = result.pairs.length
    ? result.pairs.map((pair) => `
      <article class="journey-card round-card">
        ${roundLeg(pair.outbound, "往路")}
        ${roundLeg(pair.inbound, pair.returnAdvancedToNextService ? "復路（次の運行日）" : "復路")}
      </article>
    `).join("")
    : `<div class="empty-state">往復条件を満たす組み合わせがありません。滞在時間や時刻を変更してください。</div>`;
}

function executeSearch() {
  const originCampus = $("#origin-campus").value;
  const destinationCampus = $("#destination-campus").value;
  const oneWayOrigin = originCampus === "suita" ? $("#origin-stop").value : originCampus;
  const oneWayDestination = destinationCampus === "suita" ? $("#destination-stop").value : destinationCampus;
  const date = $("#search-date").value;
  const time = $("#search-time").value;
  const directOnly = $("#direct-only").checked;
  const roundTrip = $("#round-trip").checked;
  const stayMinutes = Number($("#stay-minutes").value);

  state.currentSearch = {
    origin: originCampus,
    destination: destinationCampus,
    directOnly,
    roundTrip,
    stayMinutes
  };

  addRecentRoute({ origin: originCampus, destination: destinationCampus, directOnly });
  $("#results-title").textContent = routeLabel(originCampus, destinationCampus);

  if (roundTrip) {
    const result = searchRoundTrips({
      origin: originCampus,
      destination: destinationCampus,
      date,
      time,
      mode: state.searchMode,
      directOnly,
      stayMinutes,
      limit: 4
    });
    renderRoundResults(result);
  } else {
    const result = searchJourneys({
      origin: oneWayOrigin,
      destination: oneWayDestination,
      date,
      time,
      mode: state.searchMode,
      directOnly,
      limit: 8
    });
    renderOneWayResults(result);
  }

  $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveCurrentRoute() {
  if (!state.currentSearch) {
    $("#search-message").innerHTML = `<div class="message">先に検索を実行してください。</div>`;
    return;
  }

  const route = {
    origin: state.currentSearch.origin,
    destination: state.currentSearch.destination,
    directOnly: state.currentSearch.directOnly
  };

  const saved = loadList(STORAGE.savedRoutes)
    .filter((item) => !(item.origin === route.origin && item.destination === route.destination && item.directOnly === route.directOnly));

  saved.unshift({ ...route, savedAt: new Date().toISOString() });
  saveList(STORAGE.savedRoutes, saved.slice(0, 12));
  $("#favorite-current-button").textContent = "★ 保存済み";
}

function renderTimetable() {
  $$(".timetable-direction button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.direction === state.timetableDirection);
  });

  const trips = getTimetableRows(state.timetableDirection);
  $("#timetable-list").innerHTML = trips.map((trip) => {
    const viaMinoh = trip.stops.some((stop) => stop.stopId === "minoh");
    return `
      <article class="timetable-card">
        <div class="timetable-card-head">
          <strong>${trip.id}便</strong>
          <span class="pill ${viaMinoh ? "pill-warning" : "pill-soft"}">${viaMinoh ? "箕面停車" : "箕面通過"}</span>
        </div>
        <div class="stop-times">
          ${trip.stops.map((stop) => `
            <span class="stop-time">${STOPS[stop.stopId].shortName}<b>${stop.time}</b></span>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function renderSavedRoutes() {
  const saved = loadList(STORAGE.savedRoutes);
  const container = $("#saved-routes");

  if (!saved.length) {
    container.innerHTML = `<div class="empty-state">保存したルートはまだありません。</div>`;
    return;
  }

  container.innerHTML = saved.map((route, index) => `
    <div class="route-shortcut">
      <button class="route-open" type="button"
        data-route-origin="${route.origin}"
        data-route-destination="${route.destination}"
        data-route-direct="${Boolean(route.directOnly)}">
        <strong>${routeLabel(route.origin, route.destination)}</strong>
        <small>${route.directOnly ? "直行のみ" : "すべての便"}</small>
      </button>
      <button class="text-button danger" type="button" data-delete-saved="${index}">削除</button>
    </div>
  `).join("");

  bindRouteShortcuts(container);
  $$('[data-delete-saved]', container).forEach((button) => {
    button.addEventListener("click", () => {
      const current = loadList(STORAGE.savedRoutes);
      current.splice(Number(button.dataset.deleteSaved), 1);
      saveList(STORAGE.savedRoutes, current);
      renderSavedRoutes();
    });
  });
}

function renderSettings() {
  $("#default-campus").value = state.currentCampus;
  $("#data-version").textContent = `データ版：${DATA_VERSION}／確認日：${SOURCE.updatedAt}`;
  renderSavedRoutes();
}

function locateCampus() {
  const button = $("#locate-button");
  if (!navigator.geolocation) {
    button.textContent = "位置情報非対応";
    return;
  }

  button.disabled = true;
  button.textContent = "推定中…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const nearest = inferNearestCampus(position.coords.latitude, position.coords.longitude);
      state.currentCampus = nearest.campus.id;
      state.homeDestination = getAlternativeCampus(state.currentCampus, state.homeDestination);
      localStorage.setItem(STORAGE.defaultCampus, state.currentCampus);
      button.textContent = `${nearest.campus.name}と推定`;
      renderHome();
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "位置情報で推定";
      }, 2400);
    },
    () => {
      button.disabled = false;
      button.textContent = "取得できませんでした";
      window.setTimeout(() => {
        button.textContent = "位置情報で推定";
      }, 2400);
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
}

function bindEvents() {
  $$(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.nav));
  });

  $("#refresh-button").addEventListener("click", renderHome);
  $("#home-origin-button").addEventListener("click", () => {
    campusOptions();
    $("#campus-dialog").showModal();
  });
  $("#locate-button").addEventListener("click", locateCampus);
  $("#search-now-button").addEventListener("click", () => openSearch({ mode: "depart" }));
  $("#arrival-search-button").addEventListener("click", () => openSearch({ mode: "arrive" }));
  $("#open-search-button").addEventListener("click", () => openSearch());

  $("#swap-button").addEventListener("click", () => {
    const origin = $("#origin-campus").value;
    $("#origin-campus").value = $("#destination-campus").value;
    $("#destination-campus").value = origin;
    updateSearchOptions();
  });

  $("#origin-campus").addEventListener("change", updateSearchOptions);
  $("#destination-campus").addEventListener("change", updateSearchOptions);
  $("#round-trip").addEventListener("change", updateSearchOptions);

  $$('[data-mode]').forEach((button) => {
    button.addEventListener("click", () => setSearchMode(button.dataset.mode));
  });

  $("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    executeSearch();
  });

  $("#favorite-current-button").addEventListener("click", saveCurrentRoute);

  $$(".timetable-direction button").forEach((button) => {
    button.addEventListener("click", () => {
      state.timetableDirection = button.dataset.direction;
      renderTimetable();
    });
  });

  $("#default-campus").addEventListener("change", (event) => {
    state.currentCampus = event.target.value;
    state.homeDestination = getAlternativeCampus(state.currentCampus, state.homeDestination);
    localStorage.setItem(STORAGE.defaultCampus, state.currentCampus);
    renderHome();
  });

  $("#clear-saved-button").addEventListener("click", () => {
    localStorage.removeItem(STORAGE.savedRoutes);
    renderSavedRoutes();
  });
}

function init() {
  state.homeDestination = getAlternativeCampus(state.currentCampus);
  const parts = nowInputParts();
  $("#search-date").value = parts.date;
  $("#search-time").value = parts.time;
  $("#default-campus").value = state.currentCampus;
  bindEvents();
  updateSearchOptions();
  renderHome();
  renderTimetable();
  renderSettings();
}

init();
