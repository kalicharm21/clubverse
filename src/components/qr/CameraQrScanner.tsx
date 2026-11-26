import React, {useCallback, useEffect, useId, useRef, useState} from 'react';
import {Camera, CameraOff, RefreshCw} from 'lucide-react';
import {Button} from '../ui/Button.tsx';

interface CameraDevice {
  id: string;
  label: string;
}

interface CameraQrScannerProps {
  onScanToken: (token: string) => void;
  disabled?: boolean;
  autoStart?: boolean;
}

export const CameraQrScanner: React.FC<CameraQrScannerProps> = ({
  onScanToken,
  disabled = false,
  autoStart = true,
}) => {
  const reactId = useId();
  const containerId = `cv-qr-reader-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
  } | null>(null);
  const mountedRef = useRef(true);
  const sessionTokenRef = useRef(0);
  const lastScanRef = useRef<{token: string; at: number}>({token: '', at: 0});
  const onScanRef = useRef(onScanToken);

  useEffect(() => {
    onScanRef.current = onScanToken;
  }, [onScanToken]);

  const releaseAllVideoTracks = useCallback(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const videos = container.querySelectorAll('video');
    videos.forEach((video) => {
      const stream = video.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore track stop errors
          }
        });
        video.srcObject = null;
      }
    });
  }, [containerId]);

  const stopScanner = useCallback(async () => {
    // Increment session token so any in-flight startScanner() aborts immediately
    sessionTokenRef.current += 1;
    const inst = scannerRef.current;
    scannerRef.current = null;

    if (inst) {
      try {
        await inst.stop();
      } catch {
        // Already stopped or never started
      }
      try {
        inst.clear();
      } catch {
        // Ignore DOM cleanup noise
      }
    }

    releaseAllVideoTracks();
    if (mountedRef.current) {
      setScanning(false);
      setStarting(false);
    }
  }, [releaseAllVideoTracks]);

  const startScanner = useCallback(
    async (overrideCameraId?: string) => {
      await stopScanner();
      const mySession = ++sessionTokenRef.current;

      setErrorMsg(null);
      setStarting(true);

      try {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          throw new Error('Insecure context: camera requires HTTPS or localhost.');
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Browser mediaDevices.getUserMedia API is unavailable.');
        }

        const {Html5Qrcode} = await import('html5-qrcode');
        if (sessionTokenRef.current !== mySession || !mountedRef.current) return;

        const instance = new Html5Qrcode(containerId, {verbose: false});
        scannerRef.current = instance;

        const scanConfig = {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const edge = Math.max(140, Math.min(240, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7)));
            return {width: edge, height: edge};
          },
        };

        const onDecoded = (decodedText: string) => {
          const trimmed = decodedText.trim();
          if (!trimmed) return;
          const now = Date.now();
          if (lastScanRef.current.token === trimmed && now - lastScanRef.current.at < 3000) {
            return;
          }
          lastScanRef.current = {token: trimmed, at: now};
          onScanRef.current(trimmed);
        };

        const onFrameError = () => {
          // Expected per-frame miss while aiming
        };

        // Prefer facingMode constraints first so mobile phones & laptops open immediately without pre-enumeration issues
        const candidates: Array<string | MediaTrackConstraints> = overrideCameraId
          ? [overrideCameraId, {facingMode: 'environment'}, {facingMode: 'user'}]
          : [{facingMode: 'environment'}, {facingMode: 'user'}];

        let started = false;
        let lastErr: unknown = null;

        for (const candidate of candidates) {
          if (sessionTokenRef.current !== mySession || !mountedRef.current) {
            await stopScanner();
            return;
          }
          try {
            await instance.start(candidate, scanConfig, onDecoded, onFrameError);
            started = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }

        if (!started) {
          throw lastErr instanceof Error ? lastErr : new Error('Unable to open camera stream');
        }

        // If user clicked Close/Stop while camera was initializing, shut it down right away
        if (sessionTokenRef.current !== mySession || !mountedRef.current) {
          await stopScanner();
          return;
        }

        // Enumerate devices now that permission & active stream are granted (enables front/back switch on phones)
        Html5Qrcode.getCameras()
          .then((listed) => {
            if (!mountedRef.current || sessionTokenRef.current !== mySession) return;
            const valid = listed.filter((c) => Boolean(c.id));
            setCameras(valid);
            if (overrideCameraId) {
              setSelectedCameraId(overrideCameraId);
            } else if (valid.length > 0 && !selectedCameraId) {
              const back = valid.find((c) => /back|rear|environment/i.test(c.label));
              setSelectedCameraId(back?.id || valid[0].id);
            }
          })
          .catch(() => {
            // Non-fatal if device enumeration is restricted
          });

        setScanning(true);
      } catch (err) {
        if (sessionTokenRef.current !== mySession || !mountedRef.current) return;
        await stopScanner();
        const raw = err instanceof Error ? err.message : String(err || 'Unable to start camera');
        if (/permission|notallowed|denied/i.test(raw)) {
          setErrorMsg(
            'Camera permission was denied. Enable Camera in your browser site settings and tap Retry.',
          );
        } else if (/notreadable|in use|could not start video source|trackstart/i.test(raw)) {
          setErrorMsg(
            'Camera is busy in another app or tab (e.g., Google Meet/Zoom). Close it and tap Retry.',
          );
        } else if (/notfound|no camera|requested device not found/i.test(raw)) {
          setErrorMsg('No camera hardware detected on this device. Use manual QR token entry below.');
        } else {
          setErrorMsg(`Camera scanner error: ${raw}`);
        }
      } finally {
        if (mountedRef.current && sessionTokenRef.current === mySession) {
          setStarting(false);
        }
      }
    },
    [containerId, selectedCameraId, stopScanner],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (autoStart && !disabled) {
      void startScanner();
    }
    return () => {
      mountedRef.current = false;
      void stopScanner();
    };
  }, [autoStart, disabled, startScanner, stopScanner]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">Live Camera QR Scanner</span>
        <div className="flex items-center gap-2">
          {cameras.length > 1 && scanning && (
            <select
              aria-label="Select camera device"
              value={selectedCameraId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedCameraId(nextId);
                void startScanner(nextId);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              {cameras.map((cam, idx) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}
          {scanning ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void stopScanner()}
            >
              <CameraOff className="h-3.5 w-3.5" />
              Stop Camera
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={disabled || starting}
              loading={starting}
              onClick={() => void startScanner()}
            >
              <Camera className="h-3.5 w-3.5" />
              Start Camera Scan
            </Button>
          )}
        </div>
      </div>

      {/* Always keep full width and non-zero height while starting or scanning so mobile & desktop video streams render */}
      <div
        id={containerId}
        className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 ${
          scanning || starting ? 'min-h-[260px]' : 'h-0 border-0 opacity-0 pointer-events-none'
        }`}
      />

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => void startScanner()}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-800 underline"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
};