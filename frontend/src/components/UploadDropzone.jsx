import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  X,
  FileText,
  Image,
  File,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ingestApi } from '../api/client.js'

const ACCEPT = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
}

function FileIcon({ type }) {
  if (type.startsWith('image/')) return <Image size={20} className="text-amber-500" />
  if (type === 'application/pdf') return <FileText size={20} className="text-rose-500" />
  return <File size={20} className="text-indigo-500" />
}

function StatusIcon({ status }) {
  if (status === 'uploading') return <Loader2 size={14} className="animate-spin text-zinc-800 dark:text-zinc-200" />
  if (status === 'SUCCESS') return <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
  if (status === 'FAILED') return <AlertCircle size={14} className="text-rose-600 dark:text-rose-400" />
  if (status === 'PENDING' || status === 'PROCESSING')
    return <Loader2 size={14} className="animate-spin text-amber-500" />
  return null
}

export default function UploadDropzone() {
  const [files, setFiles] = useState([])

  const onDrop = useCallback((accepted) => {
    const newEntries = accepted.map((file) => ({
      file,
      id: Math.random().toString(36).slice(2),
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: 0,
      status: 'idle',
      jobId: null,
    }))
    setFiles((prev) => [...prev, ...newEntries])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: 20 * 1024 * 1024,
  })

  function removeFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  async function uploadFile(entry) {
    setFiles((prev) =>
      prev.map((f) => f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f)
    )

    const progressTimer = setInterval(() => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id && f.status === 'uploading'
            ? { ...f, progress: Math.min(f.progress + 20, 85) }
            : f
        )
      )
    }, 300)

    try {
      const sourceType = entry.file.type.startsWith('image/')
        ? 'poster'
        : entry.file.type === 'application/pdf'
        ? 'pdf'
        : 'text'

      const res = await ingestApi.uploadFile(entry.file, sourceType)
      clearInterval(progressTimer)

      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id
            ? { ...f, status: 'SUCCESS', progress: 100, jobId: res.job_id }
            : f
        )
      )
      toast.success(`Uploaded ${entry.file.name}`)
    } catch {
      clearInterval(progressTimer)
      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, status: 'FAILED' } : f))
      )
      toast.error(`Upload failed: ${entry.file.name}`)
    }
  }

  async function uploadAll() {
    const idleFiles = files.filter((f) => f.status === 'idle')
    if (!idleFiles.length) {
      toast('No new files to upload.')
      return
    }
    await Promise.all(idleFiles.map((f) => uploadFile(f)))
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive
            ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-100/70 dark:bg-zinc-800/60 scale-[1.01]'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 bg-zinc-50/40 dark:bg-zinc-900/40'
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
            ${isDragActive
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
              : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-sm'}`}
          >
            <Upload size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              {isDragActive ? 'Drop files here…' : 'Drag & drop posters, class timetables, circulars, or PDFs'}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Supports JPG, PNG, WebP, PDF, TXT · Class timetables & slots auto-expand across semester weekdays
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-3 pointer-events-none rounded-lg"
          >
            Browse from computer
          </button>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2.5">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-sm"
            >
              {/* Preview or icon */}
              <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200/60 dark:border-zinc-700">
                {entry.preview ? (
                  <img
                    src={entry.preview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileIcon type={entry.file.type} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                    {entry.file.name}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusIcon status={entry.status} />
                    {entry.status === 'idle' && (
                      <button
                        onClick={() => uploadFile(entry)}
                        className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
                      >
                        Upload
                      </button>
                    )}
                    <button
                      onClick={() => removeFile(entry.id)}
                      className="p-1 hover:text-rose-600 dark:hover:text-rose-400 text-zinc-400 dark:text-zinc-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {(entry.file.size / 1024).toFixed(1)} KB ·{' '}
                  <span className={
                    entry.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : entry.status === 'FAILED' ? 'text-rose-600 dark:text-rose-400 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400'
                  }>
                    {entry.status}
                  </span>
                </p>

                {/* Progress bar */}
                {(entry.status === 'uploading' || (entry.progress > 0 && entry.progress < 100)) && (
                  <div className="mt-1.5 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-300"
                      style={{ width: `${entry.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Upload all */}
          <button
            onClick={uploadAll}
            className="btn-primary w-full justify-center text-xs py-2.5"
          >
            <Upload size={14} />
            Upload All Files
          </button>
        </div>
      )}
    </div>
  )
}
