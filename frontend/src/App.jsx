import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Vendors from './pages/Vendors';
import PurchaseOrders from './pages/PurchaseOrders';
import Analytics from './pages/Analytics';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} 
          />
          <Route 
            path="/inventory" 
            element={<ProtectedRoute><Layout><Inventory /></Layout></ProtectedRoute>} 
          />
          <Route 
            path="/vendors" 
            element={<ProtectedRoute><Layout><Vendors /></Layout></ProtectedRoute>} 
          />
          <Route 
            path="/purchase-orders" 
            element={<ProtectedRoute><Layout><PurchaseOrders /></Layout></ProtectedRoute>} 
          />
          <Route 
            path="/analytics" 
            element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} 
          />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
