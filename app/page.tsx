'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  Search,
  Lightbulb,
  MessageSquare,
} from 'lucide-react';

const PdfViewer = dynamic(
  () => import('../components/PdfViewer').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-sm text-slate-600">PDF 뷰어 불러오는 중...</div>
    ),
  }
);

type KeywordItem = {
  term: string;
  description: string;
};

type PageAnalysis = {
  summary: string;
  keywords: KeywordItem[];
  highlights: string[];
  suggestedQuestions: string[];
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

function splitIntoSentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|(?<=다)\s+|(?<=요)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function localSearchRelevantSentences(query: string, text: string, maxCount = 5): string[] {
  const sentences = splitIntoSentences(text);
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  return sentences
    .map((sentence, index) => {
      const lower = sentence.toLowerCase();
      let score = 0;

      for (const term of terms) {
        if (lower.includes(term)) score += term.length;
      }

      if (index < 5) score += 0.3;

      return { sentence, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((x) => x.sentence);
}

function SectionCard({
  title,
  icon,
  open,
  setOpen,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-xl">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          {icon}
          {title}
        </div>
        <span className="text-sm text-slate-500">{open ? '숨기기' : '보기'}</span>
      </button>

      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [pageAnalysisByPage, setPageAnalysisByPage] = useState<Record<number, PageAnalysis>>({});

  const [documentSummary, setDocumentSummary] = useState('아직 문서 전체 개요가 없습니다.');
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepStatus, setPrepStatus] = useState('대기 중');
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });

  const [showDocumentSummary, setShowDocumentSummary] = useState(false);
  const [showSuggestedQuestions, setShowSuggestedQuestions] = useState(false);
  const [showPageSummary, setShowPageSummary] = useState(true);
  const [showKeywords, setShowKeywords] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showChat, setShowChat] = useState(true);

  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '문서 내용에 대해 질문하면 현재 페이지와 전체 문맥을 참고해서 답변합니다.',
    },
  ]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (!next) return;

    setFile(next);
    setFileName(next.name);
    setNumPages(0);
    setPageNumber(1);
    setPageTexts({});
    setPageAnalysisByPage({});
    setDocumentSummary('아직 문서 전체 개요가 없습니다.');
    setIsPreparing(true);
    setPrepStatus('PDF 텍스트 추출 시작');
    setExtractProgress({ done: 0, total: 0 });
    setMessages([
      {
        role: 'assistant',
        content: '문서 내용에 대해 질문하면 현재 페이지와 전체 문맥을 참고해서 답변합니다.',
      },
    ]);

    setShowDocumentSummary(false);
    setShowSuggestedQuestions(false);
    setShowPageSummary(true);
    setShowKeywords(true);
    setShowHighlights(true);
    setShowChat(true);
  }

  async function analyzeDocument(fullDocumentText: string) {
    const res = await fetch('/api/analyze-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentText: fullDocumentText }),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`analyze-document failed: ${res.status}`);

    return JSON.parse(raw) as { documentSummary: string };
  }

  async function analyzePage(pageText: string) {
    const res = await fetch('/api/analyze-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageText }),
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`analyze-page failed: ${res.status}`);

    return JSON.parse(raw) as PageAnalysis;
  }

  async function handleAllPagesExtracted(
    allPages: Record<number, string>,
    detectedNumPages: number
  ) {
    setNumPages(detectedNumPages);
    setPageTexts(allPages);

    try {
      const fullDocumentText = Object.keys(allPages)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => allPages[Number(key)])
        .join('\n\n');

      setPrepStatus('문서 전체 개요 생성 중');
      const docResult = await analyzeDocument(fullDocumentText);
      setDocumentSummary(docResult.documentSummary);

      setPrepStatus('페이지별 분석 시작');

      const entries = Object.entries(allPages).sort((a, b) => Number(a[0]) - Number(b[0]));

      for (let i = 0; i < entries.length; i++) {
        const [pageKey, text] = entries[i];
        const page = Number(pageKey);

        if (!text || !text.trim()) {
          setPageAnalysisByPage((prev) => ({
            ...prev,
            [page]: {
              summary: '이 페이지에서 추출된 텍스트가 없습니다.',
              keywords: [],
              highlights: [],
              suggestedQuestions: [],
            },
          }));
          setPrepStatus(`페이지 분석 ${i + 1}/${entries.length}`);
          continue;
        }

        const result = await analyzePage(text);

        setPageAnalysisByPage((prev) => ({
          ...prev,
          [page]: result,
        }));

        setPrepStatus(`페이지 분석 ${i + 1}/${entries.length}`);
      }

      setPrepStatus('준비 완료');
    } catch (error) {
      console.error('prepare error:', error);
      setPrepStatus('준비 중 오류가 발생했습니다.');
    } finally {
      setIsPreparing(false);
    }
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > numPages) return;
    setPageNumber(nextPage);
  }

  const currentPageAnalysis = useMemo(() => {
    return (
      pageAnalysisByPage[pageNumber] || {
        summary: '아직 이 페이지 분석 결과가 없습니다.',
        keywords: [],
        highlights: [],
        suggestedQuestions: [],
      }
    );
  }, [pageAnalysisByPage, pageNumber]);

  async function askQuestion(customQuestion?: string) {
    const question = (customQuestion ?? chatInput).trim();
    if (!question || isChatLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const fullDocumentText = Object.keys(pageTexts)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => pageTexts[Number(key)])
        .join('\n\n');

      const localMatches = localSearchRelevantSentences(
        question,
        `${pageTexts[pageNumber] || ''}\n\n${fullDocumentText}`
      );

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          currentPageText: pageTexts[pageNumber] || '',
          documentSummary,
          localMatches,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || '답변을 생성하지 못했습니다.',
        },
      ]);
    } catch (error) {
      console.error('chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '채팅 응답 생성 중 오류가 발생했습니다.',
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-3xl bg-white shadow-xl">
            <div className="border-b p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xl font-semibold text-slate-900">PDF Reader</div>
                  <p className="mt-1 text-sm text-slate-600">
                    문서 전체를 먼저 준비하고, 페이지별 분석을 미리 돌리는 방식입니다.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {prepStatus}
                    {extractProgress.total > 0
                      ? ` (${extractProgress.done}/${extractProgress.total})`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-slate-800">
                    <Upload className="h-4 w-4" />
                    PDF 업로드
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </label>
                  <div className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-800">
                    {fileName || '아직 업로드 없음'}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <button
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
                    onClick={() => goToPage(pageNumber - 1)}
                    disabled={pageNumber <= 1}
                  >
                    <ChevronLeft className="mr-1 inline h-4 w-4" />
                    이전
                  </button>
                  <button
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"
                    onClick={() => goToPage(pageNumber + 1)}
                    disabled={!numPages || pageNumber >= numPages}
                  >
                    다음
                    <ChevronRight className="ml-1 inline h-4 w-4" />
                  </button>
                </div>

                <div className="text-sm text-slate-600">
                  페이지 {pageNumber} / {numPages || 0}
                </div>
              </div>

              <PdfViewer
                file={file}
                pageNumber={pageNumber}
                onLoadSuccess={setNumPages}
                onExtractionProgress={(done, total) => {
                  setExtractProgress({ done, total });
                  setPrepStatus(`텍스트 추출 중 ${done}/${total}`);
                }}
                onAllPagesExtracted={handleAllPagesExtracted}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <SectionCard
            title="현재 페이지 요약"
            icon={<Sparkles className="h-5 w-5" />}
            open={showPageSummary}
            setOpen={setShowPageSummary}
          >
            <div className="text-sm leading-7 text-slate-700">
              {currentPageAnalysis.summary}
            </div>
          </SectionCard>

          <SectionCard
            title="키워드 설명"
            icon={<Search className="h-5 w-5" />}
            open={showKeywords}
            setOpen={setShowKeywords}
          >
            <div className="space-y-3">
              {currentPageAnalysis.keywords.length > 0 ? (
                currentPageAnalysis.keywords.map((item, idx) => (
                  <div key={idx} className="rounded-2xl bg-slate-100 p-3">
                    <div className="font-semibold text-slate-900">{item.term}</div>
                    <div className="mt-1 text-sm text-slate-700">{item.description}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">아직 키워드가 없습니다.</div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="핵심 포인트"
            icon={<Lightbulb className="h-5 w-5" />}
            open={showHighlights}
            setOpen={setShowHighlights}
          >
            <ul className="space-y-2 text-sm text-slate-700">
              {currentPageAnalysis.highlights.length > 0 ? (
                currentPageAnalysis.highlights.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))
              ) : (
                <li className="text-slate-500">아직 핵심 포인트가 없습니다.</li>
              )}
            </ul>
          </SectionCard>

          <SectionCard
            title="문서 채팅"
            icon={<MessageSquare className="h-5 w-5" />}
            open={showChat}
            setOpen={setShowChat}
          >
            <div className="h-[260px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3">
              <div className="space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-2xl p-3 text-sm leading-6 ${
                      msg.role === 'user'
                        ? 'ml-8 bg-slate-950 text-white'
                        : 'mr-8 bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
                      {msg.role === 'user' ? 'You' : 'Reader AI'}
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-sans">
                      {msg.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="문서 내용에 대해 질문하세요"
                className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-base font-medium text-slate-800 placeholder:font-medium placeholder:text-green-700 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    askQuestion();
                  }
                }}
              />
              <button
                className="rounded-2xl bg-slate-950 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                onClick={() => askQuestion()}
                disabled={isChatLoading}
              >
                {isChatLoading ? '답변중' : '질문'}
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title="문서 전체 요약"
            icon={<BookOpen className="h-5 w-5" />}
            open={showDocumentSummary}
            setOpen={setShowDocumentSummary}
          >
            <div className="text-sm leading-7 text-slate-700">{documentSummary}</div>
          </SectionCard>

          <SectionCard
            title="추천 질문"
            icon={<MessageSquare className="h-5 w-5" />}
            open={showSuggestedQuestions}
            setOpen={setShowSuggestedQuestions}
          >
            <div className="flex flex-wrap gap-2">
              {currentPageAnalysis.suggestedQuestions.length > 0 ? (
                currentPageAnalysis.suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                    onClick={() => setChatInput(q)}
                  >
                    {q}
                  </button>
                ))
              ) : (
                <div className="text-sm text-slate-500">아직 추천 질문이 없습니다.</div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}