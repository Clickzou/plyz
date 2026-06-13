import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.get("/health", (_req, res) => res.send("OK"));

app.post("/auth/send-magic-link", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });

    const redirectTo = "https://plyz.click/auth/callback";

    const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        type: "magiclink",
        email,
        options: { redirect_to: redirectTo },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(500).json({ error: "Supabase error", details: data });
    }

    const actionLink = data?.action_link;
    if (!actionLink) {
      return res.status(500).json({ error: "No action_link returned" });
    }

    const html = `
      <div style="text-align:center;font-family:Arial,Helvetica,sans-serif;">
        <h2>Connexion à votre compte Plyz</h2>
        <p style="margin:25px 0;">
          <a href="${actionLink}" target="_blank"
             style="background:#2FB88A;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;display:inline-block;font-weight:700;">
            👉 Se connecter à mon compte Plyz
          </a>
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Plyz – Connexion sécurisée à votre compte",
      html,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("✅ Email server running on port", port);
});
