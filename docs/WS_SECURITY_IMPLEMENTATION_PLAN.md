# WS-Security Implementation Plan for DirtySoap

## 1. What is WS-Security?

**WS-Security (Web Services Security)** is a flexible and feature-rich standard extension to SOAP to apply security to web services. It goes beyond simple transport-level security (like HTTPS) by securing the message *itself*, ensuring that security follows the message regardless of how it travels or is routed.

It addresses three main pillars of security:

1.  **Authentication**: Verifying the identity of the sender (e.g., via Username/Password tokens or X.509 Certificates).
2.  **Integrity**: Ensuring the message has not been tampered with in transit (via XML Digital Signatures).
3.  **Confidentiality**: Ensuring that sensitive parts of the message are read only by the intended recipient (via XML Encryption).

### Why is it beneficial?
*   **End-to-End Security**: Unlike SSL/TLS which only encrypts the tunnel between two points, WS-Security can encrypt/sign specific parts of a message that persist even if the message passes through intermediaries (routers, load balancers, gateways).
*   **Standardization**: It is an OASIS standard widely supported by enterprise frameworks (Java Spring, .NET WCF), making it essential for interacting with legacy enterprise systems.
*   **Flexibility**: You can choose to sign just the body, encrypt just a specific credit card number field, or authenticate via a simple token, allowing for optimized performance compliant with security policies.

---

## 2. Implementation Plan

This plan breaks down the work into logical phases to integrate WS-Security into DirtySoap.

### Phase 1: Data Model Updates (Shared)

We first need to extend our data models to support storing security configuration for each request.

**File:** `webview/src/models.ts`

**Step:** Extend `SoapUIRequest` to include a `wsSecurity` configuration object.

```typescript
export type WSSecurityType = 'None' | 'UsernameToken' | 'Certificate';
export type PasswordType = 'PasswordText' | 'PasswordDigest';

export interface WSSecurityConfig {
    type: WSSecurityType;
    // UsernameToken Fields
    username?: string;
    password?: string;
    passwordType?: PasswordType;
    hasNonce?: boolean;
    hasCreated?: boolean; // For Timestamp
    // Certificate Fields (Future proofing)
    keystorePath?: string;
    keystorePassword?: string;
}

export interface SoapUIRequest {
    // ... existing fields ...
    wsSecurity?: WSSecurityConfig;
}
```

**Benefit:** This ensures that security settings are saved with the project and persist across sessions.

### Phase 2: Frontend UI Implementation

We need a user-friendly interface to configure these settings.

**File:** `webview/src/components/request/RequestEditor.tsx` (or similar)

**Steps:**
1.  Add a new "Auth" or "Security" tab to the Request Editor (next to "Headers").
2.  Create a `SecurityPanel` component that allows selecting the security type.
3.  **Input Fields**:
    *   **Dropdown**: Security Type (None, UsernameToken).
    *   **Inputs**: Username, Password.
    *   **Dropdown**: Password Type (Text vs Digest).
    *   **Checkboxes**: "Add Nonce", "Add Created (Timestamp)".
4.  Update the state of the active request when these values change.

**Benefit:** Users can easily configure complex security requirements without manually crafting XML headers.

### Phase 3: Message Passing (Frontend -> Backend)

Ensure the security configuration travels with the execution request.

**File:** `webview/src/messages.ts` (Implicit) & `src/controllers/WebviewController.ts`

**Steps:**
1.  When `ExecuteRequest` is triggered in the UI, ensure the `wsSecurity` object is included in the message payload sent to the VS Code extension.
2.  In `WebviewController.ts`, verify that `message.wsSecurity` is correctly extracted and passed to the `SoapClient`.

### Phase 4: Backend Implementation (The Core)

This is where the actual SOAP header generation happens using `node-soap`.

**File:** `src/soapClient.ts`

**Steps:**
1.  Update `executeRequest` method signature or options to accept `wsSecurity` config.
2.  Import `WSSecurity` from `soap` package.
3.  Implement logic to apply the security:

```typescript
// Pseudocode for soapClient.ts updates

import { WSSecurity } from 'soap';

// Inside executeRequest
if (wsSecurityConfig && wsSecurityConfig.type === 'UsernameToken') {
    const { username, password, passwordType, hasNonce, hasCreated } = wsSecurityConfig;
    
    // node-soap's WSSecurity takes options:
    // new WSSecurity(username, password, options)
    // passwordType maps to 'PasswordText' or 'PasswordDigest'
    
    const wsSecurity = new WSSecurity(username, password, {
        hasNonce: hasNonce,
        hasTimeStamp: hasCreated,
        passwordType: passwordType
    });
    
    this.client.setSecurity(wsSecurity);
}
```

4.  **Raw Requests**: For "Raw XML" mode (`executeRawRequest`), `node-soap`'s `setSecurity` might not automatically apply if we are bypassing the standard method call.
    *   *Challenge*: `node-soap` client methods usually handle the injection. If we execute raw XML via Axios directly (as `executeRawRequest` currently does), we bypass `node-soap`'s processing.
    *   *Solution*: We might need to generate the WS-Security header XML content manually (or use `node-soap` to generate just the header) and inject it into the raw XML string before sending, OR advise users that Raw Mode requires manual header crafting.
    *   *Alternative*: We can use `wsSecurity.toXML()` (if available) to get the header string and inject it into `<soap:Header>`.

### Phase 5: Verification & Testing

1.  **Unit Tests**: Mock `node-soap` and verify `setSecurity` is called with correct parameters.
2.  **Integration**: Use a public WSDL that requires WS-Security (e.g., some public calculators or weather services often have secured endpoints, or mock one).
3.  **UI Verification**: Ensure toggling settings in UI updates the "Raw Request" view if possible, or at least that the sent request contains the headers in the Output Log.

---

## 3. Detailed Benefits Breakdown

### 1. Enterprise Compatibility
Many "Enterprise" grade SOAP services (banking, insurance, government) **require** WS-Security. Without this, DirtySoap is unusable for a large segment of professional developers. This implementation opens the door to these users.

### 2. Simplified Workflow
Currently, a user would have to manually construct a complex XML block like this:

```xml
<wsse:Security>
  <wsse:UsernameToken>
    <wsse:Username>admin</wsse:Username>
    <wsse:Password Type="...#PasswordDigest">dGhpcyBpcyBhIHBhc3N3b3Jk</wsse:Password>
    <wsse:Nonce>...</wsse:Nonce>
  </wsse:UsernameToken>
</wsse:Security>
```

Generating the **Nonce** and **Digest** manually is extremely difficult (requires SHA-1 hashing, base64 encoding specific combinations of time+nonce+password). Autosolving this via the "UsernameToken" UI setting saves hours of frustration.

### 3. Replay Attack Prevention
By implementing the `Timestamp` and `Nonce` options, we help users test services that enforce strict replay protection. This allows them to debug issues where their manual requests fail because "the timestamp is too old" or "nonce was used", as our tool will generate fresh values for every click of "Run".

## Conclusion
Implementing WS-Security is a high-value enhancement that matures DirtySoap from a casual utility to a professional-grade development tool. The plan utilizes existing libraries (`node-soap`) to minimize complexity while maximizing compatibility.
