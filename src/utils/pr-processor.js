// src/utils/pr-processor.js
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
 * Handles both single PRs and comma-separated multiple PRs
 */
function extractPRInfo(event) {
  const description = event.description || "";

  // Extract PR number and title
  const prMatch = description.match(/🔀 PR: (.+?)(?:\n|$)/);
  const prTitle = prMatch ? prMatch[1] : "Unknown PR";

  // Check if this contains multiple PRs (comma-separated)
  const prNumbers = [];
  const prNumberMatches = prTitle.matchAll(/#(\d+)/g);
  for (const match of prNumberMatches) {
    prNumbers.push(match[1]);
  }

  // Extract commits section as raw text
  const commitsSection = description.split("📝 Commits:\n")[1];
  const commits = commitsSection ? commitsSection.trim() : "";

  // Get date from event
  const date = event.start.date || event.start.dateTime?.split("T")[0];

  // If multiple PRs found, split them
  if (prNumbers.length > 1) {
    return prNumbers.map((prNumber, index) => {
      // Try to extract individual PR titles by splitting on commas
      const prTitleParts = prTitle.split(",").map((part) => part.trim());
      let individualPRTitle = prTitle; // fallback to full title

      // Find the part that contains this PR number
      const matchingPart = prTitleParts.find((part) =>
        part.includes(`#${prNumber}`)
      );
      if (matchingPart) {
        individualPRTitle = matchingPart;
      }

      return {
        prNumber,
        prTitle: individualPRTitle,
        commits,
        date,
        summary: event.summary,
        isMultiPR: true,
        multiPRIndex: index,
        multiPRTotal: prNumbers.length,
      };
    });
  }

  // Single PR case
  return [
    {
      prNumber: prNumbers[0] || null,
      prTitle,
      commits,
      date,
      summary: event.summary,
      isMultiPR: false,
    },
  ];
}

/**
 * Group PR events by PR number/title
 */
function groupEventsByPR(events) {
  const prGroups = {};

  events.forEach((event) => {
    const prInfoArray = extractPRInfo(event); // Now returns an array

    prInfoArray.forEach((prInfo) => {
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

      // For multi-PR events, divide the commit count by the number of PRs
      // Extract actual commit count from summary (e.g., "3 commits")
      const commitCountMatch = event.summary.match(/(\d+) commits?/);
      let commitCount = commitCountMatch ? parseInt(commitCountMatch[1]) : 1;

      // If this is a multi-PR event, divide commits equally among PRs
      if (prInfo.isMultiPR) {
        commitCount = Math.ceil(commitCount / prInfo.multiPRTotal);
      }

      prGroups[key].totalCommits += commitCount;
    });
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
  let output = `PRs (${totalPRs} PR${
    totalPRs !== 1 ? "s" : ""
  }, ${totalCommits} commit${totalCommits !== 1 ? "s" : ""}):\n`;
  output += "------\n";

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

    output += "\n";

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

module.exports = {
  extractPRInfo,
  groupEventsByPR,
  formatPRSummary,
  processPREvents,
};
