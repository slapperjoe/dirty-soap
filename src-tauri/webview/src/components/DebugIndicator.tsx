import React, { useEffect, useState } from 'react';
import { useUI } from '../contexts/UIContext';

export const DebugIndicator: React.FC = () => {
    const { config } = useUI();
    const enabled = config?.ui?.showDebugIndicator ?? false;
    const [label, setLabel] = useState('JS RUNNING');

    useEffect(() => {
        if (!enabled) return;
        setLabel('JS RUNNING');

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            setLabel(`CLICKED: ${target.tagName} #${target.id} .${target.className}`);
        };

        document.addEventListener('click', handleClick);
        return () => {
            document.removeEventListener('click', handleClick);
        };
    }, [enabled]);

    if (!enabled) return null;

    return (
        <div
            id="debug-indicator"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                backgroundColor: 'red',
                color: 'white',
                zIndex: 999999,
                padding: '10px',
                pointerEvents: 'none'
            }}
        >
            {label}
        </div>
    );
};
