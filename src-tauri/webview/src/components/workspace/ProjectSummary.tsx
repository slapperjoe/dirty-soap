import React from 'react';
import { ContextHelpButton } from '../ContextHelpButton';
import {
    ProjectContainer, ProjectHeader, ProjectName, ProjectDescription,
    StatsGrid, StatCard, StatLabel, StatValue,
    InterfacesHeading, InterfacesList, InterfaceItem, InterfaceInfo,
    InterfaceName, InterfaceOps, InterfaceDef, ChevronIcon
} from '../../styles/WorkspaceLayout.styles';

export const ProjectSummary: React.FC<{ project: import('@shared/models').ApinoxProject; onSelectInterface?: (i: import('@shared/models').ApiInterface) => void }> = ({ project, onSelectInterface }) => {
    // Calculate statistics
    const totalOperations = project.interfaces.reduce((sum, iface) => sum + iface.operations.length, 0);
    const totalRequests = project.interfaces.reduce((sum, iface) =>
        sum + iface.operations.reduce((opSum, op) => opSum + op.requests.length, 0), 0
    );

    return (
        <ProjectContainer>
            {/* Header */}
            <ProjectHeader>
                <div>
                    <ProjectName>Project: {project.name}</ProjectName>
                    {project.description && <ProjectDescription>{project.description}</ProjectDescription>}
                </div>
                <ContextHelpButton sectionId="workspace" />
            </ProjectHeader>

            {/* Statistics Grid */}
            <StatsGrid>
                <StatCard>
                    <StatLabel>Interfaces</StatLabel>
                    <StatValue>{project.interfaces.length}</StatValue>
                </StatCard>
                <StatCard>
                    <StatLabel>Test Suites</StatLabel>
                    <StatValue>{project.testSuites?.length || 0}</StatValue>
                </StatCard>
                <StatCard>
                    <StatLabel>Operations</StatLabel>
                    <StatValue>{totalOperations}</StatValue>
                </StatCard>
                <StatCard>
                    <StatLabel>Requests</StatLabel>
                    <StatValue>{totalRequests}</StatValue>
                </StatCard>
            </StatsGrid>

            {/* Interfaces List */}
            <InterfacesHeading>Interfaces</InterfacesHeading>
            <InterfacesList>
                {project.interfaces.map(iface => (
                    <InterfaceItem
                        key={iface.name}
                        onClick={() => onSelectInterface && onSelectInterface(iface)}
                    >
                        <InterfaceInfo>
                            <InterfaceName>{iface.name}</InterfaceName>
                            <InterfaceOps>{iface.operations.length} operations</InterfaceOps>
                            {iface.definition && (
                                <InterfaceDef>
                                    {iface.definition}
                                </InterfaceDef>
                            )}
                        </InterfaceInfo>
                        <ChevronIcon size={16} />
                    </InterfaceItem>
                ))}
            </InterfacesList>
        </ProjectContainer>
    );
};
