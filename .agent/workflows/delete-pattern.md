---
description: Standard delete pattern for UI elements - click trash, turns red/shakes, click again to delete
---

# Delete Confirmation Pattern

This project uses a consistent "click twice to delete" pattern for destructive actions.

## How It Works

1. User clicks the trash/delete button
2. Button turns red and shakes (animation)
3. User must click again to confirm deletion
4. If user clicks elsewhere or on another item, the confirmation resets

## Implementation

### 1. State Setup
Track which item is pending deletion:
```tsx
const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
```

### 2. Styled Button with Shake Animation
```tsx
import styled, { keyframes, css } from 'styled-components';

const shakeAnimation = keyframes`
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
    20%, 40%, 60%, 80% { transform: translateX(2px); }
`;

const DeleteButton = styled.button<{ shake?: boolean }>`
    color: ${props => props.shake ? '#f14c4c' : 'var(--vscode-icon-foreground)'};
    ${props => props.shake && css`
        animation: ${shakeAnimation} 0.5s ease-in-out infinite;
        color: #f14c4c;
    `}
`;
```

### 3. Click Handler Logic
```tsx
<DeleteButton
    shake={deleteConfirm === item.id}
    onClick={(e) => {
        e.stopPropagation();
        if (deleteConfirm === item.id) {
            // Second click - actually delete
            onDelete(item.id);
            setDeleteConfirm(null);
        } else {
            // First click - set confirmation state
            setDeleteConfirm(item.id);
        }
    }}
    title={deleteConfirm === item.id ? "Click again to delete" : "Delete"}
>
    <Trash2 size={14} />
</DeleteButton>
```

## Existing Implementations

Reference these files for examples:
- `webview/src/components/sidebar/PerformanceUi.tsx`
- `webview/src/components/TestNavigator.tsx`
- `webview/src/components/ProjectTestTree.tsx`
- `webview/src/components/sidebar/ServiceTree.tsx`
- `webview/src/components/sidebar/ProjectList.tsx`
