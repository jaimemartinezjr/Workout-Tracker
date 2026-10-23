export type DistanceUnit = "km" | "mi";

const KM_PER_MI = 1.609344;

export function parsePaceInput(value: string): number | null {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;

  const totalSeconds = Number(match[1]) * 60 + Number(match[2]);
  return totalSeconds > 0 ? totalSeconds : null;
}

export function formatPaceInput(totalSeconds: number): string {
  const roundedSeconds = Math.round(totalSeconds);
  return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

export function paceToSecondsPerKm(
  secondsPerDistanceUnit: number,
  distanceUnit: DistanceUnit,
): number {
  return Math.round(secondsPerDistanceUnit / (distanceUnit === "mi" ? KM_PER_MI : 1));
}

export function paceFromSecondsPerKm(
  secondsPerKm: number,
  distanceUnit: DistanceUnit,
): number {
  return Math.round(secondsPerKm * (distanceUnit === "mi" ? KM_PER_MI : 1));
}
