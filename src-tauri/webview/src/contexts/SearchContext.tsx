/**
 * SearchContext.tsx
 * 
 * Manages workspace search state and operations.
 * Provides search functionality across Projects, Explorer, Tests, and other views.
 * 
 * Features:
 * - Debounced search input (300ms)
 * - Results grouped by view
 * - Keyboard navigation support
 * - Integration with navigation/selection contexts
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useProject } from './ProjectContext';
import { useSelection } from './SelectionContext';
import { useNavigation } from './NavigationContext';
import { SidebarView } from '@shared/models';
import {
    SearchResult,
    SearchOptions,
    searchWorkspace,
} from '../utils/workspaceSearch';
import { DEBOUNCE_MS, TREE_NAV_DELAY_MS } from '../constants';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface SearchContextValue {
    // State
    searchQuery: string;
    searchResults: SearchResult[];
    isSearching: boolean;
    selectedIndex: number;
    isSearchVisible: boolean;
    lastSelectedResult: SearchResult | null;

    // Actions
    setSearchQuery: (query: string) => void;
    performSearch: (query: string, options?: SearchOptions) => void;
    clearSearch: () => void;
    selectResult: (result: SearchResult) => void;
    setSelectedIndex: (index: number) => void;
    showSearch: () => void;
    hideSearch: () => void;
    toggleSearch: () => void;
    navigateToLastResult: () => void;

    // Computed
    groupedResults: Map<string, SearchResult[]>;
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface SearchProviderProps {
    children: React.ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({
    children
}) => {
    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------

    const [searchQuery, setSearchQueryState] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [lastSelectedResult, setLastSelectedResult] = useState<SearchResult | null>(null);

    // -------------------------------------------------------------------------
    // CONTEXT DEPENDENCIES
    // -------------------------------------------------------------------------

    const { 
        projects, 
        ensureProjectExpanded,
        ensureInterfaceExpanded,
        ensureOperationExpanded,
        setSelectedProjectName 
    } = useProject();
    
    const {
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedTestSuite,
        setSelectedTestCase,
    } = useSelection();
    
    const { setActiveView } = useNavigation();

    // -------------------------------------------------------------------------
    // REFS
    // -------------------------------------------------------------------------

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Stable ref to projects — lets navigateToResult read the latest projects
    // without being recreated on every projects change.
    const projectsRef = useRef(projects);
    useEffect(() => { projectsRef.current = projects; }, [projects]);

    // -------------------------------------------------------------------------
    // SEARCH LOGIC
    // -------------------------------------------------------------------------

    /**
     * Execute search with current query
     */
    const performSearch = useCallback((query: string, options?: SearchOptions) => {
        if (!query || query.trim().length === 0) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);

        try {
            const results = searchWorkspace(
                query.trim(),
                projects,
                {
                    maxResults: 50,
                    minScore: 0,
                    ...options,
                }
            );

            setSearchResults(results);
            setSelectedIndex(0); // Reset selection to first result
        } catch (error) {
            console.error('[SearchContext] Search failed:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [projects]);

    /**
     * Set search query with debouncing
     */
    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Debounce search
        if (query.trim().length === 0) {
            setSearchResults([]);
            setIsSearching(false);
        } else {
            setIsSearching(true);
            searchTimeoutRef.current = setTimeout(() => {
                performSearch(query);
            }, DEBOUNCE_MS);
        }
    }, [performSearch]);

    /**
     * Clear search state
     */
    const clearSearch = useCallback(() => {
        setSearchQueryState('');
        setSearchResults([]);
        setSelectedIndex(0);
        setIsSearching(false);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
    }, []);

    /**
     * Navigate to a search result
     * Expands tree nodes, sets selection, and opens the item in the editor
     */
    const navigateToResult = useCallback((result: SearchResult) => {
        const { data, type, view } = result;

        if (view === 'projects') {
            setActiveView(SidebarView.PROJECTS);
            
            const { projectName, interface: iface, operation, request } = data;

            setTimeout(() => {
                if (projectName) {
                    setSelectedProjectName(projectName);
                    ensureProjectExpanded(projectName);
                }

                setTimeout(() => {
                    switch (type) {
                        case 'interface':
                            if (iface && projectName) {
                                ensureInterfaceExpanded(projectName, iface.name);
                                setSelectedInterface(iface);
                                setSelectedOperation(null);
                                setSelectedRequest(null);
                            }
                            break;

                        case 'operation':
                            if (operation && iface && projectName) {
                                ensureInterfaceExpanded(projectName, iface.name);
                                setTimeout(() => {
                                    ensureOperationExpanded(projectName, iface.name, operation.name);
                                    setSelectedInterface(iface);
                                    setSelectedOperation(operation);
                                    setSelectedRequest(null);
                                }, TREE_NAV_DELAY_MS);
                            }
                            break;

                        case 'request':
                            if (request && operation && iface && projectName) {
                                ensureInterfaceExpanded(projectName, iface.name);
                                setTimeout(() => {
                                    ensureOperationExpanded(projectName, iface.name, operation.name);
                                    setTimeout(() => {
                                        setSelectedInterface(iface);
                                        setSelectedOperation(operation);
                                        setSelectedRequest(request);
                                    }, TREE_NAV_DELAY_MS);
                                }, TREE_NAV_DELAY_MS);
                            }
                            break;

                        case 'folder':
                            // TODO: Implement folder navigation
                            break;

                        default:
                            console.warn(`[SearchContext] Unknown result type: ${type}`);
                    }
                }, TREE_NAV_DELAY_MS);
            }, TREE_NAV_DELAY_MS);
        } else if (view === 'tests') {
            setActiveView(SidebarView.TESTS);
            const { projectName, testSuiteId, testCaseId } = data;

            setTimeout(() => {
                if (projectName && testSuiteId) {
                    const project = projectsRef.current.find(p => p.name === projectName);
                    if (project) {
                        const testSuite = project.testSuites?.find(s => s.id === testSuiteId);
                        if (testSuite) {
                            setSelectedTestSuite(testSuite);
                            if (testCaseId && type === 'test-case') {
                                const testCase = testSuite.testCases?.find(c => c.id === testCaseId);
                                if (testCase) {
                                    setSelectedTestCase(testCase);
                                }
                            } else {
                                setSelectedTestCase(null);
                            }
                        } else {
                            console.warn(`[SearchContext] Test suite not found: ${testSuiteId}`);
                        }
                    }
                }
            }, TREE_NAV_DELAY_MS);
        }
    }, [
        setActiveView,
        setSelectedProjectName,
        ensureProjectExpanded,
        ensureInterfaceExpanded,
        ensureOperationExpanded,
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedTestSuite,
        setSelectedTestCase,
    ]);

    /**
     * Show search interface
     */
    const showSearch = useCallback(() => {
        setIsSearchVisible(true);
    }, []);

    /**
     * Handle result selection
     */
    const selectResult = useCallback((result: SearchResult) => {
        // Save as last selected result
        setLastSelectedResult(result);
        
        // Navigate to the result
        navigateToResult(result);
        
        // Hide search UI
        setIsSearchVisible(false);
        clearSearch();
    }, [navigateToResult, clearSearch]);

    /**
     * Navigate to the last selected result
     */
    const navigateToLastResult = useCallback(() => {
        if (lastSelectedResult) {
            navigateToResult(lastSelectedResult);
        }
    }, [lastSelectedResult, navigateToResult]);

    /**
     * Hide search interface
     */
    const hideSearch = useCallback(() => {
        setIsSearchVisible(false);
        clearSearch();
    }, [clearSearch]);

    /**
     * Toggle search visibility
     */
    const toggleSearch = useCallback(() => {
        setIsSearchVisible(prev => !prev);
        if (isSearchVisible) {
            clearSearch();
        }
    }, [isSearchVisible, clearSearch]);

    // -------------------------------------------------------------------------
    // COMPUTED VALUES
    // -------------------------------------------------------------------------

    /**
     * Group results by view for organized display
     */
    const groupedResults = useMemo(() => {
        const groups = new Map<string, SearchResult[]>();

        for (const result of searchResults) {
            const viewKey = result.view;
            const existing = groups.get(viewKey) || [];
            existing.push(result);
            groups.set(viewKey, existing);
        }

        return groups;
    }, [searchResults]);

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const value: SearchContextValue = {
        // State
        searchQuery,
        searchResults,
        isSearching,
        selectedIndex,
        isSearchVisible,
        lastSelectedResult,

        // Actions
        setSearchQuery,
        performSearch,
        clearSearch,
        selectResult,
        setSelectedIndex,
        showSearch,
        hideSearch,
        toggleSearch,
        navigateToLastResult,

        // Computed
        groupedResults,
    };

    return (
        <SearchContext.Provider value={value}>
            {children}
        </SearchContext.Provider>
    );
};

// =============================================================================
// HOOK
// =============================================================================

/**
 * Access the SearchContext
 * @throws Error if used outside SearchProvider
 */
export const useSearch = (): SearchContextValue => {
    const context = useContext(SearchContext);
    if (!context) {
        throw new Error('useSearch must be used within SearchProvider');
    }
    return context;
};
