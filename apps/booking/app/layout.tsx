import type { ReactNode } from "react";

export const metadata = {
  title: "Reservia",
  description: "Reserva tu mesa en segundos.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CL">
      <body style={{ margin: 0, background: "#141210", color: "#f3eee4", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
