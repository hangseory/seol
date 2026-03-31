import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { pageText } = await req.json();

    if (!pageText || !pageText.trim()) {
      return Response.json({
        summary: '이 페이지에서 추출된 텍스트가 없습니다.',
        keywords: [],
        highlights: [],
        suggestedQuestions: [],
      });
    }

    const response = await client.responses.create({
      model: 'gpt-5-mini',
      text: {
        format: {
          type: 'json_schema',
          name: 'page_analysis',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              keywords: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    term: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['term', 'description'],
                },
              },
              highlights: {
                type: 'array',
                items: { type: 'string' },
              },
              suggestedQuestions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['summary', 'keywords', 'highlights', 'suggestedQuestions'],
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
                '너는 PDF 페이지를 한국어로 분석하는 도우미다. 반드시 한국어로 답해라. summary는 3~5문장, keywords는 핵심 용어 3~6개와 짧은 설명, highlights는 핵심 포인트 2~4개, suggestedQuestions는 이어서 물어볼 질문 2~4개를 작성해라.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: pageText,
            },
          ],
        },
      ],
    });

    return new Response(response.output_text, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    console.error('analyze-page error:', error);

    return Response.json(
      {
        summary: '페이지 분석 중 오류가 발생했습니다.',
        keywords: [],
        highlights: [],
        suggestedQuestions: [],
      },
      { status: 500 }
    );
  }
}