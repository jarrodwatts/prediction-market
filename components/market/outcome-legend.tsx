"use client";

/**
 * Outcome Legend Component
 *
 * Displays a horizontal legend of market outcomes with color indicators.
 */

import { getOutcomeColor } from "@/lib/outcome-colors";

interface OutcomeLegendProps {
  outcomes: string[];
}

export function OutcomeLegend({ outcomes }: OutcomeLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {outcomes.map((title, index) => {
        const color = getOutcomeColor(title, index);

        return (
          <div key={index} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>{title}</span>
          </div>
        );
      })}
    </div>
  );
}

