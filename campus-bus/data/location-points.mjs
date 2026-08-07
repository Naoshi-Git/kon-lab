// Position targets used only for on-device location inference.
// Suita stop coordinates were provided from field verification.
// Toyonaka is the existing library/shuttle-stop vicinity estimate.
// Minoh was corrected to the current Semba-higashi campus (the previous value pointed near the former Saito campus).
export const LOCATION_POINTS = [
  {
    id: "toyonaka",
    campusId: "toyonaka",
    stopId: "toyonaka",
    label: "豊中・総合図書館前",
    lat: 34.8053,
    lng: 135.4548,
    precision: "approximate"
  },
  {
    id: "minoh",
    campusId: "minoh",
    stopId: "minoh",
    label: "箕面キャンパス前",
    lat: 34.85358,
    lng: 135.51669,
    precision: "campus"
  },
  {
    id: "suita_engineering",
    campusId: "suita",
    stopId: "suita_engineering",
    label: "吹田・工学部前",
    lat: 34.8238611111,
    lng: 135.5238333333,
    precision: "verified"
  },
  {
    id: "suita_human_sciences",
    campusId: "suita",
    stopId: "suita_human_sciences",
    label: "吹田・人間科学部前",
    lat: 34.8180277778,
    lng: 135.5252777778,
    precision: "verified"
  }
];

export const LOCATION_INFERENCE = {
  maxDistanceKm: 2.0,
  ambiguousSuitaAccuracyMeters: 350,
  lowAccuracyMeters: 1500
};
