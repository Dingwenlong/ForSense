export function BackButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return <button type="button" className="back-button" aria-label="返回上一层" title="返回上一层" disabled={disabled} onClick={onClick}>
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7"/></svg>
  </button>;
}
