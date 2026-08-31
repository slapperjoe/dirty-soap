import React, { useState, useMemo } from 'react';
import { ChevronDown, Copy, Plus, FileCode } from 'lucide-react';
import { ApiOperation } from '@shared/models';
import { generateSampleWithMetadata } from '../../utils/soapUtils';
import { parseXmlToTree, serializeTreeToXml, XmlTreeNode } from '../../utils/xmlTreeParser';
import * as S from './SampleRequestPanel.styles';

interface SampleRequestPanelProps {
    operation: ApiOperation;
    /** Optional interface context (classic ApiInterface or unified UnifiedProject) used to resolve the *effective* Content-Type for display. */
    interfaceContext?: { contentType?: string; soapVersion?: string };
    onCreateRequest?: (sampleXml: string, metadata: {
        endpoint?: string;
        soapAction?: string;
        contentType?: string;
        targetNamespace?: string;
    }) => void;
}

export const SampleRequestPanel: React.FC<SampleRequestPanelProps> = ({
    operation,
    interfaceContext,
    onCreateRequest
}) => {
    const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

    // Generate sample data (Content-Type is the *effective* value:
    // interface override > sample/action > SOAP-version default)
    const sampleData = useMemo(() => {
        return generateSampleWithMetadata(operation, interfaceContext ?? null);
    }, [operation, interfaceContext?.contentType, interfaceContext?.soapVersion]);

    // Parse XML to tree
    const xmlTree = useMemo(() => {
        if (!sampleData.sampleXml) return null;
        return parseXmlToTree(sampleData.sampleXml);
    }, [sampleData.sampleXml]);

    // Handle copy to clipboard
    const handleCopy = async () => {
        if (!sampleData.sampleXml) return;
        
        try {
            await navigator.clipboard.writeText(sampleData.sampleXml);
            console.log('Sample XML copied to clipboard');
        } catch (err) {
            console.error('Failed to copy XML:', err);
        }
    };

    // Handle create request from sample
    const handleCreateRequest = () => {
        if (onCreateRequest && sampleData.sampleXml) {
            onCreateRequest(sampleData.sampleXml, {
                endpoint: sampleData.endpoint,
                soapAction: sampleData.soapAction,
                contentType: sampleData.contentType,
                targetNamespace: sampleData.targetNamespace
            });
        }
    };

    // Toggle node collapse
    const toggleNodeCollapse = (path: string) => {
        setCollapsedNodes(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    // Render a single XML tree node
    const renderTreeNode = (node: XmlTreeNode, path: string) => {
        if (node.type === 'comment') {
            return null; // Skip rendering comments as separate nodes
        }

        if (node.type === 'text') {
            return (
                <S.TextValue>{node.value || '?'}</S.TextValue>
            );
        }

        if (node.type === 'element' && node.name) {
            const isCollapsed = collapsedNodes.has(path);
            const hasChildren = node.children && node.children.some(c => c.type === 'element');
            
            // Get text content if it's a simple element
            const textChild = node.children?.find(c => c.type === 'text');
            const isSimpleElement = textChild && !hasChildren;

            return (
                <S.TreeNode key={path} depth={node.depth}>
                    <S.ElementNode>
                        {/* Collapse icon (only if has element children) */}
                        {hasChildren ? (
                            <S.CollapseIcon 
                                collapsed={isCollapsed}
                                onClick={() => toggleNodeCollapse(path)}
                            >
                                <ChevronDown size={14} />
                            </S.CollapseIcon>
                        ) : (
                            <span style={{ width: '16px', display: 'inline-block' }}></span>
                        )}

                        {/* Opening tag */}
                        <S.TagBracket>&lt;</S.TagBracket>
                        <S.TagName>{node.name}</S.TagName>
                        
                        {/* Attributes */}
                        {node.attributes && Object.entries(node.attributes).map(([key, val]) => (
                            <span key={key}>
                                <S.AttributeName>{key}</S.AttributeName>
                                =
                                <S.AttributeValue>"{val}"</S.AttributeValue>
                            </span>
                        ))}
                        
                        <S.TagBracket>&gt;</S.TagBracket>
                        
                        {/* Inline text for simple elements */}
                        {isSimpleElement && (
                            <>
                                <S.TextValue>{textChild.value || '?'}</S.TextValue>
                                <S.TagBracket>&lt;/</S.TagBracket>
                                <S.TagName>{node.name}</S.TagName>
                                <S.TagBracket>&gt;</S.TagBracket>
                            </>
                        )}
                        
                        {/* Optional/Required badge */}
                        {node.isOptional ? (
                            <S.OptionalBadge>Optional</S.OptionalBadge>
                        ) : node.depth > 1 && (
                            <S.RequiredBadge>Required</S.RequiredBadge>
                        )}
                    </S.ElementNode>
                    
                    {/* Children (if not collapsed and not simple) */}
                    {!isCollapsed && hasChildren && node.children && (
                        <>
                            {node.children
                                .filter(c => c.type === 'element')
                                .map((child, idx) => 
                                    renderTreeNode(child, `${path}/${child.name || idx}`)
                                )}
                            
                            {/* Closing tag */}
                            <S.ElementNode>
                                <span style={{ width: '16px', display: 'inline-block' }}></span>
                                <S.TagBracket>&lt;/</S.TagBracket>
                                <S.TagName>{node.name}</S.TagName>
                                <S.TagBracket>&gt;</S.TagBracket>
                            </S.ElementNode>
                        </>
                    )}
                    
                    {/* Closing tag for collapsed nodes with children */}
                    {isCollapsed && hasChildren && (
                        <S.ElementNode>
                            <span style={{ width: '16px', display: 'inline-block' }}></span>
                            <S.CommentText>... (collapsed)</S.CommentText>
                            <S.TagBracket>&lt;/</S.TagBracket>
                            <S.TagName>{node.name}</S.TagName>
                            <S.TagBracket>&gt;</S.TagBracket>
                        </S.ElementNode>
                    )}
                </S.TreeNode>
            );
        }

        return null;
    };

    if (!xmlTree) {
        return null;
    }

    return (
        <S.SamplePanelContainer>
            <S.SamplePanelHeader onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}>
                <S.SamplePanelTitle>
                    <FileCode size={16} />
                    Sample Request
                    <S.CollapseIcon collapsed={isPanelCollapsed}>
                        <ChevronDown size={16} />
                    </S.CollapseIcon>
                </S.SamplePanelTitle>
                
                <S.SamplePanelActions onClick={(e) => e.stopPropagation()}>
                    <S.ActionButton onClick={handleCopy}>
                        <Copy size={14} /> Copy XML
                    </S.ActionButton>
                    {onCreateRequest && (
                        <S.PrimaryActionButton onClick={handleCreateRequest}>
                            <Plus size={14} /> Create Request
                        </S.PrimaryActionButton>
                    )}
                </S.SamplePanelActions>
            </S.SamplePanelHeader>
            
            <S.SamplePanelBody collapsed={isPanelCollapsed}>
                {/* Metadata section */}
                {(sampleData.endpoint || sampleData.soapAction || sampleData.targetNamespace) && (
                    <S.MetadataSection>
                        {sampleData.endpoint && (
                            <>
                                <S.MetadataLabel>Endpoint:</S.MetadataLabel>
                                <S.MetadataValue>{sampleData.endpoint}</S.MetadataValue>
                            </>
                        )}
                        {sampleData.soapAction && (
                            <>
                                <S.MetadataLabel>SOAPAction:</S.MetadataLabel>
                                <S.MetadataValue>{sampleData.soapAction}</S.MetadataValue>
                            </>
                        )}
                        {sampleData.contentType && (
                            <>
                                <S.MetadataLabel>Content-Type:</S.MetadataLabel>
                                <S.MetadataValue>{sampleData.contentType}</S.MetadataValue>
                            </>
                        )}
                        {sampleData.targetNamespace && (
                            <>
                                <S.MetadataLabel>Namespace:</S.MetadataLabel>
                                <S.MetadataValue>{sampleData.targetNamespace}</S.MetadataValue>
                            </>
                        )}
                    </S.MetadataSection>
                )}
                
                {/* XML Tree */}
                <S.XmlTreeContainer>
                    {renderTreeNode(xmlTree, xmlTree.name || 'root')}
                </S.XmlTreeContainer>
            </S.SamplePanelBody>
        </S.SamplePanelContainer>
    );
};
