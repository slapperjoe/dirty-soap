# SOAP Attachments (MTOM/SwA) Implementation Plan

## 1. What are SOAP Attachments?

SOAP messages are XML, which is text-based. Sending binary data (images, PDFs, documents) inside XML requires Base64 encoding, which increases size by ~33% and hurts performance.

To solve this, two main standards exist:

1.  **SwA (SOAP with Attachments)**: The SOAP message is sent as a MIME Multipart message. The first part is the XML Envelope, and subsequent parts are the binary attachments. They are referenced in the XML by `Content-ID` (CID).
2.  **MTOM (Message Transmission Optimization Mechanism)**: A newer standard that also uses MIME Multipart but is more "transparent". It logically views the binary data as being *inside* the XML (as base64) but physically transmits it as a separate binary part for efficiency. It uses `XOP` (XML-binary Optimized Packaging) to link them.

### Why is this beneficial?
*   **Performance**: Avoids massive CPU/Memory cost of Base64 encoding/decoding large files.
*   **Interoperability**: Required by many healthcare, insurance, and government systems for document transfer.
*   **Correctness**: Some services strictly reject Base64 inlined data and demand MTOM.

---

## 2. Implementation Plan

### Phase 1: Data Model Updates

We need to store the list of attachments associated with a request.

**File:** `webview/src/models.ts`

**Step:** Define `SoapAttachment` and add to `SoapUIRequest`.

```typescript
export interface SoapAttachment {
    id: string;          // UUID
    name: string;        // "document.pdf"
    fsPath: string;      // "c:/users/mark/docs/document.pdf"
    contentId: string;   // "part1" (used for cid:part1 reference)
    contentType: string; // "application/pdf"
    type: 'Base64' | 'MTOM' | 'SwA'; // Optimization intent
}

export interface SoapUIRequest {
    // ... existing fields ...
    attachments?: SoapAttachment[];
}
```

### Phase 2: Frontend UI Implementation

**File:** `webview/src/components/AttachmentsPanel.tsx` (New File)

**Features:**
1.  **List View**: Show added attachments.
2.  **Add Button**: Triggers a VS Code file picker (via message passing).
3.  **Encapsulation Type**: Dropdown to select **Base64** (Inline), **SwA** (Multipart), or **MTOM**.
4.  **Content-ID / Token Field**: Editable field to define how this file is referenced in the XML (e.g., `<file>cid:myFile</file>`).

**File:** `webview/src/components/WorkspaceLayout.tsx`

**Steps:**
1.  Add "Attachments" to the `activeTab` state and toolbar tabs.
2.  Render `AttachmentsPanel` when active.
3.  Handle `FrontendCommand.SelectAttachment` to ask backend to open a file dialog.

### Phase 3: Backend Implementation

**File:** `src/soapClient.ts`

**Steps:**
1.  **Read Files**: When specific request arrives, read the files from disk using `fs`.
2.  **Handle Base64 Inlining**:
    If type is `Base64`, read file, convert to base64 string, and **replace** the `cid:{contentId}` token in the request body with the actual base64 string.
3.  **Prepare for `node-soap` (SwA/MTOM)**:
    `node-soap` supports attachments via the `options` argument in method calls (or `client.addSoapHeader` for some things, but usually options).

    *For newer node-soap versions:*
    ```typescript
    const attachmentHelpers = attachments
        .filter(att => att.type !== 'Base64') // Base64 is already inlined
        .map(att => ({
            mimetype: att.contentType,
            contentId: att.contentId,
            name: att.name,
            body: fs.createReadStream(att.fsPath) // Stream the file
        }));
    
    const options = {
        attachments: attachmentHelpers
    };
    
    // For MTOM, often requires specific headers or options
    // node-soap might handle MTOM if we set 'forceSoap12Headers' or similar, 
    // but typically it defaults to SwA (MIME Multipart).
    // Pure MTOM might require manual composition or a library extension if node-soap support is limited.
    // However, SwA covers 90% of "Attachment" use cases.
    ```

3.  **Execute**: Pass these options to the `client[operation](args, callback, options, headers)` call.

### Phase 4: Verification

1.  **Mock Service**: Create a local mock (or use a public one) that accepts attachments.
2.  **Inspection**: Use the "Raw Log" in VS Code to view the outgoing raw HTTP payload. It should show a Multipart MIME structure:
    ```
    --MIME_boundary
    Content-Type: text/xml...
    <soap:Envelope>...</soap:Envelope>
    --MIME_boundary
    Content-Type: image/jpeg
    ...binary data...
    --MIME_boundary--
    ```

---

## 3. Risks & Challenges

*   **MTOM Specifics**: `node-soap`'s MTOM support is sometimes tricky. We might start with **SwA** (Multipart) as the MVP, as it's easier to implement and covers the standard "File Upload" use case. True `XOP+MTOM` might require raw XML construction if `node-soap` fights us.
*   **File Access**: The extension host has access to files, but we must ensure paths sent from the webview are valid absolute paths.

## Conclusion
This feature is critical for "sending files". The implementation follows the standard pattern: UI to configure -> Model to store -> Backend to execute. We will leverage `node-soap`'s native streaming attachment support for high performance.
