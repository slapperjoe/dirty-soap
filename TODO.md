# Feature Backlog

This document tracks planned features for APInox, ordered by priority.

---

## Priority 1: Mock Server (Feature #7)
**Status**: ✅ Complete

Return canned responses for operations. Useful for frontend devs or offline testing.

### Capabilities
- [x] Define mock responses per operation
- [x] Match incoming requests by URL, XPath, or regex
- [x] Support for static XML responses
- [x] Record & playback mode (capture real responses)
- [x] Latency simulation (delay responses)
- [x] UI panel for managing mocks (unified Server tab)
- [x] Passthrough for unmatched requests

---

## Priority 2: Environment Variables UI (Feature #5)
**Status**: 🔄 Partially Complete

Visual editor for environments (Dev/Test/Prod).

### Already Done
- [x] Visual editor for environments (Settings → Environments tab)
- [x] Quick environment switcher in toolbar
- [x] Active environment indicator in Settings
- [x] Environment indicator badge in sidebar (nav rail)
- [x] Import/export environments

### Remaining
- [ ] Encrypted secrets support

---

## Priority 3: Request Chaining (Feature #6)
**Status**: 📋 Planned

Property transfers between requests for complex test scenarios.

### Capabilities
- [ ] Visual workflow builder
- [ ] Variable extraction from responses (XPath, JSONPath)
- [ ] Inject variables into subsequent requests
- [ ] Conditional execution
- [ ] Loop support

---

## Priority 4: Performance Metrics (Feature #10)
**Status**: 📋 Planned

Response time tracking and load testing.

### Capabilities
- [ ] Response time graphs over multiple runs
- [ ] Simple load testing (concurrent requests)
- [ ] SLA monitoring with alerts
- [ ] Export metrics to CSV/JSON
- [ ] Historical comparison

---

## Priority 5: OpenAPI/REST Support (Feature #8)
**Status**: 📋 Planned

Extend beyond SOAP to REST APIs.

### Capabilities
- [ ] Import OpenAPI/Swagger specs
- [ ] REST request editor (JSON body)
- [ ] Auto-generate REST requests from spec
- [ ] Response validation against schema
