# Digital Shadow AI

Digital Shadow AI is an MVP that scans a user's public GitHub repositories for
potential credential exposure indicators. It presents inspected repositories,
potential findings, redacted evidence, source links, remediation guidance, and
an estimated risk indicator.

## MVP features

- Accepts a public GitHub username.
- Retrieves public repositories from GitHub.
- Inspects a bounded set of repository files for:
  - GitHub personal access token patterns.
  - AWS access key ID patterns.
  - Private key markers.
  - Possible hardcoded credential assignments.
- Displays finding title, severity, repository, file, line number, source link,
  redacted evidence, explanation, and remediation guidance when available.
- Reports an estimated risk score and risk level.
- Clearly labels scans with incomplete coverage as **Partial scan** and shows a
  coverage warning.

## Architecture and request flow

```text
React/Vite frontend
        |
        | POST /api/scans { "username": "..." }
        v
Express API
        |
        | GET public repositories
        v
GitHub public API
        |
        v
Repository scanner
        |
        v
Risk assessment
        |
        v
JSON report rendered by the frontend
```

The frontend sends a username to the Express API. The API retrieves public
repositories from GitHub, passes them to the scanner, calculates the risk
indicator from the findings, and returns the report. The frontend renders the
repositories, scan status, coverage note, risk summary, and findings.

## Prerequisites

- Windows with PowerShell.
- Node.js and npm.
- Network access to the GitHub API.

No environment variables are required for the default local setup. The server
uses port `5000` by default, and Vite uses its default development port
`5173`.

## Local setup

Open PowerShell in the repository root:

```powershell
cd C:\Users\sweth\digital-shadow-ai
```

Install frontend dependencies:

```powershell
cd .\client
npm install
```

Install backend dependencies:

```powershell
cd ..\server
npm install
```

## Run the application

Use two separate PowerShell terminals.

### Terminal 1: backend

```powershell
cd C:\Users\sweth\digital-shadow-ai\server
npm run dev
```

The API is available at `http://localhost:5000`.

### Terminal 2: frontend

```powershell
cd C:\Users\sweth\digital-shadow-ai\client
npm run dev
```

Open the Vite URL shown in the terminal, normally
`http://localhost:5173`.

## API

### Health check

```http
GET /api/health
```

Successful response:

```json
{
  "status": "ok",
  "service": "digital-shadow-api"
}
```

### Start a scan

```http
POST /api/scans
Content-Type: application/json
```

Request body:

```json
{
  "username": "octocat"
}
```

The username must be a valid GitHub username: 1–39 characters, using letters,
numbers, or internal hyphens, and not starting or ending with a hyphen.

The response includes:

- `scanId`: identifier generated for the scan.
- `username`: normalized username used for the request.
- `status`: `"completed"` or `"partial"`.
- `summary`:
  - `score`: estimated exposure score from 0–100.
  - `riskLevel`: `high`, `medium`, `low`, or `no_indicators`.
  - `scoringLabel`: description of the score.
  - `uniqueFindingsCount`: findings counted after de-duplication.
  - `repositoriesReturned`: repositories returned by GitHub.
  - `repositoriesScanned`: repositories inspected.
  - `filesInspected`: files successfully inspected.
  - `filesSkipped`: files not inspected.
  - `repositoriesSkipped`: repositories not inspected.
  - `findingsCount`: findings returned.
  - `truncated`: whether scanner processing or GitHub tree data was truncated.
  - `coverageNote`: explanation of complete or partial coverage.
- `repositories`: repository `name`, `description`, `url`, and `updatedAt`.
- `findings`: potential finding objects.
- `message`: general scan message.

Finding objects can include:

- `id`, `ruleId`, `title`, `category`, `severity`, and `confidence`.
- `description`, `repository`, `filePath`, and `lineNumber`.
- `evidence`, which is redacted by the scanner.
- `sourceUrl` and `remediation`.

Invalid requests and upstream failures return an `error` object with a stable
error `code` and user-facing `message`.

## Risk scoring

The risk assessment de-duplicates findings by `id`. If an ID is not available,
it uses repository, file path, line number, and rule ID as the fallback key.

Each unique finding contributes a base score according to severity:

| Severity | Base score |
| --- | ---: |
| `critical` | 40 |
| `high` | 25 |
| `medium` | 15 |
| `low` | 5 |
| `informational` | 0 |

The base score is multiplied by the confidence factor:

| Confidence | Factor |
| --- | ---: |
| `high` | 1.0 |
| `medium` | 0.6 |
| `low` | 0.3 |

The total is rounded and capped at 100. Risk levels are assigned as follows:

- `high`: score 70 or higher.
- `medium`: score 35–69.
- `low`: score 1–34.
- `no_indicators`: score 0.

The score is an estimated exposure indicator. It is not proof that a secret is
valid or exploitable.

## Partial scans and coverage warnings

The API returns `status: "partial"` when coverage is incomplete, including
when:

- More than five repositories are returned; only the first five are selected.
- The GitHub repository list reaches the API request limit of 100.
- A repository is missing required metadata or fails to scan.
- More than 20 eligible files are present in one repository.
- A file cannot be fetched or is larger than the scanner's 100,000-byte limit.
- GitHub reports that a repository tree is truncated.
- The scanner reaches its maximum of 100 findings.

Partial scans return a `summary.coverageNote` stating that some resources may
not have been inspected and that the result does not represent a complete
account scan. The frontend displays this warning and never presents a partial
scan as completed.

The scanner also skips configured binary or archive extensions, including
images, PDFs, archives, fonts, audio, and video. Skipped extensions are not
themselves findings.

## Security and privacy

- The application requests public GitHub repository data only.
- It does not ask for a GitHub password or token.
- The scanner returns redacted evidence such as `[REDACTED]`; it does not return
  matched raw credential values in finding evidence.
- Findings are pattern-based indicators. They are not confirmed secrets and
  their validity is not verified.
- A finding should be reviewed and, if genuine, revoked or rotated and removed
  from source and repository history as appropriate.
- A scan with no findings does not prove that an account is secure.

## Testing and production build

Run the backend tests from PowerShell:

```powershell
cd C:\Users\sweth\digital-shadow-ai\server
npm test
```

Lint the frontend:

```powershell
cd C:\Users\sweth\digital-shadow-ai\client
npm run lint
```

Create the frontend production bundle:

```powershell
cd C:\Users\sweth\digital-shadow-ai\client
npm run build
```

Preview the production bundle locally:

```powershell
cd C:\Users\sweth\digital-shadow-ai\client
npm run preview
```

## Current limitations

- Only public GitHub repositories are supported.
- The scan is bounded by repository, file-size, file-count, and finding-count
  limits.
- GitHub API availability and rate limits can prevent a scan from completing.
- Pattern matches can be false positives and are not verified against the
  credential provider.
- The frontend uses `VITE_API_URL` when provided, the deployed Render API in
  production, and `http://localhost:5000` during local development.
- The MVP has no authenticated user accounts, persistence, scheduled scans, or
  background job queue.
- There is no automated frontend component test suite; frontend validation is
  currently provided by linting and the production build.

## Future improvements

Potential next steps include:

- Add a deployment configuration guide for the frontend and backend URLs.
- Add authenticated, consent-based scanning for additional repository scopes.
- Add broader secret detectors with provider-specific validation.
- Add persistent scan history and exportable reports.
- Add pagination and background processing for larger accounts.
- Add frontend component and end-to-end tests.
