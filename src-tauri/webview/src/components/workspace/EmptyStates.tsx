import React from 'react';
import { Eye, Compass, Network, FolderOpen, Clock } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
export { EmptyState };

export const EmptyFileWatcher: React.FC = () => (
    <EmptyState
        icon={Eye}
        title="File Watcher"
        description="The File Watcher monitors your project files for changes. Events will appear in the sidebar."
    />
);

export const EmptyApiExplorer: React.FC = () => (
    <EmptyState
        icon={Compass}
        title="API Explorer"
        description="Load a WSDL or OpenAPI file to browse its interfaces, operations, and requests."
    />
);

export const EmptyServer: React.FC = () => (
    <EmptyState
        icon={Network}
        title="APInox Server"
        description="Configure a local proxy server to inspect traffic or mock responses."
    />
);

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
