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
   RATE LIMITING (ANTI-SPAM)
============================== */
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

/* ==============================
   SMTP TRANSPORTER
   (AUTH PLAIN corporate SMTP)
============================== */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: 587, // keep this

  secure: false,      // IMPORTANT for 587
  requireTLS: true,   // REQUIRED for corporate SMTP

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

/* ==============================
   EMAIL ENDPOINT
============================== */
app.post("/send-meeting", emailLimiter, async (req, res) => {
  try {
    const { title, dateTime, description, emails } = req.body;

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

    // Create meeting times
    const start = new Date(dateTime);
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
      subject: `Meeting Invitation: ${title}`,
      text: "You have received a meeting invitation.",
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
