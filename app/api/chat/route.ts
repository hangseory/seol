import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const {
      message,
      currentPageText,
      documentSummary,
      localMatches,
    } = await req.json();

    const safeMatches =
      Array.isArray(localMatches) && localMatches.length > 0
        ? localMatches.join('\n')
        : '';

    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text:
                '너는 PDF를 읽는 학생을 돕는 한국어 도우미다. 반드시 한국어로 답해라. 현재 페이지 내용, 문서 전체 요약, 로컬 검색으로 찾은 관련 문장을 참고해서 쉽고 짧게 설명해라.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `사용자 질문:\n${message}\n\n` +
                `문서 전체 요약:\n${documentSummary || ''}\n\n` +
                `현재 페이지 텍스트:\n${currentPageText || ''}\n\n` +
                `관련 문장:\n${safeMatches}`,
            },
          ],
        },
      ],
    });

    return Response.json({
      answer: response.output_text,
    });
  } catch (error) {
    console.error('chat error:', error);

    return Response.json(
      {
        answer: '채팅 응답 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}