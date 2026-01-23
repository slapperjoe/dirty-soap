import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Modal } from './Modal';

export interface PickRequestItem {
    id: string;
    label: string;
    description?: string;
    detail?: string;
    type: 'request' | 'operation';
    data: any;
}

interface PickRequestModalProps {
    isOpen: boolean;
    items: PickRequestItem[];
    onClose: () => void;
    onSelect: (item: PickRequestItem) => void;
    title?: string;
}

const SearchInput = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 8px;
    border-radius: 4px;
    margin: 10px 10px 0 10px;
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
`;

const List = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    overflow: auto;
    max-height: 50vh;
`;

const Item = styled.div`
    padding: 8px 10px;
    border-radius: 4px;
    background: var(--vscode-list-inactiveSelectionBackground);
    cursor: pointer;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const ItemLabel = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ItemMeta = styled.div`
    font-size: 11px;
    opacity: 0.7;
`;

export const PickRequestModal: React.FC<PickRequestModalProps> = ({ isOpen, items, onClose, onSelect, title }) => {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        if (!query) return items;
        const q = query.toLowerCase();
        return items.filter(item => (
            item.label.toLowerCase().includes(q)
            || (item.description || '').toLowerCase().includes(q)
            || (item.detail || '').toLowerCase().includes(q)
        ));
    }, [items, query]);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title || 'Add Request'} width={700}>
            <SearchInput
                type="text"
                placeholder="Search requests and operations..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <List>
                {filtered.map(item => (
                    <Item key={item.id} onClick={() => onSelect(item)}>
                        <ItemLabel>{item.label}</ItemLabel>
                        {(item.description || item.detail) && (
                            <ItemMeta>
                                {item.description || item.detail}
                            </ItemMeta>
                        )}
                    </Item>
                ))}
            </List>
        </Modal>
    );
};
