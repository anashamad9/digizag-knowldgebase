import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";
export const metadata: Metadata = {
  title: "Brain",
  description: "Internal memory workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ToastProvider>
          <div className="relative isolate flex min-h-svh flex-col">
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
