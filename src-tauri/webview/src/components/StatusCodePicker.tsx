import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { X, ChevronDown } from 'lucide-react';

const COMMON_CODES = [
    { code: 200, label: '200 OK' },
    { code: 201, label: '201 Created' },
    { code: 202, label: '202 Accepted' },
    { code: 204, label: '204 No Content' },
    { code: 301, label: '301 Moved Permanently' },
    { code: 302, label: '302 Found' },
    { code: 304, label: '304 Not Modified' },
    { code: 400, label: '400 Bad Request' },
    { code: 401, label: '401 Unauthorized' },
    { code: 403, label: '403 Forbidden' },
    { code: 404, label: '404 Not Found' },
    { code: 405, label: '405 Method Not Allowed' },
    { code: 409, label: '409 Conflict' },
    { code: 422, label: '422 Unprocessable' },
    { code: 429, label: '429 Too Many Requests' },
    { code: 500, label: '500 Internal Error' },
    { code: 502, label: '502 Bad Gateway' },
    { code: 503, label: '503 Service Unavailable' },
    { code: 504, label: '504 Gateway Timeout' },
];

const Container = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
`;

const PillsContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-height: 26px;
    align-items: center;
`;

const Pill = styled.span<{ $isError: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    background: ${props => props.$isError
        ? 'var(--vscode-diffEditor-removedTextBackground)'
        : 'var(--vscode-diffEditor-insertedTextBackground)'};
    color: ${props => props.$isError
        ? 'var(--vscode-testing-iconFailed)'
        : 'var(--vscode-testing-iconPassed)'};
    border: 1px solid ${props => props.$isError
        ? 'var(--vscode-testing-iconFailed)'
        : 'var(--vscode-testing-iconPassed)'};
`;

const RemoveButton = styled.button`
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    color: inherit;
    opacity: 0.7;
    &:hover { opacity: 1; }
`;

const DropdownTrigger = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    cursor: pointer;
    &:hover { background: var(--vscode-button-secondaryHoverBackground); }
`;

const Dropdown = styled.div`
    position: fixed;
    z-index: 10000;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    min-width: 180px;
    box-shadow: 0 4px 12px var(--vscode-widget-shadow);
`;

const DropdownItem = styled.div<{ $isSelected: boolean }>`
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    background: ${props => props.$isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: var(--vscode-foreground);
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

interface StatusCodePickerProps {
    value: string; // comma-separated codes like "200,201,500"
    onChange: (value: string) => void;
}

export const StatusCodePicker: React.FC<StatusCodePickerProps> = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

    // Parse current value into array of numbers
    const selectedCodes = value
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);

    const isErrorCode = (code: number) => code >= 400;

    const addCode = (code: number) => {
        if (!selectedCodes.includes(code)) {
            const newCodes = [...selectedCodes, code].sort((a, b) => a - b);
            onChange(newCodes.join(','));
        }
        setIsOpen(false);
    };

    const removeCode = (code: number) => {
        const newCodes = selectedCodes.filter(c => c !== code);
        onChange(newCodes.length > 0 ? newCodes.join(',') : '');
    };

    // Update dropdown position when opening
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + 2,
                left: rect.left
            });
        }
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <Container ref={containerRef}>
            <PillsContainer>
                {selectedCodes.map(code => (
                    <Pill key={code} $isError={isErrorCode(code)}>
                        {code}
                        <RemoveButton onClick={() => removeCode(code)} title="Remove">
                            <X size={10} />
                        </RemoveButton>
                    </Pill>
                ))}
                <DropdownTrigger ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
                    + Add <ChevronDown size={12} />
                </DropdownTrigger>
            </PillsContainer>

            {isOpen && createPortal(
                <Dropdown style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                    {COMMON_CODES.map(({ code, label }) => (
                        <DropdownItem
                            key={code}
                            $isSelected={selectedCodes.includes(code)}
                            onClick={() => addCode(code)}
                        >
                            {label}
                            {selectedCodes.includes(code) && <span>✓</span>}
                        </DropdownItem>
                    ))}
                </Dropdown>,
                document.body
            )}
        </Container>
    );
};
