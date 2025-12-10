"use client";

/**
 * Empty State Component
 *
 * A flexible empty state component for displaying when no data is available.
 * Supports custom icons, titles, descriptions, and action buttons.
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface EmptyStateProps {
  /** Custom icon to display (defaults to a generic face icon) */
  icon?: ReactNode;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Optional action button or link */
  action?: ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show a border (default: true) */
  bordered?: boolean;
}

// =============================================================================
// Default Icon
// =============================================================================

function DefaultIcon() {
  return (
    <svg
      className="h-8 w-8 text-muted-foreground"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

// =============================================================================
// Component
// =============================================================================

export function EmptyState({
  icon,
  title = "No data found",
  description = "Try adjusting your filters or check back later.",
  action,
  className,
  bordered = true,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 sm:py-16 text-center",
        bordered && "border rounded-xl border-dashed",
        className
      )}
    >
      <div className="rounded-full bg-muted p-4">
        {icon || <DefaultIcon />}
      </div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

