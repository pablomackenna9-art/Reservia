import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { RestaurantProvider } from "./features/restaurants/RestaurantProvider";
import { OnboardingPage } from "./features/restaurants/OnboardingPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { NotificacionesPage } from "./features/notifications/NotificacionesPage";
import { PlanoDeMesasPage } from "./features/plano/PlanoDeMesasPage";
import { ReservasPage } from "./features/reservations/ReservasPage";
import { ClientesPage } from "./features/customers/ClientesPage";
import { ConfiguracionPage } from "./features/config/ConfiguracionPage";
import { ListaDeEsperaPage } from "./features/waitlist/ListaDeEsperaPage";
import { ReportesPage } from "./features/reports/ReportesPage";
import { IntegracionesPage } from "./features/integrations/IntegracionesPage";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireRestaurant } from "./routes/RequireRestaurant";

const COMING_SOON_ROUTES = [
  { path: "/marketing", title: "Marketing", description: "Campañas y recuperación de clientes. Todavía no construido." },
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
            <Route
              path="/notificaciones"
              element={
                <Protected>
                  <NotificacionesPage />
                </Protected>
              }
            />
            <Route
              path="/reservas"
              element={
                <Protected>
                  <ReservasPage />
                </Protected>
              }
            />
            <Route
              path="/lista-de-espera"
              element={
                <Protected>
                  <ListaDeEsperaPage />
                </Protected>
              }
            />
            <Route
              path="/clientes"
              element={
                <Protected>
                  <ClientesPage />
                </Protected>
              }
            />
            <Route
              path="/configuracion"
              element={
                <Protected>
                  <ConfiguracionPage />
                </Protected>
              }
            />
            <Route
              path="/reportes"
              element={
                <Protected>
                  <ReportesPage />
                </Protected>
              }
            />
            <Route
              path="/integraciones"
              element={
                <Protected>
                  <IntegracionesPage />
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
