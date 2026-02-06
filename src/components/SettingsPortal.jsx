import React, { useState } from 'react';
import { Settings, DollarSign, Percent, Shield, Clock, Users, Wrench, Save, RotateCcw } from 'lucide-react';

const DEFAULT_SETTINGS = {
    laborRates: {
        technician: 65,
        leadTech: 85,
        projectManager: 95,
        apprentice: 45
    },
    markup: {
        materials: 15,
        labor: 0,
        equipment: 10
    },
    warranty: {
        percentage: 3,
        flatFee: 0,
        type: 'percentage' // 'percentage' or 'flat'
    },
    overhead: {
        percentage: 10
    },
    profit: {
        percentage: 10
    },
    // Cabling Parameters
    cabling: {
        avgCableRunLength: 150,    // Average cable run in feet
        serviceLoopLength: 10,     // Service loop per drop in feet
        wastePercentage: 5,        // Cable waste percentage
        jHookSpacing: 8,           // J-hook spacing in feet
        jHookCapacity: 64,         // Max cables per J-hook (CAT64HP)
        feetPerBox: 1000           // Feet per cable box
    },
    // Systems to include in bid
    systems: {
        cabling: true,      // Structured Cabling / Datacom
        access: true,       // Access Control
        cctv: true,         // CCTV / Video Surveillance
        fire: true,         // Fire Alarm
        intercom: true,     // Intercom / Paging
        audioVisual: false  // Audio/Visual (off by default)
    }
};

function SettingCard({ title, icon: Icon, children, color = 'cyan' }) {
    return (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
            <div className={`px-5 py-4 border-b border-slate-800/50 bg-${color}-500/10`}>
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-${color}-500/20 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 text-${color}-400`} />
                    </div>
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                </div>
            </div>
            <div className="p-5">
                {children}
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, prefix, suffix, type = 'number', step = '0.01', min = '0' }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-slate-800/30 last:border-0">
            <label className="text-white font-medium">{label}</label>
            <div className="flex items-center gap-2">
                {prefix && <span className="text-slate-400">{prefix}</span>}
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    step={step}
                    min={min}
                    className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-right text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                />
                {suffix && <span className="text-slate-400">{suffix}</span>}
            </div>
        </div>
    );
}

export default function SettingsPortal({ settings, onSettingsChange, passwords, onPasswordsChange, onResetProgress }) {
    const [localSettings, setLocalSettings] = useState(settings || DEFAULT_SETTINGS);
    const [localPasswords, setLocalPasswords] = useState(passwords || { estimator: 'Admin123', pm: 'Admin123' });
    const [saved, setSaved] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetComplete, setResetComplete] = useState(false);

    const updateSetting = (category, key, value) => {
        setLocalSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: value
            }
        }));
        setSaved(false);
    };

    const handleSave = () => {
        onSettingsChange(localSettings);
        if (onPasswordsChange) onPasswordsChange(localPasswords);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        setLocalSettings(DEFAULT_SETTINGS);
        onSettingsChange(DEFAULT_SETTINGS);
        setSaved(false);
    };

    // Calculate example costs
    const exampleMaterialCost = 50000;
    const exampleLaborHours = 500;
    const avgLaborRate = (localSettings.laborRates.technician * 0.60 + localSettings.laborRates.leadTech * 0.20 + localSettings.laborRates.projectManager * 0.10 + localSettings.laborRates.apprentice * 0.10);
    const laborCost = exampleLaborHours * avgLaborRate;
    const materialWithMarkup = exampleMaterialCost * (1 + localSettings.markup.materials / 100);
    const laborWithMarkup = laborCost * (1 + localSettings.markup.labor / 100);
    const subtotal = materialWithMarkup + laborWithMarkup;
    const overhead = subtotal * (localSettings.overhead.percentage / 100);
    const profit = (subtotal + overhead) * (localSettings.profit.percentage / 100);
    const warranty = localSettings.warranty.type === 'percentage'
        ? (subtotal + overhead + profit) * (localSettings.warranty.percentage / 100)
        : localSettings.warranty.flatFee;
    const grandTotal = subtotal + overhead + profit + warranty;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Project Settings</h2>
                    <p className="text-slate-400">Configure labor rates, markups, and warranty</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reset Defaults
                    </button>
                    <button
                        onClick={handleSave}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${saved
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                            }`}
                    >
                        <Save className="w-4 h-4" />
                        {saved ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Labor Rates */}
                <SettingCard title="Labor Rates" icon={Clock} color="cyan">
                    <InputField
                        label="Technician"
                        value={localSettings.laborRates.technician}
                        onChange={(v) => updateSetting('laborRates', 'technician', v)}
                        prefix="$"
                        suffix="/hr"
                    />
                    <InputField
                        label="Lead Technician"
                        value={localSettings.laborRates.leadTech}
                        onChange={(v) => updateSetting('laborRates', 'leadTech', v)}
                        prefix="$"
                        suffix="/hr"
                    />
                    <InputField
                        label="Project Manager"
                        value={localSettings.laborRates.projectManager}
                        onChange={(v) => updateSetting('laborRates', 'projectManager', v)}
                        prefix="$"
                        suffix="/hr"
                    />
                    <InputField
                        label="Apprentice"
                        value={localSettings.laborRates.apprentice}
                        onChange={(v) => updateSetting('laborRates', 'apprentice', v)}
                        prefix="$"
                        suffix="/hr"
                    />
                </SettingCard>

                {/* Markup Rates */}
                <SettingCard title="Markup Rates" icon={Percent} color="emerald">
                    <InputField
                        label="Material Markup"
                        value={localSettings.markup.materials}
                        onChange={(v) => updateSetting('markup', 'materials', v)}
                        suffix="%"
                    />
                    <InputField
                        label="Labor Markup"
                        value={localSettings.markup.labor}
                        onChange={(v) => updateSetting('markup', 'labor', v)}
                        suffix="%"
                    />
                    <InputField
                        label="Equipment Markup"
                        value={localSettings.markup.equipment}
                        onChange={(v) => updateSetting('markup', 'equipment', v)}
                        suffix="%"
                    />
                </SettingCard>

                {/* Overhead & Profit */}
                <SettingCard title="Overhead & Profit" icon={DollarSign} color="amber">
                    <InputField
                        label="Overhead"
                        value={localSettings.overhead.percentage}
                        onChange={(v) => updateSetting('overhead', 'percentage', v)}
                        suffix="%"
                    />
                    <InputField
                        label="Profit Margin"
                        value={localSettings.profit.percentage}
                        onChange={(v) => updateSetting('profit', 'percentage', v)}
                        suffix="%"
                    />
                </SettingCard>

                {/* Warranty */}
                <SettingCard title="Warranty & Contingency" icon={Shield} color="purple">
                    <div className="flex items-center justify-between py-3 border-b border-slate-800/30">
                        <label className="text-white font-medium">Warranty Type</label>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => updateSetting('warranty', 'type', 'percentage')}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${localSettings.warranty.type === 'percentage'
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}
                            >
                                Percentage
                            </button>
                            <button
                                onClick={() => updateSetting('warranty', 'type', 'flat')}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${localSettings.warranty.type === 'flat'
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-slate-800 text-slate-400'
                                    }`}
                            >
                                Flat Fee
                            </button>
                        </div>
                    </div>
                    {localSettings.warranty.type === 'percentage' ? (
                        <InputField
                            label="Warranty Percentage"
                            value={localSettings.warranty.percentage}
                            onChange={(v) => updateSetting('warranty', 'percentage', v)}
                            suffix="%"
                        />
                    ) : (
                        <InputField
                            label="Warranty Flat Fee"
                            value={localSettings.warranty.flatFee}
                            onChange={(v) => updateSetting('warranty', 'flatFee', v)}
                            prefix="$"
                        />
                    )}
                </SettingCard>

                {/* Cabling Parameters */}
                <SettingCard title="Cabling Parameters" icon={Wrench} color="indigo">
                    <InputField
                        label="Average Cable Run Length"
                        value={localSettings.cabling?.avgCableRunLength || 100}
                        onChange={(v) => updateSetting('cabling', 'avgCableRunLength', v)}
                        suffix="ft"
                        step="1"
                    />
                    <InputField
                        label="Service Loop Length"
                        value={localSettings.cabling?.serviceLoopLength || 10}
                        onChange={(v) => updateSetting('cabling', 'serviceLoopLength', v)}
                        suffix="ft"
                        step="1"
                    />
                    <InputField
                        label="Cable Waste Factor"
                        value={localSettings.cabling?.wastePercentage || 5}
                        onChange={(v) => updateSetting('cabling', 'wastePercentage', v)}
                        suffix="%"
                    />
                    <InputField
                        label="J-Hook Spacing"
                        value={localSettings.cabling?.jHookSpacing || 8}
                        onChange={(v) => updateSetting('cabling', 'jHookSpacing', v)}
                        suffix="ft"
                        step="1"
                    />
                    <InputField
                        label="J-Hook Capacity (CAT64HP)"
                        value={localSettings.cabling?.jHookCapacity || 64}
                        onChange={(v) => updateSetting('cabling', 'jHookCapacity', v)}
                        suffix="cables"
                        step="1"
                    />
                    <InputField
                        label="Feet Per Cable Box"
                        value={localSettings.cabling?.feetPerBox || 1000}
                        onChange={(v) => updateSetting('cabling', 'feetPerBox', v)}
                        suffix="ft"
                        step="100"
                    />
                </SettingCard>

                {/* System Toggles */}
                <SettingCard title="Systems to Include in Bid" icon={Settings} color="slate">
                    {[
                        { key: 'cabling', label: 'Structured Cabling / Datacom', desc: 'Data outlets, voice, fiber, WAPs', defaultOn: true },
                        { key: 'access', label: 'Access Control', desc: 'Card readers, locks, door hardware', defaultOn: true },
                        { key: 'cctv', label: 'CCTV / Video Surveillance', desc: 'Cameras, NVR, storage', defaultOn: true },
                        { key: 'fire', label: 'Fire Alarm', desc: 'Detectors, pull stations, NAC', defaultOn: true },
                        { key: 'intercom', label: 'Intercom / Paging', desc: 'Intercoms, speakers, paging', defaultOn: true },
                        { key: 'audioVisual', label: 'Audio/Visual', desc: 'A/V systems, displays, conferencing', defaultOn: false }
                    ].map(({ key, label, desc, defaultOn }) => {
                        const isEnabled = localSettings.systems?.[key] ?? defaultOn;
                        return (
                            <div key={key} className="flex items-center justify-between py-3 border-b border-slate-800/30 last:border-0">
                                <div>
                                    <label className="text-white font-medium">{label}</label>
                                    <p className="text-sm text-slate-500">{desc}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        const newSystems = { ...(localSettings.systems || {}), [key]: !isEnabled };
                                        setLocalSettings(prev => ({ ...prev, systems: newSystems }));
                                        setSaved(false);
                                    }}
                                    style={{
                                        position: 'relative',
                                        width: '52px',
                                        height: '28px',
                                        borderRadius: '14px',
                                        backgroundColor: isEnabled ? '#10b981' : '#475569',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s ease',
                                        flexShrink: 0
                                    }}
                                >
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '4px',
                                            left: isEnabled ? '28px' : '4px',
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '50%',
                                            backgroundColor: 'white',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                            transition: 'left 0.2s ease'
                                        }}
                                    />
                                </button>
                            </div>
                        );
                    })}
                </SettingCard>
            </div>

            {/* Password Management */}
            <SettingCard title="Password Management" icon={Shield} color="red">
                <div className="flex items-center justify-between py-3 border-b border-slate-800/30">
                    <label className="text-white font-medium">Op's MGR Password</label>
                    <input
                        type="text"
                        value={localPasswords.estimator}
                        onChange={(e) => setLocalPasswords(prev => ({ ...prev, estimator: e.target.value }))}
                        className="w-40 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                </div>
                <div className="flex items-center justify-between py-3">
                    <label className="text-white font-medium">PM/Lead Password</label>
                    <input
                        type="text"
                        value={localPasswords.pm}
                        onChange={(e) => setLocalPasswords(prev => ({ ...prev, pm: e.target.value }))}
                        className="w-40 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                    Default password: Admin123 • Click "Save Settings" to apply changes
                </p>
            </SettingCard>

            {/* Reset PM Portal Progress */}
            <SettingCard title="PM Portal Progress" icon={RotateCcw} color="red">
                <div className="space-y-4">
                    <p className="text-slate-400">
                        Reset all daily log entries in the PM Portal. This will clear all material and labor progress back to 0%.
                    </p>

                    {!showResetConfirm ? (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Reset All Progress
                        </button>
                    ) : (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3">
                            <p className="text-red-400 font-medium">
                                ⚠️ Are you sure? This will delete all daily log entries and cannot be undone.
                            </p>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        // Clear localStorage for daily logs
                                        localStorage.removeItem('lv-takeoff-daily-logs');
                                        // Call the callback if provided
                                        if (onResetProgress) {
                                            onResetProgress();
                                        }
                                        setShowResetConfirm(false);
                                        setResetComplete(true);
                                        setTimeout(() => setResetComplete(false), 3000);
                                        console.log('🗑️ Cleared all daily log entries from localStorage');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                                >
                                    Yes, Reset Everything
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {resetComplete && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                            <p className="text-emerald-400 font-medium">
                                ✅ Progress reset complete! Reload the page or navigate back to PM Portal to see changes.
                            </p>
                        </div>
                    )}
                </div>
            </SettingCard>

            {/* Cost Preview */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/50 bg-indigo-500/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Cost Preview</h3>
                            <p className="text-sm text-slate-400">Example: $50,000 materials + 500 labor hours</p>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Base Material Cost</span>
                                <span className="text-white">${exampleMaterialCost.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">+ Material Markup ({localSettings.markup.materials}%)</span>
                                <span className="text-emerald-400">+${(materialWithMarkup - exampleMaterialCost).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Base Labor Cost ({exampleLaborHours}h × ${avgLaborRate.toFixed(0)}/hr)</span>
                                <span className="text-white">${laborCost.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">+ Labor Markup ({localSettings.markup.labor}%)</span>
                                <span className="text-cyan-400">+${(laborWithMarkup - laborCost).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t border-slate-800 pt-3">
                                <span className="text-white font-medium">Subtotal</span>
                                <span className="text-white font-medium">${subtotal.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">+ Overhead ({localSettings.overhead.percentage}%)</span>
                                <span className="text-amber-400">+${overhead.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">+ Profit ({localSettings.profit.percentage}%)</span>
                                <span className="text-emerald-400">+${profit.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">
                                    + Warranty ({localSettings.warranty.type === 'percentage'
                                        ? `${localSettings.warranty.percentage}%`
                                        : 'Flat Fee'})
                                </span>
                                <span className="text-purple-400">+${warranty.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-lg border-t border-slate-800 pt-3">
                                <span className="text-white font-bold">Grand Total</span>
                                <span className="text-emerald-400 font-bold">${grandTotal.toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-500">
                                    Effective margin: {((grandTotal / (exampleMaterialCost + laborCost) - 1) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Export default settings for use in other components
export { DEFAULT_SETTINGS };
