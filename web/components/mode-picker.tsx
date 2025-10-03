"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";

export function ModePicker() {
	const { mode, setMode } = useSession();

	return (
		<div className="w-full max-w-md mx-auto flex flex-col gap-4">
			<h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
			<p className="text-sm text-muted-foreground">
				Choose how you’d like to explore careers today. You can switch at any time.
			</p>
			<Card className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Button
					variant={mode === "text" ? "default" : "secondary"}
					onClick={() => setMode("text")}
					className="h-12"
				>
					Text mode
				</Button>
				<Button
					variant={mode === "voice" ? "default" : "secondary"}
					onClick={() => setMode("voice")}
					className="h-12"
				>
					Voice mode
				</Button>
			</Card>
		</div>
	);
}

export default ModePicker;


