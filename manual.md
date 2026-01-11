# APInox Manual

## Overview
APInox is a VS Code extension for interacting with SOAP web services properly. It allows you to load WSDLs, explore operations, structure requests, and manage environments with ease.

## Features

### 1. WSDL Explorer
- Load WSDLs from a URL or local file system.
- Browse interfaces and operations in a tree view.
- Click "Add to Project" to organize relevant operations.

### 2. Request Editor
- Write raw XML requests with syntax highlighting (Monaco Editor).
- Use **Wildcards** to inject dynamic values.

### 3. Wildcards
Use the following placeholders in your XML body or URL:

**Environment & Global Variables:**
- `{{env}}`: The identifier of the currently active environment (e.g., `bld02`).
- `{{url}}`: The configured Endpoint URL for the active environment.
- `{{myVar}}`: Access any global variable defined in `settings > globals`.

**Dynamic Values:**
- `{{newguid}}` / `{{uuid}}`: Generates a random UUID v4.
- `{{now}}`: ISO 8601 Timestamp.
- `{{epoch}}`: Unix timestamp (seconds).
- `{{randomInt(1,100)}}`: Random integer between 1 and 100.

**Date Math:**
- `{{now+1h}}`: Current time plus 1 hour.
- `{{now-2d}}`: Current time minus 2 days.
- Supports `m` (minutes), `h` (hours), `d` (days), `y` (years).

**Data Generation:**
- `{{lorem(5)}}`: Generates 5 words of Lorem Ipsum.
- `{{name}}`: Random Full Name.
- `{{country}}`: Random Country.
- `{{state}}`: Random State/Province.

**User JavaScript:**
You can write custom JavaScript within wildcards for complex logic.
- `{{const d = new Date(); return d.toISOString();}}`
- `{{return Math.random() > 0.5 ? 'ValueA' : 'ValueB';}}`
*Note: This runs in a sandboxed environment.*

### 4. Environments
Manage your environments in the Request Toolbar (top right of request editor) or configure them via Settings.
Example `config.jsonc`:
```jsonc
{
  "activeEnvironment": "Build",
  "environments": {
    "Build": { "endpoint_url": "http://bld.acme.com", "env": "bld01" },
    "Prod": { "endpoint_url": "https://api.acme.com", "env": "prod" }
  }
}
```

### 5. Settings
- **Autosave**: Your workspace state is automatically saved to `~/.apinox/autosave.xml` to prevent data loss.
- **Layout**: 
    - Switch between Vertical and Horizontal layouts.
    - **Auto-Expand**: The Request panel automatically fills the screen if there is no Response visible.
- **Help Panel**: The Settings Editor includes a panel at the bottom that explains each configuration option as you type.
- **Proxy**: Configure network proxy settings in `config.jsonc`.

## Troubleshooting
- Check the **Output Panel** (select "APInox" in the dropdown) for detailed logs of requests and errors.
- If requests fail, verify your proxy settings and WSDL reachability.
