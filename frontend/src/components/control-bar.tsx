import { useState } from "react";
import {
  DOMAIN_LABELS,
  LANG_LABELS,
  SOURCE_LANG_LABELS,
  type AudioSource,
  type Domain,
  type Language,
  type SourceLanguage,
} from "../types";
import type { ExportFormat } from "../utils/export-transcript";

interface ControlBarProps {
  isConnected: boolean;
  sourceLang: SourceLanguage;
  targetLang: Language;
  audioSource: AudioSource;
  isRecording: boolean;
  onSourceLangChange: (lang: SourceLanguage) => void;
  onLangChange: (lang: Language) => void;
  domain: Domain;
  onAudioSourceChange?: (source: AudioSource) => void;
  onDomainChange: (domain: Domain) => void;
  onClear: () => void;
  onExport?: (format: ExportFormat) => void;
  onPopOut?: () => void;
}

/* ── Icons ── */

function IconMic({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function IconMonitor({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconPopOut() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  );
}

/* ── Segmented toggle for audio source (mic / system) ── */

function AudioSourceToggle({
  value,
  onChange,
  disabled,
}: {
  value: AudioSource;
  onChange: (v: AudioSource) => void;
  disabled: boolean;
}) {
  const options: { key: AudioSource; icon: React.ReactNode; label: string }[] = [
    { key: "mic", icon: <IconMic className="w-3 h-3" />, label: "Mic" },
    { key: "system", icon: <IconMonitor className="w-3 h-3" />, label: "System" },
  ];

  return (
    <div className={`flex items-center bg-[var(--bg-secondary)] rounded-lg p-0.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          disabled={disabled}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-150 ${
            value === opt.key
              ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          }`}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Pill selector for languages ── */

const selectClass =
  "bg-transparent text-[var(--text-secondary)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] cursor-pointer " +
  "focus:outline-none focus:border-[var(--accent)] hover:border-[var(--text-muted)] " +
  "transition-colors duration-150";

const btnClass =
  "text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg cursor-pointer " +
  "hover:bg-[var(--bg-elevated)] transition-colors duration-150";

/* ── Export dropdown ── */

const EXPORT_FORMATS: { key: ExportFormat; label: string }[] = [
  { key: "txt", label: "Text (.txt)" },
  { key: "srt", label: "SRT subtitles (.srt)" },
  { key: "vtt", label: "WebVTT (.vtt)" },
  { key: "json", label: "JSON (.json)" },
];

function ExportButton({ onExport }: { onExport: (f: ExportFormat) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={btnClass}
        title="Export transcript"
      >
        <IconDownload />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl py-1 z-50 min-w-[160px]">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.key}
              onClick={() => { onExport(fmt.key); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] cursor-pointer transition-colors duration-100"
            >
              {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Control Bar ── */

export function ControlBar({
  isConnected,
  sourceLang,
  targetLang,
  audioSource,
  isRecording,
  onSourceLangChange,
  onLangChange,
  domain,
  onAudioSourceChange,
  onDomainChange,
  onClear,
  onExport,
  onPopOut,
}: ControlBarProps) {
  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
      {/* Left: audio + language controls */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Connection dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : "bg-[var(--red)]"}`}
          title={isConnected ? "Connected" : "Disconnected"}
        />

        {/* Audio source toggle */}
        {onAudioSourceChange && (
          <AudioSourceToggle
            value={audioSource}
            onChange={onAudioSourceChange}
            disabled={isRecording}
          />
        )}

        {/* Divider */}
        <div className="w-px h-4 bg-[var(--border)]" />

        {/* Source language */}
        <select
          value={sourceLang}
          onChange={(e) => onSourceLangChange(e.target.value as SourceLanguage)}
          className={selectClass}
          title="Source language"
        >
          {(Object.entries(SOURCE_LANG_LABELS) as [SourceLanguage, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ),
          )}
        </select>

        {/* Arrow */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 text-[var(--text-muted)] shrink-0">
          <path d="M5 12h14m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Target language */}
        <select
          value={targetLang}
          onChange={(e) => onLangChange(e.target.value as Language)}
          className={selectClass}
          title="Target language"
        >
          {(Object.entries(LANG_LABELS) as [Language, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ),
          )}
        </select>
      </div>

      {/* Center: domain selector */}
      <div className="flex items-center gap-1.5 shrink-0">
        <select
          value={domain}
          onChange={(e) => onDomainChange(e.target.value as Domain)}
          className="bg-transparent text-[var(--text-muted)] border border-[var(--border)] rounded-lg px-2 py-1 text-[11px] cursor-pointer focus:outline-none focus:border-[var(--accent)] hover:border-[var(--text-muted)] transition-colors duration-150"
          title="Domain context"
        >
          {(Object.entries(DOMAIN_LABELS) as [Domain, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ),
          )}
        </select>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onPopOut && (
          <button onClick={onPopOut} className={btnClass} title="Pop out captions">
            <IconPopOut />
          </button>
        )}
        {onExport && (
          <ExportButton onExport={onExport} />
        )}
        <button onClick={onClear} className={btnClass} title="Clear all">
          <IconTrash />
        </button>
      </div>
    </header>
  );
}
