---
paths:
  - 'src/api/**'
  - 'tests/api/**'
---

# API layer (DummyJSON)

- API tests use the typed clients in `src/api/clients.ts` and validate every success body with `parseBody(response, Schema)` (`src/api/parse.ts`). Why: a contract violation then fails at the boundary, naming the endpoint and the offending fields.
