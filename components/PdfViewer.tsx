'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  file: File | null;
  pageNumber: number;
  onLoadSuccess?: (numPages: number) => void;
  onAllPagesExtracted?: (pages: Record<number, string>, numPages: number) => void;
  onExtractionProgress?: (done: number, total: number) => void;
};

export default function PdfViewer({
  file,
  pageNumber,
  onLoadSuccess,
  onAllPagesExtracted,
  onExtractionProgress,
}: Props) {
  const extractedFileRef = useRef<string | null>(null);

  const fileUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  useEffect(() => {
    async function extractAllPages() {
      if (!file) return;

      const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
      if (extractedFileRef.current === fileKey) return;

      extractedFileRef.current = fileKey;

      try {
        console.log('extractAllPages started');

        const arrayBuffer = await file.slice(0, file.size).arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        console.log('pdf numPages =', pdf.numPages);

        const pages: Record<number, string> = {};

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          const text = textContent.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ');

          pages[i] = text;

          console.log(`page ${i}/${pdf.numPages} extracted, length=${text.length}`);
          onExtractionProgress?.(i, pdf.numPages);
        }

        console.log('all pages extracted');
        onAllPagesExtracted?.(pages, pdf.numPages);
      } catch (error) {
        console.error('all pages extraction error:', error);
        onExtractionProgress?.(0, 0);
      }
    }

    extractAllPages();
  }, [file, onAllPagesExtracted, onExtractionProgress]);

  if (!file || !fileUrl) {
    return (
      <div className="flex h-[680px] w-full items-center justify-center rounded-2xl border border-dashed bg-white text-center">
        <div className="text-slate-600">PDF를 업로드하면 여기에 표시됩니다.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[720px] items-start justify-center overflow-auto rounded-2xl bg-slate-200 p-3">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages }) => onLoadSuccess?.(numPages)}
        loading={<div className="p-8 text-sm text-slate-600">PDF 불러오는 중...</div>}
      >
        <Page pageNumber={pageNumber} width={820} />
      </Document>
    </div>
  );
}