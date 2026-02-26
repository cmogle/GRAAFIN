const DEFAULT_PRIMARY_ATHLETE_ID = 69629233;

function parseAthleteId(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

export function getPrimaryAthleteId(): number {
  const configured =
    parseAthleteId(process.env.APP_PRIMARY_ATHLETE_ID) ??
    parseAthleteId(process.env.PRIMARY_ATHLETE_ID) ??
    parseAthleteId(process.env.STRAVA_PRIMARY_ATHLETE_ID) ??
    parseAthleteId(process.env.FIONNUALA_STRAVA_ATHLETE_ID) ??
    parseAthleteId(process.env.STRAVA_ATHLETE_ID);

  return configured ?? DEFAULT_PRIMARY_ATHLETE_ID;
}
