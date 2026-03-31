import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { documentText } = await req.json();

    if (!documentText || !documentText.trim()) {
      return Response.json({
        documentSummary: '문서 전체 텍스트가 없습니다.',
      });
    }

    const response = await client.responses.create({
      model: 'gpt-5-mini',
      text: {
        format: {
          type: 'json_schema',
          name: 'document_analysis',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              documentSummary: { type: 'string' },
            },
            required: ['documentSummary'],
          },
        },
      },
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text:
                '너는 PDF 문서 전체를 한국어로 분석하는 도우미다. documentSummary는 문서 전체를 3~4문장으로 짧게 개괄해라. 반드시 한국어로 작성해라.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: documentText,
            },
          ],
        },
      ],
    });

    return new Response(response.output_text, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    console.error('analyze-document error:', error);

    return Response.json(
      {
        documentSummary: '문서 전체 개요 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}