/**
 * TauriNotificationProvider
 * 
 * Listens for notification events from the sidecar and displays
 * toast notifications in the UI. Used in Tauri mode only.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { isTauri } from '../utils/bridge';

export enum NotificationType {
    Error = 'error',
    Info = 'info',
    Warning = 'warning',
    Success = 'success'
}

interface Notification {
    id: string;
    type: NotificationType;
    message: string;
    duration: number;
}

interface TauriNotificationProviderProps {
    children: React.ReactNode;
}

export const TauriNotificationProvider: React.FC<TauriNotificationProviderProps> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = useCallback((type: NotificationType, message: string, duration = 5000) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setNotifications(prev => [...prev, { id, type, message, duration }]);

        // Auto-remove after duration
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, duration);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    useEffect(() => {
        if (!isTauri()) return;

        // Dynamically import Tauri event listener
        let unlisten: (() => void) | null = null;

        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<{ type: NotificationType; message: string }>('notification', (event) => {
                addNotification(event.payload.type, event.payload.message);
            }).then(fn => {
                unlisten = fn;
            });
        }).catch(console.error);

        return () => {
            if (unlisten) unlisten();
        };
    }, [addNotification]);

    // Don't render toast container in VS Code mode
    if (!isTauri()) {
        return <>{children}</>;
    }

    return (
        <>
            {children}
            <div className="tauri-toast-container">
                {notifications.map(notification => (
                    <div
                        key={notification.id}
                        className={`tauri-toast tauri-toast-${notification.type}`}
                        onClick={() => removeNotification(notification.id)}
                    >
                        <span className="tauri-toast-icon">
                            {notification.type === 'error' && '❌'}
                            {notification.type === 'warning' && '⚠️'}
                            {notification.type === 'info' && 'ℹ️'}
                            {notification.type === 'success' && '✅'}
                        </span>
                        <span className="tauri-toast-message">{notification.message}</span>
                    </div>
                ))}
            </div>
        </>
    );
};

// CSS styles (add to your global CSS or styled-components)
export const tauriToastStyles = `
.tauri-toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
}

.tauri-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    animation: slideIn 0.3s ease-out;
    font-size: 14px;
}

.tauri-toast-error {
    background: #fce8e8;
    border: 1px solid #f5c6c6;
    color: #c62828;
}

.tauri-toast-warning {
    background: #fff8e1;
    border: 1px solid #ffe082;
    color: #f57c00;
}

.tauri-toast-info {
    background: #e3f2fd;
    border: 1px solid #90caf9;
    color: #1565c0;
}

.tauri-toast-success {
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
    color: #2e7d32;
}

.tauri-toast-icon {
    font-size: 16px;
}

.tauri-toast-message {
    flex: 1;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
`;
