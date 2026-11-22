"use client";

import { useState } from "react";

import { CircuitMap, CornerChips } from "@/components/CircuitMap";
import { DriverLapPicker } from "@/components/DriverLapPicker";
import { Reveal } from "@/components/Motion";
import { SessionPicker, useSelection } from "@/components/SessionPicker";
import {
  ConfidenceBadge,
  Empty,
  ErrorPanel,
  Loading,
  NoteList,
  Panel,
  ProvenanceBadge,
  useAsync,
} from "@/components/ui";
import { api, type CornerComparison, type DriverInfo } from "@/lib/api";
import { DASH, metres, nameDrivers, teamColour, withUncertainty } from "@/lib/format";

type Side = { name: string; colour: string };
type Pair = { a: Side; b: Side };

function sideFor(drivers: DriverInfo[], number: number | null, fallback: string): Side {
  const driver = drivers.find((d) => d.driver_number === number);
  return {
    name: driver?.name_acronym ?? (number != null ? `#${number}` : fallback),
    colour: teamColour(driver?.team_colour),
  };
}

export default function CornersPage() {
  const [selection] = useSelection();
  const [selected, setSelected] = useState<number | null>(null);
  const [radius, setRadius] = useState(300);
  const [brakeMethod, setBrakeMethod] = useState<"auto" | "flag" | "deceleration">("auto");
  const [decel, setDecel] = useState(-3);

  const ready =
    selection.sessionKey != null && selection.driverA != null && selection.driverB != null;

  const analysis = useAsync(
    () =>
      api.corners({
        sessionKey: selection.sessionKey as number,
        driverA: selection.driverA as number,
        driverB: selection.driverB as number,
        lapA: selection.lapA,
        lapB: selection.lapB,
        radiusThreshold: radius,
        brakeMethod,
        decelThreshold: decel,
      }),
    [
      selection.sessionKey,
      selection.driverA,
      selection.driverB,
      selection.lapA,
      selection.lapB,
      radius,
      brakeMethod,
      decel,
    ],
    ready,
  );

  const drivers = useAsync(
    () => api.drivers(selection.sessionKey as number),
    [selection.sessionKey],
    selection.sessionKey != null,
  );
  const list = drivers.data?.drivers ?? [];
  const pair: Pair = {
    a: sideFor(list, selection.driverA, "Driver A"),
    b: sideFor(list, selection.driverB, "Driver B"),
  };

  const rows = analysis.data?.comparison ?? [];
  const visible = selected ? rows.filter((row) => row.corner === selected) : rows;

  return (
    <div className="space-y-3">
      <Panel title="Selection" bodyClassName="space-y-3 p-3">
        <SessionPicker compact />
        <DriverLapPicker />
      </Panel>

      <Panel title="Detection settings" bodyClassName="grid gap-3 p-3 sm:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="radius">
            Corner threshold · radius below {radius} m
          </label>
          <input
            id="radius"
            type="range"
            min={60}
            max={800}
            step={10}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            className="w-full accent-signal-info"
          />
          <p className="mt-1 text-2xs text-ink-faint">
            Raise to include fast kinks, lower to keep only heavy-braking corners.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="method">
            Brake-onset method
          </label>
          <select
            id="method"
            className="field"
            value={brakeMethod}
            onChange={(event) =>
              setBrakeMethod(event.target.value as "auto" | "flag" | "deceleration")
            }
          >
            <option value="auto">Auto — brake channel, falling back to deceleration</option>
            <option value="flag">Brake channel only (measured)</option>
            <option value="deceleration">Deceleration threshold (estimated)</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="decel">
            Deceleration threshold · {decel.toFixed(1)} m/s²
          </label>
          <input
            id="decel"
            type="range"
            min={-10}
            max={-1}
            step={0.5}
            value={decel}
            onChange={(event) => setDecel(Number(event.target.value))}
            className="w-full accent-signal-info"
            disabled={brakeMethod === "flag"}
          />
          <p className="mt-1 text-2xs text-ink-faint">
            Only used by the deceleration method. Drag off a straight at speed is roughly
            −1 to −2 m/s², so a threshold above that will catch lifts as well as braking.
          </p>
        </div>
      </Panel>

      {!ready ? (
        <Panel bodyClassName="p-0">
          <Empty title="Choose a session and two drivers to compare" />
        </Panel>
      ) : analysis.loading && !analysis.data ? (
        <Panel bodyClassName="p-0">
          <Loading label="Deriving circuit geometry and corner metrics" />
        </Panel>
      ) : analysis.error ? (
        <Panel bodyClassName="p-0">
          <ErrorPanel error={analysis.error} onRetry={analysis.reload} />
        </Panel>
      ) : analysis.data ? (
        <Reveal
          className="space-y-3"
          key={`${selection.sessionKey}-${selection.driverA}-${selection.driverB}-${selection.lapA}-${selection.lapB}`}
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
            <Panel
              title="Circuit map"
              right={
                <span className="num text-2xs text-ink-faint">
                  {analysis.data.circuit.corners.length} corners ·{" "}
                  {metres(analysis.data.circuit.lap_length_m)}
                </span>
              }
              bodyClassName="p-2"
            >
              <CircuitMap
                circuit={analysis.data.circuit}
                selected={selected}
                onSelect={setSelected}
              />
            </Panel>

            <div className="space-y-3">
              <Panel title="Corners" bodyClassName="space-y-2 p-3">
                <CornerChips
                  corners={analysis.data.circuit.corners}
                  sectors={analysis.data.circuit.sectors ?? []}
                  lapLength={analysis.data.circuit.lap_length_m}
                  selected={selected}
                  onSelect={setSelected}
                />
                {selected && (
                  <button type="button" className="btn" onClick={() => setSelected(null)}>
                    Show all corners
                  </button>
                )}
              </Panel>

              <Panel title="Method" bodyClassName="space-y-2 p-3">
                {Object.entries(analysis.data.method.explanation).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-2xs leading-relaxed text-ink-faint">{value}</p>
                  </div>
                ))}
                <NoteList notes={analysis.data.circuit.notes} />
              </Panel>
            </div>
          </div>

          <Panel
            title={
              selected ? `Turn ${selected} comparison` : "Corner-by-corner comparison"
            }
            right={
              selected ? (
                <button type="button" className="btn" onClick={() => setSelected(null)}>
                  Show all corners
                </button>
              ) : null
            }
          >
            {visible.length ? (
              <CornerTable
                rows={visible}
                allRows={rows}
                pair={pair}
                selected={selected}
                onSelect={setSelected}
                approachM={Number(analysis.data.method.corner_detection.approach_m)}
                exitM={Number(analysis.data.method.corner_detection.exit_m)}
                confidenceHelp={analysis.data.method.explanation.confidence}
              />
            ) : (
              <Empty
                title="No corners detected at this threshold"
                detail="Raise the radius threshold above, or check whether this session has position data."
              />
            )}
          </Panel>

          {visible.length === 1 && <CornerDetail row={visible[0]} pair={pair} />}
        </Reveal>
      ) : null}
    </div>
  );
}

const TIME_LEVEL_S = 0.01;
const SPEED_LEVEL_KPH = 1;

function Who({ side }: { side: Side }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: side.colour }} aria-hidden />
      {side.name}
    </span>
  );
}

/** Names who had the advantage, so no one has to remember what a sign means. */
function Advantage({ side, amount }: { side: Side | null; amount: string | null }) {
  if (amount == null) return <span className="text-ink-faint">{DASH}</span>;
  if (side == null) return <span className="text-ink-muted">{amount}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Who side={side} />
      <span className="text-ink-muted">{amount}</span>
    </span>
  );
}

// The backend reports speed differences as B minus A.
function SpeedCell({ value, pair }: { value: number | null; pair: Pair }) {
  if (value == null) return <Advantage side={null} amount={null} />;
  if (Math.abs(value) < SPEED_LEVEL_KPH) return <Advantage side={null} amount="Level" />;
  return (
    <Advantage side={value > 0 ? pair.b : pair.a} amount={`+${Math.abs(value).toFixed(1)} km/h`} />
  );
}

// A positive brake difference means B braked further down the road.
function BrakeCell({ row, pair }: { row: CornerComparison; pair: Pair }) {
  const value = row.brake_point_difference_m;
  if (value == null) {
    return (
      <span className="text-ink-faint" title="No comparable braking was detected for both drivers.">
        No data
      </span>
    );
  }
  if (!row.brake_difference_significant) {
    return (
      <span
        className="text-ink-faint"
        title={`The ${Math.abs(value).toFixed(0)} m difference can't be separated from measurement error (±${(row.brake_point_uncertainty_m ?? 0).toFixed(0)} m).`}
      >
        Too close to call
      </span>
    );
  }
  return <Advantage side={value > 0 ? pair.b : pair.a} amount={`${Math.abs(value).toFixed(0)} m later`} />;
}

// A positive time delta means B fell further behind, so A gained.
function TimeCell({ value, largest, pair }: { value: number | null; largest: number; pair: Pair }) {
  const isLevel = value != null && Math.abs(value) < TIME_LEVEL_S;
  const share = value != null && largest > 0 ? (Math.abs(value) / largest) * 100 : 0;
  return (
    <div className="min-w-[10rem]">
      {value == null ? (
        <Advantage side={null} amount={null} />
      ) : isLevel ? (
        <Advantage side={null} amount="Level" />
      ) : (
        <Advantage side={value > 0 ? pair.a : pair.b} amount={`+${Math.abs(value).toFixed(3)} s`} />
      )}
      <div className="mt-1 grid grid-cols-2 gap-px" aria-hidden>
        <div className="flex h-1.5 justify-end border-r border-graphite-500">
          {value != null && value > 0 && !isLevel && (
            <span className="rounded-l" style={{ width: `${share}%`, background: pair.a.colour }} />
          )}
        </div>
        <div className="flex h-1.5">
          {value != null && value < 0 && !isLevel && (
            <span className="rounded-r" style={{ width: `${share}%`, background: pair.b.colour }} />
          )}
        </div>
      </div>
    </div>
  );
}

function CornerSummary({
  rows,
  pair,
  onSelect,
}: {
  rows: CornerComparison[];
  pair: Pair;
  onSelect: (corner: number) => void;
}) {
  const timed = rows.filter((r) => r.time_delta_s != null);
  if (!timed.length) return null;
  const forA = timed.filter((r) => (r.time_delta_s as number) >= TIME_LEVEL_S).length;
  const forB = timed.filter((r) => (r.time_delta_s as number) <= -TIME_LEVEL_S).length;
  const level = timed.length - forA - forB;
  const biggest = timed.reduce((best, row) =>
    Math.abs(row.time_delta_s as number) > Math.abs(best.time_delta_s as number) ? row : best,
  );
  const biggestValue = biggest.time_delta_s as number;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-graphite-700 px-3 py-2.5 text-xs">
      <p className="text-ink">
        <span className="font-semibold">{pair.a.name}</span> gained in {forA}{" "}
        {forA === 1 ? "corner" : "corners"}, <span className="font-semibold">{pair.b.name}</span> in{" "}
        {forB}
        {level > 0 && `, ${level} level`}
      </p>
      {Math.abs(biggestValue) >= TIME_LEVEL_S && (
        <button
          type="button"
          className="text-ink-muted underline decoration-graphite-500 underline-offset-2 hover:text-ink"
          onClick={() => onSelect(biggest.corner)}
        >
          Biggest swing: T{biggest.corner}, {biggestValue > 0 ? pair.a.name : pair.b.name} +
          {Math.abs(biggestValue).toFixed(3)} s
        </button>
      )}
    </div>
  );
}

function CornerTable({
  rows,
  allRows,
  pair,
  selected,
  onSelect,
  approachM,
  exitM,
  confidenceHelp,
}: {
  rows: CornerComparison[];
  allRows: CornerComparison[];
  pair: Pair;
  selected: number | null;
  onSelect: (corner: number | null) => void;
  approachM: number;
  exitM: number;
  confidenceHelp?: string;
}) {
  const [sortBySwing, setSortBySwing] = useState(false);
  // Scaled across every corner, so a bar keeps its size when one corner is selected.
  const largest = Math.max(0, ...allRows.map((r) => Math.abs(r.time_delta_s ?? 0)));
  const ordered = sortBySwing
    ? [...rows].sort((x, y) => Math.abs(y.time_delta_s ?? 0) - Math.abs(x.time_delta_s ?? 0))
    : rows;

  return (
    <>
      {selected == null && <CornerSummary rows={allRows} pair={pair} onSelect={onSelect} />}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Corner</th>
              <th title="Who was quicker through this stretch, and by how much.">Time gained</th>
              <th title="Who started braking further down the road. Later isn't automatically better.">
                Braked later
              </th>
              <th title="Who kept more speed at the slowest point of the corner.">Mid-corner speed</th>
              <th title="Who was faster leaving the corner.">Exit speed</th>
              <th title={confidenceHelp}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const isSelected = selected === row.corner;
              return (
                <tr
                  key={row.corner}
                  className={`cursor-pointer ${isSelected ? "bg-graphite-800" : ""}`}
                  onClick={() => onSelect(isSelected ? null : row.corner)}
                >
                  <td>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Turn ${row.corner} details`}
                      className="num font-semibold text-ink underline decoration-graphite-500 underline-offset-2"
                    >
                      T{row.corner}
                    </button>
                  </td>
                  <td className="num">
                    <TimeCell value={row.time_delta_s} largest={largest} pair={pair} />
                  </td>
                  <td className="num">
                    <BrakeCell row={row} pair={pair} />
                  </td>
                  <td className="num">
                    <SpeedCell value={row.min_speed_difference_kph} pair={pair} />
                  </td>
                  <td className="num">
                    <SpeedCell value={row.exit_speed_difference_kph} pair={pair} />
                  </td>
                  <td>
                    <ConfidenceBadge level={row.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-graphite-700 px-3 py-2">
        <p className="max-w-3xl text-2xs leading-relaxed text-ink-faint">
          {selected == null && "Select a corner for its full details. "}
          Time runs from {approachM} m before each corner to{" "}
          {exitM} m after it, so neighbouring corners overlap and won&apos;t add up to the lap gap.
        </p>
        {selected == null && rows.length > 1 && (
          <button type="button" className="btn shrink-0" onClick={() => setSortBySwing((v) => !v)}>
            {sortBySwing ? "Sort by track order" : "Sort by biggest swing"}
          </button>
        )}
      </div>
    </>
  );
}

function CornerDetail({ row, pair }: { row: CornerComparison; pair: Pair }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <Panel title={`Turn ${row.corner} — what the data shows`} bodyClassName="p-3 space-y-3">
        <p className="text-sm leading-relaxed text-ink">
          {nameDrivers(row.interpretation, pair.a.name, pair.b.name)}
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Measurement</th>
              <th className="!text-right">{pair.a.name}</th>
              <th className="!text-right">{pair.b.name}</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-ink-muted">Brake point</td>
              <td className="num text-right text-ink">
                {row.a.brake
                  ? withUncertainty(row.a.brake.onset_distance_m, row.a.brake.onset_uncertainty_m)
                  : DASH}
              </td>
              <td className="num text-right text-ink">
                {row.b.brake
                  ? withUncertainty(row.b.brake.onset_distance_m, row.b.brake.onset_uncertainty_m)
                  : DASH}
              </td>
              <td>
                <ProvenanceBadge kind={row.a.brake?.provenance ?? "unavailable"} />
              </td>
            </tr>
            <MetricRow
              label="Entry speed"
              a={row.a.entry_speed_kph}
              b={row.b.entry_speed_kph}
              unit="km/h"
              kind="measured"
            />
            <MetricRow
              label="Minimum speed"
              a={row.a.min_speed_kph}
              b={row.b.min_speed_kph}
              unit="km/h"
              kind="measured"
            />
            <MetricRow
              label="Exit speed"
              a={row.a.exit_speed_kph}
              b={row.b.exit_speed_kph}
              unit="km/h"
              kind="measured"
            />
            <MetricRow
              label="Throttle application"
              a={row.a.throttle_application_m}
              b={row.b.throttle_application_m}
              unit="m"
              kind="calculated"
            />
            <MetricRow
              label="Time to full throttle"
              a={row.a.time_to_full_throttle_s}
              b={row.b.time_to_full_throttle_s}
              unit="s"
              digits={2}
              kind="calculated"
            />
            <MetricRow
              label="Gear at apex"
              a={row.a.gear_at_apex}
              b={row.b.gear_at_apex}
              unit=""
              digits={0}
              kind="measured"
            />
            <tr>
              <td className="text-ink-muted">Braking duration</td>
              <td className="num text-right">
                {row.a.brake?.duration_s != null ? `${row.a.brake.duration_s.toFixed(2)} s` : DASH}
              </td>
              <td className="num text-right">
                {row.b.brake?.duration_s != null ? `${row.b.brake.duration_s.toFixed(2)} s` : DASH}
              </td>
              <td>
                <ProvenanceBadge
                  kind={row.a.brake?.provenance ?? "unavailable"}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Caveats" bodyClassName="p-3 space-y-2">
        <NoteList
          notes={Array.from(new Set(row.notes)).map((note) =>
            nameDrivers(note, pair.a.name, pair.b.name),
          )}
        />
        {!row.notes.length && (
          <p className="text-2xs text-ink-faint">
            No additional caveats recorded for this corner.
          </p>
        )}
      </Panel>
    </div>
  );
}

function MetricRow({
  label,
  a,
  b,
  unit,
  digits = 1,
  kind,
}: {
  label: string;
  a: number | null;
  b: number | null;
  unit: string;
  digits?: number;
  kind: "measured" | "calculated" | "estimated";
}) {
  const render = (value: number | null) =>
    value == null ? DASH : `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
  return (
    <tr>
      <td className="text-ink-muted">{label}</td>
      <td className="num text-right text-ink">{render(a)}</td>
      <td className="num text-right text-ink">{render(b)}</td>
      <td>
        <ProvenanceBadge kind={a == null && b == null ? "unavailable" : kind} />
      </td>
    </tr>
  );
}
