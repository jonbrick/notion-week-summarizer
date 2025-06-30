// test-pipeline.js
// Quick test of the new pipeline

const { processCalendarEvents } = require("./src/utils/event-processor");

// Real Google Calendar API format based on your actual data
const sampleEvents = [
  {
    kind: "calendar#event",
    etag: '"3500163736492830"',
    id: "2gea1s86b5ghu3n2dmi75h573f_20250623T140000Z",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2025-04-16T12:53:47.000Z",
    updated: "2025-06-16T13:51:08.246Z",
    summary: "UX Platform Standup & Planning",
    description:
      'Cristina Buenahora Bustamante is inviting you to a scheduled Zoom meeting.<br><br>Topic: UX Platform Standup<br>Time: Apr 13, 2025 10:00 AM Eastern Time (US and Canada)<br>Join Zoom Meeting<br><a href="https://www.google.com/url?q=https://us06web.zoom.us/j/88548985111?pwd%3DbliVt2BQZFQwjpiajJtJpUD51qBViI.1&amp;sa=D&amp;source=calendar&amp;ust=1745156487706749&amp;usg=AOvVaw2G2soEa4s7L72G_SLhk5WT" target="_blank">https://us06web.zoom.us/j/88548985111?pwd=bliVt2BQZFQwjpiajJtJpUD51qBViI.1</a>',
    location:
      "https://us06web.zoom.us/j/88548985111?pwd=bliVt2BQZFQwjpiajJtJpUD51qBViI.1",
    creator: {
      email: "cristina.buenahora@cortex.io",
    },
    organizer: {
      email: "chelsea.hohmann@cortex.io",
    },
    start: {
      dateTime: "2025-06-23T10:00:00-04:00",
      timeZone: "America/Chicago",
    },
    end: {
      dateTime: "2025-06-23T10:30:00-04:00",
      timeZone: "America/Chicago",
    },
    iCalUID: "2gea1s86b5ghu3n2dmi75h573f_R20250616T140000@google.com",
    sequence: 0,
    attendees: [
      {
        email: "jon.brick@cortex.io",
        self: true,
        optional: true,
        responseStatus: "accepted",
      },
      {
        email: "chelsea.hohmann@cortex.io",
        organizer: true,
        responseStatus: "accepted",
      },
      {
        email: "eng-team-ux-platform@cortex.io",
        displayName: "UX Platform Team",
        responseStatus: "needsAction",
      },
    ],
    reminders: {
      useDefault: true,
    },
    eventType: "default",
  },
  {
    kind: "calendar#event",
    etag: '"3502262565454558"',
    id: "0vmpacahkk28nmd72p58mnst0c",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2025-06-23T21:32:24.000Z",
    updated: "2025-06-28T17:21:22.727Z",
    summary: "Dashboard building ux",
    description:
      "Working on the new dashboard UX improvements - focusing on layout and user flow",
    colorId: "2",
    creator: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    organizer: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    start: {
      dateTime: "2025-06-23T09:00:00-04:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2025-06-23T13:00:00-04:00",
      timeZone: "America/New_York",
    },
    iCalUID: "0vmpacahkk28nmd72p58mnst0c@google.com",
    sequence: 0,
    attendees: [], // Solo work - no attendees
    reminders: {
      useDefault: true,
    },
    eventType: "default",
  },
  {
    kind: "calendar#event",
    etag: '"3502262565454559"',
    id: "1vmpacahkk28nmd72p58mnst0c",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2025-06-23T21:32:24.000Z",
    updated: "2025-06-28T17:21:22.727Z",
    summary: "Dashboard building ux", // Same title!
    description:
      "Continuing dashboard work - implementing the responsive design components",
    colorId: "2",
    creator: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    organizer: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    start: {
      dateTime: "2025-06-23T14:00:00-04:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2025-06-23T18:00:00-04:00",
      timeZone: "America/New_York",
    },
    iCalUID: "1vmpacahkk28nmd72p58mnst0c@google.com",
    sequence: 0,
    attendees: [], // Solo work - no attendees
    reminders: {
      useDefault: true,
    },
    eventType: "default",
  },
  {
    kind: "calendar#event",
    etag: '"3501374714892999"',
    id: "madison_jon_sync_recurring_123",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2024-10-22T14:11:10.000Z",
    updated: "2025-06-23T14:02:37.446Z",
    summary: "Madison <> Jon Weekly",
    description:
      "Weekly sync between Madison and Jon to discuss project updates, blockers, and alignment on UX initiatives.<br><br>Agenda:<br>- Review previous week's deliverables<br>- Discuss current sprint goals<br>- Identify any blockers or dependencies<br>- Plan upcoming design reviews",
    creator: {
      email: "madison.unell@cortex.io",
    },
    organizer: {
      email: "madison.unell@cortex.io",
    },
    start: {
      dateTime: "2025-06-23T15:30:00-04:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2025-06-23T16:00:00-04:00",
      timeZone: "America/New_York",
    },
    iCalUID: "madison_jon_sync_recurring_123@google.com",
    sequence: 2,
    attendees: [
      {
        email: "madison.unell@cortex.io",
        organizer: true,
        responseStatus: "accepted",
      },
      {
        email: "jon.brick@cortex.io",
        self: true,
        responseStatus: "accepted",
      },
    ],
    extendedProperties: {
      shared: {
        meetingId: "86203366999",
        zmMeetingNum: "86203366999",
      },
    },
    conferenceData: {
      entryPoints: [
        {
          entryPointType: "video",
          uri: "https://us06web.zoom.us/j/86203366999?pwd=somepassword",
          meetingCode: "86203366999",
          passcode: "123456",
        },
      ],
    },
    reminders: {
      useDefault: true,
    },
    eventType: "default",
  },
  {
    kind: "calendar#event",
    etag: '"3501539866761566"',
    id: "o0pgs39baahnlo3lkr9ikbvm12_20250623T160000Z",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2024-11-19T12:35:03.000Z",
    updated: "2025-06-24T12:58:53.380Z",
    summary: "🥗 Lunch (Can be moved!)",
    description: "",
    colorId: "8",
    creator: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    organizer: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    start: {
      dateTime: "2025-06-23T12:00:00-04:00",
      timeZone: "America/New_York",
    },
    end: {
      dateTime: "2025-06-23T13:00:00-04:00",
      timeZone: "America/New_York",
    },
    iCalUID: "o0pgs39baahnlo3lkr9ikbvm12@google.com",
    sequence: 6,
    reminders: {
      useDefault: true,
    },
    eventType: "default",
  },
  {
    kind: "calendar#event",
    etag: '"3478275757758000"',
    id: "smei7n2bpin5tnagh287ue2cns_20250623",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=...",
    created: "2025-02-09T21:51:18.000Z",
    updated: "2025-02-09T21:51:18.879Z",
    summary: "Home",
    description: "",
    creator: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    organizer: {
      email: "jon.brick@cortex.io",
      self: true,
    },
    start: {
      date: "2025-06-23", // All-day events use 'date' not 'dateTime'
    },
    end: {
      date: "2025-06-24",
    },
    transparency: "transparent",
    visibility: "public",
    iCalUID: "smei7n2bpin5tnagh287ue2cns@google.com",
    sequence: 0,
    reminders: {
      useDefault: false,
    },
    workingLocationProperties: {
      type: "homeOffice",
      homeOffice: {},
    },
    eventType: "workingLocation", // This should be filtered out
  },
];

console.log("🧪 Testing Event Processing Pipeline\n");

try {
  const result = processCalendarEvents(sampleEvents);

  console.log("\n🎯 Final AI Input:");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("❌ Test failed:", error);
}
