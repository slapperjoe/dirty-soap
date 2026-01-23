import React, { useState } from 'react';
import styled from 'styled-components';
import { SchemaNode } from '@shared/models';
import { ChevronRight, ChevronDown, Box, FileType } from 'lucide-react';

const TreeItem = styled.div`
  margin-left: 20px;
`;

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px 0;
  &:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
`;

const Label = styled.span`
  margin-left: 5px;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
`;

const TypeLabel = styled.span`
  margin-left: 8px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
  opacity: 0.8;
`;

const ExpandIconSlot = styled.div`
    width: 16px;
    display: flex;
    align-items: center;
`;

const NodeName = styled.span<{ $isComplex?: boolean }>`
    font-weight: ${props => props.$isComplex ? 'bold' : 'normal'};
`;

const OptionalMark = styled.span`
    color: var(--vscode-descriptionForeground);
    margin-left: 4px;
`;

const ViewerContainer = styled.div`
    padding: 10px;
    overflow: auto;
    height: 100%;
    user-select: text;
`;

const NodeIcon = ({ kind }: { kind: string }) => {
    return kind === 'complex' ? <Box size={14} color="var(--vscode-symbolIcon-classForeground)" /> : <FileType size={14} color="var(--vscode-symbolIcon-variableForeground)" />;
};

const SchemaNodeItem: React.FC<{ node: SchemaNode }> = ({ node }) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div>
            <ItemHeader onClick={() => setExpanded(!expanded)}>
                <ExpandIconSlot>
                    {hasChildren && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                </ExpandIconSlot>
                <NodeIcon kind={node.kind} />
                <Label>
                    <NodeName $isComplex={node.kind === 'complex'}>{node.name}</NodeName>
                    {node.isOptional && <OptionalMark>?</OptionalMark>}
                </Label>
                <TypeLabel>{node.type}</TypeLabel>
            </ItemHeader>
            {hasChildren && expanded && (
                <TreeItem>
                    {node.children!.map((child, idx) => (
                        <SchemaNodeItem key={idx} node={child} />
                    ))}
                </TreeItem>
            )}
        </div>
    );
};

export const SchemaViewer: React.FC<{ schema: SchemaNode }> = ({ schema }) => {
    return (
        <ViewerContainer>
            <SchemaNodeItem node={schema} />
        </ViewerContainer>
    );
};
