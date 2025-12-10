"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-500" />,
        info: <InfoIcon className="size-4 text-blue-500" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
        error: <OctagonXIcon className="size-4 text-red-500" />,
        loading: <Loader2Icon className="size-4 animate-spin text-blue-400" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/50 group-[.toaster]:shadow-2xl group-[.toaster]:shadow-black/20 group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          closeButton:
            "group-[.toast]:bg-transparent group-[.toast]:border-border/50 group-[.toast]:text-muted-foreground hover:group-[.toast]:bg-muted/50 group-[.toast]:transition-colors",
          success:
            "group-[.toaster]:border-emerald-500/30 group-[.toaster]:bg-gradient-to-r group-[.toaster]:from-emerald-500/10 group-[.toaster]:to-card/95",
          error:
            "group-[.toaster]:border-red-500/30 group-[.toaster]:bg-gradient-to-r group-[.toaster]:from-red-500/10 group-[.toaster]:to-card/95",
          warning:
            "group-[.toaster]:border-amber-500/30 group-[.toaster]:bg-gradient-to-r group-[.toaster]:from-amber-500/10 group-[.toaster]:to-card/95",
          info:
            "group-[.toaster]:border-blue-500/30 group-[.toaster]:bg-gradient-to-r group-[.toaster]:from-blue-500/10 group-[.toaster]:to-card/95",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
