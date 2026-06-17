'use client';

import { useMemo } from 'react';
import { Toast, ToastType, useToastStore } from '@/stores/toasts';

const TOAST_CONFIG: Record<ToastType, { icon: string; bg: string; text: string; border: string }> = {
  success: { icon: '✓', bg: '#10b981', text: '#ffffff', border: '#10b981' },
  error: { icon: '✕', bg: '#ef4444', text: '#ffffff', border: '#ef4444' },
  info: { icon: 'ℹ', bg: '#3b82f6', text: '#ffffff', border: '#3b82f6' },
  warning: { icon: '⚠', bg: '#f59e0b', text: '#2c3e50', border: '#f59e0b' },
};

const containerStyle = {
  position: 'fixed',
  right: '24px',
  bottom: '24px',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '380px',
  width: 'min(380px, calc(100vw - 32px))',
  padding: '14px',
  borderRadius: '18px',
  background: 'rgba(17, 19, 24, 0.94)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(232, 234, 240, 0.12)',
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
  animation: 'toast-container-in 0.24s ease-out',
} as const;

export default function ToastContainer() {
  const { toasts, remove, removeAll } = useToastStore();

  const toastItems = useMemo(() => {
    if (toasts.length === 0) return null;

    return toasts.map((toast: Toast) => {
      const config = TOAST_CONFIG[toast.type];

      return (
        <div
          key={toast.id}
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            padding: '12px 12px 12px 14px',
            borderRadius: '12px',
            background: config.bg,
            color: config.text,
            borderLeft: `4px solid ${config.border}`,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22)',
            animation: 'toast-in 0.2s ease-out',
          }}
          role="alert"
        >
          <div style={{
            width: '28px',
            height: '28px',
            flex: '0 0 28px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.16)',
            fontWeight: 700,
            fontSize: '14px',
          }}>
            {config.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 700,
              lineHeight: 1.35,
              color: config.text,
            }}>
              <span>{toast.title}</span>
            </div>
            {toast.message && (
              <div style={{
                marginTop: '4px',
                fontSize: '12px',
                lineHeight: 1.45,
                color: toast.type === 'warning' ? '#2c3e50' : 'rgba(255,255,255,0.82)',
                wordBreak: 'break-word',
              }}>
                {toast.message}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(toast.id)}
            aria-label={`Dismiss ${toast.title}`}
            style={{
              width: '24px',
              height: '24px',
              flex: '0 0 24px',
              border: 'none',
              background: 'transparent',
              color: config.text,
              cursor: 'pointer',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              lineHeight: 1,
              opacity: 0.78,
            }}
          >
            ×
          </button>
        </div>
      );
    });
  }, [toasts, remove]);

  if (toasts.length === 0) return null;

  return (
    <>
      <div style={containerStyle} aria-live="polite">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '2px',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#e8eaf0',
          }}>
            Notifications
          </div>
          <div style={{
            fontSize: '12px',
            color: '#8892a4',
            background: 'rgba(232,234,240,0.08)',
            borderRadius: '999px',
            padding: '4px 8px',
          }}>
            {toasts.length}
          </div>
        </div>
        {toastItems}
        {toasts.length > 1 && (
          <button
            type="button"
            onClick={removeAll}
            style={{
              marginTop: '2px',
              width: '100%',
              border: '1px solid rgba(232,234,240,0.14)',
              background: 'rgba(232,234,240,0.08)',
              color: '#e8eaf0',
              borderRadius: '10px',
              padding: '9px 10px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Clear all
          </button>
        )}
      </div>
      <style>{`
        @keyframes toast-container-in {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (max-width: 640px) {
          .toast-container { right: 12px; bottom: 12px; width: calc(100vw - 24px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .toast-container, .toast-container * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}