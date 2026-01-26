import React, { useEffect, useRef, useState } from 'react';
import { labelScannerService } from '../../services/labelScannerService';
import type { LabelScanResult } from '../../types/labelScanner';
import { analyticsService } from '../../services/analyticsService';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase/firebaseConfig';
import { showToast } from '../Toast';
import { userSettingsService } from '../../services/userSettingsService';

interface LabelScannerProps {
  onScan: (result: LabelScanResult) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

const LabelScanner: React.FC<LabelScannerProps> = ({ onScan, onError, onClose }) => {
  const [user] = useAuthState(auth);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<LabelScanResult | null>(null);

  useEffect(() => {
    const checkCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Stop immediately to check availability
        setHasCamera(true);
      } catch (err) {
        setHasCamera(false);
        setError('Camera not available. Please grant camera permissions.');
      }
    };
    checkCamera();
  }, []);

  useEffect(() => {
    if (!videoRef.current || !hasCamera || capturedImage) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } // Prefer back camera on mobile
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError((err as Error).message);
        if (onError) onError(err as Error);
        setHasCamera(false);
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [hasCamera, capturedImage, onError]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      
      // Stop camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setScanResult(null);
    setError(null);
  };

  const processImage = async () => {
    if (!capturedImage || !user) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Convert data URL to File
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], 'label.jpg', { type: 'image/jpeg' });

      // Scan label
      const result = await labelScannerService.scanLabel(file, user.uid);
      setScanResult(result);

      // Track engagement
      await analyticsService.trackEngagement(user.uid, 'label_scanned', {
        feature: 'label_scanner',
        hasQuantity: result.quantity !== undefined,
        hasExpirationDate: result.expirationDate !== null
      });
    } catch (err) {
      // Handle first scan warning
      if (err instanceof Error && err.message === 'FIRST_SCAN_WARNING') {
        showToast('Please adjust your region in settings before you scan', 'info');
        // Mark warning as seen
        try {
          const settings = await userSettingsService.getUserSettings(user.uid);
          await userSettingsService.updateUserSettings({
            ...(settings || {
              userId: user.uid,
              reminderDays: 7,
              notificationsEnabled: false,
              isPremium: false,
              dateFormat: 'MM/DD/YYYY',
              weightUnit: 'pounds'
            }),
            userId: user.uid,
            hasSeenScanWarning: true
          });
        } catch (settingsError) {
          console.error('Error updating scan warning flag:', settingsError);
        }
        setIsProcessing(false);
        return; // Don't proceed with scan
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to scan label';
      setError(errorMessage);
      if (onError) onError(err as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndAdd = () => {
    if (scanResult) {
      onScan(scanResult);
    }
  };

  if (hasCamera === null) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Checking camera availability...</p>
      </div>
    );
  }

  if (hasCamera === false) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '1rem' }}>
          Camera not available. Please grant camera permissions or use manual entry.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#002B4D',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto', padding: '1rem' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      
      {!capturedImage ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              borderRadius: '12px',
              backgroundColor: '#000',
              transform: 'scaleX(-1)' // Mirror for better UX
            }}
          />
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Position entire label in frame
            </p>
            <button
              onClick={capturePhoto}
              style={{
                padding: '1rem 2rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '80px',
                height: '80px',
                fontSize: '1.5rem',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              📷
            </button>
          </div>
        </>
      ) : (
        <>
          <img
            src={capturedImage}
            alt="Captured label"
            style={{
              width: '100%',
              borderRadius: '12px',
              backgroundColor: '#000'
            }}
          />
          
          {isProcessing ? (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: '#6b7280' }}>Scanning label with AI...</p>
            </div>
          ) : scanResult ? (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
                Extracted Information
              </h3>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Item:</strong> {scanResult.itemName}
              </div>
              {scanResult.quantity !== undefined && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Quantity:</strong> {scanResult.quantity}
                </div>
              )}
              {scanResult.expirationDate && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Expiration Date:</strong> {scanResult.expirationDate.toLocaleDateString()}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={retakePhoto}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Retake
                </button>
                <button
                  onClick={confirmAndAdd}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#002B4D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Add to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={retakePhoto}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Retake
              </button>
              <button
                onClick={processImage}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.6 : 1
                }}
              >
                {isProcessing ? 'Processing...' : 'Scan Label'}
              </button>
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#fee2e2', 
          borderRadius: '8px', 
          marginTop: '1rem' 
        }}>
          <p style={{ color: '#ef4444', margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {onClose && !isProcessing && (
        <button
          onClick={onClose}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default LabelScanner;
