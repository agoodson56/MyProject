import React, { useState, useEffect } from 'react';
import { User, Calendar, Clock, Package, CheckCircle, AlertTriangle, Save, Plus, Trash2, ChevronDown, ChevronRight, BarChart3, Target, Edit2, X, Settings, Lock } from 'lucide-react';

// LocalStorage keys
const STORAGE_KEY = 'lv-takeoff-daily-logs';
const PROGRESS_STORAGE_KEY = 'lv-takeoff-item-progress';
const PASSWORDS_STORAGE_KEY = 'lv-takeoff-passwords';

// Initial progress state generator
export function initializeProgress(bomData) {
    const modules = [];

    // Add MDF modules
    const mdfSections = [
        { key: 'buildout', name: 'MDF Buildout' },
        { key: 'deviceMaterial', name: 'MDF Device Material' },
        { key: 'terminations', name: 'MDF Terminations' },
        { key: 'cableRuns', name: 'MDF Cable Runs' },
        { key: 'deviceInstall', name: 'MDF Device Install' },
        { key: 'backbone', name: 'MDF Backbone' }
    ];

    mdfSections.forEach(s => {
        if (bomData.mdf[s.key]?.materials) {
            modules.push({
                id: `mdf-${s.key}`,
                closet: 'MDF',
                name: s.name,
                materials: bomData.mdf[s.key].materials.map((m, idx) => ({
                    ...m,
                    materialId: `mdf-${s.key}-${idx}`,
                    installed: 0,
                    laborUsed: 0,
                    totalCost: m.qty * m.unitCost,
                    totalLabor: m.qty * m.laborHrs
                })),
                laborUsed: 0
            });
        }
    });

    // Add IDF modules
    bomData.idfs.forEach(idf => {
        const idfSections = [
            { key: 'buildout', name: `${idf.name} Buildout` },
            { key: 'deviceMaterial', name: `${idf.name} Device Material` },
            { key: 'terminations', name: `${idf.name} Terminations` },
            { key: 'cableRuns', name: `${idf.name} Cable Runs` },
            { key: 'deviceInstall', name: `${idf.name} Device Install` },
            { key: 'backboneReceive', name: `${idf.name} Backbone` }
        ];

        idfSections.forEach(s => {
            if (idf[s.key]?.materials) {
                modules.push({
                    id: `${idf.name.toLowerCase()}-${s.key}`,
                    closet: idf.name,
                    name: s.name,
                    materials: idf[s.key].materials.map((m, idx) => ({
                        ...m,
                        materialId: `${idf.name.toLowerCase()}-${s.key}-${idx}`,
                        installed: 0,
                        laborUsed: 0,
                        totalCost: m.qty * m.unitCost,
                        totalLabor: m.qty * m.laborHrs
                    })),
                    laborUsed: 0
                });
            }
        });
    });

    return modules;
}

function ProgressBar({ value, max, color = 'cyan' }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
                className={`h-full bg-gradient-to-r from-${color}-500 to-${color}-400 transition-all duration-300`}
                style={{ width: `${Math.min(pct, 100)}%` }}
            />
        </div>
    );
}

function DailyLogEntry({ entry, onDelete }) {
    return (
        <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
            <div className="flex items-center gap-4">
                <div className="text-sm">
                    <span className="text-white">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
                <div>
                    <span className="font-medium">{entry.item}</span>
                    <span className="text-white mx-2">•</span>
                    <span className="text-emerald-400">+{entry.qtyInstalled} {entry.unit}</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-cyan-400">{entry.hoursUsed}h</span>
                <button onClick={onDelete} className="p-1 hover:bg-slate-700 rounded transition-colors">
                    <Trash2 className="w-4 h-4 text-white hover:text-red-400" />
                </button>
            </div>
        </div>
    );
}

// Editable cell component for inline editing
function EditableCell({ value, unit, onSave, color = 'emerald', isHours = false }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);

    const handleSave = () => {
        const newValue = isHours ? parseFloat(editValue) || 0 : parseInt(editValue) || 0;
        onSave(newValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    type="number"
                    step={isHours ? "0.25" : "1"}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    autoFocus
                    className="w-16 px-2 py-1 bg-slate-900 border border-cyan-500 rounded text-sm text-right focus:outline-none"
                />
                <span className="text-xs text-slate-500">{unit}</span>
            </div>
        );
    }

    return (
        <button
            onClick={() => { setEditValue(value); setIsEditing(true); }}
            className={`group flex items-center gap-1 hover:bg-slate-800/50 px-2 py-1 rounded transition-colors`}
        >
            <span className={`text-${color}-400`}>{isHours ? value.toFixed(1) : value}</span>
            <span className="text-slate-500 text-xs">{unit}</span>
            <Edit2 className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

function ModuleCard({ module, canEdit, onUpdateMaterial, dailyLogs, onAddLog, onDeleteLog }) {
    const [expanded, setExpanded] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedItem, setSelectedItem] = useState('');
    const [qtyInstalled, setQtyInstalled] = useState('');
    const [hoursUsed, setHoursUsed] = useState('');

    // Calculate totals
    const totalQty = module.materials.reduce((sum, m) => sum + m.qty, 0);
    const installedQty = module.materials.reduce((sum, m) => sum + m.installed, 0);
    const totalLabor = module.materials.reduce((sum, m) => sum + m.totalLabor, 0);
    const laborUsed = module.materials.reduce((sum, m) => sum + (m.laborUsed || 0), 0);
    const totalCost = module.materials.reduce((sum, m) => sum + m.totalCost, 0);
    const installedCost = module.materials.reduce((sum, m) => sum + (m.installed * m.unitCost), 0);

    const qtyPct = totalQty > 0 ? (installedQty / totalQty) * 100 : 0;
    const laborPct = totalLabor > 0 ? (laborUsed / totalLabor) * 100 : 0;

    const moduleLogs = dailyLogs.filter(l => l.moduleId === module.id);

    const handleAddEntry = () => {
        if (!selectedItem || !qtyInstalled) return;

        const material = module.materials.find(m => m.item === selectedItem);
        if (!material) return;

        const hoursValue = parseFloat(hoursUsed) || 0;

        onAddLog({
            id: Date.now(),
            moduleId: module.id,
            date: new Date().toISOString(),
            item: selectedItem,
            unit: material.unit,
            qtyInstalled: parseInt(qtyInstalled),
            hoursUsed: hoursValue
        });

        setSelectedItem('');
        setQtyInstalled('');
        setHoursUsed('');
        setShowAddForm(false);
    };

    // Check if over budget
    const materialOver = module.materials.some(m => m.installed > m.qty);
    const laborOver = laborUsed > totalLabor;

    return (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${qtyPct >= 100 ? 'bg-emerald-500' : qtyPct > 0 ? 'bg-amber-500' : 'bg-slate-600'}`} />
                    <div className="text-left">
                        <p className="font-medium text-slate-800">{module.name}</p>
                        <p className="text-xs text-slate-600">{module.closet}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    {/* Material Status */}
                    <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full ${materialOver ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'}`} />
                        <div className="w-32">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-700 font-semibold">Material</span>
                                <span className={materialOver ? 'text-red-600' : 'text-emerald-600'}>{qtyPct.toFixed(0)}%</span>
                            </div>
                            <ProgressBar value={installedQty} max={totalQty} color={materialOver ? 'red' : 'emerald'} />
                        </div>
                    </div>
                    {/* Labor Status */}
                    <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full ${laborOver ? 'bg-red-500 shadow-lg shadow-red-500/50' : 'bg-emerald-500 shadow-lg shadow-emerald-500/50'}`} />
                        <div className="w-32">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-700 font-semibold">Labor</span>
                                <span className={laborOver ? 'text-red-600' : 'text-cyan-600'}>{laborPct.toFixed(0)}%</span>
                            </div>
                            <ProgressBar value={laborUsed} max={totalLabor} color={laborOver ? 'red' : 'cyan'} />
                        </div>
                    </div>
                    <div className="text-right w-24">
                        <p className="text-xs text-slate-600 font-semibold">Remaining</p>
                        <p className="font-semibold text-amber-600">${(totalCost - installedCost).toLocaleString()}</p>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                </div>
            </button>

            {expanded && (
                <div className="p-4 pt-0 space-y-4">
                    {/* Material Progress Table with Editable Cells */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-white border-b border-slate-800">
                                    <th className="text-left pb-2 font-medium">Item</th>
                                    <th className="text-right pb-2 font-medium">Required</th>
                                    <th className="text-right pb-2 font-medium">Installed</th>
                                    <th className="text-right pb-2 font-medium">Labor Budget</th>
                                    <th className="text-right pb-2 font-medium">Labor Used</th>
                                    <th className="text-right pb-2 font-medium">Remaining</th>
                                    <th className="text-right pb-2 font-medium">Progress</th>
                                </tr>
                            </thead>
                            <tbody>
                                {module.materials.map((m, i) => {
                                    const remaining = m.qty - m.installed;
                                    const pct = m.qty > 0 ? (m.installed / m.qty) * 100 : 0;
                                    const laborRemaining = m.totalLabor - (m.laborUsed || 0);
                                    return (
                                        <tr key={i} className="border-b border-slate-800/30">
                                            <td className="py-2">{m.item}</td>
                                            <td className="py-2 text-right text-white">{m.qty} {m.unit}</td>
                                            <td className="py-2 text-right">
                                                {canEdit ? (
                                                    <EditableCell
                                                        value={m.installed}
                                                        unit={m.unit}
                                                        color="emerald"
                                                        onSave={(val) => onUpdateMaterial(module.id, m.materialId, 'installed', val)}
                                                    />
                                                ) : (
                                                    <span className="text-emerald-400">{m.installed} {m.unit}</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-right text-slate-400">{m.totalLabor.toFixed(1)}h</td>
                                            <td className="py-2 text-right">
                                                {canEdit ? (
                                                    <EditableCell
                                                        value={m.laborUsed || 0}
                                                        unit="h"
                                                        color="cyan"
                                                        isHours={true}
                                                        onSave={(val) => onUpdateMaterial(module.id, m.materialId, 'laborUsed', val)}
                                                    />
                                                ) : (
                                                    <span className="text-cyan-400">{(m.laborUsed || 0).toFixed(1)}h</span>
                                                )}
                                            </td>
                                            <td className="py-2 text-right text-amber-400">{remaining} {m.unit}</td>
                                            <td className="py-2 text-right">
                                                <div className="w-20 ml-auto">
                                                    <ProgressBar value={m.installed} max={m.qty} color={pct >= 100 ? 'emerald' : 'cyan'} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Labor Summary */}
                    <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                        <span className="text-white">Labor Hours</span>
                        <div className="flex items-center gap-4">
                            <span>Budgeted: <span className="text-cyan-400 font-medium">{totalLabor.toFixed(1)}h</span></span>
                            <span>Used: <span className={`font-medium ${laborUsed > totalLabor ? 'text-red-400' : 'text-emerald-400'}`}>{laborUsed.toFixed(1)}h</span></span>
                            <span>Remaining: <span className="text-amber-400 font-medium">{Math.max(0, totalLabor - laborUsed).toFixed(1)}h</span></span>
                        </div>
                    </div>

                    {/* Daily Logs */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-white">Daily Log Entries</h4>
                            <button
                                onClick={() => setShowAddForm(!showAddForm)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Entry
                            </button>
                        </div>

                        {showAddForm && (
                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs text-white mb-1">Material Item</label>
                                        <select
                                            value={selectedItem}
                                            onChange={(e) => setSelectedItem(e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                        >
                                            <option value="">Select item...</option>
                                            {module.materials.map((m, i) => (
                                                <option key={i} value={m.item}>{m.item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-white mb-1">Qty Installed</label>
                                        <input
                                            type="number"
                                            value={qtyInstalled}
                                            onChange={(e) => setQtyInstalled(e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-white mb-1">Hours Used</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={hoursUsed}
                                            onChange={(e) => setHoursUsed(e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={() => setShowAddForm(false)}
                                        className="px-4 py-2 text-sm text-white hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddEntry}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
                                    >
                                        <Save className="w-4 h-4" />
                                        Save Entry
                                    </button>
                                </div>
                            </div>
                        )}

                        {moduleLogs.length > 0 ? (
                            <div className="space-y-2">
                                {moduleLogs.map(log => (
                                    <DailyLogEntry
                                        key={log.id}
                                        entry={log}
                                        onDelete={() => onDeleteLog(log.id)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-white text-center py-4">No entries yet. Add your first daily log.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Password Settings Modal
function PasswordSettings({ passwords, onSave, onClose }) {
    const [estimatorPw, setEstimatorPw] = useState(passwords.estimator);
    const [pmPw, setPmPw] = useState(passwords.pm);

    const handleSave = () => {
        onSave({ estimator: estimatorPw, pm: pmPw });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-96">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-400" />
                        Password Settings
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Estimator Password</label>
                        <input
                            type="text"
                            value={estimatorPw}
                            onChange={(e) => setEstimatorPw(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">PM Password</label>
                        <input
                            type="text"
                            value={pmPw}
                            onChange={(e) => setPmPw(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                    >
                        Save Passwords
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProjectManagerPortal({ bomData, canEdit = true, passwords, onPasswordChange }) {
    const [modules, setModules] = useState(() => initializeProgress(bomData));
    const [dailyLogs, setDailyLogs] = useState([]);
    const [activeCloset, setActiveCloset] = useState('ALL');
    const [isLoaded, setIsLoaded] = useState(false);
    const [showPasswordSettings, setShowPasswordSettings] = useState(false);

    // Load saved progress from localStorage
    useEffect(() => {
        try {
            // Load daily logs
            const savedLogs = localStorage.getItem(STORAGE_KEY);
            if (savedLogs) {
                setDailyLogs(JSON.parse(savedLogs));
            }

            // Load item progress (installed/laborUsed per material)
            const savedProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
            if (savedProgress) {
                const progressData = JSON.parse(savedProgress);
                const updated = initializeProgress(bomData);

                // Apply saved progress to modules
                updated.forEach(module => {
                    module.materials.forEach(material => {
                        if (progressData[material.materialId]) {
                            material.installed = progressData[material.materialId].installed || 0;
                            material.laborUsed = progressData[material.materialId].laborUsed || 0;
                        }
                    });
                });

                setModules(updated);
                console.log('✅ Loaded saved item progress');
            }
        } catch (err) {
            console.error('Failed to load saved data:', err);
        }
        setIsLoaded(true);
    }, []);

    // Save item progress whenever modules change
    useEffect(() => {
        if (isLoaded) {
            try {
                // Build progress object
                const progressData = {};
                modules.forEach(module => {
                    module.materials.forEach(material => {
                        if (material.installed > 0 || material.laborUsed > 0) {
                            progressData[material.materialId] = {
                                installed: material.installed,
                                laborUsed: material.laborUsed
                            };
                        }
                    });
                });
                localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressData));
            } catch (err) {
                console.error('Failed to save progress:', err);
            }
        }
    }, [modules, isLoaded]);

    // Save daily logs
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dailyLogs));
            } catch (err) {
                console.error('Failed to save daily logs:', err);
            }
        }
    }, [dailyLogs, isLoaded]);

    // Update a specific material's installed qty or laborUsed
    const handleUpdateMaterial = (moduleId, materialId, field, value) => {
        setModules(prev => prev.map(module => {
            if (module.id === moduleId) {
                return {
                    ...module,
                    materials: module.materials.map(mat => {
                        if (mat.materialId === materialId) {
                            return { ...mat, [field]: value };
                        }
                        return mat;
                    })
                };
            }
            return module;
        }));
    };

    const handleAddLog = (log) => {
        setDailyLogs(prev => [...prev, log]);
    };

    const handleDeleteLog = (logId) => {
        setDailyLogs(prev => prev.filter(l => l.id !== logId));
    };

    // Calculate project-level stats
    const totalMaterial = modules.reduce((sum, m) => sum + m.materials.reduce((s, mat) => s + mat.totalCost, 0), 0);
    const installedMaterial = modules.reduce((sum, m) => sum + m.materials.reduce((s, mat) => s + (mat.installed * mat.unitCost), 0), 0);
    const totalLabor = modules.reduce((sum, m) => sum + m.materials.reduce((s, mat) => s + mat.totalLabor, 0), 0);
    const usedLabor = modules.reduce((sum, m) => sum + m.materials.reduce((s, mat) => s + (mat.laborUsed || 0), 0), 0);

    const closets = ['ALL', 'MDF', ...bomData.idfs.map(i => i.name)];
    const filteredModules = activeCloset === 'ALL' ? modules : modules.filter(m => m.closet === activeCloset);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Project Manager Portal</h2>
                    <p className="text-white">Track daily installation progress</p>
                </div>
                <div className="flex items-center gap-3">
                    {canEdit && (
                        <button
                            onClick={() => setShowPasswordSettings(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                            Passwords
                        </button>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl">
                        <User className="w-4 h-4 text-white" />
                        <span className="text-sm">Lead Technician</span>
                    </div>
                </div>
            </div>

            {/* Password Settings Modal */}
            {showPasswordSettings && (
                <PasswordSettings
                    passwords={passwords || { estimator: 'Admin123', pm: 'Admin123' }}
                    onSave={(newPasswords) => {
                        onPasswordChange?.(newPasswords);
                        // Also save to localStorage
                        localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(newPasswords));
                    }}
                    onClose={() => setShowPasswordSettings(false)}
                />
            )}

            {/* Project Overview */}
            <div className="grid grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Package className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs text-white">Material Progress</p>
                            <p className="text-xl font-bold">{((installedMaterial / totalMaterial) * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                    <ProgressBar value={installedMaterial} max={totalMaterial} color="emerald" />
                    <p className="text-xs text-white mt-2">${installedMaterial.toLocaleString()} / ${totalMaterial.toLocaleString()}</p>
                </div>

                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                            <p className="text-xs text-white">Labor Progress</p>
                            <p className="text-xl font-bold">{((usedLabor / totalLabor) * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                    <ProgressBar value={usedLabor} max={totalLabor} color={usedLabor > totalLabor ? 'red' : 'cyan'} />
                    <p className="text-xs text-white mt-2">{usedLabor.toFixed(1)}h / {totalLabor.toFixed(1)}h</p>
                </div>

                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <Target className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xs text-white">Remaining Material</p>
                            <p className="text-xl font-bold text-amber-400">${(totalMaterial - installedMaterial).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-xs text-white">Remaining Labor</p>
                            <p className="text-xl font-bold text-purple-400">{Math.max(0, totalLabor - usedLabor).toFixed(1)}h</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Closet Filter */}
            <div className="flex items-center gap-2">
                {closets.map(c => (
                    <button
                        key={c}
                        onClick={() => setActiveCloset(c)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeCloset === c
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800/50 text-white border border-transparent hover:bg-slate-800'
                            }`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* Module List */}
            {!canEdit && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400 text-sm">
                        🔒 <strong>View Only Mode</strong> - PM password required to make changes
                    </p>
                </div>
            )}
            <div className="space-y-3">
                {filteredModules.map(module => (
                    <ModuleCard
                        key={module.id}
                        module={module}
                        canEdit={canEdit}
                        onUpdateMaterial={handleUpdateMaterial}
                        dailyLogs={dailyLogs}
                        onAddLog={canEdit ? handleAddLog : () => { }}
                        onDeleteLog={canEdit ? handleDeleteLog : () => { }}
                    />
                ))}
            </div>
        </div>
    );
}
