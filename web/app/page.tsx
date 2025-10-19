"use client";

import { useSession } from "@/components/session-provider";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function Content() {
	const { started } = useSession();
	const router = useRouter();
	
	// Redirect to chat-integrated when session starts
	useEffect(() => {
		if (started) {
			router.push('/chat-integrated');
		}
	}, [started, router]);
	
	if (!started) return <WelcomeScreen />;
	
	// Show loading state during redirect
	return (
		<div style={{ 
			display: 'flex', 
			alignItems: 'center', 
			justifyContent: 'center', 
			minHeight: '100vh' 
		}}>
			<p>Loading...</p>
		</div>
	);
}

export default function Home() {
  return (
    <main className="min-h-dvh p-6 sm:p-10">
      <Content />
    </main>
  );
}
