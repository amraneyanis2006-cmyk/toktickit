## Tests

| Test ID | Tool / Framework | Description | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **API-01** | Vitest + Supertest | `GET /api/health` endpoint | Returns HTTP 200 and service status JSON |
| **API-02** | Vitest + Supertest | `GET /api/categories` endpoint | Returns HTTP 200 and category list array |
| **UI-01** | Vitest + RTL | Main header component | Renders the "TokTickIT" title properly |
| **UI-02** | Vitest + RTL | Initial data fetch state | Displays loading indicator while fetching |
| **UI-03** | Vitest + RTL | Failed fetch scenario | Renders user-friendly error message on network failure |
