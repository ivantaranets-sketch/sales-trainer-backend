const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const {
      scenario_title,
      scenario_goal,
      manager_text,
      transcript = [],
      scores = {}
    } = body;

    if (!manager_text) {
      return res.status(400).json({ error: "manager_text is required" });
    }

    const prompt = `
Ты — ИИ-клиент в тренажере отдела продаж.

Сценарий:
${scenario_title || "Не указан"}

Цель менеджера:
${scenario_goal || "Не указана"}

Текущая реплика менеджера:
${manager_text}

Текущий диалог:
${JSON.stringify(transcript, null, 2)}

Текущие показатели:
${JSON.stringify(scores, null, 2)}

Твоя задача:
1. Ответить как реалистичный клиент.
2. Не быть слишком удобным.
3. Если менеджер задает сильный уточняющий вопрос — раскрывайся.
4. Если менеджер уходит в раннюю презентацию, шаблонность или давление — сопротивляйся.
5. Обнови показатели клиента:
- interest: интерес
- trust: доверие
- clarity: ясность
- readiness: готовность к следующему шагу

Ответ должен быть строго в JSON:
{
  "client_text": "реплика клиента",
  "scores": {
    "interest": 0,
    "trust": 0,
    "clarity": 0,
    "readiness": 0
  },
  "comment": "короткий комментарий ИИ для менеджера"
}
`;

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "sales_trainer_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["client_text", "scores", "comment"],
              properties: {
                client_text: { type: "string" },
                scores: {
                  type: "object",
                  additionalProperties: false,
                  required: ["interest", "trust", "clarity", "readiness"],
                  properties: {
                    interest: { type: "number", minimum: 0, maximum: 100 },
                    trust: { type: "number", minimum: 0, maximum: 100 },
                    clarity: { type: "number", minimum: 0, maximum: 100 },
                    readiness: { type: "number", minimum: 0, maximum: 100 }
                  }
                },
                comment: { type: "string" }
              }
            }
          }
        }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return res.status(500).json({
        error: "OpenAI request failed",
        details: errorText
      });
    }

    const data = await openaiResponse.json();
    const outputText = extractOutputText(data);

    let parsed;

    try {
      parsed = JSON.parse(outputText);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to parse OpenAI JSON",
        raw: outputText
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
};

function extractOutputText(data) {
  if (data.output_text) return data.output_text;

  const output = data.output || [];

  for (const item of output) {
    const content = item.content || [];

    for (const part of content) {
      if (part.text) return part.text;
    }
  }

  return "";
}
