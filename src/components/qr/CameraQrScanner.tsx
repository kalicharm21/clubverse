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
  const startingRef = useRef(false);
  const lastScanRef = useRef<{token: string; at: number}>({token: '', at: 0});
  const onScanRef = useRef(onScanToken);

  useEffect(() => {
    onScanRef.current = onScanToken;
  }, [onScanToken]);

  const stopScanner = useCallback(async () => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    if (inst) {
      try {
        await inst.stop();
      } catch {
        // Already stopped
      }
      try {
        inst.clear();
      } catch {
        // Ignore DOM cleanup noise
      }
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(
    async (overrideCameraId?: string) => {
      if (startingRef.current) return;
      startingRef.current = true;
      setErrorMsg(null);
      setStarting(true);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            'Camera API unavailable. Ensure the app is loaded over HTTPS or localhost.',
          );
        }

        await stopScanner();
        const {Html5Qrcode} = await import('html5-qrcode');

        let targetCameraId = overrideCameraId || selectedCameraId;
        if (!targetCameraId) {
          const listed = await Html5Qrcode.getCameras().catch(() => []);
          if (listed.length > 0) {
            setCameras(listed);
            const backCam = listed.find((c) => /back|rear|environment/i.test(c.label));
            targetCameraId = backCam?.id || listed[0].id;
            setSelectedCameraId(targetCameraId);
          }
        }

        const instance = new Html5Qrcode(containerId, {verbose: false});
        scannerRef.current = instance;

        const scanConfig = {
          fps: 10,
          qrbox: {width: 220, height: 220},
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
          // Expected when no QR code is in frame
        };

        const candidates: Array<string | MediaTrackConstraints> = targetCameraId
          ? [targetCameraId, {facingMode: 'environment'}, {facingMode: 'user'}]
          : [{facingMode: 'environment'}, {facingMode: 'user'}];

        let started = false;
        let lastErr: unknown = null;
        for (const candidate of candidates) {
          try {
            await instance.start(candidate, scanConfig, onDecoded, onFrameError);
            started = true;
            break;
          } catch (err) {
            lastErr = err;
          }
        }

        if (!started) {
          throw lastErr instanceof Error ? lastErr : new Error('Unable to open video stream');
        }

        setScanning(true);
      } catch (err) {
        await stopScanner();
        const raw = err instanceof Error ? err.message : 'Unable to start device camera';
        if (/permission|notallowed|denied/i.test(raw)) {
          setErrorMsg(
            'Camera permission was denied. Allow camera access in browser site settings and click Retry.',
          );
        } else if (/notreadable|in use|could not start video source/i.test(raw)) {
          setErrorMsg(
            'Camera is busy in another app or tab (such as Google Meet/Zoom). Close that tab and click Retry.',
          );
        } else if (/notfound|no camera|requested device not found/i.test(raw)) {
          setErrorMsg(
            'No active camera was detected on this device. Use the manual QR token entry below.',
          );
        } else {
          setErrorMsg(`Camera scanner unavailable (${raw}). Manual QR verification remains ready.`);
        }
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
    },
    [containerId, selectedCameraId, stopScanner],
  );

  useEffect(() => {
    if (autoStart && !disabled) {
      void startScanner();
    }
    return () => {
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
                setSelectedCameraId(e.target.value);
                void startScanner(e.target.value);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Camera ${cam.id.slice(0, 6)}`}
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

      {/* Keep non-zero width even before scanning=true so html5-qrcode measures valid dimensions */}
      <div
        id={containerId}
        className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 transition-all ${
          scanning ? 'min-h-[240px] opacity-100' : 'h-0 border-0 opacity-0 pointer-events-none'
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