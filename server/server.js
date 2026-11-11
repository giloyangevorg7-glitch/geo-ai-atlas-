import express from "express";
import cors from "cors";

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"], allowedHeaders: ["Content-Type"] }));
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.get("/api/health", (_req, res) => {
  res.json({ ok: Boolean(API_KEY), provider: "Google Gemini", model: MODEL });
});

app.post("/api/ai", async (req, res) => {
  try {
    if (!API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY-ը սերվերում կարգավորված չէ" });
    const { mode = "chat", lang = "hy", context = "", messages = [] } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Հաղորդագրություն չկա" });
    }
    const language = ({ hy: "Armenian", ru: "Russian", en: "English" })[lang] || "Armenian";
    const history = messages.slice(-8).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 5000) }]
    }));
    const system = [
      "You are GEO AI ATLAS, a careful educational geography assistant.",
      `Always answer in ${language}.`,
      "Use simple, clear language suitable for a school student.",
      "Prioritize verified geographic facts. If unsure or if data may be outdated, say so.",
      "Do not invent statistics, coordinates, citations, or sources.",
      "When map context is supplied, use it as context but distinguish it from general knowledge.",
      "Keep answers structured and reasonably concise."
    ].join(" ");
    const prompt = `${system}\n\nCurrent map/location context:\n${String(context).slice(0, 12000) || "No selected place context."}\n\nAnswer the user's latest question.`;
    const contents = [{ role: "user", parts: [{ text: prompt }] }, ...history];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.35, maxOutputTokens: 900 }
      }),
      signal: AbortSignal.timeout(55000)
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || `Gemini API error ${upstream.status}`;
      return res.status(502).json({ error: message });
    }
    const answer = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!answer) return res.status(502).json({ error: "AI-ն դատարկ պատասխան է վերադարձրել" });
    res.json({ text: answer });
  } catch (err) {
    res.status(500).json({ error: err?.name === "TimeoutError" ? "AI հարցումը ժամանակից շուտ ավարտվեց" : "Սերվերի սխալ․ փորձիր կրկին" });
  }
});

app.get("/", (_req, res) => res.type("text").send("GEO AI ATLAS backend is running."));
app.listen(PORT, () => console.log(`GEO AI ATLAS backend listening on ${PORT}`));
