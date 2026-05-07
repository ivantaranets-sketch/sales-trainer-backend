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
      manager_name,
      transcript = [],
      scores = {},
      overall_score,
      duration_seconds
    } = body;

    const prompt = `
Ты — строгий тренер отдела продаж.

Проанализируй тренировку менеджера.

Сценарий:
${scenario_title || "Не указан"}

Менеджер:
${manager_name || "Не указан"}

Длительность:
${duration_seconds || 0} секунд

Финальные показатели:
${JSON.stringify(scores, null, 2)}

Итоговый балл:
${overall_score || 0}/100

Диалог:
${JSON.stringify(transcript, null, 2)}

Сформируй разбор:
1. Что получилось.
2. Что просело.
3. Краткий вывод.
4. Как можно было ответить лучше.
5. Рекомендация на следующую тренировку.

Ответ должен быть строго в JSON:
{
  "overall_score": 0,
  "subtitle": "строка",
  "summary": "строка",
  "strengths": ["строка"],
  "weaknesses": ["строка"],
  "best_answer": "строка",
  "recommendation": "строка"
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
            name: "sales_trainer_report",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "overall_score",
                "subtitle",
                "summary",
                "strengths",
                "weaknesses",
                "best_answer",
                "recommendation"
              ],
              properties: {
                overall_score: { type: "number", minimum: 0, maximum: 100 },
                subtitle: { type: "string" },
                summary: { type: "string" },
                strengths: {
                  type: "array",
                  items: { type: "string" }
                },
                weaknesses: {
                  type: "array",
                  items: { type: "string" }
                },
                best_answer: { type: "string" },
                recommendation: { type: "string" }
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
