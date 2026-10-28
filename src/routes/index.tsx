import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const Redactor = lazy(() => import("@/components/redactor/Redactor"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Redact — Credit agreement PII redaction" },
      { name: "description", content: "Detect, review and redact personal data in credit agreement PDFs. Runs in your browser." },
      { property: "og:title", content: "Redact — Credit agreement PII redaction" },
      { property: "og:description", content: "Detect, review and redact personal data in credit agreement PDFs. Runs in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const fallback = <div className="min-h-screen bg-background" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Redactor />
      </Suspense>
    </ClientOnly>
  );
}
