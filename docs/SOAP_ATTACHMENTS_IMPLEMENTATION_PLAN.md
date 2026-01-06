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

**Files:** 
- `webview/src/models.ts`
- `src/models.ts` (backend mirror)

**Step:** Define `SoapAttachment` and add to `SoapUIRequest`.

```typescript
export interface SoapAttachment {
    id: string;          // UUID
    name: string;        // "document.pdf"
    fsPath: string;      // "c:/users/mark/docs/document.pdf"
    contentId: string;   // "part1" (used for cid:part1 reference)
    contentType: string; // "application/pdf"
    type: 'Base64' | 'MTOM' | 'SwA'; // Optimization intent
    size?: number;       // File size in bytes for UI display
}

export interface SoapUIRequest {
    // ... existing fields ...
    attachments?: SoapAttachment[];
}
```

> **Note:** Mirror these types in `src/models.ts` for backend type safety.

---

### Phase 2: Frontend UI Implementation

**File:** `webview/src/components/AttachmentsPanel.tsx` (New File)

**Features:**
1.  **List View**: Show added attachments with name, size, content-type.
2.  **Add Button**: Triggers a VS Code file picker (via message passing).
3.  **Drag & Drop**: Support dropping files directly onto the panel.
4.  **Encapsulation Type**: Dropdown to select **Base64** (Inline), **SwA** (Multipart), or **MTOM**.
5.  **Content-ID / Token Field**: Editable field to define how this file is referenced in the XML (e.g., `<file>cid:myFile</file>`).
6.  **Auto Content-Type**: Detect MIME type from file extension using `mime-types` or similar.
7.  **Delete Button**: Remove attachments from the list.

**File:** `webview/src/components/WorkspaceLayout.tsx`

**Steps:**
1.  Add "Attachments" to the `activeTab` state and toolbar tabs.
2.  Render `AttachmentsPanel` when active.
3.  Show attachment count badge on tab when attachments exist.

---

### Phase 3: Message Passing

**Files:**
- `webview/src/messages.ts`
- `webview/src/hooks/useRequestExecution.ts`
- `webview/src/hooks/useRequestHandlers.ts`

**New Commands:**
```typescript
// In FrontendCommand enum
SelectAttachment = 'selectAttachment',       // Request file picker
RemoveAttachment = 'removeAttachment',

// In BackendCommand enum
AttachmentSelected = 'attachmentSelected',   // File picker result
```

**Message Payload Updates:**
Include `attachments` array in the `executeRequest` message:
```typescript
bridge.sendMessage({
    command: FrontendCommand.ExecuteRequest,
    // ... existing fields ...
    attachments: selectedRequest?.attachments
});
```

---

### Phase 4: Backend Implementation

**File:** `src/soapClient.ts`

**Steps:**

#### 4.1 Handle Base64 Inlining
If type is `Base64`, read file, convert to base64 string, and **replace** the `cid:{contentId}` token in the request body:

```typescript
function inlineBase64Attachments(xml: string, attachments: SoapAttachment[]): string {
    let result = xml;
    for (const att of attachments.filter(a => a.type === 'Base64')) {
        const content = fs.readFileSync(att.fsPath);
        const base64 = content.toString('base64');
        result = result.replace(`cid:${att.contentId}`, base64);
    }
    return result;
}
```

#### 4.2 Handle SwA/MTOM (Multipart)
For raw XML mode, build multipart request manually:

```typescript
import FormData from 'form-data';

function buildMultipartRequest(xml: string, attachments: SoapAttachment[]): FormData {
    const form = new FormData();
    
    // XML envelope as first part
    form.append('xmlPayload', xml, { 
        contentType: 'text/xml; charset=utf-8',
        filename: 'soap-envelope.xml'
    });
    
    // Binary attachments
    for (const att of attachments.filter(a => a.type !== 'Base64')) {
        form.append(att.contentId, fs.createReadStream(att.fsPath), {
            filename: att.name,
            contentType: att.contentType
        });
    }
    return form;
}
```

#### 4.3 For node-soap Client Mode
Leverage `node-soap`'s native streaming attachment support:

```typescript
const attachmentHelpers = attachments
    .filter(att => att.type !== 'Base64')
    .map(att => ({
        mimetype: att.contentType,
        contentId: att.contentId,
        name: att.name,
        body: fs.createReadStream(att.fsPath)
    }));

const options = { attachments: attachmentHelpers };
client[operation](args, callback, options, headers);
```

---

### Phase 5: Response Attachment Handling (Optional/Future)

Some SOAP services return attachments in responses.

**Considerations:**
1.  Parse multipart MIME response
2.  Extract binary parts and save to temp directory
3.  Show download links in UI response panel
4.  Display inline previews for images

> **Note:** This phase can be deferred to a future release if outgoing attachments are the priority.

---

### Phase 6: Verification & Testing

#### Unit Tests
**File:** `src/tests/AttachmentUtil.test.ts`

Test cases:
- Base64 inline replacement (`cid:xxx` → actual base64)
- Multipart boundary generation
- Content-Type detection from file extension
- Error handling for missing files

#### Integration Testing
1.  **Mock Service**: Create a local mock (or use a public one) that accepts attachments.
2.  **Inspection**: Use the "Raw Log" in VS Code to view the outgoing raw HTTP payload. It should show a Multipart MIME structure:
    ```
    --MIME_boundary
    Content-Type: text/xml...
    <soap:Envelope>...</soap:Envelope>
    --MIME_boundary
    Content-Type: image/jpeg
    Content-ID: <myImage>
    ...binary data...
    --MIME_boundary--
    ```

---

## 3. Risks & Challenges

| Risk | Mitigation |
|------|------------|
| **MTOM Specifics** | Start with SwA (Multipart) as MVP. True XOP+MTOM may require raw XML construction if `node-soap` support is limited. |
| **File Access** | Validate paths are absolute and exist before reading. Handle errors gracefully. |
| **Large Files** | Use streaming (`fs.createReadStream`) instead of loading entire file into memory. |
| **Content-Type Detection** | Use `mime-types` package or fallback to `application/octet-stream`. |

---

## 4. Dependencies

| Package | Purpose |
|---------|---------|
| `form-data` | Building multipart requests for raw mode |
| `mime-types` | Auto-detecting content types from file extensions |

---

## Conclusion

This feature is critical for "sending files". The implementation follows the standard pattern: UI to configure → Model to store → Backend to execute. We will leverage streaming for high performance and start with SwA support, with MTOM as a stretch goal.
