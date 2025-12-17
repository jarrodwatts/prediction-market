"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, CheckCircle, Circle } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { useCountdown } from "@/lib/hooks/use-countdown";
import type { MarketData } from "@/lib/types";

interface MarketTimelineProps {
  market: MarketData;
  defaultExpanded?: boolean;
  /**
   * When true, renders without its own card container.
   * Useful for composing into a combined right-rail panel.
   */
  embedded?: boolean;
}

interface TimelineEvent {
  title: string;
  date: string | null | undefined;
  description?: string;
  isCompleted: boolean;
}

function getTimelineEvents(market: MarketData): TimelineEvent[] {
  const now = Date.now();
  const closesAtMs = market.closesAt ? Number(market.closesAt) * 1000 : 0;
  
  // Market is closed if state >= 1 OR if current time is past closesAt
  const closed = market.state >= 1 || (closesAtMs > 0 && now >= closesAtMs);
  const resolved = market.state === 2;
  
  // A market is voided when resolvedOutcome is >= outcomeCount (invalid outcome index)
  const resolvedOutcomeIdx = Number(market.resolvedOutcome);
  const isVoided = resolved && (resolvedOutcomeIdx < 0 || resolvedOutcomeIdx >= market.outcomeCount);

  const events: TimelineEvent[] = [
    {
      title: "Market published",
      date: market.createdAt ? new Date(Number(market.createdAt) * 1000).toISOString() : null,
      isCompleted: true,
    },
    {
      title: "Market closes",
      date: market.closesAt ? new Date(Number(market.closesAt) * 1000).toISOString() : null,
      isCompleted: closed,
    },
  ];

  if (resolved) {
    if (isVoided) {
      events.push({
        title: "Canceled",
        date: null,
        description: "Prediction was canceled. Funds can be reclaimed.",
        isCompleted: true,
      });
    } else {
      // Get outcome name if available
      const outcomeName = market.outcomes?.[resolvedOutcomeIdx];
      events.push({
        title: "Resolution",
        date: null,
        description: outcomeName ? `Resolved: ${outcomeName}` : `Resolved (Outcome ${resolvedOutcomeIdx + 1})`,
        isCompleted: true,
      });
    }
  } else {
    events.push({
      title: "Resolution",
      date: null,
      description: "The outcome will be validated by the team within 24 hours of its occurrence.",
      isCompleted: false,
    });
  }

  return events;
}

interface TimelineEventItemProps {
  event: TimelineEvent;
}

function TimelineEventItem({ event }: TimelineEventItemProps) {
  return (
    <div className="flex gap-3 items-start relative">
      {event.isCompleted ? (
        <CheckCircle className="h-6 w-6 text-emerald-500 bg-card shrink-0" />
      ) : (
        <Circle className="h-6 w-6 text-muted-foreground bg-card shrink-0" />
      )}
      <div>
        <p className="font-medium text-sm">{event.title}</p>
        <p className="text-xs text-muted-foreground">
          {event.description ? (
            <span className={event.isCompleted ? "font-medium text-foreground" : undefined}>
              {event.description}
            </span>
          ) : event.date ? (
            formatDate(event.date)
          ) : (
            "—"
          )}
        </p>
      </div>
    </div>
  );
}

export function MarketTimeline({
  market,
  defaultExpanded = true,
  embedded = false,
}: MarketTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Use countdown hook to trigger re-render when market closes
  const closesAtSeconds = market.closesAt ? Number(market.closesAt) : null;
  const remainingSeconds = useCountdown(closesAtSeconds);
  
  // Memoize events - re-compute when market closes (remainingSeconds becomes 0)
  const hasClosed = remainingSeconds <= 0;
  const events = useMemo(() => getTimelineEvents(market), [market, hasClosed]);

  return (
    <div className={embedded ? "" : "rounded-xl border border-border bg-card"}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
        type="button"
      >
        <span className="font-semibold">Timeline</span>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="relative space-y-4">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            {events.map((event, index) => (
              <TimelineEventItem key={index} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

