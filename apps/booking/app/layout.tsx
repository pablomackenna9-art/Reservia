import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Reservia",
  description: "Reserva tu mesa en segundos.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
