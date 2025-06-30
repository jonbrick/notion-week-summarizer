// src/utils/pr-processor.js
// Handles PR calendar event processing and formatting

/**
 * Extract PR info from a calendar event
 */
function extractPRInfo(event) {
  const description = event.description || "";

  // Extract PR number and title
  const prMatch = description.match(/🔀 PR: (.+?)(?:\n|$)/);
  const prTitle = prMatch ? prMatch[1] : "Unknown PR";

  // Extract PR number from title
  const prNumberMatch = prTitle.match(/#(\d+)/);
  const prNumber = prNumberMatch ? prNumberMatch[1] : null;

  // Extract commits section as raw text
  const commitsSection = description.split("📝 Commits:\n")[1];
  const commits = commitsSection ? commitsSection.trim() : "";

  // Get date from event
  const date = event.start.date || event.start.dateTime?.split("T")[0];

  return {
    prNumber,
    prTitle,
    commits,
    date,
    summary: event.summary,
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

    // Extract actual commit count from summary (e.g., "3 commits")
    const commitCountMatch = event.summary.match(/(\d+) commits?/);
    const commitCount = commitCountMatch ? parseInt(commitCountMatch[1]) : 1;
    prGroups[key].totalCommits += commitCount;
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

  let output = "";

  prArray.forEach((pr, index) => {
    // Add spacing between PRs (except first one)
    if (index > 0) {
      output += "\n\n";
    }

    // PR Header with proper commit count
    output += `${pr.prTitle} - ${pr.totalCommits} commit${
      pr.totalCommits !== 1 ? "s" : ""
    }`;

    // Add date range if PR spans multiple days
    const uniqueDates = [...new Set(pr.dates)].sort();
    if (uniqueDates.length > 1) {
      output += ` (${uniqueDates[0]} to ${
        uniqueDates[uniqueDates.length - 1]
      })`;
    }

    output += "\n------\n";

    // Commits - display raw text
    pr.commits.forEach((commitText, idx) => {
      if (idx > 0) output += " ";
      output += commitText;
    });
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
