import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);

  async function login(entity, password) {
    const data = await api.login(entity, password);
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser({ name: data.entity.name, displayName: data.entity.displayName });
    return data;
  }

  function logout() {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then((data) => {
        setUser({ name: data.name, displayName: data.displayName });
      })
      .catch(() => {
        logout();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
