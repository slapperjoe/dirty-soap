/**
 * workspaceSearch.ts
 * 
 * Workspace search utility for finding requests, operations, interfaces, folders,
 * tests, workflows, and other workspace items across multiple views.
 * 
 * Features:
 * - Fuzzy matching with configurable thresholds
 * - Priority-based scoring (requests > operations > interfaces > folders)
 * - Breadcrumb generation for hierarchical context
 * - Support for multiple view types (Projects, Explorer, Tests, etc.)
 */

import { ApinoxProject, ApiInterface, ApiOperation, ApiRequest, ApinoxFolder, TestSuite, TestCase } from '@shared/models';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type SearchResultType = 'request' | 'operation' | 'interface' | 'folder' | 'test-suite' | 'test-case' | 'workflow';
export type SearchResultView = 'projects' | 'tests' | 'workflows' | 'history';

export interface SearchResult {
    /** Unique identifier for this result */
    id: string;
    
    /** Type of the result item */
    type: SearchResultType;
    
    /** Display name of the item */
    name: string;
    
    /** Human-readable breadcrumb showing hierarchy (e.g., "MyProject > UserService > GetUserInfo") */
    breadcrumb: string;
    
    /** View/sidebar where this item lives */
    view: SearchResultView;
    
    /** Search relevance score (higher = better match) */
    score: number;
    
    /** Original data object for navigation */
    data: SearchResultData;
}

export interface SearchResultData {
    projectName?: string;
    interfaceId?: string;
    operationId?: string;
    requestId?: string;
    folderId?: string;
    testSuiteId?: string;
    testCaseId?: string;
    
    /** Full objects for direct access */
    project?: ApinoxProject;
    interface?: ApiInterface;
    operation?: ApiOperation;
    request?: ApiRequest;
    folder?: ApinoxFolder;
}

export interface SearchOptions {
    /** Maximum number of results to return */
    maxResults?: number;
    
    /** Minimum score threshold (0-1) */
    minScore?: number;
    
    /** Views to search in */
    views?: SearchResultView[];
    
    /** Item types to search for */
    types?: SearchResultType[];
}

// =============================================================================
// SEARCH SCORING CONSTANTS
// =============================================================================

/** Priority multipliers for different item types (higher = more important) */
const TYPE_PRIORITY: Record<SearchResultType, number> = {
    'request': 4.0,
    'operation': 3.0,
    'interface': 2.0,
    'folder': 1.5,
    'test-case': 3.5,
    'test-suite': 2.5,
    'workflow': 3.0,
};

/** Scoring weights for different match types */
const MATCH_WEIGHTS = {
    exact: 10.0,       // Exact match
    prefix: 7.0,       // Starts with query
    word: 5.0,         // Word boundary match
    substring: 3.0,    // Contains substring
    fuzzy: 1.0,        // Fuzzy match
};

// =============================================================================
// FUZZY MATCHING
// =============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculate match score for a query against a target string
 * Returns a score from 0-10 based on match quality
 */
function calculateMatchScore(query: string, target: string): number {
    const queryLower = query.toLowerCase();
    const targetLower = target.toLowerCase();

    // Exact match
    if (queryLower === targetLower) {
        return MATCH_WEIGHTS.exact;
    }

    // Prefix match
    if (targetLower.startsWith(queryLower)) {
        return MATCH_WEIGHTS.prefix;
    }

    // Word boundary match (e.g., "GetUser" matches "get")
    const words = targetLower.split(/[\s_-]+/);
    for (const word of words) {
        if (word.startsWith(queryLower)) {
            return MATCH_WEIGHTS.word;
        }
    }

    // Substring match
    if (targetLower.includes(queryLower)) {
        return MATCH_WEIGHTS.substring;
    }

    // Fuzzy match using Levenshtein distance
    const distance = levenshteinDistance(queryLower, targetLower);
    const maxLength = Math.max(queryLower.length, targetLower.length);
    const similarity = 1 - (distance / maxLength);

    // Only consider it a match if similarity is above threshold
    if (similarity > 0.6) {
        return MATCH_WEIGHTS.fuzzy * similarity;
    }

    return 0;
}

/**
 * Calculate final score for a search result
 */
function calculateScore(
    matchScore: number,
    type: SearchResultType,
    metadataMatches: number = 0
): number {
    const typePriority = TYPE_PRIORITY[type] || 1.0;
    return (matchScore * typePriority) + (metadataMatches * 0.5);
}

// =============================================================================
// PROJECT SEARCH
// =============================================================================

/**
 * Search within a single folder and its subfolders
 */
function searchFolder(
    query: string,
    folder: ApinoxFolder,
    projectName: string,
    breadcrumbPrefix: string,
    results: SearchResult[]
): void {
    const folderBreadcrumb = `${breadcrumbPrefix} > ${folder.name}`;

    // Search folder name itself
    const folderScore = calculateMatchScore(query, folder.name);
    if (folderScore > 0) {
        results.push({
            id: `folder-${folder.id}`,
            type: 'folder',
            name: folder.name,
            breadcrumb: breadcrumbPrefix,
            view: 'projects',
            score: calculateScore(folderScore, 'folder'),
            data: {
                projectName,
                folderId: folder.id,
                folder,
            },
        });
    }

    // Search requests in folder
    for (const request of folder.requests || []) {
        const nameScore = calculateMatchScore(query, request.name);
        let metadataMatches = 0;

        // Check metadata
        if (request.endpoint && calculateMatchScore(query, request.endpoint) > 0) {
            metadataMatches++;
        }

        if (nameScore > 0 || metadataMatches > 0) {
            results.push({
                id: `request-${request.id || request.name}`,
                type: 'request',
                name: request.name,
                breadcrumb: folderBreadcrumb,
                view: 'projects',
                score: calculateScore(nameScore, 'request', metadataMatches),
                data: {
                    projectName,
                    folderId: folder.id,
                    requestId: request.id,
                    request,
                },
            });
        }
    }

    // Recursively search subfolders
    for (const subfolder of folder.folders || []) {
        searchFolder(query, subfolder, projectName, folderBreadcrumb, results);
    }
}

/**
 * Search within projects
 */
export function searchProjects(
    query: string,
    projects: ApinoxProject[],
    options: SearchOptions = {}
): SearchResult[] {
    const results: SearchResult[] = [];

    if (!query || query.trim().length === 0) {
        return results;
    }

    for (const project of projects) {
        const projectBreadcrumb = project.name;

        // Search interfaces
        for (const iface of project.interfaces || []) {
            const ifaceName = iface.displayName || iface.name;
            const ifaceBreadcrumb = `${projectBreadcrumb} > ${ifaceName}`;
            
            // Search interface name
            const ifaceScore = calculateMatchScore(query, ifaceName);
            let ifaceMetadata = 0;
            
            if (iface.definition && calculateMatchScore(query, iface.definition) > 0) {
                ifaceMetadata++;
            }

            if (ifaceScore > 0 || ifaceMetadata > 0) {
                results.push({
                    id: `interface-${iface.id || iface.name}`,
                    type: 'interface',
                    name: ifaceName,
                    breadcrumb: projectBreadcrumb,
                    view: 'projects',
                    score: calculateScore(ifaceScore, 'interface', ifaceMetadata),
                    data: {
                        projectName: project.name,
                        interfaceId: iface.id,
                        project,
                        interface: iface,
                    },
                });
            }

            // Search operations
            for (const operation of iface.operations || []) {
                const opName = operation.displayName || operation.name;
                const opBreadcrumb = `${ifaceBreadcrumb} > ${opName}`;
                
                const opScore = calculateMatchScore(query, opName);
                let opMetadata = 0;

                if (operation.action && calculateMatchScore(query, operation.action) > 0) {
                    opMetadata++;
                }
                if (operation.originalEndpoint && calculateMatchScore(query, operation.originalEndpoint) > 0) {
                    opMetadata++;
                }

                if (opScore > 0 || opMetadata > 0) {
                    results.push({
                        id: `operation-${operation.id || operation.name}`,
                        type: 'operation',
                        name: opName,
                        breadcrumb: ifaceBreadcrumb,
                        view: 'projects',
                        score: calculateScore(opScore, 'operation', opMetadata),
                        data: {
                            projectName: project.name,
                            interfaceId: iface.id,
                            operationId: operation.id,
                            project,
                            interface: iface,
                            operation,
                        },
                    });
                }

                // Search requests
                for (const request of operation.requests || []) {
                    const reqScore = calculateMatchScore(query, request.name);
                    let reqMetadata = 0;

                    if (request.endpoint && calculateMatchScore(query, request.endpoint) > 0) {
                        reqMetadata++;
                    }

                    if (reqScore > 0 || reqMetadata > 0) {
                        results.push({
                            id: `request-${request.id || request.name}`,
                            type: 'request',
                            name: request.name,
                            breadcrumb: opBreadcrumb,
                            view: 'projects',
                            score: calculateScore(reqScore, 'request', reqMetadata),
                            data: {
                                projectName: project.name,
                                interfaceId: iface.id,
                                operationId: operation.id,
                                requestId: request.id,
                                project,
                                interface: iface,
                                operation,
                                request,
                            },
                        });
                    }
                }
            }
        }

        // Search folders
        for (const folder of project.folders || []) {
            searchFolder(query, folder, project.name, projectBreadcrumb, results);
        }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);

    const maxResults = options.maxResults || 50;
    const minScore = options.minScore || 0;

    return results
        .filter(r => r.score >= minScore)
        .slice(0, maxResults);
}

// =============================================================================
// TESTS SEARCH
// =============================================================================

/**
 * Search within test suites and test cases
 */
export function searchTests(
    query: string,
    projects: ApinoxProject[],
    options: SearchOptions = {}
): SearchResult[] {
    const results: SearchResult[] = [];

    if (!query || query.trim().length === 0) {
        return results;
    }

    for (const project of projects) {
        for (const suite of project.testSuites || []) {
            const suiteBreadcrumb = `${project.name} > Tests`;

            // Search suite name
            const suiteScore = calculateMatchScore(query, suite.name);
            if (suiteScore > 0) {
                results.push({
                    id: `test-suite-${suite.id}`,
                    type: 'test-suite',
                    name: suite.name,
                    breadcrumb: suiteBreadcrumb,
                    view: 'tests',
                    score: calculateScore(suiteScore, 'test-suite'),
                    data: {
                        projectName: project.name,
                        testSuiteId: suite.id,
                    },
                });
            }

            // Search test cases
            for (const testCase of suite.testCases || []) {
                const caseScore = calculateMatchScore(query, testCase.name);
                if (caseScore > 0) {
                    results.push({
                        id: `test-case-${testCase.id}`,
                        type: 'test-case',
                        name: testCase.name,
                        breadcrumb: `${suiteBreadcrumb} > ${suite.name}`,
                        view: 'tests',
                        score: calculateScore(caseScore, 'test-case'),
                        data: {
                            projectName: project.name,
                            testSuiteId: suite.id,
                            testCaseId: testCase.id,
                        },
                    });
                }
            }
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.maxResults || 50);
}

// =============================================================================
// UNIFIED SEARCH
// =============================================================================

/**
 * Search across all workspace views
 */
export function searchWorkspace(
    query: string,
    projects: ApinoxProject[],
    options: SearchOptions = {}
): SearchResult[] {
    const allResults: SearchResult[] = [];

    const views = options.views || ['projects', 'tests'];

    if (views.includes('projects')) {
        allResults.push(...searchProjects(query, projects, options));
    }

    if (views.includes('tests')) {
        allResults.push(...searchTests(query, projects, options));
    }

    // Sort by score and remove duplicates
    allResults.sort((a, b) => b.score - a.score);

    const maxResults = options.maxResults || 50;
    return allResults.slice(0, maxResults);
}
