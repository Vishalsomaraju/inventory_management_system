import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Pages
import AlertsPage from './pages/AlertsPage';
import Dashboard from './pages/Dashboard';
import InventoryPage from './pages/InventoryPage';
import Login from './pages/Login';
import PnLDashboard from './pages/PnLDashboard';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import SalesAnalysis from './pages/SalesAnalysis';
import VendorsPage from './pages/VendorsPage';
import VendorScorecard from './pages/VendorScorecard';
import AutoReorderPage from './pages/AutoReorderPage';
import StockHealth from './pages/StockHealth';
import ForecastPage from './pages/ForecastPage';

// Widgets
import AIAssistantWidget from './components/AIAssistant';

// The Auth Guard wrapper built for the layout
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function ProtectedLayout() {
  return (
    <PrivateRoute>
      <Layout>
        <Outlet />
      </Layout>
    </PrivateRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Unauthenticated route */}
            <Route path="/login" element={<Login />} />
            
            {/* Root redirects to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Authenticated routes wrapped in shell Layout */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/vendors" element={<VendorsPage />} />
              <Route path="/vendors/scorecards" element={<VendorScorecard />} />
              <Route path="/stock-health" element={<StockHealth />} />
              <Route path="/reorder" element={<AutoReorderPage />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/pnl" element={<PnLDashboard />} />
              <Route path="/sales" element={<SalesAnalysis />} />
            </Route>
            
            {/* Catch all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>

          {/* AI Assistant - Globally mounted but auto-hides if not authenticated */}
          <AIAssistantWidget />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
