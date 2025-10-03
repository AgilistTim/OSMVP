import { ModePicker } from "@/components/mode-picker";
import { Onboarding } from "@/components/onboarding";
import { useSession } from "@/components/session-provider";

function Content() {
  const { mode } = useSession();
  if (!mode) return <ModePicker />;
  return <Onboarding />;
}

export default function Home() {
  return (
    <main className="min-h-dvh p-6 sm:p-10">
      <Content />
    </main>
  );
}
