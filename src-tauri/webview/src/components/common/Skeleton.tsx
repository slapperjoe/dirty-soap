import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
`;

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    marginTop?: string | number;
    marginBottom?: string | number;
    className?: string;
}

export const Skeleton = styled.div<SkeletonProps>`
    width: ${props => typeof props.width === 'number' ? `${props.width}px` : (props.width || '100%')};
    height: ${props => typeof props.height === 'number' ? `${props.height}px` : (props.height || '20px')};
    border-radius: ${props => typeof props.borderRadius === 'number' ? `${props.borderRadius}px` : (props.borderRadius || '4px')};
    margin-top: ${props => typeof props.marginTop === 'number' ? `${props.marginTop}px` : (props.marginTop || '0')};
    margin-bottom: ${props => typeof props.marginBottom === 'number' ? `${props.marginBottom}px` : (props.marginBottom || '0')};
    
    background: linear-gradient(
        90deg,
        var(--vscode-editor-inactiveSelectionBackground) 25%,
        var(--vscode-list-hoverBackground) 50%,
        var(--vscode-editor-inactiveSelectionBackground) 75%
    );
    background-size: 200% 100%;
    animation: ${shimmer} 1.5s infinite linear;
    opacity: 0.6;
`;
