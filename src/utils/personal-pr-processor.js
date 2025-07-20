// src/utils/personal-pr-processor.js
// Handles personal project commits grouped by app/repo

/**
 * Extract app/project info from a calendar event
 */
function extractProjectInfo(event) {
  const summary = event.summary || "";
  const description = event.description || "";

  // Try to extract project name from summary first
  // Common patterns: "3 commits - my-app", "my-app: 3 commits", etc.
  let projectName = "Unknown Project";

  // Pattern 1: "X commits - project-name"
  const dashPattern = summary.match(/\d+\s+commits?\s*-\s*(.+)/i);
  if (dashPattern) {
    projectName = dashPattern[1].trim();
  }
  // Pattern 2: "project-name: X commits"
  else if (summary.includes(":")) {
    projectName = summary.split(":")[0].trim();
  }
  // Pattern 3: Just use the summary if it doesn't match patterns
  else if (!summary.match(/^\d+\s+commits?$/i)) {
    projectName =
      summary.replace(/\d+\s+commits?/i, "").trim() || "Unknown Project";
  }

  // Extract commits section from description
  const commitsSection = description.split("📝 Commits:\n")[1];
  const commits = commitsSection ? commitsSection.trim() : "";

  // Get date from event
  const date = event.start.date || event.start.dateTime?.split("T")[0];

  // Extract commit count from summary
  const commitCountMatch = summary.match(/(\d+)\s+commits?/i);
  const commitCount = commitCountMatch ? parseInt(commitCountMatch[1]) : 1;

  return {
    projectName,
    commits,
    date,
    summary,
    commitCount,
  };
}

/**
 * Remove timestamps from commit messages
 */
function removeTimestamps(commitText) {
  return commitText.replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)/g, "");
}

/**
 * Parse individual commits from commit text
 */
function parseCommits(commitText) {
  if (!commitText) return [];

  // Split by newlines and filter out empty lines
  const lines = commitText.split("\n").filter((line) => line.trim());

  return lines.map((line) => {
    // Remove bullet points if present
    let cleanLine = line.replace(/^[\s•\-*]+/, "").trim();
    // Remove timestamps
    cleanLine = removeTimestamps(cleanLine);
    return cleanLine;
  });
}

/**
 * Group events by project
 */
function groupEventsByProject(events) {
  const projectGroups = {};

  events.forEach((event) => {
    const projectInfo = extractProjectInfo(event);
    const key = projectInfo.projectName;

    if (!projectGroups[key]) {
      projectGroups[key] = {
        projectName: projectInfo.projectName,
        commits: [],
        dates: [],
        totalCommits: 0,
      };
    }

    // Parse and add individual commits
    const parsedCommits = parseCommits(projectInfo.commits);
    projectGroups[key].commits.push(...parsedCommits);
    projectGroups[key].dates.push(projectInfo.date);
    projectGroups[key].totalCommits += projectInfo.commitCount;
  });

  return projectGroups;
}

/**
 * Format personal project summary for Notion
 */
function formatPersonalProjectSummary(projectGroups) {
  const projectArray = Object.values(projectGroups);

  if (projectArray.length === 0) {
    return "No personal project commits this week.";
  }

  // Sort projects by total commits (most active first)
  projectArray.sort((a, b) => b.totalCommits - a.totalCommits);

  // Calculate totals for header
  const totalProjects = projectArray.length;
  const totalCommits = projectArray.reduce(
    (sum, proj) => sum + proj.totalCommits,
    0
  );

  // Add header
  let output = `Personal Projects (${totalProjects} ${
    totalProjects === 1 ? "app" : "apps"
  }, ${totalCommits} ${totalCommits === 1 ? "commit" : "commits"}):\n`;
  output += "------\n";

  projectArray.forEach((project, index) => {
    // Add divider between projects (except first one)
    if (index > 0) {
      output += "\n";
    }

    // Project header
    output += `${project.projectName} (${project.totalCommits} ${
      project.totalCommits === 1 ? "commit" : "commits"
    }):\n`;

    // Show first 5 commits, then summarize the rest
    const commitsToShow = project.commits.slice(0, 5);
    commitsToShow.forEach((commit) => {
      output += `• ${commit}\n`;
    });

    // If there are more commits, indicate how many
    if (project.commits.length > 5) {
      output += `• ... (${project.commits.length - 5} more)\n`;
    }
  });

  return output.trim();
}

/**
 * Main function to process personal project events
 */
async function processPersonalProjectEvents(events) {
  console.log(`📥 Processing ${events.length} personal project events...`);

  // Group by project
  const projectGroups = groupEventsByProject(events);
  console.log(`📊 Grouped into ${Object.keys(projectGroups).length} projects`);

  // Log project summary
  Object.values(projectGroups).forEach((project) => {
    console.log(`   - ${project.projectName}: ${project.totalCommits} commits`);
  });

  // Format for Notion
  const formattedSummary = formatPersonalProjectSummary(projectGroups);

  return formattedSummary;
}

module.exports = {
  extractProjectInfo,
  groupEventsByProject,
  formatPersonalProjectSummary,
  processPersonalProjectEvents,
};
