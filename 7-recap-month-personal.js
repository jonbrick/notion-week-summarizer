const { Client } = require("@notionhq/client");
const readline = require("readline");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MONTHS_DATABASE_ID = process.env.RECAP_MONTHS_DATABASE_ID;

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
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = monthNames[monthNumber - 1];

  const resp = await notion.databases.query({
    database_id: MONTHS_DATABASE_ID,
  });

  let target = null;
  for (const page of resp.results) {
    const titleProp = page.properties["Month Recap"] || page.properties["Name"];
    const title = Array.isArray(titleProp?.title)
      ? titleProp.title.map((t) => t.plain_text).join("")
      : "";

    // Check various possible formats
    if (
      title === `${padded}. ${monthName} Recap` ||
      title === `Month ${monthNumber} Recap` ||
      title === `Month ${padded} Recap` ||
      title === `Month ${monthNumber}` ||
      title === `Month ${padded}` ||
      (title.includes(`${padded}.`) && title.includes(monthName))
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

    // Read the two source properties (they are formulas, not rich text)
    const monthWentWellProp = page.properties["Month - What went well"];
    const monthDidntGoWellProp =
      page.properties["Month - What didn't go so well"];

    let monthWentWell = "";
    let monthDidntGoWell = "";

    // Handle formula property extraction
    if (monthWentWellProp?.formula?.string) {
      monthWentWell = monthWentWellProp.formula.string.trim();
    }

    if (monthDidntGoWellProp?.formula?.string) {
      monthDidntGoWell = monthDidntGoWellProp.formula.string.trim();
    }

    console.log(`📋 Found "What went well": ${monthWentWell ? "YES" : "NO"}`);
    console.log(
      `📋 Found "What didn't go so well": ${monthDidntGoWell ? "YES" : "NO"}`
    );

    // Build combined recap content
    let recap = "";
    if (monthWentWell && monthWentWell.trim()) {
      recap += monthWentWell.trim();
    }
    if (monthDidntGoWell && monthDidntGoWell.trim()) {
      recap += (recap ? "\n\n" : "") + monthDidntGoWell.trim();
    }

    if (!recap) {
      console.log("⚠️ No monthly recap data found to update");
      return;
    }

    // Update target property
    console.log("📤 Updating Notion 'Month Recap - Personal'...");
    await notion.pages.update({
      page_id: page.id,
      properties: {
        "Month Recap - Personal": {
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
    console.error("❌ Missing env RECAP_MONTHS_DATABASE_ID");
    process.exit(1);
  }

  console.log(
    "\nThis will update the 'Month Recap - Personal' column using:\n- 'Month - What went well'\n- 'Month - What didn't go so well'\n"
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
