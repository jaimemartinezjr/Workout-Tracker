import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listGoals, type Goal } from "./goalsApi";
import { listProgress, type ProgressPoint } from "./progressApi";
import "./progress.css";

type Props = {
  getToken: () => Promise<string | null>;
  weightUnit: "kg" | "lb";
  distanceUnit: "km" | "mi";
  refreshKey: number;
};

type ChartPoint = {
  workout_id: string;
  date: string;
  date_label: string;
  weight: number | null;
  distance: number | null;
  pace: number | null;
};

type MetricChartProps = {
  title: string;
  unit: string;
  dataKey: "weight" | "distance" | "pace";
  data: ChartPoint[];
  target: number;
  targetLabel: string;
  color: string;
  formatValue: (value: number) => string;
};

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

function displayNumber(value: number, decimals = 1) {
  return String(Number(value.toFixed(decimals)));
}

function formatPace(totalSeconds: number) {
  const roundedSeconds = Math.round(totalSeconds);
  return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function MetricChart({
  title,
  unit,
  dataKey,
  data,
  target,
  targetLabel,
  color,
  formatValue,
}: MetricChartProps) {
  const values = data
    .map((point) => point[dataKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const bounds = [...values, target];
  const minimum = Math.min(...bounds);
  const maximum = Math.max(...bounds);
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.1, 1);
  const chartDomain: [number, number] = [
    Math.max(0, minimum - range * 0.12),
    maximum + range * 0.12,
  ];
  const accessibleSummary = data
    .map((point) => {
      const value = point[dataKey];
      return `${point.date_label}: ${value == null ? "no data" : `${formatValue(value)} ${unit}`}`;
    })
    .join("; ");

  return (
    <section className="progress-chart" aria-label={`${title} chart`}>
      <header className="progress-chart-heading">
        <h4>{title}</h4>
        <span>GOAL {targetLabel}</span>
      </header>
      {data.length ? (
        <>
          <div
            className="progress-chart-plot"
            role="img"
            aria-label={`${title} over time. ${accessibleSummary}. Dashed line marks the goal of ${targetLabel}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 2 }}>
                <CartesianGrid stroke="#303a32" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="date_label"
                  tick={{ fill: "#9aa79e", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#3a463d" }}
                  minTickGap={18}
                />
                <YAxis
                  width={48}
                  tick={{ fill: "#9aa79e", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatValue(Number(value))}
                  domain={chartDomain}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #465347",
                    borderRadius: 4,
                    background: "#141b16",
                    color: "#eff4ec",
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#b4f36a", marginBottom: 4 }}
                  labelFormatter={(label) => String(label)}
                  formatter={(value) => [`${formatValue(Number(value))} ${unit}`, title]}
                />
                <ReferenceLine
                  y={target}
                  stroke="#b4f36a"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  name={title}
                  stroke={color}
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5, stroke: "#111714", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="progress-chart-legend" aria-hidden="true">
            <span><i className="progress-legend-line" style={{ background: color }} />Logged</span>
            <span><i className="progress-legend-target" />Goal</span>
          </div>
        </>
      ) : (
        <p className="progress-chart-empty">Log a matching session to see this trend.</p>
      )}
    </section>
  );
}

function chartPointsForGoal(
  goal: Goal,
  points: ProgressPoint[],
  weightUnit: Props["weightUnit"],
  distanceUnit: Props["distanceUnit"],
): ChartPoint[] {
  const weightMultiplier = weightUnit === "lb" ? 1 / KG_PER_LB : 1;
  const distanceMultiplier = distanceUnit === "mi" ? 1 / KM_PER_MI : 1;
  const paceMultiplier = distanceUnit === "mi" ? KM_PER_MI : 1;

  return points
    .filter((point) => point.goal_id === goal.id)
    .map((point) => ({
      workout_id: point.workout_id,
      date: point.performed_on,
      date_label: dateLabel(point.performed_on),
      weight: point.weight_kg == null
        ? null
        : Number((point.weight_kg * weightMultiplier).toFixed(2)),
      distance: point.distance_km == null
        ? null
        : Number((point.distance_km * distanceMultiplier).toFixed(2)),
      pace: point.pace_seconds_per_km == null
        ? null
        : Math.round(point.pace_seconds_per_km * paceMultiplier),
    }))
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.workout_id.localeCompare(right.workout_id),
    );
}

export default function ProgressCharts({
  getToken,
  weightUnit,
  distanceUnit,
  refreshKey,
}: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [points, setPoints] = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError("");
    Promise.all([listGoals(getToken), listProgress(getToken)])
      .then(([loadedGoals, loadedPoints]) => {
        if (!isCurrent) return;
        setGoals(loadedGoals);
        setPoints(loadedPoints);
      })
      .catch((loadError: unknown) => {
        if (!isCurrent) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Progress couldn't be loaded. Please try again.",
        );
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [getToken, refreshKey, retryKey]);

  return (
    <section className="progress-section" aria-labelledby="progress-title">
      <header className="progress-section-heading">
        <div>
          <span className="workouts-overline">MEASURED AGAINST YOUR TARGETS</span>
          <h2 id="progress-title">Progress</h2>
        </div>
        <p>Each point shows the strongest logged set or one recorded run.</p>
      </header>

      {loading ? (
        <p className="progress-message" aria-live="polite">Loading your progress…</p>
      ) : error ? (
        <div className="progress-error" role="alert">
          <span>{error}</span>
          <button
            className="workouts-text-button"
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
          >
            Try again
          </button>
        </div>
      ) : goals.length === 0 ? (
        <p className="progress-message">Add a lift or run goal to compare your training with a target.</p>
      ) : (
        <div className="progress-goal-list">
          {goals.map((goal) => {
            const data = chartPointsForGoal(goal, points, weightUnit, distanceUnit);
            const latest = data[data.length - 1];

            return (
              <article className={`progress-goal-card ${goal.goal_type}`} key={goal.id}>
                <header className="progress-goal-heading">
                  <div>
                    <span className="progress-goal-type">
                      {goal.goal_type === "strength" ? "LIFT TARGET" : "RUN TARGET"}
                    </span>
                    <h3>{goal.goal_type === "strength" ? goal.exercise_name : "Running"}</h3>
                  </div>
                  <div className="progress-target-summary">
                    <span>TARGET</span>
                    <strong>
                      {goal.goal_type === "strength"
                        ? `${displayNumber((goal.target_weight_kg ?? 0) * (weightUnit === "lb" ? 1 / KG_PER_LB : 1))} ${weightUnit} × ${goal.target_reps} reps`
                        : `${displayNumber((goal.target_distance_km ?? 0) * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1))} ${distanceUnit} · ${formatPace((goal.target_pace_seconds_per_km ?? 0) * (distanceUnit === "mi" ? KM_PER_MI : 1))} / ${distanceUnit}`}
                    </strong>
                    <span className="progress-latest">
                      {latest
                        ? `Latest session · ${dateLabel(latest.date)}`
                        : "No matching sessions yet"}
                    </span>
                  </div>
                </header>

                <div className="progress-metric-grid">
                  {goal.goal_type === "strength" ? (
                    <>
                      <MetricChart
                        title={`Top weight · ${weightUnit}`}
                        unit={weightUnit}
                        dataKey="weight"
                        data={data}
                        target={(goal.target_weight_kg ?? 0) * (weightUnit === "lb" ? 1 / KG_PER_LB : 1)}
                        targetLabel={`${displayNumber((goal.target_weight_kg ?? 0) * (weightUnit === "lb" ? 1 / KG_PER_LB : 1))} ${weightUnit}`}
                        color="#b4f36a"
                        formatValue={(value) => displayNumber(value, 1)}
                      />
                    </>
                  ) : (
                    <>
                      <MetricChart
                        title={`Distance · ${distanceUnit}`}
                        unit={distanceUnit}
                        dataKey="distance"
                        data={data}
                        target={(goal.target_distance_km ?? 0) * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1)}
                        targetLabel={`${displayNumber((goal.target_distance_km ?? 0) * (distanceUnit === "mi" ? 1 / KM_PER_MI : 1))} ${distanceUnit}`}
                        color="#9cd2bd"
                        formatValue={(value) => displayNumber(value, 1)}
                      />
                      <MetricChart
                        title={`Pace · min:sec / ${distanceUnit}`}
                        unit={`/${distanceUnit}`}
                        dataKey="pace"
                        data={data}
                        target={(goal.target_pace_seconds_per_km ?? 0) * (distanceUnit === "mi" ? KM_PER_MI : 1)}
                        targetLabel={`${formatPace((goal.target_pace_seconds_per_km ?? 0) * (distanceUnit === "mi" ? KM_PER_MI : 1))} / ${distanceUnit}`}
                        color="#f0b17b"
                        formatValue={formatPace}
                      />
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
