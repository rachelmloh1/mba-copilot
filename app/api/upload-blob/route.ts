import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Generate a client upload token for direct browser-to-blob uploads.
 * This bypasses the 4.5MB Vercel request body limit.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Validate and return metadata
        return {
          allowedContentTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/markdown',
            'text/csv',
          ],
          tokenPayload: JSON.stringify({
            pathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[Blob] Upload completed:', blob.url);

        // Process the file from blob storage
        try {
          const { pathname } = JSON.parse(tokenPayload || '{}');
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

          const response = await fetch(`${backendUrl}/backend/upload-from-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: blob.url,
              filename: pathname || blob.pathname,
            }),
          });

          if (!response.ok) {
            console.error('[Blob] Backend processing failed');
          }

          // Delete blob after processing
          const { del } = await import('@vercel/blob');
          await del(blob.url);
          console.log('[Blob] Deleted temporary blob:', blob.url);
        } catch (error) {
          console.error('[Blob] Error processing upload:', error);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('[Blob] Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
