/**
 * themes.ts
 * 
 * Complete theme definitions for Tauri mode with all VSCode CSS variables.
 * Includes Dark, Light, Solarized Dark, and Solarized Light themes.
 */

export interface Theme {
    name: string;
    variables: Record<string, string>;
}

// VSCode Dark+ Theme
export const darkTheme: Theme = {
    name: 'Dark',
    variables: {
        // Font
        '--vscode-font-family': '"Segoe UI", system-ui, sans-serif',
        '--vscode-font-size': '13px',
        '--vscode-font-weight': '400',
        '--vscode-editor-font-family': 'Consolas, "Courier New", monospace',

        // Editor
        '--vscode-editor-background': '#1e1e1e',
        '--vscode-editor-foreground': '#d4d4d4',
        '--vscode-editor-selectionBackground': '#264f78',
        '--vscode-editor-inactiveSelectionBackground': '#3a3d41',
        '--vscode-editor-lineHighlightBackground': '#2a2d2e',
        '--vscode-editorCursor-foreground': '#aeafad',
        '--vscode-editorWhitespace-foreground': '#404040',

        // Sidebar
        '--vscode-sideBar-background': '#252526',
        '--vscode-sideBar-foreground': '#cccccc',
        '--vscode-sideBarTitle-foreground': '#bbbbbb',
        '--vscode-sideBarSectionHeader-background': '#00000000',
        '--vscode-sideBarSectionHeader-foreground': '#cccccc',
        '--vscode-sideBarSectionHeader-border': 'rgba(204, 204, 204, 0.2)',

        // Lists and Trees
        '--vscode-list-hoverBackground': '#2a2d2e',
        '--vscode-list-activeSelectionBackground': '#37373d',
        '--vscode-list-activeSelectionForeground': '#ffffff',
        '--vscode-list-inactiveSelectionBackground': '#37373d',
        '--vscode-list-inactiveSelectionForeground': '#ffffff',
        '--vscode-list-focusBackground': '#062f4a',
        '--vscode-list-focusForeground': '#ffffff',

        // Buttons
        '--vscode-button-background': '#0e639c',
        '--vscode-button-foreground': '#ffffff',
        '--vscode-button-hoverBackground': '#1177bb',
        '--vscode-button-border': 'transparent',
        '--vscode-button-secondaryBackground': '#3a3d41',
        '--vscode-button-secondaryForeground': '#cccccc',
        '--vscode-button-secondaryHoverBackground': '#45494e',

        // Inputs
        '--vscode-input-background': '#3c3c3c',
        '--vscode-input-foreground': '#cccccc',
        '--vscode-input-border': '#3c3c3c',
        '--vscode-input-placeholderForeground': '#8b949e',
        '--vscode-inputOption-activeBackground': '#007acc4d',
        '--vscode-inputOption-activeForeground': '#ffffff',

        // Dropdowns
        '--vscode-dropdown-background': '#3c3c3c',
        '--vscode-dropdown-foreground': '#cccccc',
        '--vscode-dropdown-border': '#3c3c3c',
        '--vscode-dropdown-listBackground': '#252526',

        // Panels and Borders
        '--vscode-panel-background': '#1e1e1e',
        '--vscode-panel-border': '#80808059',
        '--vscode-panelTitle-activeBorder': '#e7e7e7',
        '--vscode-panelTitle-activeForeground': '#e7e7e7',
        '--vscode-panelTitle-inactiveForeground': '#e7e7e799',

        // Status Bar
        '--vscode-statusBar-background': '#007acc',
        '--vscode-statusBar-foreground': '#ffffff',
        '--vscode-statusBar-noFolderBackground': '#68217a',
        '--vscode-statusBar-debuggingBackground': '#cc6633',

        // Activity Bar
        '--vscode-activityBar-background': '#333333',
        '--vscode-activityBar-foreground': '#ffffff',
        '--vscode-activityBar-inactiveForeground': '#c5c5c5',
        '--vscode-activityBarBadge-background': '#007acc',
        '--vscode-activityBarBadge-foreground': '#ffffff',

        // Badges and Notifications
        '--vscode-badge-background': '#4d4d4d',
        '--vscode-badge-foreground': '#ffffff',
        '--vscode-notificationCenter-border': '#303031',
        '--vscode-notificationToast-border': '#303031',

        // Scrollbars
        '--vscode-scrollbar-shadow': '#000000',
        '--vscode-scrollbarSlider-background': '#79797966',
        '--vscode-scrollbarSlider-hoverBackground': '#646464b3',
        '--vscode-scrollbarSlider-activeBackground': '#bfbfbf66',

        // Focus and Borders
        '--vscode-focusBorder': '#007fd4',
        '--vscode-contrastBorder': '#6fc3df00',
        '--vscode-contrastActiveBorder': '#f38518',

        // Text and Links
        '--vscode-foreground': '#cccccc',
        '--vscode-descriptionForeground': '#8b949e',
        '--vscode-errorForeground': '#f48771',
        '--vscode-textLink-foreground': '#3794ff',
        '--vscode-textLink-activeForeground': '#3794ff',
        '--vscode-textCodeBlock-background': '#0a0a0a66',
        '--vscode-textPreformat-foreground': '#d7ba7d',
        '--vscode-textBlockQuote-background': '#7f7f7f1a',
        '--vscode-textBlockQuote-border': '#007acc80',

        // Menus
        '--vscode-menu-background': '#3c3c3c',
        '--vscode-menu-foreground': '#cccccc',
        '--vscode-menu-border': '#454545',
        '--vscode-menu-selectionBackground': '#094771',
        '--vscode-menu-selectionForeground': '#ffffff',
        '--vscode-menu-separatorBackground': '#606060',

        // Toolbar
        '--vscode-toolbar-hoverBackground': 'rgba(90, 93, 94, 0.31)',
        '--vscode-toolbar-activeBackground': 'rgba(99, 102, 103, 0.4)',

        // Icons
        '--vscode-icon-foreground': '#c5c5c5',

        // Charts
        '--vscode-charts-green': '#89d185',
        '--vscode-charts-blue': '#75beff',
        '--vscode-charts-purple': '#c586c0',
        '--vscode-charts-orange': '#d18616',

        // Widget (overlays, modals)
        '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.36)',
        '--vscode-widget-border': '#303031',

        // Syntax-related (for Monaco)
        '--vscode-editorBracketHighlight-foreground1': '#ffd700',
        '--vscode-editorBracketHighlight-foreground2': '#da70d6',
        '--vscode-editorBracketHighlight-foreground3': '#179fff',
        '--vscode-editorBracketHighlight-foreground4': '#4ec9b0',
        '--vscode-editorBracketHighlight-foreground5': '#c586c0',
        '--vscode-editorBracketHighlight-foreground6': '#dcdcaa',

        // Testing-related
        '--vscode-testing-iconPassed': '#73c991',
        '--vscode-testing-iconFailed': '#f48771',
        '--vscode-testing-iconQueued': '#cca700',
    },
};

// VSCode Light+ Theme
export const lightTheme: Theme = {
    name: 'Light',
    variables: {
        // Font
        '--vscode-font-family': '"Segoe UI", system-ui, sans-serif',
        '--vscode-font-size': '13px',
        '--vscode-font-weight': '400',
        '--vscode-editor-font-family': 'Consolas, "Courier New", monospace',

        // Editor
        '--vscode-editor-background': '#ffffff',
        '--vscode-editor-foreground': '#000000',
        '--vscode-editor-selectionBackground': '#add6ff',
        '--vscode-editor-inactiveSelectionBackground': '#e5ebf1',
        '--vscode-editor-lineHighlightBackground': '#f0f0f0',
        '--vscode-editorCursor-foreground': '#000000',
        '--vscode-editorWhitespace-foreground': '#d3d3d3',

        // Sidebar
        '--vscode-sideBar-background': '#f3f3f3',
        '--vscode-sideBar-foreground': '#3b3b3b',
        '--vscode-sideBarTitle-foreground': '#383838',
        '--vscode-sideBarSectionHeader-background': '#00000000',
        '--vscode-sideBarSectionHeader-foreground': '#3b3b3b',
        '--vscode-sideBarSectionHeader-border': 'rgba(97, 97, 97, 0.2)',

        // Lists and Trees
        '--vscode-list-hoverBackground': '#e8e8e8',
        '--vscode-list-activeSelectionBackground': '#0060c0',
        '--vscode-list-activeSelectionForeground': '#ffffff',
        '--vscode-list-inactiveSelectionBackground': '#e4e6f1',
        '--vscode-list-inactiveSelectionForeground': '#000000',
        '--vscode-list-focusBackground': '#d6ebff',
        '--vscode-list-focusForeground': '#000000',

        // Buttons
        '--vscode-button-background': '#007acc',
        '--vscode-button-foreground': '#ffffff',
        '--vscode-button-hoverBackground': '#0062a3',
        '--vscode-button-border': 'transparent',
        '--vscode-button-secondaryBackground': '#e7e7e7',
        '--vscode-button-secondaryForeground': '#000000',
        '--vscode-button-secondaryHoverBackground': '#d7d7d7',

        // Inputs
        '--vscode-input-background': '#ffffff',
        '--vscode-input-foreground': '#000000',
        '--vscode-input-border': '#cecece',
        '--vscode-input-placeholderForeground': '#767676',
        '--vscode-inputOption-activeBackground': '#007acc4d',
        '--vscode-inputOption-activeForeground': '#000000',

        // Dropdowns
        '--vscode-dropdown-background': '#ffffff',
        '--vscode-dropdown-foreground': '#000000',
        '--vscode-dropdown-border': '#cecece',
        '--vscode-dropdown-listBackground': '#ffffff',

        // Panels and Borders
        '--vscode-panel-background': '#ffffff',
        '--vscode-panel-border': '#80808059',
        '--vscode-panelTitle-activeBorder': '#424242',
        '--vscode-panelTitle-activeForeground': '#424242',
        '--vscode-panelTitle-inactiveForeground': '#424242b3',

        // Status Bar
        '--vscode-statusBar-background': '#007acc',
        '--vscode-statusBar-foreground': '#ffffff',
        '--vscode-statusBar-noFolderBackground': '#68217a',
        '--vscode-statusBar-debuggingBackground': '#cc6633',

        // Activity Bar
        '--vscode-activityBar-background': '#2c2c2c',
        '--vscode-activityBar-foreground': '#ffffff',
        '--vscode-activityBar-inactiveForeground': '#b0b0b0',
        '--vscode-activityBarBadge-background': '#007acc',
        '--vscode-activityBarBadge-foreground': '#ffffff',

        // Badges and Notifications
        '--vscode-badge-background': '#c4c4c4',
        '--vscode-badge-foreground': '#333333',
        '--vscode-notificationCenter-border': '#d4d4d4',
        '--vscode-notificationToast-border': '#d4d4d4',

        // Scrollbars
        '--vscode-scrollbar-shadow': '#dddddd',
        '--vscode-scrollbarSlider-background': '#64646466',
        '--vscode-scrollbarSlider-hoverBackground': '#646464b3',
        '--vscode-scrollbarSlider-activeBackground': '#00000099',

        // Focus and Borders
        '--vscode-focusBorder': '#0090f1',
        '--vscode-contrastBorder': '#6fc3df00',
        '--vscode-contrastActiveBorder': '#f38518',

        // Text and Links
        '--vscode-foreground': '#3b3b3b',
        '--vscode-descriptionForeground': '#717171',
        '--vscode-errorForeground': '#a1260d',
        '--vscode-textLink-foreground': '#006ab1',
        '--vscode-textLink-activeForeground': '#006ab1',
        '--vscode-textCodeBlock-background': '#dcdcdc66',
        '--vscode-textPreformat-foreground': '#a31515',
        '--vscode-textBlockQuote-background': '#7f7f7f1a',
        '--vscode-textBlockQuote-border': '#007acc80',

        // Menus
        '--vscode-menu-background': '#ffffff',
        '--vscode-menu-foreground': '#3b3b3b',
        '--vscode-menu-border': '#d4d4d4',
        '--vscode-menu-selectionBackground': '#0060c0',
        '--vscode-menu-selectionForeground': '#ffffff',
        '--vscode-menu-separatorBackground': '#d4d4d4',

        // Toolbar
        '--vscode-toolbar-hoverBackground': 'rgba(184, 184, 184, 0.31)',
        '--vscode-toolbar-activeBackground': 'rgba(166, 166, 166, 0.4)',

        // Icons
        '--vscode-icon-foreground': '#424242',

        // Charts
        '--vscode-charts-green': '#388a34',
        '--vscode-charts-blue': '#0e639c',
        '--vscode-charts-purple': '#6f4fa7',
        '--vscode-charts-orange': '#ba6233',

        // Widget (overlays, modals)
        '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.16)',
        '--vscode-widget-border': '#c8c8c8',

        // Syntax-related (for Monaco)
        '--vscode-editorBracketHighlight-foreground1': '#0431fa',
        '--vscode-editorBracketHighlight-foreground2': '#319331',
        '--vscode-editorBracketHighlight-foreground3': '#7b3814',
        '--vscode-editorBracketHighlight-foreground4': '#0e7c7c',
        '--vscode-editorBracketHighlight-foreground5': '#af00db',
        '--vscode-editorBracketHighlight-foreground6': '#811f3f',

        // Testing-related
        '--vscode-testing-iconPassed': '#388a34',
        '--vscode-testing-iconFailed': '#d73a49',
        '--vscode-testing-iconQueued': '#9a6700',
    },
};

// Solarized Dark Theme
export const solarizedDarkTheme: Theme = {
    name: 'Solarized Dark',
    variables: {
        // Font
        '--vscode-font-family': '"Segoe UI", system-ui, sans-serif',
        '--vscode-font-size': '13px',
        '--vscode-font-weight': '400',
        '--vscode-editor-font-family': 'Consolas, "Courier New", monospace',

        // Solarized Dark Palette
        // base03:  #002b36, base02:  #073642, base01:  #586e75, base00:  #657b83
        // base0:   #839496, base1:   #93a1a1, base2:   #eee8d5, base3:   #fdf6e3
        // yellow:  #b58900, orange:  #cb4b16, red:     #dc322f, magenta: #d33682
        // violet:  #6c71c4, blue:    #268bd2, cyan:    #2aa198, green:   #859900

        // Editor
        '--vscode-editor-background': '#002b36',
        '--vscode-editor-foreground': '#839496',
        '--vscode-editor-selectionBackground': '#073642',
        '--vscode-editor-inactiveSelectionBackground': '#003847',
        '--vscode-editor-lineHighlightBackground': '#073642',
        '--vscode-editorCursor-foreground': '#839496',
        '--vscode-editorWhitespace-foreground': '#073642',

        // Sidebar
        '--vscode-sideBar-background': '#073642',
        '--vscode-sideBar-foreground': '#93a1a1',
        '--vscode-sideBarTitle-foreground': '#93a1a1',
        '--vscode-sideBarSectionHeader-background': '#00000000',
        '--vscode-sideBarSectionHeader-foreground': '#93a1a1',
        '--vscode-sideBarSectionHeader-border': 'rgba(147, 161, 161, 0.2)',

        // Lists and Trees
        '--vscode-list-hoverBackground': '#073642',
        '--vscode-list-activeSelectionBackground': '#586e75',
        '--vscode-list-activeSelectionForeground': '#fdf6e3',
        '--vscode-list-inactiveSelectionBackground': '#073642',
        '--vscode-list-inactiveSelectionForeground': '#93a1a1',
        '--vscode-list-focusBackground': '#268bd2',
        '--vscode-list-focusForeground': '#fdf6e3',

        // Buttons
        '--vscode-button-background': '#268bd2',
        '--vscode-button-foreground': '#fdf6e3',
        '--vscode-button-hoverBackground': '#2aa198',
        '--vscode-button-border': 'transparent',
        '--vscode-button-secondaryBackground': '#586e75',
        '--vscode-button-secondaryForeground': '#eee8d5',
        '--vscode-button-secondaryHoverBackground': '#657b83',

        // Inputs
        '--vscode-input-background': '#073642',
        '--vscode-input-foreground': '#93a1a1',
        '--vscode-input-border': '#586e75',
        '--vscode-input-placeholderForeground': '#586e75',
        '--vscode-inputOption-activeBackground': '#268bd24d',
        '--vscode-inputOption-activeForeground': '#fdf6e3',

        // Dropdowns
        '--vscode-dropdown-background': '#073642',
        '--vscode-dropdown-foreground': '#93a1a1',
        '--vscode-dropdown-border': '#586e75',
        '--vscode-dropdown-listBackground': '#002b36',

        // Panels and Borders
        '--vscode-panel-background': '#002b36',
        '--vscode-panel-border': '#586e7559',
        '--vscode-panelTitle-activeBorder': '#268bd2',
        '--vscode-panelTitle-activeForeground': '#93a1a1',
        '--vscode-panelTitle-inactiveForeground': '#586e75',

        // Status Bar
        '--vscode-statusBar-background': '#268bd2',
        '--vscode-statusBar-foreground': '#fdf6e3',
        '--vscode-statusBar-noFolderBackground': '#6c71c4',
        '--vscode-statusBar-debuggingBackground': '#cb4b16',

        // Activity Bar
        '--vscode-activityBar-background': '#073642',
        '--vscode-activityBar-foreground': '#93a1a1',
        '--vscode-activityBar-inactiveForeground': '#839496',
        '--vscode-activityBarBadge-background': '#268bd2',
        '--vscode-activityBarBadge-foreground': '#fdf6e3',

        // Badges and Notifications
        '--vscode-badge-background': '#268bd2',
        '--vscode-badge-foreground': '#fdf6e3',
        '--vscode-notificationCenter-border': '#586e75',
        '--vscode-notificationToast-border': '#586e75',

        // Scrollbars
        '--vscode-scrollbar-shadow': '#000000',
        '--vscode-scrollbarSlider-background': '#586e7566',
        '--vscode-scrollbarSlider-hoverBackground': '#586e75b3',
        '--vscode-scrollbarSlider-activeBackground': '#93a1a166',

        // Focus and Borders
        '--vscode-focusBorder': '#268bd2',
        '--vscode-contrastBorder': '#6fc3df00',
        '--vscode-contrastActiveBorder': '#cb4b16',

        // Text and Links
        '--vscode-foreground': '#839496',
        '--vscode-descriptionForeground': '#586e75',
        '--vscode-errorForeground': '#dc322f',
        '--vscode-textLink-foreground': '#268bd2',
        '--vscode-textLink-activeForeground': '#2aa198',
        '--vscode-textCodeBlock-background': '#073642',
        '--vscode-textPreformat-foreground': '#b58900',
        '--vscode-textBlockQuote-background': '#07364266',
        '--vscode-textBlockQuote-border': '#268bd280',

        // Menus
        '--vscode-menu-background': '#073642',
        '--vscode-menu-foreground': '#93a1a1',
        '--vscode-menu-border': '#586e75',
        '--vscode-menu-selectionBackground': '#268bd2',
        '--vscode-menu-selectionForeground': '#fdf6e3',
        '--vscode-menu-separatorBackground': '#586e75',

        // Toolbar
        '--vscode-toolbar-hoverBackground': 'rgba(88, 110, 117, 0.31)',
        '--vscode-toolbar-activeBackground': 'rgba(88, 110, 117, 0.4)',

        // Icons
        '--vscode-icon-foreground': '#93a1a1',

        // Charts
        '--vscode-charts-green': '#859900',
        '--vscode-charts-blue': '#268bd2',
        '--vscode-charts-purple': '#6c71c4',
        '--vscode-charts-orange': '#a95a38',

        // Widget (overlays, modals)
        '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.5)',
        '--vscode-widget-border': '#586e75',

        // Syntax-related (for Monaco)
        '--vscode-editorBracketHighlight-foreground1': '#b58900',
        '--vscode-editorBracketHighlight-foreground2': '#d33682',
        '--vscode-editorBracketHighlight-foreground3': '#268bd2',
        '--vscode-editorBracketHighlight-foreground4': '#2aa198',
        '--vscode-editorBracketHighlight-foreground5': '#6c71c4',
        '--vscode-editorBracketHighlight-foreground6': '#859900',

        // Testing-related
        '--vscode-testing-iconPassed': '#859900',
        '--vscode-testing-iconFailed': '#dc322f',
        '--vscode-testing-iconQueued': '#b58900',
    },
};

// Solarized Light Theme
export const solarizedLightTheme: Theme = {
    name: 'Solarized Light',
    variables: {
        // Font
        '--vscode-font-family': '"Segoe UI", system-ui, sans-serif',
        '--vscode-font-size': '13px',
        '--vscode-font-weight': '400',
        '--vscode-editor-font-family': 'Consolas, "Courier New", monospace',

        // Editor
        '--vscode-editor-background': '#fdf6e3',
        '--vscode-editor-foreground': '#657b83',
        '--vscode-editor-selectionBackground': '#eee8d5',
        '--vscode-editor-inactiveSelectionBackground': '#f5f0dc',
        '--vscode-editor-lineHighlightBackground': '#eee8d5',
        '--vscode-editorCursor-foreground': '#657b83',
        '--vscode-editorWhitespace-foreground': '#eee8d5',

        // Sidebar
        '--vscode-sideBar-background': '#eee8d5',
        '--vscode-sideBar-foreground': '#586e75',
        '--vscode-sideBarTitle-foreground': '#586e75',
        '--vscode-sideBarSectionHeader-background': '#00000000',
        '--vscode-sideBarSectionHeader-foreground': '#586e75',
        '--vscode-sideBarSectionHeader-border': 'rgba(88, 110, 117, 0.2)',

        // Lists and Trees
        '--vscode-list-hoverBackground': '#e8e2cd',
        '--vscode-list-activeSelectionBackground': '#93a1a1',
        '--vscode-list-activeSelectionForeground': '#002b36',
        '--vscode-list-inactiveSelectionBackground': '#eee8d5',
        '--vscode-list-inactiveSelectionForeground': '#586e75',
        '--vscode-list-focusBackground': '#268bd2',
        '--vscode-list-focusForeground': '#fdf6e3',

        // Buttons
        '--vscode-button-background': '#268bd2',
        '--vscode-button-foreground': '#fdf6e3',
        '--vscode-button-hoverBackground': '#2aa198',
        '--vscode-button-border': 'transparent',
        '--vscode-button-secondaryBackground': '#93a1a1',
        '--vscode-button-secondaryForeground': '#002b36',
        '--vscode-button-secondaryHoverBackground': '#839496',

        // Inputs
        '--vscode-input-background': '#eee8d5',
        '--vscode-input-foreground': '#586e75',
        '--vscode-input-border': '#93a1a1',
        '--vscode-input-placeholderForeground': '#93a1a1',
        '--vscode-inputOption-activeBackground': '#268bd24d',
        '--vscode-inputOption-activeForeground': '#002b36',

        // Dropdowns
        '--vscode-dropdown-background': '#eee8d5',
        '--vscode-dropdown-foreground': '#586e75',
        '--vscode-dropdown-border': '#93a1a1',
        '--vscode-dropdown-listBackground': '#fdf6e3',

        // Panels and Borders
        '--vscode-panel-background': '#fdf6e3',
        '--vscode-panel-border': '#93a1a159',
        '--vscode-panelTitle-activeBorder': '#268bd2',
        '--vscode-panelTitle-activeForeground': '#586e75',
        '--vscode-panelTitle-inactiveForeground': '#93a1a1',

        // Status Bar
        '--vscode-statusBar-background': '#268bd2',
        '--vscode-statusBar-foreground': '#fdf6e3',
        '--vscode-statusBar-noFolderBackground': '#6c71c4',
        '--vscode-statusBar-debuggingBackground': '#cb4b16',

        // Activity Bar
        '--vscode-activityBar-background': '#eee8d5',
        '--vscode-activityBar-foreground': '#586e75',
        '--vscode-activityBar-inactiveForeground': '#7b8790',
        '--vscode-activityBarBadge-background': '#268bd2',
        '--vscode-activityBarBadge-foreground': '#fdf6e3',

        // Badges and Notifications
        '--vscode-badge-background': '#268bd2',
        '--vscode-badge-foreground': '#fdf6e3',
        '--vscode-notificationCenter-border': '#93a1a1',
        '--vscode-notificationToast-border': '#93a1a1',

        // Scrollbars
        '--vscode-scrollbar-shadow': '#cccccc',
        '--vscode-scrollbarSlider-background': '#93a1a166',
        '--vscode-scrollbarSlider-hoverBackground': '#93a1a1b3',
        '--vscode-scrollbarSlider-activeBackground': '#586e7599',

        // Focus and Borders
        '--vscode-focusBorder': '#268bd2',
        '--vscode-contrastBorder': '#6fc3df00',
        '--vscode-contrastActiveBorder': '#cb4b16',

        // Text and Links
        '--vscode-foreground': '#657b83',
        '--vscode-descriptionForeground': '#93a1a1',
        '--vscode-errorForeground': '#dc322f',
        '--vscode-textLink-foreground': '#268bd2',
        '--vscode-textLink-activeForeground': '#2aa198',
        '--vscode-textCodeBlock-background': '#eee8d5',
        '--vscode-textPreformat-foreground': '#b58900',
        '--vscode-textBlockQuote-background': '#eee8d566',
        '--vscode-textBlockQuote-border': '#268bd280',

        // Menus
        '--vscode-menu-background': '#fdf6e3',
        '--vscode-menu-foreground': '#586e75',
        '--vscode-menu-border': '#93a1a1',
        '--vscode-menu-selectionBackground': '#268bd2',
        '--vscode-menu-selectionForeground': '#fdf6e3',
        '--vscode-menu-separatorBackground': '#93a1a1',

        // Toolbar
        '--vscode-toolbar-hoverBackground': 'rgba(147, 161, 161, 0.31)',
        '--vscode-toolbar-activeBackground': 'rgba(147, 161, 161, 0.4)',

        // Icons
        '--vscode-icon-foreground': '#586e75',

        // Charts
        '--vscode-charts-green': '#859900',
        '--vscode-charts-blue': '#268bd2',
        '--vscode-charts-purple': '#6c71c4',
        '--vscode-charts-orange': '#b15d39',

        // Widget (overlays, modals)
        '--vscode-widget-shadow': 'rgba(0, 0, 0, 0.16)',
        '--vscode-widget-border': '#93a1a1',

        // Syntax-related (for Monaco)
        '--vscode-editorBracketHighlight-foreground1': '#b58900',
        '--vscode-editorBracketHighlight-foreground2': '#d33682',
        '--vscode-editorBracketHighlight-foreground3': '#268bd2',
        '--vscode-editorBracketHighlight-foreground4': '#2aa198',
        '--vscode-editorBracketHighlight-foreground5': '#6c71c4',
        '--vscode-editorBracketHighlight-foreground6': '#859900',

        // Testing-related
        '--vscode-testing-iconPassed': '#859900',
        '--vscode-testing-iconFailed': '#dc322f',
        '--vscode-testing-iconQueued': '#b58900',
    },
};

export const themes = {
    dark: darkTheme,
    light: lightTheme,
    'solarized-dark': solarizedDarkTheme,
    'solarized-light': solarizedLightTheme,
};

export type ThemeName = keyof typeof themes;
