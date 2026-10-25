
import { useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://digital-shadow-ai-tbpe.onrender.com"
    : "http://localhost:5000");

const REMEDIATION_STEPS = [
  { id: "review", label: "Review and confirm the finding." },
  { id: "revoke", label: "Revoke the credential if it is genuine." },
  { id: "rotate", label: "Rotate or replace it." },
  {
    id: "environment",
    label:
      "Move the secret to an environment variable and remove it from source code.",
  },
  {
    id: "history",
    label: "Remove the secret from Git history when appropriate.",
  },
  { id: "rescan", label: "Rescan to check whether the finding is still detected." },
];

const PROVIDER_LINKS = {
  "github-token": {
    name: "GitHub",
    url: "https://github.com/settings/personal-access-tokens",
  },
  "aws-access-key": {
    name: "AWS IAM",
    url: "https://console.aws.amazon.com/iam/home#/security_credentials",
  },
};

function displayValue(value, fallback = "Not available") {
  return typeof value === "string" && value.trim()
    ? value
    : fallback;
}

function severityClass(severity) {
  return String(severity || "unknown").toLowerCase();
}

function findingKey(finding, index) {
  return (
    finding.id ||
    `${finding.repository || "unknown"}:${finding.filePath || "unknown"}:${
      finding.lineNumber || index
    }`
  );
}

function detectedLanguage(filePath) {
  const extension = String(filePath || "").split(".").pop()?.toLowerCase();
  const languages = {
    js: "JavaScript",
    cjs: "JavaScript",
    mjs: "JavaScript",
    ts: "TypeScript",
    py: "Python",
    rb: "Ruby",
    go: "Go",
    java: "Java",
    php: "PHP",
  };

  return languages[extension] || "your application";
}

function environmentExamples(language) {
  const usage = {
    JavaScript: "const secret = process.env.APP_SECRET;",
    TypeScript: "const secret = process.env.APP_SECRET;",
    Python: "secret = os.environ[\"APP_SECRET\"]",
    Ruby: "secret = ENV.fetch(\"APP_SECRET\")",
    Go: "secret := os.Getenv(\"APP_SECRET\")",
    Java: "String secret = System.getenv(\"APP_SECRET\");",
    PHP: "$secret = getenv(\"APP_SECRET\");",
  };

  return {
    env: "APP_SECRET=replace-with-the-rotated-value",
    gitignore: ".env\n.env.*\n!.env.example",
    usage: usage[language] || "Read APP_SECRET using your framework's environment configuration.",
  };
}

export default function App() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checklistState, setChecklistState] = useState({});
  const [openAction, setOpenAction] = useState({});
  const [copyMessage, setCopyMessage] = useState("");

  const summary = report?.summary;
  const hasRiskScore =
    typeof summary?.score === "number" &&
    Number.isFinite(summary.score) &&
    typeof summary.riskLevel === "string";
  const riskLabel = hasRiskScore
    ? `${summary.riskLevel.replace("_", " ")} · ${summary.score}/100`
    : "Not assessed";
  const isPartialScan = report?.status === "partial";
  const scanStatusLabel = isPartialScan
    ? "Partial scan"
    : report?.status === "completed"
      ? "Completed scan"
      : "Scan status unavailable";

  async function handleScan(event) {
    event?.preventDefault();

    const cleanUsername = username.trim();

    // Validate GitHub username
    const valid =
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(
        cleanUsername
      );

    if (!valid) {
      setReport(null);
      setChecklistState({});
      setOpenAction({});
      setMessage("Please enter a valid GitHub username.");
      return;
    }

    setLoading(true);
    setReport(null);
    setChecklistState({});
    setOpenAction({});
    setMessage("Connecting to GitHub...");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/scans`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: cleanUsername,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to retrieve GitHub data."
        );
      }

      setReport(data);
      setMessage(data.message);
    } catch (error) {
      setMessage(
        `Request failed: ${error.message}. Check that the backend is running.`
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyExample(value, label) {
    if (!navigator.clipboard) {
      setCopyMessage(
        "Clipboard access is unavailable; select and copy the example."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage(
        `Could not copy the ${label.toLowerCase()}; select and copy it instead.`
      );
    }
  }

  return (
    <main className="app">
      <nav className="navbar">
        <a className="brand" href="/">
          <span className="brand-icon">DS</span>
          Digital Shadow <span className="ai">AI</span>
        </a>

        <span className="status">MVP · Early access</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">
          <span className="pulse" />
          PERSONAL DIGITAL EXPOSURE
        </div>

        <h1>
          Discover your digital
          <br />
          <span>shadow.</span>
        </h1>

        <p className="subtitle">
          Understand your public GitHub footprint. Identify
          potential exposures and learn what to fix first.
        </p>

        <form className="scan-form" onSubmit={handleScan}>
          <label htmlFor="username">
            Public GitHub username
          </label>

          <div className="input-row">
            <span className="github-mark">@</span>

            <input
              id="username"
              type="text"
              placeholder="Enter GitHub username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setMessage("");
                setReport(null);
                setChecklistState({});
                setOpenAction({});
              }}
              maxLength={39}
              autoComplete="off"
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Scanning..." : "Start scan ↗"}
            </button>
          </div>

          <p className="privacy-note">
            🔒 Public profile only · No password required
          </p>
        </form>

        {message && (
          <div className="message" role="status">
            {message}
          </div>
        )}
      </section>

      {report && (
        <section className="results">
          <div className="results-header">
            <p className="eyebrow">GITHUB SCAN RESULTS</p>
            <h2>@{report.username}</h2>
            <p>
              Public repositories retrieved:{" "}
              {report.repositories?.length ?? 0}
            </p>
            <span
              className={`scan-status ${
                isPartialScan ? "scan-status-partial" : ""
              }`}
            >
              {scanStatusLabel}
            </span>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span>Repositories</span>
              <strong>
                {report.summary?.repositoriesScanned ?? 0}
              </strong>
            </article>

            <article className="summary-card">
              <span>Findings</span>
              <strong>
                {summary?.findingsCount ?? "Unavailable"}
              </strong>
            </article>

            <article className="summary-card">
              <span>Risk assessment</span>
              <strong>{riskLabel}</strong>
            </article>
          </div>

          <div className="panel">
            <h2>Public repositories</h2>

            {report.repositories?.length > 0 ? (
              <ul className="repository-list">
                {report.repositories.map((repo) => (
                  <li key={repo.url} className="repository-item">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {repo.name} ↗
                    </a>

                    {repo.description && (
                      <p>{repo.description}</p>
                    )}

                    <small>
                      Last updated:{" "}
                      {repo.updatedAt
                        ? new Date(
                            repo.updatedAt
                          ).toLocaleDateString()
                        : "Unknown"}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No public repositories were returned.</p>
            )}
          </div>

          <div className="panel">
            <h2>Security findings</h2>

            <p>
              {report.message}
            </p>

            <p className="privacy-note">
              {report.summary?.riskLevel === "not_assessed"
                ? "Security analysis has not yet been performed. No safety conclusion can be drawn from this report."
                : "Review findings and their evidence before making security decisions."}
            </p>

            <div className="coverage-note" role="note">
              <strong>Rescan reminder</strong>
              <span>
                A clean rescan only means this scanner did not detect this
                pattern in the inspected resources. It does not prove a
                credential is invalid or that the entire repository is secure.
              </span>
            </div>

            <div
              className={`coverage-note ${
                isPartialScan ? "coverage-note-partial" : ""
              }`}
              role="status"
            >
              <strong>
                {isPartialScan
                  ? "Partial coverage"
                  : "Coverage"}
              </strong>
              <span>
                {displayValue(
                  summary?.coverageNote,
                  isPartialScan
                    ? "Some resources may not have been inspected. This result does not represent a complete account scan."
                    : "Selected public resources were inspected. No findings does not prove the account is secure."
                )}
              </span>
            </div>

            {report.findings?.length > 0 ? (
              <ul className="findings-list">
                {report.findings.map((finding, index) => {
                  const key = findingKey(finding, index);
                  const language = detectedLanguage(finding.filePath);
                  const examples = environmentExamples(language);
                  const provider = PROVIDER_LINKS[finding.ruleId];
                  const severity = displayValue(
                    finding.severity,
                    "Unknown severity"
                  );
                  const hasLineNumber =
                    typeof finding.lineNumber === "number";
                  const hasSourceUrl =
                    typeof finding.sourceUrl === "string" &&
                    finding.sourceUrl.trim();

                  return (
                    <li
                      key={key}
                      className="finding-card"
                    >
                      <div className="finding-header">
                        <div>
                          <h3>
                            {displayValue(
                              finding.title,
                              "Untitled finding"
                            )}
                          </h3>
                          <span
                            className={`severity-badge severity-${severityClass(
                              finding.severity
                            )}`}
                          >
                            {severity}
                          </span>
                        </div>
                      </div>

                      <div className="finding-location">
                        <span>
                          <strong>Repository</strong>{" "}
                          {displayValue(finding.repository)}
                        </span>
                        <span>
                          <strong>File</strong>{" "}
                          {displayValue(finding.filePath)}
                        </span>
                        {hasLineNumber && (
                          <span>
                            <strong>Line</strong> {finding.lineNumber}
                          </span>
                        )}
                        {hasSourceUrl && (
                          <a
                            href={finding.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View source ↗
                          </a>
                        )}
                      </div>

                      <div className="finding-section">
                        <h4>Redacted evidence</h4>
                        <code className="finding-evidence">
                          {displayValue(finding.evidence)}
                        </code>
                      </div>

                      <div className="finding-section">
                        <h4>Why it matters</h4>
                        <p>
                          {displayValue(
                            finding.description,
                            "No explanation was provided."
                          )}
                        </p>
                      </div>

                      <div className="finding-section">
                        <h4>Remediation</h4>
                        <p>
                          {displayValue(
                            finding.remediation,
                            "No remediation steps were provided."
                          )}
                        </p>
                      </div>

                      <div className="finding-section remediation-checklist">
                        <h4>Personalized cleanup plan</h4>
                        <p className="checklist-intro">
                          Track these steps for this finding. Checking a step
                          does not revoke credentials, change repositories, or
                          rewrite Git history automatically.
                        </p>
                        <ul className="checklist">
                          {REMEDIATION_STEPS.map((step, stepIndex) => {
                            const checked =
                              checklistState[key]?.[stepIndex] === true;
                            const actionIsOpen =
                              openAction[key] === step.id;

                            return (
                              <li key={step}>
                                <div className="checklist-row">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setChecklistState((current) => ({
                                          ...current,
                                          [key]: {
                                            ...current[key],
                                            [stepIndex]: !checked,
                                          },
                                        }));
                                      }}
                                    />
                                    <span>{step.label}</span>
                                  </label>
                                  {step.id === "review" && hasSourceUrl ? (
                                    <a
                                      className="action-button"
                                      href={finding.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open source ↗
                                    </a>
                                  ) : (
                                    <button
                                      className="action-button"
                                      type="button"
                                      disabled={
                                        (step.id === "review" && !hasSourceUrl) ||
                                        (step.id === "rescan" && loading)
                                      }
                                      onClick={() => {
                                        if (step.id === "rescan") {
                                          handleScan();
                                          return;
                                        }

                                        setCopyMessage("");
                                        setOpenAction((current) => ({
                                          ...current,
                                          [key]: actionIsOpen
                                            ? null
                                            : step.id,
                                        }));
                                      }}
                                    >
                                      {step.id === "review"
                                        ? "Source unavailable"
                                        : step.id === "rescan"
                                          ? "Run rescan"
                                          : "Next step"}
                                    </button>
                                  )}
                                </div>

                                {actionIsOpen && step.id === "revoke" && (
                                  <div className="action-panel">
                                    {provider ? (
                                      <>
                                        <p>
                                          Manage this possible {provider.name}{" "}
                                          credential in the provider console.
                                          Confirm the finding first, then
                                          revoke only the credential you
                                          recognize.
                                        </p>
                                        <a
                                          className="action-button"
                                          href={provider.url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Open {provider.name} credential management ↗
                                        </a>
                                      </>
                                    ) : (
                                      <p>
                                        The provider could not be identified
                                        confidently. Sign in to the service
                                        that owns this credential, locate its
                                        credential-management page, and revoke
                                        it there if confirmed. Do not share the
                                        credential with this app.
                                      </p>
                                    )}
                                  </div>
                                )}

                                {actionIsOpen && step.id === "rotate" && (
                                  <div className="action-panel">
                                    <p>
                                      Create a new credential in the provider
                                      console, update every application that
                                      uses it, deploy the change, and verify
                                      the application before disabling the old
                                      credential.
                                    </p>
                                  </div>
                                )}

                                {actionIsOpen && step.id === "environment" && (
                                  <div className="action-panel">
                                    <p>
                                      Detected language: {language}. Replace
                                      the placeholder locally with the
                                      rotated value; this app never displays
                                      the detected value.
                                    </p>
                                    <label className="example-label" htmlFor={`${key}-env`}>
                                      .env example
                                    </label>
                                    <textarea
                                      id={`${key}-env`}
                                      className="copy-example"
                                      readOnly
                                      value={examples.env}
                                    />
                                    <button
                                      className="action-button"
                                      type="button"
                                      onClick={() =>
                                        copyExample(
                                          examples.env,
                                          ".env example"
                                        )
                                      }
                                    >
                                      Copy .env example
                                    </button>
                                    <label className="example-label" htmlFor={`${key}-gitignore`}>
                                      .gitignore example
                                    </label>
                                    <textarea
                                      id={`${key}-gitignore`}
                                      className="copy-example"
                                      readOnly
                                      value={examples.gitignore}
                                    />
                                    <button
                                      className="action-button"
                                      type="button"
                                      onClick={() =>
                                        copyExample(
                                          examples.gitignore,
                                          ".gitignore example"
                                        )
                                      }
                                    >
                                      Copy .gitignore example
                                    </button>
                                    <code className="usage-example">
                                      {examples.usage}
                                    </code>
                                    {copyMessage && (
                                      <p className="copy-status" role="status">
                                        {copyMessage}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {actionIsOpen && step.id === "history" && (
                                  <div className="action-panel">
                                    <p>
                                      History rewriting can affect every
                                      clone. Coordinate with collaborators,
                                      make a backup, and follow your
                                      organization&apos;s incident process.
                                      Never run these commands against a shared
                                      repository without approval.
                                    </p>
                                    <code className="command-example">
                                      git filter-repo --path &lt;file&gt; --invert-paths
                                      {"\n"}git push --force-with-lease --all
                                    </code>
                                    <p>
                                      These commands are examples only. They
                                      are not executed by Digital Shadow AI.
                                      Rotate or revoke the credential first;
                                      history removal alone does not invalidate
                                      it.
                                    </p>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No security findings were detected in the inspected files.</p>
            )}
          </div>
        </section>
      )}

      <section className="features">
        <article className="feature">
          <span className="feature-icon">⌕</span>
          <h2>Discover</h2>
          <p>
            Find potential exposures across supported public
            repositories.
          </p>
        </article>

        <article className="feature">
          <span className="feature-icon">◈</span>
          <h2>Understand</h2>
          <p>
            See evidence and transparent risk assessments.
          </p>
        </article>

        <article className="feature">
          <span className="feature-icon">↗</span>
          <h2>Take control</h2>
          <p>
            Get practical steps to reduce your digital exposure.
          </p>
        </article>
      </section>

      <footer>
        DIGITAL SHADOW AI <span>·</span> BUILT BY NEURAL NEXUS
      </footer>
    </main>
  );
}
