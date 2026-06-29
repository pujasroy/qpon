import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { imageData, mimeType } = JSON.parse(event.body);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: imageData,
              }
            },
            {
              text: `Extract coupon details from this image. Return ONLY valid JSON, no markdown, no explanation:
{
  "name": "brand or store name",
  "code": "coupon code if visible, else null",
  "value": "discount description e.g. 20% off or 100 off, else null",
  "expiry": "YYYY-MM-DD format if found, else null",
  "category": "one of: food, shopping, travel, entertainment, other"
}`
            }
          ]
        }
      ]
    });

    const text = response.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    console.error('Scan error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};