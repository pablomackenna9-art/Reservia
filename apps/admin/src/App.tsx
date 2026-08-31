import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { RestaurantProvider } from "./features/restaurants/RestaurantProvider";
import { OnboardingPage } from "./features/restaurants/OnboardingPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PlanoDeMesasPage } from "./features/plano/PlanoDeMesasPage";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireRestaurant } from "./routes/RequireRestaurant";

const COMING_SOON_ROUTES = [
  { path: "/reservas", title: "Reservas", description: "Vista dedicada de reservas — filtros, edición y cambio de estado en detalle. Fase 3 del roadmap." },
  { path: "/lista-de-espera", title: "Lista de espera", description: "Registro de clientes sin reserva y sugerencia de mesa al liberarse un cupo. Fase 5 del roadmap." },
  { path: "/clientes", title: "Clientes", description: "Ficha automática por cliente: historial, preferencias, segmentos. Fase 5 del roadmap." },
  { path: "/marketing", title: "Marketing", description: "Campañas y recuperación de clientes. Todavía no construido." },
  { path: "/reportes", title: "Reportes", description: "Ocupación, canales, ticket promedio y revenue management. Fase 8 del roadmap." },
  { path: "/integraciones", title: "Integraciones", description: "WhatsApp, Google, pagos y POS — capa de integraciones desacoplada. Fase 7 del roadmap." },
  { path: "/configuracion", title: "Configuración", description: "Zonas, mesas, horarios y reglas de reserva del restaurante. Fase 2-3 del roadmap." },
];

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <RequireRestaurant>
        <AppLayout>{children}</AppLayout>
      </RequireRestaurant>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <AuthProvider>
      <RestaurantProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/plano-de-mesas"
              element={
                <Protected>
                  <PlanoDeMesasPage />
                </Protected>
              }
            />
            {COMING_SOON_ROUTES.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <Protected>
                    <ComingSoonPage title={route.title} description={route.description} />
                  </Protected>
                }
              />
            ))}
          </Routes>
        </BrowserRouter>
      </RestaurantProvider>
    </AuthProvider>
  );
}
