const { Client } = require("@notionhq/client");
const readline = require("readline");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MONTHS_DATABASE_ID = process.env.MONTHS_RECAP_MONTHS_DATABASE_ID;

// CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function ask(question) {
  return new Promise((resolve) =>
    rl.question(question, (answer) => resolve(answer))
  );
}

console.log("📅 Personal Month Recap Updater");

async function findMonthRecapPage(monthNumber) {
  const padded = String(monthNumber).padStart(2, "0");
  const resp = await notion.databases.query({
    database_id: MONTHS_DATABASE_ID,
  });

  let target = null;
  for (const page of resp.results) {
    const titleProp = page.properties["Month Recap"] || page.properties["Name"];
    const title = Array.isArray(titleProp?.title)
      ? titleProp.title.map((t) => t.plain_text).join("")
      : "";
    if (
      title === `Month ${monthNumber} Recap` ||
      title === `Month ${padded} Recap` ||
      title === `Month ${monthNumber}` ||
      title === `Month ${padded}`
    ) {
      target = page;
      break;
    }
  }
  return target;
}

async function processMonth(monthNumber) {
  try {
    console.log(
      `\n🔄 Processing Month ${String(monthNumber).padStart(2, "0")} Recap`
    );

    const page = await findMonthRecapPage(monthNumber);
    if (!page) {
      console.error(`❌ Could not find Month ${monthNumber} Recap page`);
      return;
    }

    // Read formula-based summaries
    const monthTaskSummary =
      page.properties["Month Personal Task Summary"]?.formula?.string || "";
    const monthCalSummary =
      page.properties["Month Personal Cal Summary"]?.formula?.string || "";

    // Build recap content: simple concatenation of both monthly formulas
    let recap = "";
    if (monthTaskSummary && monthTaskSummary.trim()) {
      recap += monthTaskSummary.trim();
    }
    if (monthCalSummary && monthCalSummary.trim()) {
      recap += (recap ? "\n\n" : "") + monthCalSummary.trim();
    }

    if (!recap) {
      console.log("⚠️ No monthly summaries found to update");
      return;
    }

    // Update target property
    console.log("📤 Updating Notion 'Personal Recap 1'...");
    await notion.pages.update({
      page_id: page.id,
      properties: {
        "Personal Recap 1": {
          rich_text: [
            {
              text: { content: recap.substring(0, 2000) },
            },
          ],
        },
      },
    });

    console.log("✅ Month recap updated successfully!");
  } catch (err) {
    console.error("❌ Error processing month:", err.message);
  }
}

async function main() {
  if (!MONTHS_DATABASE_ID) {
    console.error("❌ Missing env MONTHS_RECAP_MONTHS_DATABASE_ID");
    process.exit(1);
  }

  console.log(
    "\nThis will update the 'Personal Recap 1' column using:\n- 'Month Personal Task Summary'\n- 'Month Personal Cal Summary'\n"
  );
  const input = await ask("? Which month to process? (1-12): ");
  const month = parseInt((input || "").trim(), 10) || 1;

  console.log(`\n📊 Processing Month: ${month}`);
  const confirm = await ask("Continue? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  await processMonth(month);
}

main().catch((e) => {
  console.error("❌ Unhandled error:", e);
  process.exit(1);
});
