# Installation


The sections below are for developers who want to run HCP locally or contribute to the project.

### Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Docker

```bash
docker-compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| **HCP** | [localhost:8080](http://localhost:8080) | Calendar app (nginx, read-only) |
| **GoAccess** | [localhost:7891](http://localhost:7891) | Real-time access log dashboard |

Logs are persisted in a shared Docker volume (`nginx-logs`) between the HCP and GoAccess containers.

#### Security

- Read-only filesystem (`read_only: true`)
- Non-root nginx user (uid 101)
- `no-new-privileges`, `cap_drop: ALL`
- CSP, X-Frame-Options, X-Content-Type-Options headers
- Input escaping, color sanitization, share URL payload validation

### Production Build

```bash
npm run build
npm run preview
```

Static files output to `dist/`.
