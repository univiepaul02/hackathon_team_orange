export default function TransparencyBanner() {
  return (
    <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm px-4 py-2 rounded-lg flex items-start gap-2">
      <span className="mt-0.5 shrink-0">⚠️</span>
      <span>
        <strong>AI-generated content</strong> based on course material — may contain errors.
        Always verify important claims with your professor or the source document.
      </span>
    </div>
  )
}
