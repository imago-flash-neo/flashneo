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
  return String(str).replace(/[\r\n]/g, " ");
}

function generateICS({ title, start, end, description }) {
  return `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//FlashNeo//Meeting Scheduler//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:${Date.now()}@flashneo
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(start)}
DTEND:${formatICSDate(end)}
SUMMARY:${cleanText(title)}
DESCRIPTION:${cleanText(description)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
`.trim();
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

    // Generate ICS content
    const icsContent = generateICS({
      title,
      start,
      end,
      description
    });
    
    // Send email
    await transporter.sendMail({
      from: `"Flash Neo" <${process.env.SMTP_USERNAME}>`,
      to: emailList,
      subject: "You have a new meeting invitation",
      text: `You have received a meeting invitation.

Meeting Details:

Room ID: ${title}${password ? `\nPassword: ${password} 🔒` : ''}
Date: ${start.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: selectedTimeZone })}
Time: ${start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: selectedTimeZone })} - ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: selectedTimeZone })}
Timezone: ${selectedTimeZone.split('/').pop().replace(/_/g, ' ')} (${selectedTimeZone})
Description: ${description}

You may join the meeting following the link: https://flashneo.com/meeting`,

      attachments: [
        {
          filename: "meeting.ics",
          content: icsContent,
          contentType: "text/calendar"
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
