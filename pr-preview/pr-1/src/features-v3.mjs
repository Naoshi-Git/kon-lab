import { CAMPUSES, STOPS } from "../data/timetable-2026.mjs";
import { LOCATION_INFERENCE, LOCATION_POINTS } from "../data/location-points.mjs";
import {
  distanceKm,
  findJourneysForDate,
  getNextServiceDate,
  getPreviousServiceDate,
  getServiceStatus,
  parseTime,
  searchJourneys,
  toDateKey
} from "./search-engine.mjs";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const CAMPUS_KEY = "ou-bus:default-campus";
const SUITA_STOP_KEY = "ou-bus:suita-origin-stop";
const NORMAL_TIMETABLE_DATE = "2026-06-01";

function installStyles() {
  if ($('link[data-ui-v3]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./ui-v3.css";
  link.dataset.uiV3 = "true";
  document.head.append(link);
}

function currentCampus() {
  return localStorage.getItem(CAMPUS_KEY) || "suita";
}

function currentSuitaStop() {
  return localStorage.getItem(SUITA_STOP_KEY) || "suita_engineering";
}

function nowParts() {
  const now = new Date();
  return {
    date: toDateKey(now),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  };
}

function ensureLocationAssist() {
  let box = $("#location-assist");
  if (box) return box;
  box = document.createElement("div");
  box.id = "location-assist";
  box.className = "location-assist is-hidden";
  $("#service-banner")?.insertAdjacentElement("afterend", box);
  return box;
}

function hideLocationAssist() {
  ensureLocationAssist().classList.add("is-hidden");
}

function showLocationAssist(message, { suitOnly = false } = {}) {
  const box = ensureLocationAssist();
  const choices = suitOnly
    ? `
      <button type="button" data-location-stop="suita_engineering">工学部前</button>
      <button type="button" data-location-stop="suita_human_sciences">人間科学部前</button>`
    : `
      <button type="button" data-location-campus="toyonaka">豊中</button>
      <button type="button" data-location-campus="minoh">箕面</button>
      <button type="button" data-location-campus="suita">吹田</button>`;

  box.innerHTML = `
    <div class="location-assist-copy">
      <strong>現在地を確認してください</strong>
      <span>${message}</span>
    </div>
    <div class="location-assist-actions">${choices}</div>`;
  box.classList.remove("is-hidden");

  $$('[data-location-campus]', box).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.locationCampus === "suita") {
        showLocationAssist("吹田キャンパスでは、実際に乗る停留所を選んでください。", { suitOnly: true });
        return;
      }
      const target = LOCATION_POINTS.find((point) => point.campusId === button.dataset.locationCampus);
      if (target) applyLocation(target, "手動選択");
    });
  });

  $$('[data-location-stop]', box).forEach((button) => {
    button.addEventListener("click", () => {
      const target = LOCATION_POINTS.find((point) => point.stopId === button.dataset.locationStop);
      if (target) applyLocation(target, "手動選択");
    });
  });
}

function applyLocation(target, source = "位置情報") {
  localStorage.setItem(CAMPUS_KEY, target.campusId);
  if (target.campusId === "suita" && target.stopId) {
    localStorage.setItem(SUITA_STOP_KEY, target.stopId);
  }

  const campusSelect = $("#default-campus");
  if (campusSelect) {
    campusSelect.value = target.campusId;
    campusSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (target.campusId === "suita" && target.stopId) {
    ["#default-suita-stop", "#dialog-suita-stop", "#origin-stop"].forEach((selector) => {
      const select = $(selector);
      if (!select) return;
      select.value = target.stopId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  hideLocationAssist();
  const locate = $("#locate-button");
  if (locate) {
    const original = "位置情報";
    locate.textContent = `${source}: ${target.label}`;
    window.setTimeout(() => { locate.textContent = original; }, 2600);
  }
  window.setTimeout(() => $("#refresh-button")?.click(), 0);
}

function classifyLocation(position) {
  const here = { lat: position.coords.latitude, lng: position.coords.longitude };
  const ranked = LOCATION_POINTS
    .map((point) => ({ point, distanceKm: distanceKm(here, point) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearest = ranked[0];

  if (!nearest || nearest.distanceKm > LOCATION_INFERENCE.maxDistanceKm) {
    return { status: "unrecognized", ranked };
  }
  if (position.coords.accuracy > LOCATION_INFERENCE.lowAccuracyMeters) {
    return { status: "low-accuracy", ranked };
  }

  if (nearest.point.campusId === "suita") {
    const suit = ranked.filter((item) => item.point.campusId === "suita");
    const separation = Math.abs((suit[1]?.distanceKm || 99) - suit[0].distanceKm);
    const uncertaintyKm = position.coords.accuracy / 1000;
    if (
      position.coords.accuracy > LOCATION_INFERENCE.ambiguousSuitaAccuracyMeters &&
      separation < uncertaintyKm
    ) {
      return { status: "ambiguous-suita", ranked };
    }
  }

  return { status: "matched", target: nearest.point, distanceKm: nearest.distanceKm, ranked };
}

function requestEnhancedLocation({ automatic = false } = {}) {
  const locate = $("#locate-button");
  if (!navigator.geolocation) {
    showLocationAssist("このブラウザでは位置情報を利用できません。現在のキャンパスを選択してください。");
    return;
  }
  if (locate && !automatic) locate.textContent = "測位中…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const result = classifyLocation(position);
      if (result.status === "matched") {
        applyLocation(result.target, "現在地");
        return;
      }
      if (result.status === "ambiguous-suita") {
        showLocationAssist("吹田キャンパスまでは判定できましたが、位置精度だけでは乗り場を確定できません。", { suitOnly: true });
      } else if (result.status === "low-accuracy") {
        showLocationAssist("位置情報の精度が低いため、自動判定せず確認をお願いしています。");
      } else {
        showLocationAssist("3キャンパス付近として認識できませんでした。現在地を選択してください。");
      }
      if (locate) locate.textContent = "位置情報";
    },
    (error) => {
      const reason = error.code === 1
        ? "位置情報の利用が許可されていません。"
        : "現在地を取得できませんでした。";
      showLocationAssist(`${reason} 手動で現在地を選択できます。`);
      if (locate) locate.textContent = "位置情報";
    },
    { enableHighAccuracy: true, timeout: 9000, maximumAge: 5 * 60 * 1000 }
  );
}

function bindEnhancedLocation() {
  const locate = $("#locate-button");
  if (locate) {
    locate.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestEnhancedLocation({ automatic: false });
    }, true);
  }

  // Request once on each page load. Browsers that already have a decision return immediately;
  // when denied/unavailable, the assist UI provides an explicit manual fallback.
  window.setTimeout(() => requestEnhancedLocation({ automatic: true }), 450);
}

function setupStayOptions() {
  const select = $("#stay-minutes");
  const wrap = $("#stay-wrap");
  if (!select || !wrap || select.dataset.v3 === "true") return;
  select.dataset.v3 = "true";
  select.innerHTML = `
    <option value="15">15分</option>
    <option value="60" selected>60分</option>
    <option value="90">90分（1コマ）</option>
    <option value="105">105分（1コマ＋15分）</option>
    <option value="75" data-custom-stay>自由入力…</option>`;

  const custom = document.createElement("input");
  custom.type = "number";
  custom.min = "5";
  custom.max = "480";
  custom.step = "5";
  custom.value = "75";
  custom.inputMode = "numeric";
  custom.className = "stay-custom-input is-hidden";
  custom.setAttribute("aria-label", "滞在時間を分で入力");
  wrap.append(custom);

  const syncCustom = () => {
    const option = select.selectedOptions[0];
    const isCustom = option?.hasAttribute("data-custom-stay");
    custom.classList.toggle("is-hidden", !isCustom);
  };
  select.addEventListener("change", syncCustom);
  custom.addEventListener("input", () => {
    const option = select.querySelector("[data-custom-stay]");
    const minutes = Math.max(5, Math.min(480, Number(custom.value) || 5));
    option.value = String(minutes);
  });
  syncCustom();
}

function currentSearchKeys() {
  const originCampus = $("#origin-campus")?.value;
  const destinationCampus = $("#destination-campus")?.value;
  const roundTrip = $("#round-trip")?.checked;
  return {
    origin: !roundTrip && originCampus === "suita" ? $("#origin-stop")?.value : originCampus,
    destination: !roundTrip && destinationCampus === "suita" ? $("#destination-stop")?.value : destinationCampus,
    originCampus,
    destinationCampus
  };
}

function adjacentJourney(delta) {
  const keys = currentSearchKeys();
  const date = $("#search-date")?.value;
  const time = $("#search-time")?.value;
  const mode = $('[data-mode].is-active')?.dataset.mode || "depart";
  const directOnly = Boolean($("#direct-only")?.checked);
  if (!keys.origin || !keys.destination || !date || !time) return null;

  const loadDay = (dateKey) => findJourneysForDate({
    origin: keys.origin,
    destination: keys.destination,
    date: dateKey,
    time: "00:00",
    mode: "depart",
    directOnly,
    limit: 999
  });

  const journeys = loadDay(date);
  const threshold = parseTime(time);
  let index;
  if (mode === "arrive") {
    index = journeys.findLastIndex((journey) => parseTime(journey.arrivalTime) <= threshold);
    if (index < 0) index = 0;
  } else {
    index = journeys.findIndex((journey) => parseTime(journey.departureTime) >= threshold);
    if (index < 0) index = journeys.length - 1;
  }

  const targetIndex = index + delta;
  if (targetIndex >= 0 && targetIndex < journeys.length) {
    return { journey: journeys[targetIndex], date };
  }

  if (delta < 0) {
    const previousDate = getPreviousServiceDate(date, { includeCurrent: false });
    if (!previousDate) return null;
    const previous = loadDay(previousDate);
    return previous.length ? { journey: previous.at(-1), date: previousDate } : null;
  }

  const nextDate = getNextServiceDate(date, { includeCurrent: false });
  if (!nextDate) return null;
  const next = loadDay(nextDate);
  return next.length ? { journey: next[0], date: nextDate } : null;
}

function shiftSearch(delta) {
  const target = adjacentJourney(delta);
  const status = $("#result-step-status");
  if (!target) {
    if (status) status.textContent = "前後に利用できる便がありません";
    return;
  }
  const mode = $('[data-mode].is-active')?.dataset.mode || "depart";
  $("#search-date").value = target.date;
  $("#search-time").value = mode === "arrive" ? target.journey.arrivalTime : target.journey.departureTime;
  $("#search-form")?.requestSubmit();
}

function ensureResultStepper() {
  if ($("#result-stepper")) return;
  const results = $("#search-results");
  if (!results) return;
  const nav = document.createElement("div");
  nav.id = "result-stepper";
  nav.className = "result-stepper is-hidden";
  nav.innerHTML = `
    <button type="button" data-result-step="-1">‹ 1本前</button>
    <span id="result-step-status">前後の便</span>
    <button type="button" data-result-step="1">1本後 ›</button>`;
  results.before(nav);
  $$('[data-result-step]', nav).forEach((button) => {
    button.addEventListener("click", () => shiftSearch(Number(button.dataset.resultStep)));
  });
  $("#search-form")?.addEventListener("submit", () => {
    nav.classList.remove("is-hidden");
    const status = $("#result-step-status");
    if (status) status.textContent = "前後の便";
  });
}

let timetableOrigin = currentCampus();
let timetableDestination = timetableOrigin === "suita" ? "toyonaka" : "suita";
let timetableInitialized = false;

function timetableOriginKey() {
  return timetableOrigin === "suita" ? currentSuitaStop() : timetableOrigin;
}

function routeType(journey) {
  return journey.isViaMinoh ? "箕面経由" : "直行";
}

function renderTimetableControls() {
  const controls = $("#timetable-route-controls");
  if (!controls) return;
  const destinations = Object.values(CAMPUSES).filter((campus) => campus.id !== timetableOrigin);
  if (!destinations.some((campus) => campus.id === timetableDestination)) {
    timetableDestination = timetableOrigin === "suita" ? "toyonaka" : "suita";
  }

  controls.innerHTML = `
    <div class="tt-campus-tabs" aria-label="出発キャンパス">
      ${Object.values(CAMPUSES).map((campus) => `<button type="button" class="${campus.id === timetableOrigin ? "is-active" : ""}" data-tt-origin="${campus.id}">${campus.name}</button>`).join("")}
    </div>
    <div class="tt-destination-row">
      <span>行先</span>
      <div class="tt-destination-buttons">
        ${destinations.map((campus) => `<button type="button" class="${campus.id === timetableDestination ? "is-active" : ""}" data-tt-destination="${campus.id}">→ ${campus.name}</button>`).join("")}
      </div>
    </div>
    <label class="tt-suita-stop ${timetableOrigin === "suita" ? "" : "is-hidden"}">
      <span>吹田の乗り場</span>
      <select id="tt-suita-stop">
        <option value="suita_engineering" ${currentSuitaStop() === "suita_engineering" ? "selected" : ""}>工学部前</option>
        <option value="suita_human_sciences" ${currentSuitaStop() === "suita_human_sciences" ? "selected" : ""}>人間科学部前</option>
      </select>
    </label>
    <div id="tt-current-status" class="tt-current-status"></div>`;

  $$('[data-tt-origin]', controls).forEach((button) => {
    button.addEventListener("click", () => {
      timetableOrigin = button.dataset.ttOrigin;
      if (timetableDestination === timetableOrigin) timetableDestination = timetableOrigin === "suita" ? "toyonaka" : "suita";
      renderTimetableControls();
      renderRouteTimetable({ autoScroll: true });
    });
  });
  $$('[data-tt-destination]', controls).forEach((button) => {
    button.addEventListener("click", () => {
      timetableDestination = button.dataset.ttDestination;
      renderTimetableControls();
      renderRouteTimetable({ autoScroll: true });
    });
  });
  $("#tt-suita-stop")?.addEventListener("change", (event) => {
    localStorage.setItem(SUITA_STOP_KEY, event.target.value);
    ["#default-suita-stop", "#dialog-suita-stop", "#origin-stop"].forEach((selector) => {
      const select = $(selector);
      if (select) select.value = event.target.value;
    });
    renderRouteTimetable({ autoScroll: true });
  });
}

function timetableCard(journey, isNext) {
  return `
    <article class="timetable-card route-timetable-card ${isNext ? "is-next" : ""}" data-tt-trip="${journey.tripId}">
      <div class="timetable-card-head">
        <strong>${journey.departureTime} → ${journey.arrivalTime}</strong>
        <span class="pill ${journey.isViaMinoh ? "pill-warning" : "pill-soft"}">${routeType(journey)}</span>
      </div>
      ${isNext ? '<div class="next-marker">現在時刻から次に乗れる便</div>' : ""}
      <div class="tt-route-caption">${STOPS[journey.originStopId].shortName} → ${STOPS[journey.destinationStopId].shortName} ・ ${journey.tripId}便</div>
      <div class="stop-times">
        ${journey.stops.map((stop) => `<span class="stop-time"><span>${STOPS[stop.stopId].shortName}</span><b>${stop.time}</b></span>`).join("")}
      </div>
    </article>`;
}

function renderRouteTimetable({ autoScroll = false } = {}) {
  const list = $("#timetable-list");
  const status = $("#tt-current-status");
  if (!list) return;
  const origin = timetableOriginKey();
  const journeys = findJourneysForDate({
    origin,
    destination: timetableDestination,
    date: NORMAL_TIMETABLE_DATE,
    time: "00:00",
    mode: "depart",
    limit: 999
  });

  const now = nowParts();
  const service = getServiceStatus(now.date);
  let nextTripId = null;
  if (service.operating) {
    const next = searchJourneys({
      origin,
      destination: timetableDestination,
      date: now.date,
      time: now.time,
      mode: "depart",
      limit: 1,
      rollover: false
    }).journeys[0];
    nextTripId = next?.tripId || null;
  }

  list.innerHTML = journeys.length
    ? journeys.map((journey) => timetableCard(journey, journey.tripId === nextTripId)).join("")
    : `<div class="empty-state">この区間を通る便はありません。</div>`;

  if (status) {
    status.textContent = !service.operating
      ? `今日は${service.reason}のため、通常時刻表のみ表示しています。`
      : nextTripId
        ? "現在時刻から次に乗れる便をハイライトしています。"
        : "本日のこの区間の運行は終了しています。";
  }

  if (autoScroll && nextTripId && $("#view-timetable")?.classList.contains("is-active")) {
    window.setTimeout(() => {
      $(`[data-tt-trip="${nextTripId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }
}

function setupTimetableUI() {
  const old = $(".timetable-direction");
  if (!old || $("#timetable-route-controls")) return;
  const controls = document.createElement("div");
  controls.id = "timetable-route-controls";
  controls.className = "timetable-route-controls";
  old.replaceWith(controls);
  renderTimetableControls();
  renderRouteTimetable();
  timetableInitialized = true;

  $$('[data-nav="timetable"]').forEach((button) => {
    button.addEventListener("click", () => {
      window.setTimeout(() => {
        if (!timetableInitialized) setupTimetableUI();
        renderTimetableControls();
        renderRouteTimetable({ autoScroll: true });
      }, 0);
    });
  });
}

function addDebugFormLink() {
  if ($("#debug-feedback-card")) return;
  const sourceCard = $(".source-card");
  if (!sourceCard) return;
  const section = document.createElement("section");
  section.id = "debug-feedback-card";
  section.className = "settings-card feedback-card";
  section.innerHTML = `
    <h3>デバッグ・改善報告</h3>
    <p>表示崩れ、時刻表の誤り、使いにくい点などを共有できます。</p>
    <a class="feedback-link" href="https://forms.gle/mA3GtsjWKSkhjMyR7" target="_blank" rel="noreferrer">報告フォームを開く ↗</a>`;
  sourceCard.before(section);
}

installStyles();
ensureLocationAssist();
setupStayOptions();
ensureResultStepper();
setupTimetableUI();
addDebugFormLink();
bindEnhancedLocation();
