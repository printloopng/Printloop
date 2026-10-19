# Deprecated — use `printloop-api/`

This package is the v1-era Express API. Product traffic has cut over to
[`../printloop-api/`](../printloop-api/) (neurapath-style modular
Express 5 + TypeORM).

Keep this folder until the new API is verified in your environment, then
delete it. Do **not** add new features here.

| | Old | New |
|---|---|---|
| Package | `01-backend/` | `printloop-api/` |
| Local port | 4000 | 4000 |
| Compose build | ~~`./01-backend`~~ | `./printloop-api` |
| Legacy `/api/admin` + `devApi` | present | **not ported** |
