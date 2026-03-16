import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Twilio Client (Lazy Initialization)
  let twilioClient: any = null;
  function getTwilio() {
    if (!twilioClient) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) {
        throw new Error("Twilio credentials missing");
      }
      twilioClient = twilio(sid, token);
    }
    return twilioClient;
  }

  // API Routes
  app.post("/api/send-alert", async (req, res) => {
    const { phoneNumber, calories } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number required" });
    }

    try {
      const client = getTwilio();
      const message = await client.messages.create({
        body: `[CALORIEFLOW] Alert: You have reached ${calories} calories today. Stay on track!`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });
      res.json({ success: true, messageId: message.sid });
    } catch (error: any) {
      console.error("Twilio Error:", error);
      res.status(500).json({ error: error.message });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
