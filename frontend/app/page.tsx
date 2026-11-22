"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { SessionPicker, useSelection } from "@/components/SessionPicker";
import {
  Empty,
  ErrorPanel,
  FeedStatusBar,
  Loading,
  Panel,
  ProvenanceBadge,
  useAsync,
} from "@/components/ui";
import { api, type TimingRow } from "@/lib/api";
import { useFlash } from "@/lib/motion";
import {
  DASH,
  clockTime,
  compoundColour,
  compoundLetter,
  gap,
  lapTime,
  sectorTime,
  speed,
  teamColour,
} from "@/lib/format";

/** Poll interval while a session is genuinely live, in milliseconds.
 *  Kept at 5 s: OpenF1 publishes position roughly every 4 s and the
 *  Community tier allows 30 requests per minute across the whole app. */
const LIVE_POLL_MS = 5000;

export default function TimingPage() {
  const [selection] = useSelection();
  const sessionKey = selection.sessionKey;
  const [tick, setTick] = useState(0);

  const timing = useAsync(
    () => api.timing(sessionKey as number),
    [sessionKey, tick],
    sessionKey != null,
  );

  const isLive = timing.data?.status.mode === "live";

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setTick((value) => value + 1), LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [isLive]);

  return (
    <div className="space-y-3">
      <Panel title="Weekend" bodyClassName="p-3">
        <SessionPicker />
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-graphite-700 bg-graphite-900 px-3 py-2">
        <FeedStatusBar status={timing.data?.status ?? null} />
        {isLive && (
          <span className="num flex items-center gap-1.5 text-2xs text-ink-faint">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-alert" />
            polling every {LIVE_POLL_MS / 1000}s · last {clockTime(new Date().toISOString())}
          </span>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Timing tower"
          right={
            timing.data?.session_best ? (
              <span className="num text-2xs text-signal-purple">
                SESSION BEST {lapTime(timing.data.session_best)}
              </span>
            ) : null
          }
          bodyClassName="overflow-auto"
        >
          {sessionKey == null ? (
            <Empty
              title="Select a weekend and session above"
              detail="Session identifiers are discovered from the provider, so the list reflects what actually ran."
            />
          ) : timing.loading && !timing.data ? (
            <Loading label="Fetching timing data" />
          ) : timing.error ? (
            <ErrorPanel error={timing.error} onRetry={timing.reload} />
          ) : !timing.data?.drivers.length ? (
            <Empty
              title="No timing data for this session"
              detail="The provider returned no laps. Sessions that were cancelled or have not run yet will look like this."
            />
          ) : (
            <TimingTower rows={timing.data.drivers} />
          )}
        </Panel>

        <div className="space-y-3">
          <Panel title="Conditions" bodyClassName="p-3">
            {timing.data?.weather ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Reading label="Air" value={timing.data.weather.air_temperature} unit="°C" />
                <Reading label="Track" value={timing.data.weather.track_temperature} unit="°C" />
                <Reading label="Humidity" value={timing.data.weather.humidity} unit="%" />
                <Reading label="Wind" value={timing.data.weather.wind_speed} unit="m/s" />
                <Reading
                  label="Rainfall"
                  value={timing.data.weather.rainfall}
                  unit=""
                  formatter={(v) => (v > 0 ? "WET" : "DRY")}
                />
              </dl>
            ) : (
              <Empty title="No weather data" detail="This session has no weather readings in the feed." />
            )}
          </Panel>

          <Panel title="Race control" bodyClassName="max-h-[460px] overflow-auto">
            {timing.data?.race_control.length ? (
              <ul className="divide-y divide-graphite-800">
                {[...timing.data.race_control].reverse().map((message, index) => (
                  <li key={index} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {message.flag && message.flag !== "CLEAR" && (
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ background: flagColour(message.flag) }}
                          aria-label={`${message.flag} flag`}
                        />
                      )}
                      <span className="num text-2xs text-ink-faint">
                        {clockTime(message.date)}
                      </span>
                      {message.lap_number != null && (
                        <span className="num text-2xs text-ink-faint">L{message.lap_number}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-ink-muted">
                      {message.message ?? message.category ?? DASH}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No race control messages" />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Reading({
  label,
  value,
  unit,
  formatter,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  formatter?: (value: number) => string;
}) {
  const text =
    value == null ? DASH : formatter ? formatter(value) : `${value.toFixed(1)}${unit}`;
  const flash = useFlash(text);
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd
        className={`num rounded-sm text-sm text-ink ${flash ? "animate-flash" : ""}`}
        style={flash ? ({ "--flash": "#4da6ff" } as CSSProperties) : undefined}
      >
        {text}
      </dd>
    </div>
  );
}

function flagColour(flag: string): string {
  const map: Record<string, string> = {
    GREEN: "#2ee6a8",
    YELLOW: "#ffb020",
    "DOUBLE YELLOW": "#ffb020",
    RED: "#ff4d5e",
    BLUE: "#4da6ff",
    CHEQUERED: "#e9edf2",
    BLACK: "#07080a",
  };
  return map[flag.toUpperCase()] ?? "#5d6670";
}

/* ------------------------------------------------------------------ */
/* Timing tower — a motion list so rows can settle into a new order    */
/* ------------------------------------------------------------------ */

/** A cell that flashes the moment its displayed value changes. */
function FlashCell({
  value,
  color,
  className = "",
  children,
}: {
  value: unknown;
  color: string;
  className?: string;
  children: ReactNode;
}) {
  const flash = useFlash(value);
  return (
    <div
      className={`rounded-sm ${className} ${flash ? "animate-flash" : ""}`}
      style={flash ? ({ "--flash": color } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function TimingTower({ rows }: { rows: TimingRow[] }) {
  const anyTyreData = useMemo(() => rows.some((row) => row.compound), [rows]);
  const reduce = useReducedMotion();

  // One grid template drives the header and every row, so columns stay aligned
  // while rows animate independently. Widths are grouped: identity, pace to the
  // field, this car's lap times, sectors, then trap / tyre / laps.
  const template = [
    "2.2rem", // pos
    "minmax(7.5rem,1fr)", // driver
    "5rem", // gap
    "5rem", // interval
    "5.2rem", // last
    "5.2rem", // best
    "3.6rem", // s1
    "3.6rem", // s2
    "3.6rem", // s3
    "3.8rem", // trap
    anyTyreData ? "4.6rem" : null, // tyre
    "2.8rem", // laps
  ]
    .filter(Boolean)
    .join(" ");

  const gridStyle: CSSProperties = { gridTemplateColumns: template, minWidth: "58rem" };

  return (
    <div>
      <div className="tower-head" style={gridStyle}>
        <span className="text-center">Pos</span>
        <span>Driver</span>
        <span className="tower-sep text-right">Gap</span>
        <span className="text-right text-ink-faint/80">Int</span>
        <span className="tower-sep text-right">Last</span>
        <span className="text-right">Best</span>
        <span className="tower-sep text-right">S1</span>
        <span className="text-right">S2</span>
        <span className="text-right">S3</span>
        <span className="tower-sep text-right">Trap</span>
        {anyTyreData && <span className="tower-sep">Tyre</span>}
        <span className="text-right">Laps</span>
      </div>

      <div>
        {rows.map((row) => (
          <TowerRow
            key={row.driver_number}
            row={row}
            anyTyreData={anyTyreData}
            gridStyle={gridStyle}
            animate={!reduce}
          />
        ))}
      </div>
    </div>
  );
}

function TowerRow({
  row,
  anyTyreData,
  gridStyle,
  animate,
}: {
  row: TimingRow;
  anyTyreData: boolean;
  gridStyle: CSSProperties;
  animate: boolean;
}) {
  const team = teamColour(row.team_colour);

  // A new fastest-in-session lap sweeps the whole row purple, once.
  const bestKey = row.is_session_best ? row.best_lap ?? null : null;
  const sweep = useFlash(bestKey) && row.is_session_best;

  return (
    <motion.div
      layout={animate ? "position" : false}
      transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
      className={`tower-row ${row.retired ? "opacity-55" : ""} ${sweep ? "animate-best-sweep" : ""}`}
      style={{ ...gridStyle, ["--team" as string]: team } as CSSProperties}
    >
      {/* Position */}
      <div className="flex justify-center">
        <span className="pos-box" style={{ ["--team" as string]: team } as CSSProperties}>
          {row.retired ? DASH : row.position ?? DASH}
        </span>
      </div>

      {/* Driver */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="num truncate font-semibold text-ink">{row.acronym}</span>
        <span className="num text-2xs text-ink-faint">{row.driver_number}</span>
        {row.retired ? (
          <span
            className="rounded-sm bg-signal-alert/15 px-1 text-2xs font-bold text-signal-alert"
            title={`Classified out after ${row.laps_completed} laps. Gap and interval are not shown because the feed's last values are frozen from the moment this car stopped.`}
          >
            OUT
          </span>
        ) : (
          row.in_pit && (
            <span className="rounded-sm bg-signal-warn/15 px-1 text-2xs font-bold text-signal-warn">
              PIT
            </span>
          )
        )}
      </div>

      {/* Gap to leader (primary) and interval to the car ahead (secondary) */}
      <div className="num tower-sep text-right font-medium text-ink">
        {row.retired ? DASH : gap(row.gap_to_leader)}
      </div>
      <div className="num text-right text-2xs text-ink-faint">
        {row.retired ? DASH : gap(row.interval)}
      </div>

      {/* Last lap — flashes on every completed lap */}
      <FlashCell value={row.last_lap} color="#4da6ff" className="num tower-sep text-right text-ink">
        {lapTime(row.last_lap)}
      </FlashCell>

      {/* Best lap — flashes purple when it improves */}
      <FlashCell
        value={row.best_lap}
        color="#c77dff"
        className={`num text-right font-medium ${row.is_session_best ? "text-signal-purple" : "text-ink"}`}
      >
        {lapTime(row.best_lap)}
      </FlashCell>

      {/* Sectors — a quieter group; green when at or under this driver's best */}
      {[0, 1, 2].map((index) => {
        const value = row.sectors[index];
        const best = row.best_sectors[index];
        const personalBest = value != null && best != null && value <= best;
        return (
          <FlashCell
            key={index}
            value={value}
            color={personalBest ? "#2ee6a8" : "#4da6ff"}
            className={`num text-right text-2xs ${index === 0 ? "tower-sep" : ""} ${
              personalBest ? "text-signal-ok" : "text-ink-faint"
            }`}
          >
            {sectorTime(value)}
          </FlashCell>
        );
      })}

      {/* Speed trap */}
      <div className="num tower-sep text-right text-2xs text-ink-faint">{speed(row.speed_trap, 0)}</div>

      {/* Tyre */}
      {anyTyreData && (
        <div className="tower-sep">
          {row.compound ? (
            <div className="flex items-center gap-1.5">
              <span
                className="tyre-pill"
                style={{ borderColor: compoundColour(row.compound), color: compoundColour(row.compound) }}
                title={row.compound}
              >
                {compoundLetter(row.compound)}
              </span>
              <span
                className="num text-2xs text-ink-faint"
                title="Tyre age is calculated from the stint's starting age plus laps completed, not measured directly."
              >
                {row.tyre_age != null ? `${row.tyre_age}L` : DASH}
              </span>
            </div>
          ) : (
            <ProvenanceBadge kind="unavailable" />
          )}
        </div>
      )}

      {/* Laps */}
      <div className="num text-right text-2xs text-ink-faint">{row.laps_completed}</div>
    </motion.div>
  );
}
