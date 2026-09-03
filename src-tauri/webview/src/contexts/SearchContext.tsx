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
import { useUnifiedProjects } from './UnifiedProjectContext';
import { SidebarView } from '@shared/models';
import {
    SearchResult,
    SearchOptions,
    searchProjects,
    searchTests,
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

    // Phase B (t_86c34d38): the PROJECTS view is gone — "projects" search
    // results now navigate the UNIFIED explorer (migrated projects). The
    // unified list + node selection live in UnifiedProjectContext.
    const {
        projects: unifiedProjects,
        setSelectedNode: setUnifiedNode,
    } = useUnifiedProjects();
    const unifiedProjectsRef = useRef(unifiedProjects);
    useEffect(() => { unifiedProjectsRef.current = unifiedProjects; }, [unifiedProjects]);
    
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
            // Phase B (t_86c34d38): two sources —
            //  • "projects" (operations/folders): the legacy nested model the
            //    searchProjects util walks (migrated projects keep their
            //    interfaces/ tree, so this still covers them).
            //  • "tests" (suites/cases): the UNIFIED store — test suites were
            //    relocated to UnifiedProject.testSuites in Phase B, so the
            //    legacy copy (loaded once at startup) goes stale after the
            //    first TESTS edit and must not be the search source.
            const maxResults = 50;
            const minScore = 0;
            const projectResults = searchProjects(query.trim(), projects, { maxResults, minScore, ...options });
            const testResults = searchTests(query.trim(), unifiedProjects, { maxResults, minScore, ...options });
            const results = [...projectResults, ...testResults]
                .sort((a, b) => b.score - a.score)
                .slice(0, maxResults);

            setSearchResults(results);
            setSelectedIndex(0); // Reset selection to first result
        } catch (error) {
            console.error('[SearchContext] Search failed:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [projects, unifiedProjects]);

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
            // Phase B (t_86c34d38): the PROJECTS view is deleted. These
            // results now navigate the UNIFIED explorer (migrated projects —
            // the non-destructive migration preserves operation/request ids,
            // so the unified node ids below still match the legacy result ids).
            // [EXPLICIT DECISION — legacyLinksUnifiedExplorer.test.tsx is
            // updated deliberately to pin this redirect.]
            setActiveView(SidebarView.UNIFIED_EXPLORER);

            const { projectName, operation, request } = data;
            if (!projectName) return;

            setTimeout(() => {
                const project = unifiedProjectsRef.current.find(p => p.name === projectName);
                if (!project) {
                    console.warn(`[SearchContext] Unified project not found for search result: ${projectName}`);
                    return;
                }

                // Operation node (request results carry their parent operation
                // in `data.operation`, so both resolve through it).
                let op: import('@shared/models').ApiOperation | null = null;
                if ((type === 'operation' || type === 'request') && operation) {
                    op = (project.operations || []).find(o => o.id === operation.id || o.name === operation.name) || null;
                }

                if (type === 'request' && request && op) {
                    const reqId = request.id || request.name;
                    setUnifiedNode({ type: 'request', id: reqId });
                } else if (type === 'operation' && op) {
                    setUnifiedNode({ type: 'operation', id: op.id || op.name });
                } else {
                    // interface / folder / project / unknown: land on the project node
                    setUnifiedNode({ type: 'project', id: project.id || project.name });
                }
            }, TREE_NAV_DELAY_MS);
        } else if (view === 'tests') {
            setActiveView(SidebarView.TESTS);
            const { projectName, testSuiteId, testCaseId } = data;

            setTimeout(() => {
                if (projectName && testSuiteId) {
                    // Phase B (t_86c34d38): suites live on the unified store.
                    const project = unifiedProjectsRef.current.find(p => p.name === projectName);
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
        setUnifiedNode,
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
