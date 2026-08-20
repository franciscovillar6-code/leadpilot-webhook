module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message: "LeadPilot Webhook funcionando",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Método no permitido",
    });
  }

  try {
    const data = req.body || {};
    const answers = data.answers || {};

    const getAnswer = (...terms) => {
      const key = Object.keys(answers).find((k) => {
        const normalized = k.toLowerCase();
        return terms.some((term) =>
          normalized.includes(term.toLowerCase())
        );
      });

      if (!key) return "";

      const value = answers[key];
      return Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
    };

    const lead = {
      name: getAnswer("Nombre Viajero Principal"),
      email: getAnswer("Mail de contacto"),
      whatsapp: getAnswer("Wpp de Contacto"),
      travelersText: getAnswer("Cantidad de personas que viajan"),
      travelDates: getAnswer("Fechas del viaje"),
      nights: getAnswer("Cantidad de noches"),
      quotationType: getAnswer("Que tipo de cotización buscas"),
      parkDays: getAnswer("Si buscan parques Disney o Universal"),
      carDetails: getAnswer("Solo si seleccionaste la opción de Auto"),
      documents: getAnswer("Visa / Pasaporte"),
      firstTrip: getAnswer("primer viaje a Disney"),
      source: getAnswer("Como nos conociste"),
      instagram: getAnswer("Instagram de Contacto"),
      comments: getAnswer(
        "requerimiento especial",
        "algo que quieras aclarar"
      ),
    };

    console.log("Lead normalizado:", lead);

    // =========================
    // GEMINI
    // =========================

    const geminiApiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!geminiApiKey) {
      throw new Error("Falta GOOGLE_GENERATIVE_AI_API_KEY");
    }

    const prompt = `
Sos el motor de análisis comercial de LeadPilot AI para una agencia
especializada en Disney, Universal, Orlando y Miami.

Analizá este lead:

Nombre: ${lead.name}
Email: ${lead.email}
WhatsApp: ${lead.whatsapp}
Viajeros: ${lead.travelersText}
Fechas: ${lead.travelDates}
Noches: ${lead.nights}
Cotización solicitada: ${lead.quotationType}
Parques: ${lead.parkDays}
Auto: ${lead.carDetails}
Visa/Pasaporte: ${lead.documents}
Primer viaje: ${lead.firstTrip}
Origen: ${lead.source}
Instagram: ${lead.instagram}
Comentarios: ${lead.comments}

Evaluá intención de compra, claridad, fechas, viajeros,
destino, documentación e información faltante.

El score debe ser de 0 a 100.
priority e intentLevel solo pueden ser:
"high", "medium" o "low".

Si no hay presupuesto, budget = 0.
Si no sabés cantidad de viajeros, travelers = 0.
Si solo hay mes y año, podés estimar inicio y fin del mes.
Si no hay fecha identificable, usar "".

Respondé ÚNICAMENTE JSON válido con esta estructura:

{
  "score": 0,
  "budget": 0,
  "intent": "",
  "endDate": "",
  "priority": "medium",
  "tripType": "",
  "startDate": "",
  "travelers": 0,
  "nextAction": "",
  "destination": "",
  "intentLevel": "medium",
  "missingInfo": [],
  "scoreReason": "",
  "customerInfo": "",
  "scoreFactors": [
    {
      "detail": "",
      "impact": "positive",
      "points": 0,
      "criterion": ""
    }
  ],
  "suggestedResponse": ""
}

suggestedResponse debe estar en español y lista para enviar al cliente.
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(
        geminiApiKey
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    const geminiResult = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error(
        "Error Gemini:",
        JSON.stringify(geminiResult)
      );

      throw new Error("Gemini no pudo analizar el lead");
    }

    const aiText =
      geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) {
      throw new Error("Gemini no devolvió contenido");
    }

    const cleaned = aiText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const aiAnalysis = JSON.parse(cleaned);

    aiAnalysis.score = Math.max(
      0,
      Math.min(100, Number(aiAnalysis.score) || 0)
    );

    if (
      !["high", "medium", "low"].includes(aiAnalysis.priority)
    ) {
      aiAnalysis.priority = "medium";
    }

    if (
      !["high", "medium", "low"].includes(
        aiAnalysis.intentLevel
      )
    ) {
      aiAnalysis.intentLevel = "medium";
    }

    aiAnalysis.budget =
      Number(aiAnalysis.budget) || 0;

    aiAnalysis.travelers =
      Number(aiAnalysis.travelers) || 0;

    console.log("Análisis Gemini:", aiAnalysis);

    // =========================
    // SUPABASE
    // =========================

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      throw new Error("Faltan variables de Supabase");
    }

    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/leads`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          form_row: data.row,
          received_at:
            data.receivedAt || new Date().toISOString(),
          answers: answers,
          status: "pending",
          score: aiAnalysis.score,
          priority: aiAnalysis.priority,
          ai_analysis: aiAnalysis,
        }),
      }
    );

    const savedLead =
      await supabaseResponse.json();

    if (!supabaseResponse.ok) {
      console.error(
        "Error Supabase:",
        JSON.stringify(savedLead)
      );

      throw new Error(
        "No se pudo guardar el lead en Supabase"
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "Lead recibido, analizado y guardado correctamente",
      score: aiAnalysis.score,
      priority: aiAnalysis.priority,
      analysis: aiAnalysis,
      databaseLead: savedLead[0],
    });
  } catch (error) {
    console.error("Error LeadPilot:", error);

    return res.status(500).json({
      success: false,
      message: "Error procesando el lead",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
};
