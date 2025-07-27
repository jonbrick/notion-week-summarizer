// Notion utilities for week summarizer scripts

/**
 * Update multiple summary fields on a Notion page.
 * @param {object} notion - Notion client
 * @param {string} pageId - Notion page ID
 * @param {object} summaryUpdates - { fieldName: summaryText }
 */
async function updateAllSummaries(notion, pageId, summaryUpdates) {
  try {
    // Validate that all requested properties exist on the page before attempting update
    const page = await notion.pages.retrieve({ page_id: pageId });

    // Check if all requested properties exist
    const missingProperties = Object.keys(summaryUpdates).filter(
      (propName) => !page.properties[propName]
    );

    if (missingProperties.length > 0) {
      console.error(`❌ Missing properties: ${missingProperties.join(", ")}`);
      console.error(
        `Available properties: ${Object.keys(page.properties).join(", ")}`
      );
      throw new Error(`Properties not found: ${missingProperties.join(", ")}`);
    }

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

    console.log(`✅ Successfully updated page properties`);
  } catch (error) {
    console.error(`❌ Error in updateAllSummaries:`, error.message);
    if (error.code === "validation_error") {
      console.error(
        `🔍 This suggests the property name might be incorrect or the property type doesn't match`
      );
    }
    throw error;
  }
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
