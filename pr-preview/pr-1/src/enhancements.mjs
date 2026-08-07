import { CAMPUSES, STOPS } from "../data/timetable-2026.mjs";
import { describeJourney, getTimetableRows, searchJourneys, toDateKey } from "./search-engine.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const SUITA_STOP_KEY = "ou-bus:suita-origin-stop";
const CAMPUS_KEY = "ou-bus:default-campus";

function currentCampus() { return localStorage.getItem(CAMPUS_KEY) || "suita"; }
function suitaStop() { return localStorage.getItem(SUITA_STOP_KEY) || "suita_engineering"; }
function homeOriginKey() { return currentCampus() === "suita" ? suitaStop() : currentCampus(); }
function homeDestination() {
  return $("#home-destination-chips .chip.is-active")?.dataset.homeDestination || (currentCampus() === "suita" ? "toyonaka" : "suita");
}
function nowParts() {
  const now = new Date();
  return { date: toDateKey(now), time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` };
}
function dateLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${day})`;
}
function routeType(journey) { return journey.isViaMinoh ? "箕面経由" : "直行"; }
function countdown(journey) {
  const now = new Date();
  if (toDateKey(now) !== journey.serviceDate) return `${dateLabel(journey.serviceDate)}運行`;
  const delta = Math.round((journey.departureDateTime - now) / 60000);
  return delta <= 0 ? "まもなく出発" : `あと${delta}分`;
}

function homeJourneyCard(journey, lastTripId, highlighted = false) {
  const description = describeJourney(journey);
  const isLast = journey.tripId === lastTripId;
  return `<article class="journey-card ${highlighted ? "is-highlighted" : ""} ${isLast ? "is-last" : ""}">
    <div class="journey-route"><span>${description.originName}</span><span class="arrow">→</span><span>${description.destinationName}</span></div>
    <div class="journey-time"><strong>${journey.departureTime} → ${journey.arrivalTime}</strong><small>${journey.durationMinutes}分</small></div>
    <div class="journey-details">
      <span class="pill ${journey.isViaMinoh ? "pill-warning" : "pill-soft"}">${routeType(journey)}</span>
      ${isLast ? '<span class="pill pill-last">最終便</span>' : ""}
      <span class="pill pill-soft">${journey.tripId}便</span>
      <span class="journey-date">${dateLabel(journey.serviceDate)}</span>
    </div>
  </article>`;
}

function renderHomeEnhancements() {
  const originCampus = currentCampus();
  const destination = homeDestination();
  const originKey = homeOriginKey();
  const label = $("#home-origin-label");
  const wantedLabel = originCampus === "suita" ? `吹田・${STOPS[suitaStop()].shortName}` : CAMPUSES[originCampus].longName;
  if (label && label.textContent !== wantedLabel) label.textContent = wantedLabel;
  if (!destination || destination === originCampus) return;

  const now = nowParts();
  const search = searchJourneys({ origin: originKey, destination, date: now.date, time: now.time, mode: "depart", limit: 4 });
  const all = searchJourneys({ origin: originKey, destination, date: now.date, time: "00:00", mode: "depart", limit: 100, rollover: false });
  const remaining = searchJourneys({ origin: originKey, destination, date: now.date, time: now.time, mode: "depart", limit: 100, rollover: false });
  const last = all.journeys.at(-1) || null;
  const next = search.journeys[0] || null;
  const type = $("#next-route-type");
  const card = $("#next-card-content");
  const summary = $("#remaining-summary");
  const upcoming = $("#upcoming-list");
  if (!type || !card || !summary || !upcoming) return;

  if (!next) {
    type.textContent = "便なし";
    card.classList.remove("skeleton-block");
    card.innerHTML = `<div class="next-route">条件に合う便がありません</div>`;
    summary.classList.add("is-hidden");
    upcoming.innerHTML = `<div class="empty-state">この条件で利用できる便はありません。</div>`;
    return;
  }

  const isLast = last && next.serviceDate === last.serviceDate && next.tripId === last.tripId;
  type.textContent = isLast ? "最終便" : routeType(next);
  const description = describeJourney(next);
  card.classList.remove("skeleton-block");
  card.innerHTML = `<div class="next-route"><span>${CAMPUSES[originCampus].name}</span><span class="arrow">→</span><span>${CAMPUSES[destination].name}</span></div>
    <div class="next-times"><span>${next.departureTime}</span><small>発</small><span class="slash">/</span><span>${next.arrivalTime}</span><small>着</small></div>
    <div class="next-meta"><span>${countdown(next)}</span><span>${description.durationLabel}</span><span>${STOPS[next.originStopId].shortName}から</span><span>${routeType(next)}</span></div>`;

  if (!all.serviceStatus.operating || !last) {
    summary.classList.add("is-hidden");
  } else if (search.advancedToNextService) {
    summary.innerHTML = `<strong>本日終了</strong><span>本日の最終は ${last.departureTime}発。次は${dateLabel(next.serviceDate)}です。</span>`;
    summary.classList.remove("is-hidden");
  } else {
    const count = remaining.journeys.length;
    summary.innerHTML = isLast
      ? `<strong>最終便</strong><span>この行先の本日最終便です。</span>`
      : count <= 3
        ? `<strong>残り${count}本</strong><span>この行先の最終は ${last.departureTime}発です。</span>`
        : `<strong>最終 ${last.departureTime}</strong><span>この行先の最終便時刻</span>`;
    summary.classList.remove("is-hidden");
  }

  upcoming.innerHTML = search.journeys.slice(0, 3).map((j, i) => homeJourneyCard(j, last?.tripId || null, i === 0)).join("");
}

function syncSuitaControls() {
  const campus = currentCampus();
  const stop = suitaStop();
  const dialogWrap = $("#dialog-suita-stop-wrap");
  const dialogSelect = $("#dialog-suita-stop");
  const settingsWrap = $("#default-suita-stop-wrap");
  const settingsSelect = $("#default-suita-stop");
  if (dialogWrap) dialogWrap.classList.toggle("is-hidden", campus !== "suita");
  if (dialogSelect) dialogSelect.value = stop;
  if (settingsWrap) settingsWrap.classList.toggle("is-hidden", campus !== "suita");
  if (settingsSelect) settingsSelect.value = stop;
  $$('[data-campus-choice]').forEach((button) => button.classList.toggle("is-current", button.dataset.campusChoice === campus));
  const originCampus = $("#origin-campus");
  if (originCampus?.value === "suita" && $("#origin-stop")) $("#origin-stop").value = stop;
}

function updateSearchSummary() {
  const parts = [];
  if ($("#direct-only")?.checked) parts.push("直行のみ");
  if ($("#round-trip")?.checked) parts.push(`往復・${$("#stay-minutes")?.value || 60}分滞在`);
  const summary = $("#search-options-summary");
  if (summary) summary.textContent = parts.length ? parts.join(" / ") : "直行・往復を指定";
}

function minohDirection(trip) {
  const i = trip.stops.findIndex((s) => s.stopId === "minoh");
  const next = trip.stops[i + 1];
  const prev = trip.stops[i - 1];
  if (next) return STOPS[next.stopId].campusId === "suita" ? "吹田方面" : "豊中方面";
  if (prev) return `${STOPS[prev.stopId].campusId === "suita" ? "吹田" : "豊中"}から`;
  return "箕面";
}

function renderMinohTimetable() {
  const trips = [...getTimetableRows("eastbound"), ...getTimetableRows("westbound")]
    .filter((trip) => trip.stops.some((stop) => stop.stopId === "minoh"))
    .sort((a, b) => a.stops.find((stop) => stop.stopId === "minoh").time.localeCompare(b.stops.find((stop) => stop.stopId === "minoh").time));
  const list = $("#timetable-list");
  if (!list) return;
  list.innerHTML = trips.map((trip) => {
    const minoh = trip.stops.find((stop) => stop.stopId === "minoh");
    const index = trip.stops.findIndex((stop) => stop.stopId === "minoh");
    const isTerminal = index === trip.stops.length - 1;
    return `<article class="timetable-card minoh-card">
      <div class="timetable-card-head"><strong>箕面 ${minoh.time} ${isTerminal ? "着" : "発"}・${trip.id}便</strong><span class="pill pill-warning">${minohDirection(trip)}</span></div>
      <div class="stop-times">${trip.stops.map((stop) => `<span class="stop-time ${stop.stopId === "minoh" ? "is-focus" : ""}">${STOPS[stop.stopId].shortName}<b>${stop.time}</b></span>`).join("")}</div>
    </article>`;
  }).join("");
}

function normalizeLabels(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.nodeValue.includes("乗換なし")) node.nodeValue = node.nodeValue.replaceAll("乗換なし", "直行");
    if (node.nodeValue.includes("すべての便")) node.nodeValue = node.nodeValue.replaceAll("すべての便", "直行・経由");
  }
}

function scheduleHomeSync(delay = 0) {
  window.setTimeout(() => { syncSuitaControls(); renderHomeEnhancements(); normalizeLabels(); }, delay);
}

function bindEnhancements() {
  $("#dialog-suita-stop")?.addEventListener("change", (event) => {
    localStorage.setItem(SUITA_STOP_KEY, event.target.value);
    scheduleHomeSync();
  });
  $("#default-suita-stop")?.addEventListener("change", (event) => {
    localStorage.setItem(SUITA_STOP_KEY, event.target.value);
    scheduleHomeSync();
  });
  $("#default-campus")?.addEventListener("change", () => scheduleHomeSync());

  $("#campus-dialog")?.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-campus-choice]");
    if (!choice) return;
    if (choice.dataset.campusChoice === "suita") event.preventDefault();
    scheduleHomeSync();
  }, true);

  $("#home-origin-button")?.addEventListener("click", () => window.setTimeout(syncSuitaControls, 0));
  $("#home-destination-chips")?.addEventListener("click", () => scheduleHomeSync());
  $("#refresh-button")?.addEventListener("click", () => scheduleHomeSync());
  $("#locate-button")?.addEventListener("click", () => { scheduleHomeSync(900); scheduleHomeSync(2600); });
  $("#search-now-button")?.addEventListener("click", () => window.setTimeout(syncSuitaControls, 0));
  $("#arrival-search-button")?.addEventListener("click", () => window.setTimeout(syncSuitaControls, 0));
  $("#open-search-button")?.addEventListener("click", () => window.setTimeout(syncSuitaControls, 0));
  $("#origin-campus")?.addEventListener("change", () => window.setTimeout(syncSuitaControls, 0));

  ["#direct-only", "#round-trip", "#stay-minutes"].forEach((selector) => $(selector)?.addEventListener("change", () => window.setTimeout(updateSearchSummary, 0)));
  $("#search-form")?.addEventListener("submit", () => window.setTimeout(normalizeLabels, 0));

  $$(".timetable-direction button").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.direction === "minoh") window.setTimeout(renderMinohTimetable, 0);
    window.setTimeout(normalizeLabels, 0);
  }));

  $$(".bottom-nav button").forEach((button) => button.addEventListener("click", () => {
    window.setTimeout(() => {
      syncSuitaControls();
      if (button.dataset.nav === "home") renderHomeEnhancements();
      if (button.dataset.nav === "timetable" && $(".timetable-direction button.is-active")?.dataset.direction === "minoh") renderMinohTimetable();
      normalizeLabels();
    }, 0);
  }));
}

function observeHomeRerenders() {
  const targets = [$("#home-origin-label"), $("#home-destination-chips")].filter(Boolean);
  if (!targets.length) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      renderHomeEnhancements();
      normalizeLabels();
    });
  });
  targets.forEach((target) => observer.observe(target, { childList: true, subtree: true }));
}

bindEnhancements();
syncSuitaControls();
renderHomeEnhancements();
updateSearchSummary();
normalizeLabels();
observeHomeRerenders();
