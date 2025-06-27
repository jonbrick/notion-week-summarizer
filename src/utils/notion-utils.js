// Notion utilities for week summarizer scripts

/**
 * Update multiple summary fields on a Notion page.
 * @param {object} notion - Notion client
 * @param {string} pageId - Notion page ID
 * @param {object} summaryUpdates - { fieldName: summaryText }
 */
async function updateAllSummaries(notion, pageId, summaryUpdates) {
  const properties = {};

  // Convert summaries to Notion property format
  for (const [fieldName, summary] of Object.entries(summaryUpdates)) {
    properties[fieldName] = {
      rich_text: [
        {
          text: {
            content: summary,
          },
        },
      ],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
}

/**
 * Find the Notion recap page for a given week number.
 * @param {object} notion - Notion client
 * @param {string} recapDatabaseId - Notion database ID
 * @param {number} targetWeek - Week number
 * @returns {object|null} - The recap page object or null
 */
async function findWeekRecapPage(notion, recapDatabaseId, targetWeek) {
  const recapPages = await notion.databases.query({
    database_id: recapDatabaseId,
  });

  let targetWeekPage = null;
  const paddedWeek = targetWeek.toString().padStart(2, "0");

  for (const page of recapPages.results) {
    const titleProperty = page.properties["Week Recap"];
    if (titleProperty && titleProperty.title) {
      const title = titleProperty.title.map((t) => t.plain_text).join("");
      if (
        title === `Week ${targetWeek} Recap` ||
        title === `Week ${paddedWeek} Recap` ||
        title === `Week ${targetWeek}` ||
        title === `Week ${paddedWeek}`
      ) {
        targetWeekPage = page;
        break;
      }
    }
  }
  return targetWeekPage;
}

module.exports = {
  updateAllSummaries,
  findWeekRecapPage,
};
