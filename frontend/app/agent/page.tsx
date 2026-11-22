"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EChartsOption } from "echarts";
import { motion, useReducedMotion } from "framer-motion";

import { AgentControl } from "@/components/AgentControl";
import { Markdown } from "@/components/Markdown";
import { CHART_BASE, Chart, Empty, Panel, ProvenanceBadge, axis } from "@/components/ui";
import { useFlash } from "@/lib/motion";
import {
  liveApi,
  type LiveCommentary,
  type LiveDriver,
  type LiveEvent,
  type LiveEventCategory,
  type LiveRaceControl,
  type LiveRadio,
  type LiveState,
  type LiveTelemetry,
} from "@/lib/api";
import { DASH, clockTime, compoundColour, compoundLetter, teamColour } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = [], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const result = await fn();
        if (!stopped) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!stopped) setError(err as Error);
      } finally {
        if (!stopped) timer = setTimeout(run, ms);
      }
    };
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, ms]);
  return { data, error };
}

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

const TRACK_STATUS_STYLE: Record<string, string> = {
  "1": "border-signal-ok/40 bg-signal-ok/10 text-signal-ok",
  "2": "border-signal-warn/40 bg-signal-warn/10 text-signal-warn",
  "4": "border-signal-warn/60 bg-signal-warn/20 text-signal-warn",
  "5": "border-signal-alert/60 bg-signal-alert/20 text-signal-alert",
  "6": "border-signal-warn/60 bg-signal-warn/20 text-signal-warn",
  "7": "border-signal-warn/40 bg-signal-warn/10 text-signal-warn",
};

function flagColour(flag?: string | null, category?: string | null): string {
  const map: Record<string, string> = {
    GREEN: "#2ee6a8",
    CLEAR: "#2ee6a8",
    YELLOW: "#ffb020",
    "DOUBLE YELLOW": "#ffb020",
    RED: "#ff4d5e",
    BLUE: "#4da6ff",
    CHEQUERED: "#e9edf2",
    "BLACK AND WHITE": "#e9edf2",
  };
  if (flag && map[flag.toUpperCase()]) return map[flag.toUpperCase()];
  if (category === "SafetyCar") return "#ffb020";
  return "#5d6670";
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AgentPage() {
  const { data: state, error } = usePoll(liveApi.state, 1000);
  const [selected, setSelected] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<LiveCommentary[]>([]);
  const lastI = useRef(0);
  const sessionKey = state?.session_key ?? null;
  const sourceMode = state?.mode ?? null;

  // Commentary arrives incrementally; reset when the session or source changes.
  useEffect(() => {
    setCommentary([]);
    lastI.current = 0;
  }, [sessionKey, sourceMode]);

  const commentaryCount = state?.commentary_count ?? 0;
  useEffect(() => {
    if (!state?.available) return;
    if (commentaryCount < lastI.current) {
      // A new run restarted the numbering
      setCommentary([]);
      lastI.current = 0;
    }
    if (commentaryCount <= lastI.current) return;
    liveApi
      .commentary(lastI.current)
      .then((res) => {
        if (!res.items.length) return;
        lastI.current = Math.max(lastI.current, ...res.items.map((c) => c.i));
        setCommentary((prev) => {
          const seen = new Set(prev.map((c) => c.i));
          return [...prev, ...res.items.filter((c) => !seen.has(c.i))];
        });
      })
      .catch(() => undefined);
  }, [commentaryCount, state?.available]);

  const drivers = useMemo(() => state?.drivers ?? [], [state]);
  const focus = selected ?? drivers[0]?.num ?? null;

  let body: React.ReactNode;
  if (error) {
    body = (
      <Panel title="Agent">
        <Empty title="Cannot reach the Delta backend" detail={error.message} />
      </Panel>
    );
  } else if (!state) {
    body = <Panel title="Agent"><Empty title="Connecting to the race agent…" /></Panel>;
  } else if (!state.available) {
    body = (
      <Panel title="Agent">
        <Empty
          title="Nothing to show yet"
          detail="Start a replay or live session above. Readings, telemetry and Claude's explanations appear here."
        />
      </Panel>
    );
  } else {
    body = (
      <>
        <StatusStrip state={state} />
        {state.agent?.waiting_for_data ? (
          <Panel title="Waiting">
            <Empty
              title="The race agent is running and waiting for live data"
              detail={
                state.agent?.waiting_reason ??
                "Readings appear once the recorder receives the session feed (usually up to an hour before a race, 15 minutes before practice or qualifying)."
              }
            />
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <Panel
                title="Timing"
                right={<ProvenanceBadge kind="measured" />}
                className="xl:col-span-5"
                bodyClassName="overflow-x-auto"
              >
                <TimingTower drivers={drivers} selected={focus} onSelect={setSelected} />
              </Panel>
              <div className="flex flex-col gap-3 xl:col-span-4">
                <Panel title="Track" right={<span className="text-2xs text-ink-faint">click a car to follow it</span>}>
                  <TrackMap state={state} selected={focus} onSelect={setSelected} />
                </Panel>
                <TelemetryPanel driver={drivers.find((d) => d.num === focus) ?? null} />
              </div>
              <ExplainPanel state={state} commentary={commentary} className="xl:col-span-3" />
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
              <EventsPanel state={state} className="xl:col-span-5" />
              <RadioPanel state={state} className="xl:col-span-4" />
              <div className="flex flex-col gap-3 xl:col-span-3">
                <RaceControlPanel items={state.race_control ?? []} />
                <ChampionshipPanel state={state} />
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AgentControl />
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

function StatusStrip({ state }: { state: LiveState }) {
  const s = state.session ?? {};
  const w = state.weather ?? {};
  const agent = state.agent ?? {};
  const mode = agent.finished
    ? { label: "FINISHED", dot: "bg-ink-faint", text: "text-ink-muted" }
    : state.stale
      ? { label: `STALE · ${Math.round(state.age_seconds ?? 0)}s`, dot: "bg-signal-alert", text: "text-signal-alert" }
      : state.mode === "replay"
        ? { label: "REPLAY", dot: "bg-signal-info animate-pulse-dot", text: "text-signal-info" }
        : { label: "LIVE · F1TV", dot: "bg-signal-alert animate-pulse-dot", text: "text-signal-alert" };
  const trackStyle = TRACK_STATUS_STYLE[s.track_status ?? ""] ?? "border-graphite-600 bg-graphite-800 text-ink-muted";
  const rain = String(w.Rainfall ?? "0");

  return (
    <section className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
      <div className="flex items-center gap-2" title={state.mode === "replay" ? "A past session replayed through the live pipeline. Not live." : "Recorded from the official F1 live-timing feed with an F1TV subscription."}>
        <span className={`h-2 w-2 rounded-full ${mode.dot}`} />
        <span className={`text-2xs font-bold tracking-[0.16em] ${mode.text}`}>{mode.label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-ink">{s.meeting ?? DASH}</span>
        <span className="text-xs text-ink-muted">{s.session}</span>
      </div>
      {s.lap != null && (
        <span className="num text-sm text-ink">
          LAP {s.lap}
          <span className="text-ink-faint">/{s.total_laps ?? DASH}</span>
        </span>
      )}
      <span className={`rounded-sm border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider ${trackStyle}`}>
        {state.track_status_label ?? s.track_message ?? "Track status unknown"}
      </span>
      {s.remaining && s.remaining !== "00:00:00" && (
        <span className="num text-xs text-ink-muted">{s.remaining} left</span>
      )}
      <span className="text-2xs uppercase tracking-wider text-ink-faint">{s.status}</span>
      <div className="flex flex-wrap gap-x-3 text-2xs text-ink-faint">
        {w.AirTemp != null && <span>AIR <span className="num text-ink-muted">{w.AirTemp}°</span></span>}
        {w.TrackTemp != null && <span>TRACK <span className="num text-ink-muted">{w.TrackTemp}°</span></span>}
        {w.Humidity != null && <span>HUM <span className="num text-ink-muted">{w.Humidity}%</span></span>}
        {w.WindSpeed != null && <span>WIND <span className="num text-ink-muted">{w.WindSpeed} m/s</span></span>}
        <span className={rain !== "0" && rain !== "False" ? "font-semibold text-signal-info" : ""}>
          {rain !== "0" && rain !== "False" ? "RAIN" : "DRY"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3 text-2xs text-ink-faint">
        {state.feed_clock && <span>FEED <span className="num text-ink-muted">{clockTime(state.feed_clock)}</span></span>}
        <span title="Claude explains the feed via the Claude Code CLI">
          {agent.dry_run ? "CLAUDE OFF (dry run)" : `CLAUDE ${agent.model ?? ""}`}
          {agent.busy && <span className="ml-1 text-signal-info">· writing…</span>}
        </span>
        {!agent.dry_run && (
          <span className="num">{agent.claude_calls ?? 0} calls · ${(agent.cost_usd ?? 0).toFixed(2)}</span>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Timing tower                                                        */
/* ------------------------------------------------------------------ */

/** A cell that flashes the moment its displayed value changes. */
function LiveFlashCell({
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

function TimingTower({
  drivers,
  selected,
  onSelect,
}: {
  drivers: LiveDriver[];
  selected: string | null;
  onSelect: (num: string) => void;
}) {
  const reduce = useReducedMotion();
  const template = [
    "2.2rem", // pos
    "minmax(6.5rem,1fr)", // driver
    "4.4rem", // gap
    "4.4rem", // interval
    "4.8rem", // last
    "4.8rem", // best
    "3.2rem", // s1
    "3.2rem", // s2
    "3.2rem", // s3
    "4.2rem", // tyre
    "2.4rem", // pit
  ].join(" ");
  const gridStyle: CSSProperties = { gridTemplateColumns: template, minWidth: "48rem" };

  return (
    <div>
      <div className="tower-head" style={gridStyle}>
        <span className="text-center">P</span>
        <span>Driver</span>
        <span className="tower-sep text-right">Gap</span>
        <span className="text-right text-ink-faint/80">Int</span>
        <span className="tower-sep text-right">Last</span>
        <span className="text-right">Best</span>
        <span className="tower-sep text-right">S1</span>
        <span className="text-right">S2</span>
        <span className="text-right">S3</span>
        <span className="tower-sep">Tyre</span>
        <span className="text-right">Pit</span>
      </div>
      <div>
        {drivers.map((d) => (
          <LiveTowerRow
            key={d.num}
            d={d}
            gridStyle={gridStyle}
            isSelected={selected === d.num}
            onSelect={onSelect}
            animate={!reduce}
          />
        ))}
      </div>
    </div>
  );
}

function LiveTowerRow({
  d,
  gridStyle,
  isSelected,
  onSelect,
  animate,
}: {
  d: LiveDriver;
  gridStyle: CSSProperties;
  isSelected: boolean;
  onSelect: (num: string) => void;
  animate: boolean;
}) {
  const team = teamColour(d.team_colour);
  const out = d.retired || d.stopped;
  const sweep = useFlash(d.last_fastest ? d.last_lap : null) && d.last_fastest;

  return (
    <motion.div
      layout={animate ? "position" : false}
      transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
      onClick={() => onSelect(d.num)}
      className={`tower-row cursor-pointer ${out ? "opacity-50" : ""} ${
        isSelected ? "bg-graphite-800" : ""
      } ${sweep ? "animate-best-sweep" : ""}`}
      style={{ ...gridStyle, ["--team" as string]: team } as CSSProperties}
    >
      <div className="flex justify-center">
        <span className="pos-box" style={{ ["--team" as string]: team } as CSSProperties}>
          {d.pos || DASH}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="num truncate font-semibold text-ink" title={`${d.name ?? ""} · ${d.team ?? ""}`}>
          {d.tla}
        </span>
        {d.in_pit && <span className="rounded-sm bg-signal-warn/15 px-1 text-2xs font-bold text-signal-warn">PIT</span>}
        {d.retired && <span className="rounded-sm bg-signal-alert/15 px-1 text-2xs font-bold text-signal-alert">OUT</span>}
        {d.stopped && !d.retired && <span className="rounded-sm bg-signal-alert/15 px-1 text-2xs font-bold text-signal-alert">STOP</span>}
        {d.knocked_out && <span className="rounded-sm bg-graphite-700 px-1 text-2xs font-bold text-ink-faint">KO</span>}
      </div>
      <div className="num tower-sep text-right font-medium text-ink">{d.pos === 1 ? "LEADER" : d.gap || DASH}</div>
      <div className={`num text-right text-2xs ${d.catching ? "text-signal-ok" : "text-ink-faint"}`}>
        {d.pos === 1 ? DASH : d.interval || DASH}
      </div>
      <LiveFlashCell
        value={d.last_lap}
        color={d.last_fastest ? "#c77dff" : "#4da6ff"}
        className={`num tower-sep text-right ${d.last_fastest ? "text-signal-purple" : d.last_pb ? "text-signal-ok" : "text-ink"}`}
      >
        {d.last_lap || DASH}
      </LiveFlashCell>
      <div className="num text-right text-ink-muted">{d.best_lap || DASH}</div>
      {[0, 1, 2].map((i) => {
        const s = d.sectors[i];
        return (
          <LiveFlashCell
            key={i}
            value={s?.value}
            color={s?.fastest ? "#c77dff" : s?.pb ? "#2ee6a8" : "#4da6ff"}
            className={`num text-right text-2xs ${i === 0 ? "tower-sep" : ""} ${
              s?.fastest ? "text-signal-purple" : s?.pb ? "text-signal-ok" : "text-ink-faint"
            }`}
          >
            {s?.value || DASH}
          </LiveFlashCell>
        );
      })}
      <div className="tower-sep">
        {d.compound ? (
          <div className="flex items-center gap-1.5" title={`${d.compound}${d.tyre_new ? " (new set)" : " (used set)"}, ${d.tyre_age ?? "?"} laps old`}>
            <span
              className="tyre-pill"
              style={{ borderColor: compoundColour(d.compound), color: compoundColour(d.compound) }}
            >
              {compoundLetter(d.compound)}
            </span>
            <span className="num text-2xs text-ink-faint">{d.tyre_age ?? DASH}L{d.tyre_new ? "*" : ""}</span>
          </div>
        ) : (
          <span className="text-2xs text-ink-faint">{DASH}</span>
        )}
      </div>
      <div className="num text-right text-2xs text-ink-faint">{d.pits}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Track map                                                           */
/* ------------------------------------------------------------------ */

function TrackMap({
  state,
  selected,
  onSelect,
}: {
  state: LiveState;
  selected: string | null;
  onSelect: (num: string) => void;
}) {
  const outline = state.track_outline ?? [];
  const cars = (state.drivers ?? []).filter(
    (d) => d.position?.x != null && d.position?.y != null && !d.retired,
  );
  const points: [number, number][] = [
    ...outline,
    ...cars.map((c) => [c.position!.x!, c.position!.y!] as [number, number]),
  ];
  if (points.length < 2) {
    return <Empty title="Track map appears with the first position data" detail="Car positions come from OpenF1's location feed (about 4 per second)." />;
  }
  // The position feed's y grows upward and SVG's grows downward, so flip once.
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => -p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX || 1;
  const depth = Math.max(...ys) - minY || 1;
  const unit = Math.max(width, depth) / 100;
  const pad = unit * 6;

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${depth + pad * 2}`}
      className="h-[300px] w-full"
      role="img"
      aria-label="Car positions on track"
    >
      {outline.length > 1 && (
        <polyline
          points={outline.map(([x, y]) => `${x},${-y}`).join(" ")}
          fill="none"
          stroke="#2a323b"
          strokeWidth={unit * 1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {[...cars].reverse().map((c) => {
        const x = c.position!.x!;
        const y = -c.position!.y!;
        const isSel = c.num === selected;
        return (
          <g key={c.num} onClick={() => onSelect(c.num)} className="cursor-pointer">
            <circle
              cx={x}
              cy={y}
              r={unit * (isSel ? 2.2 : 1.5)}
              fill={teamColour(c.team_colour)}
              stroke={isSel ? "#e9edf2" : "#07080a"}
              strokeWidth={unit * 0.4}
            />
            {(isSel || c.pos <= 3) && (
              <text x={x + unit * 2.6} y={y + unit * 1.2} fontSize={unit * 3.4} fill={isSel ? "#e9edf2" : "#8d97a3"} fontFamily="var(--font-mono)">
                {c.tla}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Telemetry                                                           */
/* ------------------------------------------------------------------ */

function TelemetryPanel({ driver }: { driver: LiveDriver | null }) {
  const num = driver?.num ?? null;
  const { data } = usePoll<LiveTelemetry | null>(
    () => (num ? liveApi.telemetry(num) : Promise.resolve(null)),
    1000,
    [num],
    num != null,
  );
  const t = driver?.telemetry;

  const option = useMemo<EChartsOption | null>(() => {
    const s = data?.samples;
    if (!s?.date?.length) return null;
    const times = s.date.map((d) => (d ? new Date(String(d)).getTime() : NaN));
    const end = Math.max(...times.filter(Number.isFinite));
    const x = times.map((v) => (v - end) / 1000);
    const series = (key: string) => x.map((xv, i) => [xv, s[key]?.[i] as number | null]);
    return {
      ...CHART_BASE,
      grid: { left: 40, right: 40, top: 22, bottom: 24 },
      legend: { top: 0, right: 0, textStyle: { color: "#8d97a3", fontSize: 9 }, itemWidth: 10, itemHeight: 6 },
      xAxis: axis("s", {
        min: Math.floor(Math.min(...x.filter(Number.isFinite))),
        max: 0,
        axisLabel: { color: "#5d6670", fontSize: 9, formatter: (v: number) => `${Math.round(v)}` },
      }),
      yAxis: [axis("km/h", { min: 0 }), axis("%", { min: 0, max: 100, splitLine: { show: false } })],
      series: [
        { name: "Speed", type: "line", showSymbol: false, data: series("speed"), lineStyle: { width: 1.5, color: "#4da6ff" }, itemStyle: { color: "#4da6ff" } },
        { name: "Throttle", type: "line", yAxisIndex: 1, showSymbol: false, data: series("throttle"), lineStyle: { width: 1, color: "#2ee6a8" }, itemStyle: { color: "#2ee6a8" } },
        { name: "Brake", type: "line", yAxisIndex: 1, showSymbol: false, step: "end", data: series("brake"), lineStyle: { width: 1, color: "#ff4d5e" }, itemStyle: { color: "#ff4d5e" }, areaStyle: { color: "rgba(255,77,94,0.12)" } },
      ],
    };
  }, [data]);

  return (
    <Panel
      title={driver ? `Telemetry · ${driver.tla}` : "Telemetry"}
      right={<ProvenanceBadge kind="measured" />}
    >
      {!driver || !t ? (
        <Empty title="No telemetry for this car yet" detail="Car telemetry (about 4 samples per second) comes from OpenF1's car_data feed." />
      ) : (
        <div className="p-3">
          <dl className="grid grid-cols-4 gap-2">
            <Readout label="Speed" value={t.speed} unit="km/h" />
            <Readout label="Gear" value={t.n_gear} unit="" />
            <Readout label="RPM" value={t.rpm} unit="" />
            <Readout label="Trap best" value={driver.best_speed_trap ? Number(driver.best_speed_trap) : null} unit="km/h" />
          </dl>
          <div className="mt-2 space-y-1">
            <Bar label="Throttle" value={t.throttle} colour="#2ee6a8" />
            <Bar label="Brake" value={t.brake} colour="#ff4d5e" />
          </div>
          {option && <Chart option={option} height={170} className="mt-2" />}
          <p className="mt-1 text-2xs text-ink-faint">
            Last ~60 s. Brake is on/off in this feed (0 or 100), not pressure.
          </p>
        </div>
      )}
    </Panel>
  );
}

function Readout({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-ink-faint">{label}</dt>
      <dd className="num text-lg text-ink">
        {value == null || !Number.isFinite(value) ? DASH : value}
        {value != null && unit && <span className="ml-0.5 text-2xs text-ink-faint">{unit}</span>}
      </dd>
    </div>
  );
}

function Bar({ label, value, colour }: { label: string; value: number | null | undefined; colour: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-2xs uppercase tracking-wider text-ink-faint">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-graphite-800">
        <div className="h-1.5 rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: colour }} />
      </div>
      <span className="num w-8 text-right text-2xs text-ink-muted">{value == null ? DASH : `${value}`}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Explanations                                                        */
/* ------------------------------------------------------------------ */

type ExplainTab = "explained" | "glossary" | "story" | "debrief";

function ExplainPanel({
  state,
  commentary,
  className,
}: {
  state: LiveState;
  commentary: LiveCommentary[];
  className?: string;
}) {
  const [tab, setTab] = useState<ExplainTab>("explained");
  const [glossary, setGlossary] = useState<{ term: string; explanation: string }[]>([]);
  const [filter, setFilter] = useState("");
  const [debrief, setDebrief] = useState<string | null>(null);

  useEffect(() => {
    liveApi.glossary().then((g) => setGlossary(g.terms)).catch(() => undefined);
  }, [state.glossary_count, state.session_key, state.mode]);

  useEffect(() => {
    if (state.debrief_ready) liveApi.debrief().then((d) => setDebrief(d.markdown)).catch(() => undefined);
    else setDebrief(null);
  }, [state.debrief_ready, state.session_key, state.mode]);

  const tabs: { key: ExplainTab; label: string }[] = [
    { key: "explained", label: `Explained (${commentary.length})` },
    { key: "glossary", label: `Glossary (${glossary.length})` },
    { key: "story", label: "Story" },
    ...(debrief ? [{ key: "debrief" as const, label: "Debrief" }] : []),
  ];
  const shown = [...commentary].reverse();
  const terms = glossary.filter(
    (g) => !filter || `${g.term} ${g.explanation}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <section className={`panel flex max-h-[860px] min-h-[420px] flex-col ${className ?? ""}`}>
      <header className="panel-header">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${
                tab === t.key ? "bg-graphite-700 text-ink" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-sm border border-signal-purple/30 bg-signal-purple/10 px-1.5 py-0.5 text-2xs font-semibold tracking-wider text-signal-purple"
          title="Written by Claude from the measured feed data on this page. Explanations, not measurements."
        >
          AI · CLAUDE
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "explained" && (
          <div className="space-y-3">
            {state.agent?.busy && (
              <div className="flex items-center gap-2 text-2xs text-signal-info">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-info" />
                Claude is writing the next update…
              </div>
            )}
            {!shown.length && (
              <Empty
                title={state.agent?.dry_run ? "Claude is off (dry run)" : "The first explanation is on its way"}
                detail="Updates arrive when something happens, at most every ~30 s, and every few minutes in quiet periods."
              />
            )}
            {shown.map((c, index) => (
              <article key={c.i} className={`rounded border border-graphite-700 p-2.5 ${index === 0 ? "animate-message-in bg-graphite-850" : ""}`}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink">{c.headline}</h3>
                  <span className="num shrink-0 text-2xs text-ink-faint">
                    {c.lap != null ? `L${c.lap}` : ""} {clockTime(c.clock)}
                  </span>
                </div>
                <Markdown text={c.commentary} />
                {c.terms.length > 0 && (
                  <dl className="mt-2 space-y-1 border-t border-graphite-800 pt-2">
                    {c.terms.map((t) => (
                      <div key={t.term} className="text-2xs leading-relaxed">
                        <dt className="inline font-semibold text-signal-purple">{t.term}: </dt>
                        <dd className="inline text-ink-muted">{t.explanation}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {c.watch_next && (
                  <p className="mt-2 text-2xs italic text-ink-faint">Watch next: {c.watch_next}</p>
                )}
                {c.events.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-2xs text-ink-faint">{c.events.length} raw events</summary>
                    <ul className="mt-1 space-y-0.5">
                      {c.events.map((e, j) => (
                        <li key={j} className="num text-2xs text-ink-faint">{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
        {tab === "glossary" && (
          <div>
            <input className="field mb-2" placeholder="Search terms…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {!terms.length && <Empty title="No terms yet" detail="Every term Claude explains during the session is collected here." />}
            <dl className="space-y-2">
              {terms.map((g) => (
                <div key={g.term} className="border-b border-graphite-800 pb-2">
                  <dt className="text-xs font-semibold text-ink">{g.term}</dt>
                  <dd className="text-2xs leading-relaxed text-ink-muted">{g.explanation}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {tab === "story" &&
          (state.story ? (
            <Markdown text={state.story} />
          ) : (
            <Empty title="No story yet" detail="Claude's running summary of the whole session appears after the first update." />
          ))}
        {tab === "debrief" && debrief && <Markdown text={debrief} />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Race control                                                        */
/* ------------------------------------------------------------------ */

function RaceControlPanel({ items, className }: { items: LiveRaceControl[]; className?: string }) {
  const shown = [...items].reverse();
  return (
    <Panel title="Race control" right={<ProvenanceBadge kind="measured" />} className={className} bodyClassName="max-h-[300px] overflow-y-auto">
      {!shown.length ? (
        <Empty title="No race control messages yet" />
      ) : (
        <ul className="divide-y divide-graphite-800">
          {shown.map((m, i) => (
            <li key={`${m.utc}-${i}`} className="flex items-start gap-2 px-3 py-1.5">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: flagColour(m.flag, m.category) }} />
              <span className="num w-10 shrink-0 text-2xs text-ink-faint">{m.lap != null ? `L${m.lap}` : DASH}</span>
              <span className="text-xs leading-snug text-ink">{m.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/* Driver chips: three-letter codes in event text become team-coloured chips. */
function DriverChip({ driver }: { driver: LiveDriver | undefined }) {
  if (!driver) return null;
  return (
    <span
      className="num mx-0.5 inline-flex items-center rounded-sm border-l-2 bg-graphite-800 px-1 text-2xs font-semibold text-ink"
      style={{ borderColor: teamColour(driver.team_colour) }}
      title={`${driver.name ?? ""} · ${driver.team ?? ""} · P${driver.pos}`}
    >
      {driver.tla}
    </span>
  );
}

function RichText({ text, drivers }: { text: string; drivers: Map<string, LiveDriver> }) {
  const parts = text.split(/\b([A-Z]{3})\b/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 && drivers.has(part) ? <DriverChip key={i} driver={drivers.get(part)} /> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

const CATEGORY_STYLE: Record<LiveEventCategory, string> = {
  overtake: "border-signal-ok/40 bg-signal-ok/10 text-signal-ok",
  positions: "border-graphite-600 bg-graphite-800 text-ink-muted",
  pit: "border-signal-warn/40 bg-signal-warn/10 text-signal-warn",
  race_control: "border-graphite-600 bg-graphite-800 text-ink-muted",
  flag: "border-signal-warn/40 bg-signal-warn/10 text-signal-warn",
  pace: "border-signal-purple/40 bg-signal-purple/10 text-signal-purple",
  fight: "border-signal-info/40 bg-signal-info/10 text-signal-info",
  incident: "border-signal-alert/50 bg-signal-alert/15 text-signal-alert",
  weather: "border-signal-info/40 bg-signal-info/10 text-signal-info",
  radio: "border-signal-info/40 bg-signal-info/10 text-signal-info",
  lap: "border-graphite-600 bg-graphite-800 text-ink-faint",
  session: "border-graphite-500 bg-graphite-700 text-ink",
  other: "border-graphite-600 bg-graphite-800 text-ink-muted",
};

const FLAG_STYLE: Record<string, string> = {
  YELLOW: "border-signal-warn/50 bg-signal-warn/15 text-signal-warn",
  "DOUBLE YELLOW": "border-signal-warn/60 bg-signal-warn/20 text-signal-warn",
  RED: "border-signal-alert/60 bg-signal-alert/20 text-signal-alert",
  BLUE: "border-signal-info/50 bg-signal-info/15 text-signal-info",
  GREEN: "border-signal-ok/50 bg-signal-ok/10 text-signal-ok",
  CLEAR: "border-signal-ok/30 bg-signal-ok/5 text-signal-ok/80",
  "SAFETY CAR": "border-signal-warn/60 bg-signal-warn/20 text-signal-warn",
  CHEQUERED: "border-ink/40 bg-ink/10 text-ink",
};

const LABEL_STYLE: Record<string, string> = {
  PENALTY: "border-signal-alert/60 bg-signal-alert/20 text-signal-alert",
  INVESTIGATING: "border-signal-warn/60 bg-signal-warn/15 text-signal-warn",
  WARNING: "border-signal-warn/50 bg-signal-warn/10 text-signal-warn",
  "NO ACTION": "border-graphite-500 bg-graphite-800 text-ink-muted",
  NOTED: "border-graphite-500 bg-graphite-800 text-ink-muted",
  "TRACK LIMITS": "border-graphite-500 bg-graphite-800 text-ink-muted",
};

const EVENT_FILTERS: { key: string; label: string; match: (e: LiveEvent) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "overtakes", label: "Overtakes", match: (e) => e.category === "overtake" || e.category === "positions" || e.category === "fight" },
  { key: "pits", label: "Pits & tyres", match: (e) => e.category === "pit" },
  { key: "flags", label: "Flags & stewards", match: (e) => e.category === "race_control" || e.category === "flag" || e.category === "session" },
  { key: "pace", label: "Pace", match: (e) => e.category === "pace" },
  { key: "radio", label: "Radio", match: (e) => e.category === "radio" },
  { key: "incidents", label: "Incidents", match: (e) => e.category === "incident" || e.category === "weather" },
];

function EventsPanel({ state, className }: { state: LiveState; className?: string }) {
  const [filter, setFilter] = useState("all");
  const byTla = useMemo(() => new Map((state.drivers ?? []).map((d) => [d.tla, d])), [state.drivers]);
  const byNum = useMemo(() => new Map((state.drivers ?? []).map((d) => [d.num, d])), [state.drivers]);
  const match = EVENT_FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
  const groups = useMemo(() => {
    const out: { lap: number | null | undefined; items: LiveEvent[] }[] = [];
    for (const e of [...(state.events ?? [])].reverse()) {
      if (e.category === "lap" || !match(e)) continue;
      // The Radio panel shows clips while they are transcribed; only the transcript is an event.
      if (e.category === "radio" && e.raw.includes("being transcribed")) continue;
      const last = out[out.length - 1];
      if (last && last.lap === e.lap) last.items.push(e);
      else out.push({ lap: e.lap, items: [e] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.events, filter]);

  return (
    <section className={`panel flex max-h-[520px] min-h-[300px] flex-col ${className ?? ""}`}>
      <header className="panel-header flex-wrap">
        <h2 className="panel-title">What happened</h2>
        <div className="flex flex-wrap items-center gap-1">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded px-1.5 py-0.5 text-2xs font-medium ${filter === f.key ? "bg-graphite-700 text-ink" : "text-ink-faint hover:text-ink-muted"}`}
            >
              {f.label}
            </button>
          ))}
          <ProvenanceBadge kind="calculated" />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!groups.length ? (
          <Empty title="Nothing yet" detail="Overtakes, pit stops, tyre changes, fastest laps, flags, stewards' decisions and radio appear here as they happen." />
        ) : (
          groups.map((g, gi) => (
            <div key={`${g.lap}-${gi}`}>
              <div className="sticky top-0 z-10 border-b border-graphite-800 bg-graphite-850 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {g.lap != null ? `Lap ${g.lap}` : "Before the start"}
              </div>
              <ul>
                {g.items.map((e, i) => {
                  const chip = LABEL_STYLE[e.label] || (e.flag && FLAG_STYLE[e.flag.toUpperCase()]) || CATEGORY_STYLE[e.category];
                  const tag = LABEL_STYLE[e.label] ? e.label : e.category === "race_control" && e.flag ? e.flag : e.label;
                  const quiet = e.category === "race_control" && e.flag === "CLEAR";
                  const radioLead = e.category === "radio"
                    ? e.drivers.map((n) => byNum.get(n)?.tla).filter(Boolean).join(" ") + " "
                    : "";
                  return (
                    <li key={i} className={`flex items-start gap-2 border-b border-graphite-800/60 px-3 py-1.5 ${quiet ? "opacity-60" : ""}`}>
                      <span className={`mt-px w-[96px] shrink-0 whitespace-nowrap rounded-sm border px-1 py-px text-center text-[10px] font-bold tracking-wider ${chip}`}>
                        {tag}
                      </span>
                      <span className={`min-w-0 flex-1 text-xs leading-snug text-ink ${e.category === "radio" ? "line-clamp-2" : ""}`} title={e.category === "radio" ? e.text : undefined}>
                        {radioLead && <RichText text={radioLead} drivers={byTla} />}
                        <RichText text={e.text} drivers={byTla} />
                      </span>
                      <span className="num shrink-0 pt-px text-2xs text-ink-faint">{clockTime(e.clock)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Team radio                                                          */
/* ------------------------------------------------------------------ */

const SPEAKER_STYLE: Record<string, { label: string; className: string }> = {
  engineer: { label: "ENGINEER", className: "text-signal-info" },
  driver: { label: "DRIVER", className: "text-signal-ok" },
  unclear: { label: "UNCLEAR", className: "text-ink-faint" },
};

const RADIO_STATUS: Record<string, string> = {
  queued: "Waiting to transcribe…",
  transcribing: "Transcribing…",
  labelling: "Working out who is speaking…",
  no_speech: "No speech detected in this clip.",
  failed: "Transcription failed.",
  unavailable: "Transcription is off (faster-whisper is not installed).",
  off: "Transcription is off.",
  not_queued: "Not transcribed (received before the agent joined).",
};

function RadioPanel({ state, className }: { state: LiveState; className?: string }) {
  const clips = [...(state.team_radio ?? [])].reverse();
  const byNum = useMemo(() => new Map((state.drivers ?? []).map((d) => [d.num, d])), [state.drivers]);
  return (
    <Panel
      title="Team radio"
      right={<ProvenanceBadge kind="estimated">TRANSCRIBED · ESTIMATED</ProvenanceBadge>}
      className={`max-h-[520px] ${className ?? ""}`}
      bodyClassName="overflow-y-auto"
    >
      <p className="border-b border-graphite-800 px-3 py-1.5 text-2xs leading-relaxed text-ink-faint">
        The feed only says which car a clip belongs to. Words are transcribed automatically (Whisper, on this
        machine) and each line is attributed to the engineer or the driver by Claude from what is said.
        Both can be wrong: listen to confirm.
      </p>
      {!clips.length ? (
        <Empty title="No radio yet" />
      ) : (
        <ul className="divide-y divide-graphite-800">
          {clips.map((c, i) => (
            <RadioClip key={`${c.url}-${i}`} clip={c} driver={byNum.get(c.driver)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RadioClip({ clip, driver }: { clip: LiveRadio; driver: LiveDriver | undefined }) {
  const pending = ["queued", "transcribing", "labelling"].includes(clip.status);
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        {driver ? <DriverChip driver={driver} /> : <span className="num text-xs font-semibold">{clip.tla ?? clip.driver}</span>}
        <span className="truncate text-2xs text-ink-faint">{driver?.name}</span>
        <span className="num ml-auto text-2xs text-ink-faint">
          {clip.lap != null ? `L${clip.lap} · ` : ""}{clockTime(clip.utc)}
        </span>
        {clip.confidence && (
          <span
            className={`rounded-sm border px-1 text-[10px] font-semibold uppercase ${
              clip.confidence === "high" ? "border-signal-ok/30 text-signal-ok" : clip.confidence === "medium" ? "border-signal-warn/30 text-signal-warn" : "border-signal-alert/30 text-signal-alert"
            }`}
            title="How sure the speaker labels are"
          >
            {clip.confidence}
          </span>
        )}
      </div>
      {clip.url && <audio controls preload="none" src={clip.url} className="mt-1.5 h-7 w-full" />}
      {clip.turns.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {clip.turns.map((t, j) => {
            const sp = SPEAKER_STYLE[t.speaker] ?? SPEAKER_STYLE.unclear;
            return (
              <li key={j} className="flex gap-2 text-xs leading-snug">
                <span className={`w-[62px] shrink-0 pt-px text-[10px] font-bold tracking-wider ${sp.className}`}>{sp.label}</span>
                <span className="text-ink">“{t.text}”</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`mt-1.5 text-2xs ${pending ? "text-signal-info" : "text-ink-faint"}`}>
          {pending && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-signal-info" />}
          {RADIO_STATUS[clip.status] ?? clip.status}
        </p>
      )}
      {clip.meaning && (
        <p className="mt-1.5 border-l-2 border-signal-purple/50 pl-2 text-2xs leading-relaxed text-ink-muted">
          <span className="font-semibold text-signal-purple">What it means: </span>
          {clip.meaning}
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Championship                                                        */
/* ------------------------------------------------------------------ */

function ChampionshipPanel({ state }: { state: LiveState }) {
  const champ = (state.championship ?? []).slice(0, 10);
  if (!champ.length) return null;
  return (
    <Panel title="Championship if it ended now" right={<ProvenanceBadge kind="estimated">PROJECTED</ProvenanceBadge>}>
      <table className="data-table">
        <tbody>
          {champ.map((c) => {
            const moved = (c.current_position ?? 0) - (c.predicted_position ?? 0);
            return (
              <tr key={c.num}>
                <td className="num w-8 text-ink-muted">{c.predicted_position}</td>
                <td className="num font-semibold text-ink">{c.tla}</td>
                <td className="num text-right text-ink">{c.predicted_points}</td>
                <td className={`num w-10 text-right text-2xs ${moved > 0 ? "text-signal-ok" : moved < 0 ? "text-signal-alert" : "text-ink-faint"}`}>
                  {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : DASH}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
