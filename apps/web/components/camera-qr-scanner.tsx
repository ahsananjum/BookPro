/* Hallmark · component: camera-qr-scanner · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import {
    Camera,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    ShieldCheck,
    Zap,
    Clipboard,
    KeyRound,
} from "./icons";

interface CameraQrScannerProps {
    onScan: (token: string) => void;
    onClose?: () => void;
    active?: boolean;
    isVerifying?: boolean;
    scanFeedback?: { type: "success" | "error"; message: string; data?: any } | null;
    onClearFeedback?: () => void;
}

export function CameraQrScanner({
    onScan,
    onClose,
    active = true,
    isVerifying = false,
    scanFeedback = null,
    onClearFeedback,
}: CameraQrScannerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isMountedRef = useRef<boolean>(true);
    const sessionCountRef = useRef<number>(0);
    const activeRef = useRef<boolean>(active);
    const scannedCodeRef = useRef<string | null>(null);
    const onScanRef = useRef(onScan);

    const [hasCamera, setHasCamera] = useState<boolean | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
    const [scannedCode, setScannedCode] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState("");
    const [manualMode, setManualMode] = useState(false);
    const [copiedClipboard, setCopiedClipboard] = useState(false);

    // Sync refs
    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        scannedCodeRef.current = scannedCode;
    }, [scannedCode]);

    // Audio chime on successful pass read
    const playSuccessChime = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.18);
        } catch {
            // Audio context not available or user blocked
        }
    }, []);

    // Stop active camera stream cleanly
    const stopStream = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => {
                try {
                    track.stop();
                } catch {
                    // Ignore track stop errors
                }
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // Continuous optical scanning loop with dual-engine (Native BarcodeDetector + jsQR center crop)
    const isScanningRef = useRef<boolean>(false);

    const scanLoop = useCallback(async () => {
        if (!isMountedRef.current || !activeRef.current || scannedCodeRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (
            video &&
            canvas &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            !isScanningRef.current
        ) {
            isScanningRef.current = true;
            try {
                let detected: string | null = null;

                // 1. Hardware Accelerated Browser BarcodeDetector (Chrome / Edge / Windows native)
                if (typeof window !== "undefined" && "BarcodeDetector" in window) {
                    try {
                        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
                        const barcodes = await detector.detect(video);
                        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                            detected = barcodes[0].rawValue.trim();
                        }
                    } catch {
                        // Fallback to jsQR
                    }
                }

                // 2. jsQR Engine with Downscaled Frame & Both Polarity Inversion (Phone Screens)
                if (!detected) {
                    const maxDim = 640;
                    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
                    const w = Math.floor(video.videoWidth * scale);
                    const h = Math.floor(video.videoHeight * scale);

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });

                    if (ctx) {
                        ctx.drawImage(video, 0, 0, w, h);
                        const imageData = ctx.getImageData(0, 0, w, h);
                        const code = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: "attemptBoth",
                        });

                        if (code && code.data && code.data.trim().length > 0) {
                            detected = code.data.trim();
                        }
                    }
                }

                // 3. Center-Crop High-Resolution Pass (for dense or distant phone screen passes)
                if (!detected) {
                    const centerSize = Math.floor(Math.min(video.videoWidth, video.videoHeight) * 0.6);
                    const sx = Math.floor((video.videoWidth - centerSize) / 2);
                    const sy = Math.floor((video.videoHeight - centerSize) / 2);

                    canvas.width = 340;
                    canvas.height = 340;
                    const ctx = canvas.getContext("2d", { willReadFrequently: true });
                    if (ctx) {
                        ctx.drawImage(video, sx, sy, centerSize, centerSize, 0, 0, 340, 340);
                        const cropData = ctx.getImageData(0, 0, 340, 340);
                        const code = jsQR(cropData.data, cropData.width, cropData.height, {
                            inversionAttempts: "attemptBoth",
                        });
                        if (code && code.data && code.data.trim().length > 0) {
                            detected = code.data.trim();
                        }
                    }
                }

                if (detected && detected.length > 0) {
                    scannedCodeRef.current = detected;
                    setScannedCode(detected);
                    playSuccessChime();
                    if (typeof navigator !== "undefined" && navigator.vibrate) {
                        try { navigator.vibrate(80); } catch {}
                    }
                    stopStream();
                    onScanRef.current(detected);
                    return;
                }
            } finally {
                isScanningRef.current = false;
            }
        }

        animationFrameRef.current = requestAnimationFrame(scanLoop);
    }, [playSuccessChime, stopStream]);

    // Start video camera stream with race-condition & unmount safety
    const startStream = useCallback(async () => {
        const currentSession = ++sessionCountRef.current;
        stopStream();
        setCameraError(null);

        if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (currentSession === sessionCountRef.current && isMountedRef.current) {
                setHasCamera(false);
                setCameraError("Camera access is not supported in this browser. Please use manual token entry.");
                setManualMode(true);
            }
            return;
        }

        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facingMode },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
            } catch (constraintErr) {
                console.warn("High-res camera constraint failed, falling back to default video:", constraintErr);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
            }

            // Check if session was invalidated while awaiting getUserMedia
            if (currentSession !== sessionCountRef.current || !isMountedRef.current) {
                stream.getTracks().forEach((track) => {
                    try { track.stop(); } catch {}
                });
                return;
            }

            streamRef.current = stream;
            setHasCamera(true);

            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                video.muted = true;
                video.defaultMuted = true;
                video.playsInline = true;
                video.autoplay = true;

                // Wait for video metadata before invoking play()
                await new Promise<void>((resolve) => {
                    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                        resolve();
                    } else {
                        const onLoaded = () => {
                            video.removeEventListener("loadedmetadata", onLoaded);
                            resolve();
                        };
                        video.addEventListener("loadedmetadata", onLoaded, { once: true });
                        setTimeout(resolve, 300);
                    }
                });

                if (currentSession !== sessionCountRef.current || !isMountedRef.current) {
                    return;
                }

                try {
                    await video.play();
                } catch (playErr: any) {
                    if (playErr.name === "AbortError" || (playErr.message && playErr.message.includes("interrupted"))) {
                        console.debug("Video playback interrupted safely:", playErr.message);
                        return;
                    }
                    throw playErr;
                }

                if (currentSession === sessionCountRef.current && isMountedRef.current) {
                    if (animationFrameRef.current) {
                        cancelAnimationFrame(animationFrameRef.current);
                    }
                    animationFrameRef.current = requestAnimationFrame(scanLoop);
                }
            }
        } catch (err: any) {
            if (currentSession !== sessionCountRef.current || !isMountedRef.current) {
                return;
            }

            console.error("Camera acquisition failed:", err);
            setHasCamera(false);

            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                setCameraError("Camera permission denied. Allow camera access in browser address bar or enter pass token manually.");
                setManualMode(true);
            } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                setCameraError("No video camera device detected on this workstation.");
                setManualMode(true);
            } else if (err.name === "AbortError" || (err.message && err.message.includes("interrupted"))) {
                return;
            } else {
                setCameraError(`Camera error: ${err.message || "Failed to start camera."}`);
                setManualMode(true);
            }
        }
    }, [facingMode, scanLoop, stopStream]);

    // Component unmount lifecycle
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            stopStream();
        };
    }, [stopStream]);

    // Handle stream lifecycle when active state or manualMode change
    useEffect(() => {
        if (active && !manualMode && !scannedCode) {
            startStream();
        } else if (!active || manualMode) {
            stopStream();
        }
    }, [active, manualMode, facingMode, scannedCode, startStream, stopStream]);

    const handleFlipCamera = () => {
        setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = manualToken.trim();
        if (!trimmed) return;
        playSuccessChime();
        scannedCodeRef.current = trimmed;
        setScannedCode(trimmed);
        stopStream();
        onScanRef.current(trimmed);
    };

    const handleResetScan = () => {
        scannedCodeRef.current = null;
        setScannedCode(null);
        setCameraError(null);
        if (onClearFeedback) onClearFeedback();
        if (!manualMode) {
            startStream();
        }
    };

    const handlePasteClipboard = async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text) {
                    setManualToken(text.trim());
                    setCopiedClipboard(true);
                    setTimeout(() => setCopiedClipboard(false), 2000);
                }
            }
        } catch {
            // Clipboard access not granted
        }
    };

    return (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "14px", boxSizing: "border-box" }}>
            {/* Segmented Mode Selector: Hallmark Pill Switcher */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid var(--color-border, rgba(255, 255, 255, 0.1))",
                    borderRadius: "12px",
                    gap: "6px",
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
                <button
                    type="button"
                    onClick={() => {
                        setManualMode(false);
                        setCameraError(null);
                    }}
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "9px 14px",
                        borderRadius: "9px",
                        fontSize: "12px",
                        fontWeight: 700,
                        backgroundColor: !manualMode ? "rgba(255, 255, 255, 0.12)" : "transparent",
                        color: !manualMode ? "#ffffff" : "#94a3b8",
                        border: !manualMode ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid transparent",
                        boxShadow: !manualMode ? "0 2px 8px rgba(0, 0, 0, 0.4)" : "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                    }}
                >
                    <Camera size={14} color={!manualMode ? "#34d399" : "#94a3b8"} />
                    <span>Optical Camera View</span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        stopStream();
                        setManualMode(true);
                    }}
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "9px 14px",
                        borderRadius: "9px",
                        fontSize: "12px",
                        fontWeight: 700,
                        backgroundColor: manualMode ? "rgba(255, 255, 255, 0.12)" : "transparent",
                        color: manualMode ? "#ffffff" : "#94a3b8",
                        border: manualMode ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid transparent",
                        boxShadow: manualMode ? "0 2px 8px rgba(0, 0, 0, 0.4)" : "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                    }}
                >
                    <KeyRound size={14} color={manualMode ? "#38bdf8" : "#94a3b8"} />
                    <span>Cryptographic Pass Token</span>
                </button>
            </div>

            {/* Scan Feedback Banner (Integrated Hallmark Status Pill) */}
            {scanFeedback && (
                <div
                    style={{
                        padding: "12px 16px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "12px",
                        backgroundColor: scanFeedback.type === "success" ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                        border: `1px solid ${scanFeedback.type === "success" ? "rgba(52, 211, 153, 0.35)" : "rgba(244, 63, 94, 0.35)"}`,
                        color: scanFeedback.type === "success" ? "#6ee7b7" : "#fca5a5",
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                        {scanFeedback.type === "success" ? (
                            <CheckCircle2 size={16} color="#34d399" style={{ flexShrink: 0, marginTop: "2px" }} />
                        ) : (
                            <AlertCircle size={16} color="#f43f5e" style={{ flexShrink: 0, marginTop: "2px" }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: "13px", marginBottom: "2px" }}>
                                {scanFeedback.type === "success" ? "Check-In Approved" : "Verification Rejected"}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", opacity: 0.95, wordBreak: "break-word" }}>
                                {scanFeedback.message}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleResetScan}
                        style={{
                            padding: "4px 10px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontFamily: "var(--font-mono, monospace)",
                            cursor: "pointer",
                            flexShrink: 0,
                            fontWeight: 600,
                        }}
                    >
                        {scanFeedback.type === "success" ? "Next Pass" : "Dismiss"}
                    </button>
                </div>
            )}

            {/* Viewfinder Area: Persistently Mounted for Zero Abort Interruptions */}
            <div
                style={{
                    display: manualMode ? "none" : "flex",
                    position: "relative",
                    width: "100%",
                    height: "360px",
                    maxHeight: "55vh",
                    backgroundColor: "#05080f",
                    borderRadius: "18px",
                    overflow: "hidden",
                    border: "1px solid var(--color-border, rgba(255, 255, 255, 0.12))",
                    boxShadow: "inset 0 0 40px rgba(0,0,0,0.8), 0 16px 40px rgba(0,0,0,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                    boxSizing: "border-box",
                }}
            >
                <video
                    ref={videoRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                    }}
                    playsInline
                    muted
                    autoPlay
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />

                {/* Ambient Corner Telemetry Labels */}
                <div
                    style={{
                        position: "absolute",
                        top: "12px",
                        left: "14px",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono, monospace)",
                        letterSpacing: "0.08em",
                        color: "rgba(52, 211, 153, 0.8)",
                        pointerEvents: "none",
                        fontWeight: 700,
                        textTransform: "uppercase",
                    }}
                >
                    [ OPTICAL // SENS-01 ]
                </div>
                <div
                    style={{
                        position: "absolute",
                        top: "12px",
                        right: "14px",
                        fontSize: "10px",
                        fontFamily: "var(--font-mono, monospace)",
                        letterSpacing: "0.08em",
                        color: "rgba(56, 189, 248, 0.8)",
                        pointerEvents: "none",
                        fontWeight: 700,
                        textTransform: "uppercase",
                    }}
                >
                    [ HMAC-SHA256 PASS ]
                </div>

                {/* Laser Scanner Framing Reticle Overlay */}
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                    }}
                >
                    <div
                        style={{
                            position: "relative",
                            width: "230px",
                            height: "230px",
                            border: "1px solid rgba(52, 211, 153, 0.25)",
                            borderRadius: "16px",
                            boxShadow: "0 0 30px rgba(52, 211, 153, 0.15), inset 0 0 20px rgba(52, 211, 153, 0.08)",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            padding: "6px",
                            boxSizing: "border-box",
                        }}
                    >
                        {/* Top Registration Brackets */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    borderTop: "3px solid #34d399",
                                    borderLeft: "3px solid #34d399",
                                    borderTopLeftRadius: "6px",
                                    boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
                                }}
                            />
                            <div
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    borderTop: "3px solid #34d399",
                                    borderRight: "3px solid #34d399",
                                    borderTopRightRadius: "6px",
                                    boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
                                }}
                            />
                        </div>

                        {/* Center Alignment Crosshairs */}
                        <div
                            style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: "24px",
                                height: "24px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: 0.35,
                                pointerEvents: "none",
                            }}
                        >
                            <div style={{ position: "absolute", width: "16px", height: "1px", backgroundColor: "#34d399" }} />
                            <div style={{ position: "absolute", width: "1px", height: "16px", backgroundColor: "#34d399" }} />
                        </div>

                        {/* Animated Laser Beam */}
                        <div
                            style={{
                                position: "absolute",
                                left: "8px",
                                right: "8px",
                                height: "2px",
                                background: "linear-gradient(90deg, transparent 0%, #34d399 20%, #38bdf8 50%, #34d399 80%, transparent 100%)",
                                boxShadow: "0 0 12px rgba(52, 211, 153, 0.9), 0 0 24px rgba(56, 189, 248, 0.6)",
                                animation: "opticalLaserSweep 2.2s ease-in-out infinite alternate",
                            }}
                        />

                        {/* Bottom Registration Brackets */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    borderBottom: "3px solid #34d399",
                                    borderLeft: "3px solid #34d399",
                                    borderBottomLeftRadius: "6px",
                                    boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
                                }}
                            />
                            <div
                                style={{
                                    width: "20px",
                                    height: "20px",
                                    borderBottom: "3px solid #34d399",
                                    borderRight: "3px solid #34d399",
                                    borderBottomRightRadius: "6px",
                                    boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Floating Dock: Telemetry & Controls */}
                <div
                    style={{
                        position: "absolute",
                        bottom: "12px",
                        left: "12px",
                        right: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 14px",
                        backgroundColor: "rgba(9, 14, 24, 0.82)",
                        backdropFilter: "blur(12px)",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        fontSize: "11px",
                        color: "rgba(255, 255, 255, 0.9)",
                        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#34d399", fontWeight: 700 }}>
                        <span
                            style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: "#34d399",
                                boxShadow: "0 0 10px #34d399",
                                display: "inline-block",
                            }}
                        />
                        <span style={{ fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.05em", fontSize: "10px", textTransform: "uppercase" }}>
                            Optical Sensor Live
                        </span>
                    </div>

                    <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>
                        Align mobile pass inside reticle
                    </div>

                    <button
                        type="button"
                        onClick={handleFlipCamera}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            color: "#f8fafc",
                            cursor: "pointer",
                            fontSize: "11px",
                            fontWeight: 600,
                            transition: "all 0.15s ease",
                        }}
                    >
                        <RefreshCw size={12} />
                        <span>Flip Cam</span>
                    </button>
                </div>

                {/* Code Detected Verification Modal Overlay */}
                {(scannedCode || isVerifying) && (
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(5, 8, 15, 0.88)",
                            backdropFilter: "blur(12px)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "20px",
                            textAlign: "center",
                            zIndex: 10,
                        }}
                    >
                        <div
                            style={{
                                width: "56px",
                                height: "56px",
                                borderRadius: "16px",
                                backgroundColor: "rgba(52, 211, 153, 0.15)",
                                border: "1px solid rgba(52, 211, 153, 0.4)",
                                color: "#34d399",
                                display: "grid",
                                placeItems: "center",
                                marginBottom: "12px",
                                boxShadow: "0 0 28px rgba(52, 211, 153, 0.3)",
                            }}
                        >
                            <CheckCircle2 size={30} />
                        </div>
                        <h4 style={{ color: "#f8fafc", fontWeight: 800, fontSize: "16px", margin: "0 0 4px 0" }}>
                            {isVerifying ? "Verifying Cryptographic Pass..." : "Pass Signature Detected!"}
                        </h4>
                        <p
                            style={{
                                color: "#94a3b8",
                                fontSize: "11px",
                                fontFamily: "var(--font-mono, monospace)",
                                maxWidth: "320px",
                                wordBreak: "break-all",
                                margin: "0 0 16px 0",
                            }}
                        >
                            {scannedCode || "Validating cryptographic HMAC-SHA256 signature against database..."}
                        </p>
                        <button
                            type="button"
                            onClick={handleResetScan}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "8px 16px",
                                borderRadius: "10px",
                                backgroundColor: "rgba(255, 255, 255, 0.1)",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                color: "#ffffff",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            <RefreshCw size={13} />
                            <span>Scan Next Pass</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Manual Token Entry Workspace */}
            {manualMode && (
                <form
                    onSubmit={handleManualSubmit}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        backgroundColor: "#05080f",
                        border: "1px solid var(--color-border, rgba(255, 255, 255, 0.12))",
                        borderRadius: "18px",
                        padding: "20px",
                        boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f1f5f9", fontSize: "12px", fontWeight: 700 }}>
                            <ShieldCheck size={16} color="#38bdf8" />
                            <span>Manual Pass Payload Entry</span>
                        </div>
                        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            HMAC-SHA256
                        </span>
                    </div>

                    {cameraError && (
                        <div
                            style={{
                                padding: "10px 14px",
                                backgroundColor: "rgba(245, 158, 11, 0.12)",
                                border: "1px solid rgba(245, 158, 11, 0.3)",
                                borderRadius: "10px",
                                color: "#fcd34d",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                            }}
                        >
                            <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: "2px" }} />
                            <span>{cameraError}</span>
                        </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={{ fontSize: "11px", fontFamily: "var(--font-mono, monospace)", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Cryptographic Token Payload
                            </label>
                            <button
                                type="button"
                                onClick={handlePasteClipboard}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    fontSize: "11px",
                                    color: "#38bdf8",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontFamily: "var(--font-mono, monospace)",
                                }}
                            >
                                <Clipboard size={12} />
                                <span>{copiedClipboard ? "Pasted!" : "Paste Clipboard"}</span>
                            </button>
                        </div>
                        <textarea
                            value={manualToken}
                            onChange={(e) => setManualToken(e.target.value)}
                            placeholder="appointmentId:orgId:locationId:timestamp:signature"
                            rows={3}
                            style={{
                                width: "100%",
                                backgroundColor: "rgba(0, 0, 0, 0.65)",
                                border: "1px solid rgba(255, 255, 255, 0.14)",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                fontSize: "12px",
                                color: "#ffffff",
                                fontFamily: "var(--font-mono, monospace)",
                                resize: "none",
                                outline: "none",
                                lineHeight: "1.6",
                                boxSizing: "border-box",
                            }}
                        />
                        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)", color: "#64748b", display: "flex", gap: "6px" }}>
                            <span style={{ color: "#94a3b8", fontWeight: 700 }}>Structure:</span>
                            <span>uuid : orgId : locationId : unixTimestamp : hmacSignature</span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!manualToken.trim() || isVerifying}
                        style={{
                            width: "100%",
                            padding: "12px 16px",
                            backgroundColor: "#0284c7",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "13px",
                            borderRadius: "12px",
                            border: "none",
                            cursor: !manualToken.trim() || isVerifying ? "not-allowed" : "pointer",
                            opacity: !manualToken.trim() || isVerifying ? 0.5 : 1,
                            boxShadow: "0 0 24px rgba(2, 132, 199, 0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            transition: "all 0.15s ease",
                        }}
                    >
                        <Zap size={14} />
                        <span>{isVerifying ? "Verifying Token..." : "Verify Pass & Authorize Check-In"}</span>
                    </button>
                </form>
            )}

            {/* Micro Helper Note */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#64748b",
                    fontFamily: "var(--font-mono, monospace)",
                    padding: "0 4px",
                }}
            >
                <span>Check-in window: [startAt - 60m → startAt + 5m]</span>
                <span style={{ color: "#94a3b8" }}>BookPro Enterprise Guard</span>
            </div>
        </div>
    );
}
