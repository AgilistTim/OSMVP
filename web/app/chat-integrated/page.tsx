import { Suspense } from 'react';
import { ChatIntegrated } from '@/components/chat-integrated';

export default function ChatIntegratedPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading chat…</div>}>
      <ChatIntegrated />
    </Suspense>
  );
}

