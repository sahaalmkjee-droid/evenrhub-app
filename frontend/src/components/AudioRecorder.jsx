import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Upload, Play, Pause, X, Loader2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { ingestApi } from '../api/client.js'

// ── Timer display ─────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ── Job Status Badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
  }
  return (
    <span className={`badge ${map[status] || 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'}`}>
      {status}
    </span>
  )
}

export default function AudioRecorder() {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [jobStatus, setJobStatus] = useState(null)
  const [jobId, setJobId] = useState(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const audioRef = useRef(null)
  const pollRef = useRef(null)

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [recording])

  // ── Poll job status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return
    pollRef.current = setInterval(async () => {
      try {
        const data = await ingestApi.getJobStatus(jobId)
        setJobStatus(data)
        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          clearInterval(pollRef.current)
        }
      } catch {/* ignore */}
    }, 2000)
    return () => clearInterval(pollRef.current)
  }, [jobId])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }

      mr.start(100)
      setRecording(true)
      setElapsed(0)
      setAudioBlob(null)
      setAudioUrl(null)
      setJobStatus(null)
      setJobId(null)
    } catch {
      toast.error('Microphone access denied.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  function clearRecording() {
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setJobStatus(null)
    setJobId(null)
  }

  async function uploadAudio(blob) {
    setUploading(true)
    const file = new File([blob], `voice_memo_${Date.now()}.webm`, {
      type: 'audio/webm',
    })
    try {
      const res = await ingestApi.uploadFile(file, 'voice')
      toast.success('Audio memo uploaded for transcription')
      setJobId(res.job_id)
    } catch {
      toast.error('Failed to upload audio.')
    } finally {
      setUploading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted[0]) {
        setAudioBlob(accepted[0])
        setAudioUrl(URL.createObjectURL(accepted[0]))
        setElapsed(0)
      }
    },
    accept: { 'audio/*': ['.mp3', '.wav', '.webm', '.m4a'] },
    maxFiles: 1,
    noClick: !!audioBlob,
  })

  return (
    <div className="space-y-4">
      {/* Dropzone wrapper */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200
          ${isDragActive
            ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-100/70 dark:bg-zinc-800/60'
            : audioBlob
            ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-zinc-50/40 dark:bg-zinc-900/40 cursor-pointer'}
        `}
      >
        <input {...getInputProps()} />

        {!audioBlob && !recording && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
              {isDragActive ? 'Drop audio memo here…' : 'Record voice memo or drop audio file'}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Supports MP3, WAV, WebM, M4A</p>
          </div>
        )}

        {/* Recording UI */}
        {recording && (
          <div className="flex flex-col items-center gap-2.5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-rose-600 flex items-center justify-center animate-pulse text-white shadow-sm">
                <Mic size={24} />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-ping" />
            </div>
            <p className="text-xl font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatTime(elapsed)}
            </p>
            <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider">Recording in progress…</p>
          </div>
        )}

        {/* Preview UI */}
        {audioBlob && !recording && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center">
              <Mic size={18} />
            </div>
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Voice memo captured · {formatTime(elapsed)}</p>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!recording && !audioBlob && (
          <button onClick={startRecording} className="btn-primary text-xs py-2">
            <Mic size={14} /> Start Voice Memo
          </button>
        )}

        {recording && (
          <button
            onClick={stopRecording}
            className="btn-secondary text-xs py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100"
          >
            <Square size={13} className="fill-current" /> Stop Recording
          </button>
        )}

        {audioBlob && !recording && (
          <>
            <button onClick={togglePlay} className="btn-secondary text-xs py-1.5">
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? 'Pause' : 'Play Preview'}
            </button>
            <button
              onClick={() => uploadAudio(audioBlob)}
              disabled={uploading}
              className="btn-primary text-xs py-1.5"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Transcribing…' : 'Transcribe & Extract'}
            </button>
            <button onClick={clearRecording} className="btn-secondary text-xs py-1.5 text-zinc-500">
              <X size={14} /> Discard
            </button>
          </>
        )}
      </div>

      {/* Job status */}
      {jobStatus && (
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 shadow-sm">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Job Status:</span>
          <StatusBadge status={jobStatus.status} />
          {jobStatus.status === 'PROCESSING' && (
            <Loader2 size={13} className="animate-spin text-zinc-600 dark:text-zinc-400" />
          )}
          {jobStatus.transcription && (
            <p className="text-xs text-zinc-700 dark:text-zinc-300 ml-2 truncate font-medium">
              "{jobStatus.transcription}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}
