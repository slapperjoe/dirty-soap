import React from 'react';
import styled from 'styled-components';
import { bridge } from '../utils/bridge';
import type { UnifiedProject, TestStep } from '@shared/models';
import { SecondaryButton } from './common/Button';

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const ModalContainer = styled.div`
    background: var(--apinox-editor-background);
    border: 1px solid var(--apinox-widget-border);
    border-radius: 6px;
    padding: 20px;
    min-width: 400px;
    max-width: 600px;
    max-height: 70vh;
    overflow: auto;
`;

const Title = styled.h3`
    margin: 0 0 15px 0;
`;

const Description = styled.p`
    margin-bottom: 15px;
    opacity: 0.8;
    font-size: 0.9em;
`;

const List = styled.div`
    max-height: 300px;
    overflow: auto;
    margin-bottom: 15px;
`;

const Item = styled.div`
    padding: 10px;
    margin-bottom: 5px;
    border-radius: 4px;
    background: var(--apinox-list-hoverBackground);
    cursor: pointer;
    border: 1px solid var(--apinox-widget-border);
`;

const ItemTitle = styled.div`
    font-weight: bold;
`;

const ItemMeta = styled.div`
    font-size: 0.85em;
    opacity: 0.7;
`;

const ItemCount = styled.div`
    font-size: 0.8em;
    opacity: 0.5;
`;

const Empty = styled.div`
    padding: 20px;
    text-align: center;
    opacity: 0.6;
`;

interface ImportTestCaseModalProps {
    open: boolean;
    suiteId: string | null;
    projects: UnifiedProject[];
    onClose: () => void;
}

export const ImportTestCaseModal: React.FC<ImportTestCaseModalProps> = ({
    open,
    suiteId,
    projects,
    onClose,
}) => {
    if (!open || !suiteId) return null;

    const testCaseItems = projects.flatMap(p =>
        (p.testSuites || []).flatMap(suite =>
            (suite.testCases || []).map(tc => ({
                projectName: p.name,
                suiteName: suite.name,
                testCase: tc,
                stepCount: (tc.steps || []).filter((s: TestStep) => s.type === 'request').length
            }))
        )
    );

    const handleSelect = (item: typeof testCaseItems[0]) => {
        const requestSteps = (item.testCase.steps || []).filter((s: TestStep) => s.type === 'request');
        for (const step of requestSteps) {
            const req = step.config.request;
            if (!req) continue;
            bridge.sendMessage({
                command: 'addPerformanceRequest',
                suiteId,
                name: step.name || 'Imported Step',
                endpoint: req.endpoint || '',
                method: req.method || 'POST',
                soapAction: req.method === 'POST' ? req.headers?.['SOAPAction'] : undefined,
                requestBody: req.request || '',
                headers: req.headers || {},
                extractors: req.extractors || [],
                requestType: req.requestType,
                bodyType: req.bodyType,
                restConfig: (req as any).restConfig,
                graphqlConfig: req.graphqlConfig,
            });
        }
        onClose();
    };

    return (
        <Overlay>
            <ModalContainer>
                <Title>Import Test Case to Performance Suite</Title>
                <Description>
                    Select a test case to import. All request steps from the test case will be added to this performance suite.
                </Description>
                <List>
                    {testCaseItems.map((item, idx) => (
                        <Item key={idx} onClick={() => handleSelect(item)}>
                            <ItemTitle>{item.testCase.name}</ItemTitle>
                            <ItemMeta>{item.projectName} → {item.suiteName}</ItemMeta>
                            <ItemCount>
                                {item.stepCount} request step{item.stepCount !== 1 ? 's' : ''}
                            </ItemCount>
                        </Item>
                    ))}
                    {testCaseItems.length === 0 && (
                        <Empty>No test cases available. Create a test suite first.</Empty>
                    )}
                </List>
                <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            </ModalContainer>
        </Overlay>
    );
};
