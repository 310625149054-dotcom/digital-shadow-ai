
import { useState } from "react";
import "./App.css";

const REMEDIATION_STEPS = [
  "Review and confirm the finding.",
  "Revoke the credential if it is genuine.",
  "Rotate or replace it.",
  "Move the secret to an environment variable and remove it from source code.",
  "Remove the secret from Git history when appropriate.",
  "Rescan to check whether the finding is still detected.",
];

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

export default function App() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checklistState, setChecklistState] = useState({});

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
    event.preventDefault();

    const cleanUsername = username.trim();

    // Validate GitHub username
    const valid =
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(
        cleanUsername
      );

    if (!valid) {
      setReport(null);
      setChecklistState({});
      setMessage("Please enter a valid GitHub username.");
      return;
    }

    setLoading(true);
    setReport(null);
    setChecklistState({});
    setMessage("Connecting to GitHub...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/scans",
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

                            return (
                              <li key={step}>
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
                                  <span>{step}</span>
                                </label>
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
