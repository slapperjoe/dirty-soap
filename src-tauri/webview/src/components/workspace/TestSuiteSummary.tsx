import React from 'react';
import { ContextHelpButton } from '../ContextHelpButton';
import {
    ProjectContainer, StatsGridSpaced, StatCard, StatLabel, StatValue,
    SectionHeading, OperationsList, OperationItem, OperationRow,
    OperationMeta, ChevronIconFaint
} from '../../styles/WorkspaceLayout.styles';

export const TestSuiteSummary: React.FC<{ suite: import('@shared/models').TestSuite; onSelectTestCase?: (c: import('@shared/models').TestCase) => void }> = ({ suite, onSelectTestCase }) => {
    // Calculate total steps
    const totalSteps = suite.testCases.reduce((sum, tc) => sum + tc.steps.length, 0);

    return (
        <ProjectContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Test Suite: {suite.name}</h1>
                <ContextHelpButton sectionId="test-suite" />
            </div>

            {/* Statistics Grid */}
            <StatsGridSpaced>
                <StatCard>
                    <StatLabel>Test Cases</StatLabel>
                    <StatValue>{suite.testCases.length}</StatValue>
                </StatCard>
                <StatCard>
                    <StatLabel>Total Steps</StatLabel>
                    <StatValue>{totalSteps}</StatValue>
                </StatCard>
            </StatsGridSpaced>

            <SectionHeading>Test Cases</SectionHeading>
            <OperationsList>
                {suite.testCases.map(tc => (
                    <OperationItem
                        key={tc.id}
                        onClick={() => onSelectTestCase && onSelectTestCase(tc)}
                    >
                        <OperationRow>
                            <div>
                                <span>{tc.name}</span>
                                <OperationMeta>({tc.steps.length} step{tc.steps.length !== 1 ? 's' : ''})</OperationMeta>
                            </div>
                            <ChevronIconFaint size={14} />
                        </OperationRow>
                    </OperationItem>
                ))}
            </OperationsList>
        </ProjectContainer>
    );
};
