require("dotenv").config();

const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const validator = require("validator");
const rateLimit = require("express-rate-limit");

const app = express();

/* ==============================
   BASIC EXPRESS SETUP
============================== */
app.use(express.json());

app.use(cors({
  origin: "*" // change to your domain when deploying
}));

/* ==============================
   RATE LIMITING FOR EMAIL ENDPOINT
============================== */
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

/* ==============================
   SMTP TRANSPORTER
============================== */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: 587, 

  secure: false,     
  requireTLS: true,   

  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  },

  name: process.env.SMTP_HELO_DOMAIN,

  tls: {
    rejectUnauthorized: false
  }
});

/* ==============================
   TEST SMTP CONNECTION
============================== */
transporter.verify()
  .then(() => console.log("✅ SMTP READY"))
  .catch(err => console.error("❌ SMTP ERROR:", err));

/* ==============================
   ICS HELPERS
============================== */
function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function cleanText(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function generateICS({ title, start, end, description, organizer }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FlashNeo//Meeting Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).substring(2)}@flashneo`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${cleanText(title)}`,
    `DESCRIPTION:${cleanText(description)}`,
    `ORGANIZER;CN=Flash Neo:mailto:${organizer}`,
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  // ICS spec requires CRLF line endings
  return lines.join("\r\n");
}

/**
 * Generate "Add to Calendar" URLs for popular services (no API keys needed)
 */
function generateCalendarURLs({ title, start, end, description, location }) {
  const startStr = formatICSDate(start);
  const endStr = formatICSDate(end);
  const encodedTitle = encodeURIComponent(title);
  const encodedDesc = encodeURIComponent(description || "");
  const encodedLoc = encodeURIComponent(location || "");

  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${startStr}/${endStr}&details=${encodedDesc}&location=${encodedLoc}`,
    outlook: `https://outlook.live.com/calendar/0/action/compose?subject=${encodedTitle}&startdt=${start.toISOString()}&enddt=${end.toISOString()}&body=${encodedDesc}&location=${encodedLoc}`,
    yahoo: `https://calendar.yahoo.com/?v=60&title=${encodedTitle}&st=${startStr}&et=${endStr}&desc=${encodedDesc}&in_loc=${encodedLoc}`
  };
}

/**
 * Create a Date object from date/time in a specific timezone
 * @param {number} year 
 * @param {number} month (1-12)
 * @param {number} day 
 * @param {number} hour 
 * @param {number} minute 
 * @param {string} timeZone - IANA timezone string
 * @returns {Date}
 */
function createDateInTimezone(year, month, day, hour, minute, timeZone) {
  // Create a date string in ISO format
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  // Parse it as a local date first
  const date = new Date(dateString);
  
  // Format this date in both UTC and the target timezone
  const utcString = date.toLocaleString('en-US', { timeZone: 'UTC', hour12: false });
  const tzString = date.toLocaleString('en-US', { timeZone: timeZone, hour12: false });
  
  // Calculate the difference
  const utcTime = new Date(utcString).getTime();
  const tzTime = new Date(tzString).getTime();
  const offset = utcTime - tzTime;
  
  // Adjust the original date by the offset
  return new Date(date.getTime() + offset);
}

/* ==============================
   EMAIL ENDPOINT
============================== */
app.post("/send-meeting", emailLimiter, async (req, res) => {
  try {
    const { title, dateTime, description, emails, password, timeZone } = req.body;

    if (!title || !dateTime || !emails) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Validate email list
    const emailList = emails
      .split(",")
      .map(e => e.trim())
      .filter(e => validator.isEmail(e));

    if (emailList.length === 0) {
      return res.status(400).json({ error: "Invalid emails" });
    }

    // Use provided timezone or fallback to server timezone
    const selectedTimeZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse the dateTime string (format: "YYYY-MM-DD HH:mm")
    const [datePart, timePart] = dateTime.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    
    // Create the start date in the selected timezone
    const start = createDateInTimezone(year, month, day, hour, minute, selectedTimeZone);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    // Build description with password if provided
    const fullDescription = description
      ? (password ? `${description}\nPassword: ${password}` : description)
      : (password ? `Password: ${password}` : "");

    // Build rich calendar description with all meeting details
    const calendarDescription = [
      `Room ID: ${title}`,
      password ? `Password: ${password}` : null,
      description ? `Description: ${description}` : null,
      ``,
      `Join meeting: https://flashneo.com/meeting`
    ].filter(line => line !== null).join("\n");

    // Generate ICS content
    const icsContent = generateICS({
      title: "Meeting",
      start,
      end,
      description: calendarDescription,
      organizer: process.env.SMTP_USERNAME
    });

    // Generate "Add to Calendar" URLs
    const calendarURLs = generateCalendarURLs({
      title: "Meeting",
      start,
      end,
      description: calendarDescription,
      location: "https://flashneo.com/meeting"
    });

    const formattedDate = start.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: selectedTimeZone });
    const formattedStartTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: selectedTimeZone });
    const formattedEndTime = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: selectedTimeZone });
    const tzLabel = `${selectedTimeZone.split('/').pop().replace(/_/g, ' ')} (${selectedTimeZone})`;

    // Send email
    await transporter.sendMail({
      from: `"Flash Neo" <${process.env.SMTP_USERNAME}>`,
      to: emailList,
      subject: "You have a new meeting invitation",

      // Plain text fallback
      text: `You have received a meeting invitation.

Meeting Details:

Room ID: ${title}${password ? `\nPassword: ${password}` : ''}
Date: ${formattedDate}
Time: ${formattedStartTime} - ${formattedEndTime}
Timezone: ${tzLabel}
Description: ${description || 'N/A'}

Add to Calendar:
- Google Calendar: ${calendarURLs.google}
- Outlook: ${calendarURLs.outlook}
- Yahoo: ${calendarURLs.yahoo}

Join meeting: https://flashneo.com/meeting`,

      // HTML email with Add to Calendar buttons (dark mode safe)
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; color: #333333; padding: 24px;">
          <h2 style="color: #1a73e8;">Meeting Invitation</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Room ID:</td><td style="padding: 8px 0; color: #333333;">${title}</td></tr>
            ${password ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Password &#128274;:</td><td style="padding: 8px 0; color: #333333;">${password}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Date:</td><td style="padding: 8px 0; color: #333333;">${formattedDate}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Time:</td><td style="padding: 8px 0; color: #333333;">${formattedStartTime} - ${formattedEndTime}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Timezone:</td><td style="padding: 8px 0; color: #333333;">${tzLabel}</td></tr>
            ${description ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #333333;">Description:</td><td style="padding: 8px 0; color: #333333;">${description}</td></tr>` : ''}
          </table>

          <p style="font-weight: bold; margin: 20px 0 12px; color: #333333;">Add to Calendar:</p>
          <div style="margin-bottom: 20px;">
            <a href="${calendarURLs.google}" target="_blank" style="display: inline-block; padding: 10px 20px; margin: 4px; background-color: #4285F4; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 14px;">Google Calendar</a>
            <a href="${calendarURLs.outlook}" target="_blank" style="display: inline-block; padding: 10px 20px; margin: 4px; background-color: #0078D4; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 14px;">Outlook</a>
            <a href="${calendarURLs.yahoo}" target="_blank" style="display: inline-block; padding: 10px 20px; margin: 4px; background-color: #720e9e; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 14px;">Yahoo</a>
          </div>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
          <p style="color: #333333;">You may join the meeting here: <a href="https://flashneo.com/meeting" style="color: #1a73e8;">https://flashneo.com/meeting</a></p>
        </div>
      `,

      // .ics attachment as fallback (Apple Mail, desktop clients)
      attachments: [
        {
          filename: "meeting.ics",
          content: Buffer.from(icsContent, "utf-8"),
          contentType: "text/calendar; charset=utf-8; method=PUBLISH"
        }
      ]
    });

    res.json({ success: true });

  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

/* ==============================
   START SERVER
============================== */
app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
