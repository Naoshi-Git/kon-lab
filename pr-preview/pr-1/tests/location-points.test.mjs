import test from "node:test";
import assert from "node:assert/strict";

import { LOCATION_POINTS } from "../data/location-points.mjs";
import { CAMPUSES } from "../data/timetable-2026.mjs";
import { distanceKm } from "../src/search-engine.mjs";

test("箕面キャンパス座標は船場東の現キャンパスへ更新されている", () => {
  assert.ok(CAMPUSES.minoh.coordinates.lat > 34.85);
  assert.ok(CAMPUSES.minoh.coordinates.lng > 135.51);
});

test("吹田の工学部前と人間科学部前を別位置として保持する", () => {
  const engineering = LOCATION_POINTS.find((point) => point.id === "suita_engineering");
  const human = LOCATION_POINTS.find((point) => point.id === "suita_human_sciences");
  assert.ok(engineering);
  assert.ok(human);
  const separation = distanceKm(engineering, human);
  assert.ok(separation > 0.6 && separation < 0.75);
});

test("工学部前の座標では工学部前が最寄り候補になる", () => {
  const engineering = LOCATION_POINTS.find((point) => point.id === "suita_engineering");
  const ranked = LOCATION_POINTS
    .map((point) => ({ point, distance: distanceKm(engineering, point) }))
    .sort((a, b) => a.distance - b.distance);
  assert.equal(ranked[0].point.id, "suita_engineering");
});
