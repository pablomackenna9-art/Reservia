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
import { MarketingPage } from "./features/marketing/MarketingPage";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireRestaurant } from "./routes/RequireRestaurant";

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
            <Route
              path="/marketing"
              element={
                <Protected>
                  <MarketingPage />
                </Protected>
              }
            />
          </Routes>
        </BrowserRouter>
      </RestaurantProvider>
    </AuthProvider>
  );
}
