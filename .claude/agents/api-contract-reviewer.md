---
name: api-contract-reviewer
description: Validates API request/response shapes across the API, the four web apps, the kiosk, and the render-worker against the OpenAPI spec
---

# API Contract Reviewer Subagent

Ensures API consistency across the API, web apps, kiosk, and render worker.

## Services & Contracts

| Service | Port | Contract Location |
|---------|------|-------------------|
| API | 4000 | `printloop-api/src/modules/platform/openapi/{schemas,paths}.ts` (generates `printloop-api/openapi.json`) |
| Web apps | 3000-3003 | `printloop-web/packages/api-client/src/schema.ts` (generated) and the typed calls in `printloop-web/apps/*/src` |
| Kiosk | - | `printloop-kiosk-app/src/main/*.ts` |
| Render Worker | - | `render-worker/src/pipeline/render.ts` |

## Review Areas

### 1. Route Definitions vs Web App Calls
- Typed client calls match routes in the spec exactly, and the committed spec and generated client are current
- Path params, query params, body types align
- HTTP methods match (GET/POST/PATCH/DELETE)

### 2. Request/Response Types
- Response shapes in the spec match what the handlers return (the API specs enforce this)
- Optional vs required fields consistent
- Enum values synchronized

### 3. Error Response Format
- Standardized `{ success: false, message: string, code?: string }`
- HTTP status codes appropriate (400, 401, 403, 404, 500)

### 4. Webhook Contracts
- Paystack webhook payload structure
- Render worker callback format
- Idempotency keys

## How to Use

```
/api-contract-reviewer <pr-number>
```

## Output Format

```
📋 API Contract Review

BREAKING CHANGES (blocking):
- [ ] Endpoint: method /path - description

TYPE MISMATCHES (must fix):
- [ ] File:line - expected X, got Y

MISSING ENDPOINTS (frontend calls non-existent):
- [ ] Hook calls /api/x but route doesn't exist

DEPRECATED (warn):
- [ ] Endpoint marked deprecated but still in use
```