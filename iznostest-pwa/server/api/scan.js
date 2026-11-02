// Прокси распознавания для Vercel (папка api/) или другого serverless-хостинга на Node 18+.
// Ключ хранится только на сервере: переменная окружения ANTHROPIC_API_KEY.
const PROMPTS = {
  tag: `На фото бирка одежды или другого изделия. Найди состав материалов в процентах. Ответь ТОЛЬКО JSON без пояснений: {"readable":true или false,"items":[{"fiber":"ключ","percent":число}],"notes":"кратко по-русски: правила ухода или важные пометки, до 120 символов"}. Ключи fiber только из списка: cotton, pima, linen, hemp, wool, merino, cashmere, alpaca, mohair, angora, silk, polyester, nylon, acrylic, viscose, modal, lyocell, bamboo, elastane, polypropylene, polyurethane, leather, fur, fauxfur, rubber, other. Полиамид это nylon. Если состав не читается, верни readable=false и пустой items.`,
  shoe: `На фото обувь (возможно, подошва или маркировка внутри). Определи по внешнему виду и надписям. Ответь ТОЛЬКО JSON без пояснений: {"readable":true или false,"upper":"ключ","sole":"ключ","construction":"ключ","wear":число от 0 до 3,"notes":"кратко по-русски, что видно (трещины, стёртый протектор, отклейка), до 140 символов"}. upper: leather, fullgrain, suede, patent, textile, canvas, knit, membrane, synthetic, rubber, felt. sole: rubber, vibram, pu, tpu, eva, foam, leather, crepe, cork, tpr, mixed. construction: goodyear, stitched, molded, vulcan, moccasin, glued; если крепление не видно, выбери наиболее вероятное для такой обуви. wear: 0 новая, 1 лёгкий износ, 2 заметный, 3 сильный. Если на фото нет обуви, верни readable=false.`
};

export default async function handler(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || "*";   // укажите адрес вашего сайта
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();

  const { kind, images } = req.body || {};
  const ok = PROMPTS[kind] && Array.isArray(images) && images.length >= 1 && images.length <= 3 &&
    images.every(s => typeof s === "string" && s.startsWith("data:image/jpeg;base64,") && s.length < 2_500_000);
  if (!ok) return res.status(400).json({ error: "bad request" });

  const content = images.map(s => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.split(",")[1] } }));
  content.push({ type: "text", text: PROMPTS[kind] });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.MODEL || "claude-sonnet-5-5", max_tokens: 500, messages: [{ role: "user", content }] })
  });
  if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: "upstream" });
  const data = await r.json();
  const text = (data.content || []).map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
  try { return res.status(200).json(JSON.parse(text)); }
  catch { return res.status(502).json({ error: "invalid_json" }); }
}
