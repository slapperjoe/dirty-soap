import React from 'react';
import { FolderOpen, Clock } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const EmptyHistory: React.FC = () => (
    <EmptyState
        icon={Clock}
        title="Request History"
        description="Execute a request to see it appear in your history."
    />
);

export const EmptyProject: React.FC = () => (
    <EmptyState
        icon={FolderOpen}
        title="No Project Selected"
        description="Select a project, interface, or operation to view details."
    />
);
