import { createContext, useContext, useEffect, useState } from 'react';

import api from '../api/axios';


const AuthContext = createContext(null);


function getStoredToken() {
  return localStorage.getItem('token') || '';
}


function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.detail ||
    error?.message ||
    fallback
  );
}


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const storedToken = getStoredToken();
      if (!storedToken) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await api.get('/auth/me');
        if (!active) {
          return;
        }
        setToken(storedToken);
        setUser(response.data);
      } catch {
        localStorage.removeItem('token');
        if (active) {
          setToken('');
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const nextToken = response.data.access_token;
      const nextUser = response.data.user;
      localStorage.setItem('token', nextToken);
      setToken(nextToken);
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      throw new Error(getErrorMessage(error, 'Login failed'));
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAuthenticated: Boolean(token && user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
