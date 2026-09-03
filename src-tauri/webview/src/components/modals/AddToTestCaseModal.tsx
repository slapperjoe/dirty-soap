import React, { useState } from 'react';
import styled from 'styled-components';
import { EmptyState } from '../common/EmptyState';
import { UnifiedProject } from '@shared/models';
import { FlaskConical, Play } from 'lucide-react';
import { Modal, Button } from './Modal';
import { SPACING_XS, SPACING_SM, SPACING_MD } from '../../styles/spacing';

const Body = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${SPACING_MD};
`;

const Instruction = styled.div`
    font-size: 0.9em;
    opacity: 0.8;
`;

const ProjectSection = styled.div`
    display: flex;
    flex-direction: column;
`;

const ProjectName = styled.div`
    padding: ${SPACING_XS};
    font-weight: bold;
`;

const Item = styled.div<{ $active?: boolean; $depth: number }>`
    padding: ${SPACING_XS};
    padding-left: ${props => props.$depth * 20 + 5}px;
    cursor: pointer;
    background: ${props => props.$active ? 'var(--apinox-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.$active ? 'var(--apinox-list-activeSelectionForeground)' : 'inherit'};
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
    
    &:hover {
        background: ${props => props.$active ? 'var(--apinox-list-activeSelectionBackground)' : 'var(--apinox-list-hoverBackground)'};
    }
`;


const SecondaryButton = styled(Button)`
    background: transparent;
    border: 1px solid var(--apinox-button-background);
`;

interface AddToTestCaseModalProps {
    projects: UnifiedProject[];
    onClose: () => void;
    onAdd: (target: { type: 'new' | 'existing', suiteId?: string, caseId?: string }) => void;
}

export const AddToTestCaseModal: React.FC<AddToTestCaseModalProps> = ({ projects, onClose, onAdd }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectionType, setSelectionType] = useState<'suite' | 'case' | null>(null);

    const handleSelect = (id: string, type: 'suite' | 'case') => {
        setSelectedId(id);
        setSelectionType(type);
    };

    const handleSubmit = () => {
        if (!selectedId || !selectionType) return;

        if (selectionType === 'suite') {
            onAdd({ type: 'new', suiteId: selectedId });
        } else {
            onAdd({ type: 'existing', caseId: selectedId });
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Add to Test Case"
            size="small"
            footer={<>
                <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                <Button disabled={!selectedId} onClick={handleSubmit}>
                    {selectionType === 'suite' ? 'Create New Case' : 'Add to Case'}
                </Button>
            </>}
        >
            <Body>
                <Instruction>
                    Select a Test Case to append to, or a Test Suite to create a new Case in.
                </Instruction>
                {projects.map(p => (
                    <ProjectSection key={p.name}>
                        <ProjectName>{p.name}</ProjectName>
                        {(p.testSuites || []).map(suite => (
                            <div key={suite.id}>
                                <Item
                                    $depth={1}
                                    $active={selectedId === suite.id}
                                    onClick={() => handleSelect(suite.id, 'suite')}
                                >
                                    <FlaskConical size={14} />
                                    {suite.name}
                                </Item>
                                {(suite.testCases || []).map(tc => (
                                    <Item
                                        key={tc.id}
                                        $depth={2}
                                        $active={selectedId === tc.id}
                                        onClick={() => handleSelect(tc.id, 'case')}
                                    >
                                        <Play size={10} />
                                        {tc.name}
                                    </Item>
                                ))}
                            </div>
                        ))}
                        {(!p.testSuites || p.testSuites.length === 0) && (
                            <EmptyState title="No Test Suites" />
                        )}
                    </ProjectSection>
                ))}
            </Body>
        </Modal>
    );
};
