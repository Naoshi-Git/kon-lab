import {
  CAMPUSES,
  SERVICE_CALENDAR,
  STOPS,
  TRIPS
} from "../data/timetable-2026.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey, days) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function combineDateAndTime(dateKey, time) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function isWithinRange(dateKey, start, end) {
  return dateKey >= start && dateKey <= end;
}

export function getServiceStatus(dateKey) {
  const date = fromDateKey(dateKey);

  if (dateKey < SERVICE_CALENDAR.startDate || dateKey > SERVICE_CALENDAR.endDate) {
    return {
      operating: false,
      reason: "この年度の時刻表対象外です",
      code: "out-of-range"
    };
  }

  const special = SERVICE_CALENDAR.specialService.find((item) => item.date === dateKey);
  if (special) {
    return {
      operating: false,
      reason: special.label,
      code: special.status
    };
  }

  if (!SERVICE_CALENDAR.weeklyServiceDays.includes(date.getDay())) {
    return {
      operating: false,
      reason: "土日には運行しません",
      code: "weekend"
    };
  }

  if (SERVICE_CALENDAR.nationalHolidays.includes(dateKey)) {
    return {
      operating: false,
      reason: "祝日には運行しません",
      code: "holiday"
    };
  }

  const closure = SERVICE_CALENDAR.closures.find(([start, end]) =>
    isWithinRange(dateKey, start, end)
  );

  if (closure) {
    return {
      operating: false,
      reason: closure[2],
      code: "closure"
    };
  }

  return {
    operating: true,
    reason: "通常ダイヤで運行",
    code: "operating"
  };
}

export function getNextServiceDate(dateKey, { includeCurrent = true, maxDays = 370 } = {}) {
  for (let offset = includeCurrent ? 0 : 1; offset <= maxDays; offset += 1) {
    const candidate = addDays(dateKey, offset);
    if (getServiceStatus(candidate).operating) return candidate;
  }
  return null;
}

export function getPreviousServiceDate(dateKey, { includeCurrent = true, maxDays = 370 } = {}) {
  for (let offset = includeCurrent ? 0 : 1; offset <= maxDays; offset += 1) {
    const candidate = addDays(dateKey, -offset);
    if (getServiceStatus(candidate).operating) return candidate;
  }
  return null;
}

export function resolveStopId(key, role = "origin") {
  if (STOPS[key]) return key;
  const campus = CAMPUSES[key];
  if (!campus) throw new Error(`Unknown campus or stop: ${key}`);
  return role === "destination"
    ? campus.defaultDestinationStop
    : campus.defaultOriginStop;
}

export function campusIdForKey(key) {
  if (CAMPUSES[key]) return key;
  if (STOPS[key]) return STOPS[key].campusId;
  throw new Error(`Unknown campus or stop: ${key}`);
}

export function getSegment(trip, originKey, destinationKey) {
  const originStopId = resolveStopId(originKey, "origin");
  const destinationStopId = resolveStopId(destinationKey, "destination");

  const originIndex = trip.stops.findIndex((stop) => stop.stopId === originStopId);
  const destinationIndex = trip.stops.findIndex((stop) => stop.stopId === destinationStopId);

  if (originIndex < 0 || destinationIndex < 0 || originIndex >= destinationIndex) return null;

  const origin = trip.stops[originIndex];
  const destination = trip.stops[destinationIndex];
  const includedStops = trip.stops.slice(originIndex, destinationIndex + 1);
  const originCampus = campusIdForKey(originKey);
  const destinationCampus = campusIdForKey(destinationKey);
  const minohIsIntermediate = includedStops
    .slice(1, -1)
    .some((stop) => stop.stopId === "minoh");

  return {
    origin,
    destination,
    includedStops,
    originCampus,
    destinationCampus,
    durationMinutes: parseTime(destination.time) - parseTime(origin.time),
    isViaMinoh: minohIsIntermediate,
    isDirect:
      originCampus === "toyonaka" && destinationCampus === "suita"
        ? !minohIsIntermediate
        : originCampus === "suita" && destinationCampus === "toyonaka"
          ? !minohIsIntermediate
          : includedStops.length === 2
  };
}

export function findJourneysForDate({
  origin,
  destination,
  date,
  time = "00:00",
  mode = "depart",
  directOnly = false,
  limit = 6
}) {
  const status = getServiceStatus(date);
  if (!status.operating) return [];

  const threshold = parseTime(time);
  const journeys = [];

  for (const trip of TRIPS) {
    const segment = getSegment(trip, origin, destination);
    if (!segment) continue;
    if (directOnly && !segment.isDirect) continue;

    const departureMinutes = parseTime(segment.origin.time);
    const arrivalMinutes = parseTime(segment.destination.time);

    if (mode === "arrive" && arrivalMinutes > threshold) continue;
    if (mode !== "arrive" && departureMinutes < threshold) continue;

    journeys.push({
      tripId: trip.id,
      tripNumber: trip.number,
      direction: trip.direction,
      serviceDate: date,
      originStopId: segment.origin.stopId,
      destinationStopId: segment.destination.stopId,
      departureTime: segment.origin.time,
      arrivalTime: segment.destination.time,
      departureDateTime: combineDateAndTime(date, segment.origin.time),
      arrivalDateTime: combineDateAndTime(date, segment.destination.time),
      durationMinutes: segment.durationMinutes,
      isViaMinoh: segment.isViaMinoh,
      isDirect: segment.isDirect,
      stops: segment.includedStops
    });
  }

  journeys.sort((a, b) => {
    if (mode === "arrive") {
      return b.departureDateTime - a.departureDateTime;
    }
    return a.departureDateTime - b.departureDateTime;
  });

  return journeys.slice(0, limit);
}

export function searchJourneys({
  origin,
  destination,
  date,
  time,
  mode = "depart",
  directOnly = false,
  limit = 6,
  rollover = true
}) {
  if (campusIdForKey(origin) === campusIdForKey(destination)) {
    return {
      journeys: [],
      requestedDate: date,
      effectiveDate: date,
      advancedToNextService: false,
      serviceStatus: getServiceStatus(date),
      error: "出発地と到着地は別のキャンパスを選んでください"
    };
  }

  const requestedStatus = getServiceStatus(date);

  if (mode === "arrive") {
    return {
      journeys: findJourneysForDate({
        origin,
        destination,
        date,
        time,
        mode,
        directOnly,
        limit
      }),
      requestedDate: date,
      effectiveDate: date,
      advancedToNextService: false,
      serviceStatus: requestedStatus,
      error: null
    };
  }

  const firstDate = requestedStatus.operating
    ? date
    : getNextServiceDate(date, { includeCurrent: false });

  if (!firstDate) {
    return {
      journeys: [],
      requestedDate: date,
      effectiveDate: date,
      advancedToNextService: false,
      serviceStatus: requestedStatus,
      error: "この時刻表の期間内に運行日が見つかりません"
    };
  }

  let effectiveDate = firstDate;
  let effectiveTime = effectiveDate === date ? time : "00:00";
  let journeys = findJourneysForDate({
    origin,
    destination,
    date: effectiveDate,
    time: effectiveTime,
    mode: "depart",
    directOnly,
    limit
  });

  if (journeys.length === 0 && rollover) {
    const nextDate = getNextServiceDate(effectiveDate, { includeCurrent: false });
    if (nextDate) {
      effectiveDate = nextDate;
      effectiveTime = "00:00";
      journeys = findJourneysForDate({
        origin,
        destination,
        date: effectiveDate,
        time: effectiveTime,
        mode: "depart",
        directOnly,
        limit
      });
    }
  }

  return {
    journeys,
    requestedDate: date,
    effectiveDate,
    advancedToNextService: effectiveDate !== date,
    serviceStatus: requestedStatus,
    error: null
  };
}

export function searchRoundTrips({
  origin,
  destination,
  date,
  time,
  mode = "depart",
  directOnly = false,
  stayMinutes = 60,
  limit = 3
}) {
  const outboundSearch = searchJourneys({
    origin,
    destination,
    date,
    time,
    mode,
    directOnly,
    limit,
    rollover: true
  });

  const pairs = [];

  for (const outbound of outboundSearch.journeys) {
    const returnThreshold = new Date(outbound.arrivalDateTime.getTime() + stayMinutes * 60 * 1000);
    const returnDate = toDateKey(returnThreshold);
    const returnTime = `${String(returnThreshold.getHours()).padStart(2, "0")}:${String(
      returnThreshold.getMinutes()
    ).padStart(2, "0")}`;

    const returnSearch = searchJourneys({
      origin: destination,
      destination: origin,
      date: returnDate,
      time: returnTime,
      mode: "depart",
      directOnly,
      limit: 1,
      rollover: true
    });

    if (returnSearch.journeys[0]) {
      pairs.push({
        outbound,
        inbound: returnSearch.journeys[0],
        stayMinutes,
        returnAdvancedToNextService: returnSearch.advancedToNextService
      });
    }
  }

  return {
    pairs: pairs.slice(0, limit),
    outboundSearch
  };
}

export function getUpcomingDepartures({
  origin,
  date,
  time,
  limit = 5
}) {
  const originCampus = campusIdForKey(origin);
  const destinations = Object.keys(CAMPUSES).filter((id) => id !== originCampus);
  const all = [];

  for (const destination of destinations) {
    const result = searchJourneys({
      origin,
      destination,
      date,
      time,
      mode: "depart",
      limit,
      rollover: false
    });
    for (const journey of result.journeys) {
      all.push({ ...journey, destinationCampusId: destination });
    }
  }

  const seen = new Set();
  return all
    .sort((a, b) => a.departureDateTime - b.departureDateTime)
    .filter((journey) => {
      const key = `${journey.tripId}:${journey.originStopId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function describeJourney(journey) {
  const origin = STOPS[journey.originStopId];
  const destination = STOPS[journey.destinationStopId];
  return {
    originName: origin.name,
    destinationName: destination.name,
    routeType: journey.isViaMinoh ? "箕面経由" : "直行",
    durationLabel: `${journey.durationMinutes}分`
  };
}

export function distanceKm(a, b) {
  const earthRadius = 6371;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function inferNearestCampus(latitude, longitude) {
  const current = { lat: latitude, lng: longitude };
  return Object.values(CAMPUSES)
    .map((campus) => ({
      campus,
      distanceKm: distanceKm(current, campus.coordinates)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

export function getTimetableRows(direction) {
  return TRIPS.filter((trip) => trip.direction === direction);
}

export const __private = {
  DAY_MS
};
