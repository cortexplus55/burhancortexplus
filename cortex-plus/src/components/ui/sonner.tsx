"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--c-surface-2)",
          "--normal-text": "var(--c-text)",
          "--normal-border": "var(--c-border-strong)",
          "--border-radius": "var(--r-md)",
        } as React.CSSProperties
      }
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !bg-[var(--c-surface-2)] !text-[var(--c-text)] !border ![border-color:var(--c-border-strong)] !text-14",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
