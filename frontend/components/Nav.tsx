"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

/**
 * Workspace navigation. The active tab is marked with a single shared-layout
 * underline that slides from the old tab to the new one — functional motion:
 * it shows which workspace you are in and which you just left. The query
 * string (season/session/drivers) is carried across tabs so a selection
 * survives navigation.
 */

const NAV = [
  { href: "/", label: "Timing" },
  { href: "/telemetry", label: "Telemetry Lab" },
  { href: "/corners", label: "Corners" },
  { href: "/strategy", label: "Strategy" },
  { href: "/engineer", label: "Race Engineer" },
  { href: "/agent", label: "Agent" },
];

export function Nav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <nav className="flex flex-wrap items-center gap-0.5" aria-label="Workspaces">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={`${item.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={`relative rounded px-2.5 py-1 text-2xs font-medium uppercase tracking-wider transition-colors ${
              active ? "text-ink" : "text-ink-muted hover:bg-graphite-800 hover:text-ink"
            }`}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-x-1.5 -bottom-[7px] h-0.5 rounded-full bg-signal-info"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
