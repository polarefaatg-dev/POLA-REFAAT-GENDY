import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for notifications
  app.post("/api/notify", async (req, res) => {
    try {
      const { type, subject, message, data } = req.body;
      const targetEmail = process.env.NOTIFICATION_EMAIL;

      if (!resend) {
        console.warn("Resend API key not configured. Logging notification:", { subject, message });
        return res.status(200).json({ success: true, mocked: true });
      }

      if (!targetEmail) {
        return res.status(400).json({ error: "NOTIFICATION_EMAIL environment variable is not set." });
      }

      const { data: emailData, error } = await resend.emails.send({
        from: 'MateriaTrack <notifications@resend.dev>',
        to: [targetEmail],
        subject: `[MateriaTrack] ${subject}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #334155;">
            <h2 style="color: #1e40af;">MateriaTrack Notification</h2>
            <p style="font-size: 16px;">${message}</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px;">
              <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Event Details</h3>
              <pre style="white-space: pre-wrap; font-size: 13px;">${JSON.stringify(data, null, 2)}</pre>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">
              This is an automated notification from your MateriaTrack dashboard.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true, id: emailData?.id });
    } catch (err: any) {
      console.error("Notification API error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
