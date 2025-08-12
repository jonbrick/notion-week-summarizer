// src/utils/work-pr-processor.js
// Handles PR calendar event processing and formatting

/**
 * Remove timestamps from commit messages
 */
function removeTimestamps(commitText) {
  // Remove timestamps in format (HH:MM:SS) or (HH:MM)
  return commitText.replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)/g, "");
}

/**
 * Extract PR info from a calendar event
 * Each event now represents a single PR
 */
function extractPRInfo(event) {
  const description = event.description || "";

  // Extract PR number and title
  const prMatch = description.match(/🔀 PR: (.+?)(?:\n|$)/);
  const prTitle = prMatch ? prMatch[1] : "Unknown PR";

  // Extract PR number
  const prNumberMatch = prTitle.match(/#(\d+)/);
  const prNumber = prNumberMatch ? prNumberMatch[1] : null;

  // Extract commits section as raw text
  const commitsSection = description.split("📝 Commits:\n")[1];
  const commits = commitsSection ? commitsSection.trim() : "";

  // Get date from event
  const date =
    event.start.date ||
    (event.start.dateTime ? event.start.dateTime.split("T")[0] : null);

  // Extract commit count from summary
  const commitCountMatch = event.summary.match(/(\d+) commits?/);
  const commitCount = commitCountMatch ? parseInt(commitCountMatch[1]) : 1;

  return {
    prNumber,
    prTitle,
    commits,
    date,
    summary: event.summary,
    commitCount,
  };
}

/**
 * Group PR events by PR number/title
 */
function groupEventsByPR(events) {
  const prGroups = {};

  events.forEach((event) => {
    const prInfo = extractPRInfo(event);
    const key = prInfo.prNumber || prInfo.prTitle;

    if (!prGroups[key]) {
      prGroups[key] = {
        prTitle: prInfo.prTitle,
        prNumber: prInfo.prNumber,
        commits: [],
        dates: [],
        totalCommits: 0,
      };
    }

    // Add commits text if not already present
    if (prInfo.commits && !prGroups[key].commits.includes(prInfo.commits)) {
      prGroups[key].commits.push(prInfo.commits);
    }
    prGroups[key].dates.push(prInfo.date);
    prGroups[key].totalCommits += prInfo.commitCount;
  });

  return prGroups;
}

/**
 * Format PR summary for Notion
 */
function formatPRSummary(prGroups) {
  const prArray = Object.values(prGroups);

  if (prArray.length === 0) {
    return "No PR events this week.";
  }

  // Calculate totals for header
  const totalPRs = prArray.length;
  const totalCommits = prArray.reduce((sum, pr) => sum + pr.totalCommits, 0);
  const showCommits = totalPRs <= 10; // Hide commits if more than 10 PRs

  // Add header
  let output = `Work PRs (${totalPRs} PR${
    totalPRs !== 1 ? "s" : ""
  }, ${totalCommits} commit${totalCommits !== 1 ? "s" : ""}):`;

  // Add note if commits are hidden due to high PR count
  if (!showCommits) {
    output += `Note: Commit details hidden due to high PR count (${totalPRs} PRs)\n`;
  }

  prArray.forEach((pr, index) => {
    // Add divider between PRs (except first one)
    if (index > 0) {
      output += "---\n";
    }

    // PR Header with proper commit count
    output += `${pr.prTitle} [${pr.totalCommits} commit${
      pr.totalCommits !== 1 ? "s" : ""
    }]`;

    // Add date range if PR spans multiple days
    const uniqueDates = [...new Set(pr.dates)].sort();
    if (uniqueDates.length > 1) {
      output += ` (${uniqueDates[0]} to ${
        uniqueDates[uniqueDates.length - 1]
      })`;
    }

    output += "";

    // Only show commits if PR count is 10 or fewer
    if (showCommits) {
      // Commits - display raw text with timestamps removed (limit to first 5)
      pr.commits.forEach((commitText, idx) => {
        if (idx > 0) output += " ";
        let cleanCommitText = removeTimestamps(commitText);

        // Use regex to extract first 5 commits regardless of format (comma, newline, bullet)
        // Match patterns like: "• commit", "- commit", "commit,", "commit\n", etc.
        const commitRegex =
          /(?:^|[•\-*]\s*|,\s*|\n\s*)([^•\-*,\n]+?)(?=\s*[•\-*,\n]|$)/g;
        const matches = [];
        let match;

        while (
          (match = commitRegex.exec(cleanCommitText)) !== null &&
          matches.length < 5
        ) {
          const commit = match[1].trim();
          if (commit && commit.length > 0) {
            matches.push(commit);
          }
        }

        // If regex doesn't work well, fallback to simple splitting
        if (matches.length === 0) {
          const splits = cleanCommitText
            .split(/[,\n]/)
            .map((c) => c.replace(/^[•\-*\s]+/, "").trim())
            .filter((c) => c);
          matches.push(...splits.slice(0, 5));
        }

        // Add truncation notice if original text suggests more commits
        const hasMore =
          cleanCommitText.split(/[,\n•\-*]/).filter((c) => c.trim()).length > 5;

        output += matches.slice(0, 5).join(", ");

        if (hasMore) {
          output += ", ... (additional commits truncated)";
        }
      });
      output += "\n"; // Add newline after commits
    }
  });

  return output;
}

/**
 * Main function to process PR events
 */
async function processPREvents(events) {
  console.log(`📥 Processing ${events.length} PR events...`);

  // Group by PR
  const prGroups = groupEventsByPR(events);
  console.log(`📊 Grouped into ${Object.keys(prGroups).length} unique PRs`);

  // Format for Notion
  const formattedSummary = formatPRSummary(prGroups);

  return formattedSummary;
}

/**
 * Process work project events (PRs) for work calendar
 */
async function processWorkProjectEvents(workEvents, startDate, endDate) {
  console.log(`📥 Processing ${workEvents.length} work events for PRs...`);

  // If this is being called with calendar events that have descriptions (PR data calendar)
  // Then use the enhanced processing
  const hasDetailedPrData = workEvents.some(
    (event) =>
      event.description &&
      (event.description.includes("📝 Commits:") ||
        event.description.includes("🔀 PR:"))
  );

  if (hasDetailedPrData) {
    return processDetailedWorkPREvents(workEvents);
  }

  // Legacy processing for basic PR detection
  const prEvents = workEvents.filter((event) => {
    const summary = event.summary.toLowerCase();
    const description = (event.description || "").toLowerCase();

    return (
      summary.includes("pr") ||
      summary.includes("pull request") ||
      summary.includes("merge") ||
      description.includes("pr") ||
      description.includes("pull request") ||
      description.includes("merge")
    );
  });

  console.log(`📊 Found ${prEvents.length} PR-related events`);

  if (prEvents.length === 0) {
    return [];
  }

  // Extract PR information
  const prs = prEvents.map((event) => {
    const summary = event.summary || "";

    // Use the event title (summary) directly as the PR title
    let title = summary;

    return {
      title: title,
      date:
        event.start?.date ||
        (event.start?.dateTime
          ? event.start.dateTime.split("T")[0]
          : startDate),
      duration: event.duration || 0,
    };
  });

  return prs;
}

/**
 * Process detailed work PR events with commit information
 */
function processDetailedWorkPREvents(events) {
  console.log(`📥 Processing ${events.length} detailed work PR events...`);

  // Group by PR using the same logic as regular PR processor
  const prGroups = groupEventsByPR(events);
  console.log(`📊 Grouped into ${Object.keys(prGroups).length} unique PRs`);

  // Format for work PR summary with commit details
  return formatWorkPRSummary(prGroups);
}

/**
 * Format work PR summary with commits for Notion
 */
function formatWorkPRSummary(prGroups) {
  const prArray = Object.values(prGroups);

  if (prArray.length === 0) {
    return "No work project commits this week.";
  }

  // Sort PRs by total commits (most active first)
  prArray.sort((a, b) => b.totalCommits - a.totalCommits);

  // Calculate totals for header
  const totalPRs = prArray.length;
  const totalCommits = prArray.reduce((sum, pr) => sum + pr.totalCommits, 0);

  // Add header in the format: Work PRs (7 PRs, 34 commits):
  let output = `Work PRs (${totalPRs} PR${
    totalPRs !== 1 ? "s" : ""
  }, ${totalCommits} commit${totalCommits !== 1 ? "s" : ""}):\n`;
  output += "";

  prArray.forEach((pr, index) => {
    // Add divider between PRs (except first one)
    if (index > 0) {
      output += "---\n";
    }

    // Clean the PR title (remove "brain-app -" prefix if present)
    let cleanTitle = pr.prTitle.replace(/^brain-app\s*-\s*/i, "");

    // PR Header: Title [X commits]
    output += `${cleanTitle} [${pr.totalCommits} commit${
      pr.totalCommits !== 1 ? "s" : ""
    }]\n`;

    // Process commits - combine all commit text and extract individual commits
    let allCommitText = pr.commits.join(" ");

    // Remove timestamps
    allCommitText = removeTimestamps(allCommitText);

    // Extract individual commits (limit to 5)
    const commits = extractCommitsFromText(allCommitText);
    const commitsToShow = commits.slice(0, 5);

    if (commitsToShow.length > 0) {
      output += commitsToShow.join(", ");

      // Add truncation notice if there are more commits
      if (commits.length > 5) {
        output += ", ... (additional commits truncated)";
      }
    }

    output += "\n";
  });

  return output.trim();
}

/**
 * Extract individual commits from combined commit text
 */
function extractCommitsFromText(commitText) {
  if (!commitText) return [];

  // Try multiple approaches to split commits
  let commits = [];

  // First try: split by common delimiters and clean up
  const rawCommits = commitText
    .split(/[,\n•\-*]/)
    .map((commit) => commit.trim())
    .filter((commit) => commit.length > 0)
    .filter((commit) => !commit.match(/^\d+:\d+/)) // Remove any remaining timestamps
    .filter((commit) => commit.length > 10); // Filter out very short fragments

  // Clean up each commit message
  commits = rawCommits
    .map((commit) => {
      // Remove leading bullets or dashes
      commit = commit.replace(/^[•\-*\s]+/, "");
      // Remove trailing punctuation if it's just a period or comma
      commit = commit.replace(/[.,]$/, "");
      // Trim whitespace
      return commit.trim();
    })
    .filter((commit) => commit.length > 0);

  return commits;
}

module.exports = {
  processPREvents,
  processWorkProjectEvents,
};
