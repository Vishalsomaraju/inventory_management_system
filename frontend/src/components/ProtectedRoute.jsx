import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';


export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner label="Checking session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
