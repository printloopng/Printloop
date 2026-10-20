"use client";

import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "!bg-paper !text-ink !border-2 !border-ink !rounded-md !shadow-brutal-sm !font-sans",
          title: "!font-bold",
          description: "!text-ink/70",
          error: "!border-persimmon",
          success: "!border-sage",
        },
      }}
    />
  );
}
