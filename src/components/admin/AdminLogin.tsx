import React, { useState } from 'react';
import { loginAdmin } from '../../services/supabase';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  onBackToStore: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBackToStore }) => {
  const [email, setEmail] = useState('anmolkala.in@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your admin email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your admin password.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginAdmin(email, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        setError(result.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err: any) {
      setError(err?.message || 'A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0e1624 0%, #172235 50%, #1f2c42 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
          padding: '36px 32px',
          color: '#1e293b',
          border: '1px solid rgba(216, 180, 90, 0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src="/logo.png"
            alt="AnmolKala"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '2px solid #d8b45a',
              margin: '0 auto 12px',
              display: 'block',
              objectFit: 'cover',
              background: '#f8fafc',
            }}
          />
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#0f172a',
              margin: '0 0 6px',
              letterSpacing: '-0.3px',
            }}
          >
            Anmol Kala Admin Portal
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#64748b',
              margin: 0,
            }}
          >
            Authorized access only. Enter your administrative credentials.
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '12px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            role="alert"
          >
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="admin-email"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Admin Email / Username
            </label>
            <input
              id="admin-email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. anmolkala.in@gmail.com"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 13px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#d8b45a')}
              onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label
                htmlFor="admin-password"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#334155',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '12px',
                  color: '#947021',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '11px 13px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#d8b45a')}
                onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '6px',
              border: 'none',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #182235 0%, #0e1624 100%)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(24, 34, 53, 0.25)',
              transition: 'transform 0.15s, opacity 0.2s',
            }}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Admin Portal</span>
                <span style={{ fontSize: '16px' }}>➔</span>
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: '26px',
            paddingTop: '20px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <button
            type="button"
            onClick={onBackToStore}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
            }}
          >
            <span>← Back to Storefront</span>
          </button>
          <span style={{ color: '#94a3b8' }}>Anmol Kala v2.0</span>
        </div>
      </div>
    </div>
  );
};
