'use client';

import { use, useEffect, useState } from 'react';

export default function PdfViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the PDF and create a blob URL
    fetch(`/api/pdf/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('PDF not found or expired');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="mb-2 text-xl font-semibold text-red-600">PDF Not Available</p>
          <p className="text-gray-600">{error}</p>
          <p className="mt-4 text-sm text-gray-400">Links expire after 7 days.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <div className="flex items-center justify-between border-b bg-white px-4 py-2 shadow-sm">
        <h1 className="text-sm font-medium text-gray-700">RVC Ledger — Shared Document</h1>
        <a
          href={pdfUrl || '#'}
          download
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Download PDF
        </a>
      </div>
      <div className="flex-1 overflow-hidden">
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            className="h-full w-full border-0"
            title="PDF Viewer"
          />
        )}
      </div>
    </div>
  );
}
