import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Download, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, ChevronLeft, ChevronRight, Check, X, Loader2, AlertTriangle, Plus, Target, Crosshair } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path for PDF.js - use local file
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Device marker colors by system
const SYSTEM_COLORS = {
    'CABLING': '#06b6d4',    // Cyan
    'ACCESS': '#10b981',     // Emerald
    'CCTV': '#f59e0b',       // Amber
    'FIRE': '#ef4444',       // Red
    'INTERCOM': '#8b5cf6',   // Purple
    'A/V': '#ec4899'         // Pink
};

// Confidence color gradient
const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return '#22c55e';  // Green - high confidence
    if (confidence >= 0.75) return '#eab308'; // Yellow - medium confidence
    if (confidence >= 0.5) return '#f97316';  // Orange - low confidence
    return '#ef4444';                          // Red - very low confidence
};

export default function FloorPlanOverlay({
    imageUrl,
    imageName,
    detectedDevices = [],
    onClose,
    onDeviceVerify,
    onDeviceReject,
    onAddDevice,
    onAnalyze,
    pdfFile,
    discrepancies = []
}) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [showMarkers, setShowMarkers] = useState(true);
    const [showConfidenceHeatmap, setShowConfidenceHeatmap] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [filterSystem, setFilterSystem] = useState('all');
    const [filterConfidence, setFilterConfidence] = useState('all'); // all, high, low
    const [verifiedDevices, setVerifiedDevices] = useState(new Set());
    const [rejectedDevices, setRejectedDevices] = useState(new Set());
    const [manualAddMode, setManualAddMode] = useState(false);
    const [manualDevices, setManualDevices] = useState([]);
    const [addingDeviceType, setAddingDeviceType] = useState('Data Outlet');
    const [addingDeviceSystem, setAddingDeviceSystem] = useState('CABLING');
    const containerRef = useRef(null);
    const imageContainerRef = useRef(null);

    // PDF rendering state
    const [pdfDoc, setPdfDoc] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [pdfImageUrl, setPdfImageUrl] = useState(null);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [pdfDimensions, setPdfDimensions] = useState({ width: 800, height: 600 });

    // Load PDF when component mounts or pdfFile changes
    useEffect(() => {
        const loadPdf = async () => {
            if (!pdfFile) return;

            setIsLoadingPdf(true);
            try {
                const arrayBuffer = await pdfFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
                setCurrentPage(1);
                console.log('[PDF] Loaded PDF with', pdf.numPages, 'pages');
            } catch (error) {
                console.error('[PDF] Error loading PDF:', error);
            }
            setIsLoadingPdf(false);
        };

        loadPdf();
    }, [pdfFile]);

    // Render current PDF page
    useEffect(() => {
        const renderPage = async () => {
            if (!pdfDoc || currentPage < 1 || currentPage > totalPages) return;

            try {
                const page = await pdfDoc.getPage(currentPage);
                const scale = 2;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                const imageUrl = canvas.toDataURL('image/png');
                setPdfImageUrl(imageUrl);
                setPdfDimensions({ width: viewport.width / scale, height: viewport.height / scale });
            } catch (error) {
                console.error('[PDF] Error rendering page:', error);
            }
        };

        renderPage();
    }, [pdfDoc, currentPage, totalPages]);

    const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1));
    const goToNextPage = () => setCurrentPage(p => Math.min(totalPages, p + 1));

    const displayImageUrl = pdfImageUrl || imageUrl;

    // Combine detected and manual devices
    const allDevices = [...detectedDevices, ...manualDevices];

    // Filter devices
    const filteredDevices = allDevices.filter(d => {
        if (filterSystem !== 'all' && d.system !== filterSystem) return false;
        if (filterConfidence === 'low' && (d.confidence || 1) >= 0.75) return false;
        if (filterConfidence === 'high' && (d.confidence || 1) < 0.75) return false;
        return true;
    });

    // Low confidence devices for alert
    const lowConfidenceDevices = allDevices.filter(d => (d.confidence || 1) < 0.75);

    // Zoom to device
    const zoomToDevice = useCallback((device) => {
        if (!device) return;

        // Calculate center position in percentage
        const centerX = device.x;
        const centerY = device.y;

        // Set zoom and pan to center on the device
        setZoom(2);
        setPan({
            x: -(centerX / 100 * pdfDimensions.width * 2) + window.innerWidth / 2,
            y: -(centerY / 100 * pdfDimensions.height * 2) + window.innerHeight / 2
        });
        setSelectedDevice(device);
    }, [pdfDimensions]);

    // Handle click to add manual device
    const handleImageClick = useCallback((e) => {
        if (!manualAddMode) return;

        const rect = imageContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const newDevice = {
            id: `manual-${Date.now()}`,
            type: addingDeviceType,
            system: addingDeviceSystem,
            x: x,
            y: y,
            width: 2,
            height: 2,
            confidence: 1.0,
            isManual: true,
            notes: 'Manually added'
        };

        setManualDevices(prev => [...prev, newDevice]);
        onAddDevice?.(newDevice);
    }, [manualAddMode, addingDeviceType, addingDeviceSystem, onAddDevice]);

    // Mouse handlers
    const handleMouseDown = (e) => {
        if (manualAddMode) return;
        if (e.button === 0) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(prev => Math.max(0.25, Math.min(4, prev + delta)));
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const verifyDevice = (id) => {
        setVerifiedDevices(prev => new Set([...prev, id]));
        setRejectedDevices(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        onDeviceVerify?.(id);
    };

    const rejectDevice = (id) => {
        setRejectedDevices(prev => new Set([...prev, id]));
        setVerifiedDevices(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        onDeviceReject?.(id);
    };

    const getMarkerColor = (device) => {
        if (rejectedDevices.has(device.id)) return '#666';
        if (verifiedDevices.has(device.id)) return '#22c55e';
        if (showConfidenceHeatmap) return getConfidenceColor(device.confidence || 0.85);
        return SYSTEM_COLORS[device.system] || '#888';
    };

    const downloadMarkedPlan = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            filteredDevices.forEach(device => {
                if (!showMarkers || rejectedDevices.has(device.id)) return;

                const color = getMarkerColor(device);
                const x = (device.x / 100) * img.width;
                const y = (device.y / 100) * img.height;
                const size = 20;

                ctx.strokeStyle = color;
                ctx.fillStyle = color + '40';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw device number
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(device.id.toString(), x, y + 3);

                // Draw label below
                ctx.fillStyle = color;
                ctx.font = '9px Arial';
                ctx.fillText(device.type, x, y + size + 8);
            });

            const link = document.createElement('a');
            link.download = `marked_floorplan_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        img.src = displayImageUrl || 'data:image/svg+xml,' + encodeURIComponent(`
            <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#1e293b"/>
                <text x="300" y="200" text-anchor="middle" fill="#64748b" font-size="20">Floor Plan Preview</text>
            </svg>
        `);
    };

    // Stats
    const stats = {
        total: allDevices.length,
        verified: verifiedDevices.size,
        rejected: rejectedDevices.size,
        pending: allDevices.length - verifiedDevices.size - rejectedDevices.size,
        lowConfidence: lowConfidenceDevices.length,
        manual: manualDevices.length
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-white font-bold">Floor Plan Verification</h2>
                        <p className="text-sm text-slate-500">{imageName || 'Floor Plan'} • {allDevices.length} devices detected</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-cyan-400">{stats.total}</p>
                        <p className="text-xs text-slate-500">Total</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-emerald-400">{stats.verified}</p>
                        <p className="text-xs text-slate-500">Verified</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
                        <p className="text-xs text-slate-500">Rejected</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
                        <p className="text-xs text-slate-500">Pending</p>
                    </div>
                    {stats.lowConfidence > 0 && (
                        <div className="text-center border-l border-slate-700 pl-4">
                            <p className="text-2xl font-bold text-orange-400">{stats.lowConfidence}</p>
                            <p className="text-xs text-slate-500">Low Conf.</p>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowMarkers(!showMarkers)}
                        className={`p-2 rounded-lg ${showMarkers ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}
                        title={showMarkers ? 'Hide Markers' : 'Show Markers'}
                    >
                        {showMarkers ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={() => setShowConfidenceHeatmap(!showConfidenceHeatmap)}
                        className={`p-2 rounded-lg ${showConfidenceHeatmap ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'}`}
                        title="Toggle Confidence Heatmap"
                    >
                        <Target className="w-5 h-5" />
                    </button>
                    <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                        <ZoomOut className="w-5 h-5" />
                    </button>
                    <button onClick={resetView} className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                        <RotateCcw className="w-5 h-5" />
                    </button>
                    <span className="text-slate-500 text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
                    {onAnalyze && (
                        <button
                            onClick={onAnalyze}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600"
                        >
                            🔍 Re-Analyze
                        </button>
                    )}
                    <button
                        onClick={downloadMarkedPlan}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-900/50 border-b border-slate-800 px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm">System:</span>
                    <button
                        onClick={() => setFilterSystem('all')}
                        className={`px-3 py-1 rounded-lg text-sm ${filterSystem === 'all' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                    >
                        All ({allDevices.length})
                    </button>
                    {Object.entries(SYSTEM_COLORS).map(([system, color]) => {
                        const count = allDevices.filter(d => d.system === system).length;
                        if (count === 0) return null;
                        return (
                            <button
                                key={system}
                                onClick={() => setFilterSystem(system)}
                                className={`px-3 py-1 rounded-lg text-sm flex items-center gap-2 ${filterSystem === system ? 'bg-white text-slate-900' : 'bg-slate-800'}`}
                                style={{ color: filterSystem === system ? '#1e293b' : color }}
                            >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                {system} ({count})
                            </button>
                        );
                    })}
                </div>

                <div className="border-l border-slate-700 pl-4 flex items-center gap-2">
                    <span className="text-slate-500 text-sm">Confidence:</span>
                    <button
                        onClick={() => setFilterConfidence('all')}
                        className={`px-3 py-1 rounded-lg text-sm ${filterConfidence === 'all' ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterConfidence('low')}
                        className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1 ${filterConfidence === 'low' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-orange-400'}`}
                    >
                        <AlertTriangle className="w-3 h-3" />
                        Low ({lowConfidenceDevices.length})
                    </button>
                    <button
                        onClick={() => setFilterConfidence('high')}
                        className={`px-3 py-1 rounded-lg text-sm ${filterConfidence === 'high' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-emerald-400'}`}
                    >
                        High
                    </button>
                </div>
            </div>

            {/* Low Confidence Alert */}
            {lowConfidenceDevices.length > 0 && !showConfidenceHeatmap && (
                <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-2 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-400" />
                    <span className="text-orange-300 text-sm">
                        <strong>{lowConfidenceDevices.length} devices</strong> have low confidence scores and may need verification
                    </span>
                    <button
                        onClick={() => setShowConfidenceHeatmap(true)}
                        className="ml-auto px-3 py-1 bg-orange-500/20 text-orange-400 rounded-lg text-sm hover:bg-orange-500/30"
                    >
                        Show Heatmap
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Floor Plan Viewer */}
                <div
                    ref={containerRef}
                    className={`flex-1 overflow-hidden bg-slate-950 ${manualAddMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    onClick={handleImageClick}
                >
                    <div
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transformOrigin: 'center center',
                            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                        }}
                        className="relative w-full h-full flex items-center justify-center"
                    >
                        {/* Floor Plan Image */}
                        <div
                            ref={imageContainerRef}
                            className="relative bg-slate-800 rounded-lg shadow-2xl"
                            style={{ width: pdfDimensions.width + 'px', height: pdfDimensions.height + 'px', maxWidth: '90vw', maxHeight: '70vh' }}
                        >
                            {isLoadingPdf ? (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <div className="text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                        <p>Loading PDF...</p>
                                    </div>
                                </div>
                            ) : displayImageUrl ? (
                                <img src={displayImageUrl} alt="Floor Plan" className="w-full h-full object-contain" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                    <div className="text-center">
                                        <p className="text-lg">Floor Plan Preview</p>
                                        <p className="text-sm">Upload a floor plan to see detected devices</p>
                                    </div>
                                </div>
                            )}

                            {/* PDF Page Navigation */}
                            {totalPages > 1 && (
                                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                                    <button onClick={goToPrevPage} disabled={currentPage <= 1} className="p-1 text-white disabled:text-slate-600">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <span className="text-white text-sm">Page {currentPage} of {totalPages}</span>
                                    <button onClick={goToNextPage} disabled={currentPage >= totalPages} className="p-1 text-white disabled:text-slate-600">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            )}

                            {/* Device Markers */}
                            {showMarkers && filteredDevices.map(device => {
                                const isLowConfidence = (device.confidence || 1) < 0.75;
                                const isRejected = rejectedDevices.has(device.id);

                                if (isRejected) return null;

                                return (
                                    <div
                                        key={device.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedDevice(device);
                                        }}
                                        className={`absolute cursor-pointer transition-transform hover:scale-125 ${selectedDevice?.id === device.id ? 'scale-150' : ''}`}
                                        style={{
                                            left: `${device.x}%`,
                                            top: `${device.y}%`,
                                            transform: 'translate(-50%, -50%)',
                                            width: 24,
                                            height: 24,
                                        }}
                                        title={`${device.type} (${Math.round((device.confidence || 0.85) * 100)}% confidence)`}
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24">
                                            <circle
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                fill={getMarkerColor(device) + '80'}
                                                stroke={getMarkerColor(device)}
                                                strokeWidth={isLowConfidence ? "3" : "2"}
                                                strokeDasharray={isLowConfidence ? "4,2" : "none"}
                                            />
                                            {verifiedDevices.has(device.id) && (
                                                <path d="M8 12l2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                                            )}
                                            {device.isManual && (
                                                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">M</text>
                                            )}
                                        </svg>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Device List Sidebar */}
                <div className="w-80 bg-slate-900 border-l border-slate-800 overflow-y-auto flex flex-col">
                    <div className="p-4 border-b border-slate-800">
                        <h3 className="font-bold text-white">Detected Devices</h3>
                        <p className="text-sm text-slate-500">Click marker or list item to inspect</p>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
                        {filteredDevices.map(device => {
                            const isLowConfidence = (device.confidence || 1) < 0.75;

                            return (
                                <div
                                    key={device.id}
                                    className={`p-3 hover:bg-slate-800/50 cursor-pointer ${selectedDevice?.id === device.id ? 'bg-slate-800' : ''}`}
                                    onClick={() => {
                                        setSelectedDevice(device);
                                        zoomToDevice(device);
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <span
                                                    className="w-4 h-4 rounded-full block"
                                                    style={{ backgroundColor: getMarkerColor(device) }}
                                                />
                                                {isLowConfidence && (
                                                    <AlertTriangle className="w-3 h-3 text-orange-400 absolute -top-1 -right-1" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-medium">{device.type}</p>
                                                <p className="text-xs text-slate-500">
                                                    {device.system} • {Math.round((device.confidence || 0.85) * 100)}%
                                                    {device.isManual && ' • Manual'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); zoomToDevice(device); }}
                                                className="p-1.5 rounded bg-slate-700 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-400"
                                                title="Zoom to device"
                                            >
                                                <Crosshair className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); verifyDevice(device.id); }}
                                                className={`p-1.5 rounded ${verifiedDevices.has(device.id) ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'}`}
                                                title="Verify"
                                            >
                                                <Check className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); rejectDevice(device.id); }}
                                                className={`p-1.5 rounded ${rejectedDevices.has(device.id) ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400'}`}
                                                title="Reject (false positive)"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Add Missed Device Section */}
                    <div className="p-4 border-t border-slate-800 bg-slate-900/80">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-white font-medium">Add Missed Device</span>
                            <button
                                onClick={() => setManualAddMode(!manualAddMode)}
                                className={`px-3 py-1 rounded-lg text-sm flex items-center gap-1 ${manualAddMode ? 'bg-amber-500 text-white' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
                            >
                                {manualAddMode ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {manualAddMode ? 'Cancel' : 'Add Mode'}
                            </button>
                        </div>

                        {manualAddMode && (
                            <div className="space-y-2">
                                <select
                                    value={addingDeviceSystem}
                                    onChange={(e) => setAddingDeviceSystem(e.target.value)}
                                    className="w-full bg-slate-800 text-white text-sm rounded px-2 py-1.5 border border-slate-700"
                                >
                                    {Object.keys(SYSTEM_COLORS).map(sys => (
                                        <option key={sys} value={sys}>{sys}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={addingDeviceType}
                                    onChange={(e) => setAddingDeviceType(e.target.value)}
                                    placeholder="Device type..."
                                    className="w-full bg-slate-800 text-white text-sm rounded px-2 py-1.5 border border-slate-700"
                                />
                                <p className="text-xs text-amber-400">Click on the floor plan to add device</p>
                            </div>
                        )}

                        {manualDevices.length > 0 && (
                            <p className="text-xs text-slate-500 mt-2">
                                {manualDevices.length} device(s) manually added
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Selected Device Details Panel */}
            {selectedDevice && (
                <div className="absolute bottom-4 left-4 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl max-w-sm">
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="font-bold text-white">{selectedDevice.type}</h4>
                            <p className="text-sm text-slate-400">{selectedDevice.system}</p>
                        </div>
                        <button onClick={() => setSelectedDevice(null)} className="text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                            <p className="text-slate-500">Confidence</p>
                            <p className={`font-medium ${(selectedDevice.confidence || 0.85) < 0.75 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                {Math.round((selectedDevice.confidence || 0.85) * 100)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Position</p>
                            <p className="text-white font-medium">
                                {selectedDevice.x?.toFixed(1)}%, {selectedDevice.y?.toFixed(1)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500">Zone</p>
                            <p className="text-white font-medium">{selectedDevice.zone || 'N/A'}</p>
                        </div>
                    </div>
                    {selectedDevice.notes && (
                        <p className="mt-2 text-xs text-slate-400">{selectedDevice.notes}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={() => verifyDevice(selectedDevice.id)}
                            className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 text-sm font-medium flex items-center justify-center gap-1"
                        >
                            <Check className="w-4 h-4" /> Verify
                        </button>
                        <button
                            onClick={() => rejectDevice(selectedDevice.id)}
                            className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 text-sm font-medium flex items-center justify-center gap-1"
                        >
                            <X className="w-4 h-4" /> Reject
                        </button>
                    </div>
                </div>
            )}

            {/* Confidence Legend */}
            {showConfidenceHeatmap && (
                <div className="absolute bottom-4 right-96 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
                    <p className="text-xs text-slate-400 mb-2 font-medium">Confidence Heatmap</p>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-green-500" />
                            <span className="text-xs text-slate-300">90%+ High</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-yellow-500" />
                            <span className="text-xs text-slate-300">75-90% Medium</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-orange-500" />
                            <span className="text-xs text-slate-300">50-75% Low</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-red-500" />
                            <span className="text-xs text-slate-300">&lt;50% Very Low</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
