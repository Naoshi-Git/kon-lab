import test from "node:test";
import assert from "node:assert/strict";

import {
  getServiceStatus,
  searchJourneys,
  searchRoundTrips
} from "../src/search-engine.mjs";

test("豊中から吹田の8:00直行便を検索できる", () => {
  const result = searchJourneys({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-06-01",
    time: "07:55",
    mode: "depart",
    directOnly: true,
    limit: 1
  });

  assert.equal(result.journeys[0].tripId, "E02");
  assert.equal(result.journeys[0].departureTime, "08:00");
  assert.equal(result.journeys[0].arrivalTime, "08:30");
  assert.equal(result.journeys[0].isDirect, true);
});

test("箕面経由便を判別できる", () => {
  const result = searchJourneys({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-06-01",
    time: "09:15",
    mode: "depart",
    directOnly: false,
    limit: 1
  });

  assert.equal(result.journeys[0].tripId, "E08");
  assert.equal(result.journeys[0].isViaMinoh, true);
});

test("直行のみでは箕面経由便を除外する", () => {
  const result = searchJourneys({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-06-01",
    time: "09:15",
    mode: "depart",
    directOnly: true,
    limit: 1
  });

  assert.equal(result.journeys[0].tripId, "E09");
  assert.equal(result.journeys[0].isViaMinoh, false);
});

test("到着時刻検索は指定時刻までに着く最も遅い便を先頭にする", () => {
  const result = searchJourneys({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-06-01",
    time: "10:00",
    mode: "arrive",
    directOnly: false,
    limit: 1
  });

  assert.equal(result.journeys[0].tripId, "E08");
  assert.equal(result.journeys[0].arrivalTime, "10:00");
});

test("夏季運休日は次の通常運行日に繰り越す", () => {
  const status = getServiceStatus("2026-08-12");
  assert.equal(status.operating, false);

  const result = searchJourneys({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-08-12",
    time: "10:00",
    mode: "depart",
    limit: 1
  });

  assert.equal(result.effectiveDate, "2026-10-01");
  assert.equal(result.journeys[0].tripId, "E02");
});

test("往復検索は滞在時間後の最初の復路を組み合わせる", () => {
  const result = searchRoundTrips({
    origin: "toyonaka",
    destination: "suita",
    date: "2026-06-01",
    time: "11:25",
    mode: "depart",
    stayMinutes: 60,
    limit: 1
  });

  assert.equal(result.pairs[0].outbound.tripId, "E15");
  assert.equal(result.pairs[0].inbound.tripId, "W17");
  assert.equal(result.pairs[0].inbound.departureTime, "13:35");
});

test("吹田の人間科学部前を出発地点に指定できる", () => {
  const result = searchJourneys({
    origin: "suita_human_sciences",
    destination: "toyonaka",
    date: "2026-06-01",
    time: "09:20",
    mode: "depart",
    directOnly: true,
    limit: 1
  });

  assert.equal(result.journeys[0].tripId, "W05");
  assert.equal(result.journeys[0].departureTime, "09:25");
});
