import React from 'react';
import styled from 'styled-components';
import { Button } from '../modals/Modal';

const Container = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    padding: var(--space-xl);
    text-align: center;
    height: 100%;
    min-height: 200px;
`;

const IconWrapper = styled.div`
    margin-bottom: var(--space-lg);
    opacity: 0.5;
    color: var(--vscode-foreground);
    
    svg {
        width: 48px;
        height: 48px;
    }
`;

const Title = styled.h2`
    margin: 0 0 var(--space-sm) 0;
    color: var(--vscode-foreground);
    font-weight: 600;
    font-size: 1.1em;
`;

const Description = styled.p`
    margin: 0;
    max-width: 400px;
    line-height: 1.4;
    opacity: 0.9;
`;

const ActionContainer = styled.div`
    margin-top: var(--space-lg);
`;

interface EmptyStateProps {
    icon?: React.ElementType;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, children }) => {
    return (
        <Container>
            {Icon && (
                <IconWrapper>
                    <Icon />
                </IconWrapper>
            )}
            <Title>{title}</Title>
            {description && <Description>{description}</Description>}
            {action && (
                <ActionContainer>
                    <Button onClick={action.onClick}>{action.label}</Button>
                </ActionContainer>
            )}
            {children}
        </Container>
    );
};
