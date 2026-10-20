
import { useState } from "react";
import "./App.css";

export default function App() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

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
      setMessage("Please enter a valid GitHub username.");
      return;
    }

    setLoading(true);
    setReport(null);
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
                {report.summary?.findingsCount ?? 0}
              </strong>
            </article>

            <article className="summary-card">
              <span>Risk assessment</span>
              <strong>
                {["high", "medium"].includes(report.summary?.riskLevel)
                  ? report.summary.riskLevel
                  : "Not assessed"}
              </strong>
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

            {report.findings?.length > 0 && (
              <ul>
                {report.findings.map((finding) => (
                  <li key={finding.id}>
                    <strong>{finding.severity}</strong>
                    {" — "}
                    {finding.category}
                  </li>
                ))}
              </ul>
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
