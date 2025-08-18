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

console.log("📝 Monthly Personal Recap Combiner");

/**
 * Find month recap page - simple presentation layer lookup
 */
async function findMonthPage(monthNumber) {
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

  for (const page of resp.results) {
    const titleProp = page.properties["Month Recap"] || page.properties["Name"];
    const title = Array.isArray(titleProp?.title)
      ? titleProp.title.map((t) => t.plain_text).join("")
      : "";

    if (
      title === `${padded}. ${monthName} Recap` ||
      title === `Month ${monthNumber} Recap` ||
      title === `Month ${padded} Recap`
    ) {
      return page;
    }
  }
  return null;
}

/**
 * Parse sections from formatted text
 */
function parseSections(text) {
  if (!text) return {};

  const sections = {};
  const sectionPattern = /===== (.+?) =====([\s\S]*?)(?====== |$)/g;
  let match;

  while ((match = sectionPattern.exec(text)) !== null) {
    const sectionName = match[1].trim();
    const sectionContent = match[2].trim();
    sections[sectionName] = sectionContent;
  }

  return sections;
}

/**
 * Combine good and bad sections into personal recap
 */
function combineIntoRecap(goodText, badText) {
  if (!goodText && !badText) {
    return "No monthly recap data available.";
  }

  const goodSections = parseSections(goodText);
  const badSections = parseSections(badText);

  // Get all unique section names
  const allSectionNames = new Set([
    ...Object.keys(goodSections),
    ...Object.keys(badSections),
  ]);

  let combined = "";

  for (const sectionName of allSectionNames) {
    const goodContent = goodSections[sectionName];
    const badContent = badSections[sectionName];

    if (goodContent || badContent) {
      combined += `===== ${sectionName} =====\n`;

      // Add good items first
      if (goodContent) {
        combined += goodContent + "\n";
      }

      // Add bad items second (with separator if both exist)
      if (badContent) {
        if (goodContent) {
          combined += "\n";
        }
        combined += badContent + "\n";
      }

      combined += "\n";
    }
  }

  return combined.trim();
}

/**
 * Process month recap
 */
async function processMonth(monthNumber) {
  try {
    console.log(`\n📝 Processing Month ${monthNumber} Recap...`);

    const page = await findMonthPage(monthNumber);
    if (!page) {
      console.error(`❌ Could not find Month ${monthNumber} page`);
      return;
    }

    // Read existing processed columns
    const goodColumn = page.properties["Month - What went well"]?.rich_text;
    const badColumn =
      page.properties["Month - What didn't go so well"]?.rich_text;

    const goodText = goodColumn?.map((t) => t.plain_text).join("") || "";
    const badText = badColumn?.map((t) => t.plain_text).join("") || "";

    console.log(`📋 Good column: ${goodText ? "Found" : "Empty"}`);
    console.log(`📋 Bad column: ${badText ? "Found" : "Empty"}`);

    // Combine into recap
    const recapText = combineIntoRecap(goodText, badText);

    // Update the recap column
    await notion.pages.update({
      page_id: page.id,
      properties: {
        "Month - Personal Recap": {
          rich_text: [
            {
              text: { content: recapText.substring(0, 2000) },
            },
          ],
        },
      },
    });

    console.log("✅ Monthly Personal Recap updated successfully!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

async function main() {
  if (!MONTHS_DATABASE_ID) {
    console.error("❌ Missing RECAP_MONTHS_DATABASE_ID");
    process.exit(1);
  }

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

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
