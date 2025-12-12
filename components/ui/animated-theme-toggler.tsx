"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { flushSync } from "react-dom"

import { cn } from "@/lib/utils"

interface AnimatedThemeTogglerProps
  extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  ...props
}: AnimatedThemeTogglerProps) => {
  const [isDark, setIsDark] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"))
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])

  const toggleTheme = useCallback(async () => {
    if (!buttonRef.current) return

    const apply = () => {
      flushSync(() => {
        const nextIsDark = !isDark
        setIsDark(nextIsDark)
        document.documentElement.classList.toggle("dark")
        localStorage.setItem("theme", nextIsDark ? "dark" : "light")
      })
    }

    // View Transitions API (Chrome/Edge). Fall back gracefully elsewhere.
    // Important: bind to `document` to avoid "Illegal invocation".
    type DocumentWithViewTransition = Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> }
    }

    const startViewTransition: undefined | ((cb: () => void) => { ready: Promise<void> }) =
      typeof document !== "undefined"
        ? (document as DocumentWithViewTransition).startViewTransition?.bind(document)
        : undefined

    if (!startViewTransition) {
      apply()
      return
    }

    try {
      await startViewTransition(apply).ready
    } catch {
      // If the API exists but fails (e.g. sandbox), still toggle theme.
      apply()
      return
    }

    const { top, left, width, height } =
      buttonRef.current.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    const maxRadius = Math.hypot(
      Math.max(left, window.innerWidth - left),
      Math.max(top, window.innerHeight - top)
    )

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${maxRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    )
  }, [isDark, duration])

  const ariaLabel = isDark
    ? "Switch to light theme (currently dark)"
    : "Switch to dark theme (currently light)"

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      aria-label={ariaLabel}
      aria-pressed={isDark}
      className={cn(className)}
      {...props}
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  )
}
