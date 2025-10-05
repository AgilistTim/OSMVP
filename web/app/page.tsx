"use client";

import { Onboarding } from "@/components/onboarding";
import { useSession } from "@/components/session-provider";
import { WelcomeScreen } from "@/components/welcome-screen";

function Content() {
	const { started } = useSession();
	if (!started) return <WelcomeScreen />;
	return <Onboarding />;
}

export default function Home() {
  return (
    <main className="min-h-dvh p-6 sm:p-10">
      <Content />
    </main>
  );
}
